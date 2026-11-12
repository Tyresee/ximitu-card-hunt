// Local visual sample with a fresh fixture account and temporary wallets.
// Run: node scripts/qa/clay-preview.mjs
// This launcher and its cookie convenience are never copied into dist/.
import { access } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root=fileURLToPath(new URL('../../',import.meta.url));
const platformRoot=resolve(process.env.MONOPOLY_LAB_PLATFORM_ROOT||join(root,'output/clay-preview/platform'));
try{
  await access(join(platformRoot,'server/index.js'));
}catch{
  throw new Error('The isolated clay preview platform is missing. Prepare output/clay-preview/platform or set MONOPOLY_LAB_PLATFORM_ROOT to the isolated v3 platform source.');
}
process.env.MONOPOLY_ISOLATED_POINTS_QA='1';
process.env.MONOPOLY_LAB_VISUAL_PREVIEW='clay';
process.env.MONOPOLY_LAB_PLATFORM_ROOT=platformRoot;
process.env.MONOPOLY_LAB_BUILD??='1';
process.env.MONOPOLY_LAB_HTTP_CHECK??='0';
// No fixed-face override: the normal preview uses independent randomInt rolls.
await import('./landing-points-lab.mjs');
