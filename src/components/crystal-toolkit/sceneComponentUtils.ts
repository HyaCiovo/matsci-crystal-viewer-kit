import { DEFAULT_SCENE_SIZE } from './scene/constants';
import { SceneJsonObject } from './scene/scene-types';

export type SceneDataLike = SceneJsonObject & { name?: string; contents?: SceneJsonObject[] };

export const getSceneSize = (sceneSize?: number | string) =>
  sceneSize ? sceneSize : DEFAULT_SCENE_SIZE;

export const hideTooltip = () => undefined;

export const hasRenderableSceneData = (data: unknown): data is SceneDataLike => {
  if (!data || typeof data !== 'object') {
    return false;
  }
  const candidate = data as SceneDataLike;
  return Boolean(candidate.name && candidate.contents);
};
