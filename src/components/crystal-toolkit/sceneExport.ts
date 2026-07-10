import toDataUrl from 'svgtodatauri';
import { WebGLRenderer } from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { USDZExporter } from 'three/examples/jsm/exporters/USDZExporter.js';
import { ExportType } from './scene/constants';
import Scene from './scene/Scene';
import { downloadBlob } from '../../utils/download';

export type SceneRendererLike = WebGLRenderer | { domElement: SVGElement };
export type SetProps = (value: any) => any;
export type SceneExportFileNames = Partial<Record<ExportType, string>>;
export interface SceneExportNamingOptions {
  exportFilePrefix?: string;
  exportFileNames?: SceneExportFileNames;
}
const DEFAULT_EXPORT_BASENAME = 'matsci_scene';
const EXPORT_EXTENSION: Record<ExportType, string> = {
  [ExportType.png]: 'png',
  [ExportType.dae]: 'dae',
  [ExportType.gltf]: 'gltf',
  [ExportType.glb]: 'glb',
  [ExportType.usdz]: 'usdz'
};

function ensureExtension(filename: string, extension: string) {
  return filename.toLowerCase().endsWith(`.${extension.toLowerCase()}`)
    ? filename
    : `${filename}.${extension}`;
}

function resolveExportFilename(
  filetype: ExportType,
  naming: SceneExportNamingOptions = {},
  filenameOverride?: string
) {
  const extension = EXPORT_EXTENSION[filetype];
  const explicitFilename = filenameOverride?.trim();
  if (explicitFilename) {
    return ensureExtension(explicitFilename, extension);
  }

  const mappedFilename = naming.exportFileNames?.[filetype]?.trim();
  if (mappedFilename) {
    return ensureExtension(mappedFilename, extension);
  }

  const prefix = naming.exportFilePrefix?.trim();
  if (prefix) {
    return `${prefix}_scene.${extension}`;
  }

  return `${DEFAULT_EXPORT_BASENAME}.${extension}`;
}

const setPngData = (
  sceneComponent: Scene,
  setProps: SetProps,
  naming: SceneExportNamingOptions = {},
  filenameOverride?: string
) => {
  const renderer = sceneComponent.getRenderer() as SceneRendererLike;
  const imageFilename = resolveExportFilename(ExportType.png, naming, filenameOverride);
  if (renderer instanceof WebGLRenderer) {
    sceneComponent.renderScene();
    const imageData = renderer.domElement.toDataURL('image/png');
    const imageDataTimestamp = Date.now();
    setProps({ imageData, imageDataTimestamp, imageFilename });
    setTimeout(() => {
      sceneComponent.renderScene();
    });
    return;
  }

  sceneComponent.renderScene();
  toDataUrl(renderer.domElement, 'image/png', {
    callback: (imageData: string) => {
      const imageDataTimestamp = Date.now();
      setProps({ imageData, imageDataTimestamp, imageFilename });
    }
  });
};

const downloadGltf = (
  sceneComponent: Scene,
  binary = false,
  naming: SceneExportNamingOptions = {},
  filenameOverride?: string
) => {
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
      downloadBlob(
        blob,
        resolveExportFilename(binary ? ExportType.glb : ExportType.gltf, naming, filenameOverride)
      );
    },
    () => null,
    binary ? { binary: true } : undefined
  );
};

const downloadUsdz = async (
  sceneComponent: Scene,
  naming: SceneExportNamingOptions = {},
  filenameOverride?: string
) => {
  const usdzExporter = new USDZExporter();
  const arrayBuffer = (await usdzExporter.parse(sceneComponent.scene)) as unknown as ArrayBuffer;
  const blob = new Blob([arrayBuffer as unknown as BlobPart], { type: 'model/vnd.usdz+zip' });
  downloadBlob(blob, resolveExportFilename(ExportType.usdz, naming, filenameOverride));
};

export const requestSceneExport = async (
  filetype: ExportType,
  sceneComponent: Scene,
  setProps: SetProps,
  naming: SceneExportNamingOptions = {},
  filenameOverride?: string
) => {
  switch (filetype) {
    case ExportType.png:
      setPngData(sceneComponent, setProps, naming, filenameOverride);
      return;
    case ExportType.dae:
      console.warn('DAE export is no longer supported in the React 18 package.');
      return;
    case ExportType.gltf:
      downloadGltf(sceneComponent, false, naming, filenameOverride);
      return;
    case ExportType.glb:
      downloadGltf(sceneComponent, true, naming, filenameOverride);
      return;
    case ExportType.usdz:
      await downloadUsdz(sceneComponent, naming, filenameOverride);
      return;
    default:
      throw new Error('Unknown filetype.');
  }
};
