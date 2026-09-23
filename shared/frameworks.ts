import type { FrameworkId } from './lines';

declare const __VERSIONS__: Record<FrameworkId, string>;

export interface FrameworkInfo {
	id: FrameworkId;
	name: string;
	version: string;
	/** Page path relative to the site root. */
	path: string;
	language: string;
}

export const FRAMEWORKS: FrameworkInfo[] = [
	{ id: 'solid', name: 'SolidJS', version: __VERSIONS__.solid, path: 'solid/', language: 'TSX' },
	{ id: 'ripple', name: 'Ripple', version: __VERSIONS__.ripple, path: 'ripple/', language: 'TSRX' },
	{ id: 'fable', name: 'Fable.Ripple', version: __VERSIONS__.fable, path: 'fable/', language: 'F#' },
];

export const frameworkInfo = (id: FrameworkId): FrameworkInfo => FRAMEWORKS.find((f) => f.id === id)!;
