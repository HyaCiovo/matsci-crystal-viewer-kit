import * as THREE from 'three';
import { ThreePosition } from './constants';
import { SceneJsonObject } from './scene-types';

export type SceneGraphJsonObject = SceneJsonObject & Record<string, any>;

export interface BuildSceneGraphOptions {
  sceneJson: SceneGraphJsonObject;
  extractAxis: boolean;
  makeLeafObject: (objectJson: SceneGraphJsonObject) => THREE.Object3D;
}

export interface SceneGraphBuildResult {
  rootObject: THREE.Object3D;
  objectIdsToAnimate: string[];
  threeUUIDToJsonObject: Record<string, SceneGraphJsonObject>;
  computeIdToThree: Record<string, THREE.Object3D>;
  axis: THREE.Object3D | null;
  axisJson: SceneGraphJsonObject | null;
}

export function buildSceneGraph({
  sceneJson,
  extractAxis,
  makeLeafObject
}: BuildSceneGraphOptions): SceneGraphBuildResult {
  const rootObject = new THREE.Object3D();
  rootObject.name = sceneJson.name!;
  if (sceneJson.visible) {
    rootObject.visible = sceneJson.visible;
  }

  const objectIdsToAnimate = new Set<string>();
  const threeUUIDToJsonObject: Record<string, SceneGraphJsonObject> = {};
  const computeIdToThree: Record<string, THREE.Object3D> = {};
  let axis: THREE.Object3D | null = null;
  let axisJson: SceneGraphJsonObject | null = null;

  const traverseScene = (
    currentObject: SceneJsonObject,
    parent: THREE.Object3D,
    currentId: string
  ) => {
    currentObject.contents!.forEach((childObject, index) => {
      if (childObject.type) {
        const objectId = `${currentId}--${index}`;
        const threeObject = makeLeafObject(childObject as SceneGraphJsonObject);
        parent.add(threeObject);
        threeUUIDToJsonObject[threeObject.uuid] = childObject as SceneGraphJsonObject;
        computeIdToThree[objectId] = threeObject;
        childObject.id = objectId;
        if (childObject.animate) {
          objectIdsToAnimate.add(objectId);
        }
        return;
      }

      const threeObject = new THREE.Object3D();
      threeObject.name = childObject.name!;
      const objectId = `${currentId}--${threeObject.name}`;
      computeIdToThree[objectId] = threeObject;
      childObject.id = objectId;
      threeObject.visible = childObject.visible === undefined ? true : Boolean(childObject.visible);

      if (childObject.origin) {
        const translation = new THREE.Matrix4();
        translation.makeTranslation(...(childObject.origin as ThreePosition));
        threeObject.applyMatrix4(translation);
      }

      if (!extractAxis || threeObject.name !== 'axes') {
        parent.add(threeObject);
      }

      traverseScene(childObject, threeObject, objectId);

      if (threeObject.name === 'axes') {
        axis = threeObject.clone();
        axisJson = { ...(childObject as SceneGraphJsonObject) };
      }
    });
  };

  traverseScene(sceneJson, rootObject, '');

  return {
    rootObject,
    objectIdsToAnimate: [...objectIdsToAnimate],
    threeUUIDToJsonObject,
    computeIdToThree,
    axis,
    axisJson
  };
}
