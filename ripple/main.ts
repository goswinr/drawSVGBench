import { flushSync, mount } from 'ripple';
import { startHarness } from '../shared/harness';
import type { StageBridge } from './bridge';
import { Stage } from './Stage.tsrx';

const bridge: StageBridge = {
	setData() {},
	setStyle() {},
};

// Ripple batches writes and flushes them later; flushSync commits the DOM
// before returning, which is what the harness times.
startHarness({
	id: 'ripple',
	mount(container, style) {
		flushSync(() => {
			mount(Stage, { target: container, props: { bridge, initial: style }, rootBoundary: false });
		});
	},
	setData(data) {
		flushSync(() => bridge.setData(data));
	},
	setStyle(style) {
		flushSync(() => bridge.setStyle(style));
	},
});
