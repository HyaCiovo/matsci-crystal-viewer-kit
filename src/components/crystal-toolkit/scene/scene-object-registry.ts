import { Object3D } from 'three';

export interface SceneObjectRegistry<T> {
  reset(): void;
  registerObject(hostObject: Object3D, jsonObject: T): void;
  getClickableObjects(): Object3D[];
  getTooltipObjects(): Object3D[];
  getInteractiveObjects(): Object3D[];
  getParentObject(object: Object3D): { sceneObject: Object3D; jsonObject: T } | null;
}

export function createSceneObjectRegistry<T>(): SceneObjectRegistry<T> {
  const clickableObjects: Object3D[] = [];
  const tooltipObjects: Object3D[] = [];
  const interactiveObjects: Object3D[] = [];
  let objectDictionary: Record<number, T> = {};

  const findRegisteredParent = (
    object: Object3D
  ): { sceneObject: Object3D; jsonObject: T } | null => {
    if (!object.parent || !object.parent.visible || !object.visible) {
      return null;
    }

    if (!objectDictionary[object.id]) {
      return findRegisteredParent(object.parent);
    }

    return { sceneObject: object, jsonObject: objectDictionary[object.id] };
  };

  return {
    reset() {
      clickableObjects.length = 0;
      tooltipObjects.length = 0;
      interactiveObjects.length = 0;
      objectDictionary = {};
    },
    registerObject(hostObject, jsonObject) {
      const typedJson = jsonObject as Record<string, any>;

      if (typedJson.clickable) {
        clickableObjects.push(hostObject);
        objectDictionary[hostObject.id] = jsonObject;
      }

      if (typedJson.tooltip) {
        tooltipObjects.push(hostObject);
        objectDictionary[hostObject.id] = jsonObject;
      }

      // Pointer picking uses one deduplicated candidate list, while click and
      // tooltip behavior still retain their own semantic filters.
      if (typedJson.clickable || typedJson.tooltip) {
        interactiveObjects.push(hostObject);
      }
    },
    getClickableObjects() {
      return clickableObjects;
    },
    getTooltipObjects() {
      return tooltipObjects;
    },
    getInteractiveObjects() {
      return interactiveObjects;
    },
    getParentObject(object) {
      return findRegisteredParent(object);
    }
  };
}
