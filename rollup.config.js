import typescript from '@rollup/plugin-typescript';
import pkg from './package.json';
import { builtinModules as builtins } from 'module';

const deps = Object.keys(pkg.dependencies || {});

/** @type {import('rollup').RollupOptions} */
export default [
	{
		input: 'src/index.ts',
		external: [...builtins, ...deps],
		output: [
			{
				dir: 'dist',
				entryFileNames: '[name].js',
				format: 'esm',
				sourcemap: true,
			},
		],
		plugins: [
			typescript({
				exclude: ['**/*.test.*', '**/__mocks__/*', '**/__tests__/*'],
			}),
		],
	},
	{
		input: 'src/files/edge.ts',
		external: [...builtins, ...deps],
		output: [
			{
				dir: 'dist/files',
				entryFileNames: '[name].js',
				format: 'esm',
				sourcemap: true,
			},
		],
		plugins: [
			typescript({
				exclude: ['**/*.test.*', '**/__mocks__/*', '**/__tests__/*'],
				compilerOptions: {
					outDir: 'dist/files',
				},
			}),
		],
	},
	{
		input: 'src/files/serverless.ts',
		external: [...builtins, ...deps],
		output: [
			{
				dir: 'dist/files',
				entryFileNames: '[name].js',
				format: 'esm',
				sourcemap: true,
			},
		],
		plugins: [
			typescript({
				exclude: ['**/*.test.*', '**/__mocks__/*', '**/__tests__/*'],
				compilerOptions: {
					outDir: 'dist/files',
				},
			}),
		],
	},
];
