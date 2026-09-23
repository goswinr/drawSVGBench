// The page chrome shared by all three framework pages: a full-screen stage the
// framework renders its <svg> into, a floating control panel, and the
// `window.__bench` handle the compare page drives. Plain DOM on purpose, so
// the panel costs every framework the same.

import './harness.css';
import { COUNTS, DEFAULT_STYLE, EMPTY, driftLines, randomLines, type BenchApp, type LineStyle } from './lines';
import { FRAMEWORKS, frameworkInfo } from './frameworks';
import {
	OPS,
	environment,
	measure,
	runSuite,
	verify,
	type OpResult,
	type Progress,
	type Sample,
	type SuiteConfig,
	type SuiteResult,
} from './measure';

const STORE_KEY = 'drawsvgbench:settings';

type DataMode = 'random' | 'drift';

interface Settings {
	lines: number;
	dataMode: DataMode;
	style: LineStyle;
	iterations: number;
	warmup: number;
}

export interface BenchHandle {
	ready: true;
	id: BenchApp['id'];
	name: string;
	version: string;
	run(cfg: SuiteConfig, onProgress?: (p: Progress) => void): Promise<SuiteResult>;
	/** Verifies the current DOM against the current data (count, coordinates, stroke). */
	check(): { ok: boolean; message: string };
}

declare global {
	interface Window {
		__bench?: BenchHandle;
	}
}

const defaults = (): Settings => ({
	lines: 5000,
	dataMode: 'random',
	style: { ...DEFAULT_STYLE },
	iterations: 20,
	warmup: 5,
});

function loadSettings(): Settings {
	const base = defaults();
	try {
		const raw = localStorage.getItem(STORE_KEY);
		if (!raw) return base;
		const saved = JSON.parse(raw) as Partial<Settings>;
		return { ...base, ...saved, style: { ...base.style, ...saved.style } };
	} catch {
		return base;
	}
}

function saveSettings(s: Settings) {
	try {
		localStorage.setItem(STORE_KEY, JSON.stringify(s));
	} catch {
		/* storage unavailable: settings just don't persist */
	}
}

const fmt = (ms: number) => (Number.isFinite(ms) ? (ms < 10 ? ms.toFixed(2) : ms < 100 ? ms.toFixed(1) : ms.toFixed(0)) : '–');
const fmtCount = (n: number) => n.toLocaleString('en-US');

export function startHarness(app: BenchApp): void {
	const info = frameworkInfo(app.id);
	const params = new URLSearchParams(location.search);
	const embed = params.has('embed');
	const settings = embed ? defaults() : loadSettings();
	const fromUrl = Number(params.get('lines'));
	if (fromUrl > 0) settings.lines = Math.min(200000, Math.round(fromUrl));

	document.title = `${info.name} · drawSVGBench`;
	document.documentElement.dataset.framework = app.id;

	const stage = document.createElement('div');
	stage.id = 'stage-root';
	stage.className = 'hb-stage';
	document.body.append(stage);

	let data: Float64Array = EMPTY;
	let style: LineStyle = { ...settings.style };
	let suiteRunning = false;

	app.mount(stage, style);

	const setData = (d: Float64Array) => {
		data = d;
		app.setData(d);
	};
	const setStyle = (s: LineStyle) => {
		style = s;
		app.setStyle(s);
	};

	window.__bench = {
		ready: true,
		id: app.id,
		name: info.name,
		version: info.version,
		async run(cfg, onProgress) {
			suiteRunning = true;
			try {
				const out = await runSuite(app, stage, cfg, onProgress);
				data = out.data;
				style = { ...cfg.style };
				return {
					framework: app.id,
					name: info.name,
					version: info.version,
					config: cfg,
					results: out.results,
					env: environment(),
				};
			} finally {
				suiteRunning = false;
			}
		},
		check: () => verify(stage, data, style.colorMode),
	};

	if (embed) {
		document.documentElement.classList.add('hb-embed');
		return;
	}

	// ---------------------------------------------------------------- panel

	const panel = document.createElement('aside');
	panel.className = 'hb-panel';
	panel.innerHTML = panelHtml(app.id);
	document.body.append(panel);

	const $ = <T extends Element = HTMLElement>(sel: string) => panel.querySelector(sel) as T;
	const field = <T extends HTMLInputElement | HTMLSelectElement>(name: string) => $<T>(`[name="${name}"]`);
	const out = (name: string) => $(`[data-out="${name}"]`);

	// Reflect settings into the controls.
	field<HTMLSelectElement>('lines').value = String(settings.lines);
	if (field<HTMLSelectElement>('lines').value !== String(settings.lines)) {
		const opt = new Option(fmtCount(settings.lines), String(settings.lines));
		field<HTMLSelectElement>('lines').add(opt);
		field<HTMLSelectElement>('lines').value = String(settings.lines);
	}
	field('dataMode').value = settings.dataMode;
	field('iterations').value = String(settings.iterations);
	field('warmup').value = String(settings.warmup);
	const syncStyleControls = () => {
		field('colorMode').value = style.colorMode;
		field('color').value = style.color;
		field('width').value = String(style.width);
		field('opacity').value = String(style.opacity);
		field('linecap').value = style.linecap;
		field('dash').value = style.dash;
		field('background').value = style.background;
		out('width').textContent = String(style.width);
		out('opacity').textContent = style.opacity.toFixed(2);
		(field('color') as HTMLInputElement).disabled = style.colorMode !== 'uniform';
	};
	syncStyleControls();

	const persist = () => {
		settings.style = { ...style };
		saveSettings(settings);
	};

	const showSample = (label: string, s: Sample, gen?: number) => {
		out('op').textContent = label;
		out('lines').textContent = fmtCount(data.length / 4);
		out('gen').textContent = gen === undefined ? '–' : fmt(gen);
		out('script').textContent = fmt(s.script);
		out('render').textContent = fmt(s.render);
		out('total').textContent = fmt(s.total);
		out('pill').textContent = `${fmt(s.total)} ms`;
	};

	const nextData = (count: number): Float64Array =>
		settings.dataMode === 'drift' ? driftLines(data, count, innerWidth, innerHeight) : randomLines(count, innerWidth, innerHeight);

	const timedData = async (label: string, make: () => Float64Array) => {
		const g0 = performance.now();
		const d = make();
		const gen = performance.now() - g0;
		showSample(label, await measure(() => setData(d)), gen);
	};

	const timedStyle = async (label: string, next: LineStyle) => {
		const s = await measure(() => setStyle(next));
		showSample(label, s);
		syncStyleControls();
		persist();
	};

	// ------------------------------------------------------------- animate

	let animating = false;
	let frames = 0;
	let windowStart = 0;
	let scriptSum = 0;

	const animate = (ts: number) => {
		if (!animating) return;
		const d = nextData(settings.lines);
		const t0 = performance.now();
		setData(d);
		scriptSum += performance.now() - t0;
		frames++;
		if (ts - windowStart >= 500) {
			const fps = (frames * 1000) / (ts - windowStart);
			out('fps').textContent = fps.toFixed(0);
			out('ascript').textContent = fmt(scriptSum / frames);
			out('pill').textContent = `${fps.toFixed(0)} fps`;
			frames = 0;
			scriptSum = 0;
			windowStart = ts;
		}
		requestAnimationFrame(animate);
	};

	const setAnimating = (on: boolean) => {
		if (suiteRunning) return;
		animating = on;
		$('[data-act="animate"]').textContent = on ? 'Stop' : 'Animate';
		$('[data-act="animate"]').setAttribute('aria-pressed', String(on));
		panel.classList.toggle('hb-animating', on);
		if (on) {
			frames = 0;
			scriptSum = 0;
			windowStart = performance.now();
			requestAnimationFrame(animate);
		} else {
			out('fps').textContent = '–';
			out('ascript').textContent = '–';
		}
	};

	// -------------------------------------------------------------- events

	const act = (name: string) => {
		if (suiteRunning) return;
		switch (name) {
			case 'update':
				if (!animating) timedData('update', () => nextData(settings.lines));
				break;
			case 'animate':
				setAnimating(!animating);
				break;
			case 'clear':
				setAnimating(false);
				timedData('clear', () => EMPTY);
				break;
			case 'collapse':
				panel.classList.toggle('hb-collapsed');
				break;
			case 'suite':
				runPanelSuite();
				break;
			case 'copy':
				copyResults();
				break;
		}
	};

	panel.addEventListener('click', (e) => {
		const target = (e.target as Element).closest('[data-act]');
		if (target) act(target.getAttribute('data-act')!);
	});

	panel.addEventListener('input', (e) => {
		const el = e.target as HTMLInputElement | HTMLSelectElement;
		if (suiteRunning) return;
		switch (el.name) {
			case 'lines': {
				settings.lines = Number(el.value);
				persist();
				if (!animating) timedData(`resize → ${fmtCount(settings.lines)}`, () => randomLines(settings.lines, innerWidth, innerHeight));
				break;
			}
			case 'dataMode':
				settings.dataMode = el.value as DataMode;
				persist();
				break;
			case 'iterations':
			case 'warmup':
				settings[el.name] = Math.max(el.name === 'iterations' ? 1 : 0, Math.round(Number(el.value) || 0));
				persist();
				break;
			case 'width':
			case 'opacity':
				timedStyle(`style: ${el.name}`, { ...style, [el.name]: Number(el.value) });
				break;
			case 'colorMode':
			case 'color':
			case 'linecap':
			case 'dash':
			case 'background':
				timedStyle(`style: ${el.name}`, { ...style, [el.name]: el.value });
				break;
		}
	});

	addEventListener('keydown', (e) => {
		const t = e.target as HTMLElement;
		if (e.ctrlKey || e.metaKey || e.altKey || t.closest('input, select, textarea')) return;
		const key = e.key.toLowerCase();
		if (key === ' ') {
			e.preventDefault();
			act('update');
		} else if (key === 'a') act('animate');
		else if (key === 'c') act('clear');
		else if (key === 'h') act('collapse');
	});

	let resizeTimer = 0;
	addEventListener('resize', () => {
		clearTimeout(resizeTimer);
		resizeTimer = window.setTimeout(() => {
			if (!animating && !suiteRunning && data.length) timedData('viewport resize', () => randomLines(data.length / 4, innerWidth, innerHeight));
		}, 250);
	});

	// ---------------------------------------------------------------- suite

	let lastSuite: SuiteResult | null = null;

	async function runPanelSuite() {
		setAnimating(false);
		const counts = [settings.lines];
		const cfg: SuiteConfig = {
			counts,
			iterations: settings.iterations,
			warmup: settings.warmup,
			ops: OPS.map((o) => o.id),
			style: { ...style },
		};
		const button = $<HTMLButtonElement>('[data-act="suite"]');
		button.disabled = true;
		panel.classList.add('hb-running');
		out('progress').hidden = false;
		try {
			lastSuite = await window.__bench!.run(cfg, (p) => {
				out('progress').textContent = `${p.op} · ${fmtCount(p.count)} lines · ${p.iteration}/${p.iterations}`;
				$<HTMLElement>('.hb-bar > i').style.width = `${(p.fraction * 100).toFixed(1)}%`;
			});
			renderResults(lastSuite.results);
			out('lines').textContent = fmtCount(data.length / 4);
			syncStyleControls();
		} finally {
			button.disabled = false;
			panel.classList.remove('hb-running');
			out('progress').hidden = true;
			$<HTMLElement>('.hb-bar > i').style.width = '0';
		}
	}

	function renderResults(results: OpResult[]) {
		const rows = results
			.map(
				(r) => `<tr>
					<th scope="row" title="${OPS.find((o) => o.id === r.op)!.help}">${r.op}${
						r.truncated ? ` <span class="hb-warn" title="Hit the time budget: ${r.samples.length} samples">${r.samples.length}×</span>` : ''
					}</th>
					<td><strong>${fmt(r.total.median)}</strong></td>
					<td>${fmt(r.script.median)}</td>
					<td>${fmt(r.render.median)}</td>
					<td>${fmt(r.total.p95)}</td>
					<td title="${r.verifyMessage}">${r.verified ? '✓' : '✗'}</td>
				</tr>`,
			)
			.join('');
		$('[data-out="results"]').innerHTML = `
			<table class="hb-table">
				<caption>${fmtCount(results[0]?.count ?? 0)} lines · median ms of ${settings.iterations} runs</caption>
				<thead><tr><th scope="col">op</th><th scope="col">total</th><th scope="col">script</th><th scope="col">render</th><th scope="col">p95</th><th scope="col"><span class="hb-sr">verified</span></th></tr></thead>
				<tbody>${rows}</tbody>
			</table>
			<button type="button" data-act="copy" class="hb-link">Copy JSON</button>`;
	}

	async function copyResults() {
		if (!lastSuite) return;
		try {
			await navigator.clipboard.writeText(JSON.stringify(lastSuite, null, 2));
			$('[data-act="copy"]').textContent = 'Copied';
		} catch {
			$('[data-act="copy"]').textContent = 'Clipboard blocked';
		}
	}

	// -------------------------------------------------------------- initial

	timedData('create', () => randomLines(settings.lines, innerWidth, innerHeight)).then(() => {
		const check = verify(stage, data, style.colorMode);
		if (!check.ok) console.error(`[drawSVGBench] ${info.name} rendered the wrong DOM: ${check.message}`);
	});
}

function panelHtml(current: BenchApp['id']): string {
	const info = frameworkInfo(current);
	const nav = FRAMEWORKS.map(
		(f) => `<a href="../${f.path}"${f.id === current ? ' aria-current="page"' : ''}><i class="hb-swatch" data-fw="${f.id}"></i>${f.name}</a>`,
	).join('');
	const counts = COUNTS.map((n) => `<option value="${n}">${fmtCount(n)}</option>`).join('');
	return `
	<header class="hb-head">
		<div class="hb-title">
			<i class="hb-swatch" data-fw="${info.id}"></i>
			<strong>${info.name}</strong>
			<span class="hb-ver" title="${info.version}">${info.version}</span>
		</div>
		<output class="hb-pill" data-out="pill" aria-live="off"></output>
		<button type="button" class="hb-icon" data-act="collapse" title="Show / hide panel (H)" aria-label="Show or hide panel">
			<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M3 10l5-5 5 5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
		</button>
	</header>
	<div class="hb-body">
		<nav class="hb-nav" aria-label="Frameworks">${nav}<a href="../" class="hb-compare">Compare all →</a></nav>

		<section>
			<h2>Data</h2>
			<div class="hb-grid">
				<label>Lines <select name="lines">${counts}</select></label>
				<label>New array <select name="dataMode">
					<option value="random">Fresh random</option>
					<option value="drift">Drift from previous</option>
				</select></label>
			</div>
			<div class="hb-actions">
				<button type="button" class="hb-primary" data-act="update">New array <kbd>Space</kbd></button>
				<button type="button" data-act="animate" aria-pressed="false">Animate</button>
				<button type="button" data-act="clear">Clear</button>
			</div>
		</section>

		<section>
			<h2>Style</h2>
			<div class="hb-grid">
				<label>Colour <select name="colorMode">
					<option value="uniform">Uniform</option>
					<option value="angle">Hue by angle</option>
					<option value="length">Hue by length</option>
					<option value="index">Hue by index</option>
				</select></label>
				<label>Uniform colour <input type="color" name="color"></label>
				<label>Width <output data-out="width"></output><input type="range" name="width" min="0.25" max="8" step="0.25"></label>
				<label>Opacity <output data-out="opacity"></output><input type="range" name="opacity" min="0.05" max="1" step="0.05"></label>
				<label>Line cap <select name="linecap">
					<option value="butt">Butt</option>
					<option value="round">Round</option>
					<option value="square">Square</option>
				</select></label>
				<label>Dash <select name="dash">
					<option value="solid">Solid</option>
					<option value="dashed">Dashed</option>
					<option value="dotted">Dotted</option>
				</select></label>
				<label class="hb-wide">Background <select name="background">
					<option value="#0d1117">Night</option>
					<option value="#000000">Black</option>
					<option value="#f6f5f0">Paper</option>
					<option value="#ffffff">White</option>
				</select></label>
			</div>
		</section>

		<section>
			<h2>Last change</h2>
			<dl class="hb-metrics">
				<div class="hb-wide"><dt>Operation</dt><dd data-out="op">–</dd></div>
				<div><dt>Lines in DOM</dt><dd data-out="lines">–</dd></div>
				<div><dt>Generate</dt><dd><span data-out="gen">–</span> ms</dd></div>
				<div><dt>Script</dt><dd><span data-out="script">–</span> ms</dd></div>
				<div><dt>Render</dt><dd><span data-out="render">–</span> ms</dd></div>
				<div class="hb-total"><dt>Total</dt><dd><span data-out="total">–</span> ms</dd></div>
				<div><dt>Animate</dt><dd><span data-out="fps">–</span> fps · <span data-out="ascript">–</span> ms</dd></div>
			</dl>
		</section>

		<section>
			<h2>Benchmark</h2>
			<div class="hb-grid">
				<label>Iterations <input type="number" name="iterations" min="1" max="500"></label>
				<label>Warmup <input type="number" name="warmup" min="0" max="100"></label>
			</div>
			<div class="hb-actions">
				<button type="button" class="hb-primary" data-act="suite">Run suite</button>
			</div>
			<div class="hb-bar" aria-hidden="true"><i></i></div>
			<p class="hb-progress" data-out="progress" hidden></p>
			<div data-out="results"></div>
		</section>

		<p class="hb-hint"><kbd>Space</kbd> new array · <kbd>A</kbd> animate · <kbd>C</kbd> clear · <kbd>H</kbd> hide</p>
	</div>`;
}
