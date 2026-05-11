import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const cwd = process.cwd();
const srcThemesDir = path.join(cwd, 'src/themes');
const distDir = path.join(cwd, 'dist');
const distThemesDir = path.join(distDir, 'themes');
const styleCssPath = path.join(distDir, 'style.css');

await mkdir(distDir, { recursive: true });
await cp(srcThemesDir, distThemesDir, { recursive: true });

const styleCss = await readFile(styleCssPath, 'utf8');
await writeFile(styleCssPath, styleCss.replaceAll('../themes/', './themes/'));
