import { Object3D, Vector3 } from 'three';
import { WebGLRenderer } from 'three';
import type { TooltipController } from './tooltip-helper';

export const POINTER_CLASS = 'show-pointer';

export type SceneInteractionReference<T> =
  | {
      point: Vector3;
      object: { sceneObject: Object3D; jsonObject: T; instanceId?: number } | null;
    }
  | null
  | undefined;

type CreateSceneInteractionControllerArgs<T> = {
  tooltipController: TooltipController;
  renderer: WebGLRenderer | unknown;
  domElement: HTMLElement;
  getClickableObjects: () => Object3D[];
  getInteractiveObjects: () => Object3D[];
  getClickedReference: (
    clientX: number,
    clientY: number,
    objectsToCheck: Object3D[]
  ) => SceneInteractionReference<T>;
  getIntersectedReferences: (
    clientX: number,
    clientY: number,
    objectsToCheck: Object3D[]
  ) => Array<NonNullable<SceneInteractionReference<T>>>;
  renderScene: () => void;
  onClickReference: (reference: SceneInteractionReference<T>, event: MouseEvent) => void;
};

export interface SceneInteractionController {
  mouseMoveListener: (event: Event) => void;
  clickListener: (event: Event) => void;
  getHoverPickingPasses(): number;
  dispose(): void;
}

export function createSceneInteractionController<T>({
  tooltipController,
  renderer,
  domElement,
  getClickableObjects,
  getInteractiveObjects,
  getClickedReference,
  getIntersectedReferences,
  renderScene,
  onClickReference
}: CreateSceneInteractionControllerArgs<T>): SceneInteractionController {
  let pendingFrameId: number | undefined;
  let pendingPointerPosition: { x: number; y: number } | null = null;
  let hoverPickingPasses = 0;

  const updatePointerState = (isPointerVisible: boolean) => {
    if (isPointerVisible) {
      domElement.classList.add(POINTER_CLASS);
    } else {
      domElement.classList.remove(POINTER_CLASS);
    }
  };

  const processPointerMove = () => {
    pendingFrameId = undefined;
    const pointerPosition = pendingPointerPosition;
    pendingPointerPosition = null;
    if (!pointerPosition) {
      return;
    }

    const interactiveObjects = getInteractiveObjects();
    if (interactiveObjects.length === 0) {
      updatePointerState(false);
      tooltipController.hideTooltipIfNeeded() && renderScene();
      return;
    }

    hoverPickingPasses += 1;
    const references = getIntersectedReferences(
      pointerPosition.x,
      pointerPosition.y,
      interactiveObjects
    );
    const tooltipReference = references.find((reference) => {
      const jsonObject = reference.object?.jsonObject as Record<string, any> | undefined;
      return Boolean(jsonObject?.tooltip);
    });
    const clickableReference = references.find((reference) => {
      const jsonObject = reference.object?.jsonObject as Record<string, any> | undefined;
      return Boolean(jsonObject?.clickable);
    });
    const needsRender =
      tooltipReference?.object
        ? tooltipController.updateTooltip(
            tooltipReference.point,
            tooltipReference.object.jsonObject as Record<string, any>,
            tooltipReference.object.sceneObject,
            tooltipReference.object.instanceId
          )
        : tooltipController.hideTooltipIfNeeded();

    updatePointerState(Boolean(clickableReference?.object));
    needsRender && renderScene();
  };

  return {
    mouseMoveListener(event) {
      const mouseEvent = event as MouseEvent;
      if (renderer instanceof WebGLRenderer || true) {
        pendingPointerPosition = { x: mouseEvent.offsetX, y: mouseEvent.offsetY };
        if (pendingFrameId === undefined) {
          pendingFrameId = requestAnimationFrame(processPointerMove);
        }
      } else {
        console.warn('No mousemove implementation for SVG');
      }
    },
    clickListener(event) {
      const mouseEvent = event as MouseEvent;
      if (renderer instanceof WebGLRenderer || true) {
        const reference = getClickedReference(
          mouseEvent.offsetX,
          mouseEvent.offsetY,
          getClickableObjects()
        );
        onClickReference(reference, mouseEvent);
      } else {
        console.warn('No implementation of click for SVG');
      }
    },
    getHoverPickingPasses() {
      return hoverPickingPasses;
    },
    dispose() {
      if (pendingFrameId !== undefined) {
        cancelAnimationFrame(pendingFrameId);
        pendingFrameId = undefined;
      }
      pendingPointerPosition = null;
      updatePointerState(false);
    }
  };
}
