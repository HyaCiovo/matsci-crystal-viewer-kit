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

  it('keeps the inset axis current when restoring a selection after replacing the scene', () => {
    const scene = Object.create(Scene.prototype) as Scene;
    const axis = {};
    const axisJson = { name: 'axes' };
    const setAxis = vi.fn();
    const showAxis = vi.fn();

    Object.assign(scene as object, {
      axis,
      axisJson,
      inset: { setAxis, showAxis },
      selectionController: { hasOutlineChildren: () => true }
    });

    (scene as any).syncInsetWithCurrentScene();

    expect(setAxis).toHaveBeenCalledWith(axis, axisJson);
    expect(showAxis).not.toHaveBeenCalled();
  });
});
