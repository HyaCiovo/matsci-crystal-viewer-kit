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

/**
 * Reframes an orthographic camera for its actual renderer aspect ratio without
 * changing the current zoom or stretching the rendered structure.
 *
 * The viewer's original camera frame is square. When the host is wider than
 * tall, expose the additional horizontal space; when it is narrower, expose
 * additional vertical space so the structure remains fully visible.
 */
export function applyOrthographicCameraAspect(
  camera: THREE.OrthographicCamera,
  baseHalfExtent: number,
  aspect: number
) {
  if (!Number.isFinite(aspect) || aspect <= 0 || !Number.isFinite(baseHalfExtent)) {
    return;
  }

  const safeAspect = Math.max(aspect, Number.EPSILON);
  const halfHeight = baseHalfExtent * Math.max(1, 1 / safeAspect);
  const halfWidth = halfHeight * safeAspect;

  camera.left = -halfWidth;
  camera.right = halfWidth;
  camera.top = halfHeight;
  camera.bottom = -halfHeight;
  camera.updateProjectionMatrix();
}
