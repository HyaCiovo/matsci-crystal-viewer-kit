import { describe, expect, it, vi } from 'vitest';
import Scene from './Scene';
import { ScenePosition } from './inset-helper';

describe('Scene inset settings', () => {
  it('redraws the scene when hiding the orientation inset', () => {
    const scene = Object.create(Scene.prototype) as Scene;
    const updateViewportsize = vi.fn();
    const renderScene = vi.spyOn(scene, 'renderScene').mockImplementation(() => undefined);

    Object.assign(scene as object, {
      axis: {},
      inset: { updateViewportsize }
    });

    scene.updateInsetSettings(96, 12, ScenePosition.HIDDEN);

    expect(updateViewportsize).toHaveBeenCalledWith(96, 12);
    expect(renderScene).toHaveBeenCalledOnce();
  });
});
