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
import { SceneJsonObject } from './simple-scene';
import { createAnimationController, type AnimationController } from './animation-helper';
import { createPhononAnimationController } from './phonon-animation-helper';
import {
  createSceneControlsController,
  type SceneControls,
  type SceneControlsController
} from './scene-controls';
import {
  createSelectionController,
  type SelectionController
} from './selection-controller';
import { buildSceneGraph } from './scene-graph';
import {
  applyOrthographicCameraFrame,
  calculateCameraFrame,
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
  private destroyed = false;
  private controlsInitTimer: ReturnType<typeof setTimeout> | null = null;
  private settings: SceneSettings;
  private renderer!: THREE.WebGLRenderer | SVGRenderer;
  private labelRenderer!: CSS2DRenderer;
  public scene!: THREE.Scene; // expose getter instead
  private cachedMountNodeSize!: SceneSize;
  private camera!: THREE.OrthographicCamera;
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

  // handle multiSelection via shift key
  private isMultiSelectionEnabled = false;
  private animationHelper: AnimationController;

  private cacheMountBBox(mountNode: Element) {
    this.cachedMountNodeSize = { width: mountNode.clientWidth, height: mountNode.clientHeight };
  }

  private getCachedMountBBox() {
    return this.cachedMountNodeSize;
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
        renderer.setPixelRatio(window.devicePixelRatio);
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
    this.renderer.setSize(width, height);
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
      clickableObjects: this.objectRegistry.getClickableObjects(),
      tooltipObjects: this.objectRegistry.getTooltipObjects(),
      getClickedReference: (clientX, clientY, objectsToCheck) =>
        this.hitTester.getClickedReference(clientX, clientY, objectsToCheck),
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
      renderScene: () => this.renderScene(),
      startAnimationLoop: () => this.start()
    });
    this.controls = this.controlsController.controls;
  }

  public getRenderer() {
    return this.renderer;
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
            jsonObject: object.jsonObject as SceneJsonLike
          },
          {
            multiSelectEnabled: this.isMultiSelectionEnabled,
            shiftKey: e.shiftKey
          }
        );
      }
      this.clickCallback(this.selectionController.getSelectedObjects());
    } else {
      if (this.selectionController.hasSelection()) {
        this.clickCallback([]);
      }
      needRedraw = this.selectionController.clearSelection();
    }

    if (this.settings.secondaryObjectView) {
      this.selectionController.hasOutlineChildren()
        ? this.inset.showObject(this.selectionController.getOutlineChildren())
        : this.inset.showAxis();
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

  private readonly windowListener = () => this.resizeRendererToDisplaySize();

  constructor(
    sceneJson: SceneJsonLike,
    domElement: Element,
    settings: Partial<SceneSettings>,
    size: number,
    padding: number,
    clickCallback: (objects: SceneJsonLike[]) => void,
    private dispatch: (p: Vector3, r: Quaternion, zoom: number) => void,
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
      resolveParentObject: (object) => this.objectRegistry.getParentObject(object)
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
    this.renderInlet();
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

  private applyWebGLViewport(renderer: WebGLRenderer, size: SceneSize) {
    renderer.clear();
    renderer.setSize(size.width, size.height);
    //TODO(chab) not sure to understand why we have to turn on/off scissor tests between renderings
    renderer.setScissorTest(true);
    renderer.setScissor(0, 0, size.width, size.height);
    renderer.setViewport(0, 0, size.width, size.height);
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
    if (canvas.width !== size.width || canvas.height !== size.height) {
      this.renderScene();
    }
  }

  private resetSceneStateForReplacement(sceneName: string) {
    this.animationHelper.reset();
    this.objectRegistry.reset();
    this.threeUUIDTojsonObject = {};
    this.computeIdToThree = {};
    const outlinedObjectIds = this.selectionController.prepareForSceneReplacement();
    this.removeObjectByName(sceneName);
    return outlinedObjectIds;
  }

  private restorePreviousSelection(outlinedObjectIds: string[]) {
    if (outlinedObjectIds.length === 0) {
      return;
    }

    this.selectionController.restoreSelectionByIds(outlinedObjectIds, {
      findThreeById: (id) => this.computeIdToThree[id],
      findJsonByUuid: (uuid) => this.threeUUIDTojsonObject[uuid]
    });

    if (this.selectionController.hasOutlineChildren()) {
      this.inset.showObject(this.selectionController.getOutlineChildren());
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
    let outlinedObject: string[] = [];
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

    // can cause memory leak
    //console.log('rootObject', rootObject, rootObject);
    this.scene.add(rootObject);
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
    this.refreshOutline();
    this.renderScene();

    this.frameId = window.requestAnimationFrame(() => this.animate());
  }

  renderScene() {
    if (this.destroyed || !this.renderer || !this.camera || !this.scene) {
      return;
    }
    if (this.renderer instanceof WebGLRenderer) {
      this.applyWebGLViewport(this.renderer, this.getCachedMountBBox());
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
  }

  private renderInlet() {
    if (!this.inset || this.inletPosition === ScenePosition.HIDDEN) {
      return;
    }
    if (this.renderer instanceof WebGLRenderer) {
      this.inset.render(this.renderer, this.getInletOrigin(this.inletPosition));
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
      const obj = this.scene.getObjectByName(objName);
      if (obj) {
        obj.visible = Boolean(namesToVisibility[objName]);
      }
    });
    this.selectionController.removeInvisibleSelections((id) => this.computeIdToThree[id]);
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

  private destroyDebugHelper() {
    this.debugHelper?.onDestroy();
    this.debugHelper = null;
  }

  private destroyControllers() {
    this.destroyDebugHelper();
    this.inset?.onDestroy();
    this.selectionController.destroy();
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
    this.computeIdToThree = {};
    this.threeUUIDTojsonObject = {};
    this.stop();
    this.removeEventListeners();
    this.destroyControllers();
    disposeSceneHierarchy(this.scene);
    this.removeDomRenderers();
    this.disposeRendererResources();
  }

  removeObjectByName(name: string) {
    if (this.destroyed || !this.scene) {
      return;
    }
    // name is not necessarily unique, make this recursive ?
    const object = this.scene.getObjectByName(name);
    typeof object !== 'undefined' && this.scene.remove(object);
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
    //TODO(chab) look at three.js to implement the texture
    const outline = new OutlineEffect(this.renderer as WebGLRenderer, {
      defaultThickness: 0.01,
      defaultColor: [0, 0, 0],
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
  }

  updateTime(time: number) {
    if (this.destroyed) {
      return;
    }
    this.animationHelper.updateTime(time);
    this.refreshOutline();
    this.renderScene();
  }
}
