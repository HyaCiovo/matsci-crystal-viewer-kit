import * as THREE from 'three';
import { CameraHelper } from 'three';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { disposeSceneHierarchy } from '../utils';

const DEBUG_SIZE = 500;
const background = new THREE.Color('#000000');

type DebugBuilder = {
  makeLightsHelper: (lights: any[]) => THREE.Object3D;
};

type DebugControls = {
  dispose(): void;
};

type DebugControllerState = {
  controls: DebugControls | null;
  showAxis: boolean;
  showGrid: boolean;
  showLights: boolean;
};

export interface DebugController {
  render(): void;
  onDestroy(): void;
}

function createDebugRenderer() {
  const debugRenderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
  });
  (debugRenderer as any).gammaFactor = 2.2;
  debugRenderer.setSize(DEBUG_SIZE, DEBUG_SIZE);
  return debugRenderer;
}

function createDebugCamera() {
  const debugCamera = new THREE.PerspectiveCamera(
    60,
    1,
    0.1,
    300
  );
  debugCamera.position.set(10, 20, -10);
  debugCamera.lookAt(0, 0, 0);
  return debugCamera;
}

function setHelperObjectVisibility(
  isVisible: boolean,
  cameraHelper: THREE.CameraHelper,
  axis: THREE.AxesHelper,
  grid: THREE.GridHelper,
  lights: THREE.Object3D,
  insetHelper: THREE.Object3D
) {
  cameraHelper.visible = isVisible;
  axis.visible = isVisible;
  grid.visible = isVisible;
  lights.visible = isVisible;
  insetHelper.visible = isVisible;
}

export function createDebugController(
  mountNode: Element,
  scene: THREE.Scene,
  cameraToTrack: THREE.Camera,
  _settings: Record<string, any>,
  builder: DebugBuilder,
  insetCameraHelper?: THREE.CameraHelper
): DebugController {
  if (!mountNode) {
    console.error('No mount node passed for the debug view');
  }

  const state: DebugControllerState = {
    controls: null,
    showAxis: true,
    showGrid: true,
    showLights: false,
  };

  const debugRenderer = createDebugRenderer();
  mountNode.appendChild(debugRenderer.domElement);

  const cameraHelper = new THREE.CameraHelper(cameraToTrack);
  scene.add(cameraHelper);

  const axis = new THREE.AxesHelper(100);
  (axis.material as LineMaterial).linewidth = 2.5;

  const grid = new THREE.GridHelper(20, 20);
  const lightsInScene = scene.getObjectByName('lights');
  const lights =
    !lightsInScene || lightsInScene.children.length === 0
      ? new THREE.Object3D()
      : builder.makeLightsHelper(lightsInScene.children);

  if (!lightsInScene || lightsInScene.children.length === 0) {
    console.warn('No lights defined in the scene');
  }

  state.showAxis && scene.add(axis);
  state.showGrid && scene.add(grid);
  state.showLights && scene.add(lights);

  const debugCamera = createDebugCamera();
  debugRenderer.setSize(DEBUG_SIZE, DEBUG_SIZE);
  debugRenderer.setViewport(0, 0, DEBUG_SIZE, DEBUG_SIZE);

  const controls = new OrbitControls(debugCamera, debugRenderer.domElement);
  controls.target.set(0, 5, 0);
  controls.update();
  controls.addEventListener('change', () => {
    controller.render();
  });
  controls.addEventListener('start', () => {
    controls.update();
  });
  controls.addEventListener('end', () => {
    controls.update();
  });
  state.controls = controls;

  const insetHelper = new THREE.Object3D();
  if (insetCameraHelper) {
    insetHelper.add(insetCameraHelper);
  }
  scene.add(insetHelper);

  const controller: DebugController = {
    render() {
      cameraHelper.update();
      insetHelper.children[0] && (insetHelper.children[0] as CameraHelper).update();
      const oldBackgroundColor = scene.background;
      scene.background = background;
      setHelperObjectVisibility(true, cameraHelper, axis, grid, lights, insetHelper);
      debugRenderer.render(scene, debugCamera);
      setHelperObjectVisibility(false, cameraHelper, axis, grid, lights, insetHelper);
      scene.background = oldBackgroundColor;
    },
    onDestroy() {
      disposeSceneHierarchy(scene);
      scene.remove(cameraHelper);
      scene.remove(axis);
      scene.remove(grid);
      (scene as any).dispose?.();
      state.controls?.dispose();
      debugRenderer.forceContextLoss();
      debugRenderer.dispose();
      debugRenderer.domElement.parentElement?.removeChild(debugRenderer.domElement);
      (debugRenderer as unknown as { domElement?: HTMLCanvasElement }).domElement = undefined;
    },
  };

  return controller;
}
