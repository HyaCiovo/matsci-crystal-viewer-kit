import * as THREE from 'three';
import { CameraAxis } from './constants';

type SceneCameraSettings = {
  cameraAxis?: CameraAxis | string;
  cameraPosition?: string;
  defaultZoom: number;
  zoomToFit2D?: boolean;
};

type CameraFrame = {
  extent: THREE.Vector3;
  length: number;
};

const Z_PADDING = 50;
const CAMERA_OFFSETS: Record<CameraAxis, [CameraAxis, CameraAxis]> = {
  [CameraAxis.X]: [CameraAxis.Y, CameraAxis.Z],
  [CameraAxis.Y]: [CameraAxis.X, CameraAxis.Z],
  [CameraAxis.Z]: [CameraAxis.X, CameraAxis.Y]
};

export function calculateCameraFrame(
  rootObject: THREE.Object3D,
  settings: SceneCameraSettings
): CameraFrame {
  const box = new THREE.Box3().setFromObject(rootObject);
  const center = new THREE.Vector3();
  box.getCenter(center);

  const extent = box.max.clone().sub(box.min);
  let length = extent.length() * 2;

  rootObject.position.sub(center);
  rootObject.updateMatrixWorld(true);

  if (settings.zoomToFit2D) {
    length = Math.max(extent.x, extent.y) * 2;
  }

  return { extent, length };
}

export function applyOrthographicCameraFrame(
  camera: THREE.OrthographicCamera,
  scene: THREE.Scene,
  length: number,
  settings: SceneCameraSettings
) {
  camera.left = -length / settings.defaultZoom;
  camera.right = length / settings.defaultZoom;
  camera.top = length / settings.defaultZoom;
  camera.bottom = -length / settings.defaultZoom;
  camera.near = -length - Z_PADDING;
  camera.far = length + Z_PADDING;

  camera.position.set(0, 0, 0);

  const axis = (settings.cameraAxis ?? CameraAxis.Z) as CameraAxis;
  camera.position[axis] = settings.cameraPosition === 'back' ? length / 2 : -length / 2;

  const [offsetA, offsetB] = CAMERA_OFFSETS[axis];
  camera.position[offsetA] = length * 0.18;
  camera.position[offsetB] = length * 0.12;

  camera.lookAt(scene.position);
  camera.zoom = 4;
  camera.updateProjectionMatrix();
  camera.updateMatrix();
}

export function createOrthographicCamera(length: number, defaultZoom: number) {
  return new THREE.OrthographicCamera(
    -length / defaultZoom,
    length / defaultZoom,
    length / defaultZoom,
    -length / defaultZoom,
    -length - Z_PADDING,
    length + Z_PADDING
  );
}
