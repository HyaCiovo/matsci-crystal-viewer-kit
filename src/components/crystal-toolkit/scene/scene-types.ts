import { JSON3DObject, ThreePosition } from './constants';

export type SceneMeta = {
  atom_idx?: number[];
  unit_cell_atom_idx?: number[];
};

export interface SceneJsonObject {
  name?: string;
  contents?: SceneJsonObject[];
  type?: JSON3DObject | `${JSON3DObject}`;
  clickable?: boolean;
  color?: string;
  radius?: number;
  visible?: boolean;
  origin?: ThreePosition;
  positions?: ThreePosition[];
  headLength?: number;
  headWidth?: number;
  tooltip?: string;
  scale?: ThreePosition | ThreePosition[];
  positionPairs?: Array<[ThreePosition, ThreePosition]>;
  keyframes?: number[];
  animate?: unknown[];
  id?: string;
  animateType?: string;
  _meta?: SceneMeta[];
  width?: number;
  opacity?: number;
  normals?: ThreePosition[];
  scaleFactor?: number;
}
