import buble from 'rollup-plugin-buble';
import nodeResolve from 'rollup-plugin-node-resolve';

export default {
	external: ['preact'],
	globals: {
		preact: 'preact',
		dlv: 'dlv'
	},
	plugins: [
		nodeResolve({
			jsnext: true
		}),
		buble({
			jsx: 'h',
			objectAssign: 'assign'
		})
	]
};
