import { Quaternion, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import {
  CameraReducerAction,
  cameraReducer,
  initialState,
} from './camera-reducer';

describe('cameraReducer', () => {
  const payload = {
    componentId: 'scene-1',
    position: new Vector3(1, 2, 3),
    quaternion: new Quaternion(0, 0, 0, 1),
    zoom: 1.5,
  };

  it('reuses state for an unchanged camera update', () => {
    const state = cameraReducer(initialState, {
      type: CameraReducerAction.NEW_POSITION,
      payload,
    });

    const repeatedState = cameraReducer(state, {
      type: CameraReducerAction.NEW_POSITION,
      payload: {
        ...payload,
        position: payload.position.clone(),
        quaternion: payload.quaternion.clone(),
      },
    });

    expect(repeatedState).toBe(state);
  });

  it('creates a new state when the camera position changes', () => {
    const state = cameraReducer(initialState, {
      type: CameraReducerAction.NEW_POSITION,
      payload,
    });

    const updatedState = cameraReducer(state, {
      type: CameraReducerAction.NEW_POSITION,
      payload: {
        ...payload,
        position: new Vector3(3, 2, 1),
      },
    });

    expect(updatedState).not.toBe(state);
    expect(updatedState.position).toEqual(new Vector3(3, 2, 1));
  });
});
