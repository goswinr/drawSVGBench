# drawSVGBench

A full-screen SVG line-drawing benchmark for **SolidJS 1.9**, **Ripple** (ripple-ts) and **Fable.Ripple** (F#).

The core data structure is one `Float64Array` of random floats; every 4 floats are one line
(`x1 y1 x2 y2`, in pixels). Each framework renders `data.length / 4` `<line>` elements from it,
with styling options, and replaces the array with a new one to update the DOM. All three pages use
the same data generator, the same style helpers and the same timing code. Only the rendering layer
differs.

## Quick start

Requires Node 20.19+ and the .NET SDK 8+ (for the Fable compiler).

```sh
npm install          # also runs `dotnet tool restore` for Fable
npm run bench        # Fable release build + Vite production build, then opens the preview
```

| Script              | What it does                                                            |
| ------------------- | ----------------------------------------------------------------------- |
| `npm run dev`       | `dotnet fable watch` + Vite dev server (debug builds; not for numbers) |
| `npm run build`     | Fable in Release mode, then `vite build` into `dist/`                   |
| `npm run preview`   | Serves `dist/`                                                          |
| `npm run bench`     | `build` + `preview --open`                                              |
| `npm run typecheck` | `tsc --noEmit` over the TypeScript sources                              |

Pages:

- `/`: compare page. Runs the suite in each framework (one at a time, full-screen iframe) and charts the medians.
- `/solid/`, `/ripple/`, `/fable/`: each framework on its own, full-screen, with a control panel.
- `/fable-grouped/`: the Fable.Ripple app again, with one effect per line instead of one per
  attribute (see below).

Keys on the framework pages: <kbd>Space</kbd> new array · <kbd>A</kbd> animate · <kbd>C</kbd> clear ·
<kbd>H</kbd> hide the panel. Add `?lines=20000` to the URL to start with a given count.

## Styling options

Colour mode (uniform / hue by angle / hue by length / hue by index), uniform colour, stroke width,
opacity, line cap, dash pattern (solid / dashed / dotted) and background. Uniform mode sets
`stroke` once on the parent `<g>`. The hue modes give every line its own `stroke` attribute, so they
also add work to every update.

## What is measured

| Op      | Work                                                                    |
| ------- | ----------------------------------------------------------------------- |
| Create  | Empty SVG → N `<line>` elements                                         |
| Update  | New random array, same N: existing lines' attributes rewritten in place |
| Recolor | Per-line `stroke` switched between hue-by-angle and hue-by-index        |
| Clear   | N lines → empty SVG                                                     |

- **Script**: the synchronous framework call (reactive graph + DOM mutation), timed with
  `performance.now()`. Solid 1.x and Fable.Ripple flush writes synchronously; Ripple calls are wrapped
  in `flushSync`.
- **Render**: the browser's main-thread style, layout and paint for the frame that shows the change.
  It is measured from that frame's `requestAnimationFrame` callback to the first task after it. Waiting
  for vsync and off-thread rasterization are excluded.
- New arrays are generated before the timer starts, and each sample starts from a settled frame.
- After each op the DOM is checked against the data: line count, exact coordinates and the expected
  stroke on 5 lines. The compare page shows a ✗ for any mismatch.
- Every op/line-count cell has a wall-clock budget (default 20 s, setup included). When it is spent,
  the rest of the warmup is skipped and measuring stops after 3 samples (or after 1 once 3× the budget
  is gone). Such cells are marked `*`.
- The server sends COOP/COEP headers, so `performance.now()` has 5 µs resolution instead of 100 µs.

Use the production build (`npm run bench`) for numbers, in a normal (headed) browser window with
nothing else busy. Dev builds include framework debug code; Fable's Debug build also enables
Fable.Ripple's hot-reload bookkeeping.

## How each framework renders

All three keep the whole array in **one** reactive source and render a list over `range(count)`,
where `count` is derived from `data.length / 4`. The index list is only rebuilt when the count
changes. Each `<line>` binds its 4 coordinates plus the optional per-line stroke to the source.

| Framework                    | Source                                           | List                     | Per-line bindings                                                 |
| ---------------------------- | ------------------------------------------------ | ------------------------ | ----------------------------------------------------------------- |
| SolidJS ([solid/main.tsx](solid/main.tsx))    | `createSignal(Float64Array, { equals: false })`  | `<For>`                  | one render effect per line (the compiler groups the attributes)   |
| Ripple ([ripple/Stage.tsrx](ripple/Stage.tsrx)) | `track(Float64Array)`                            | keyed `@for`             | one render block per line (the compiler groups the attributes)    |
| Fable.Ripple ([fable/App.fs](fable/App.fs))  | `Var.createWith Signal.referenceEquals float[]`  | `Html.each`              | one `svgAttr.custom` effect per attribute (5 per line)            |
| Fable.Ripple (grouped), same file              | same                                             | same                     | one effect per line that writes all 5 attributes (`lineGrouped`)  |

The style fields are separate signals/tracked values/Vars in all three, so changing the width does
not wake the per-line bindings.

**Why two Fable.Ripple entries.** Solid's and Ripple's compilers turn an element's dynamic
attributes into one effect that re-evaluates them together and writes only the ones that changed.
Fable.Ripple.Dom has no compiler: each `svgAttr.custom` binding is its own effect, so the idiomatic
page creates, marks and tears down 5 reactive nodes per line where the others have 1. The grouped
page (`fable-grouped/index.html` loads the same `App.fs.js` with `data-variant="grouped"`) writes that
one effect by hand, with the public `Apply` + `Signal.effect` primitives. It shows how much of any
gap is the per-attribute binding style rather than the reactive core.

## Fable.Ripple from NuGet or from a local fork

If `./Fable.Ripple` exists (a clone of the Fable.Ripple repository, ignored by this repo's git), the
F# page is built against its `src/` instead of the NuGet packages, and the page shows
`fork <branch>@<commit>` as its version. `npm run dev` then also recompiles on edits to the fork.
To force the packages, set `FABLE_RIPPLE=nuget` (e.g. `$env:FABLE_RIPPLE='nuget'; npm run build` in
PowerShell).

## Known finding: Fable.Ripple clear is O(n²) in 1.0.0-beta.3

With the published Fable.Ripple `1.0.0-beta.3` / Dom `1.0.0-beta.2`, removing rows from `Html.each`
gets quadratically slower when every row observes the same source, as here:

Clear, script time, headless Chrome 154:

| Lines   | NuGet beta.3 | Fork, 1st commit | Fork, all 3 commits | Fork, grouped page | Solid | Ripple |
| ------- | ------------ | ---------------- | ------------------- | ------------------ | ----- | ------ |
| 1,000   | 11.7 ms      | 0.9 ms           | 0.5 ms              |                    |       |        |
| 10,000  | 1,666 ms     | 7.6 ms           | 5.0–5.7 ms          | 3.5 ms             | 2.8–3.4 ms | 2.5–2.9 ms |
| 20,000  | 6,628 ms     | 14.3 ms          | 9.5 ms              |                    |            |            |
| 50,000  | ~35 s        | 41 ms            | 27–37 ms            | 15–16 ms           | 16–22 ms   | 14–16 ms   |
| 100,000 | (minutes)    | 85 ms            | 48–53 ms            | 31 ms              | 29–33 ms   | 25–36 ms   |

Ranges are from separate runs on the same machine.

Cause: `Dom.keyedEach` disposes each row's scope separately, and each `Scope.tearDown` compacted the
shared source's whole observer list (`Graph.compactObservers`): one pass over up to 5 × N observers
for each of N rows. The single-pass compaction in `tearDown` only covered nodes within one scope, not
sibling row scopes. It affected **Clear**, shrinking the line count, and the untimed reset before
each **Create** sample; create, update and recolor were not affected.

The fork's fix (branch `perfClear`, 3 commits):

1. A teardown counts the dead entries it leaves in each source's observer list, and the list is
   swept only once they are half of it, which makes the total linear. Dead entries waiting for a
   sweep are skipped when observers are walked, and not counted by `Signal.observerCount`.
2. The sweep check runs once, when the outermost flush, batch or disposal ends. A list cleared in
   one flush leaves every entry of the shared source dead, so the source drops its list without a pass.
3. `Html.each` clears with one `textContent = ""` when its parent holds only its rows and anchor,
   instead of one `removeChild` per row.

The remaining gap between the two Fable.Ripple pages is the 5-vs-1 effects per line described above.

## Layout

```
shared/lines.ts      data model: generator, drift, per-line stroke, dash patterns, BenchApp contract
shared/measure.ts    timing, stats, DOM verification, the suite runner
shared/harness.ts    full-screen stage + control panel + window.__bench (used by all three pages)
shared/frameworks.ts names and versions (versions injected by vite.config.ts)
solid/               SolidJS page
ripple/              Ripple page (Stage.tsrx + a bridge so the harness can write tracked state)
fable/               Fable.Ripple page (App.fs; Interop.fs binds the shared TS harness)
fable-grouped/       the same app with one effect per line (only an index.html)
Fable.Ripple/        optional local clone of Fable.Ripple, used instead of NuGet when present
compare/ + index.html  compare page
```

`window.__bench` on each framework page exposes `run(config, onProgress)` and `check()`, so the suite
can also be driven from the console or an automation tool.

### Adding a framework

Write a page that implements `BenchApp` from [shared/lines.ts](shared/lines.ts): `mount(container, style)`,
plus `setData(Float64Array)` and `setStyle(style)`, which must commit the DOM before they return. Call
`startHarness(app)`. Then add its id to `FrameworkId` in [shared/lines.ts](shared/lines.ts), the page to
`FRAMEWORKS` in [shared/frameworks.ts](shared/frameworks.ts), and its version and `index.html` to
[vite.config.ts](vite.config.ts).
