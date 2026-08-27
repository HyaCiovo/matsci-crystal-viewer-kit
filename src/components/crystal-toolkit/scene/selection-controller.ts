import * as THREE from 'three';
import { disposeSceneHierarchy } from '../utils';

/**
 * Connects a selected JSON object to its rendered Three.js object.
 *
 * `instanceId` is present only when instance-level selection is enabled and
 * the hit came from an `InstancedMesh`. It is intentionally part of the
 * reference rather than the JSON payload so existing click callbacks keep
 * returning the same scene JSON objects.
 */
export type SelectionReference<T> = {
  sceneObject: THREE.Object3D;
  jsonObject: T;
  instanceId?: number;
};

/**
 * Serializable selection identity retained while a named scene object is
 * replaced. The optional instance index preserves an instance-level outline
 * when the replacement contains the same batched object.
 */
export type SelectionPersistence = {
  id: string;
  instanceId?: number;
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
  prepareForSceneReplacement(): SelectionPersistence[];
  restoreSelectionByIds(ids: SelectionPersistence[], options: RestoreSelectionOptions<T>): void;
  removeInvisibleSelections(findThreeById: (id: string) => THREE.Object3D | undefined): boolean;
  refreshOutline(findThreeById: (id: string) => THREE.Object3D | undefined): void;
  destroy(): void;
}

type DetachOutlineOptions = {
  disposeChildren?: boolean;
  clearRegistry?: boolean;
};

function getSelectionKey<T>(reference: SelectionReference<T>) {
  return `${reference.sceneObject.uuid}:${reference.instanceId ?? 'object'}`;
}

const copySelectedInstances = (
  source: THREE.Object3D,
  target: THREE.Object3D,
  instanceId: number
) => {
  const sourceNodes: THREE.Object3D[] = [];
  const targetNodes: THREE.Object3D[] = [];
  source.traverse((object) => sourceNodes.push(object));
  target.traverse((object) => targetNodes.push(object));

  const matrix = new THREE.Matrix4();
  const color = new THREE.Color();

  sourceNodes.forEach((sourceNode, index) => {
    const targetNode = targetNodes[index];
    if (!(sourceNode instanceof THREE.InstancedMesh) || !(targetNode instanceof THREE.InstancedMesh)) {
      return;
    }

    if (instanceId < 0 || instanceId >= sourceNode.count) {
      targetNode.count = 0;
      return;
    }

    sourceNode.getMatrixAt(instanceId, matrix);
    targetNode.count = 1;
    targetNode.setMatrixAt(0, matrix);
    targetNode.instanceMatrix.needsUpdate = true;

    if (sourceNode.instanceColor) {
      sourceNode.getColorAt(instanceId, color);
      targetNode.setColorAt(0, color);
      targetNode.instanceColor!.needsUpdate = true;
    }

    targetNode.computeBoundingBox();
    targetNode.computeBoundingSphere();
  });
};

function syncCloneWorldTransform(source: THREE.Object3D, target: THREE.Object3D) {
  source.updateWorldMatrix(true, false);
  target.matrix.copy(source.matrixWorld);
  target.matrixWorld.copy(source.matrixWorld);
  target.matrixAutoUpdate = false;
  target.matrixWorldNeedsUpdate = false;
}

function cloneSceneObject(sceneObject: THREE.Object3D, instanceId?: number): THREE.Object3D {
  const clone = sceneObject.clone();
  clone.uuid = sceneObject.uuid;
  syncCloneWorldTransform(sceneObject, clone);

  if (instanceId !== undefined) {
    copySelectedInstances(sceneObject, clone, instanceId);
  }

  return clone;
}

export function createSelectionController<T extends { id?: string }>(
  outlineScene: THREE.Scene
): SelectionController<T> {
  const outlineObjects = new Map<string, THREE.Object3D>();
  let selectedReferences: SelectionReference<T>[] = [];

  const getOutlineChildren = () => [...outlineScene.children];

  const ensureOutlineObject = (reference: SelectionReference<T>) => {
    const key = getSelectionKey(reference);
    const existingObject = outlineObjects.get(key);
    if (existingObject) {
      syncCloneWorldTransform(reference.sceneObject, existingObject);
      if (reference.instanceId !== undefined) {
        copySelectedInstances(reference.sceneObject, existingObject, reference.instanceId);
      }
      return existingObject;
    }

    const clone = cloneSceneObject(reference.sceneObject, reference.instanceId);
    outlineObjects.set(key, clone);
    return clone;
  };

  const detachOutlineChildren = ({
    disposeChildren = false,
    clearRegistry = false
  }: DetachOutlineOptions = {}) => {
    const children = getOutlineChildren();
    if (disposeChildren) {
      children.forEach((child) => disposeSceneHierarchy(child));
    }
    if (children.length > 0) {
      outlineScene.remove(...children);
    }
    if (clearRegistry) {
      outlineObjects.clear();
    }
  };

  const addOutlineObject = (reference: SelectionReference<T>) => {
    outlineScene.add(ensureOutlineObject(reference));
  };

  const removeOutlineObject = (reference: SelectionReference<T>) => {
    const key = getSelectionKey(reference);
    const outlineObject = outlineObjects.get(key);
    if (!outlineObject) {
      return;
    }
    outlineScene.remove(outlineObject);
    disposeSceneHierarchy(outlineObject);
    outlineObjects.delete(key);
  };

  const hasSameSelection = (nextSelectedReferences: SelectionReference<T>[]) => {
    if (selectedReferences.length !== nextSelectedReferences.length) {
      return false;
    }

    return selectedReferences.every(
      (reference, index) => getSelectionKey(reference) === getSelectionKey(nextSelectedReferences[index])
    );
  };

  return {
    getSelectedObjects() {
      return selectedReferences.map((reference) => reference.jsonObject);
    },
    getSelectedIds() {
      return selectedReferences
        .map((reference) => reference.jsonObject.id)
        .filter((id): id is string => Boolean(id));
    },
    getOutlineChildren,
    hasSelection() {
      return selectedReferences.length > 0;
    },
    hasOutlineChildren() {
      return outlineScene.children.length > 0;
    },
    applySelection(reference, options) {
      const referenceKey = getSelectionKey(reference);
      let changed = false;

      if (options.multiSelectEnabled) {
        const nextSelectedReferences = [...selectedReferences];
        const existingSelectionIndex = nextSelectedReferences.findIndex(
          (selectedReference) => getSelectionKey(selectedReference) === referenceKey
        );

        if (existingSelectionIndex > -1) {
          nextSelectedReferences.splice(existingSelectionIndex, 1);
        } else if (options.shiftKey) {
          nextSelectedReferences.push(reference);
        } else {
          nextSelectedReferences.splice(0, nextSelectedReferences.length, reference);
        }

        changed = !hasSameSelection(nextSelectedReferences);
        selectedReferences = nextSelectedReferences;

        if (existingSelectionIndex > -1) {
          removeOutlineObject(reference);
        } else {
          if (!options.shiftKey) {
            detachOutlineChildren({ disposeChildren: true, clearRegistry: true });
          }
          addOutlineObject(reference);
        }

        return changed;
      }

      changed =
        selectedReferences.length !== 1 ||
        getSelectionKey(selectedReferences[0]) !== referenceKey ||
        outlineScene.children.length !== 1;
      detachOutlineChildren({ disposeChildren: true, clearRegistry: true });
      addOutlineObject(reference);
      selectedReferences = [reference];
      return changed;
    },
    clearSelection() {
      const hadSelection = selectedReferences.length > 0 || outlineScene.children.length > 0;
      selectedReferences = [];
      detachOutlineChildren({ disposeChildren: true, clearRegistry: true });
      return hadSelection;
    },
    prepareForSceneReplacement() {
      const selectedIds: SelectionPersistence[] = [];
      selectedReferences.forEach((reference) => {
        const id = reference.jsonObject.id;
        if (!id) {
          return;
        }
        selectedIds.push({
          id,
          ...(reference.instanceId === undefined ? {} : { instanceId: reference.instanceId })
        });
      });
      selectedReferences = [];
      detachOutlineChildren({ disposeChildren: true, clearRegistry: true });
      return selectedIds;
    },
    restoreSelectionByIds(selections, options) {
      selectedReferences = [];
      detachOutlineChildren();

      selections.forEach(({ id, instanceId }) => {
        const threeObject = options.findThreeById(id);
        if (!threeObject) {
          return;
        }
        const jsonObject = options.findJsonByUuid(threeObject.uuid);
        addOutlineObject({
          sceneObject: threeObject,
          jsonObject: jsonObject ?? ({} as T),
          instanceId
        });
        if (jsonObject) {
          selectedReferences.push({ sceneObject: threeObject, jsonObject, instanceId });
        }
      });
    },
    removeInvisibleSelections(findThreeById) {
      let changed = false;
      const referencesToRemove: SelectionReference<T>[] = [];

      selectedReferences = selectedReferences.filter((selectedReference) => {
        const selectedId = selectedReference.jsonObject.id;
        if (!selectedId) {
          referencesToRemove.push(selectedReference);
          changed = true;
          return false;
        }

        let threeObject = findThreeById(selectedId);
        if (!threeObject) {
          referencesToRemove.push(selectedReference);
          changed = true;
          return false;
        }

        let visible = threeObject.visible;
        while (threeObject.parent && visible) {
          threeObject = threeObject.parent;
          visible = threeObject.visible;
        }

        if (!visible) {
          referencesToRemove.push(selectedReference);
          changed = true;
          return false;
        }

        return true;
      });

      referencesToRemove.forEach(removeOutlineObject);

      return changed;
    },
    refreshOutline(findThreeById) {
      if (selectedReferences.length === 0) {
        return;
      }

      detachOutlineChildren();
      selectedReferences.forEach((selectedReference) => {
        const selectedId = selectedReference.jsonObject.id;
        if (!selectedId) {
          return;
        }
        const threeObject = findThreeById(selectedId);
        if (threeObject) {
          addOutlineObject({ ...selectedReference, sceneObject: threeObject });
        }
      });
    },
    destroy() {
      selectedReferences = [];
      detachOutlineChildren({ disposeChildren: true, clearRegistry: true });
    }
  };
}
