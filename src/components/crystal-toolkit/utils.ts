import * as THREE from 'three';

const SHARED_THREE_RESOURCE_KEY = '__mcvSharedResource';

type DisposableThreeResource = {
  dispose?: () => void;
  userData?: Record<string, any>;
};

export function markSharedThreeResource<T extends DisposableThreeResource>(resource: T): T {
  resource.userData = resource.userData || {};
  resource.userData[SHARED_THREE_RESOURCE_KEY] = true;
  return resource;
}

export function isSharedThreeResource(resource?: DisposableThreeResource | null) {
  return Boolean(resource?.userData?.[SHARED_THREE_RESOURCE_KEY]);
}

function disposeNode(node: THREE.Object3D) {
  if (node instanceof THREE.Mesh) {
    if (node.geometry && !isSharedThreeResource(node.geometry)) {
      node.geometry.dispose();
    }
    if (node.material) {
      const materials = !Array.isArray(node.material) ? [node.material] : node.material;
      materials.forEach((mtrl) => {
        if (isSharedThreeResource(mtrl)) {
          return;
        }
        const material = mtrl as THREE.Material & Partial<Record<string, any>>;
        material.map?.dispose?.();
        material.lightMap?.dispose?.();
        material.bumpMap?.dispose?.();
        material.normalMap?.dispose?.();
        material.specularMap?.dispose?.();
        material.envMap?.dispose?.();
        material.alphaMap?.dispose?.();
        material.aoMap?.dispose?.();
        material.displacementMap?.dispose?.();
        material.emissiveMap?.dispose?.();
        material.gradientMap?.dispose?.();
        material.metalnessMap?.dispose?.();
        material.roughnessMap?.dispose?.();
        material.dispose(); // disposes any programs associated with the material
      });
    }
  }
} // disposeNode

export function disposeSceneHierarchy(scene: THREE.Object3D) {
  scene.children.forEach((childNode) => {
    disposeSceneHierarchy(childNode);
    disposeNode(childNode);
  });
}

// this will give the x/y coordinate in the normalized device coordinates, whose center is (0,0) and w-h is 2
// NW -> -1 / 1
// NE -> 1 / 1
// SW -> - 1 / -1
// SE -> 1 / -1
// let' suppose i have a (500, 500) viewport, i click on the center
// CENTER = > ( 250 / 500 * 2 - 1 = 0, - (250/500) * 2 + 1 = 0)
// SE (500/500 * 2 -1 ) = 1, ( - (500/500) * 2 + 1 = -1)
// SW (0 - 1) = -1, -(500 / 500 ) * 2 + 1 = -1)
export function getThreeScreenCoordinate(
  size: { width: number; height: number },
  clientX: number,
  clientY: number
) {
  return new THREE.Vector2((clientX / size.width) * 2 - 1, -(clientY / size.height) * 2 + 1);
}

export function getScreenCoordinate(
  size: { width: number; height: number },
  point: THREE.Vector3,
  camera: THREE.Camera
) {
  point = point.clone();
  const vector = point.project(camera);
  // we are in NDC space
  vector.x = ((vector.x + 1) / 2) * size.width;
  vector.y = (-(vector.y - 1) / 2) * size.height;
  return vector;
}

export function moveAndUnprojectPoint(
  size: { width: number; height: number },
  point: THREE.Vector3,
  camera: THREE.Camera,
  delta?: { x: number; y: number }
) {
  point = point.clone();
  if (delta) {
    point.x = point.x + delta.x < 0 ? point.x - delta.x : point.x + delta.x;
    point.y = point.y + delta.y < 0 ? point.y - delta.y : point.y + delta.y;
  }
  // go back in NDC space
  point.x = (point.x / size.width) * 2 - 1;
  point.y = -(point.y / size.height) * 2 + 1;
  // go back in scene coordinate
  const vector = point.unproject(camera);
  return vector;
}

export interface Action<T, P> {
  type: T;
  payload: P;
}

export interface ObjectRegistryApi {
  clear(): void;
  addToObjectRegisty(o: THREE.Object3D): void;
  deleteObject(o: THREE.Object3D): void;
  registryHasObject(o: THREE.Object3D): boolean;
  getObjectFromRegistry(uuid: string): THREE.Object3D;
}

export function createObjectRegistry(): ObjectRegistryApi {
  let objectRegistry: Record<string, THREE.Object3D> = {};

  return {
    clear() {
      objectRegistry = {};
    },
    addToObjectRegisty(o) {
      objectRegistry[o.uuid] = o;
    },
    deleteObject(o) {
      if (!objectRegistry[o.uuid]) {
        console.warn('Object does not exits');
      }
      delete objectRegistry[o.uuid];
    },
    registryHasObject(o) {
      return Boolean(objectRegistry[o.uuid]);
    },
    getObjectFromRegistry(uuid) {
      if (!objectRegistry[uuid]) {
        console.warn('Non existent object', uuid);
      }
      return objectRegistry[uuid];
    }
  };
}

/**
 * Takes an array of arrays and merges the inner arrays into a single array.
 * This is a scalable alternative to [].concat.apply([], arr)
 */
export function mergeInnerArrays<T>(arr: Array<T | T[]>): Array<T> {
  const result: T[] = [];
  arr.forEach((p) => {
    if (Array.isArray(p)) {
      p.forEach((d) => result.push(d));
    } else {
      result.push(p);
    }
  });
  return result;
}
