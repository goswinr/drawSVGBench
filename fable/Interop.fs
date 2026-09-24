/// Bindings to the shared TypeScript harness (../shared), so the F# page is
/// timed by exactly the same code as the Solid and Ripple pages.
module Interop

open Fable.Core
open Browser.Types

/// Mirrors `LineStyle` in shared/lines.ts. An interface, so reads compile to
/// plain property access on the object the harness passes in.
type LineStyle =
    abstract colorMode: string
    abstract color: string
    abstract widthMode: string
    abstract width: float
    abstract opacity: float
    abstract linecap: string
    abstract dash: string
    abstract background: string

/// Mirrors `BenchApp` in shared/lines.ts. `setData` and `setStyle` must commit
/// the DOM before returning; Fable.Ripple flushes writes synchronously.
type IBenchApp =
    abstract id: string
    abstract mount: container: HTMLElement * style: LineStyle -> unit
    abstract setData: data: float[] -> unit
    abstract setStyle: style: LineStyle -> unit

/// Per-line stroke for a colour mode, or null in "uniform" mode.
[<ImportMember("../shared/lines.ts")>]
let lineStroke (mode: string) (data: float[]) (i: int) (count: int) : string = jsNative

/// Per-line stroke width for a width mode, or null in "uniform" mode.
[<ImportMember("../shared/lines.ts")>]
let lineWidth (mode: string) (i: int) : string = jsNative

[<ImportMember("../shared/lines.ts")>]
let dashArray (dash: string) (width: float) : string = jsNative

[<ImportMember("../shared/harness.ts")>]
let startHarness (app: IBenchApp) : unit = jsNative
