import { cp, mkdir, readFile, rm, writeFile, readdir } from 'node:fs/promises';
import { dirname, join, posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const project = fileURLToPath(new URL('..', import.meta.url));
const output = join(project, 'dist');
const source = join(project, 'public');
const game = '/prototypes/universal-board/';
export function deployedPath(path) {
  if (path.startsWith(game)) return path.replace(game, '/games/monopoly/');
  if (/^\/(js|assets|vendor)\//.test(path)) return `/games/monopoly-runtime${path}`;
  return path;
}
async function walk(dir) {
  const result = [];
  for (const entry of await readdir(dir, {withFileTypes: true})) {
    if (entry.name.startsWith('.')) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) result.push(...await walk(path));
    else result.push(path);
  }
  return result;
}
// The output is disposable. Source files are never rewritten by the build.
await rm(output, {recursive: true, force: true});
await mkdir(join(output, 'public'), {recursive: true});
const files = await walk(source);
const hashes = {};
for (const file of files) {
  const sourceUrl = '/' + posix.relative(source, file);
  const targetUrl = deployedPath(sourceUrl);
  const destination = join(output, 'public', targetUrl);
  await mkdir(dirname(destination), {recursive: true});
  let bytes = await readFile(file);
  if (/\.(js|css|html)$/.test(file)) {
    let text = bytes.toString('utf8');
    // Resolve relative module imports before moving modules to separate URL roots.
    text = text.replace(/(\bfrom\s*|\bimport\s*\(\s*)(["'])([^"']+)\2/g, (whole, prefix, quote, specifier) => {
      if (!specifier.startsWith('.')) return whole;
      const resolved = posix.resolve(posix.dirname(sourceUrl), specifier);
      const newRelative = posix.relative(posix.dirname(targetUrl), deployedPath(resolved));
      return `${prefix}${quote}${newRelative.startsWith('.') ? newRelative : './' + newRelative}${quote}`;
    });
    // Replace only root URL literals, never substrings in /api/assets or relative URLs.
    text = text.replace(/(["'`(])\/(prototypes\/universal-board|js|assets|vendor)\//g,
      (_, delimiter, prefix) => delimiter + deployedPath('/' + prefix + '/'));
    bytes = Buffer.from(text);
  }
  await writeFile(destination, bytes);
  hashes[targetUrl] = createHash('sha256').update(bytes).digest('hex');
}
await cp(join(project, 'standalone/server.mjs'), join(output, 'server.mjs'));
// Server-only modules stay outside the public asset tree. Their geometry
// imports use the exact same packaged board modules as the browser.
for (const name of ['board-layout-store.mjs', 'board-layout-api.mjs',
  'points-api.mjs', 'points-store.mjs', 'points-special-cells.mjs', 'points-movement.mjs', 'points-platform-client.mjs', 'points-rule-versions.mjs']) {
  const serverSource = (await readFile(join(project, 'standalone', name), 'utf8'))
    .replaceAll('../public/prototypes/universal-board/', './public/games/monopoly/');
  await writeFile(join(output, name), serverSource);
}
const version = execFileSync('git', ['rev-parse', 'HEAD'], {cwd:project, encoding:'utf8'}).trim();
await writeFile(join(output, 'release.json'), JSON.stringify({service:'ximitu-card-hunt',version,files:hashes},null,2)+'\n');
console.log(`Built ${Object.keys(hashes).length} game files in dist/ (${version.slice(0,8)})`);
