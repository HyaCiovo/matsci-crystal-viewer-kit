import * as THREE from 'three';
import { JSON3DObject } from './constants';
import { SceneJsonObject } from './simple-scene';
import { ThreeBuilder } from './three_builder';
import {
  calculateBondTransform,
  calculatePhononDisplacement,
  createBondKey,
  type EigenVector,
  parseBondKey
} from './phonon-calculations';
import type { AnimationController } from './animation-helper';

type PhononAnimationState = {
  clock: THREE.Clock;
  atomNumber: number;
  atomMeshes: THREE.Object3D[];
  bondMeshes: Map<string, THREE.Mesh>;
  unitCellAtomIndexArray: number[];
};

export function createPhononAnimationController(
  _objectBuilder: ThreeBuilder,
  A: number,
  phases: number[],
  omega: number,
  eigenVectors: EigenVector[],
  velocity: number
): AnimationController {
  const state: PhononAnimationState = {
    clock: new THREE.Clock(),
    atomNumber: Array.isArray(phases) ? phases.length : 0,
    atomMeshes: [],
    bondMeshes: new Map<string, THREE.Mesh>(),
    unitCellAtomIndexArray: [],
  };

  return {
    reset() {
      state.atomMeshes = new Array(state.atomNumber);
      state.unitCellAtomIndexArray = new Array<number>(state.atomNumber);
      state.bondMeshes = new Map<string, THREE.Mesh>();
    },
    buildAnimationSupport(json, three) {
      if (json.type === JSON3DObject.SPHERES) {
        if (json._meta === undefined) return;
        const atomIndex = json._meta[0].atom_idx?.[0];
        if (atomIndex === undefined) return;
        const unitCellAtomIndex = json._meta[0].unit_cell_atom_idx?.[0];
        if (atomIndex === undefined || unitCellAtomIndex === undefined) return;
        state.unitCellAtomIndexArray[atomIndex] = unitCellAtomIndex;

        const mesh = three.children[0] as THREE.Mesh;
        state.atomMeshes[atomIndex] = mesh;
      } else if (json.type === JSON3DObject.CYLINDERS) {
        const meta = json._meta;
        if (!meta) return;

        for (let i = meta.length - 1; i >= 0; i--) {
          const pair = meta[i].atom_idx;
          if (!pair || pair.length < 2) return;
          const [atomIndex1, atomIndex2] = pair;
          const bondKey = createBondKey(atomIndex1, atomIndex2);

          if (!state.bondMeshes.has(bondKey)) {
            const mesh = three.children[i] as THREE.Mesh | undefined;
            if (mesh) state.bondMeshes.set(bondKey, mesh);
          } else {
            const child = three.children[i];
            if (child) three.remove(child);
          }
        }
      }
    },
    updateTime(_time) {},
    animate() {
      const delta = state.clock.getElapsedTime();
      const modifiedDelta = delta * velocity;
      const tempAtomPosition = new Array(state.atomNumber);

      state.atomMeshes.forEach((mesh, atomIndex) => {
        let base = mesh.userData.basePos as THREE.Vector3 | undefined;
        const unitCellAtomIndex = state.unitCellAtomIndexArray[atomIndex];

        if (!(base && base.isVector3)) {
          base = mesh.position.clone();
          mesh.userData.basePos = base;
        }

        const phase = phases[unitCellAtomIndex];
        const eigenVector = eigenVectors[unitCellAtomIndex];
        const theta = phase - omega * modifiedDelta;
        const displacement = calculatePhononDisplacement(A, eigenVector, theta);
        const newPosition = base.clone().add(displacement);
        mesh.position.copy(newPosition);
        tempAtomPosition[atomIndex] = newPosition;
      });

      state.bondMeshes.forEach((mesh, bondKey) => {
        const [atomIndex1, atomIndex2] = parseBondKey(bondKey);
        const atom1Pos = tempAtomPosition[atomIndex1] as THREE.Vector3 | undefined;
        const atom2Pos = tempAtomPosition[atomIndex2] as THREE.Vector3 | undefined;
        if (!atom1Pos || !atom2Pos) {
          return;
        }

        const { midpoint, quaternion, length } = calculateBondTransform(atom1Pos, atom2Pos);
        mesh.position.copy(midpoint);
        mesh.setRotationFromQuaternion(quaternion);
        mesh.scale.y = length;
      });
    },
  };
}
