import type { LineStyle } from '../shared/lines';

/** Filled in by the Stage component so code outside the tree can write its tracked state. */
export interface StageBridge {
	setData(data: Float64Array): void;
	setStyle(style: LineStyle): void;
}
