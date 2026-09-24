import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';
import { ripple } from '@ripple-ts/vite-plugin';

const root = import.meta.dirname;

const npmVersion = (name: string): string =>
	JSON.parse(readFileSync(resolve(root, 'node_modules', name, 'package.json'), 'utf8')).version;

const fsproj = readFileSync(resolve(root, 'fable/App.fsproj'), 'utf8');
const nugetVersion = (id: string): string =>
	fsproj.match(new RegExp(`Include="${id.replace(/\./g, '\\.')}"\\s+Version="([^"]+)"`))?.[1] ?? '?';

const fableVersion: string = JSON.parse(readFileSync(resolve(root, '.config/dotnet-tools.json'), 'utf8')).tools
	.fable.version;

// App.fsproj uses the local fork in ./Fable.Ripple when present (see the comment
// there). Label whichever one Fable actually compiled against.
function fableRippleVersion(): string {
	const compiled = resolve(root, 'fable/App.fs.js');
	const js = existsSync(compiled) ? readFileSync(compiled, 'utf8') : '';
	if (!js.includes('/Fable.Ripple/src/')) {
		return `${nugetVersion('Fable.Ripple')} · Dom ${nugetVersion('Fable.Ripple.Dom')}`;
	}
	const git = (args: string) => {
		try {
			return execSync(`git -C Fable.Ripple ${args}`, { cwd: root, encoding: 'utf8' }).trim();
		} catch {
			return '';
		}
	};
	const dirty = git('status --porcelain --untracked-files=no') ? '+dirty' : '';
	return `fork ${git('rev-parse --abbrev-ref HEAD')}@${git('rev-parse --short HEAD')}${dirty}`;
}

// Cross-origin isolation raises performance.now() resolution from 100 µs to 5 µs.
const isolation = {
	'Cross-Origin-Opener-Policy': 'same-origin',
	'Cross-Origin-Embedder-Policy': 'require-corp',
};

export default defineConfig({
	// Relative asset URLs, so the build also works from a sub-path such as GitHub Pages' /drawSVGBench/.
	base: './',
	plugins: [
		// Solid's JSX transform must not touch the Ripple or Fable pages.
		solid({ include: ['solid/**/*.tsx'] }),
		ripple({ excludeRippleExternalModules: true }),
	],
	define: {
		__VERSIONS__: JSON.stringify({
			solid: npmVersion('solid-js'),
			ripple: npmVersion('ripple'),
			fable: `${fableRippleVersion()} · Fable ${fableVersion}`,
		}),
	},
	server: {
		headers: isolation,
		watch: {
			ignored: [
				'**/obj/**',
				'**/bin/**',
				// The fork's own tooling; only its src/**/*.fs.js output matters here.
				'**/Fable.Ripple/{node_modules,tests,docs,demo,bench,build,.git}/**',
			],
		},
	},
	preview: {
		headers: isolation,
	},
	build: {
		target: 'esnext',
		rollupOptions: {
			input: {
				compare: resolve(root, 'index.html'),
				solid: resolve(root, 'solid/index.html'),
				ripple: resolve(root, 'ripple/index.html'),
				fable: resolve(root, 'fable/index.html'),
				fableGrouped: resolve(root, 'fable-grouped/index.html'),
				vanilla: resolve(root, 'vanilla/index.html'),
			},
		},
	},
});
