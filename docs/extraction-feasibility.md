# matsci-ui Crystal Viewer Extraction Notes

## Boundary

The crystal viewer surface in `matsci-ui` is extractable as a focused package
because its primary logic already lives under `src/components/crystal-toolkit/`.

The main non-viewer dependencies are limited to:

- `ButtonBar`
- `Enlargeable`
- `Tooltip`
- `ModalCloseButton`
- `Dropdown`
- `Input`
- `RangeSlider`
- `download`, `hooks`, and `text` utilities
- shared foundation/component CSS required by the toolbar, modal shell, input,
  dropdown, tooltip, and slider classes

## Included public surface

This project currently mirrors the existing `matsci-ui` crystal-toolkit entry:

- `CameraContextProvider`
- `CrystalToolkitScene`
- `CrystalToolkitAnimationScene`
- `Download`
- `PhononAnimationScene`
- `Scene`

## Remaining follow-up opportunities

1. Trim tests and story-only scene fixtures if package size becomes a concern.
2. Replace the copied support UI with package-local primitives to reduce CSS
   dependency on the Bulma-style foundation layer.
3. Decide whether `DynamicCrystalToolkitScene` should become part of the public
   API in a follow-up revision.
