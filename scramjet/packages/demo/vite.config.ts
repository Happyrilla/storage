import { viteStaticCopy } from "vite-plugin-static-copy";

const basePath = process.env.SCRAMJET_BASE_PATH || "./";

export default {
	base: basePath,
	plugins: [
		viteStaticCopy({
			structured: false,
			targets: [
				{
					src: "node_modules/@mercuryworkshop/scramjet/dist/*",
					dest: "scramjet",
				},
				{
					src: "node_modules/@mercuryworkshop/scramjet-controller/dist/*",
					dest: "controller",
				},
			],
			watch: {
				reloadPageOnChange: true,
			}
		}),
	],
};
