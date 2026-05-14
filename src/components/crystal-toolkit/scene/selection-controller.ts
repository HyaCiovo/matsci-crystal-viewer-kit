import * as THREE from 'three';
import {
  createObjectRegistry,
  disposeSceneHierarchy,
  type ObjectRegistryApi
} from '../utils';

type SelectionReference<T> = {
  sceneObject: THREE.Object3D;
  jsonObject: T;
};

type ApplySelectionOptions = {
  multiSelectEnabled: boolean;
  shiftKey: boolean;
};

type RestoreSelectionOptions<T> = {
  findThreeById: (id: string) => THREE.Object3D | undefined;
  findJsonByUuid: (uuid: string) => T | undefined;
};

export interface SelectionController<T extends { id?: string }> {
  getSelectedObjects(): T[];
  getSelectedIds(): string[];
  getOutlineChildren(): THREE.Object3D[];
  hasSelection(): boolean;
  hasOutlineChildren(): boolean;
  applySelection(reference: SelectionReference<T>, options: ApplySelectionOptions): boolean;
  clearSelection(): boolean;
  prepareForSceneReplacement(): string[];
  restoreSelectionByIds(ids: string[], options: RestoreSelectionOptions<T>): void;
  removeInvisibleSelections(findThreeById: (id: string) => THREE.Object3D | undefined): boolean;
  refreshOutline(findThreeById: (id: string) => THREE.Object3D | undefined): void;
  destroy(): void;
}

type DetachOutlineOptions = {
  disposeChildren?: boolean;
  clearRegistry?: boolean;
};

function cloneSceneObject(sceneObject: THREE.Object3D): THREE.Object3D {
  const clone = sceneObject.clone();
  clone.matrixAutoUpdate = false;
  clone.uuid = sceneObject.uuid;
  return clone;
}

export function createSelectionController<T extends { id?: string }>(
  outlineScene: THREE.Scene
): SelectionController<T> {
  const registry: ObjectRegistryApi = createObjectRegistry();
  let selectedObjects: T[] = [];

  const getOutlineChildren = () => [...outlineScene.children];

  const ensureOutlineObject = (sceneObject: THREE.Object3D) => {
    if (!registry.registryHasObject(sceneObject)) {
      registry.addToObjectRegisty(cloneSceneObject(sceneObject));
    }
    return registry.getObjectFromRegistry(sceneObject.uuid);
  };

  const detachOutlineChildren = ({
    disposeChildren = false,
    clearRegistry = false
  }: DetachOutlineOptions = {}) => {
    const children = getOutlineChildren();
    if (children.length === 0) {
      return;
    }
    if (disposeChildren) {
      children.forEach((child) => disposeSceneHierarchy(child));
    }
    outlineScene.remove(...children);
    if (clearRegistry) {
      children.forEach((child) => registry.deleteObject(child));
    }
  };

  const addOutlineObject = (sceneObject: THREE.Object3D) => {
    outlineScene.add(ensureOutlineObject(sceneObject));
  };

  return {
    getSelectedObjects() {
      return [...selectedObjects];
    },
    getSelectedIds() {
      return selectedObjects.map((object) => object.id).filter((id): id is string => Boolean(id));
    },
    getOutlineChildren,
    hasSelection() {
      return selectedObjects.length > 0;
    },
    hasOutlineChildren() {
      return outlineScene.children.length > 0;
    },
    applySelection(reference, options) {
      const { sceneObject, jsonObject } = reference;
      let changed = false;

      if (options.multiSelectEnabled) {
        const existingOutlineIndex = outlineScene.children.findIndex(
          (child) => child.uuid === sceneObject.uuid
        );
        const existingJsonIndex = selectedObjects.indexOf(jsonObject);

        if (existingJsonIndex > -1) {
          selectedObjects.splice(existingJsonIndex, 1);
          changed = true;
        } else if (options.shiftKey) {
          selectedObjects.push(jsonObject);
          changed = true;
        } else {
          selectedObjects = [jsonObject];
          changed = true;
        }

        if (existingOutlineIndex > -1) {
          const existingOutlineObject = outlineScene.children[existingOutlineIndex];
          outlineScene.remove(existingOutlineObject);
          registry.deleteObject(existingOutlineObject);
        } else {
          if (!options.shiftKey) {
            detachOutlineChildren({ disposeChildren: true, clearRegistry: true });
          }
          addOutlineObject(sceneObject);
        }

        return changed;
      }

      detachOutlineChildren({ disposeChildren: true, clearRegistry: true });
      addOutlineObject(sceneObject);
      selectedObjects = [jsonObject];
      return true;
    },
    clearSelection() {
      const hadSelection = selectedObjects.length > 0 || outlineScene.children.length > 0;
      selectedObjects = [];
      detachOutlineChildren({ disposeChildren: true, clearRegistry: true });
      return hadSelection;
    },
    prepareForSceneReplacement() {
      const selectedIds = selectedObjects
        .map((object) => object.id)
        .filter((id): id is string => Boolean(id));
      selectedObjects = [];
      detachOutlineChildren({ disposeChildren: true, clearRegistry: true });
      registry.clear();
      return selectedIds;
    },
    restoreSelectionByIds(ids, options) {
      selectedObjects = [];
      detachOutlineChildren();

      ids.forEach((id) => {
        const threeObject = options.findThreeById(id);
        if (!threeObject) {
          return;
        }
        addOutlineObject(threeObject);
        const jsonObject = options.findJsonByUuid(threeObject.uuid);
        if (jsonObject) {
          selectedObjects.push(jsonObject);
        }
      });
    },
    removeInvisibleSelections(findThreeById) {
      let changed = false;
      const idsToRemove: string[] = [];

      selectedObjects = selectedObjects.filter((selectedObject) => {
        const selectedId = selectedObject.id;
        if (!selectedId) {
          changed = true;
          return false;
        }

        let threeObject = findThreeById(selectedId);
        if (!threeObject) {
          changed = true;
          return false;
        }

        let visible = threeObject.visible;
        const baseObject = threeObject;

        while (threeObject.parent && visible) {
          threeObject = threeObject.parent;
          visible = threeObject.visible;
        }

        if (!visible) {
          idsToRemove.push(baseObject.uuid);
          changed = true;
        }

        return visible;
      });

      idsToRemove.forEach((uuid) => {
        const outlineObject = registry.getObjectFromRegistry(uuid);
        if (outlineObject) {
          outlineScene.remove(outlineObject);
          registry.deleteObject(outlineObject);
        }
      });

      return changed;
    },
    refreshOutline(findThreeById) {
      const selectedIds = selectedObjects
        .map((object) => object.id)
        .filter((id): id is string => Boolean(id));

      if (selectedIds.length === 0) {
        return;
      }

      detachOutlineChildren();
      selectedIds.forEach((id) => {
        const threeObject = findThreeById(id);
        if (threeObject) {
          addOutlineObject(threeObject);
        }
      });
    },
    destroy() {
      selectedObjects = [];
      detachOutlineChildren({ disposeChildren: true, clearRegistry: true });
      registry.clear();
    }
  };
}
