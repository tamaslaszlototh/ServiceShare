import { execFileSync } from 'child_process';
import { createRequire } from 'module';
import { mkdirSync } from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const ffmpeg = require('ffmpeg-static');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const imagesDir = path.join(root, 'assets', 'images');

const tokens = {
  bgTop: '0x1d2129',
  bgBottom: '0x0f1115',
  accent: '0x2dd4a7',
};

const WIDTH = 1280;
const HEIGHT = 720;
const LOGO_SIZE = 256;
const LOGO_BAR_WIDTH = 32;

function run(args) {
  execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: 'inherit' });
}

function rgb(hex) {
  const value = parseInt(hex, 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function gradientExpr(from, to, last) {
  const [r0, g0, b0] = rgb(from);
  const [r1, g1, b1] = rgb(to);
  return (
    `geq=r='${r0}-${r0 - r1}*Y/${last}':` +
    `g='${g0}-${g0 - g1}*Y/${last}':` +
    `b='${b0}-${b0 - b1}*Y/${last}'`
  );
}

function generateDefaultBase() {
  const output = path.join(imagesDir, 'default-base.png');
  run([
    '-f', 'lavfi',
    '-i', `color=c=black:s=${WIDTH}x${HEIGHT}`,
    '-vf', gradientExpr(tokens.bgTop, tokens.bgBottom, HEIGHT - 1),
    '-frames:v', '1',
    '-update', '1',
    output,
  ]);
  return output;
}

function generateLogo() {
  const output = path.join(imagesDir, 'logo.png');
  const bars = [
    { x: 64, y: 68, h: 120 },
    { x: 112, y: 38, h: 180 },
    { x: 160, y: 84, h: 88 },
  ];
  const mask = bars
    .map((bar) => `drawbox=x=${bar.x}:y=${bar.y}:w=${LOGO_BAR_WIDTH}:h=${bar.h}:color=white:t=fill`)
    .join(',');
  run([
    '-f', 'lavfi',
    '-i', `color=c=${tokens.accent}:s=${LOGO_SIZE}x${LOGO_SIZE}`,
    '-f', 'lavfi',
    '-i', `color=c=black:s=${LOGO_SIZE}x${LOGO_SIZE}`,
    '-filter_complex', `[1:v]${mask}[mask];[0:v][mask]alphamerge,format=rgba[out]`,
    '-map', '[out]',
    '-frames:v', '1',
    '-update', '1',
    output,
  ]);
  return output;
}

mkdirSync(imagesDir, { recursive: true });
console.log(`wrote ${path.relative(root, generateDefaultBase())}`);
console.log(`wrote ${path.relative(root, generateLogo())}`);
