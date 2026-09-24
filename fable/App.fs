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
let private widthMode = Var.create "uniform"
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
        widthMode.Value <- s.widthMode
        width.Value <- s.width
        opacity.Value <- s.opacity
        linecap.Value <- s.linecap
        dash.Value <- s.dash
        background.Value <- s.background
    )

/// A reactive attribute that is removed while the callback returns
/// null/undefined (`svgAttr.custom` always sets it). A line carries its own
/// stroke and stroke-width only outside "uniform" mode.
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
            optionalAttr "stroke-width" (fun () -> lineWidth widthMode.Value i)
        ]

/// The same line with ONE effect for all six attributes: the shape the Solid
/// and Ripple compilers emit for an element with several dynamic attributes.
/// Every attribute is re-evaluated when any input changes, and written only
/// when its value changed.
let private lineGrouped (i: int) : DomItem =
    let o = i * 4

    Svg.line
        [
            Apply(fun element ->
                let mutable x1 = nan
                let mutable y1 = nan
                let mutable x2 = nan
                let mutable y2 = nan
                let mutable stroke = ""
                let mutable strokeWidth = ""

                Signal.effect (fun () ->
                    let d = data.Value

                    if d.[o] <> x1 then
                        x1 <- d.[o]
                        element.setAttribute ("x1", string x1)

                    if d.[o + 1] <> y1 then
                        y1 <- d.[o + 1]
                        element.setAttribute ("y1", string y1)

                    if d.[o + 2] <> x2 then
                        x2 <- d.[o + 2]
                        element.setAttribute ("x2", string x2)

                    if d.[o + 3] <> y2 then
                        y2 <- d.[o + 3]
                        element.setAttribute ("y2", string y2)

                    let s = lineStroke colorMode.Value d i count.Value

                    if s <> stroke then
                        stroke <- s

                        // `isNull` compiles to `== null`, which also catches the `undefined` from TypeScript.
                        if isNull s then
                            element.removeAttribute "stroke"
                        else
                            element.setAttribute ("stroke", s)

                    let w = lineWidth widthMode.Value i

                    if w <> strokeWidth then
                        strokeWidth <- w

                        if isNull w then
                            element.removeAttribute "stroke-width"
                        else
                            element.setAttribute ("stroke-width", w)
                )
                |> ignore
            )
        ]

/// `fable-grouped/index.html` loads this same app flagged to use `lineGrouped`.
let private grouped =
    Browser.Dom.document.documentElement.getAttribute "data-variant" = "grouped"

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

                    Html.each
                        (fun () -> indices.Value)
                        id
                        (if grouped then
                             lineGrouped
                         else
                             line)
                ]
        ]

// Fable.Ripple flushes a write before the assignment returns, so the DOM is
// updated when setData / setStyle return.
startHarness
    { new IBenchApp with
        member _.id =
            if grouped then
                "fable-grouped"
            else
                "fable"

        member _.mount(container, style) =
            applyStyle style
            Html.mount container.id view |> ignore

        member _.setData d = data.Value <- d
        member _.setStyle s = applyStyle s
    }
