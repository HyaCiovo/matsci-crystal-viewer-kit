import * as THREE from 'three';
import { Object3D, Quaternion, Vector3, WebGLRenderer } from 'three';
import { CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { SVGRenderer } from 'three/examples/jsm/renderers/SVGRenderer.js';
import {
  AnimationStyle,
  CameraAxis,
  Control,
  defaults,
  Renderer,
  ThreePosition
} from './constants';
import { createTooltipController, type TooltipController } from './tooltip-helper';
import { createInsetController, type InsetController, ScenePosition } from './inset-helper';
import { getSceneWithBackground, ThreeBuilder } from './three_builder';
import { createDebugController, type DebugController } from './debug-helper';
import { disposeSceneHierarchy } from '../utils';
import { OutlineEffect } from 'three/examples/jsm/effects/OutlineEffect.js';
import { SceneJsonObject } from './scene-types';
import { createAnimationController, type AnimationController } from './animation-helper';
import { createPhononAnimationController } from './phonon-animation-helper';
import {
  createSceneControlsController,
  type SceneControls,
  type SceneControlsController
} from './scene-controls';
import {
  createSelectionController,
  type SelectionController,
  type SelectionPersistence
} from './selection-controller';
import { buildSceneGraph } from './scene-graph';
import {
  applyOrthographicCameraFrame,
  calculateCameraFrame,
  applyOrthographicCameraAspect,
  createOrthographicCamera
} from './scene-camera';
import {
  createSceneInteractionController,
  type SceneInteractionController,
  type SceneInteractionReference
} from './scene-interaction';
import {
  createSceneObjectRegistry,
  type SceneObjectRegistry
} from './scene-object-registry';
import { createSceneHitTester, type SceneHitTester } from './scene-hit-test';
import { CameraState } from '../CameraContextProvider/camera-reducer';

type SceneJsonLike = SceneJsonObject & Record<string, any>;
type SceneSettings = typeof defaults & Record<string, any>;
type VisibilityMap = Record<string, boolean>;
type SceneClickReference = SceneInteractionReference<SceneJsonLike>;
type SceneSize = { width: number; height: number };
export default class Scene {
  // THREE.Color already resolves CSS hex colors into the renderer's working color space.
  private static readonly SELECTION_OUTLINE_COLOR: [number, number, number] = [
    0.0021246888847058823,
    0.030713443727452196,
    0.1912016827303171
  ];
  private destroyed = false;
  private controlsInitTimer: ReturnType<typeof setTimeout> | null = null;
  private settings: SceneSettings;
  private renderer!: THREE.WebGLRenderer | SVGRenderer;
  private labelRenderer!: CSS2DRenderer;
  public scene!: THREE.Scene; // expose getter instead
  private cachedMountNodeSize!: SceneSize;
  private camera!: THREE.OrthographicCamera;
  private cameraBaseHalfExtent = 100;
  private cameraState?: CameraState;
  private frameId?: number;
  private controls: SceneControls | null = null;
  private controlsController: SceneControlsController | null = null;
  private interactionController: SceneInteractionController | null = null;
  private objectRegistry: SceneObjectRegistry<SceneJsonLike> = createSceneObjectRegistry();
  private hitTester: SceneHitTester<SceneJsonLike>;
  private tooltipHelper: TooltipController = createTooltipController();
  private axis!: Object3D;
  private axisJson: SceneJsonLike | null = null;
  private inset!: InsetController;
  private inletPosition!: ScenePosition;
  private objectBuilder: ThreeBuilder;
  private clickCallback: (objects: SceneJsonLike[]) => void;
  private debugHelper: DebugController | null = null;
  private readonly raycaster = new THREE.Raycaster();

  private outline!: OutlineEffect;
  private outlineScene = new THREE.Scene();
  private selectionController: SelectionController<SceneJsonLike>;

  private threeUUIDTojsonObject: Record<string, SceneJsonLike> = {};
  private computeIdToThree: { [id: string]: THREE.Object3D } = {};
  private objectNameIndex = new Map<string, THREE.Object3D>();

  // handle multiSelection via shift key
  private isMultiSelectionEnabled = false;
  private animationHelper: AnimationController;
  private outlineDirty = false;
  private mainViewportConfigured = false;
  private resizeFrameId?: number;
  private screenSelectionLayer: HTMLDivElement | null = null;
  private screenSelectionIndicators = new Map<string, HTMLDivElement>();

  private cacheMountBBox(mountNode: Element) {
    this.cachedMountNodeSize = { width: mountNode.clientWidth, height: mountNode.clientHeight };
  }

  private getCachedMountBBox() {
    return this.cachedMountNodeSize;
  }

  private getRendererPixelRatio(width: number, height: number) {
    const devicePixelRatio = window.devicePixelRatio || 1;
    const maxPixelRatio =
      typeof this.settings.maxPixelRatio === 'number' && this.settings.maxPixelRatio > 0
        ? this.settings.maxPixelRatio
        : 2;
    const devicePixelRatioCap = Math.min(devicePixelRatio, maxPixelRatio);

    if (
      !this.settings.adaptivePixelRatio ||
      width <= 0 ||
      height <= 0 ||
      typeof this.settings.maxRenderPixels !== 'number' ||
      this.settings.maxRenderPixels <= 0
    ) {
      return devicePixelRatioCap;
    }

    const viewportPixelRatio = Math.sqrt(this.settings.maxRenderPixels / (width * height));
    return Math.min(devicePixelRatioCap, Math.max(0.75, viewportPixelRatio));
  }

  private syncRendererPixelRatio(renderer: WebGLRenderer, width: number, height: number) {
    const nextPixelRatio = this.getRendererPixelRatio(width, height);
    if (Math.abs(renderer.getPixelRatio() - nextPixelRatio) < 0.01) {
      return false;
    }

    renderer.setPixelRatio(nextPixelRatio);
    return true;
  }

  private getRendererMountNode() {
    return this.renderer?.domElement?.parentElement ?? null;
  }

  private determineSceneRenderer() {
    switch (this.settings.renderer) {
      case Renderer.WEBGL: {
        const renderer = new THREE.WebGLRenderer({
          antialias: this.settings.antialias,
          alpha: this.settings.transparentBackground
        });
        renderer.autoClear = false;
        const { width, height } = this.getCachedMountBBox();
        renderer.setPixelRatio(this.getRendererPixelRatio(width, height));
        (renderer as any).gammaFactor = 2.2;
        renderer.setClearColor(0xfffff, 0.0);
        return renderer;
      }
      case Renderer.SVG: {
        return new SVGRenderer();
      }
      default: {
        console.error('Invalid renderer passed', this.settings.renderer);
        return null;
      }
    }
  }

  private configureSceneRenderer(mountNode: Element) {
    const renderer = this.determineSceneRenderer();
    if (!renderer) {
      throw new Error('No renderer');
    }

    this.renderer = renderer;
    const { width, height } = this.getCachedMountBBox();
    if (renderer instanceof WebGLRenderer) {
      this.syncRendererPixelRatio(renderer, width, height);
    }
    this.renderer.setSize(width, height);
    this.mainViewportConfigured = false;
    if (this.renderer instanceof WebGLRenderer) {
      this.syncMainViewport(this.renderer, { width, height });
    }
    //TODO(chab) This should be simpler
    mountNode.appendChild(this.renderer.domElement);
  }

  private applyLabelRendererLayout(width: number, height: number) {
    this.labelRenderer.setSize(width, height);
    this.labelRenderer.domElement.style.position = 'relative';
    this.labelRenderer.domElement.style.top = `-${height}px`;
    this.labelRenderer.domElement.style.pointerEvents = 'none';
  }

  private configureLabelRenderer(mountNode: Element) {
    const labelRenderer = new CSS2DRenderer();
    this.labelRenderer = labelRenderer;
    const width = mountNode.clientWidth;
    const height = mountNode.clientHeight;
    this.applyLabelRendererLayout(width, height);
    mountNode.appendChild(labelRenderer.domElement);
  }

  private initializeSceneCore() {
    this.scene = getSceneWithBackground(this.settings);
    this.objectRegistry.reset();
    this.objectNameIndex.clear();
    this.camera = new THREE.OrthographicCamera(100, 100, 100, 100, 100);
    this.scene.add(this.objectBuilder.makeLights(this.settings.lights as any));
    this.scene.add(this.tooltipHelper.tooltip);
    this.scene.add(this.camera);
  }

  private attachInteractionListeners() {
    this.interactionController = createSceneInteractionController({
      tooltipController: this.tooltipHelper,
      renderer: this.renderer,
      domElement: this.renderer.domElement as HTMLElement,
      getClickableObjects: () => this.objectRegistry.getClickableObjects(),
      getInteractiveObjects: () => this.objectRegistry.getInteractiveObjects(),
      getClickedReference: (clientX, clientY, objectsToCheck) =>
        this.hitTester.getClickedReference(clientX, clientY, objectsToCheck),
      getIntersectedReferences: (clientX, clientY, objectsToCheck) =>
        this.hitTester.getIntersectedReferences(clientX, clientY, objectsToCheck),
      renderScene: () => this.renderScene(),
      onClickReference: (reference, event) => this.onClickImplementation(reference, event)
    });
    this.renderer.domElement.addEventListener('mousemove', this.interactionController.mouseMoveListener);
    this.renderer.domElement.addEventListener('click', this.interactionController.clickListener);
  }

  private scheduleControlsInitialization() {
    this.controlsInitTimer = setTimeout(() => {
      this.controlsInitTimer = null;
      this.configureControls();
    }, 0);
  }

  private configureScene() {
    if (this.destroyed || !this.renderer?.domElement) {
      return;
    }
    this.initializeSceneCore();
    this.attachInteractionListeners();
    this.scheduleControlsInitialization();
  }

  private configureControls() {
    if (this.destroyed || !this.renderer?.domElement) {
      return;
    }
    this.controlsController?.dispose();
    this.controlsController = createSceneControlsController({
      camera: this.camera,
      domElement: this.renderer.domElement as HTMLElement,
      controlType: this.settings.controls as Control,
      staticScene: this.settings.staticScene,
      animation: this.settings.animation as AnimationStyle,
      dispatchCamera: this.dispatch,
      flushCamera: this.flushCameraDispatch,
      renderScene: () => this.renderScene(),
      startAnimationLoop: () => this.start()
    });
    this.controls = this.controlsController.controls;
  }

  public getRenderer() {
    return this.renderer;
  }

  public getHoverPickingPasses() {
    return this.interactionController?.getHoverPickingPasses() ?? 0;
  }

  public attachToMountNode(mountNode: Element) {
    if (this.destroyed || !this.renderer?.domElement || !this.labelRenderer?.domElement) {
      return;
    }

    if (this.renderer.domElement.parentElement !== mountNode) {
      mountNode.appendChild(this.renderer.domElement);
    }
    if (this.labelRenderer.domElement.parentElement !== mountNode) {
      mountNode.appendChild(this.labelRenderer.domElement);
    }

    this.attachScreenSelectionLayer(mountNode);

    this.cacheMountBBox(mountNode);
    this.mainViewportConfigured = false;
    this.scheduleRendererResize();
  }

  private attachScreenSelectionLayer(mountNode: Element) {
    if (this.settings.selectionIndicator !== 'screen-box' || typeof document === 'undefined') {
      return;
    }

    if (!this.screenSelectionLayer) {
      this.screenSelectionLayer = document.createElement('div');
      this.screenSelectionLayer.className = 'ms-selection-indicator-layer';
      this.screenSelectionLayer.setAttribute('aria-hidden', 'true');
    }

    if (this.screenSelectionLayer.parentElement !== mountNode) {
      mountNode.appendChild(this.screenSelectionLayer);
    }
  }

  private clearScreenSelectionIndicators() {
    this.screenSelectionIndicators.forEach((indicator) => indicator.remove());
    this.screenSelectionIndicators.clear();
    if (this.screenSelectionLayer) {
      this.screenSelectionLayer.hidden = true;
    }
  }

  private getProjectedGeometryBounds(selectedObject: THREE.Object3D, width: number, height: number) {
    let meshCandidate: THREE.Mesh | null = null;
    selectedObject.traverse((object) => {
      if (
        !meshCandidate &&
        object instanceof THREE.Mesh &&
        object.geometry.getAttribute('position')
      ) {
        meshCandidate = object;
      }
    });

    if (!meshCandidate) {
      return null;
    }

    const mesh = meshCandidate as THREE.Mesh;
    const positionAttribute = mesh.geometry.getAttribute('position');
    if (!positionAttribute || positionAttribute.count === 0) {
      return null;
    }

    const worldMatrix = mesh.matrixWorld.clone();
    if (mesh instanceof THREE.InstancedMesh) {
      if (mesh.count === 0) {
        return null;
      }

      const instanceMatrix = new THREE.Matrix4();
      mesh.getMatrixAt(0, instanceMatrix);
      worldMatrix.multiply(instanceMatrix);
    }

    const projectedPoint = new THREE.Vector3();
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    for (let index = 0; index < positionAttribute.count; index += 1) {
      projectedPoint.fromBufferAttribute(positionAttribute, index).applyMatrix4(worldMatrix);
      projectedPoint.project(this.camera);

      if (
        !Number.isFinite(projectedPoint.x) ||
        !Number.isFinite(projectedPoint.y) ||
        !Number.isFinite(projectedPoint.z)
      ) {
        continue;
      }

      const screenX = ((projectedPoint.x + 1) / 2) * width;
      const screenY = ((1 - projectedPoint.y) / 2) * height;
      minX = Math.min(minX, screenX);
      maxX = Math.max(maxX, screenX);
      minY = Math.min(minY, screenY);
      maxY = Math.max(maxY, screenY);
    }

    if (![minX, maxX, minY, maxY].every(Number.isFinite)) {
      return null;
    }

    return { minX, maxX, minY, maxY };
  }

  private updateScreenSelectionIndicators() {
    if (
      this.settings.selectionIndicator !== 'screen-box' ||
      !this.screenSelectionLayer ||
      !this.camera
    ) {
      return;
    }

    const selectionLayer = this.screenSelectionLayer;
    const selectedObjects = this.selectionController.getOutlineChildren();
    if (selectedObjects.length === 0) {
      this.clearScreenSelectionIndicators();
      return;
    }

    const { width, height } = this.getCachedMountBBox();
    if (width <= 0 || height <= 0) {
      this.clearScreenSelectionIndicators();
      return;
    }

    this.outlineScene.updateMatrixWorld(true);
    selectionLayer.hidden = false;
    const activeKeys = new Set<string>();

    selectedObjects.forEach((selectedObject, index) => {
      const key = `${selectedObject.uuid}:${index}`;
      activeKeys.add(key);
      const jsonObject = this.threeUUIDTojsonObject[selectedObject.uuid];
      const indicator =
        this.screenSelectionIndicators.get(key) ?? document.createElement('div');
      indicator.className = 'ms-selection-indicator';
      const isSphere = jsonObject?.type === 'spheres';
      indicator.dataset.shape = isSphere ? 'circle' : 'box';

      const projectedGeometryBounds = this.getProjectedGeometryBounds(selectedObject, width, height);
      if (projectedGeometryBounds) {
        const geometryWidth = projectedGeometryBounds.maxX - projectedGeometryBounds.minX;
        const geometryHeight = projectedGeometryBounds.maxY - projectedGeometryBounds.minY;
        const padding = isSphere ? 2 : 6;
        const indicatorWidth = Math.min(
          width,
          Math.max(18, (isSphere ? Math.max(geometryWidth, geometryHeight) : geometryWidth) + padding * 2)
        );
        const indicatorHeight = Math.min(
          height,
          Math.max(18, (isSphere ? Math.max(geometryWidth, geometryHeight) : geometryHeight) + padding * 2)
        );
        const centerX = (projectedGeometryBounds.minX + projectedGeometryBounds.maxX) / 2;
        const centerY = (projectedGeometryBounds.minY + projectedGeometryBounds.maxY) / 2;
        const left = centerX - indicatorWidth / 2;
        const top = centerY - indicatorHeight / 2;
        const visible =
          left < width && left + indicatorWidth > 0 && top < height && top + indicatorHeight > 0;

        indicator.hidden = !visible;
        indicator.style.width = `${indicatorWidth}px`;
        indicator.style.height = `${indicatorHeight}px`;
        indicator.style.transform = `translate3d(${left}px, ${top}px, 0)`;
        selectionLayer.appendChild(indicator);
        this.screenSelectionIndicators.set(key, indicator);
        return;
      }

      const bounds = new THREE.Box3().setFromObject(selectedObject);
      if (bounds.isEmpty()) {
        indicator.hidden = true;
        selectionLayer.appendChild(indicator);
        this.screenSelectionIndicators.set(key, indicator);
        return;
      }

      const corners = [
        new THREE.Vector3(bounds.min.x, bounds.min.y, bounds.min.z),
        new THREE.Vector3(bounds.min.x, bounds.min.y, bounds.max.z),
        new THREE.Vector3(bounds.min.x, bounds.max.y, bounds.min.z),
        new THREE.Vector3(bounds.min.x, bounds.max.y, bounds.max.z),
        new THREE.Vector3(bounds.max.x, bounds.min.y, bounds.min.z),
        new THREE.Vector3(bounds.max.x, bounds.min.y, bounds.max.z),
        new THREE.Vector3(bounds.max.x, bounds.max.y, bounds.min.z),
        new THREE.Vector3(bounds.max.x, bounds.max.y, bounds.max.z)
      ];
      const projected = corners.map((corner) => corner.project(this.camera));
      const minX = Math.min(...projected.map((point) => ((point.x + 1) / 2) * width));
      const maxX = Math.max(...projected.map((point) => ((point.x + 1) / 2) * width));
      const minY = Math.min(...projected.map((point) => ((1 - point.y) / 2) * height));
      const maxY = Math.max(...projected.map((point) => ((1 - point.y) / 2) * height));
      const padding = jsonObject?.type === 'spheres' ? 2 : 6;
      const indicatorWidth = Math.min(width, Math.max(18, maxX - minX + padding * 2));
      const indicatorHeight = Math.min(height, Math.max(18, maxY - minY + padding * 2));
      const left = minX - padding;
      const top = minY - padding;
      const visible =
        left < width && left + indicatorWidth > 0 && top < height && top + indicatorHeight > 0;

      indicator.hidden = !visible;
      indicator.style.width = `${indicatorWidth}px`;
      indicator.style.height = `${indicatorHeight}px`;
      indicator.style.transform = `translate3d(${left}px, ${top}px, 0)`;
      selectionLayer.appendChild(indicator);
      this.screenSelectionIndicators.set(key, indicator);
    });

    this.screenSelectionIndicators.forEach((indicator, key) => {
      if (!activeKeys.has(key)) {
        indicator.remove();
        this.screenSelectionIndicators.delete(key);
      }
    });
  }

  public updateCamera(position: Vector3, rotation?: Quaternion, zoom?: number) {
    this.camera.position.copy(position);
    if (zoom) {
      this.camera.zoom = zoom;
    }
    if (rotation) {
      this.camera.quaternion.copy(rotation);
    } else {
      this.camera.lookAt(this.scene.position);
    }
    this.camera.updateProjectionMatrix(); // needed for the zoom
    this.renderScene();
  }

  private onClickImplementation(p: SceneClickReference, e: MouseEvent) {
    let needRedraw = false;
    if (p && p.object) {
      const { object } = p;
      if (object?.sceneObject) {
        needRedraw = this.selectionController.applySelection(
          {
            sceneObject: object.sceneObject as Object3D,
            jsonObject: object.jsonObject as SceneJsonLike,
            instanceId:
              this.settings.selectionMode === 'instance' ? object.instanceId : undefined
          },
          {
            multiSelectEnabled: this.isMultiSelectionEnabled,
            shiftKey: e.shiftKey
          }
        );
        if (needRedraw) {
          this.outlineDirty = true;
        }
      }
      this.clickCallback(this.selectionController.getSelectedObjects());
    } else {
      if (this.selectionController.hasSelection()) {
        this.clickCallback([]);
      }
      needRedraw = this.selectionController.clearSelection();
      if (needRedraw) {
        this.outlineDirty = true;
      }
    }

    if (this.settings.secondaryObjectView) {
      if (this.selectionController.hasOutlineChildren()) {
        this.refreshOutlineIfNeeded();
        this.inset.showObject(this.selectionController.getOutlineChildren());
      } else {
        this.inset.showAxis();
      }
    }
    needRedraw && this.renderScene();
  }

  public updateAnimationStyle(animationStyle: AnimationStyle) {
    if (this.destroyed) {
      return;
    }
    this.settings.animation = animationStyle;
    switch (animationStyle) {
      case AnimationStyle.SLIDER:
      case AnimationStyle.NONE: {
        setTimeout(() => this.stop(), 0);
        break;
      }
      case AnimationStyle.PLAY: {
        setTimeout(() => this.start(), 0);
      }
    }
  }

  private readonly windowListener = () => this.scheduleRendererResize();

  constructor(
    sceneJson: SceneJsonLike,
    domElement: Element,
    settings: Partial<SceneSettings>,
    size: number,
    padding: number,
    clickCallback: (objects: SceneJsonLike[]) => void,
    private dispatch: (p: Vector3, r: Quaternion, zoom: number) => void,
    private flushCameraDispatch?: () => void,
    private debugDOMElement?: Element,
    cameraState?: CameraState
  ) {
    this.settings = { ...defaults, ...settings };
    this.objectBuilder = new ThreeBuilder(this.settings);
    this.cameraState = cameraState;
    this.cacheMountBBox(domElement);
    this.configureSceneRenderer(domElement);
    this.configureLabelRenderer(domElement);
    this.hitTester = createSceneHitTester({
      raycaster: this.raycaster,
      getCamera: () => this.camera,
      getViewportSize: () => this.cachedMountNodeSize,
      resolveParentObject: (object, instanceId) =>
        this.objectRegistry.getParentObject(object, instanceId)
    });
    this.configureScene();
    this.configurePostProcessing();
    this.clickCallback = clickCallback;
    (this.outlineScene as any).autoUpdate = false;
    this.selectionController = createSelectionController(this.outlineScene);
    const isPhonon = sceneJson?.app === 'phonon';
    this.animationHelper = isPhonon
      ? createPhononAnimationController(
          this.objectBuilder,
          sceneJson.amplitude,
          sceneJson.phases,
          sceneJson.omega,
          sceneJson.eigenVectors,
          sceneJson.velocity
        )
      : createAnimationController(this.objectBuilder);
    window.addEventListener('resize', this.windowListener, false);
    this.inset = createInsetController(
      this.axis,
      (this.axisJson ?? {}) as SceneJsonLike,
      this.scene,
      (sceneJson.origin ?? [0, 0, 0]) as ThreePosition,
      this.camera,
      this.objectBuilder,
      size,
      size,
      padding
    );
    if (this.debugDOMElement) {
      this.debugHelper = this.getHelper();
    }
    this.isMultiSelectionEnabled = this.settings.isMultiSelectionEnabled;
  }

  updateInsetSettings(inletSize: number, inletPadding: number, axisView: ScenePosition) {
    this.inletPosition = axisView as ScenePosition;
    if (this.axis) {
      this.inset.updateViewportsize(inletSize, inletPadding);
    }
    // A hidden inset must still redraw the main viewport to clear the pixels
    // written by the previous inset render.
    this.renderScene();
  }

  private syncMountSizeFromRendererParent() {
    const mountNode = this.getRendererMountNode();
    if (!mountNode) {
      return null;
    }
    this.cacheMountBBox(mountNode);
    return this.getCachedMountBBox();
  }

  private syncLabelRendererLayout(size: SceneSize) {
    this.applyLabelRendererLayout(size.width, size.height);
  }

  private syncSvgRendererSize(size: SceneSize) {
    if (this.renderer instanceof SVGRenderer) {
      this.renderer.setSize(size.width, size.height);
    }
  }

  private syncMainViewport(renderer: WebGLRenderer, size: SceneSize) {
    renderer.setSize(size.width, size.height);
    this.restoreMainViewport(renderer, size);
    this.mainViewportConfigured = true;
  }

  private restoreMainViewport(renderer: WebGLRenderer, size: SceneSize) {
    renderer.setScissorTest(true);
    renderer.setScissor(0, 0, size.width, size.height);
    renderer.setViewport(0, 0, size.width, size.height);
  }

  private syncCameraAspect(size: SceneSize) {
    if (size.width <= 0 || size.height <= 0) {
      return;
    }
    applyOrthographicCameraAspect(
      this.camera,
      this.cameraBaseHalfExtent,
      size.width / size.height
    );
  }

  public resizeRendererToDisplaySize() {
    if (this.destroyed || !this.renderer?.domElement || !this.labelRenderer?.domElement) {
      return;
    }
    const canvas = this.renderer.domElement as HTMLCanvasElement;
    const size = this.syncMountSizeFromRendererParent();
    if (!size) {
      return;
    }
    this.syncLabelRendererLayout(size);
    this.syncSvgRendererSize(size);
    this.syncCameraAspect(size);
    const pixelRatioChanged =
      this.renderer instanceof WebGLRenderer
        ? this.syncRendererPixelRatio(this.renderer, size.width, size.height)
        : false;
    const cssSizeChanged = canvas.clientWidth !== size.width || canvas.clientHeight !== size.height;
    const pixelRatio = this.renderer instanceof WebGLRenderer ? this.renderer.getPixelRatio() : 1;
    const bufferWidth = Math.round(size.width * pixelRatio);
    const bufferHeight = Math.round(size.height * pixelRatio);
    const bufferSizeChanged = canvas.width !== bufferWidth || canvas.height !== bufferHeight;
    const sizeChanged = cssSizeChanged || bufferSizeChanged || pixelRatioChanged;
    if (this.renderer instanceof WebGLRenderer && (sizeChanged || !this.mainViewportConfigured)) {
      this.syncMainViewport(this.renderer, size);
    }
    if (sizeChanged) {
      this.renderScene();
    }
  }

  public scheduleRendererResize() {
    if (this.destroyed || this.resizeFrameId !== undefined) {
      return;
    }

    this.resizeFrameId = requestAnimationFrame(() => {
      this.resizeFrameId = undefined;
      this.resizeRendererToDisplaySize();
    });
  }

  private resetSceneStateForReplacement(sceneName: string) {
    this.animationHelper.reset();
    this.objectRegistry.reset();
    this.objectBuilder.resetLabelCount();
    this.threeUUIDTojsonObject = {};
    this.computeIdToThree = {};
    const outlinedObjectIds = this.selectionController.prepareForSceneReplacement();
    this.removeObjectByName(sceneName);
    return outlinedObjectIds;
  }

  private rebuildObjectNameIndex() {
    this.objectNameIndex.clear();
    this.scene.traverse((object) => {
      if (object.name && !this.objectNameIndex.has(object.name)) {
        this.objectNameIndex.set(object.name, object);
      }
    });
  }

  private restorePreviousSelection(outlinedObjectIds: SelectionPersistence[]) {
    if (outlinedObjectIds.length === 0) {
      return;
    }

    this.selectionController.restoreSelectionByIds(outlinedObjectIds, {
      findThreeById: (id) => this.computeIdToThree[id],
      findJsonByUuid: (uuid) => this.threeUUIDTojsonObject[uuid]
    });

    if (this.selectionController.hasOutlineChildren()) {
      this.outlineDirty = true;
      this.refreshOutlineIfNeeded();
      if (this.settings.secondaryObjectView) {
        this.inset.showObject(this.selectionController.getOutlineChildren());
      }
    }
  }

  private renderBackgroundSnapshotIfNeeded() {
    if (!this.settings.renderDivBackground) {
      return;
    }

    const parent = this.renderer?.domElement?.parentElement;
    if (parent) {
      parent.style.backgroundSize = '100%';
      parent.style.backgroundRepeat = 'no-repeat';
      parent.style.backgroundPosition = 'center';
    }
    if (parent && this.renderer.domElement instanceof HTMLCanvasElement) {
      parent.style.backgroundImage = `url('${this.renderer.domElement.toDataURL('image/png')}')`;
    }
  }

  private syncInsetWithCurrentScene() {
    if (!this.inset || !this.axis || !this.axisJson || this.selectionController.hasOutlineChildren()) {
      return;
    }

    this.inset.setAxis(this.axis, this.axisJson);
    this.inset.updateSelectedObject(this.axis, this.axisJson);
  }

  private buildAnimationsForScene(objectIdsToAnimate: string[]) {
    objectIdsToAnimate.forEach((id) => {
      const three = this.computeIdToThree[id];
      const json: SceneJsonObject = this.threeUUIDTojsonObject[three.uuid];
      this.animationHelper.buildAnimationSupport(json, three);
    });
  }

  addToScene(sceneJson: SceneJsonObject, bypassRendering = false) {
    // we need to clarify the  current semantics
    // currently, it will remove the old scene if the name is the same,
    // otherwise it will keep it
    // it will then zoom on the content of the added scene

    // if we found an object, we should remove all tootips and clicks related to it
    let outlinedObject: SelectionPersistence[] = [];
    if (this.scene.getObjectByName(sceneJson.name!)) {
      outlinedObject = this.resetSceneStateForReplacement(sceneJson.name!);
    }

    const {
      rootObject,
      objectIdsToAnimate,
      threeUUIDToJsonObject,
      computeIdToThree,
      axis,
      axisJson
    } = buildSceneGraph({
      sceneJson: sceneJson as SceneJsonLike,
      extractAxis: this.settings.extractAxis,
      makeLeafObject: (objectJson) => this.makeObject(objectJson)
    });
    this.threeUUIDTojsonObject = threeUUIDToJsonObject;
    this.computeIdToThree = computeIdToThree;
    this.axis = axis as Object3D;
    this.axisJson = axisJson;
    this.outlineDirty = true;

    // can cause memory leak
    //console.log('rootObject', rootObject, rootObject);
    this.scene.add(rootObject);
    this.rebuildObjectNameIndex();
    this.setupCamera(rootObject);
    this.restorePreviousSelection(outlinedObject);
    this.renderBackgroundSnapshotIfNeeded();
    this.syncInsetWithCurrentScene();
    this.buildAnimationsForScene(objectIdsToAnimate);
    if (!bypassRendering) {
      this.renderScene();
    }
  }

  private setupCamera(rootObject: THREE.Object3D) {
    const { length } = calculateCameraFrame(rootObject, this.settings);
    this.cameraBaseHalfExtent = length / this.settings.defaultZoom;

    if (this.camera) {
      applyOrthographicCameraFrame(this.camera, this.scene, length, this.settings);
    } else {
      this.camera = createOrthographicCamera(length, this.settings.defaultZoom);
      applyOrthographicCameraFrame(this.camera, this.scene, length, this.settings);
    }
    if (this.controls) {
      this.controls.update();
    }
  }

  makeObject(object_json: SceneJsonLike): THREE.Object3D {
    const obj = new THREE.Object3D();
    this.objectRegistry.registerObject(obj, object_json);
    return this.objectBuilder.makeObject(object_json, obj);
  }

  start() {
    if (this.destroyed) {
      return;
    }
    if (!this.frameId) {
      this.frameId = requestAnimationFrame(() => this.animate());
    } else {
      console.warn('Trying to start animation, but it seems an animation loop is already running');
    }
  }

  stop() {
    if (this.frameId != null) {
      cancelAnimationFrame(this.frameId);
      this.frameId = undefined;
    }
  }

  animate() {
    if (this.destroyed) {
      return;
    }
    this.animationHelper.animate();

    //this.controls.update();
    if (this.controls) {
      this.controls.update();
    }
    this.refreshOutlineIfNeeded();
    this.renderScene();

    this.frameId = window.requestAnimationFrame(() => this.animate());
  }

  renderScene() {
    if (this.destroyed || !this.renderer || !this.camera || !this.scene) {
      return;
    }
    this.refreshOutlineIfNeeded();
    if (this.renderer instanceof WebGLRenderer) {
      this.renderer.clear();
    }

    this.renderer.render(this.scene, this.camera);

    if (this.outline && this.outlineScene.children.length > 0) {
      this.outline.renderOutline(this.outlineScene, this.camera);
    }
    this.labelRenderer.render(this.scene, this.camera);

    if (this.renderer instanceof WebGLRenderer) {
      (this.renderer as any).clearDepth();
    }

    // debug view
    if (this.debugHelper) {
      this.debugHelper.render();
    }

    //TODO(chab) make a dedicated rendering for SVG
    this.renderInlet();
    this.updateScreenSelectionIndicators();
  }

  private renderInlet() {
    if (!this.inset || this.inletPosition === ScenePosition.HIDDEN) {
      return;
    }
    if (this.renderer instanceof WebGLRenderer) {
      this.inset.render(this.renderer, this.getInletOrigin(this.inletPosition));
      this.restoreMainViewport(this.renderer, this.getCachedMountBBox());
    }
  }

  toggleVisibility(namesToVisibility: VisibilityMap) {
    if (this.destroyed || !this.scene) {
      return;
    }

    if (!namesToVisibility || Object.keys(namesToVisibility).length === 0) {
      return;
    }

    Object.keys(namesToVisibility).forEach((objName) => {
      const obj = this.objectNameIndex.get(objName);
      if (obj) {
        obj.visible = Boolean(namesToVisibility[objName]);
      }
    });
    if (this.selectionController.removeInvisibleSelections((id) => this.computeIdToThree[id])) {
      this.outlineDirty = true;
    }
    this.renderScene();
  }

  public enableDebug(debugEnabled: boolean, node: Element) {
    if (!debugEnabled) {
      this.destroyDebugHelper();
      return;
    }

    if (!this.debugHelper) {
      this.debugDOMElement = node;
      this.debugHelper = this.getHelper();
      this.debugHelper.render();
    }
  }

  public removeListener() {
    this.removeEventListeners();
  }

  private removeEventListeners() {
    const domElement = this.renderer?.domElement;
    window.removeEventListener('resize', this.windowListener, false);
    if (domElement && this.interactionController) {
      domElement.removeEventListener('mousemove', this.interactionController.mouseMoveListener);
      domElement.removeEventListener('click', this.interactionController.clickListener);
    }
  }

  private clearPendingControlInit() {
    if (this.controlsInitTimer != null) {
      clearTimeout(this.controlsInitTimer);
      this.controlsInitTimer = null;
    }
  }

  private clearPendingResize() {
    if (this.resizeFrameId !== undefined) {
      cancelAnimationFrame(this.resizeFrameId);
      this.resizeFrameId = undefined;
    }
  }

  private destroyDebugHelper() {
    this.debugHelper?.onDestroy();
    this.debugHelper = null;
  }

  private destroyControllers() {
    this.destroyDebugHelper();
    this.inset?.onDestroy();
    this.selectionController.destroy();
    this.interactionController?.dispose();
    this.interactionController = null;
    this.controlsController?.dispose();
    this.controlsController = null;
    this.controls = null;
  }

  private removeDomNode(node?: Element | null) {
    node?.parentElement?.removeChild(node);
  }

  private removeDomRenderers() {
    this.removeDomNode(this.labelRenderer?.domElement);
    this.removeDomNode(this.renderer?.domElement);
  }

  private removeScreenSelectionLayer() {
    this.clearScreenSelectionIndicators();
    this.removeDomNode(this.screenSelectionLayer);
    this.screenSelectionLayer = null;
  }

  private disposeRendererResources() {
    if (this.renderer instanceof THREE.WebGLRenderer) {
      this.renderer.forceContextLoss();
      this.renderer.dispose();
    }
  }

  // call this when the parent component is destroyed
  public onDestroy() {
    if (this.destroyed) {
      return;
    }
    this.destroyed = true;
    this.clearPendingControlInit();
    this.clearPendingResize();
    this.computeIdToThree = {};
    this.threeUUIDTojsonObject = {};
    this.objectNameIndex.clear();
    this.stop();
    this.removeEventListeners();
    this.destroyControllers();
    disposeSceneHierarchy(this.scene);
    this.objectBuilder.dispose();
    this.removeScreenSelectionLayer();
    this.removeDomRenderers();
    this.disposeRendererResources();
  }

  removeObjectByName(name: string) {
    if (this.destroyed || !this.scene) {
      return;
    }
    const object = this.objectNameIndex.get(name) ?? this.scene.getObjectByName(name);
    if (!object) {
      return;
    }

    this.scene.remove(object);
    disposeSceneHierarchy(object);
    this.rebuildObjectNameIndex();
  }

  private getHelper() {
    if (!this.debugDOMElement) {
      throw new Error('Debug helper requested without a debug mount node');
    }
    return createDebugController(
      this.debugDOMElement,
      this.scene,
      this.camera,
      this.settings,
      this.objectBuilder,
      this.inset.helper
    );
  }

  private getInletOrigin(pos: ScenePosition): [number, number] {
    switch (pos) {
      case ScenePosition.SW: {
        return [this.inset.getPadding(), this.inset.getPadding()];
      }
      case ScenePosition.SE: {
        return [
          this.cachedMountNodeSize.width - this.inset.getPadding() - this.inset.getSize(),
          this.inset.getPadding()
        ];
      }
      case ScenePosition.NW: {
        return [
          0 + this.inset.getPadding(),
          this.cachedMountNodeSize.height - this.inset.getPadding() - this.inset.getSize()
        ];
      }
      case ScenePosition.NE: {
        return [
          this.cachedMountNodeSize.width - this.inset.getPadding() - this.inset.getSize(),
          this.cachedMountNodeSize.height - this.inset.getPadding() - this.inset.getSize()
        ];
      }
      default:
        return [this.inset.getPadding(), this.inset.getPadding()];
    }
  }

  private configurePostProcessing() {
    if (this.settings.renderer === Renderer.SVG) {
      console.warn('No post processing pass for SVG');
      return;
    }
    if (this.settings.selectionIndicator === 'screen-box') {
      return;
    }
    //TODO(chab) look at three.js to implement the texture
    const outline = new OutlineEffect(this.renderer as WebGLRenderer, {
      defaultThickness: 0.01,
      defaultColor: Scene.SELECTION_OUTLINE_COLOR,
      defaultAlpha: 1.0,
      defaultKeepAlive: true // keeps outline material in cache even if material is removed from scene
    });
    this.outline = outline;
  }

  public findObjectByUUID(uuid: string) {
    const threeObject = this.scene.getObjectByProperty('uuid', uuid);
    const jsonObject = this.threeUUIDTojsonObject[uuid];
    return {
      threeObject,
      jsonObject
    };
  }

  refreshOutline() {
    if (this.destroyed || !this.scene) {
      return;
    }
    this.selectionController.refreshOutline((id) => this.computeIdToThree[id]);
    this.outlineDirty = false;
  }

  private refreshOutlineIfNeeded() {
    if (!this.outlineDirty) {
      return;
    }

    this.refreshOutline();
  }

  updateTime(time: number) {
    if (this.destroyed) {
      return;
    }
    this.animationHelper.updateTime(time);
    if (this.selectionController.hasSelection()) {
      this.outlineDirty = true;
    }
    this.renderScene();
  }
}
