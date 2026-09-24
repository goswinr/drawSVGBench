import { track } from 'ripple';
import { dashArray, lineStroke, lineWidth, range, type LineStyle } from '../shared/lines';
import type { StageBridge } from './bridge';

export function Stage({ bridge, initial }: { bridge: StageBridge; initial: LineStyle }) @{
	// One tracked value holds the whole float array.
	const data = track<Float64Array>(new Float64Array(0));

	// One tracked value per style field, so a width change does not wake the per-line bindings.
	const colorMode = track(initial.colorMode);
	const color = track(initial.color);
	const widthMode = track(initial.widthMode);
	const width = track(initial.width);
	const opacity = track(initial.opacity);
	const linecap = track(initial.linecap);
	const dash = track(initial.dash);
	const background = track(initial.background);

	const count = track(() => data.value.length >> 2);
	// Only re-created when the line count changes; a same-size update leaves the @for alone.
	const indices = track(() => range(count.value));

	bridge.setData = (d) => {
		data.value = d;
	};
	bridge.setStyle = (s) => {
		colorMode.value = s.colorMode;
		color.value = s.color;
		widthMode.value = s.widthMode;
		width.value = s.width;
		opacity.value = s.opacity;
		linecap.value = s.linecap;
		dash.value = s.dash;
		background.value = s.background;
	};

	<svg width="100%" height="100%" style={{ background: background.value }}>
		<g
			fill="none"
			stroke={color.value}
			stroke-width={width.value}
			stroke-opacity={opacity.value}
			stroke-linecap={linecap.value}
			stroke-dasharray={dashArray(dash.value, width.value)}
		>
			@for (const i of indices.value; key i) {
				const o = i * 4;
				<line
					x1={data.value[o]}
					y1={data.value[o + 1]}
					x2={data.value[o + 2]}
					y2={data.value[o + 3]}
					stroke={lineStroke(colorMode.value, data.value, i, count.value)}
					stroke-width={lineWidth(widthMode.value, i)}
				/>
			}
		</g>
	</svg>
}
