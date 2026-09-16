import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { defaults } from './constants';
import { createInsetController } from './inset-helper';
import { ThreeBuilder } from './three_builder';

const axisJson: Parameters<typeof createInsetController>[1] = {
  name: 'axes',
  contents: [
    {
      type: 'arrows',
      positionPairs: [[[0, 0, 0], [1, 0, 0]]],
      color: 'red',
      radius: 0.07,
      headLength: 0.24,
      headWidth: 0.14
    },
    {
      type: 'arrows',
      positionPairs: [[[0, 0, 0], [0, 1, 0]]],
      color: 'green',
      radius: 0.07,
      headLength: 0.24,
      headWidth: 0.14
    },
    {
      type: 'arrows',
      positionPairs: [[[0, 0, 0], [0, 0, 1]]],
      color: 'blue',
      radius: 0.07,
      headLength: 0.24,
      headWidth: 0.14
    }
  ]
};

const createAxis = (builder: ThreeBuilder) => {
  const axis = new THREE.Object3D();
  axisJson.contents?.forEach((objectJson) =>
    axis.add(builder.makeObject(objectJson as Record<string, any>, new THREE.Object3D()))
  );
  return axis;
};

const getArrowRadius = (axis: THREE.Object3D) =>
  ((axis.children[0].children[0] as THREE.Mesh).geometry as THREE.CylinderGeometry).parameters.radiusTop;

describe('Inset controller', () => {
  it('keeps the axis scale stable after returning from a selected object', () => {
    const builder = new ThreeBuilder(defaults);
    const axis = createAxis(builder);
    const baseScene = new THREE.Scene();
    const lights = new THREE.Object3D();
    lights.name = 'lights';
    baseScene.add(lights);
    const controller = createInsetController(
      axis,
      structuredClone(axisJson),
      baseScene,
      [0, 0, 4],
      new THREE.OrthographicCamera()
    );
    const selectedObject = new THREE.Mesh(new THREE.SphereGeometry(1), new THREE.MeshBasicMaterial());

    controller.showAxis();
    const initialRadius = getArrowRadius(axis);

    controller.showObject([selectedObject]);
    controller.showAxis();

    expect(getArrowRadius(axis)).toBeCloseTo(initialRadius);
  });
});
