// Runs the same suite in each framework page (loaded full-screen in an iframe,
// one at a time) and charts the medians side by side.

import './compare.css';
import { FRAMEWORKS } from '../shared/frameworks';
import { COUNTS, DEFAULT_STYLE, type ColorMode, type FrameworkId } from '../shared/lines';
import { DEFAULT_BUDGET_MS, OPS, stats, type Env, type OpName, type Progress, type Sample, type Stats, type SuiteConfig, type SuiteResult } from '../shared/measure';
import type { BenchHandle } from '../shared/harness';

type Metric = 'total' | 'script' | 'render';

interface RunConfig {
	counts: number[];
	iterations: number;
	warmup: number;
	colorMode: ColorMode;
	rounds: number;
	frameworks: FrameworkId[];
	/** Per op and line count, in ms; see SuiteConfig.budgetMs. */
	budgetMs: number;
}

interface CompareRun {
	config: RunConfig;
	/** One suite per framework per round. */
	suites: SuiteResult[];
	env: Env | null;
	startedAt: string;
	finishedAt: string;
}

interface Cell {
	script: Stats;
	render: Stats;
	total: Stats;
	n: number;
	verified: boolean;
	verifyMessage: string;
	/** Stopped at the time budget with fewer samples than configured. */
	truncated: boolean;
}

const STORE_CONFIG = 'drawsvgbench:compare-config';
const STORE_RUN = 'drawsvgbench:compare-run';

const DEFAULT_CONFIG: RunConfig = {
	counts: [1000, 5000, 20000],
	iterations: 20,
	warmup: 5,
	colorMode: 'uniform',
	rounds: 1,
	frameworks: FRAMEWORKS.map((f) => f.id),
	budgetMs: DEFAULT_BUDGET_MS,
};

const read = <T>(key: string, fallback: T): T => {
	try {
		const raw = localStorage.getItem(key);
		return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
	} catch {
		return fallback;
	}
};
const write = (key: string, value: unknown) => {
	try {
		localStorage.setItem(key, JSON.stringify(value));
	} catch {
		/* results just won't survive a reload */
	}
};

const fmt = (ms: number) => (Number.isFinite(ms) ? (ms < 10 ? ms.toFixed(2) : ms < 100 ? ms.toFixed(1) : ms.toFixed(0)) : '–');
const fmtCount = (n: number) => n.toLocaleString('en-US');
const fmtRatio = (r: number) => `${r < 10 ? r.toFixed(2) : r < 100 ? r.toFixed(1) : r.toFixed(0)}×`;
const fmtCompact = (n: number) => (n >= 1000 ? `${n / 1000}k` : String(n));
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector(sel) as T;

let config: RunConfig = read(STORE_CONFIG, DEFAULT_CONFIG);
let lastRun: CompareRun | null = read<CompareRun | null>(STORE_RUN, null);
let metric: Metric = 'total';

// ------------------------------------------------------------------ config form

function renderCards() {
	const notes: Record<FrameworkId, string> = {
		solid: '<code>createSignal(Float64Array)</code> · <code>&lt;For&gt;</code> over indices · one render effect per line (the compiler groups its attributes)',
		ripple: '<code>track(Float64Array)</code> · keyed <code>@for</code> over indices · <code>flushSync</code> around each write',
		fable: '<code>Var&lt;float[]&gt;</code> · <code>Html.each</code> over indices · one binding per attribute, synchronous flush',
		'fable-grouped':
			'The same F# app, but each line has one effect that writes all five attributes, the shape the Solid and Ripple compilers emit',
	};
	$('#cards').innerHTML = FRAMEWORKS.map(
		(f) => `
		<a class="card" href="${f.path}">
			<span class="card-head"><i class="swatch" data-fw="${f.id}"></i><strong>${f.name}</strong><span class="lang">${f.language}</span></span>
			<span class="card-ver">${esc(f.version)}</span>
			<span class="card-note">${notes[f.id]}</span>
			<span class="card-open">Open full-screen →</span>
		</a>`,
	).join('');
}

function renderForm() {
	const form = $<HTMLFormElement>('#config');
	$('#counts', form).innerHTML = COUNTS.map(
		(n) => `<label class="chip"><input type="checkbox" name="count" value="${n}"${config.counts.includes(n) ? ' checked' : ''}><span>${fmtCompact(n)}</span></label>`,
	).join('');
	$('#fws', form).innerHTML = FRAMEWORKS.map(
		(f) => `<label class="chip"><input type="checkbox" name="fw" value="${f.id}"${config.frameworks.includes(f.id) ? ' checked' : ''}><span><i class="swatch" data-fw="${f.id}"></i>${f.name}</span></label>`,
	).join('');
	(form.elements.namedItem('iterations') as HTMLInputElement).value = String(config.iterations);
	(form.elements.namedItem('warmup') as HTMLInputElement).value = String(config.warmup);
	(form.elements.namedItem('rounds') as HTMLInputElement).value = String(config.rounds);
	(form.elements.namedItem('budget') as HTMLInputElement).value = String(config.budgetMs / 1000);
	(form.elements.namedItem('colorMode') as HTMLSelectElement).value = config.colorMode;
	updateEstimate();
}

function readForm(): RunConfig {
	const form = $<HTMLFormElement>('#config');
	const data = new FormData(form);
	const num = (name: string, min: number, fallback: number) => Math.max(min, Math.round(Number(data.get(name)) || fallback));
	return {
		counts: data.getAll('count').map(Number).sort((a, b) => a - b),
		frameworks: FRAMEWORKS.map((f) => f.id).filter((id) => data.getAll('fw').includes(id)),
		iterations: num('iterations', 1, 20),
		warmup: num('warmup', 0, 5),
		rounds: num('rounds', 1, 1),
		colorMode: data.get('colorMode') as ColorMode,
		budgetMs: num('budget', 1, DEFAULT_BUDGET_MS / 1000) * 1000,
	};
}

function updateEstimate() {
	const c = readForm();
	const runs = c.frameworks.length * c.rounds * OPS.length * (c.iterations + c.warmup);
	// Roughly: three frames per sample plus the work itself, which grows with N.
	const seconds = c.counts.reduce((acc, n) => acc + runs * (0.06 + n / 1000 / 250), 0);
	const button = $<HTMLButtonElement>('#run');
	const empty = c.counts.length === 0 || c.frameworks.length === 0;
	button.disabled = empty;
	$('#estimate').textContent = empty
		? 'Pick at least one line count and one framework.'
		: `${fmtCount(runs * c.counts.length)} timed operations · roughly ${seconds < 90 ? `${Math.max(5, Math.round(seconds / 5) * 5)} s` : `${Math.round(seconds / 60)} min`}`;
}

// ---------------------------------------------------------------------- runner

let cancel: (() => void) | null = null;

async function loadFramework(frame: HTMLIFrameElement, path: string): Promise<BenchHandle> {
	await new Promise<void>((resolve, reject) => {
		frame.onload = () => resolve();
		frame.onerror = () => reject(new Error(`could not load ${path}`));
		frame.src = `${path}?embed`;
	});
	const deadline = performance.now() + 15000;
	while (performance.now() < deadline) {
		const handle = frame.contentWindow?.__bench;
		if (handle?.ready) return handle;
		await new Promise((r) => setTimeout(r, 50));
	}
	throw new Error(`${path} did not expose window.__bench (did the Fable build run?)`);
}

async function runComparison() {
	config = readForm();
	write(STORE_CONFIG, config);

	const overlay = $('#runner');
	const frame = $<HTMLIFrameElement>('#runner-frame');
	const label = $('#runner-label');
	const bar = $<HTMLElement>('#runner-bar > i');
	const eta = $('#runner-eta');
	overlay.hidden = false;
	document.documentElement.classList.add('running');

	const suites: SuiteResult[] = [];
	const order: FrameworkId[][] = [];
	for (let r = 0; r < config.rounds; r++) {
		// Rotate the order each round so no framework always goes first.
		const k = r % config.frameworks.length;
		order.push([...config.frameworks.slice(k), ...config.frameworks.slice(0, k)]);
	}
	const jobs = order.flat();
	const started = performance.now();
	const startedAt = new Date().toISOString();

	let cancelled = false;
	const cancelPromise = new Promise<never>((_, reject) => {
		cancel = () => {
			cancelled = true;
			reject(new Error('cancelled'));
		};
	});

	try {
		for (let j = 0; j < jobs.length; j++) {
			const fw = FRAMEWORKS.find((f) => f.id === jobs[j])!;
			label.textContent = `${fw.name} · loading`;
			const handle = await Promise.race([loadFramework(frame, fw.path), cancelPromise]);
			const suiteCfg: SuiteConfig = {
				counts: config.counts,
				iterations: config.iterations,
				warmup: config.warmup,
				ops: OPS.map((o) => o.id),
				style: { ...DEFAULT_STYLE, colorMode: config.colorMode },
				budgetMs: config.budgetMs,
			};
			const onProgress = (p: Progress) => {
				const done = (j + p.fraction) / jobs.length;
				bar.style.width = `${(done * 100).toFixed(1)}%`;
				const round = config.rounds > 1 ? ` · round ${Math.floor(j / config.frameworks.length) + 1}/${config.rounds}` : '';
				label.textContent = `${fw.name} · ${p.op} · ${fmtCount(p.count)} lines · ${p.iteration}/${p.iterations}${round}`;
				const elapsed = (performance.now() - started) / 1000;
				const left = done > 0.02 ? (elapsed / done) * (1 - done) : NaN;
				eta.textContent = Number.isFinite(left) ? `${left < 60 ? Math.ceil(left) + ' s' : Math.ceil(left / 60) + ' min'} left` : '';
			};
			const result = await Promise.race([handle.run(suiteCfg, onProgress), cancelPromise]);
			// Detach from the iframe's realm before it is navigated away.
			suites.push(JSON.parse(JSON.stringify(result)));
		}
		lastRun = { config, suites, env: suites[0]?.env ?? null, startedAt, finishedAt: new Date().toISOString() };
		write(STORE_RUN, lastRun);
		renderResults();
		$('#results').scrollIntoView({ behavior: 'smooth' });
	} catch (err) {
		if (!cancelled) {
			console.error(err);
			alert(`Benchmark failed: ${(err as Error).message}`);
		}
	} finally {
		cancel = null;
		frame.src = 'about:blank';
		overlay.hidden = true;
		bar.style.width = '0';
		document.documentElement.classList.remove('running');
	}
}

// --------------------------------------------------------------------- results

function cellFor(run: CompareRun, fw: FrameworkId, op: OpName, count: number): Cell | null {
	const results = run.suites.filter((s) => s.framework === fw).flatMap((s) => s.results.filter((r) => r.op === op && r.count === count));
	if (results.length === 0) return null;
	const samples: Sample[] = results.flatMap((r) => r.samples);
	return {
		script: stats(samples.map((s) => s.script)),
		render: stats(samples.map((s) => s.render)),
		total: stats(samples.map((s) => s.total)),
		n: samples.length,
		verified: results.every((r) => r.verified),
		verifyMessage: results.map((r) => r.verifyMessage).join('; '),
		truncated: results.some((r) => r.truncated),
	};
}

function renderResults() {
	const section = $('#results');
	if (!lastRun) {
		section.hidden = true;
		return;
	}
	section.hidden = false;
	const run = lastRun;
	const fws = FRAMEWORKS.filter((f) => run.config.frameworks.includes(f.id));
	const ops = OPS;

	// Cells, and each framework's ratio to the fastest in every cell.
	const grid = new Map<string, Map<FrameworkId, Cell>>();
	const ratios = new Map<FrameworkId, number[]>(fws.map((f) => [f.id, []]));
	const wins = new Map<FrameworkId, number>(fws.map((f) => [f.id, 0]));
	for (const op of ops) {
		for (const count of run.config.counts) {
			const row = new Map<FrameworkId, Cell>();
			for (const f of fws) {
				const c = cellFor(run, f.id, op.id, count);
				if (c) row.set(f.id, c);
			}
			grid.set(`${op.id}:${count}`, row);
			const best = Math.min(...[...row.values()].map((c) => c[metric].median));
			for (const [id, c] of row) {
				ratios.get(id)!.push(c[metric].median / best);
				if (c[metric].median === best) wins.set(id, wins.get(id)! + 1);
			}
		}
	}
	const cellsTotal = ops.length * run.config.counts.length;
	const geomean = (xs: number[]) => Math.exp(xs.reduce((a, x) => a + Math.log(x), 0) / xs.length);
	const unverified = [...grid.values()].flatMap((row) => [...row.entries()].filter(([, c]) => !c.verified).map(([id]) => id));
	const truncated = [...grid.entries()].flatMap(([key, row]) =>
		[...row.entries()].filter(([, c]) => c.truncated).map(([id]) => {
			const [op, count] = key.split(':');
			return `${FRAMEWORKS.find((f) => f.id === id)!.name} ${op} ${fmtCompact(Number(count))}`;
		}),
	);

	const metricLabel = { total: 'total (script + render)', script: 'script', render: 'render' }[metric];

	$('#summary').innerHTML = fws
		.map((f) => {
			const g = geomean(ratios.get(f.id)!);
			return `<div class="tile">
				<span class="tile-label"><i class="swatch" data-fw="${f.id}"></i>${f.name}</span>
				<span class="tile-value">${fmtRatio(g)}</span>
				<span class="tile-sub">fastest in ${wins.get(f.id)} of ${cellsTotal}</span>
			</div>`;
		})
		.join('');

	$('#summary-note').innerHTML = `Geometric mean of each framework's median ${metricLabel} time relative to the fastest framework in each chart cell; 1.00× means fastest everywhere.
		${unverified.length ? `<strong class="bad">DOM check failed for ${[...new Set(unverified)].join(', ')}; see the table.</strong>` : 'Every run passed the DOM check (line count and exact coordinates).'}
		${truncated.length ? `<br><span class="bad">*</span> Hit the ${(run.config.budgetMs ?? DEFAULT_BUDGET_MS) / 1000} s time budget and kept fewer samples: ${truncated.join(', ')}.` : ''}`;

	$('#charts').innerHTML = ops
		.map((op) => {
			const cells = run.config.counts
				.map((count) => {
					const row = grid.get(`${op.id}:${count}`)!;
					const values = [...row.values()];
					const max = Math.max(...values.map((c) => c[metric].median)) || 1;
					const best = Math.min(...values.map((c) => c[metric].median));
					const bars = fws
						.map((f) => {
							const c = row.get(f.id);
							if (!c) return '';
							const v = c[metric].median;
							const segs =
								metric === 'total'
									? `<i class="seg" style="width:${(c.script.median / max) * 100}%"></i><i class="seg seg-render" style="width:${(c.render.median / max) * 100}%"></i>`
									: `<i class="seg${metric === 'render' ? ' seg-render' : ''}" style="width:${(v / max) * 100}%"></i>`;
							const ratio = v === best ? '<span class="best">fastest</span>' : `<span class="ratio">${fmtRatio(v / best)}</span>`;
							return `<div class="bar-row" data-fw="${f.id}" data-op="${op.id}" data-count="${count}" tabindex="0">
								<span class="bar-label">${f.name}</span>
								<span class="bar-track">${segs}</span>
								<span class="bar-value">${fmt(v)}${c.truncated ? '<span class="bad" title="Stopped at the time budget">*</span>' : ''}${c.verified ? '' : ' <span class="bad" title="DOM check failed">✗</span>'}</span>
								<span class="bar-ratio">${ratio}</span>
							</div>`;
						})
						.join('');
					return `<figure class="cell"><figcaption>${fmtCount(count)} lines <span class="unit">ms</span></figcaption>${bars}</figure>`;
				})
				.join('');
			return `<section class="op">
				<h3>${op.label} <span class="op-help">${esc(op.help)}</span></h3>
				<div class="cells">${cells}</div>
			</section>`;
		})
		.join('');

	// Table view: every number, for reading and for screen readers.
	const head = fws.map((f) => `<th scope="col"><i class="swatch" data-fw="${f.id}"></i>${f.name}</th>`).join('');
	const body = ops
		.flatMap((op) =>
			run.config.counts.map((count) => {
				const row = grid.get(`${op.id}:${count}`)!;
				const best = Math.min(...[...row.values()].map((c) => c[metric].median));
				const tds = fws
					.map((f) => {
						const c = row.get(f.id);
						if (!c) return '<td>–</td>';
						const isBest = c[metric].median === best;
						return `<td${isBest ? ' class="is-best"' : ''} title="${esc(c.verifyMessage)}">
							<span class="t-main">${fmt(c.total.median)}</span>
							<span class="t-sub">${fmt(c.script.median)} + ${fmt(c.render.median)} · p95 ${fmt(c.total.p95)}${c.truncated ? ` · <span class="bad">n=${c.n}*</span>` : ''}${c.verified ? '' : ' · <span class="bad">DOM ✗</span>'}</span>
						</td>`;
					})
					.join('');
				return `<tr><th scope="row">${op.label}</th><td class="num">${fmtCount(count)}</td>${tds}</tr>`;
			}),
		)
		.join('');
	$('#table').innerHTML = `<table>
		<caption>Median ms: total, with script + render and p95 below. Bold: fastest by ${metricLabel}.</caption>
		<thead><tr><th scope="col">Operation</th><th scope="col" class="num">Lines</th>${head}</tr></thead>
		<tbody>${body}</tbody>
	</table>`;

	const env = run.env;
	const iters = run.config.iterations * run.config.rounds;
	$('#run-meta').textContent = [
		`${iters} measured runs per cell (${run.config.warmup} warmup${run.config.rounds > 1 ? `, ${run.config.rounds} rounds` : ''})`,
		`colour mode for create/update: ${run.config.colorMode}`,
		env ? `viewport ${env.viewport[0]}×${env.viewport[1]} @${env.dpr}x · ${env.cores} cores` : '',
		new Date(run.finishedAt).toLocaleString(),
	]
		.filter(Boolean)
		.join(' · ');
}

// --------------------------------------------------------------------- tooltip

function tooltipFor(row: HTMLElement): string | null {
	if (!lastRun) return null;
	const fw = row.dataset.fw as FrameworkId;
	const c = cellFor(lastRun, fw, row.dataset.op as OpName, Number(row.dataset.count));
	if (!c) return null;
	const name = FRAMEWORKS.find((f) => f.id === fw)!.name;
	const line = (k: string, v: string) => `<div><dt>${k}</dt><dd>${v}</dd></div>`;
	return `<strong><i class="swatch" data-fw="${fw}"></i>${name}</strong>
		<span class="tt-sub">${OPS.find((o) => o.id === row.dataset.op)!.label} · ${fmtCount(Number(row.dataset.count))} lines</span>
		<dl>
			${line('Total median', `${fmt(c.total.median)} ms`)}
			${line('Script median', `${fmt(c.script.median)} ms`)}
			${line('Render median', `${fmt(c.render.median)} ms`)}
			${line('Total p95', `${fmt(c.total.p95)} ms`)}
			${line('Total min / max', `${fmt(c.total.min)} / ${fmt(c.total.max)} ms`)}
			${line('Samples', c.truncated ? `<span class="bad">${c.n} (time budget hit)</span>` : String(c.n))}
			${line('DOM check', c.verified ? 'passed' : `<span class="bad">${esc(c.verifyMessage)}</span>`)}
		</dl>`;
}

function wireTooltip() {
	const tip = $('#tooltip');
	const show = (row: HTMLElement, x: number, y: number) => {
		const html = tooltipFor(row);
		if (!html) return;
		tip.innerHTML = html;
		tip.hidden = false;
		const r = tip.getBoundingClientRect();
		const left = Math.min(x + 14, innerWidth - r.width - 8);
		const top = y + 14 + r.height > innerHeight ? y - r.height - 10 : y + 14;
		tip.style.transform = `translate(${Math.max(8, left)}px, ${Math.max(8, top)}px)`;
	};
	const charts = $('#charts');
	charts.addEventListener('pointermove', (e) => {
		const row = (e.target as Element).closest<HTMLElement>('.bar-row');
		if (row) show(row, e.clientX, e.clientY);
		else tip.hidden = true;
	});
	charts.addEventListener('pointerleave', () => (tip.hidden = true));
	charts.addEventListener('focusin', (e) => {
		const row = (e.target as Element).closest<HTMLElement>('.bar-row');
		if (!row) return;
		const r = row.getBoundingClientRect();
		show(row, r.left + r.width / 2, r.bottom);
	});
	charts.addEventListener('focusout', () => (tip.hidden = true));
}

// ------------------------------------------------------------------------ init

function download() {
	if (!lastRun) return;
	const blob = new Blob([JSON.stringify(lastRun, null, 2)], { type: 'application/json' });
	const a = document.createElement('a');
	a.href = URL.createObjectURL(blob);
	a.download = `drawsvgbench-${lastRun.finishedAt.replace(/[:.]/g, '-')}.json`;
	a.click();
	setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

renderCards();
renderForm();
renderResults();
wireTooltip();

$('#config').addEventListener('input', () => {
	config = readForm();
	write(STORE_CONFIG, config);
	updateEstimate();
});
$('#config').addEventListener('submit', (e) => {
	e.preventDefault();
	runComparison();
});
$('#runner-cancel').addEventListener('click', () => cancel?.());
addEventListener('keydown', (e) => {
	if (e.key === 'Escape') cancel?.();
});
$('#metric').addEventListener('change', (e) => {
	metric = (e.target as HTMLInputElement).value as Metric;
	renderResults();
});
$('#download').addEventListener('click', download);
