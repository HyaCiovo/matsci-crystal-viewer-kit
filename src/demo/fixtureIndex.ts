import type { Meta, SceneFixture } from './types'
import fixture8233 from './fixtures/8233.json'
import fixture294068 from './fixtures/294068.json'
import fixture304763 from './fixtures/304763.json'
import fixture372653 from './fixtures/372653.json'
import fixture379864 from './fixtures/379864.json'
import fixture463206 from './fixtures/463206.json'

const items = [
  {
    id: '8233',
    formula: 'Hf3Mn3Ge3',
    payload: fixture8233,
  },
  {
    id: '294068',
    formula: 'Mn8Na8Se12',
    payload: fixture294068,
  },
  {
    id: '304763',
    formula: 'Ba12Mn10O32',
    payload: fixture304763,
  },
  {
    id: '372653',
    formula: 'Fe16K16O32',
    payload: fixture372653,
  },
  {
    id: '379864',
    formula: 'Co24Cl8O48Te12',
    payload: fixture379864,
  },
  {
    id: '463206',
    formula: 'Co4Na12C8O32S2',
    payload: fixture463206,
  },
] satisfies SceneFixture[]

export const demoFixtures = items

export const defaultDemoMeta: Meta = {
  title: 'Structure Gallery',
  subtitle: 'Representative crystal structures rendered with the viewer component.',
}
