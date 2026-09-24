import { batch, createMemo, createSignal, For } from 'solid-js';
import { render } from 'solid-js/web';
import { startHarness } from '../shared/harness';
import { dashArray, lineStroke, lineWidth, range, type LineStyle } from '../shared/lines';

// One signal holds the whole float array; `equals: false` because every
// update is a new array anyway and there is nothing to compare.
const [data, setData] = createSignal(new Float64Array(0), { equals: false });

// One signal per style field, so a width change does not wake the per-line bindings.
const [colorMode, setColorMode] = createSignal<LineStyle['colorMode']>('uniform');
const [color, setColor] = createSignal('');
const [widthMode, setWidthMode] = createSignal<LineStyle['widthMode']>('uniform');
const [width, setWidth] = createSignal(1);
const [opacity, setOpacity] = createSignal(1);
const [linecap, setLinecap] = createSignal<LineStyle['linecap']>('butt');
const [dash, setDash] = createSignal<LineStyle['dash']>('solid');
const [background, setBackground] = createSignal('');

function applyStyle(s: LineStyle) {
	batch(() => {
		setColorMode(s.colorMode);
		setColor(s.color);
		setWidthMode(s.widthMode);
		setWidth(s.width);
		setOpacity(s.opacity);
		setLinecap(s.linecap);
		setDash(s.dash);
		setBackground(s.background);
	});
}

function Stage() {
	const count = createMemo(() => data().length >> 2);
	// Only re-created when the line count changes; a same-size update leaves <For> alone.
	const indices = createMemo(() => range(count()));

	return (
		<svg width="100%" height="100%" style={{ background: background() }}>
			<g
				fill="none"
				stroke={color()}
				stroke-width={width()}
				stroke-opacity={opacity()}
				stroke-linecap={linecap()}
				stroke-dasharray={dashArray(dash(), width())}
			>
				<For each={indices()}>
					{(i) => {
						const o = i * 4;
						return (
							<line
								x1={data()[o]}
								y1={data()[o + 1]}
								x2={data()[o + 2]}
								y2={data()[o + 3]}
								stroke={lineStroke(colorMode(), data(), i, count())}
								stroke-width={lineWidth(widthMode(), i)}
							/>
						);
					}}
				</For>
			</g>
		</svg>
	);
}

// Solid 1.x runs signal writes synchronously, so the DOM is updated when these return.
startHarness({
	id: 'solid',
	mount(container, style) {
		applyStyle(style);
		render(() => <Stage />, container);
	},
	setData,
	setStyle: applyStyle,
});
