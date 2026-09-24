// The data model shared by every framework, plus the pure helpers each one
// calls from its bindings. Keeping these here means the frameworks differ only
// in how they turn the data into DOM updates.
//
// Core data structure: a flat Float64Array. Every 4 floats are one line:
//   [x1, y1, x2, y2, x1, y1, x2, y2, ...]   (pixel coordinates)

/** `fable-grouped` is the Fable.Ripple app with one effect per line instead of one per attribute. */
export type FrameworkId = 'solid' | 'ripple' | 'fable' | 'fable-grouped';

export type ColorMode = 'uniform' | 'angle' | 'length' | 'index';
export type WidthMode = 'uniform' | 'varied';
export type LineCap = 'butt' | 'round' | 'square';
export type Dash = 'solid' | 'dashed' | 'dotted';

export interface LineStyle {
	/** `uniform` strokes every line with `color` from the parent <g>; the others set a per-line `stroke`. */
	colorMode: ColorMode;
	color: string;
	/** `uniform` uses `width` from the parent <g>; `varied` sets a per-line `stroke-width` (see lineWidth). */
	widthMode: WidthMode;
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
	widthMode: 'varied',
	width: 1,
	opacity: 0.75,
	linecap: 'round',
	dash: 'solid',
	background: '#0d1117',
};

export const EMPTY = new Float64Array(0);

/** Line counts offered in the UI. */
export const COUNTS = [1000, 2000, 5000, 10000, 20000, 50000, 100000];

/** The longest a line may be, as a fraction of the viewport width. */
export const MAX_LENGTH_FRACTION = 0.1;

/** The longest line in the last generated array; "hue by length" spans 0 to this. */
let maxLength = 1;

/** Lines with a random start, direction and length up to MAX_LENGTH_FRACTION of `width`. */
export function randomLines(count: number, width: number, height: number): Float64Array {
	maxLength = Math.max(1, width * MAX_LENGTH_FRACTION);
	const data = new Float64Array(count * 4);
	for (let o = 0; o < data.length; o += 4) {
		const x1 = Math.random() * width;
		const y1 = Math.random() * height;
		const angle = Math.random() * 2 * Math.PI;
		const length = Math.random() * maxLength;
		data[o] = x1;
		data[o + 1] = y1;
		// Clamping the end into the viewport can only shorten the line.
		data[o + 2] = clamp(x1 + Math.cos(angle) * length, width);
		data[o + 3] = clamp(y1 + Math.sin(angle) * length, height);
	}
	return data;
}

/**
 * A new array whose points wander a little from `prev`; reflected back inside
 * the viewport, and a line that grew too long has its end pulled back.
 */
export function driftLines(prev: Float64Array, count: number, width: number, height: number, step = 12): Float64Array {
	if (prev.length !== count * 4) return randomLines(count, width, height);
	maxLength = Math.max(1, width * MAX_LENGTH_FRACTION);
	const data = new Float64Array(prev.length);
	for (let i = 0; i < data.length; i += 2) {
		data[i] = reflect(prev[i] + (Math.random() - 0.5) * step, width);
		data[i + 1] = reflect(prev[i + 1] + (Math.random() - 0.5) * step, height);
	}
	for (let o = 0; o < data.length; o += 4) {
		const dx = data[o + 2] - data[o];
		const dy = data[o + 3] - data[o + 1];
		const length = Math.sqrt(dx * dx + dy * dy);
		if (length > maxLength) {
			// Both ends are in the viewport, so any point between them is too.
			const k = maxLength / length;
			data[o + 2] = data[o] + dx * k;
			data[o + 3] = data[o + 1] + dy * k;
		}
	}
	return data;
}

function reflect(v: number, max: number): number {
	if (v < 0) return -v;
	if (v > max) return 2 * max - v;
	return v;
}

function clamp(v: number, max: number): number {
	return v < 0 ? 0 : v > max ? max : v;
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
	return HUES[(Math.min(Math.sqrt(dx * dx + dy * dy) / maxLength, 1) * 270) | 0];
}

// Widths from 1.5 to 5 px in 0.25 px steps, as the strings the attribute takes.
const WIDTHS: string[] = Array.from({ length: 15 }, (_, k) => String(1.5 + k * 0.25));

/**
 * The per-line `stroke-width` for a width mode, or `undefined` in `uniform`
 * mode (the attribute is then removed and the line inherits the <g> width).
 * Hashed from the index, not the data, so a line keeps its width across
 * updates and drift does not flicker; only the count and mode change it.
 */
export function lineWidth(mode: WidthMode, i: number): string | undefined {
	if (mode === 'uniform') return undefined;
	// Fibonacci hashing: the top bits of i × 2^32/φ are spread evenly over the table.
	return WIDTHS[((Math.imul(i, 0x9e3779b1) >>> 0) * WIDTHS.length * 2 ** -32) | 0];
}

export function dashArray(dash: Dash, width: number): string {
	if (dash === 'dashed') return `${width * 6} ${width * 4}`;
	if (dash === 'dotted') return `${width} ${width * 3}`;
	return 'none';
}
