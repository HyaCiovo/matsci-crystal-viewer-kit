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
});
