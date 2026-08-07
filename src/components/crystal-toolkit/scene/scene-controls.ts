import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TrackballControls } from 'three/examples/jsm/controls/TrackballControls.js';
import * as THREE from 'three';
import { AnimationStyle, Control } from './constants';

export type SceneControls = {
  update(): void;
  dispose(): void;
  addEventListener(type: string, listener: () => void): void;
};

export interface SceneControlsController {
  controls: SceneControls | null;
  dispose(): void;
}

type CreateSceneControlsControllerArgs = {
  camera: THREE.OrthographicCamera;
  domElement: HTMLElement;
  controlType: Control;
  staticScene: boolean;
  animation: AnimationStyle;
  dispatchCamera: (position: THREE.Vector3, quaternion: THREE.Quaternion, zoom: number) => void;
  flushCamera?: () => void;
  renderScene: () => void;
  startAnimationLoop: () => void;
};

function createBaseControls(
  camera: THREE.OrthographicCamera,
  domElement: HTMLElement,
  controlType: Control
): SceneControls {
  if (controlType === Control.ORBIT) {
    const controls = new OrbitControls(camera, domElement);
    controls.rotateSpeed = 2.0;
    controls.zoomSpeed = 1.2;
    controls.panSpeed = 0.8;
    controls.enabled = true;
    return controls;
  }

  const controls = new TrackballControls(camera, domElement);
  controls.rotateSpeed = 2.0;
  controls.zoomSpeed = 1.2;
  controls.panSpeed = 0.8;
  controls.enabled = true;
  controls.staticMoving = true;
  return controls;
}

export function createSceneControlsController({
  camera,
  domElement,
  controlType,
  staticScene,
  animation,
  dispatchCamera,
  flushCamera,
  renderScene,
  startAnimationLoop
}: CreateSceneControlsControllerArgs): SceneControlsController {
  const controls = createBaseControls(camera, domElement, controlType);
  const isTrackball = controlType === Control.TRACKBALL;
  const mouseTrackballUpdate = () => controls.update();

  if (
    staticScene ||
    animation === AnimationStyle.NONE ||
    animation === AnimationStyle.SLIDER
  ) {
    controls.addEventListener('change', () => {
      dispatchCamera(camera.position, camera.quaternion, camera.zoom);
      renderScene();
    });
    controls.addEventListener('start', () => {
      controls.update();
      if (isTrackball) {
        document.addEventListener('mousemove', mouseTrackballUpdate, false);
      }
    });
    controls.addEventListener('end', () => {
      controls.update();
      flushCamera?.();
      if (isTrackball) {
        document.removeEventListener('mousemove', mouseTrackballUpdate, false);
      }
    });
  } else {
    startAnimationLoop();
  }

  return {
    controls,
    dispose() {
      if (isTrackball) {
        document.removeEventListener('mousemove', mouseTrackballUpdate, false);
      }
      controls.dispose();
    }
  };
}
