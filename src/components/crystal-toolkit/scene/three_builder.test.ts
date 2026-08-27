import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { Material, Renderer } from './constants'
import { ThreeBuilder } from './three_builder'

describe('ThreeBuilder instanced spheres', () => {
  const settings = (sphereMode: 'instanced' | 'individual' = 'instanced') => ({
    renderer: Renderer.WEBGL,
    sphereScale: 1,
    sphereSegments: 8,
    cylinderSegments: 8,
    cylinderScale: 1,
    sphereMode,
    material: {
      type: Material.standard,
      parameters: { roughness: 0.18, metalness: 0 },
    },
  })

  it('keeps batched spheres instanced and uses instance colors', () => {
    const builder = new ThreeBuilder(settings())
    const object = new THREE.Object3D()

    builder.makeSphere(
      {
        type: 'spheres',
        positions: [[0, 0, 0], [1, 0, 0]],
        color: '#ff0000',
        radius: 0.5,
      },
      object,
    )

    const mesh = object.children[0] as THREE.InstancedMesh
    const material = mesh.material as THREE.MeshStandardMaterial

    expect(mesh).toBeInstanceOf(THREE.InstancedMesh)
    expect(mesh.count).toBe(2)
    expect(mesh.instanceColor).not.toBeNull()
    expect(material.vertexColors).toBe(false)

    const instanceColor = new THREE.Color()
    mesh.getColorAt(0, instanceColor)
    expect(instanceColor.getHexString()).toBe('ff0000')
  })

  it('supports an individual sphere mode without changing the scene data', () => {
    const builder = new ThreeBuilder(settings('individual'))
    const object = new THREE.Object3D()

    builder.makeSphere(
      {
        type: 'spheres',
        positions: [[0, 0, 0], [1, 0, 0]],
        color: '#ff0000',
        radius: 0.5,
      },
      object,
    )

    expect(object.children).toHaveLength(2)
    expect(object.children.every((child) => child instanceof THREE.Mesh)).toBe(true)
    expect(object.children.some((child) => child instanceof THREE.InstancedMesh)).toBe(false)
  })
})

describe('ThreeBuilder instanced cylinders', () => {
  const settings = (cylinderMode: 'instanced' | 'individual' = 'instanced') => ({
    renderer: Renderer.WEBGL,
    sphereScale: 1,
    sphereSegments: 8,
    cylinderSegments: 8,
    cylinderScale: 1,
    sphereMode: 'instanced' as const,
    cylinderMode,
    material: {
      type: Material.standard,
      parameters: { roughness: 0.18, metalness: 0 },
    },
  })

  const positionPairs = [
    [[0, 0, 0], [0, 1, 0]],
    [[1, 0, 0], [1, 0, 2]],
  ] as [[number, number, number], [number, number, number]][]

  it('batches non-interactive bond segments into one InstancedMesh', () => {
    const builder = new ThreeBuilder(settings())
    const object = new THREE.Object3D()

    builder.makeCylinders(
      { type: 'cylinders', positionPairs, color: '#ff0000', radius: 0.1, clickable: false },
      object,
    )

    const mesh = object.children[0] as THREE.InstancedMesh

    expect(mesh).toBeInstanceOf(THREE.InstancedMesh)
    expect(mesh.count).toBe(2)
    expect((mesh.material as THREE.MeshStandardMaterial).color.getHexString()).toBe('ff0000')
  })

  it('keeps individual bond segments available as a compatibility mode', () => {
    const builder = new ThreeBuilder(settings('individual'))
    const object = new THREE.Object3D()

    builder.makeCylinders(
      { type: 'cylinders', positionPairs, color: '#ff0000', radius: 0.1, clickable: false },
      object,
    )

    expect(object.children).toHaveLength(2)
    expect(object.children.every((child) => child instanceof THREE.Mesh)).toBe(true)
    expect(object.children.some((child) => child instanceof THREE.InstancedMesh)).toBe(false)
  })

  it('does not batch interactive bond segments', () => {
    const builder = new ThreeBuilder(settings())
    const object = new THREE.Object3D()

    builder.makeCylinders(
      { type: 'cylinders', positionPairs, color: '#ff0000', radius: 0.1, clickable: true },
      object,
    )

    expect(object.children).toHaveLength(2)
    expect(object.children.every((child) => child instanceof THREE.Mesh)).toBe(true)
    expect(object.children.some((child) => child instanceof THREE.InstancedMesh)).toBe(false)
  })
})
