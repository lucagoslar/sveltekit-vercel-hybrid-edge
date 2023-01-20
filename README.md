# sveltekit-vercel-hybrid-edge

🪂 Build for the edge but fall back to serverless functions if necessary to allow balancing flexibility with performance when deploying with Vercel.

## Index

- [sveltekit-vercel-hybrid-edge](#sveltekit-vercel-hybrid-edge)
	- [Index](#index)
	- [Usage](#usage)
	- [License](#license)

## Usage

```zsh
  npm i --save-dev sveltekit-vercel-hybrid-edge
```

```js
// svelte.config.js
import adapter from 'sveltekit-vercel-hybrid-edge';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	kit: {
		adapter: adapter(),
		// defaults to …
		// {
		//    external: [],
		//    edge: undefined,
		//    split: true,
		//    hybrid: true,
		// }
	},
};

export default config;
```

For further instructions on how to use custom adapters with SvelteKit, see their [documentation](https://kit.svelte.dev/docs/adapters#using-adapters).
Vercel published a [guide](https://vercel.com/guides/how-can-i-improve-serverless-function-lambda-cold-start-performance-on-vercel) on how to reduce the cold start performance of serverless functions.

It is recommended to change adapters when setting `hybrid` or `split` to `false`.

## License

`sveltekit-vercel-hybrid-edge` is based on MIT licensed `@sveltejs/adapter-vercel`.
