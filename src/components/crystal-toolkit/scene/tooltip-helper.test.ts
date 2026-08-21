import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createTooltipController } from './tooltip-helper';

const createTooltipObject = (color: string) => {
  const object = new THREE.Object3D();
  object.add(new THREE.Mesh(new THREE.SphereGeometry(1), new THREE.MeshStandardMaterial({ color })));
  return object;
};

const getMeshColor = (object: THREE.Object3D) => {
  const mesh = object.children[0] as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  return `#${mesh.material.color.getHexString()}`;
};

const getInstanceColor = (mesh: THREE.InstancedMesh, index: number) => {
  const color = new THREE.Color();
  mesh.getColorAt(index, color);
  return `#${color.getHexString()}`;
};

describe('tooltip highlighting', () => {
  it('restores the previous object color before highlighting the next hovered object', () => {
    const controller = createTooltipController();
    const firstObject = createTooltipObject('#345678');
    const secondObject = createTooltipObject('#876543');
    const firstJson = { tooltip: 'first atom', color: '#345678' };
    const secondJson = { tooltip: 'second atom', color: '#876543' };

    controller.updateTooltip(new THREE.Vector3(), firstJson, firstObject);
    controller.updateTooltip(new THREE.Vector3(), secondJson, secondObject);

    expect(getMeshColor(firstObject)).toBe('#345678');
    expect(getMeshColor(secondObject)).not.toBe('#876543');
  });

  it('highlights only the hovered instance in a batched mesh', () => {
    const controller = createTooltipController();
    const object = new THREE.Object3D();
    const mesh = new THREE.InstancedMesh(
      new THREE.SphereGeometry(1),
      new THREE.MeshStandardMaterial(),
      2
    );
    mesh.setColorAt(0, new THREE.Color('#345678'));
    mesh.setColorAt(1, new THREE.Color('#345678'));
    object.add(mesh);

    controller.updateTooltip(
      new THREE.Vector3(),
      { tooltip: 'second atom', color: '#345678' },
      object,
      1
    );

    expect(getInstanceColor(mesh, 0)).toBe('#345678');
    expect(getInstanceColor(mesh, 1)).not.toBe('#345678');
  });
});
