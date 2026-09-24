# drawSVGBench: performance findings

Context for future work on this repo and on the Fable.Ripple fork. Measured 2026-09-23 and
2026-09-24 on the owner's Windows 11 machine (20 cores) in **headless Chrome 154**, using production
builds. No numbers have been checked in a headed browser yet. Re-measure before quoting them
anywhere else.

## Verdicts

1. **Create, update, recolor: no winner.** SolidJS 1.9.15, Ripple-TS 0.4.2 and Fable.Ripple are within
   about ±20% of each other from 1k to 100k lines. The ranking changes from run to run.
2. **Recolor is the browser's cost, not the framework's.** Render (style recalc for per-line
   `stroke`) is 74–80% of recolor time at 10k and more lines, for all frameworks.
3. **Published Fable.Ripple has an O(n²) teardown.** This was measured on 1.0.0-beta.3 / Dom
   1.0.0-beta.2. The later release 1.0.0-beta.4 / Dom 1.0.0-beta.3 (2026-09-23) doesn't touch
   `Internal/`, `ReactiveNode.fs` or `Dom.fs`, so it has the same bug (from reading the code; not
   measured). Clearing or shrinking an `Html.each` whose rows all observe one signal takes 1.7 s at
   10k rows and ~35 s at 50k. It is unusable beyond a few thousand such rows. Fixed on the fork
   branch `perfClear` (3 commits, below).
4. **After the fix, idiomatic Fable.Ripple is still ~1.5–2× slower on clear and ~1.3–1.5× on create
   at 50k–100k.** The cause is the binding style, not the reactive core: `svgAttr.custom` makes one
   effect per attribute, so 5 reactive nodes per `<line>`. Solid's and Ripple-TS's compilers emit 1.
5. **Fable.Ripple with one hand-written effect per line matches Solid and Ripple.** In the four-way
   run the geometric means are: grouped 1.08×, Ripple-TS 1.07×, Solid 1.14×, idiomatic Fable.Ripple
   1.27×.
6. **Fable.Ripple is competitive on update.** At 50k both Fable pages were at or near the fastest
   (see the tables). That is within noise of the others, so don't claim a win without more rounds.

## Setup

| Item | Value |
| --- | --- |
| SolidJS | 1.9.15, vite-plugin-solid 2.11.14 |
| Ripple-TS | 0.4.2 (0.4.7 was latest, but see the npm release-age note), @ripple-ts/vite-plugin 0.4.2 |
| Fable.Ripple | NuGet 1.0.0-beta.3, Dom 1.0.0-beta.2 (pinned in `fable/App.fsproj`), or the fork in `./Fable.Ripple` (preferred when present). beta.4 / Dom beta.3 is out but not benchmarked (see State). |
| Fable compiler | 5.17.2, Release build (`-c Release`) |
| Vite / TypeScript | 8.3.0 / 5.9.3 |
| Browser | headless Chrome 154 (`--headless=new`) via the DevTools Protocol, viewport 1600×900 (compare page runs at 1280×900) |

## What the numbers mean

- **Script**: the synchronous `setData`/`setStyle` call (reactive graph + DOM mutation), timed with
  `performance.now()`. Solid 1.x and Fable.Ripple flush synchronously. Ripple-TS is wrapped in `flushSync`.
- **Render**: main-thread style, layout and paint for the next frame, from that frame's rAF callback to
  the first task after it (`afterNextPaint` in `shared/measure.ts`). Excludes vsync wait and raster.
- New arrays are generated before the timer starts, and every sample starts from a settled frame.
- COOP/COEP headers (dev and preview) give `performance.now()` 5 µs resolution instead of 100 µs.
- After each op the DOM is checked: line count, exact coordinates and stroke on 5 lines. Every run
  here passed.
- Each op/line-count cell has a wall-clock budget, 20 s by default. **Setup counts toward it**:
  every Create sample begins with a clear, which is why NuGet Fable.Ripple's Create at 50k was cut
  to 1 sample.
- **Noise**: 5-iteration runs vary 10–30% between runs. For example, Solid clear at 50k measured
  16.4–22.4 ms, and grouped Fable create at 50k measured 155–187 ms script. Treat differences under
  ~20% as ties unless reproduced with more iterations or rounds.

## Results

### Four-way comparison: compare page, total ms (script + render), median

5 runs + 2 warmup, uniform colour, fork at `706f69d`.

| Op | Lines | Solid | Ripple-TS | Fable.Ripple | Fable.Ripple (grouped) |
| --- | --- | --- | --- | --- | --- |
| Create | 10k | 41.0 | 39.5 | 48.5 | **37.2** |
| Create | 50k | 234 | **225** | 235 | 281 |
| Update | 10k | **30.1** | 35.0 | 34.8 | 30.5 |
| Update | 50k | 229 | 187 | 177 | **163** |
| Recolor | 10k | 18.2 | 18.7 | **16.2** | 17.0 |
| Recolor | 50k | 94.2 | 90.1 | 88.6 | **86.1** |
| Clear | 10k | 3.28 | **2.96** | 6.18 | 3.90 |
| Clear | 50k | 19.6 | **14.8** | 27.3 | 16.2 |
| Geomean vs fastest | | 1.14× | 1.07× | 1.27× | 1.08× |

### Same-session head-to-head at large N: script ms, median

5 runs + 2 warmup, uniform colour. The grouped build was the one-effect-per-line experiment, now
`lineGrouped` in `fable/App.fs`.

| Op | Lines | Solid | Ripple-TS | Fable.Ripple (5 effects/line) | Fable.Ripple (1 effect/line) |
| --- | --- | --- | --- | --- | --- |
| Create | 50k | 147.0 | 200.7 | 211.7 | 155.0 |
| Create | 100k | 325.0 | 407.2 | 482.7 | 341.6 |
| Update | 50k | 138.0 | 159.4 | 145.6 | 125.8 |
| Update | 100k | 307.6 | 320.7 | 255.3 | 243.3 |
| Clear | 50k | 17.4 | 16.0 | 37.4 | 15.9 |
| Clear | 100k | 28.8 | 35.5 | 48.9 | 30.8 |

Recolor from separate runs, script ms at 50k / 100k: Solid 32.3 / 83.0, Ripple-TS 27.4 / 63.1, Fable.Ripple
(fork, 5 effects) 18.2 / 43.8. Render adds 68–184 ms on top for all three.

### Clear across Fable.Ripple versions: script ms

| Lines | NuGet beta.3 | Fork `ee78536` | Fork `706f69d` (all 3) | Grouped page | Solid | Ripple-TS |
| --- | --- | --- | --- | --- | --- | --- |
| 1,000 | 11.7 | 0.9 | 0.5 | | | |
| 10,000 | 1,666 | 7.6 | 5.0–5.7 | 3.5 | 2.8–3.4 | 2.5–2.9 |
| 20,000 | 6,628 | 14.3 | 9.5 | | | |
| 50,000 | ~35,000 | 41 | 27–37 | 15–16 | 16–22 | 14–16 |
| 100,000 | minutes | 85 | 48–53 | 31 | 29–33 | 25–36 |

### Fork's own js-framework-benchmark scenarios (`bench/apps/fable-ripple`, 1k-row table)

Script-only, median of 27–57 interleaved samples:

| Build | create 1k | create 10k | clear 10k |
| --- | --- | --- | --- |
| original `b075c46` | 4.1–4.2 | 45.9–46.6 | 153–160 |
| `ee78536` | 4.2–4.3 | 47.9–48.1 | 22.9–24.0 |
| `706f69d` | 4.2–4.3 | 45.1–49.5 | 21.4–23.5 |

With frame waits included, append, update, swap, select, remove and clear-1k were unchanged within
noise. The harness's double rAF puts a ~30 ms floor under each op.

### CPU profile of a 50k clear (self time)

- Fable.Ripple after `ee78536`: `removeChild` 14.6 ms, Fable `item` (bounds-checked indexing)
  9.4 ms, `compactObservers` 6.1 ms.
- Fable.Ripple after `706f69d`: the single `textContent = ""` 11.4 ms, `compactObservers` 4.8 ms,
  `item` 4.7 ms.
- Solid: `cleanChildren` 9.5 ms, `cleanNode` 4.8 ms. Ripple-TS: `reconcile_fast_clear` 9.2 ms.

The DOM removal itself costs about the same in all three. What remains in Fable.Ripple is per-node
graph work, ×5 because of the per-attribute effects.

## The Fable.Ripple fork: bug and fixes

**Root cause (beta.3):** `Dom.keyedEach` disposes each row's scope separately. `Scope.tearDown` then
compacted each affected source's whole observer list (`Graph.compactObservers`). With N rows reading
one signal (5 × N observer entries here), that is N passes over a list of up to 5 × N entries.
`tearDown`'s single-pass compaction only covers nodes within one scope, not sibling scopes.

**Fix, branch `perfClear`** :

| Commit | Scope | Change |
| --- | --- | --- |
| `ee78536` | ripple | Count dead observer entries per source (`ReactiveNode.DeadObservers`); sweep a list only when half of it is dead. `Graph.iterObservers` skips `Disposed` nodes, and `Graph.observerCount` = list length − dead. Teardown drops `EffectFn` so a dead entry doesn't keep its closure or DOM alive. |
| `a2318ef` | ripple | `Graph.noteDeadObserver` queues the source (`Affected` marks queue membership). The sweep check runs when the last `holdSweeps` is released. `Scheduler.flush`, `Scheduler.batch` and `Scope.dispose` each hold, so a list cleared in one flush drops the shared source's list without a pass. Teardown sets `RestSources <- ValueNone`. `flush`'s `finally` resets `Queued` only from the unreached index on. |
| `706f69d` | ripple-dom | `keyedEach.removeAllRowNodes`: one `textContent = ""` when the parent holds only the rows plus the anchor, then re-appends the anchor. Before, `Html.each`'s anchor comment disabled that fast path, so rows were removed one by one. Used for clear and for full replace. |

**Invariants to keep when editing the fork:**

- Disposed nodes can stay in a source's observer list until swept. Any code that walks observers
  must go through `Graph.iterObservers`, or check `Disposed` itself.
- `DeadObservers` must count one per edge (a node that read a source twice is listed twice).

**Tests added:**

- `tests/Fable.Ripple/Signal.fs`: exact `observerCount` during partial disposal; disposed effects
  never re-run; 50k sibling-scope disposal is linear (7,412 ms on old code, 41–48 ms now); disposal
  inside a batch sweeps once.
- `tests/Fable.Ripple.Dom/Tests/Lists.fs`: a cleared or fully replaced list that owns its parent still
  places later rows inside it; clearing a list between siblings leaves the siblings. A mutation check
  (dropping the anchor re-append) makes the first test fail.

**Suites on the branch:** core 40, DOM 39, Form 31, UrlParser 116, all passing.

## Remaining costs and ideas not done

- **Per-attribute effects (the remaining gap).** Two options. Group by hand, as `lineGrouped` does
  with public `Apply` + `Signal.effect`. Or group per element inside Fable.Ripple.Dom, which is a design
  change: it gives up per-binding precision and needs upstream discussion. Not attempted.
- **Standalone effect disposal is still O(n) per call.** `Graph.dispose` (disposing a
  `Signal.effect` handle outside a scope) and `Graph.unlinkSourcesTail` (dynamic dependencies) still
  use `removeObserver`, a linear scan of the source's list. Disposing many standalone effects on one
  source one at a time is still O(n²). Scope teardown (lists, `dynamic`, `mount`) no longer goes
  through this path.
- **Bounds-checked indexing.** Fable compiles `arr.[i]` and `ResizeArray.[i]` to bounds-checked
  `item(i, arr)`. It showed 5–9 ms in a 50k clear, across library loops and the benchmark's bindings.
  `ResizeArray.Clear()` compiles to `splice(0)`.

## Framework notes and gotchas

**Solid 1.9**
- Signal writes are synchronous. The benchmark uses `createSignal(arr, { equals: false })`.
- `vite-plugin-solid` is limited to `solid/**/*.tsx` so it doesn't transform the other pages.

**Ripple-TS 0.4.2**
- Components are `.tsrx` files with `@{ … }` bodies and `@for (… ; key i)`.
- Writes are batched, so wrap them in `flushSync` for synchronous timing. Mount with
  `mount(C, { target, props, rootBoundary: false })`.
- `track(fn)` creates a derived. A function can't be a plain initial value.
- The compiler turns an element's dynamic attributes into one render function with `!==` checks.
- Without `ripple.config.ts` the Vite plugin is only a compiler. `excludeRippleExternalModules: true`
  skips its package scan.
- `tsc` can't read `.tsrx`, so `shared/env.d.ts` declares the module and the bridge type lives in
  `ripple/bridge.ts`.

**Fable.Ripple**
- `Var.create` uses structural equality, so writing a large array compares it element by element.
  Use `Var.createWith Signal.referenceEquals`. `Signal.mapWith Signal.referenceEquals` keeps the
  indices array from re-reconciling unless the count changes.
- Writes flush synchronously, and `Signal.batch` coalesces them.
- `svgAttr.custom (name, fun () -> …)` always calls `setAttribute`. To remove an attribute when the
  value is null, use a custom `Apply` + `Signal.effect` (see `optionalAttr` in `fable/App.fs`).
- `Html.mount` takes an element id.
- `Html.each` always inserts an anchor comment.
- A Debug build enables HMR node tracking (`#if DEBUG`), so always measure a Release build.

## Environment gotchas (this machine)

- npm enforces a ~7-day minimum release age, so the newest installable versions are about a week
  old. Ripple-TS is pinned to 0.4.2 for that reason.
- No Python. Script with Node or PowerShell.
- `core.autocrlf` prints LF→CRLF warnings on commit. They are harmless.
- The fork has its own repo-local git identity, different from this repo's.
- **Fork tests** run with `./build.bat test ripple|ripple-dom|ripple-form|url-parser|all`.
  - DOM tests need `npx playwright install --only-shell chromium`.
  - `ripple-dom-hmr` fails here on unmodified code too: its test folder has no `node_modules`, and
    `npx vite` stalls.
- **Fork hooks**: Fantomas formats staged `.fs` files, and `commit-linter` enforces Conventional
  Commits. Scopes used here: `ripple`, `ripple-dom`. The release tooling builds each package's
  changelog from the commit scope, so split commits per package.
- **The fork's `bench/harness/run.mjs` didn't run here.** It loads pages via `file://`, where module
  scripts are blocked. Its `fable-ripple` app also expects js-framework-benchmark button markup
  that the harness page lacks. Upstream has since stopped tracking `bench/` (commit `42fb4ed`), so
  the scenario table above can't be re-run from `main`.
- **Measuring**: pages were driven headless over CDP with Node's built-in `WebSocket`, calling
  `window.__bench.run(cfg)` and `window.__bench.check()`. CPU profiles came from
  `Profiler.start`/`stop`. Those helper scripts lived in a session scratchpad and are not in the repo.

## Reproduce

```sh
npm install && npm run bench          # opens the compare page
$env:FABLE_RIPPLE='nuget'; npm run build   # PowerShell: build against the NuGet packages instead of ./Fable.Ripple
```

In a framework page's console:

```js
await __bench.run({ counts: [50000], iterations: 5, warmup: 2, ops: ['create', 'update', 'recolor', 'clear'],
  style: { colorMode: 'uniform', color: '#58a6ff', width: 1, opacity: 0.75, linecap: 'round', dash: 'solid', background: '#0d1117' } });
__bench.check();
```

For the fork: clone it into `./Fable.Ripple` (gitignored) and check out `perfClear`.

## State when written (2026-09-24)

- `github.com/goswinr/drawSVGBench` (public): `main` includes the grouped entry, per-line widths,
  shorter lines and the publish-ready README. The demo is on GitHub Pages
  (<https://goswinr.github.io/drawSVGBench/>), served from the `gh-pages` branch that
  `npm run deploy` force-pushes.
- Fork at `./Fable.Ripple`: branch `perfClear` = `ee78536`, `a2318ef`, `706f69d`, `7c30aac` on
  `cafa35a`, pushed to `github.com/goswinr/Fable.Ripple`. `7c30aac` (clear internal arrays with
  `length = 0`) was first on a branch named `unchecked`, since renamed. The plan is a PR to
  `fable-hub/Fable.Ripple`; not opened yet.
- The fork's `main` is `cafa35a`, the beta.4 release, including `ff5d387` "feat!: replace SRTP signal
  parameters with a Signal interface". 
- `fable/App.fs` also uses `Signal.map`/`mapWith` and builds against the local fork branch.
