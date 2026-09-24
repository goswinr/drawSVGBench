import { EMPTY, lineStroke, lineWidth, randomLines, type BenchApp, type FrameworkId, type LineStyle } from './lines';

export interface Sample {
	/** Framework work + DOM mutation: the synchronous `setData`/`setStyle` call. */
	script: number;
	/** Main-thread style, layout and paint for the frame that shows the change. */
	render: number;
	total: number;
}

export interface Stats {
	median: number;
	mean: number;
	p95: number;
	min: number;
	max: number;
	sd: number;
}

export type OpName = 'create' | 'update' | 'recolor' | 'clear';

export const OPS: { id: OpName; label: string; help: string }[] = [
	{ id: 'create', label: 'Create', help: 'Empty SVG → N <line> elements' },
	{ id: 'update', label: 'Update', help: 'New random array, same N: attributes rewritten in place' },
	{ id: 'recolor', label: 'Recolor', help: 'Per-line stroke switched between angle and index hues' },
	{ id: 'clear', label: 'Clear', help: 'N lines → empty SVG' },
];

export interface OpResult {
	op: OpName;
	count: number;
	samples: Sample[];
	script: Stats;
	render: Stats;
	total: Stats;
	/** DOM matched the data after the op (line count and spot-checked attributes). */
	verified: boolean;
	verifyMessage: string;
	/** The op hit the time budget and has fewer samples than configured. */
	truncated: boolean;
}

export interface SuiteConfig {
	counts: number[];
	iterations: number;
	warmup: number;
	ops: OpName[];
	style: LineStyle;
	/**
	 * Wall-clock budget per op and line count, setup included. Once spent, the
	 * rest of the warmup is skipped and measuring stops after 3 samples (or
	 * after 1 once three budgets are gone), so a framework that goes
	 * non-linear cannot stall the suite for long.
	 */
	budgetMs?: number;
}

export const DEFAULT_BUDGET_MS = 20000;
const MIN_SAMPLES = 3;

export interface Env {
	userAgent: string;
	viewport: [number, number];
	dpr: number;
	cores: number;
	date: string;
}

export interface SuiteResult {
	framework: FrameworkId;
	name: string;
	version: string;
	config: SuiteConfig;
	results: OpResult[];
	env: Env;
}

export interface Progress {
	op: OpName;
	count: number;
	/** 1-based, warmup included */
	iteration: number;
	iterations: number;
	/** 0..1 across the whole suite */
	fraction: number;
}

/**
 * Resolves once the frame after the current task has been rendered.
 * `rafAt` is when that frame's rAF callbacks ran; `paintedAt` is the first
 * task after the frame's style/layout/paint, so the difference is the
 * main-thread rendering cost (rasterization happens off-thread and is not
 * included). Waiting for vsync is deliberately excluded.
 */
export function afterNextPaint(): Promise<{ rafAt: number; paintedAt: number }> {
	return new Promise((resolve) => {
		requestAnimationFrame(() => {
			const rafAt = performance.now();
			const { port1, port2 } = new MessageChannel();
			port1.onmessage = () => {
				port1.close();
				resolve({ rafAt, paintedAt: performance.now() });
			};
			port2.postMessage(null);
		});
	});
}

/** Let the previous change finish rendering and give the GC a moment. */
export async function settle(): Promise<void> {
	await afterNextPaint();
	await new Promise((r) => setTimeout(r, 8));
}

/** Times a synchronous DOM-committing operation, then the frame that renders it. */
export async function measure(op: () => void): Promise<Sample> {
	const t0 = performance.now();
	op();
	const t1 = performance.now();
	const { rafAt, paintedAt } = await afterNextPaint();
	const script = t1 - t0;
	const render = paintedAt - rafAt;
	return { script, render, total: script + render };
}

export function stats(values: number[]): Stats {
	const n = values.length;
	if (n === 0) return { median: NaN, mean: NaN, p95: NaN, min: NaN, max: NaN, sd: NaN };
	const s = [...values].sort((a, b) => a - b);
	const mean = s.reduce((a, b) => a + b, 0) / n;
	const mid = n >> 1;
	const median = n % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
	const p95 = s[Math.min(n - 1, Math.ceil(0.95 * n) - 1)];
	const sd = Math.sqrt(s.reduce((a, v) => a + (v - mean) ** 2, 0) / n);
	return { median, mean, p95, min: s[0], max: s[n - 1], sd };
}

/**
 * Checks that the framework really rendered `data`: the right number of
 * <line> elements, in order, with exact coordinates and the expected stroke
 * and stroke-width on a handful of lines.
 */
export function verify(stage: HTMLElement, data: Float64Array, style: LineStyle): { ok: boolean; message: string } {
	const lines = stage.getElementsByTagNameNS('http://www.w3.org/2000/svg', 'line');
	const count = data.length / 4;
	if (lines.length !== count) return { ok: false, message: `expected ${count} <line>, found ${lines.length}` };
	if (count === 0) return { ok: true, message: 'empty' };
	const probes = new Set([0, 1, count >> 1, count - 2, count - 1].filter((i) => i >= 0 && i < count));
	const attrs = ['x1', 'y1', 'x2', 'y2'] as const;
	for (const i of probes) {
		const el = lines[i];
		for (let k = 0; k < 4; k++) {
			const got = el.getAttribute(attrs[k]);
			if (got === null || Number(got) !== data[i * 4 + k]) {
				return { ok: false, message: `line ${i} ${attrs[k]}="${got}", expected ${data[i * 4 + k]}` };
			}
		}
		const stroke = lineStroke(style.colorMode, data, i, count) ?? null;
		const gotStroke = el.getAttribute('stroke');
		if (gotStroke !== stroke) return { ok: false, message: `line ${i} stroke="${gotStroke}", expected ${stroke}` };
		const width = lineWidth(style.widthMode, i) ?? null;
		const gotWidth = el.getAttribute('stroke-width');
		if (gotWidth !== width) return { ok: false, message: `line ${i} stroke-width="${gotWidth}", expected ${width}` };
	}
	return { ok: true, message: `${count} lines, ${probes.size} spot-checked` };
}

export function environment(): Env {
	return {
		userAgent: navigator.userAgent,
		viewport: [innerWidth, innerHeight],
		dpr: devicePixelRatio,
		cores: navigator.hardwareConcurrency ?? 0,
		date: new Date().toISOString(),
	};
}

/**
 * Runs every op at every count. Each op starts from a settled frame; data is
 * generated before the timer starts, so `script` is only the framework's work.
 * Leaves the stage showing the last count with `cfg.style` applied.
 */
export async function runSuite(
	app: BenchApp,
	stage: HTMLElement,
	cfg: SuiteConfig,
	onProgress?: (p: Progress) => void,
): Promise<{ results: OpResult[]; data: Float64Array }> {
	const w = innerWidth;
	const h = innerHeight;
	let data: Float64Array = EMPTY;
	let style: LineStyle = { ...cfg.style };

	const setData = (d: Float64Array) => {
		data = d;
		app.setData(d);
	};
	const setStyle = (s: LineStyle) => {
		style = s;
		app.setStyle(s);
	};
	const ensure = async (count: number) => {
		if (data.length !== count * 4) {
			setData(randomLines(count, w, h));
			await settle();
		}
	};

	setStyle(style);
	await settle();

	const perRun = cfg.warmup + cfg.iterations;
	const totalSteps = cfg.counts.length * cfg.ops.length * perRun;
	let step = 0;
	const results: OpResult[] = [];

	const budget = cfg.budgetMs ?? DEFAULT_BUDGET_MS;

	for (const count of cfg.counts) {
		for (const op of cfg.ops) {
			const samples: Sample[] = [];
			let check = { ok: true, message: '' };
			let truncated = false;
			const began = performance.now();
			const firstStep = step;

			for (let k = 0; k < perRun; k++) {
				let sample: Sample;
				switch (op) {
					case 'create': {
						setData(EMPTY);
						await settle();
						const next = randomLines(count, w, h);
						sample = await measure(() => setData(next));
						break;
					}
					case 'update': {
						await ensure(count);
						const next = randomLines(count, w, h);
						await settle();
						sample = await measure(() => setData(next));
						break;
					}
					case 'recolor': {
						await ensure(count);
						if (style.colorMode !== 'angle' && style.colorMode !== 'index') {
							setStyle({ ...style, colorMode: 'angle' });
						}
						await settle();
						const next: LineStyle = { ...style, colorMode: style.colorMode === 'angle' ? 'index' : 'angle' };
						sample = await measure(() => setStyle(next));
						break;
					}
					case 'clear': {
						await ensure(count);
						await settle();
						sample = await measure(() => setData(EMPTY));
						break;
					}
				}
				// Correctness is checked on the first measured iteration, off the clock.
				if (k === cfg.warmup) check = verify(stage, data, style);
				if (k >= cfg.warmup) samples.push(sample);
				step++;
				onProgress?.({ op, count, iteration: k + 1, iterations: perRun, fraction: step / totalSteps });

				const spent = performance.now() - began;
				if (spent > budget && k < perRun - 1) {
					if (k < cfg.warmup - 1) {
						truncated = true;
						step += cfg.warmup - 1 - k;
						k = cfg.warmup - 1; // skip the rest of the warmup
					} else if (samples.length >= MIN_SAMPLES || (samples.length >= 1 && spent > 3 * budget)) {
						truncated = true;
						break;
					}
				}
			}
			step = firstStep + perRun;

			if (op === 'recolor') setStyle({ ...cfg.style });
			results.push({
				op,
				count,
				samples,
				script: stats(samples.map((s) => s.script)),
				render: stats(samples.map((s) => s.render)),
				total: stats(samples.map((s) => s.total)),
				verified: check.ok,
				verifyMessage: check.message,
				truncated,
			});
		}
	}

	await ensure(cfg.counts[cfg.counts.length - 1] ?? 0);
	return { results, data };
}
