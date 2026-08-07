import { Quaternion, Vector3 } from 'three';

export interface Action<T, P> {
  type: T;
  payload: P;
}

export interface CameraState {
  quaternion?: Quaternion;
  position?: Vector3;
  zoom?: number;
  setByComponentId?: string;
  following?: boolean;
}

export interface CameraActionPayload {
  quaternion?: Quaternion;
  position?: Vector3;
  zoom?: number;
  componentId?: string;
  following?: boolean;
}

export enum CameraReducerAction {
  NEW_POSITION = 'follow_camera',
  STOP_FOLLOWING = 'stop_following',
  START_FOLLOWING = 'start_following',
}

export const initialState: CameraState = {
  following: true,
};

function hasSameVector(
  current?: Vector3,
  next?: Vector3,
): boolean {
  return current === next || Boolean(current && next && current.equals(next));
}

function hasSameQuaternion(
  current?: Quaternion,
  next?: Quaternion,
): boolean {
  return current === next || Boolean(current && next && current.equals(next));
}

function hasSameCameraPosition(
  state: CameraState,
  payload: CameraActionPayload,
): boolean {
  return (
    state.setByComponentId === payload.componentId &&
    state.zoom === payload.zoom &&
    hasSameVector(state.position, payload.position) &&
    hasSameQuaternion(state.quaternion, payload.quaternion)
  );
}

export function cameraReducer(
  state: CameraState,
  { type, payload }: Action<CameraReducerAction, CameraActionPayload>
): CameraState {
  switch (type) {
    case CameraReducerAction.NEW_POSITION:
      if (hasSameCameraPosition(state, payload)) {
        return state;
      }
      return {
        quaternion: payload.quaternion?.clone(),
        position: payload.position?.clone(),
        zoom: payload.zoom,
        setByComponentId: payload.componentId,
        following: state.following,
      };
    case CameraReducerAction.STOP_FOLLOWING:
      return { ...state, following: false };
    case CameraReducerAction.START_FOLLOWING:
      return { ...state, following: true };
    default:
      return state;
  }
}
