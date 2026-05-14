import * as THREE from 'three';
import { BufferAttribute, type BufferGeometry } from 'three';
import { ConvexGeometry } from 'three/examples/jsm/geometries/ConvexGeometry.js';

export type AnimationType = 'displacement' | 'position' | string;
export type Vec3AnimationFrame = [number, number, number];
export type Vec3Animation = Vec3AnimationFrame[];
export type PositionPairAnimationFrame = [Vec3AnimationFrame, Vec3AnimationFrame];
export type PositionPairAnimation = PositionPairAnimationFrame[];
export type CylinderInfo = {
  position: number[];
  scale: number;
  quaternion: THREE.Quaternion;
};
export type CylinderInfoResolver = (
  target: [Vec3AnimationFrame, Vec3AnimationFrame]
) => CylinderInfo;

const warnUnknownAnimationType = (animationType: AnimationType) => {
  console.warn(`Unknown animationType: ${animationType}`);
};

export const getAnimationDuration = (animationType: AnimationType, keyframeCount: number) =>
  animationType === 'displacement' ? -1 : keyframeCount;

export function calculatePositionAnimationValues(
  basePosition: Vec3AnimationFrame,
  animation: Vec3Animation,
  animationType: AnimationType
) {
  const values: number[] = [];

  if (animationType === 'displacement') {
    animation.forEach((frame) => {
      values.push(frame[0], frame[1], frame[2]);
    });
    return values;
  }

  if (animationType === 'position') {
    animation.forEach((frame) => {
      values.push(frame[0] - basePosition[0], frame[1] - basePosition[1], frame[2] - basePosition[2]);
    });
    return values;
  }

  warnUnknownAnimationType(animationType);
  return values;
}

export function calculateObjectPositionTrackValues(
  currentPosition: THREE.Vector3,
  animation: Vec3Animation,
  animationType: AnimationType
) {
  const basePosition: Vec3AnimationFrame = [
    currentPosition.x,
    currentPosition.y,
    currentPosition.z
  ];
  const values: number[] = [];

  if (animationType === 'displacement') {
    animation.forEach((frame) => {
      values.push(
        basePosition[0] + frame[0],
        basePosition[1] + frame[1],
        basePosition[2] + frame[2]
      );
    });
    return values;
  }

  if (animationType === 'position') {
    animation.forEach((frame) => {
      values.push(frame[0], frame[1], frame[2]);
    });
    return values;
  }

  warnUnknownAnimationType(animationType);
  return values;
}

export function calculateCylinderTarget(
  positionPair: [Vec3AnimationFrame, Vec3AnimationFrame],
  frame: PositionPairAnimationFrame,
  animationType: AnimationType
): [Vec3AnimationFrame, Vec3AnimationFrame] | null {
  if (animationType === 'displacement') {
    return [
      [
        positionPair[0][0] + frame[0][0],
        positionPair[0][1] + frame[0][1],
        positionPair[0][2] + frame[0][2]
      ],
      [
        positionPair[1][0] + frame[1][0],
        positionPair[1][1] + frame[1][1],
        positionPair[1][2] + frame[1][2]
      ]
    ];
  }

  if (animationType === 'position') {
    return [
      [frame[0][0], frame[0][1], frame[0][2]],
      [frame[1][0], frame[1][1], frame[1][2]]
    ];
  }

  warnUnknownAnimationType(animationType);
  return null;
}

export function calculateCylinderTrackValues(
  animation: PositionPairAnimation,
  positionPair: [Vec3AnimationFrame, Vec3AnimationFrame],
  animationType: AnimationType,
  getCylinderInfo: CylinderInfoResolver
) {
  const positionValues: number[] = [];
  const quaternionValues: number[] = [];
  const scaleValues: number[] = [];

  animation.forEach((frame) => {
    const target = calculateCylinderTarget(positionPair, frame, animationType);
    if (!target) {
      return;
    }

    const {
      position,
      scale,
      quaternion
    } = getCylinderInfo(target);

    positionValues.push(...position);
    quaternionValues.push(quaternion.x, quaternion.y, quaternion.z, quaternion.w);
    scaleValues.push(1, scale, 1);
  });

  return { positionValues, quaternionValues, scaleValues };
}

export function calculateLineAnimationPoints(
  positions: Vec3AnimationFrame[],
  animations: Vec3Animation[]
) {
  return positions.map((position, index) => {
    const lineAnimation = animations[index];
    const values: number[] = [];
    lineAnimation.forEach((frame) => {
      values.push(position[0] + frame[0], position[1] + frame[1], position[2] + frame[2]);
    });
    return values;
  });
}

export function createLineValueTrackValues(
  lineGeometry: BufferGeometry,
  positions: Vec3AnimationFrame[],
  animations: Vec3Animation[]
) {
  const currentValues = Array.from((lineGeometry.attributes.position as BufferAttribute).array);
  const animationPoints = calculateLineAnimationPoints(positions, animations);
  return {
    currentValues,
    trackValues: [...currentValues, ...animationPoints.flat()]
  };
}

export function createConvexAnimationGeometry(
  positions: Vec3AnimationFrame[],
  animations: Vec3Animation[]
) {
  const points = positions.map((position, index) => {
    const frame = animations[index][0];
    return new THREE.Vector3(
      position[0] + frame[0],
      position[1] + frame[1],
      position[2] + frame[2]
    );
  });

  return new ConvexGeometry(points);
}

export function createConvexLineTrackValues(
  lineGeometry: BufferGeometry,
  convexGeometry: ConvexGeometry
) {
  const currentValues = Array.from((lineGeometry.attributes.position as BufferAttribute).array);
  const nextValues = Array.from(convexGeometry.attributes.position.array);
  return {
    currentValues,
    trackValues: [...currentValues, ...nextValues]
  };
}
