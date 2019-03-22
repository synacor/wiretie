import buble from 'rollup-plugin-buble';

export default {
	external: ['preact', 'dlv'],
	output: {
		globals: {
			preact: 'preact',
			dlv: 'dlv'
		}
	},
	plugins: [
		buble({
			jsx: 'h',
			objectAssign: 'assign'
		})
	]
};
