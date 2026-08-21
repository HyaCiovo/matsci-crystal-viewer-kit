import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createSceneObjectRegistry } from './scene-object-registry';

describe('scene object registry', () => {
  it('preserves the picked instance id when resolving an instanced child', () => {
    const registry = createSceneObjectRegistry<{ tooltip: string }>();
    const scene = new THREE.Scene();
    const hostObject = new THREE.Object3D();
    const instancedMesh = new THREE.InstancedMesh(
      new THREE.SphereGeometry(1),
      new THREE.MeshBasicMaterial(),
      2
    );

    scene.add(hostObject);
    hostObject.add(instancedMesh);
    registry.registerObject(hostObject, { tooltip: 'atom' });

    expect(registry.getParentObject(instancedMesh, 1)).toEqual({
      sceneObject: hostObject,
      jsonObject: { tooltip: 'atom' },
      instanceId: 1
    });
  });
});
