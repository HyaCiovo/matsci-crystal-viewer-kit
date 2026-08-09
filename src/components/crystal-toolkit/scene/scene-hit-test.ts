import * as THREE from 'three';
import { Object3D } from 'three';
import { getScreenCoordinate, getThreeScreenCoordinate, moveAndUnprojectPoint } from '../utils';
import type { SceneInteractionReference } from './scene-interaction';

type HitTestSize = {
  width: number;
  height: number;
};

type CreateSceneHitTesterArgs<T> = {
  raycaster: THREE.Raycaster;
  getCamera: () => THREE.Camera | undefined;
  getViewportSize: () => HitTestSize;
  resolveParentObject: (object: Object3D) => { sceneObject: Object3D; jsonObject: T } | null;
};

export interface SceneHitTester<T> {
  getIntersectedReferences(
    clientX: number,
    clientY: number,
    objectsToCheck: Object3D[]
  ): Array<NonNullable<SceneInteractionReference<T>>>;
  getClickedReference(
    clientX: number,
    clientY: number,
    objectsToCheck: Object3D[]
  ): SceneInteractionReference<T>;
}

export function createSceneHitTester<T>({
  raycaster,
  getCamera,
  getViewportSize,
  resolveParentObject
}: CreateSceneHitTesterArgs<T>): SceneHitTester<T> {
  return {
    getIntersectedReferences(clientX, clientY, objectsToCheck) {
      const camera = getCamera();
      if (!camera || !objectsToCheck || objectsToCheck.length === 0) {
        return [];
      }

      const viewportSize = getViewportSize();
      const size = new THREE.Vector2(viewportSize.width, viewportSize.height);
      raycaster.setFromCamera(getThreeScreenCoordinate(size, clientX, clientY), camera);
      const intersects = raycaster.intersectObjects(objectsToCheck, true);

      if (intersects.length === 0) {
        return [];
      }

      return intersects.map((intersection) => {
        const screenPoint = getScreenCoordinate(viewportSize, intersection.point, camera);
        const point = moveAndUnprojectPoint(viewportSize, screenPoint, camera, {
          x: 0,
          y: -30
        });

        return {
          point,
          object: resolveParentObject(intersection.object)
        };
      });
    },
    getClickedReference(clientX, clientY, objectsToCheck) {
      return this.getIntersectedReferences(clientX, clientY, objectsToCheck)[0] ?? null;
    }
  };
}
