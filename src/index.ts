import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { nodeFileTrace } from '@vercel/nft';
import esbuild from 'esbuild';
import type { Builder } from '@sveltejs/kit';

const plugin = function ({
	external = [],
	edge,
	split = true,
	hybrid = true,
}: {
	external?: string[];
	edge?: boolean;
	split?: boolean;
	hybrid?: boolean;
} = {}) {
	return {
		name: 'sveltekit-vercel-hybrid-edge',

		async adapt(builder: any) {
			const node_version = get_node_version();

			const dir = '.vercel/output';
			const tmp = builder.getBuildDirectory('vercel-tmp');

			builder.rimraf(dir);
			builder.rimraf(tmp);

			const files = fileURLToPath(new URL('./files', import.meta.url).href);

			const dirs = {
				static: `${dir}/static${builder.config.kit.paths.base}`,
				functions: `${dir}/functions`,
			};

			const config = static_vercel_config(builder);

			builder.log.minor('Generating serverless function...');

			async function generate_serverless_function(
				name: string,
				pattern: string,
				generate_manifest: (options: { relativePath: string }) => string
			) {
				const relativePath = path.posix.relative(
					tmp,
					builder.getServerDirectory()
				);

				builder.copy(`${files}/serverless.js`, `${tmp}/index.js`, {
					replace: {
						SERVER: `${relativePath}/index.js`,
						MANIFEST: './manifest.js',
					},
				});

				write(
					`${tmp}/manifest.js`,
					`export const manifest = ${generate_manifest({ relativePath })};\n`
				);

				await create_function_bundle(
					builder,
					`${tmp}/index.js`,
					`${dirs.functions}/${name}.func`,
					`nodejs${node_version.major}.x`
				);

				config.routes.push({ src: pattern, dest: `/${name}` });
			}

			async function generate_edge_function(
				name: string,
				pattern: string,
				generate_manifest: (options: { relativePath: string }) => string
			) {
				const tmp = builder.getBuildDirectory(`vercel-tmp/${name}`);
				const relativePath = path.posix.relative(
					tmp,
					builder.getServerDirectory()
				);

				builder.copy(`${files}/edge.js`, `${tmp}/edge.js`, {
					replace: {
						SERVER: `${relativePath}/index.js`,
						MANIFEST: './manifest.js',
					},
				});

				write(
					`${tmp}/manifest.js`,
					`export const manifest = ${generate_manifest({ relativePath })};\n`
				);

				await esbuild.build({
					entryPoints: [`${tmp}/edge.js`],
					outfile: `${dirs.functions}/${name}.func/index.js`,
					target: 'es2020', // TODO verify what the edge runtime supports
					bundle: true,
					platform: 'browser',
					format: 'esm',
					external,
					sourcemap: 'linked',
					banner: { js: 'globalThis.global = globalThis;' },
				});

				write(
					`${dirs.functions}/${name}.func/.vc-config.json`,
					JSON.stringify({
						runtime: 'edge',
						entrypoint: 'index.js',
						// TODO expose envVarsInUse
					})
				);

				config.routes.push({ src: pattern, dest: `/${name}` });
			}

			const generate_function = edge
				? generate_edge_function
				: generate_serverless_function;

			if (split) {
				if (split && !hybrid) {
					console.log(
						'Your functions will either compile for the edge or serverless functions since option "split" was enabled but option "hybrid" was not.'
					);
				}
				await builder.createEntries((route: any) => {
					return {
						id: route.pattern.toString(), // TODO is `id` necessary?
						filter: (other: any) =>
							route.pattern.toString() === other.pattern.toString(),
						complete: async (entry: any) => {
							let sliced_pattern = route.pattern
								.toString()
								// remove leading / and trailing $/
								.slice(1, -2)
								// replace escaped \/ with /
								.replace(/\\\//g, '/');

							// replace the root route "^/" with "^/?"
							if (sliced_pattern === '^/') {
								sliced_pattern = '^/?';
							}

							const src = `${sliced_pattern}(?:/__data.json)?$`; // TODO adding /__data.json is a temporary workaround — those endpoints should be treated as distinct routes

							if (!hybrid) {
								await generate_function(
									route.id.slice(1) || 'index',
									src,
									entry.generateManifest
								);

								return;
							}

							try {
								await generate_edge_function(
									route.id.slice(1) || 'index',
									src,
									entry.generateManifest
								);
								console.log(
									`${route.id} will be deployed as an edge function.`
								);
							} catch (error) {
								await generate_serverless_function(
									route.id.slice(1) || 'index',
									src,
									entry.generateManifest
								);
								console.log(
									`${route.id} will be deployed as a serverless function.`
								);
								console.log(
									'This is because the errors above were thrown at build time for the edge.'
								);
							}
						},
					};
				});
			} else {
				await generate_function('render', '/.*', builder.generateManifest);
			}

			builder.log.minor('Copying assets...');

			builder.writeClient(dirs.static);
			builder.writePrerendered(dirs.static);

			builder.log.minor('Writing routes...');

			write(`${dir}/config.json`, JSON.stringify(config, null, '  '));
		},
	};
};

function write(file: string, data: string) {
	try {
		fs.mkdirSync(path.dirname(file), { recursive: true });
	} catch {
		// do nothing
	}

	fs.writeFileSync(file, data);
}

function get_node_version() {
	const full = process.version.slice(1); // 'v16.5.0' --> '16.5.0'
	const major = parseInt(full.split('.')[0]); // '16.5.0' --> 16

	if (major < 16) {
		throw new Error(
			`SvelteKit only supports Node.js version 16 or greater (currently using v${full}). Consult the documentation: https://vercel.com/docs/runtimes#official-runtimes/node-js/node-js-version`
		);
	}

	return { major, full };
}

// This function is duplicated in adapter-static
function static_vercel_config(builder: Builder) {
	const prerendered_redirects: any[] = [];

	const overrides: Record<string, { path: string }> = {};

	for (const [src, redirect] of builder.prerendered.redirects) {
		prerendered_redirects.push({
			src,
			headers: {
				Location: redirect.location,
			},
			status: redirect.status,
		});
	}

	for (const [path, page] of builder.prerendered.pages) {
		let overrides_path = path.slice(1);

		if (path !== '/') {
			let counterpart_route: string | undefined = path + '/';

			if (path.endsWith('/')) {
				counterpart_route = path.slice(0, -1);
				overrides_path = path.slice(1, -1);
			}

			prerendered_redirects.push(
				{ src: path, dest: counterpart_route },
				{ src: counterpart_route, status: 308, headers: { Location: path } }
			);
		}

		overrides[page.file] = { path: overrides_path };
	}

	return {
		version: 3,
		routes: [
			...prerendered_redirects,
			{
				src: `/${builder.getAppPath()}/immutable/.+`,
				headers: {
					'cache-control': 'public, immutable, max-age=31536000',
				},
			},
			{
				handle: 'filesystem',
			},
		],
		overrides,
	};
}

async function create_function_bundle(
	builder: Builder,
	entry: string,
	dir: string,
	runtime: string
) {
	fs.rmSync(dir, { force: true, recursive: true });

	let base = entry;
	while (base !== (base = path.dirname(base)));

	const traced = await nodeFileTrace([entry], { base });

	const resolution_failures: Map<string, string[]> = new Map();

	traced.warnings.forEach((error) => {
		// pending https://github.com/vercel/nft/issues/284
		if (error.message.startsWith('Failed to resolve dependency node:')) return;

		// parse errors are likely not js and can safely be ignored,
		// such as this html file in "main" meant for nw instead of node:
		// https://github.com/vercel/nft/issues/311
		if (error.message.startsWith('Failed to parse')) return;

		if (error.message.startsWith('Failed to resolve dependency')) {
			const match = /Cannot find module '(.+?)' loaded from (.+)/;
			const [, module, importer] = match.exec(error.message) ?? [
				,
				error.message,
				'(unknown)',
			];

			if (!resolution_failures.has(importer)) {
				resolution_failures.set(importer, []);
			}

			resolution_failures.get(importer)?.push(module);
		} else {
			throw error;
		}
	});

	if (resolution_failures.size > 0) {
		const cwd = process.cwd();
		builder.log.warn(
			'The following modules failed to locate dependencies that may (or may not) be required for your app to work:'
		);

		for (const [importer, modules] of resolution_failures) {
			console.error(`  ${path.relative(cwd, importer)}`);
			for (const module of modules) {
				console.error(`    - \u001B[1m\u001B[36m${module}\u001B[39m\u001B[22m`);
			}
		}
	}

	// find common ancestor directory
	let common_parts: any;

	for (const file of traced.fileList) {
		if (common_parts) {
			const parts = file.split(path.sep);

			for (let i = 0; i < common_parts.length; i += 1) {
				if (parts[i] !== common_parts[i]) {
					common_parts = common_parts.slice(0, i);
					break;
				}
			}
		} else {
			common_parts = path.dirname(file).split(path.sep);
		}
	}

	const ancestor = base + common_parts.join(path.sep);

	for (const file of traced.fileList) {
		const source = base + file;
		const dest = path.join(dir, path.relative(ancestor, source));

		const stats = fs.statSync(source);
		const is_dir = stats.isDirectory();

		const realpath = fs.realpathSync(source);

		try {
			fs.mkdirSync(path.dirname(dest), { recursive: true });
		} catch {
			// do nothing
		}

		if (source !== realpath) {
			const realdest = path.join(dir, path.relative(ancestor, realpath));
			fs.symlinkSync(
				path.relative(path.dirname(dest), realdest),
				dest,
				is_dir ? 'dir' : 'file'
			);
		} else if (!is_dir) {
			fs.copyFileSync(source, dest);
		}
	}

	write(
		`${dir}/.vc-config.json`,
		JSON.stringify({
			runtime,
			handler: path.relative(base + ancestor, entry),
			launcherType: 'Nodejs',
		})
	);

	write(`${dir}/package.json`, JSON.stringify({ type: 'module' }));
}

export default plugin;
