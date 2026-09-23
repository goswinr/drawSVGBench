// tsc does not read .tsrx; the Ripple Vite plugin compiles them.
declare module '*.tsrx' {
	const component: any;
	export const Stage: any;
	export default component;
}
