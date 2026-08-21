import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createSelectionController } from './selection-controller';

type TestObject = {
  id: string;
};

const selectionOptions = {
  multiSelectEnabled: false,
  shiftKey: false
};

const createInstancedHost = () => {
  const host = new THREE.Object3D();
  const mesh = new THREE.InstancedMesh(
    new THREE.SphereGeometry(1),
    new THREE.MeshBasicMaterial(),
    2
  );
  const firstMatrix = new THREE.Matrix4().makeTranslation(2, 0, 0);
  const secondMatrix = new THREE.Matrix4().makeTranslation(-3, 1, 0);
  mesh.setMatrixAt(0, firstMatrix);
  mesh.setMatrixAt(1, secondMatrix);
  mesh.setColorAt(0, new THREE.Color('#ff0000'));
  mesh.setColorAt(1, new THREE.Color('#00ff00'));
  host.add(mesh);
  return { host, mesh, firstMatrix, secondMatrix };
};

const getOutlineMesh = (outlineScene: THREE.Scene) => {
  let mesh: THREE.InstancedMesh | undefined;
  outlineScene.traverse((object) => {
    if (object instanceof THREE.InstancedMesh) {
      mesh = object;
    }
  });
  return mesh as THREE.InstancedMesh;
};

const getInstanceMatrix = (mesh: THREE.InstancedMesh, index: number) => {
  const matrix = new THREE.Matrix4();
  mesh.getMatrixAt(index, matrix);
  return matrix;
};

const getInstanceColor = (mesh: THREE.InstancedMesh, index: number) => {
  const color = new THREE.Color();
  mesh.getColorAt(index, color);
  return color;
};

describe('selection controller', () => {
  it('outlines only the selected instance in a batched mesh', () => {
    const outlineScene = new THREE.Scene();
    const controller = createSelectionController<TestObject>(outlineScene);
    const { host, mesh, secondMatrix } = createInstancedHost();

    controller.applySelection(
      { sceneObject: host, jsonObject: { id: 'atoms' }, instanceId: 1 },
      selectionOptions
    );

    const outlineMesh = getOutlineMesh(outlineScene);
    expect(outlineMesh.count).toBe(1);
    expect(getInstanceMatrix(outlineMesh, 0).elements).toEqual(secondMatrix.elements);
    expect(getInstanceMatrix(outlineMesh, 0).elements).not.toEqual(getInstanceMatrix(mesh, 0).elements);
    expect(getInstanceColor(outlineMesh, 0).getHex()).toBe(new THREE.Color('#00ff00').getHex());
  });

  it('switches the outline when another instance in the same batch is selected', () => {
    const outlineScene = new THREE.Scene();
    const controller = createSelectionController<TestObject>(outlineScene);
    const { host, firstMatrix, secondMatrix } = createInstancedHost();
    const jsonObject = { id: 'atoms' };

    controller.applySelection({ sceneObject: host, jsonObject, instanceId: 0 }, selectionOptions);
    controller.applySelection({ sceneObject: host, jsonObject, instanceId: 1 }, selectionOptions);

    expect(outlineScene.children).toHaveLength(1);
    const outlineMesh = getOutlineMesh(outlineScene);
    expect(outlineMesh.count).toBe(1);
    expect(getInstanceMatrix(outlineMesh, 0).elements).toEqual(secondMatrix.elements);
    expect(getInstanceMatrix(outlineMesh, 0).elements).not.toEqual(firstMatrix.elements);
  });

  it('keeps cloning the complete object for non-instanced selections', () => {
    const outlineScene = new THREE.Scene();
    const controller = createSelectionController<TestObject>(outlineScene);
    const host = new THREE.Object3D();
    host.add(
      new THREE.Mesh(new THREE.SphereGeometry(1), new THREE.MeshBasicMaterial()),
      new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial())
    );

    controller.applySelection({ sceneObject: host, jsonObject: { id: 'object' } }, selectionOptions);

    expect(outlineScene.children[0].children).toHaveLength(2);
    expect(outlineScene.children[0].children.every((child) => child instanceof THREE.Mesh)).toBe(true);
  });
});
