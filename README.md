# matsci-crystal-viewer-kit

[English](./README.md) | [中文](./README.zh-CN.md)

`@gnosys/matsci-crystal-viewer-kit` is a React and Three.js toolkit for interactive crystal structure visualization. It provides a complete 3D viewer runtime, a toolbar, extensible settings and legend panel slots, image capture, and scene export for materials applications.

## GitHub Overview

`matsci-crystal-viewer-kit` is a reusable crystal structure viewer toolkit designed for production materials-science applications. It provides a data-driven 3D viewer shell built with React and Three.js, including rendering, interaction, export, lifecycle management, and host-side customization hooks.

Contributions are welcome, especially for bug fixes, documentation improvements, accessibility, and internationalization.

## Package Availability

The package is currently published to the team's private npm registry for internal projects. The current published version is `0.2.1`.

```bash
pnpm add @gnosys/matsci-crystal-viewer-kit@0.2.1 --save-exact
```

It is a focused visualization capability package, not a page-level application component collection. It can be understood as:

- a data-driven 3D rendering runtime that accepts `Scene JSON`
- a publishable and reusable crystal structure viewer shell
- an engineering-oriented component library with lifecycle, performance, and visual presentation maintenance

For integration, start with [Quick Start](#quick-start) and [Common Props](#common-props). For maintenance or extension work, review [Architecture](#architecture), [Runtime Flow](#runtime-flow), and [Performance Design](#performance-design-and-maintained-optimizations).

## Contents

1. [Project Scope](#project-scope)
2. [Origin and Acknowledgements](#origin-and-acknowledgements)
3. [Core Features](#core-features)
4. [Why This Package Exists](#why-this-package-exists)
5. [Installation](#installation)
6. [Public Exports](#public-exports)
7. [Quick Start](#quick-start)
8. [Common Props](#common-props)
9. [Scene JSON Input Model](#scene-json-input-model)
10. [Architecture](#architecture)
11. [Runtime Flow](#runtime-flow)
12. [Performance Design and Maintained Optimizations](#performance-design-and-maintained-optimizations)
13. [Interaction and Presentation](#interaction-and-presentation)
14. [Styling and Host Overrides](#styling-and-host-overrides)
15. [Export Capabilities](#export-capabilities)
16. [Host Integration Guidance](#host-integration-guidance)
17. [Development Commands](#development-commands)
18. [Release](#release)
19. [Contributing](#contributing)
20. [License](#license)

## Project Scope

`matsci-crystal-viewer-kit` is split from the crystal visualization capability of `matsci-ui (mp-react-components)`. Its responsibilities are intentionally focused:

- receive host-provided `Scene JSON`
- create and maintain an interactive Three.js scene in React
- provide a product-ready viewer shell rather than a bare canvas
- let hosts customize behavior through props, children, text overrides, and CSS overrides

The package is responsible for:

- rendering atoms, bonds, unit cells, arrows, polyhedra, surfaces, labels, and other 3D objects
- rotation, zoom, picking, selection highlighting, and camera reset behavior
- toolbar controls, fullscreen, image capture, scene export, settings panels, and legend panel slots
- static structure scenes, generic animation scenes, and phonon animation scenes

The package is not responsible for:

- material search pages or periodic-table UI
- backend requests, data caching, or authentication
- converting CIF files or upstream structure objects into `Scene JSON`
- domain-specific workflow orchestration in the host application

In short, the package provides a crystal viewer runtime and viewer shell, not a full materials platform frontend.

## Origin and Acknowledgements

This component library is split from [mp-react-components](https://github.com/materialsproject/mp-react-components), maintained by the Materials Project organization. It retains the core crystal visualization capability while organizing it as an independently publishable React and Three.js package that can be reused by multiple host products.

This project continues the work through:

- engineering modernization for current React, Three.js, and npm package workflows
- host integration support, CSS overrides, pluggable settings panels, and export hooks
- lifecycle and interaction performance work for high-frequency viewer operations
- maintenance fixes and regression coverage for rendering, resource disposal, panel interactions, and fullscreen behavior

We sincerely thank the Materials Project organization and the `mp-react-components` project for their foundational work and open-source contribution. The upstream project's own license, copyright notices, and usage terms remain governed by the latest notices in its repository.

## Core Features

- Data-driven rendering with host- or backend-generated `Scene JSON`
- Support for `spheres`, `cylinders`, `lines`, `arrows`, `convex`, `surface`, `labels`, `ellipsoids`, and `bezier` objects
- Static scenes, slider-driven animation scenes, playback animation scenes, and phonon animation scenes
- Object picking, single and multiple selection, outline highlighting, tooltips, and inset-view coordination
- Image capture, scene export, and host-defined export menu items
- Pluggable settings and legend panels through `children`
- Package-local CSS, without a Less build requirement
- Long-term npm package delivery for host applications

## Why This Package Exists

The package is separated not merely because it can render a 3D scene, but because it has clear engineering boundaries:

- **Complete lifecycle:** initialization, mounting, resize synchronization, disposal, fullscreen transitions, and animation switching are managed as explicit paths.
- **Focused performance paths:** fullscreen does not reconstruct the `Scene`; resize work is centralized; outline work is dirty-driven; avoidable per-frame viewport configuration is removed.
- **Modular runtime:** interaction, hit testing, selection, highlighting, camera framing, and controls are separated into focused modules.
- **Host-friendly extension:** styling, text, children slots, and export flow are designed to be overridden or extended without forking the viewer runtime.

This makes the package a reusable foundation for crystal-structure visualization rather than a 3D component coupled to one page.

## Installation

If the private registry is configured for the host project:

```bash
pnpm add @gnosys/matsci-crystal-viewer-kit
```

Peer dependencies:

- `react >=18 <20`
- `react-dom >=18 <20`
- `three ^0.163.0`

The host owns these dependencies so that one React and Three.js runtime is shared, avoiding incompatible instances and unnecessary bundle duplication.

Import the package stylesheet:

```ts
import '@gnosys/matsci-crystal-viewer-kit/style.css';
```

## Public Exports

The root entry point, [src/index.ts](./src/index.ts), exports:

- `CameraContextProvider`
- `CrystalToolkitAnimationScene`
- `CrystalToolkitScene`
- `Download`
- `PhononAnimationScene`
- `Scene`

Most host applications use `CrystalToolkitScene`, `CrystalToolkitAnimationScene`, or `PhononAnimationScene`. `Scene` is the lower-level runtime class for advanced customization.

## Quick Start

```tsx
import {
  CameraContextProvider,
  CrystalToolkitScene,
} from '@gnosys/matsci-crystal-viewer-kit';
import '@gnosys/matsci-crystal-viewer-kit/style.css';

type ViewerProps = {
  sceneJson: unknown;
};

export function StructureViewer({ sceneJson }: ViewerProps) {
  return (
    <CameraContextProvider>
      <CrystalToolkitScene
        data={sceneJson}
        sceneSize={480}
        settings={{
          renderer: 'webgl',
          background: '#ffffff',
          staticScene: true,
          antialias: true,
          defaultZoom: 1,
          secondaryObjectView: true,
        }}
        toggleVisibility={{}}
        showControls
        showExpandButton
        showImageButton
        showExportButton
        showPositionButton
      />
    </CameraContextProvider>
  );
}
```

`CameraContextProvider` is optional. Without it, the component falls back to its internal reducer for camera state.

## Common Props

### Rendering

- `data`: the `Scene JSON` structure to render
- `settings`: scene runtime configuration, including `renderer`, `background`, `transparentBackground`, `antialias`, `staticScene`, `defaultZoom`, `zoomToFit2D`, `extractAxis`, `sphereSegments`, and `cylinderSegments`
- `sceneSize`: canvas size, as a number or CSS size string
- `toggleVisibility`: controls object-group visibility, such as atoms, bonds, unit cells, or polyhedra

### Interaction and View

- `showControls`: shows the viewer toolbar
- `showExpandButton`: shows fullscreen control
- `showImageButton`: shows image capture control
- `showExportButton`: shows scene export control
- `showPositionButton`: shows reset-camera control
- `animation`: selects `play`, `none`, or `slider` animation behavior

### Export and Events

- `imageRequest`: host trigger for image or scene export
- `imageType`: requested image export type
- `fileOptions`: export menu entries
- `onObjectClicked`: object selection callback

### Panels and Text

- `children`: the first child is mounted in the settings panel; the second child is mounted in the legend panel
- `texts`: overrides toolbar tooltips and export menu labels
- `className`: adds a viewer root class for host styling

## Scene JSON Input Model

The viewer consumes a JSON-friendly scene graph. The scene payload is intended to be generated by a host application or backend service and passed to the viewer without tying the runtime to CIF parsing or a particular materials database.

```ts
type SceneJson = {
  name?: string;
  contents: SceneObject[];
};

type SceneObject = {
  type: string;
  position?: [number, number, number];
  color?: string;
  visible?: boolean;
  selectable?: boolean;
  tooltip?: string;
  [key: string]: unknown;
};
```

The concrete schema is defined by the runtime builders. Keep expensive parsing, format conversion, and request caching outside the viewer package.

## Architecture

### 1. React Component Layer

- `CrystalToolkitScene`: static crystal scene entry
- `CrystalToolkitAnimationScene`: generic animation scene entry
- `PhononAnimationScene`: phonon animation scene entry
- `CameraContextProvider`: optional shared camera state
- `SceneToolbar`: fullscreen, settings, reset, image capture, and export controls

### 2. Shared Glue Layer

`sceneComponentShared.ts` centralizes shared scene lifecycle, camera synchronization, settings-panel dismissal behavior, and child-panel extraction. This prevents three viewer entry points from drifting in lifecycle behavior.

### 3. Scene Runtime Layer

`Scene.ts` owns the Three.js runtime. It coordinates scene construction, rendering, selection, animation, resizing, controls, export, and disposal boundaries.

### 4. Focused Scene Modules

- `scene-graph`: builds and replaces scene content
- `scene-controls`: user camera controls
- `scene-hit-test`: raycasting and pointer-space preparation
- `scene-interaction`: hover, click, cursor, and tooltip dispatch
- `selection-controller`: selection and outline state
- `scene-object-registry`: object and interaction indexes
- `scene-camera`: framing and camera application
- `sceneExport`: image and scene export requests

### 5. Three Object Construction and Animation

The builders construct and update spheres, cylinders, lines, arrows, surfaces, labels, and animation data. The goal is to keep Three.js resource ownership explicit during object replacement and disposal.

## Runtime Flow

1. The host generates or fetches `Scene JSON`.
2. A React viewer component initializes its runtime through the shared lifecycle path.
3. The runtime attaches a renderer, controls, scene graph, and optional inset view to the mount node.
4. Changes to `data` call the scene graph build path.
5. The runtime creates or updates Three.js objects.
6. Interactive objects, tooltip targets, and outline targets are registered in the object registry.
7. The render loop draws the main scene, labels, outline, and optional inset view.
8. Updates and teardown cancel pending work, detach listeners, dispose owned resources, and release renderer-related objects.

## Performance Design and Maintained Optimizations

The package applies focused optimizations where they reduce repeated work without reducing visual fidelity.

### Fullscreen Reattachment Instead of Runtime Reconstruction

Fullscreen changes reattach the existing canvas and CSS2D nodes to the new mount node. The `Scene`, renderer, controls, and current viewer state remain alive, avoiding unnecessary GPU reallocation and visual flicker.

### ResizeObserver-Based Sizing

Sizing is driven by `ResizeObserver` rather than scattered window resize paths. Size updates are coalesced and applied to the camera and renderer together.

### Cached Viewport State

The main viewport and scissor state are cached to prevent redundant state setup during stable rendering. Inset rendering restores the primary rendering state explicitly.

### Dirty-Driven Outline Updates

Selection outline work is performed only when selection or visibility changes. A static camera and static selection do not cause unnecessary outline recomputation.

### Visibility and Selection Consistency

Visibility toggles remove selections that are no longer renderable and mark the outline state dirty. This keeps selection, outline, inset rendering, and visibility in sync.

### High-Frequency Interaction Scheduling

Pointer movement stores the latest coordinates and processes hit testing at most once per animation frame. Scratch vectors and candidate registries reduce transient allocation and duplicate raycast paths.

### Resource Ownership and Disposal

Shared Three.js resources are marked separately from scene-owned resources. On replacement or teardown, the runtime releases owned geometries, materials, listeners, timers, animation frames, controls, and renderer resources without disposing shared objects too early.

### Benchmarking Policy

The repository includes repeatable benchmark scripts for large static scenes, high-frequency hover input, and repeated scene replacement. Reports record a protocol fingerprint and retain raw JSON for audit and regression work. Results should be compared only when old and current implementations use the same benchmark contract and runtime conditions.

## Interaction and Presentation

### Toolbar

The standard toolbar exposes fullscreen, settings, reset camera, image capture, and export actions. Tooltip text is customizable through `texts`.

### Selection and Highlighting

Objects can be selectable, clickable, and tooltip-enabled. The runtime keeps an interactive registry so one hit-test result can serve selection, tooltip, and cursor decisions.

### Animation

Static, slider, playback, and phonon animation paths share lifecycle and camera behavior where possible. Animation-specific state remains isolated from the static scene path.

### Settings Panels and Portaled Select Menus

The settings panel is a host slot. It supports portaled select menus without treating a menu selection or an in-panel menu dismissal as a viewer panel click-away. A click outside the panel closes the panel; a click inside it only dismisses the relevant select menu when appropriate.

### Export

Image capture and scene export requests can originate from the toolbar or from host-controlled props. File names and available export entries remain host-configurable.

## Styling and Host Overrides

The package exposes CSS from `@gnosys/matsci-crystal-viewer-kit/style.css`. Host applications can apply scoped overrides to match their product themes and layout rules.

Recommended host responsibilities:

- keep the viewer in a stable-size container
- load the package stylesheet once
- scope color, toolbar, settings-panel, and fullscreen overrides under the host viewer root
- keep host-specific labels and forms in the host application instead of modifying the viewer runtime

## Export Capabilities

### Viewer-Level Export

- image capture through the renderer
- scene file export through configured file options
- host-triggered export through external request props

### Host-Level Export

The host should own domain-specific exports, backend artifact URLs, permission checks, audit records, and download lifecycle UI.

## Host Integration Guidance

### Generate Scene JSON Upstream

Keep CIF conversion, structure normalization, and expensive domain calculation in the host application or backend. The viewer should receive a rendering-ready scene payload.

### Lazy-Load the Viewer When It Is Not Needed Immediately

Because Three.js is a heavyweight dependency, hosts should use `lazy`, `Suspense`, and an error boundary when the viewer is below the initial viewport or behind a detail dialog.

### Deduplicate React and Three.js

Use the declared peer dependencies. Do not bundle a second React, React DOM, or Three.js instance into the host application.

### Keep Dense Business Configuration in the Host

The viewer exposes slots and callbacks. Product-specific forms, records, permissions, long-running status, and data fetching should remain outside the package.

## Development Commands

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm storybook
pnpm build-storybook
pnpm release:pack
```

- `build` cleans `dist`, runs Rollup, and prepares style artifacts.
- `storybook` starts the standalone component demonstration surface for screenshot and regression checks.
- `build-storybook` produces a static demonstration site.
- `prepack` is configured, so `npm pack` and `npm publish` build the package automatically.

### Storybook and Structure Fixtures

The repository contains a minimal Storybook surface with package-level `simple-scene` fixtures and local static `Scene JSON` fixtures for real structures. The stories are offline and do not depend on runtime service requests, tokens, proxies, or a structure-service endpoint.

## Release

Common commands:

```bash
pnpm release:prepare patch
pnpm release:prepare 0.2.2 --notes "Describe the release"
pnpm release:publish
pnpm release minor --notes-file ./release-notes.md
```

The release script updates the version, writes `CHANGELOG.md`, runs build and pre-publish checks, and publishes to the configured registry. See [package.json](./package.json) for the active registry configuration.

## Contributing

Useful contribution areas include:

- bug fixes
- documentation improvements
- example and fixture additions
- accessibility and interaction details
- internationalization support

For behavior changes with broad compatibility impact, open an issue first to describe the goal, constraints, and migration considerations.

## License

This project is released under the [MIT License](./LICENSE).
