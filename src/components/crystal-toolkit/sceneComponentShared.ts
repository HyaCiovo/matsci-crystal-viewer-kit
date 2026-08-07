import React, {
  ReactNode,
  RefObject,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef
} from 'react';
import * as THREE from 'three';
import { CameraContext } from './CameraContextProvider';
import {
  cameraReducer,
  CameraActionPayload,
  CameraReducerAction,
  CameraState,
  initialState
} from './CameraContextProvider/camera-reducer';
import { ExportType } from './scene/constants';
import { SceneJsonObject } from './scene/scene-types';
import Scene from './scene/Scene';
import { ScenePosition } from './scene/inset-helper';
import { subscribe, type Subscription } from './scene/download-event';
import {
  requestSceneExport,
  type SceneExportFileNames,
  type SetProps
} from './sceneExport';
import { hasRenderableSceneData, type SceneDataLike } from './sceneComponentUtils';

type CameraDispatchFn = (
  position: THREE.Vector3,
  quaternion: THREE.Quaternion,
  zoom: number
) => void;
type CompleteCameraState = CameraState & {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  zoom: number;
};
type SceneLifecycleConfig = {
  data: any;
  mountNode: Element;
  settings?: any;
  inletSize?: number;
  inletPadding?: number;
  exportFilePrefix?: string;
  exportFileNames?: SceneExportFileNames;
  mountNodeDebug?: Element;
  onObjectClicked?: (objects: any) => void;
  onCameraChange: CameraDispatchFn;
  onCameraChangeEnd?: () => void;
  setProps: SetProps;
  removeListeners?: boolean;
  animateOnMount?: boolean;
};
type UseSceneSharedEffectsConfig = {
  scene: RefObject<Scene | null>;
  mountNodeDebugRef: RefObject<Element | null>;
  debug?: boolean;
  data: any;
  toggleVisibility?: any;
  inletSize?: number;
  inletPadding?: number;
  axisView?: string;
  sceneSize?: number | string;
  imageRequest?: { filetype?: ExportType; filename?: string };
  exportFilePrefix?: string;
  exportFileNames?: SceneExportFileNames;
  setProps: SetProps;
  animation?: string;
  bypassRenderingOnData: boolean;
  forceRerenderKeys?: readonly unknown[];
};

let sceneComponentId = 0;
const CAMERA_STATE_UPDATE_INTERVAL_MS = 50;

const nextSceneComponentId = () => (++sceneComponentId).toString();

const hasCompleteCameraState = (
  cameraState?: CameraState | null
): cameraState is CompleteCameraState =>
  Boolean(cameraState?.position && cameraState.quaternion && cameraState.zoom !== undefined);

export const useScenePanels = (children?: ReactNode) => {
  const panels = useMemo(() => React.Children.toArray(children), [children]);
  const [settingsPanel, bottomPanel] = panels;
  return {
    settingsPanel,
    bottomPanel,
    hasSettingsPanel: Boolean(settingsPanel),
    hasBottomPanel: Boolean(bottomPanel)
  };
};

export const createSceneLifecycle = ({
  data,
  mountNode,
  settings,
  inletSize = 130,
  inletPadding = 0,
  exportFilePrefix,
  exportFileNames,
  mountNodeDebug,
  onObjectClicked,
  onCameraChange,
  onCameraChangeEnd,
  setProps,
  removeListeners = false,
  animateOnMount = false
}: SceneLifecycleConfig): { scene: Scene; subscription: Subscription } => {
  const scene = new Scene(
    data,
    mountNode,
    settings,
    inletSize,
    inletPadding,
    (objects) => {
      onObjectClicked?.(objects);
    },
    onCameraChange,
    onCameraChangeEnd,
    mountNodeDebug ?? undefined
  );

  if (removeListeners) {
    scene.removeListener();
  }
  if (animateOnMount) {
    scene.animate();
  }

  const subscription = subscribe(({ filetype, filename }) =>
    requestSceneExport(filetype, scene, setProps, { exportFilePrefix, exportFileNames }, filename)
  );
  return { scene, subscription };
};

export const useDismissiblePanel = (open: boolean, onClose: () => void) => {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }

      if (panelRef.current?.contains(target) || triggerRef.current?.contains(target)) {
        return;
      }

      onClose();
    };

    document.addEventListener('pointerdown', handlePointerDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [onClose, open]);

  return { panelRef, triggerRef };
};

export const useSceneCameraSync = ({
  scene,
  setProps,
  customCameraState
}: {
  scene: RefObject<Scene | null>;
  setProps: SetProps;
  customCameraState?: CameraState;
}) => {
  const cameraContext = useContext(CameraContext);
  const [cameraReducerState, cameraReducerDispatch] = useReducer(cameraReducer, initialState);
  const cameraState = cameraContext ? cameraContext.state : cameraReducerState;
  const cameraDispatch = cameraContext ? cameraContext.dispatch : cameraReducerDispatch;
  const componentIdRef = useRef(nextSceneComponentId());
  const originalCameraStateRef = useRef<CameraState | null>(null);
  const pendingCameraStateRef = useRef<CameraActionPayload | null>(null);
  const cameraUpdateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastCameraUpdateTimeRef = useRef(0);

  const flushCameraUpdate = useCallback(() => {
    cameraUpdateTimerRef.current = null;
    const payload = pendingCameraStateRef.current;
    if (!payload) {
      return;
    }

    pendingCameraStateRef.current = null;
    lastCameraUpdateTimeRef.current = performance.now();
    cameraDispatch?.({
      type: CameraReducerAction.NEW_POSITION,
      payload,
    });
  }, [cameraDispatch]);

  const queueCameraUpdate = useCallback(
    (position: THREE.Vector3, quaternion: THREE.Quaternion, zoom: number) => {
      // Controls emit a change event for nearly every pointer movement. Keep the
      // mutable Three.js values in refs and publish a coalesced immutable snapshot.
      pendingCameraStateRef.current = {
        componentId: componentIdRef.current,
        position: position.clone(),
        quaternion: quaternion.clone(),
        zoom,
      };

      if (cameraUpdateTimerRef.current != null) {
        return;
      }

      const elapsed = performance.now() - lastCameraUpdateTimeRef.current;
      const delay = Math.max(0, CAMERA_STATE_UPDATE_INTERVAL_MS - elapsed);
      cameraUpdateTimerRef.current = setTimeout(flushCameraUpdate, delay);
    },
    [flushCameraUpdate],
  );

  const flushQueuedCameraUpdate = useCallback(() => {
    if (cameraUpdateTimerRef.current != null) {
      clearTimeout(cameraUpdateTimerRef.current);
      cameraUpdateTimerRef.current = null;
    }
    flushCameraUpdate();
  }, [flushCameraUpdate]);

  useEffect(
    () => () => {
      if (cameraUpdateTimerRef.current != null) {
        clearTimeout(cameraUpdateTimerRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    if (!cameraState) {
      return;
    }

    setProps({ currentCameraState: cameraState });

    if (!scene.current || !hasCompleteCameraState(cameraState)) {
      return;
    }

    if (cameraState.setByComponentId !== componentIdRef.current) {
      scene.current.updateCamera(cameraState.position, cameraState.quaternion, cameraState.zoom);
    }

    if (!originalCameraStateRef.current) {
      originalCameraStateRef.current = { ...cameraState };
    }
  }, [cameraState, scene, setProps]);

  useEffect(() => {
    if (!scene.current || !customCameraState) {
      return;
    }

    const { position: p, quaternion: q, zoom } = customCameraState;
    const quaternion = new THREE.Quaternion(q?.x, q?.y, q?.z, q?.w);
    const position = new THREE.Vector3(p?.x, p?.y, p?.z);
    scene.current.updateCamera(position, quaternion, zoom);
    cameraDispatch?.({
      type: CameraReducerAction.NEW_POSITION,
      payload: {
        componentId: componentIdRef.current,
        position,
        quaternion,
        zoom
      }
    });
  }, [cameraDispatch, customCameraState, scene]);

  const resetCamera = useCallback(() => {
    if (!scene.current || !hasCompleteCameraState(originalCameraStateRef.current)) {
      return;
    }

    const originalCameraState = originalCameraStateRef.current;
    scene.current.updateCamera(
      originalCameraState.position,
      originalCameraState.quaternion,
      originalCameraState.zoom
    );
  }, [scene]);

  return {
    cameraDispatch,
    componentIdRef,
    flushQueuedCameraUpdate,
    queueCameraUpdate,
    resetCamera
  };
};

export const useSceneSharedEffects = ({
  scene,
  mountNodeDebugRef,
  debug,
  data,
  toggleVisibility,
  inletSize,
  inletPadding,
  axisView,
  sceneSize,
  imageRequest,
  exportFilePrefix,
  exportFileNames,
  setProps,
  animation,
  bypassRenderingOnData,
  forceRerenderKeys = []
}: UseSceneSharedEffectsConfig) => {
  useEffect(() => {
    if (!scene.current || !mountNodeDebugRef.current) {
      return;
    }
    scene.current.enableDebug(Boolean(debug), mountNodeDebugRef.current);
  }, [debug, mountNodeDebugRef, scene]);

  useEffect(() => {
    if (!scene.current) {
      return;
    }
    if (!hasRenderableSceneData(data)) {
      console.warn('no data passed ( or missing name /content ), scene will not be updated', data);
      return;
    }

    scene.current.addToScene(data, bypassRenderingOnData);
    if (bypassRenderingOnData) {
      scene.current.resizeRendererToDisplaySize();
      scene.current.renderScene();
    }
  }, [bypassRenderingOnData, data, scene, ...forceRerenderKeys]);

  useEffect(() => {
    if (!scene.current) {
      return;
    }
    scene.current.toggleVisibility(toggleVisibility as any);
  }, [scene, toggleVisibility]);

  useEffect(() => {
    if (!scene.current) {
      return;
    }
    const resolvedAxisView = (axisView as ScenePosition | undefined) ?? ScenePosition.NW;
    scene.current.updateInsetSettings(inletSize ?? 130, inletPadding ?? 0, resolvedAxisView);
  }, [axisView, inletPadding, inletSize, scene]);

  useEffect(() => {
    if (!scene.current) {
      return;
    }
    scene.current.resizeRendererToDisplaySize();
  }, [scene, sceneSize]);

  useEffect(() => {
    if (!scene.current) {
      return;
    }
    const { filetype, filename } = imageRequest ?? {};
    if (filetype) {
      requestSceneExport(
        filetype,
        scene.current,
        setProps,
        { exportFilePrefix, exportFileNames },
        filename
      );
    }
  }, [exportFileNames, exportFilePrefix, imageRequest, scene, setProps]);

  useEffect(() => {
    if (!scene.current || !animation) {
      return;
    }
    scene.current.updateAnimationStyle(animation as any);
  }, [animation, scene]);
};
