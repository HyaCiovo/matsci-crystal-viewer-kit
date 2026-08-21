import * as THREE from 'three';
import {
  AmbientLight,
  DirectionalLight,
  InstancedMesh,
  HemisphereLight,
  Object3D
} from 'three';
import {
  JSON3DObject,
  Light,
  Material,
  RADIUS_SEGMENTS,
  Renderer,
  ThreePosition,
  TUBE_SEGMENTS
} from './constants';
import { ConvexGeometry } from 'three/examples/jsm/geometries/ConvexGeometry.js';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { RadiusTubeBufferGeometry } from './RadiusTubeBufferGeometry';
import { isSharedThreeResource, markSharedThreeResource } from '../utils';

export const DEFAULT_DASHED_LINE_COLOR = '#000000';
export const DEFAULT_LINE_COLOR = '#2c3c54';
export const DEFAULT_MATERIAL_COLOR = '#52afb0';
import { mergeInnerArrays } from '../utils';

type SceneJsonLike = Record<string, any>;
type PositionPair = [ThreePosition, ThreePosition];
type BuilderSettings = Record<string, any>;
type RadiusArrayConfig = {
  radiusTop: number[];
  radiusBottom: number[];
  positionPairs: PositionPair[];
};
type LightJsonLike = {
  type: Light;
  args: any[];
  position?: ThreePosition;
};
type LineStyleOptions = {
  color?: string;
  lineWidth?: number;
  scale?: number;
  dashSize?: number;
  gapSize?: number;
};

type SegmentPlacement = {
  midpoint: THREE.Vector3;
  direction: THREE.Vector3;
  quaternion: THREE.Quaternion;
  length: number;
  end: THREE.Vector3;
};

type MaterialCacheEntry = {
  material: THREE.Material;
};

type InstancedSphereObject = THREE.Object3D & {
  userData: {
    instancedSphere?: boolean;
    interactiveInstancedSphere?: boolean;
    baseRadius?: number;
    baseColor?: string;
    spherePositions?: ThreePosition[];
    [key: string]: unknown;
  };
};

type InstancedCylinderObject = THREE.Object3D & {
  userData: {
    instancedCylinder?: boolean;
    cylinderPositionPairs?: PositionPair[];
    [key: string]: unknown;
  };
};

const RadiusTubeGeometryCtor = RadiusTubeBufferGeometry as unknown as new (
  ...args: any[]
) => THREE.BufferGeometry;

// i think it would be better to have a mixin or a decorator, so we do not need
// to create a sub class for each kind of curve. we would store the original curve and
// just forward the calls to it
class QuadraticSteppedBezierCurver extends THREE.QuadraticBezierCurve3 {
  private delta = 0;
  private parts = 2; // let's suppose we use a spline, we'll need to derive the parts from
  // the length of the vector array

  constructor(v0: THREE.Vector3, v1: THREE.Vector3, v2: THREE.Vector3) {
    super(v0, v1, v2);
  }
  setPart(part: number) {
    if (part >= this.parts) {
      console.error('Part index is too high :', part, '.Curve has:', this.parts, ' parts');
    }
    this.delta = (1 / this.parts) * part;
  }
  getPoint(t: number, optionalTarget?: THREE.Vector3): THREE.Vector3 {
    return super.getPoint(this.delta + t / this.parts);
  }
}

/**
 *
 *  This class builds Three.js object.
 *
 *  TODO: implements lights/camera
 *
 */
export class ThreeBuilder {
  private sphereGeometryCache = new Map<string, THREE.SphereGeometry>();
  private cylinderGeometryCache = new Map<string, THREE.CylinderGeometry>();
  private headGeometryCache = new Map<string, THREE.ConeGeometry>();
  private cubeGeometryCache = new Map<string, THREE.BoxGeometry>();
  private materialCache = new Map<string, MaterialCacheEntry>();
  private labelCount = 0;

  constructor(private settings: BuilderSettings) {}

  private getMaterialCacheKey(color: string, opacity: number) {
    return JSON.stringify({
      renderer: this.settings.renderer,
      materialType: this.settings.material.type,
      materialParameters: this.settings.material.parameters,
      color,
      opacity
    });
  }

  private getSphereGeometryCacheKey(radius: number, phiStart: number, phiEnd: number) {
    return [radius, phiStart || 0, phiEnd || Math.PI * 2, this.settings.sphereSegments].join(':');
  }

  private getCylinderGeometryCacheKey(radiusTop: number, radiusBottom: number) {
    return [radiusTop, radiusBottom, this.settings.cylinderSegments, this.settings.cylinderScale].join(
      ':'
    );
  }

  private getHeadGeometryCacheKey(headWidth: number, headLength: number) {
    return [headWidth, headLength, this.settings.cylinderSegments, this.settings.cylinderScale].join(
      ':'
    );
  }

  private getCubeGeometryCacheKey(size: number) {
    return [size].join(':');
  }

  private shouldUseInstancedSpheres(objectJson: SceneJsonLike) {
    return Boolean(
      this.settings.sphereMode !== 'individual' &&
      !objectJson.animate &&
      !objectJson.hoverLabel &&
      Array.isArray(objectJson.positions) &&
      objectJson.positions.length > 1
    );
  }

  private getInstancedSphereMesh(obj: THREE.Object3D) {
    return obj.children[0] as InstancedMesh | undefined;
  }

  private shouldUseInstancedCylinders(objectJson: SceneJsonLike) {
    return Boolean(
      this.settings.cylinderMode !== 'individual' &&
      !objectJson.animate &&
      !objectJson.hoverLabel &&
      !objectJson.clickable &&
      !objectJson.tooltip &&
      Array.isArray(objectJson.positionPairs) &&
      objectJson.positionPairs.length > 1 &&
      !Array.isArray(objectJson.radiusTop) &&
      !Array.isArray(objectJson.radiusBottom) &&
      !Array.isArray(objectJson.color)
    );
  }

  private getInstancedCylinderMesh(obj: THREE.Object3D) {
    return obj.children[0] as InstancedMesh | undefined;
  }

  private updateInstancedSphereMatrices(
    mesh: InstancedMesh,
    positions: ThreePosition[],
    radius: number
  ) {
    const matrix = new THREE.Matrix4();
    const positionVector = new THREE.Vector3();
    const scaleVector = new THREE.Vector3(radius, radius, radius);
    const quaternion = new THREE.Quaternion();

    positions.forEach((position, index) => {
      positionVector.set(...position);
      matrix.compose(positionVector, quaternion, scaleVector);
      mesh.setMatrixAt(index, matrix);
    });

    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingBox();
    mesh.computeBoundingSphere();
  }

  private updateInstancedCylinderMatrices(
    mesh: InstancedMesh,
    positionPairs: PositionPair[]
  ) {
    const matrix = new THREE.Matrix4();
    positionPairs.forEach((positionPair, index) => {
      const placement = this.getSegmentPlacement(positionPair);
      matrix.compose(
        placement.midpoint,
        placement.quaternion,
        new THREE.Vector3(1, placement.length, 1)
      );
      mesh.setMatrixAt(index, matrix);
    });

    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingBox();
    mesh.computeBoundingSphere();
  }

  private initializeInstancedSphereColors(
    mesh: InstancedMesh,
    color: string,
    count: number
  ) {
    const material = mesh.material as THREE.Material & { vertexColors?: boolean };
    // Instance colors are supplied by `instanceColor`; the unit sphere geometry
    // has no regular `color` attribute to multiply into the shader.
    material.vertexColors = false;
    material.needsUpdate = true;
    const instanceColor = new THREE.Color(color);
    for (let index = 0; index < count; index += 1) {
      mesh.setColorAt(index, instanceColor);
    }
    if (mesh.instanceColor) {
      mesh.instanceColor.needsUpdate = true;
    }
  }

  public updateInstancedSphereInstanceColor(
    obj: THREE.Object3D,
    index: number,
    color: string
  ) {
    const mesh = this.getInstancedSphereMesh(obj);
    if (!mesh || !Number.isInteger(index) || index < 0 || index >= mesh.count) {
      return;
    }

    mesh.setColorAt(index, new THREE.Color(color));
    if (mesh.instanceColor) {
      mesh.instanceColor.needsUpdate = true;
    }
  }

  private updateObjectColor(object: THREE.Object3D, color: string) {
    const material = (object as THREE.Object3D & {
      material?: THREE.Material | THREE.Material[];
    }).material;

    if (Array.isArray(material)) {
      material.forEach((entry) => this.updateMaterialColor(entry, color));
      return;
    }

    material && this.updateMaterialColor(material, color);
  }

  private updateMaterialColor(material: THREE.Material, color: string) {
    const colorableMaterial = material as THREE.Material & {
      color?: {
        set: (value: string) => void;
      };
    };
    colorableMaterial.color?.set(color);
  }

  private updateChildObjectColors(obj: THREE.Object3D, color: string) {
    obj.children.forEach((child) => {
      this.updateObjectColor(child, color);
    });
  }

  private replaceObjectGeometry(object: THREE.Object3D, geometry: THREE.BufferGeometry) {
    const geometryObject = object as THREE.Object3D & {
      geometry: THREE.BufferGeometry;
    };
    if (geometryObject.geometry && !isSharedThreeResource(geometryObject.geometry)) {
      geometryObject.geometry.dispose();
    }
    geometryObject.geometry = geometry;
  }

  private replaceChildObjectGeometries(obj: THREE.Object3D, geometry: THREE.BufferGeometry) {
    obj.children.forEach((child) => {
      this.replaceObjectGeometry(child, geometry);
    });
  }

  private updateArrowChildGeometry(
    obj: THREE.Object3D,
    positionPairs: PositionPair[],
    childIndexResolver: (pairIndex: number) => number,
    geometry: THREE.BufferGeometry
  ) {
    positionPairs.forEach((_pair, index) => {
      const mesh = obj.children[childIndexResolver(index)] as THREE.Mesh;
      this.replaceObjectGeometry(mesh, geometry);
    });
  }

  private disposeMaterial(material: THREE.Material | THREE.Material[]) {
    if (Array.isArray(material)) {
      material.forEach((entry) => {
        if (!isSharedThreeResource(entry)) {
          entry.dispose();
        }
      });
      return;
    }

    if (!isSharedThreeResource(material)) {
      material.dispose();
    }
  }

  private applyTransparentMaterialState(material: THREE.Material, opacity: number) {
    const transparentMaterial = material as THREE.Material & {
      transparent?: boolean;
      depthWrite?: boolean;
    };
    if (opacity) {
      transparentMaterial.transparent = true;
      transparentMaterial.depthWrite = false;
    }
  }

  private createPositionGeometry(positions: ThreePosition[]) {
    const vertices = new THREE.Float32BufferAttribute(mergeInnerArrays(positions), 3);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', vertices);
    return geometry;
  }

  private createConvexGeometry(positions: ThreePosition[]) {
    const points = positions.map((position) => new THREE.Vector3(...position));
    return new ConvexGeometry(points);
  }

  private createEdgeSegments(geometry: THREE.BufferGeometry, color: string) {
    const edges = new THREE.EdgesGeometry(geometry);
    const material = new THREE.LineBasicMaterial({ color });
    return new THREE.LineSegments(edges, material);
  }

  private createMaterialVariant(material: THREE.Material, color?: string) {
    if (!color) {
      return material;
    }

    const nextMaterial = material.clone();
    this.updateMaterialColor(nextMaterial, color);
    return nextMaterial;
  }

  private addPositionedMeshes(
    parent: THREE.Object3D,
    positions: ThreePosition[],
    createMesh: (position: ThreePosition, index: number) => THREE.Object3D
  ) {
    positions.forEach((position, index) => {
      parent.add(createMesh(position, index));
    });
  }

  private updateArrowHeadGeometry(
    obj: THREE.Object3D,
    baseJsonObject: SceneJsonLike,
    geometry: THREE.BufferGeometry
  ) {
    this.updateArrowChildGeometry(
      obj,
      baseJsonObject.positionPairs,
      (index) => index * 2 + 1,
      geometry
    );
  }

  private createLineGeometry(positions: number[]) {
    const vertices = new THREE.Float32BufferAttribute(positions, 3);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', vertices);
    return geometry;
  }

  private resolveLineStyleOptions(
    objectJson: SceneJsonLike,
    overrides: LineStyleOptions = {}
  ): Required<LineStyleOptions> {
    return {
      color: overrides.color || objectJson.color || DEFAULT_LINE_COLOR,
      lineWidth: overrides.lineWidth || objectJson.line_width || 1,
      scale: overrides.scale || objectJson.scale || 1,
      dashSize: overrides.dashSize || objectJson.dashSize || 3,
      gapSize: overrides.gapSize || objectJson.gapSize || 1
    };
  }

  private isDashedLineStyle(objectJson: SceneJsonLike, overrides: LineStyleOptions = {}) {
    return Boolean(
      objectJson.dashSize ||
        objectJson.scale ||
        objectJson.gapSize ||
        overrides.dashSize ||
        overrides.scale ||
        overrides.gapSize
    );
  }

  private createLineMaterial(objectJson: SceneJsonLike, overrides: LineStyleOptions = {}) {
    const lineStyle = this.resolveLineStyleOptions(objectJson, overrides);

    if (this.isDashedLineStyle(objectJson, overrides)) {
      return new THREE.LineDashedMaterial({
        color: lineStyle.color || DEFAULT_DASHED_LINE_COLOR,
        linewidth: lineStyle.lineWidth,
        scale: lineStyle.scale,
        dashSize: lineStyle.dashSize,
        gapSize: lineStyle.gapSize
      });
    }

    return new THREE.LineBasicMaterial({
      color: lineStyle.color || DEFAULT_LINE_COLOR,
      linewidth: lineStyle.lineWidth
    });
  }

  private applyLineDistancesIfNeeded(
    mesh: THREE.LineSegments,
    objectJson: SceneJsonLike,
    overrides: LineStyleOptions = {}
  ) {
    if (this.isDashedLineStyle(objectJson, overrides)) {
      mesh.computeLineDistances();
    }
  }

  private getSegmentPlacement(positionPair: PositionPair): SegmentPlacement {
    const start = new THREE.Vector3(...positionPair[0]);
    const end = new THREE.Vector3(...positionPair[1]);
    const direction = end.clone().sub(start);
    const midpoint = start.clone().add(direction.clone().multiplyScalar(0.5));
    const quaternion = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      direction.clone().normalize()
    );

    return {
      midpoint,
      direction,
      quaternion,
      length: direction.length(),
      end
    };
  }

  private placeSegmentMesh(mesh: THREE.Mesh, placement: SegmentPlacement) {
    mesh.scale.y = placement.length;
    mesh.position.copy(placement.midpoint);
    mesh.setRotationFromQuaternion(placement.quaternion);
  }

  private validateRadiusArrays({ radiusTop, radiusBottom, positionPairs }: RadiusArrayConfig) {
    if (!Array.isArray(radiusBottom)) {
      console.error('radiusBottom is not an array', radiusBottom);
      return;
    }

    if (radiusTop.length !== radiusBottom.length) {
      console.error('radiusTop/Bottom arrays have different length');
    }

    if (radiusTop.length !== positionPairs.length || radiusBottom.length !== positionPairs.length) {
      console.warn(
        'radiusTop/Bottom length does not match positions array, will fallback to radius for missing values'
      );
    }
  }

  public makeBezierTube(object_json: SceneJsonLike, obj: THREE.Object3D) {
    object_json.controlPoints.forEach(
      (controlPoints: [ThreePosition, ThreePosition, ThreePosition]) => {
        const cps = controlPoints.map((cp) => new THREE.Vector3(...cp)) as [
          THREE.Vector3,
          THREE.Vector3,
          THREE.Vector3
        ];
        const curve = new QuadraticSteppedBezierCurver(...cps);
        const numberOfParts = controlPoints.length - 1;
        for (let i = 0; i < numberOfParts; i++) {
          curve.setPart(i);
          const radiusStart = object_json.radius[i];
          const radiusEnd = object_json.radius[i + 1];
          const geometry = new RadiusTubeGeometryCtor(
            curve,
            TUBE_SEGMENTS,
            radiusStart,
            RADIUS_SEGMENTS,
            false,
            (a: number, b: number) => a + (radiusEnd - radiusStart) * (b / TUBE_SEGMENTS)
          );
          obj.add(
            new THREE.Mesh(geometry, this.makeMaterial(object_json.color[i], object_json.animate))
          );
        }
      }
    );
    return obj;
  }

  public makeCylinders(object_json: SceneJsonLike, obj: THREE.Object3D) {
    const { radius = 1, radiusTop, radiusBottom, color } = object_json;
    const perCylinderGeometry = Array.isArray(radiusTop);
    perCylinderGeometry && this.validateRadiusArrays(object_json as RadiusArrayConfig);
    const perCylinderMaterial = Array.isArray(color);
    const geom = this.getCylinderGeometry(radius, radiusTop, radiusBottom);
    const baseColor = perCylinderMaterial ? color[0] : color;
    const mat = this.makeMaterial(baseColor, object_json.animate);

    if (this.shouldUseInstancedCylinders(object_json)) {
      const positionPairs = object_json.positionPairs as PositionPair[];
      const instancedMesh = new THREE.InstancedMesh(geom, mat, positionPairs.length);
      instancedMesh.name = 'cylinder-instances';
      this.updateInstancedCylinderMatrices(instancedMesh, positionPairs);
      (obj as InstancedCylinderObject).userData.instancedCylinder = true;
      (obj as InstancedCylinderObject).userData.cylinderPositionPairs = positionPairs.map(
        (positionPair) => positionPair.map((position) => [...position] as ThreePosition) as PositionPair
      );
      obj.add(instancedMesh);
      return obj;
    }

    object_json.positionPairs.forEach((positionPair: PositionPair, idx: number) => {
      // the following is technically correct but could be optimized?
      const currentGeometry = perCylinderGeometry
        ? this.getCylinderGeometry(radius, radiusTop[idx], radiusBottom[idx])
        : geom;
      const currentMaterial = perCylinderMaterial
        ? this.createMaterialVariant(mat, color[idx])
        : mat;

      const mesh = new THREE.Mesh(currentGeometry, currentMaterial);
      this.placeSegmentMesh(mesh, this.getSegmentPlacement(positionPair));
      obj.add(mesh);
    });
    return obj;
  }

  public makeLine(object_json: SceneJsonLike, obj: THREE.Object3D) {
    const geom = this.createLineGeometry(mergeInnerArrays(object_json.positions));
    const mat = this.createLineMaterial(object_json);
    const mesh = new THREE.LineSegments(geom, mat);
    this.applyLineDistancesIfNeeded(mesh, object_json);
    obj.add(mesh);
    return obj;
  }

  public makeCube(object_json: SceneJsonLike, obj: THREE.Object3D) {
    const size = object_json.width * this.settings.sphereScale;
    const geom = this.getCubeGeometry(size);
    const mat = this.makeMaterial(object_json.color, object_json.animate);
    this.addPositionedMeshes(obj, object_json.positions, (position) => {
      const mesh = new THREE.Mesh(geom, mat);
      mesh.position.set(...position);
      return mesh;
    });

    return obj;
  }

  public makeSurfaces(object_json: SceneJsonLike, obj: THREE.Object3D) {
    const geom = this.createPositionGeometry(object_json.positions);
    const opacity = object_json.opacity || this.settings.defaultSurfaceOpacity;
    const mat = this.makeMaterial(object_json.color, object_json.animate, opacity).clone();

    if (object_json.normals) {
      const normals = new THREE.Float32BufferAttribute(mergeInnerArrays(object_json.normals), 3);

      geom.setAttribute('normal', normals);
    } else {
      // see if there is alternative.. i think openGL dont provide it anymore
      //FIXME(chab) is it even called ?
      geom.computeVertexNormals(); // instead of computefacenormals ?
      mat.side = THREE.DoubleSide; // not sure if this is necessary if we compute normals correctly
    }

    this.applyTransparentMaterialState(mat, opacity);

    const mesh = new THREE.Mesh(geom, mat);
    obj.add(mesh);
    // TODO: smooth the surfaces?
    return obj;
  }

  public makeConvex(object_json: SceneJsonLike, obj: THREE.Object3D) {
    const geom = this.createConvexGeometry(object_json.positions);
    const opacity = object_json.opacity || this.settings.defaultSurfaceOpacity;
    const mat = this.makeMaterial(object_json.color, object_json.animate, opacity).clone();
    this.applyTransparentMaterialState(mat, opacity);

    const mesh = new THREE.Mesh(geom, mat);
    obj.add(mesh);
    const line = this.createEdgeSegments(geom, object_json.color);
    obj.add(line);
    return obj;
  }

  public getHeadGeometry(headWidth: number, headLength: number): THREE.ConeGeometry {
    const scaledWidth = headWidth * this.settings.cylinderScale;
    const scaledLength = headLength * this.settings.cylinderScale;
    const key = this.getHeadGeometryCacheKey(scaledWidth, scaledLength);
    const cachedGeometry = this.headGeometryCache.get(key);
    if (cachedGeometry) {
      return cachedGeometry;
    }

    const geometry = markSharedThreeResource(
      new THREE.ConeGeometry(scaledWidth, scaledLength, this.settings.cylinderSegments)
    );
    this.headGeometryCache.set(key, geometry);
    return geometry;
  }

  public getCylinderGeometry(
    radius: number,
    radiusTop?: number,
    radiusBottom?: number
  ): THREE.CylinderGeometry {
    const resolvedRadiusTop = (radiusTop == undefined ? radius : radiusTop) * this.settings.cylinderScale;
    const resolvedRadiusBottom =
      (radiusBottom == undefined ? radius : radiusBottom) * this.settings.cylinderScale;
    const key = this.getCylinderGeometryCacheKey(resolvedRadiusTop, resolvedRadiusBottom);
    const cachedGeometry = this.cylinderGeometryCache.get(key);
    if (cachedGeometry) {
      return cachedGeometry;
    }

    const geometry = markSharedThreeResource(
      new THREE.CylinderGeometry(
        resolvedRadiusTop,
        resolvedRadiusBottom,
        1.0,
        this.settings.cylinderSegments
      )
    );
    this.cylinderGeometryCache.set(key, geometry);
    return geometry;
  }

  public makeArrow(object_json: SceneJsonLike, obj: THREE.Object3D) {
    // TODO obj is the parent object, rename to a better name
    const { radius = 1, radiusTop, radiusBottom, headLength = 2, headWidth = 2 } = object_json;
    // body
    const geom_cyl = this.getCylinderGeometry(radius, radiusTop, radiusBottom);
    // head
    const geom_head = this.getHeadGeometry(headWidth, headLength);
    const mat = this.makeMaterial(object_json.color);

    // for each pairs, we have one cylinder and one head, so obj will have meshes as children
    // for 2 position pairs, 1cylinder, 1head, 2cylinder, 2head

    object_json.positionPairs.forEach((positionPair: PositionPair) => {
      // the following is technically correct but could be optimized?
      const placement = this.getSegmentPlacement(positionPair);
      const mesh = new THREE.Mesh(geom_cyl, mat);
      this.placeSegmentMesh(mesh, placement);
      obj.add(mesh);
      // add arrowhead
      const mesh_head = new THREE.Mesh(geom_head, mat);
      mesh_head.position.copy(placement.end);
      mesh_head.setRotationFromQuaternion(placement.quaternion.clone());
      obj.add(mesh_head);
    });
    return obj;
  }

  //Note(chab) we use morphtargets for geometries like cube, convex, beziers
  // objects that are built by scaling and rotating a simple geometry should
  // be animated by interpolating those specific properties
  public makeMaterial(
    color = DEFAULT_MATERIAL_COLOR,
    _animated = false,
    opacity = 1.0,
    options: { shared?: boolean } = {}
  ) {
    const cacheKey = this.getMaterialCacheKey(color, opacity);
    const cachedEntry = this.materialCache.get(cacheKey);
    if (cachedEntry) {
      return options.shared ? cachedEntry.material : cachedEntry.material.clone();
    }

    const parameters = Object.assign({}, this.settings.material.parameters, {
      color: color,
      opacity: opacity
    });

    if (this.settings.renderer === Renderer.SVG) {
      const material = markSharedThreeResource(new THREE.MeshBasicMaterial(parameters));
      this.materialCache.set(cacheKey, { material });
      return options.shared ? material : material.clone();
    }

    switch (this.settings.material.type) {
      case Material.standard: {
        const material = markSharedThreeResource(new THREE.MeshStandardMaterial(parameters));
        this.materialCache.set(cacheKey, { material });
        return options.shared ? material : material.clone();
      }
      default:
        throw new Error('Unknown material.');
    }
  }

  public makeSphere(object_json: SceneJsonLike, obj: THREE.Object3D) {
    const sphereRadius = object_json.radius * this.settings.sphereScale;

    if (this.shouldUseInstancedSpheres(object_json)) {
      const unitGeometry = this.getSphereGeometry(
        1,
        object_json.phiStart,
        object_json.phiEnd
      );
      const instancedMesh = new THREE.InstancedMesh(
        unitGeometry,
        this.makeMaterial('#ffffff', object_json.animate, 1.0, { shared: true }),
        object_json.positions.length
      );
      instancedMesh.name = `${object_json.type || 'sphere'}-instances`;
      this.updateInstancedSphereMatrices(instancedMesh, object_json.positions, sphereRadius);
      this.initializeInstancedSphereColors(
        instancedMesh,
        object_json.color,
        object_json.positions.length
      );
      (obj as InstancedSphereObject).userData.instancedSphere = true;
      (obj as InstancedSphereObject).userData.interactiveInstancedSphere = Boolean(
        object_json.clickable || object_json.tooltip
      );
      (obj as InstancedSphereObject).userData.baseRadius = sphereRadius;
      (obj as InstancedSphereObject).userData.baseColor = object_json.color;
      (obj as InstancedSphereObject).userData.spherePositions = object_json.positions.map(
        (position: ThreePosition) => [...position] as ThreePosition
      );
      obj.add(instancedMesh);
      return obj;
    }

    const { geom, mat } = this.getSphereBuffer(
      sphereRadius,
      object_json.color,
      object_json.phiStart,
      object_json.phiEnd
    );
    this.addPositionedMeshes(obj, object_json.positions, (position) => {
      const mesh = new THREE.Mesh(geom, mat);
      mesh.position.set(...position);
      return mesh;
    });
    return obj;
  }

  public makeLabel(object_json: SceneJsonLike, obj: THREE.Object3D) {
    const maxLabelCount =
      typeof this.settings.maxLabelCount === 'number' && this.settings.maxLabelCount >= 0
        ? this.settings.maxLabelCount
        : 250;
    if (this.labelCount >= maxLabelCount) {
      return obj;
    }

    this.labelCount += 1;
    const label = document.createElement('div');
    label.className = 'tooltip';
    label.textContent = object_json.label;
    if (object_json.hoverLabel) {
      const hoverLabel = document.createElement('span');
      hoverLabel.textContent = object_json.hoverLabel;
      hoverLabel.className = 'ms-tooltiptext';
      label.appendChild(hoverLabel);
    }
    const labelObject = new CSS2DObject(label);
    obj.add(labelObject);
    return obj;
  }

  public resetLabelCount() {
    this.labelCount = 0;
  }

  public dispose() {
    const geometries = new Set<THREE.BufferGeometry>([
      ...this.sphereGeometryCache.values(),
      ...this.cylinderGeometryCache.values(),
      ...this.headGeometryCache.values(),
      ...this.cubeGeometryCache.values()
    ]);
    geometries.forEach((geometry) => geometry.dispose());

    const materials = new Set<THREE.Material>(
      [...this.materialCache.values()].map((entry) => entry.material)
    );
    materials.forEach((material) => material.dispose());

    this.sphereGeometryCache.clear();
    this.cylinderGeometryCache.clear();
    this.headGeometryCache.clear();
    this.cubeGeometryCache.clear();
    this.materialCache.clear();
    this.labelCount = 0;
  }

  public makeEllipsoids(object_json: SceneJsonLike, obj: THREE.Object3D) {
    const { geom, mat } = this.getSphereBuffer(
      this.settings.sphereScale,
      object_json.color,
      object_json.phiStart,
      object_json.phiEnd
    );
    const meshes = object_json.positions.map((position: ThreePosition) => {
      const mesh = new THREE.Mesh(geom, mat);
      mesh.position.set(...position);
      mesh.scale.set(...(object_json.scale as ThreePosition));
      return mesh;
    });
    // TODO: test axes are correct!
    const vec_z = new THREE.Vector3(0, 0, 1);
    const quaternion = new THREE.Quaternion();
    if (object_json.rotate_to) {
      object_json.rotate_to.forEach((rotation: ThreePosition, index: number) => {
        const rotation_vec = new THREE.Vector3(...rotation);
        quaternion.setFromUnitVectors(vec_z, rotation_vec.normalize());
        meshes[index].setRotationFromQuaternion(quaternion);
      });
    }
    this.addPositionedMeshes(obj, object_json.positions, (_position, index) => meshes[index]);
    return obj;
  }

  public makeObject(object_json: SceneJsonLike, obj: THREE.Object3D): THREE.Object3D {
    switch (object_json.type as JSON3DObject) {
      case JSON3DObject.SPHERES: {
        return this.makeSphere(object_json, obj);
      }
      case JSON3DObject.BEZIER: {
        return this.makeBezierTube(object_json, obj);
      }
      case JSON3DObject.ELLIPSOIDS: {
        return this.makeEllipsoids(object_json, obj);
      }
      case JSON3DObject.CYLINDERS: {
        return this.makeCylinders(object_json, obj);
      }
      case JSON3DObject.CUBES: {
        return this.makeCube(object_json, obj);
      }
      case JSON3DObject.LINES: {
        return this.makeLine(object_json, obj);
      }
      case JSON3DObject.SURFACES: {
        return this.makeSurfaces(object_json, obj);
      }
      case JSON3DObject.CONVEX: {
        return this.makeConvex(object_json, obj);
      }
      case JSON3DObject.ARROWS: {
        // take inspiration from ArrowHelper, user cones and cylinders
        return this.makeArrow(object_json, obj);
      }
      case JSON3DObject.LABEL: {
        return this.makeLabel(object_json, obj);
      }
      default: {
        return obj;
      }
    }
  }

  public getSphereGeometry(radius: number, phiStart: number, phiEnd: number) {
    const key = this.getSphereGeometryCacheKey(radius, phiStart, phiEnd);
    const cachedGeometry = this.sphereGeometryCache.get(key);
    if (cachedGeometry) {
      return cachedGeometry;
    }

    const geometry = markSharedThreeResource(
      new THREE.SphereGeometry(
        radius,
        this.settings.sphereSegments,
        this.settings.sphereSegments,
        phiStart || 0,
        phiEnd || Math.PI * 2
      )
    );
    this.sphereGeometryCache.set(key, geometry);
    return geometry;
  }

  private getSphereBuffer(radius: number, color: string, phiStart: number, phiEnd: number) {
    const geom = this.getSphereGeometry(radius, phiStart, phiEnd);
    const mat = this.makeMaterial(color, false);
    return { geom, mat };
  }

  public makeLights(light_json: LightJsonLike[]): Object3D {
    const lightGroup = new THREE.Object3D();
    lightGroup.name = 'lights';
    light_json.forEach((light: LightJsonLike) => {
      let lightObj;
      switch (light.type) {
        case Light.DirectionalLight:
          lightObj = new THREE.DirectionalLight(...light.args);
          break;
        case Light.AmbientLight:
          lightObj = new THREE.AmbientLight(...light.args);
          break;
        case Light.HemisphereLight:
          lightObj = new THREE.HemisphereLight(...light.args);
          break;
        default:
          throw new Error('Unknown light.');
      }
      if (light.position) {
        lightObj.position.set(...(light.position as ThreePosition));
      }
      lightGroup.add(lightObj);
    });
    return lightGroup;
  }

  public makeLightsHelper(lights: THREE.Light[]): Object3D {
    const lightHelperGroup = new THREE.Object3D();
    return lights.reduce((acc, light) => {
      switch (light.constructor) {
        case DirectionalLight:
          acc.add(new THREE.DirectionalLightHelper(light as DirectionalLight, 1));
          break;
        case AmbientLight:
          break;
        case HemisphereLight:
          acc.add(new THREE.HemisphereLightHelper(light as HemisphereLight, 1));
          break;
        default:
          console.error('Unknown light type.');
          break;
      }
      return acc;
    }, lightHelperGroup);
  }

  // object updates

  public updateSphereCenter(
    obj: THREE.Object3D,
    _baseJsonObject: SceneJsonLike,
    newPosition: ThreePosition,
    index: number
  ) {
    if ((obj as InstancedSphereObject).userData.instancedSphere) {
      const mesh = this.getInstancedSphereMesh(obj);
      const radius = ((obj as InstancedSphereObject).userData.baseRadius as number | undefined) ?? 1;
      const positions = (obj as InstancedSphereObject).userData.spherePositions ?? [];
      positions[index] = [...newPosition];
      if (mesh) {
        this.updateInstancedSphereMatrices(mesh, positions, radius);
      }
      return;
    }

    const mesh = obj.children[index] as THREE.Mesh;
    mesh.position.set(...newPosition);
  }

  public updateSphereColor(obj: THREE.Object3D, _baseJsonObject: SceneJsonLike, newColor: string) {
    if ((obj as InstancedSphereObject).userData.instancedSphere) {
      const mesh = this.getInstancedSphereMesh(obj);
      if (mesh) {
        const instanceColor = new THREE.Color(newColor);
        for (let index = 0; index < mesh.count; index += 1) {
          mesh.setColorAt(index, instanceColor);
        }
        if (mesh.instanceColor) {
          mesh.instanceColor.needsUpdate = true;
        }
        (obj as InstancedSphereObject).userData.baseColor = newColor;
      }
      return;
    }
    this.updateChildObjectColors(obj, newColor);
  }

  public updateConvexColor(obj: THREE.Object3D, _objjson: SceneJsonLike, color: string) {
    this.updateChildObjectColors(obj, color);
  }

  public updateConvexEdges(obj: THREE.Object3D, _objjson: SceneJsonLike, positions: ThreePosition[]) {
    const geom = this.createConvexGeometry(positions);
    const edges = new THREE.EdgesGeometry(geom);
    this.replaceObjectGeometry(obj.children[0], geom);
    this.replaceObjectGeometry(obj.children[1], edges);
  }

  public updateSphereRadius(obj: THREE.Object3D, _baseJsonObject: SceneJsonLike, newRadius: number) {
    if ((obj as InstancedSphereObject).userData.instancedSphere) {
      const mesh = this.getInstancedSphereMesh(obj);
      if (!mesh) {
        return;
      }

      const positions = (obj as InstancedSphereObject).userData.spherePositions ?? [];

      this.updateInstancedSphereMatrices(mesh, positions, newRadius);
      (obj as InstancedSphereObject).userData.baseRadius = newRadius;
      return;
    }

    const geometry = (obj.children[0] as THREE.Mesh).geometry as THREE.SphereGeometry;
    const phiStart = geometry.parameters.phiStart;
    const phiEnd = geometry.parameters.phiLength;
    const newGeometry = this.getSphereGeometry(newRadius, phiStart, phiEnd);
    this.replaceChildObjectGeometries(obj, newGeometry);
  }

  public updateHeadWidth(obj: THREE.Object3D, baseJsonObject: SceneJsonLike, headWidth: number) {
    const geom_head = this.getHeadGeometry(headWidth, baseJsonObject.headLength);
    this.updateArrowHeadGeometry(obj, baseJsonObject, geom_head);
  }

  public updateHeadLength(obj: THREE.Object3D, baseJsonObject: SceneJsonLike, headLength: number) {
    const geom_head = this.getHeadGeometry(baseJsonObject.headWidth, headLength);
    this.updateArrowHeadGeometry(obj, baseJsonObject, geom_head);
  }

  public updateArrowColor(obj: THREE.Object3D, _baseJsonObject: SceneJsonLike, color: string) {
    this.updateChildObjectColors(obj, color);
  }

  public updateArrowRadius(obj: THREE.Object3D, baseJsonObject: SceneJsonLike, radius: number) {
    const geom_cyl = this.getCylinderGeometry(radius);
    this.updateArrowChildGeometry(
      obj,
      baseJsonObject.positionPairs,
      (index) => index * 2,
      geom_cyl
    );
  }

  //TODO(chab) check if positions are different, update the whole mesh
  // OR let pass the index so we know what to update
  public updateArrowpositionPair(baseJsonObject: SceneJsonLike, _newScale: number) {
    //but reuse material if possible
    baseJsonObject.positionPairs.forEach((_a: PositionPair) => {});
  }

  public updateLineSegments(obj: THREE.Object3D, _object_json: SceneJsonLike, positions: number[]) {
    const geom = this.createLineGeometry(positions);
    const mesh: THREE.LineSegments = obj.children[0] as THREE.LineSegments;
    this.replaceObjectGeometry(mesh, geom);
  }

  public updateLineStyle(
    obj: THREE.Object3D,
    object_json: SceneJsonLike,
    color?: string,
    lineWidth?: number,
    scale?: number,
    dashSize?: number,
    gapSize?: number
  ) {
    const mesh: THREE.LineSegments = obj.children[0] as THREE.LineSegments;
    const overrides = { color, lineWidth, scale, dashSize, gapSize };
    this.disposeMaterial(mesh.material);
    mesh.material = this.createLineMaterial(object_json, overrides);
    this.applyLineDistancesIfNeeded(mesh, object_json, overrides);
  }

  // generic
  public updateScale(_baseJsonObject: SceneJsonLike, _newScale: number) {}

  // cylinder, see arrows
  public updateCylinderPositionPair(
    obj: THREE.Object3D,
    _baseJsonObject: SceneJsonLike,
    newPositionPair: PositionPair,
    index: number
  ) {
    if ((obj as InstancedCylinderObject).userData.instancedCylinder) {
      const mesh = this.getInstancedCylinderMesh(obj);
      const positionPairs = (obj as InstancedCylinderObject).userData.cylinderPositionPairs ?? [];
      if (!mesh || index < 0 || index >= positionPairs.length) {
        return;
      }

      positionPairs[index] = newPositionPair;
      this.updateInstancedCylinderMatrices(mesh, positionPairs);
      return;
    }

    const mesh = obj.children[index] as THREE.Mesh;
    this.placeSegmentMesh(mesh, this.getSegmentPlacement(newPositionPair));
  }

  public getSegmentInfo(positionPair: PositionPair) {
    const placement = this.getSegmentPlacement(positionPair);
    return {
      scale: placement.length,
      position: [
        placement.midpoint.x,
        placement.midpoint.y,
        placement.midpoint.z
      ] as ThreePosition,
      quaternion: placement.quaternion
    };
  }

  //TODO(chab) can be refactored with the sphere
  public updateCylinderRadius(obj: THREE.Object3D, _baseJsonObject: SceneJsonLike, newRadius: number) {
    //CylinderBufferGeometry
    const newGeometry = this.getCylinderGeometry(newRadius);
    this.replaceChildObjectGeometries(obj, newGeometry);
  }

  public updateCylinderColor(obj: THREE.Object3D, _baseJsonObject: SceneJsonLike, newColor: string) {
    this.updateChildObjectColors(obj, newColor);
  }

  private getCubeGeometry(size: number) {
    const key = this.getCubeGeometryCacheKey(size);
    const cachedGeometry = this.cubeGeometryCache.get(key);
    if (cachedGeometry) {
      return cachedGeometry;
    }

    const geometry = markSharedThreeResource(new THREE.BoxGeometry(size, size, size));
    this.cubeGeometryCache.set(key, geometry);
    return geometry;
  }
}

export function getSceneWithBackground(settings: BuilderSettings) {
  const scene = new THREE.Scene();
  //background
  if (!settings.transparentBackground) {
    scene.background = new THREE.Color(settings.background);
  }
  return scene;
}
