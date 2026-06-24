import { createRequire } from 'node:module';
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import swc from '@rollup/plugin-swc';
import postcss from 'rollup-plugin-postcss';
import dts from 'rollup-plugin-dts';

const require = createRequire(import.meta.url);
const pkg = require('./package.json');

const entryPoints = {
  index: 'src/index.ts',
};

const externalPackages = [
  ...Object.keys(pkg.peerDependencies || {}),
  ...Object.keys(pkg.dependencies || {}),
];

const isStyleRequest = (id) => /\.css$/.test(id);
const isExternal = (id) =>
  !isStyleRequest(id) &&
  externalPackages.some((packageName) => id === packageName || id.startsWith(`${packageName}/`));

const extensions = ['.ts', '.tsx', '.js', '.jsx'];
const treeshake = {
  preset: 'recommended',
  moduleSideEffects: (id) => isStyleRequest(id),
};

export default [
  buildStyleConfig('src/styles/index.ts', 'dist/style.js', 'style.css'),
  {
    input: entryPoints,
    output: {
      dir: 'dist',
      format: 'esm',
      entryFileNames: '[name].js',
      chunkFileNames: 'chunks/[name]-[hash].js',
      preserveModules: true,
      preserveModulesRoot: 'src',
      sourcemap: false,
    },
    external: isExternal,
    treeshake,
    plugins: [
      resolve({ extensions }),
      commonjs(),
      swc({
        exclude: /\.css$/,
        swc: {
          jsc: {
            parser: {
              syntax: 'typescript',
              tsx: true,
            },
            transform: {
              react: {
                runtime: 'automatic',
              },
            },
          },
        },
      }),
    ],
  },
  ...Object.entries(entryPoints).map(([name, input]) => buildDtsConfig(input, `dist/${name}.d.ts`)),
];

function buildStyleConfig(input, outputFile, extractedCssFile) {
  return {
    input,
    output: {
      file: outputFile,
      format: 'esm',
      sourcemap: false,
    },
    treeshake,
    onwarn(warning, warn) {
      if (warning.code === 'EMPTY_BUNDLE' || warning.message?.includes('Generated an empty chunk')) {
        return;
      }

      warn(warning);
    },
    external: isExternal,
    plugins: [
      resolve({ extensions }),
      commonjs(),
      swc({
        exclude: /\.css$/,
        swc: {
          jsc: {
            parser: {
              syntax: 'typescript',
              tsx: true,
            },
            transform: {
              react: {
                runtime: 'automatic',
              },
            },
          },
        },
      }),
      postcss({
        extract: extractedCssFile,
        minimize: true,
      }),
    ],
  };
}

function buildDtsConfig(input, outputFile) {
  return {
    input,
    output: [{ file: outputFile, format: 'es' }],
    external: [/\.css$/],
    plugins: [dts()],
  };
}
