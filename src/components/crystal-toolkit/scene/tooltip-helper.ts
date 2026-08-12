import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { rgb } from 'd3-color';

type TooltipJson = {
  color?: string;
  tooltip?: string;
} & Record<string, any>;

type TooltipState = {
  tooltipedJsonObject: TooltipJson | null;
  tooltipedThreeObject: THREE.Object3D | null;
  tooltipedInstanceId: number | undefined;
};

const OFFSCREEN_COORDINATE = Number.MAX_SAFE_INTEGER;
const scratchHighlightColor = new THREE.Color();

const getTooltipText = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

const moveTooltipOffscreen = (tooltip: CSS2DObject) => {
  tooltip.position.set(OFFSCREEN_COORDINATE, OFFSCREEN_COORDINATE, OFFSCREEN_COORDINATE);
};

const setMeshColor = (mesh: THREE.Mesh, colorValue: string) => {
  const material = mesh.material;
  if (Array.isArray(material)) {
    material.forEach((item) => {
      if ('color' in item) {
        (item as THREE.MeshStandardMaterial).color = new THREE.Color(colorValue);
      }
    });
    return;
  }
  if ('color' in material) {
    (material as THREE.MeshStandardMaterial).color = new THREE.Color(colorValue);
  }
};

const updateHighlightedMeshes = (
  sceneObject: THREE.Object3D,
  color: string,
  brighten = false,
  instanceId?: number
) => {
  const resolvedColor = brighten ? rgb(color).brighter(1).formatHex() : color;
  sceneObject.children.forEach((child) => {
    if (child instanceof THREE.InstancedMesh && instanceId !== undefined) {
      scratchHighlightColor.set(resolvedColor);
      child.setColorAt(instanceId, scratchHighlightColor);
      if (child.instanceColor) {
        child.instanceColor.needsUpdate = true;
      }
      return;
    }
    if (child instanceof THREE.Mesh) {
      setMeshColor(child, resolvedColor);
    }
  });
};

export interface TooltipController {
  readonly tooltip: CSS2DObject;
  updateTooltip(
    point: THREE.Vector3,
    jsonObject: TooltipJson,
    sceneObject: THREE.Object3D,
    instanceId?: number
  ): boolean;
  hideTooltipIfNeeded(): boolean;
}

export function createTooltipController(): TooltipController {
  const label = document.createElement('div');
  label.className = 'ms-tooltiptext';
  const hoverLabel = document.createElement('span');
  label.appendChild(hoverLabel);

  const tooltip = new CSS2DObject(label);
  const state: TooltipState = {
    tooltipedJsonObject: null,
    tooltipedThreeObject: null,
    tooltipedInstanceId: undefined
  };

  moveTooltipOffscreen(tooltip);

  const clearActiveTooltip = () => {
    if (!state.tooltipedThreeObject) {
      return false;
    }

    if (typeof state.tooltipedJsonObject?.color === 'string') {
      updateHighlightedMeshes(
        state.tooltipedThreeObject,
        state.tooltipedJsonObject.color,
        false,
        state.tooltipedInstanceId
      );
    }

    state.tooltipedThreeObject = null;
    state.tooltipedJsonObject = null;
    state.tooltipedInstanceId = undefined;
    moveTooltipOffscreen(tooltip);
    return true;
  };

  return {
    tooltip,
    updateTooltip(point, jsonObject, sceneObject, instanceId) {
      const tooltipText = getTooltipText(jsonObject.tooltip);
      if (!tooltipText) {
        return this.hideTooltipIfNeeded();
      }

      const isCurrentObject =
        state.tooltipedJsonObject === jsonObject &&
        state.tooltipedThreeObject === sceneObject &&
        state.tooltipedInstanceId === instanceId;
      if (!isCurrentObject) {
        clearActiveTooltip();
        if (typeof jsonObject.color === 'string') {
          updateHighlightedMeshes(sceneObject, jsonObject.color, true, instanceId);
        }
        state.tooltipedJsonObject = jsonObject;
        state.tooltipedThreeObject = sceneObject;
        state.tooltipedInstanceId = instanceId;
      }
      tooltip.position.copy(point);
      tooltip.element.textContent = tooltipText;
      return true;
    },
    hideTooltipIfNeeded() {
      return clearActiveTooltip();
    }
  };
}
