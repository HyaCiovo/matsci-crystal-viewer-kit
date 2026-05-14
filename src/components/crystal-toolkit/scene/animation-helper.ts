import * as THREE from 'three';
import { BufferAttribute, BufferGeometry } from 'three';
import { JSON3DObject } from './constants';
import { SceneJsonObject } from './simple-scene';
import { ThreeBuilder } from './three_builder';
import {
  type AnimationType,
  calculateCylinderTrackValues,
  createConvexAnimationGeometry,
  createConvexLineTrackValues,
  createLineValueTrackValues,
  getAnimationDuration,
  type PositionPairAnimation,
  type Vec3Animation,
  calculatePositionAnimationValues,
} from './animation-calculations';

export interface AnimationController {
  reset(): void;
  buildAnimationSupport(json: SceneJsonObject, three: THREE.Object3D): void;
  updateTime(time: number): void;
  animate(): void;
}

type AnimationControllerState = {
  mixers: THREE.AnimationMixer[];
  clock: THREE.Clock;
  lineGeometriesToUpdate: THREE.LineSegments[];
};

function pushAnimations(
  state: AnimationControllerState,
  name: string,
  duration: number,
  tracks: THREE.KeyframeTrack[],
  rootObject: THREE.Object3D
) {
  const clip = new THREE.AnimationClip(name, duration, tracks);
  const mixer = new THREE.AnimationMixer(rootObject);
  state.mixers.push(mixer);
  const action = mixer.clipAction(clip);
  action.play();
}

function updateMixers(state: AnimationControllerState, timeOrDelta: number, absolute = false) {
  state.mixers.forEach((mixer) => (absolute ? mixer.setTime(timeOrDelta) : mixer.update(timeOrDelta)));
}

function updateLineGeometries(state: AnimationControllerState) {
  state.lineGeometriesToUpdate.forEach((line) => {
    const geometry = line.geometry as THREE.BufferGeometry;
    const values = (line as any).value;
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(values), 3));
    (geometry.attributes.position as BufferAttribute).needsUpdate = true;
  });
}

function handlePositionAnimation(
  state: AnimationControllerState,
  json: SceneJsonObject,
  three: THREE.Object3D,
  keyframes: number[],
  keyframeCount: number,
  animationType: AnimationType
) {
  const animation = (json.animate ?? []) as Vec3Animation;
  const values = calculatePositionAnimationValues(json.positions![0], animation, animationType);
  const positionTrack = new THREE.VectorKeyframeTrack('.position', [...keyframes], values);
  pushAnimations(
    state,
    'Action',
    getAnimationDuration(animationType, keyframeCount),
    [positionTrack],
    three
  );
}

function handleCylinderAnimation(
  state: AnimationControllerState,
  objectBuilder: ThreeBuilder,
  json: SceneJsonObject,
  three: THREE.Object3D,
  animations: PositionPairAnimation[],
  keyframes: number[],
  keyframeCount: number,
  animationType: AnimationType
) {
  animations.forEach((animation, index) => {
    const positionPair = json.positionPairs![index];
    const { positionValues, quaternionValues, scaleValues } = calculateCylinderTrackValues(
      animation,
      positionPair,
      animationType,
      (target) => objectBuilder.getSegmentInfo(target)
    );

    const positionTrack = new THREE.VectorKeyframeTrack('.position', keyframes, positionValues);
    const quaternionTrack = new THREE.QuaternionKeyframeTrack('.quaternion', keyframes, quaternionValues);
    const scaleTrack = new THREE.VectorKeyframeTrack('.scale', keyframes, scaleValues);

    pushAnimations(
      state,
      `Cylinder-${index}`,
      getAnimationDuration(animationType, keyframeCount),
      [positionTrack, quaternionTrack, scaleTrack],
      three.children[index]
    );
  });
}

function handleLineAnimation(
  state: AnimationControllerState,
  json: SceneJsonObject,
  three: THREE.Object3D,
  animations: Vec3Animation[],
  keyframes: number[],
  keyframeCount: number
) {
  const lines = three.children[0] as THREE.LineSegments;
  const { currentValues, trackValues } = createLineValueTrackValues(
    lines.geometry as THREE.BufferGeometry,
    json.positions!,
    animations
  );
  (lines as any).value = [...currentValues];
  const valueTrack = new THREE.NumberKeyframeTrack('.value', keyframes, trackValues);
  state.lineGeometriesToUpdate.push(lines);
  pushAnimations(state, 'Lines', keyframeCount, [valueTrack], lines);
}

function handleConvexAnimation(
  state: AnimationControllerState,
  json: SceneJsonObject,
  three: THREE.Object3D,
  animations: Vec3Animation[],
  keyframes: number[],
  keyframeCount: number
) {
  const mesh = three.children[0] as THREE.Mesh;
  const lines = three.children[1] as THREE.LineSegments;
  const meshGeometry = mesh.geometry as BufferGeometry;
  meshGeometry.morphAttributes.position = [];

  const convexGeometry = createConvexAnimationGeometry(json.positions!, animations);
  meshGeometry.morphAttributes.position[0] = convexGeometry.attributes.position;
  mesh.morphTargetInfluences = [0];

  const morphTargetTrack = new THREE.NumberKeyframeTrack(
    '.morphTargetInfluences',
    keyframes,
    [0.0, 1.0]
  );
  pushAnimations(state, 'Convex', keyframeCount, [morphTargetTrack], mesh);

  const edges = new THREE.EdgesGeometry(convexGeometry);
  const { currentValues, trackValues } = createConvexLineTrackValues(
    lines.geometry as THREE.BufferGeometry,
    edges
  );
  (lines as any).value = [...currentValues];
  const lineValueTrack = new THREE.NumberKeyframeTrack('.value', keyframes, trackValues);
  state.lineGeometriesToUpdate.push(lines);
  pushAnimations(state, 'Convexlines', keyframeCount, [lineValueTrack], lines);
}

export function createAnimationController(objectBuilder: ThreeBuilder): AnimationController {
  const state: AnimationControllerState = {
    mixers: [],
    clock: new THREE.Clock(),
    lineGeometriesToUpdate: [],
  };

  return {
    reset() {
      state.mixers.forEach((mixer) => mixer.stopAllAction());
      state.mixers = [];
      state.lineGeometriesToUpdate = [];
    },
    buildAnimationSupport(json, three) {
      const animations = (json.animate ?? []) as any[];
      const keyframes = json.keyframes!;
      const keyframeCount = keyframes.length;
      const animationType = (json.animateType ?? 'displacement') as AnimationType;

      if (json.type === JSON3DObject.SPHERES || json.type === JSON3DObject.CUBES) {
        handlePositionAnimation(state, json, three, keyframes, keyframeCount, animationType);
      } else if (json.type === JSON3DObject.CYLINDERS) {
        handleCylinderAnimation(
          state,
          objectBuilder,
          json,
          three,
          animations as PositionPairAnimation[],
          keyframes,
          keyframeCount,
          animationType
        );
      } else if (json.type === JSON3DObject.LINES) {
        handleLineAnimation(state, json, three, animations as Vec3Animation[], keyframes, keyframeCount);
      } else if (json.type === JSON3DObject.CONVEX) {
        handleConvexAnimation(state, json, three, animations as Vec3Animation[], keyframes, keyframeCount);
      } else if (json.type === JSON3DObject.BEZIER) {
        console.warn('Animation not supported', json.type);
      } else {
        console.warn('Animation not supported', json.type);
      }
    },
    updateTime(time) {
      updateMixers(state, time, true);
      updateLineGeometries(state);
    },
    animate() {
      updateMixers(state, state.clock.getDelta());
      updateLineGeometries(state);
    },
  };
}
