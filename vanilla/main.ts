import { startHarness } from '../shared/harness';
import { EMPTY, dashArray, lineStroke, lineWidth, type LineStyle } from '../shared/lines';

// No framework: the <line> elements are kept in an array and written with
// plain DOM calls. It writes what the compiled Solid and Ripple code writes
// (only the attributes whose value changed), without a reactive graph, so it
// is the floor the frameworks' overhead is measured against.

const SVG_NS = 'http://www.w3.org/2000/svg';

let svg: SVGSVGElement;
let group: SVGGElement;
let data: Float64Array = EMPTY;
let style: LineStyle | undefined;
const lines: SVGLineElement[] = [];
/** The `stroke` last written to each line; `undefined` means the attribute is absent. */
const strokes: (string | undefined)[] = [];

function writeStroke(i: number, count: number) {
	const s = lineStroke(style!.colorMode, data, i, count);
	if (s === strokes[i]) return;
	strokes[i] = s;
	if (s === undefined) lines[i].removeAttribute('stroke');
	else lines[i].setAttribute('stroke', s);
}

function writeWidth(i: number) {
	const w = lineWidth(style!.widthMode, i);
	if (w === undefined) lines[i].removeAttribute('stroke-width');
	else lines[i].setAttribute('stroke-width', w);
}

function writeCoords(el: SVGLineElement, o: number) {
	el.setAttribute('x1', String(data[o]));
	el.setAttribute('y1', String(data[o + 1]));
	el.setAttribute('x2', String(data[o + 2]));
	el.setAttribute('y2', String(data[o + 3]));
}

function setData(next: Float64Array) {
	data = next;
	const count = next.length >> 2;
	if (count === 0) {
		group.textContent = '';
		lines.length = 0;
		strokes.length = 0;
		return;
	}
	if (count < lines.length) {
		for (let i = count; i < lines.length; i++) lines[i].remove();
		lines.length = count;
		strokes.length = count;
	}
	const kept = lines.length;
	for (let i = 0; i < kept; i++) {
		writeCoords(lines[i], i * 4);
		writeStroke(i, count);
	}
	if (count > kept) {
		// New lines get their attributes before they are attached, then go in with one append.
		const fragment = document.createDocumentFragment();
		for (let i = kept; i < count; i++) {
			const el = document.createElementNS(SVG_NS, 'line') as SVGLineElement;
			lines.push(el);
			writeCoords(el, i * 4);
			writeStroke(i, count);
			writeWidth(i);
			fragment.append(el);
		}
		group.append(fragment);
	}
}

function setStyle(next: LineStyle) {
	const prev = style;
	style = next;
	const changed = (key: keyof LineStyle) => !prev || prev[key] !== next[key];
	if (changed('background')) svg.style.background = next.background;
	if (changed('color')) group.setAttribute('stroke', next.color);
	if (changed('width')) group.setAttribute('stroke-width', String(next.width));
	if (changed('opacity')) group.setAttribute('stroke-opacity', String(next.opacity));
	if (changed('linecap')) group.setAttribute('stroke-linecap', next.linecap);
	if (changed('dash') || changed('width')) group.setAttribute('stroke-dasharray', dashArray(next.dash, next.width));
	const count = lines.length;
	if (changed('colorMode')) for (let i = 0; i < count; i++) writeStroke(i, count);
	if (changed('widthMode')) for (let i = 0; i < count; i++) writeWidth(i);
}

// Every write above is a direct DOM call, so the DOM is updated when these return.
startHarness({
	id: 'vanilla',
	mount(container, initial) {
		svg = document.createElementNS(SVG_NS, 'svg');
		svg.setAttribute('width', '100%');
		svg.setAttribute('height', '100%');
		group = document.createElementNS(SVG_NS, 'g');
		group.setAttribute('fill', 'none');
		svg.append(group);
		setStyle(initial);
		container.append(svg);
	},
	setData,
	setStyle,
});
