import * as THREE from 'three';

type ComplexPair = [number, number];
export type EigenVector = [ComplexPair, ComplexPair, ComplexPair];

export const createBondKey = (a: number, b: number) => (a < b ? `${a}->${b}` : `${b}->${a}`);

export const parseBondKey = (key: string): [number, number] => {
  const [bond1Str, bond2Str] = key.split('->');
  return [Number(bond1Str), Number(bond2Str)];
};

export function calculatePhononDisplacement(
  amplitude: number,
  eigenVector: EigenVector,
  theta: number
) {
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);

  return new THREE.Vector3(
    amplitude * (eigenVector[0][0] * cos - eigenVector[0][1] * sin),
    amplitude * (eigenVector[1][0] * cos - eigenVector[1][1] * sin),
    amplitude * (eigenVector[2][0] * cos - eigenVector[2][1] * sin)
  );
}

export function calculateBondTransform(atom1Pos: THREE.Vector3, atom2Pos: THREE.Vector3) {
  const rel = atom2Pos.clone().sub(atom1Pos);
  const midpoint = atom1Pos.clone().add(atom2Pos).multiplyScalar(0.5);
  const quaternion = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    rel.clone().normalize()
  );

  return {
    midpoint,
    quaternion,
    length: rel.length()
  };
}
