import toDataUrl from 'svgtodatauri';
import { WebGLRenderer } from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { USDZExporter } from 'three/examples/jsm/exporters/USDZExporter.js';
import { ExportType } from './scene/constants';
import Scene from './scene/Scene';
import { downloadBlob } from '../../utils/download';

export type SceneRendererLike = WebGLRenderer | { domElement: SVGElement };
export type SetProps = (value: any) => any;

const setPngData = (sceneComponent: Scene, setProps: SetProps) => {
  const renderer = sceneComponent.getRenderer() as SceneRendererLike;
  if (renderer instanceof WebGLRenderer) {
    sceneComponent.renderScene();
    const imageData = renderer.domElement.toDataURL('image/png');
    const imageDataTimestamp = Date.now();
    setProps({ imageData, imageDataTimestamp });
    setTimeout(() => {
      sceneComponent.renderScene();
    });
    return;
  }

  sceneComponent.renderScene();
  toDataUrl(renderer.domElement, 'image/png', {
    callback: (imageData: string) => {
      const imageDataTimestamp = Date.now();
      setProps({ imageData, imageDataTimestamp });
    }
  });
};

const downloadGltf = (sceneComponent: Scene, binary = false) => {
  const gltfExporter = new GLTFExporter();
  gltfExporter.parse(
    sceneComponent.scene,
    (gltf) => {
      const blobPart: BlobPart = binary
        ? gltf instanceof ArrayBuffer
          ? gltf
          : JSON.stringify(gltf)
        : JSON.stringify(gltf);
      const blob = new Blob([blobPart], {
        type: binary ? 'model/gltf-binary' : 'model/vnd.gltf+json'
      });
      downloadBlob(blob, binary ? 'crystal_toolkit_scene.glb' : 'crystal_toolkit_scene.gltf');
    },
    () => null,
    binary ? { binary: true } : undefined
  );
};

const downloadUsdz = async (sceneComponent: Scene) => {
  const usdzExporter = new USDZExporter();
  const arrayBuffer = (await usdzExporter.parse(sceneComponent.scene)) as unknown as ArrayBuffer;
  const blob = new Blob([arrayBuffer as unknown as BlobPart], { type: 'model/vnd.usdz+zip' });
  downloadBlob(blob, 'ar');
};

export const requestSceneExport = async (
  filetype: ExportType,
  sceneComponent: Scene,
  setProps: SetProps
) => {
  switch (filetype) {
    case ExportType.png:
      setPngData(sceneComponent, setProps);
      return;
    case ExportType.dae:
      console.warn('DAE export is no longer supported in the React 18 package.');
      return;
    case ExportType.gltf:
      downloadGltf(sceneComponent, false);
      return;
    case ExportType.glb:
      downloadGltf(sceneComponent, true);
      return;
    case ExportType.usdz:
      await downloadUsdz(sceneComponent);
      return;
    default:
      throw new Error('Unknown filetype.');
  }
};
