module App

open Fable.Ripple
open Fable.Ripple.Dom
open Interop

// One source holds the whole float array (a Float64Array at runtime).
// Reference equality: every update is a new array, and the default structural
// compare would walk all of it on each write.
let private data = Var.createWith Signal.referenceEquals ([||]: float[])

// One source per style field, so a width change does not wake the per-line bindings.
let private colorMode = Var.create "uniform"
let private color = Var.create ""
let private width = Var.create 1.0
let private opacity = Var.create 1.0
let private linecap = Var.create "butt"
let private dash = Var.create "solid"
let private background = Var.create ""

let private count = Signal.map (fun (d: float[]) -> d.Length / 4) data

// Only re-created when the line count changes; a same-size update leaves Html.each alone.
let private indices =
    Signal.mapWith Signal.referenceEquals (fun n -> Array.init n id) count

let private applyStyle (s: LineStyle) =
    Signal.batch (fun () ->
        colorMode.Value <- s.colorMode
        color.Value <- s.color
        width.Value <- s.width
        opacity.Value <- s.opacity
        linecap.Value <- s.linecap
        dash.Value <- s.dash
        background.Value <- s.background
    )

/// A reactive attribute that is removed while the callback returns
/// null/undefined (`svgAttr.custom` always sets it). A line carries its own
/// stroke only outside "uniform" mode.
let private optionalAttr (name: string) (value: unit -> string) : DomItem =
    Apply(fun element ->
        Signal.effect (fun () ->
            let v = value ()

            // `isNull` compiles to `== null`, which also catches the `undefined` from TypeScript.
            if isNull v then
                element.removeAttribute name
            else
                element.setAttribute (name, v)
        )
        |> ignore
    )

let private line (i: int) : DomItem =
    let o = i * 4

    Svg.line
        [
            svgAttr.custom ("x1", fun () -> string data.Value.[o])
            svgAttr.custom ("y1", fun () -> string data.Value.[o + 1])
            svgAttr.custom ("x2", fun () -> string data.Value.[o + 2])
            svgAttr.custom ("y2", fun () -> string data.Value.[o + 3])
            optionalAttr "stroke" (fun () -> lineStroke colorMode.Value data.Value i count.Value)
        ]

let private view () =
    Svg.svg
        [
            svgAttr.width "100%"
            svgAttr.height "100%"
            attr.style (fun () -> "background:" + background.Value)

            Svg.g
                [
                    svgAttr.fill "none"
                    svgAttr.custom ("stroke", fun () -> color.Value)
                    svgAttr.custom ("stroke-width", fun () -> string width.Value)
                    svgAttr.custom ("stroke-opacity", fun () -> string opacity.Value)
                    svgAttr.custom ("stroke-linecap", fun () -> linecap.Value)
                    svgAttr.custom ("stroke-dasharray", fun () -> dashArray dash.Value width.Value)

                    Html.each (fun () -> indices.Value) id line
                ]
        ]

// Fable.Ripple flushes a write before the assignment returns, so the DOM is
// updated when setData / setStyle return.
startHarness
    { new IBenchApp with
        member _.id = "fable"

        member _.mount(container, style) =
            applyStyle style
            Html.mount container.id view |> ignore

        member _.setData d = data.Value <- d
        member _.setStyle s = applyStyle s
    }
