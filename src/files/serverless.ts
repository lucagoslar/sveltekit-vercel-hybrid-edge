import { installPolyfills } from '@sveltejs/kit/node/polyfills';
import { getRequest, setResponse } from '@sveltejs/kit/node';
import type { IncomingMessage, ServerResponse } from 'http';
//@ts-ignore
import { Server } from 'SERVER';
//@ts-ignore
import { manifest } from 'MANIFEST';

installPolyfills();

const server = new Server(manifest);

await server.init({
	env: process.env,
});

export default async (req: IncomingMessage, res: ServerResponse) => {
	let request: Request;

	try {
		request = await getRequest({
			base: `https://${req.headers.host}`,
			request: req,
		});
	} catch (err: any) {
		res.statusCode = err.status || 400;
		return res.end('Invalid request body');
	}

	setResponse(
		res,
		await server.respond(request, {
			getClientAddress() {
				return request.headers.get('x-forwarded-for');
			},
		})
	);
};
