// The data model shared by every framework, plus the pure helpers each one
// calls from its bindings. Keeping these here means the frameworks differ only
// in how they turn the data into DOM updates.
//
// Core data structure: a flat Float64Array. Every 4 floats are one line:
//   [x1, y1, x2, y2, x1, y1, x2, y2, ...]   (pixel coordinates)

/** `fable-grouped` is the Fable.Ripple app with one effect per line instead of one per attribute. */
export type FrameworkId = 'solid' | 'ripple' | 'fable' | 'fable-grouped';

export type ColorMode = 'uniform' | 'angle' | 'length' | 'index';
export type LineCap = 'butt' | 'round' | 'square';
export type Dash = 'solid' | 'dashed' | 'dotted';

export interface LineStyle {
	/** `uniform` strokes every line with `color` from the parent <g>; the others set a per-line `stroke`. */
	colorMode: ColorMode;
	color: string;
	width: number;
	opacity: number;
	linecap: LineCap;
	dash: Dash;
	background: string;
}

/**
 * What each framework page hands to the harness. `setData` and `setStyle`
 * must have committed their DOM changes by the time they return, so the
 * harness can time them with a plain `performance.now()` pair.
 */
export interface BenchApp {
	readonly id: FrameworkId;
	mount(container: HTMLElement, style: LineStyle): void;
	setData(data: Float64Array): void;
	setStyle(style: LineStyle): void;
}

export const DEFAULT_STYLE: LineStyle = {
	colorMode: 'angle',
	color: '#58a6ff',
	width: 1,
	opacity: 0.75,
	linecap: 'round',
	dash: 'solid',
	background: '#0d1117',
};

export const EMPTY = new Float64Array(0);

/** Line counts offered in the UI. */
export const COUNTS = [1000, 2000, 5000, 10000, 20000, 50000, 100000];

export function randomLines(count: number, width: number, height: number): Float64Array {
	const data = new Float64Array(count * 4);
	for (let i = 0; i < data.length; i += 2) {
		data[i] = Math.random() * width;
		data[i + 1] = Math.random() * height;
	}
	return data;
}

/** A new array whose points wander a little from `prev`; reflected back inside the viewport. */
export function driftLines(prev: Float64Array, count: number, width: number, height: number, step = 12): Float64Array {
	if (prev.length !== count * 4) return randomLines(count, width, height);
	const data = new Float64Array(prev.length);
	for (let i = 0; i < data.length; i += 2) {
		data[i] = reflect(prev[i] + (Math.random() - 0.5) * step, width);
		data[i + 1] = reflect(prev[i + 1] + (Math.random() - 0.5) * step, height);
	}
	return data;
}

function reflect(v: number, max: number): number {
	if (v < 0) return -v;
	if (v > max) return 2 * max - v;
	return v;
}

export function range(n: number): number[] {
	const out = new Array<number>(n);
	for (let i = 0; i < n; i++) out[i] = i;
	return out;
}

// 360 precomputed stroke strings, so per-line colouring costs a lookup, not a
// string build. Every framework pays the same price for it.
const HUES: string[] = Array.from({ length: 360 }, (_, h) => `hsl(${h} 85% 60%)`);
const DEG = 180 / Math.PI;

/**
 * The per-line `stroke` for a colour mode, or `undefined` in `uniform` mode
 * (the attribute is then removed and the line inherits the <g> stroke).
 */
export function lineStroke(mode: ColorMode, data: ArrayLike<number>, i: number, count: number): string | undefined {
	if (mode === 'uniform') return undefined;
	if (mode === 'index') return HUES[((i * 360) / count) | 0];
	const o = i * 4;
	const dx = data[o + 2] - data[o];
	const dy = data[o + 3] - data[o + 1];
	if (mode === 'angle') return HUES[((Math.atan2(dy, dx) * DEG + 180) % 360) | 0];
	// length: short lines warm, long lines cool
	return HUES[(Math.min(Math.sqrt(dx * dx + dy * dy) / 1500, 1) * 270) | 0];
}

export function dashArray(dash: Dash, width: number): string {
	if (dash === 'dashed') return `${width * 6} ${width * 4}`;
	if (dash === 'dotted') return `${width} ${width * 3}`;
	return 'none';
}
