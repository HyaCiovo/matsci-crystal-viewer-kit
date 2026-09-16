import * as THREE from 'three';
import { getSceneWithBackground } from './three_builder';
import { disposeSceneHierarchy } from '../utils';
import { ThreePosition } from './constants';
import type { SceneJsonObject } from './scene-types';

export enum ScenePosition {
  NW = 'NW',
  NE = 'NE',
  SE = 'SE',
  SW = 'SW',
  HIDDEN = 'HIDDEN',
}

const MIN_SIZE = 50;
const DEFAULT_SIZE = 130;

type InsetSceneJson = SceneJsonObject & Record<string, any>;

export interface InsetController {
  readonly helper?: THREE.CameraHelper;
  setAxis(axis: THREE.Object3D, axisJson: InsetSceneJson): void;
  updateViewportsize(size: number, padding: number): void;
  showObject(selection: THREE.Object3D[]): void;
  showAxis(): void;
  updateSelectedObject(object: THREE.Object3D, objectJson: Partial<SceneJsonObject>): void;
  render(renderer: THREE.WebGLRenderer | THREE.Renderer, origin: [number, number]): void;
  getPadding(): number;
  getSize(): number;
  onDestroy(): void;
}

type InsetState = {
  detailedObject: THREE.Object3D;
  axisJson: InsetSceneJson;
  axis: THREE.Object3D;
  origin: ThreePosition;
  cameraToFollow: THREE.Camera;
  insetWidth: number;
  insetHeight: number;
  insetPadding: number;
  axisPadding: number;
};

function setupInsetCamera(
  state: InsetState,
  insetCamera: THREE.OrthographicCamera,
  frontRotation: THREE.Euler
) {
  if (!state.detailedObject) {
    console.warn('setup should not be called if no detailedObject is there');
    return;
  }

  const box = new THREE.Box3().setFromObject(state.detailedObject);
  const maxDimension = Math.max(
    box.max.x - box.min.x,
    box.max.y - box.min.y,
    box.max.z - box.min.z
  );
  const [x, y, z] = state.origin;
  insetCamera.position.set(x, y, z);
  insetCamera.left = insetCamera.bottom = insetCamera.near = -maxDimension;
  insetCamera.right = insetCamera.top = insetCamera.far = maxDimension;
  insetCamera.rotation.set(
    frontRotation.x,
    frontRotation.y,
    frontRotation.z,
    frontRotation.order
  );
  insetCamera.zoom = 1;
  insetCamera.updateProjectionMatrix();
}

export function createInsetController(
  detailedObject: THREE.Object3D,
  axisJson: InsetSceneJson,
  baseScene: THREE.Scene,
  origin: ThreePosition,
  cameraToFollow: THREE.Camera,
  insetWidth = DEFAULT_SIZE,
  insetHeight = DEFAULT_SIZE,
  insetPadding = 0
): InsetController {
  const insetCamera = new THREE.OrthographicCamera(-4, 4, 4, -4, -10, 10);
  const frontRotation = cameraToFollow.rotation.clone();
  const scene = getSceneWithBackground({ transparentBackground: true, background: '#ffffff' });
  const state: InsetState = {
    detailedObject,
    axisJson,
    axis: detailedObject,
    origin,
    cameraToFollow,
    insetWidth,
    insetHeight,
    insetPadding,
    axisPadding: 0,
  };

  const baseLights = baseScene.getObjectByName('lights');
  if (!baseLights) {
    console.warn('no lights in base scene');
  } else {
    scene.add(baseLights.clone(true));
  }

  let helper: THREE.CameraHelper | undefined;

  if (state.detailedObject) {
    scene.add(state.detailedObject);
    setupInsetCamera(state, insetCamera, frontRotation);
    helper = new THREE.CameraHelper(insetCamera);
    helper.update();
  }

  return {
    get helper() {
      return helper;
    },
    setAxis(axis, nextAxisJson) {
      state.axis = axis;
      state.axisJson = nextAxisJson;
    },
    updateViewportsize(size, padding) {
      if (size == null || padding == null) {
        console.warn('fallback to default settings when resizing');
        return;
      }

      state.insetPadding = padding;
      const resolvedSize = size < MIN_SIZE ? MIN_SIZE : size;
      if (resolvedSize !== state.insetHeight) {
        state.insetWidth = resolvedSize;
        state.insetHeight = resolvedSize;
        setupInsetCamera(state, insetCamera, frontRotation);
      }
    },
    showObject(selection) {
      const object = new THREE.Object3D();
      object.add(
        ...selection.map((item) => {
          const clone = item.clone();
          clone.matrixAutoUpdate = false;
          return clone;
        })
      );
      this.updateSelectedObject(object, {});
    },
    showAxis() {
      if (state.detailedObject === state.axis) {
        return;
      }
      this.updateSelectedObject(state.axis, state.axisJson);
    },
    updateSelectedObject(object, objectJson) {
      scene.remove(state.detailedObject);
      state.detailedObject = object;
      scene.add(state.detailedObject);

      if (objectJson.origin) {
        state.origin = objectJson.origin;
      } else {
        const box = new THREE.Box3().setFromObject(state.detailedObject);
        let center = new THREE.Vector3();
        box.getCenter(center);
        center = object.localToWorld(center);
        state.origin = [center.x, center.y, center.z];
      }

      setupInsetCamera(state, insetCamera, frontRotation);
    },
    render(renderer, [x, y]) {
      if (!(renderer instanceof THREE.WebGLRenderer) || !state.detailedObject) {
        return;
      }

      renderer.setScissorTest(true);
      renderer.setScissor(x, y, state.insetWidth, state.insetHeight);
      renderer.setViewport(x, y, state.insetWidth, state.insetHeight);
      insetCamera.rotation.copy(state.cameraToFollow.rotation);
      insetCamera.updateProjectionMatrix();
      renderer.render(scene, insetCamera);
      renderer.clearDepth();
      renderer.setScissorTest(false);
    },
    getPadding() {
      return state.insetPadding;
    },
    getSize() {
      return state.insetWidth;
    },
    onDestroy() {
      disposeSceneHierarchy(scene);
      state.cameraToFollow = null as unknown as THREE.Camera;
      state.detailedObject = null as unknown as THREE.Object3D;
    },
  };
}
