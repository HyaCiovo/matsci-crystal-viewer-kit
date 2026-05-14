import { Object3D, Vector3 } from 'three';
import { WebGLRenderer } from 'three';
import type { TooltipController } from './tooltip-helper';

export const POINTER_CLASS = 'show-pointer';

export type SceneInteractionReference<T> =
  | {
      point: Vector3;
      object: { sceneObject: Object3D; jsonObject: T } | null;
    }
  | null
  | undefined;

type CreateSceneInteractionControllerArgs<T> = {
  tooltipController: TooltipController;
  renderer: WebGLRenderer | unknown;
  domElement: HTMLElement;
  clickableObjects: Object3D[];
  tooltipObjects: Object3D[];
  getClickedReference: (
    clientX: number,
    clientY: number,
    objectsToCheck: Object3D[]
  ) => SceneInteractionReference<T>;
  renderScene: () => void;
  onClickReference: (reference: SceneInteractionReference<T>, event: MouseEvent) => void;
};

export interface SceneInteractionController {
  mouseMoveListener: (event: Event) => void;
  clickListener: (event: Event) => void;
}

export function createSceneInteractionController<T>({
  tooltipController,
  renderer,
  domElement,
  clickableObjects,
  tooltipObjects,
  getClickedReference,
  renderScene,
  onClickReference
}: CreateSceneInteractionControllerArgs<T>): SceneInteractionController {
  const updatePointerState = (isPointerVisible: boolean) => {
    if (isPointerVisible) {
      domElement.classList.add(POINTER_CLASS);
    } else {
      domElement.classList.remove(POINTER_CLASS);
    }
  };

  return {
    mouseMoveListener(event) {
      const mouseEvent = event as MouseEvent;
      if (renderer instanceof WebGLRenderer || true) {
        let reference = getClickedReference(mouseEvent.offsetX, mouseEvent.offsetY, tooltipObjects);
        if (reference && reference.object) {
          const { object, point } = reference;
          tooltipController.updateTooltip(point, object.jsonObject as Record<string, any>, object.sceneObject);
          renderScene();
        } else {
          tooltipController.hideTooltipIfNeeded() && renderScene();
        }

        reference = getClickedReference(mouseEvent.offsetX, mouseEvent.offsetY, clickableObjects);
        updatePointerState(Boolean(reference && reference.object));
      } else {
        console.warn('No mousemove implementation for SVG');
      }
    },
    clickListener(event) {
      const mouseEvent = event as MouseEvent;
      if (renderer instanceof WebGLRenderer || true) {
        const reference = getClickedReference(mouseEvent.offsetX, mouseEvent.offsetY, clickableObjects);
        onClickReference(reference, mouseEvent);
      } else {
        console.warn('No implementation of click for SVG');
      }
    }
  };
}
