import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, readFileSync, writeFileSync, chmodSync, symlinkSync, readlinkSync, realpathSync, existsSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve, dirname} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';

const source = readFileSync(new URL('../deploy/apply-release.sh', import.meta.url), 'utf8');
const revision = 'a'.repeat(40), old = 'b'.repeat(40), older = 'c'.repeat(40);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

function fixture(t, flags = {}) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'monopoly-producer-')));
  t.after(() => rmSync(root, {recursive: true, force: true}));
  const app = join(root, 'var/www/ximitu-card-hunt'), upload = join(root, 'uploads/ximitu-card-hunt.fixture');
  const helper = join(root, 'opt/tim-storage-archive/deploy_artifacts.py');
  const nginx = join(root, 'etc/nginx/conf.d/wordattack.timclass.cn.conf');
  const snippet = join(root, 'etc/nginx/voice-word-attack-games/monopoly.conf');
  const unit = join(root, 'etc/systemd/system/ximitu-card-hunt.service');
  const privateData = join(root, 'var/lib/ximitu-card-hunt/student.json');
  const events = join(root, 'events.jsonl'), flagFile = join(root, 'flags.json');
  const bin = join(root, 'bin');
  for (const path of [upload, bin, dirname(helper), dirname(nginx), dirname(snippet), dirname(unit), dirname(privateData), join(root, 'run/lock'), join(app, 'releases', old), join(app, 'releases', older)]) mkdirSync(path, {recursive: true});
  writeFileSync(nginx, 'original nginx\n'); writeFileSync(snippet, 'original snippet\n'); writeFileSync(unit, 'original service\n');
  writeFileSync(privateData, '{"fictionalStudent":"must survive"}\n');
  symlinkSync(join(app, 'releases', old), join(app, 'current'));
  symlinkSync(join(app, 'releases', older), join(app, 'previous'));
  writeFileSync(flagFile, JSON.stringify(flags));
  writeFileSync(join(upload, 'source.bundle'), 'fixture standalone source; verified by fake helper');
  writeFileSync(join(upload, 'service'), 'new service\n');
  writeFileSync(join(upload, 'monopoly.conf'), 'new snippet\n');
  writeFileSync(join(upload, 'install-include.py'), 'import sys\n');
  const html = Buffer.from('fictional game release');
  const content = join(root, 'content'); mkdirSync(join(content, 'public/games/monopoly'), {recursive: true});
  writeFileSync(join(content, 'public/games/monopoly/index.html'), html);
  writeFileSync(join(content, 'release.json'), JSON.stringify({version: flags.badManifest ? old : revision, files: {'/games/monopoly/index.html': hash(html)}}));
  const tar = spawnSync('python3', ['-c', 'import pathlib,sys,tarfile\nbase=pathlib.Path(sys.argv[1])\nwith tarfile.open(sys.argv[2],"w:gz") as t:\n for p in sorted(base.rglob("*")):\n  t.add(str(p),arcname=str(p.relative_to(base)),recursive=False)', content, join(upload, 'game.tar.gz')], {encoding: 'utf8'});
  assert.equal(tar.status, 0, tar.stderr);
  const checksum = hash(readFileSync(join(upload, 'game.tar.gz')));
  const writeCommand = (name, code) => {const path = join(bin, name); writeFileSync(path, code); chmodSync(path, 0o755);};
  writeCommand('id', '#!/bin/sh\nprintf "0\\n"\n');
  writeCommand('hostname', '#!/bin/sh\nprintf "iZbp14nomwqy2mytgji1y2Z\\n"\n');
  for (const name of ['flock', 'chown', 'nginx', 'sleep']) writeCommand(name, '#!/bin/sh\nexit 0\n');
  writeCommand('readlink', '#!/usr/bin/env python3\nimport os,sys\np=sys.argv[-1]\nif not os.path.exists(p):sys.exit(1)\nprint(os.path.realpath(p))\n');
  writeCommand('sha256sum', '#!/usr/bin/env python3\nimport hashlib,sys\nprint(hashlib.sha256(open(sys.argv[-1],"rb").read()).hexdigest()+"  "+sys.argv[-1])\n');
  writeCommand('mv', '#!/usr/bin/env python3\nimport os,sys\nassert sys.argv[1]=="-Tf"\nos.replace(sys.argv[2],sys.argv[3])\n');
  writeCommand('node', '#!/usr/bin/env python3\nimport json,sys\nd=json.load(sys.stdin)\nprint(d["status"] if ".status" in " ".join(sys.argv) else d["version"])\n');
  writeCommand('systemctl', '#!/bin/sh\nexit 0\n');
  writeCommand('curl', `#!/usr/bin/env python3
import json,pathlib,sys
flags=json.loads(pathlib.Path(${JSON.stringify(flagFile)}).read_text())
args=' '.join(sys.argv[1:])
if '19321/api/health' in args:print('{"status":"ok"}')
elif '/health' in args:
 current=pathlib.Path(${JSON.stringify(join(app, 'current'))}).resolve().name
 print(json.dumps({'version':${JSON.stringify(old)} if flags.get('healthFailure') else current}))
else:print('302')
`);
  writeFileSync(helper, `import json,os,pathlib,re,shutil,sys
app=pathlib.Path(${JSON.stringify(app)})
target=app/'releases'/${JSON.stringify(revision)}
events=pathlib.Path(${JSON.stringify(events)})
flags=json.loads(pathlib.Path(${JSON.stringify(flagFile)}).read_text())
prior=[json.loads(x) for x in events.read_text().splitlines()] if events.exists() else []
args=sys.argv[1:]; action=args[0]
kind=args[args.index('--kind')+1] if '--kind' in args else None
os.fstat(9)
assert args[args.index('--project')+1]=='ximitu-card-hunt'
event={'action':action,'kind':kind,'targetExists':target.exists(),'current':str((app/'current').resolve()),'lockFdInherited':True}
with events.open('a') as f:f.write(json.dumps(event)+'\\n')
if kind==flags.get('failKind') and kind is not None:sys.exit(27)
if action=='finalize':
 number=1+sum(x['action']=='finalize' for x in prior)
 if number==flags.get('failFinalizeNumber'):sys.exit(28)
 kept={(app/'current').resolve(),(app/'previous').resolve()}
 for p in (app/'releases').iterdir():
  if p.is_dir() and re.fullmatch('[a-f0-9]{40}',p.name) and p.resolve() not in kept:shutil.rmtree(str(p))
print(json.dumps({'verified':True,'private':True,'full_download_verified':True}))
`);
  let script = source.replaceAll('/var/www/ximitu-card-hunt', app)
    .replaceAll('/tmp/ximitu-card-hunt', join(root, 'uploads/ximitu-card-hunt'))
    .replaceAll('/run/lock/ximitu-card-hunt-deploy.lock', join(root, 'run/lock/ximitu-card-hunt-deploy.lock'))
    .replaceAll('/etc/nginx/conf.d/wordattack.timclass.cn.conf', nginx)
    .replaceAll('/etc/nginx/voice-word-attack-games', dirname(snippet))
    .replaceAll('/etc/systemd/system/ximitu-card-hunt.service', unit)
    .replaceAll('/opt/tim-storage-archive/deploy_artifacts.py', helper)
    .replaceAll('/opt/tim-storage-archive/disk_preflight.py', join(root, 'missing-preflight.py'));
  const apply = join(root, 'apply.sh'); writeFileSync(apply, script);
  return {root, app, upload, helper, nginx, snippet, unit, privateData,
    run: suppliedChecksum => spawnSync('bash', [apply, revision, suppliedChecksum ?? checksum, upload], {encoding: 'utf8', env: {...process.env, PATH: `${bin}:${process.env.PATH}`}, timeout: 10000}),
    events: () => existsSync(events) ? readFileSync(events, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse) : [],
    preserved: () => assert.equal(readFileSync(privateData, 'utf8'), '{"fictionalStudent":"must survive"}\n')};
}

test('successful deployment archives every input before mutation and retains only current/previous runtime', t => {
  const f = fixture(t), result = f.run();
  assert.equal(result.status, 0, result.stderr);
  const events = f.events();
  assert.deepEqual(events.map(x => [x.action, x.kind]), [['finalize', null], ['archive', 'source'], ['archive', 'release'], ['archive', 'data-backup'], ['finalize', null]]);
  assert.ok(events.slice(0, 4).every(x => x.targetExists === false && x.lockFdInherited));
  assert.equal(resolve(readlinkSync(join(f.app, 'current'))), join(f.app, 'releases', revision));
  assert.equal(resolve(readlinkSync(join(f.app, 'previous'))), join(f.app, 'releases', old));
  assert.equal(existsSync(f.upload), false);
  assert.equal(existsSync(join(f.app, 'source')), false);
  assert.equal(existsSync(join(f.app, 'backups')), false);
  assert.equal(existsSync(join(f.app, 'releases', older)), false);
  f.preserved();
});

for (const kind of ['source', 'release', 'data-backup']) test(`failed ${kind} OSS verification prevents production mutation`, t => {
  const f = fixture(t, {failKind: kind}), result = f.run();
  assert.notEqual(result.status, 0);
  assert.equal(resolve(readlinkSync(join(f.app, 'current'))), join(f.app, 'releases', old));
  assert.equal(readFileSync(f.nginx, 'utf8'), 'original nginx\n');
  assert.equal(readFileSync(f.unit, 'utf8'), 'original service\n');
  assert.equal(existsSync(join(f.app, 'releases', revision)), false);
  assert.equal(existsSync(f.upload), false);
  f.preserved();
});

test('missing required OSS helper refuses deployment and removes only own upload', t => {
  const f = fixture(t); rmSync(f.helper); const result = f.run();
  assert.notEqual(result.status, 0); assert.match(result.stderr, /required verified OSS/i);
  assert.equal(existsSync(join(f.app, 'releases', revision)), false);
  assert.equal(existsSync(f.upload), false); f.preserved();
});

test('checksum mismatch is refused before any archival or application mutation', t => {
  const f = fixture(t), result = f.run('0'.repeat(64));
  assert.notEqual(result.status, 0); assert.match(result.stderr, /checksum mismatch/i);
  assert.equal(f.events().length, 0);
  assert.equal(resolve(readlinkSync(join(f.app, 'current'))), join(f.app, 'releases', old));
  assert.equal(existsSync(f.upload), false); f.preserved();
});

test('initial finalization failure blocks creation of another persistent release', t => {
  const f = fixture(t, {failFinalizeNumber: 1}), result = f.run();
  assert.notEqual(result.status, 0);
  assert.equal(existsSync(join(f.app, 'releases', revision)), false);
  assert.equal(f.events().length, 1);
  assert.equal(existsSync(f.upload), false); f.preserved();
});

test('failed health restores old current, previous and config then finalizes failed release', t => {
  const f = fixture(t, {healthFailure: true}), result = f.run();
  assert.notEqual(result.status, 0, result.stdout + result.stderr);
  assert.equal(resolve(readlinkSync(join(f.app, 'current'))), join(f.app, 'releases', old));
  assert.equal(resolve(readlinkSync(join(f.app, 'previous'))), join(f.app, 'releases', older));
  assert.equal(readFileSync(f.nginx, 'utf8'), 'original nginx\n');
  assert.equal(readFileSync(f.snippet, 'utf8'), 'original snippet\n');
  assert.equal(readFileSync(f.unit, 'utf8'), 'original service\n');
  assert.equal(existsSync(join(f.app, 'releases', revision)), false);
  assert.equal(existsSync(f.upload), false); f.preserved();
});

test('post-activation maintenance failure preserves the healthy new current and rollback version', t => {
  const f = fixture(t, {failFinalizeNumber: 2}), result = f.run();
  assert.notEqual(result.status, 0);
  assert.equal(resolve(readlinkSync(join(f.app, 'current'))), join(f.app, 'releases', revision));
  assert.equal(resolve(readlinkSync(join(f.app, 'previous'))), join(f.app, 'releases', old));
  assert.equal(readFileSync(f.unit, 'utf8'), 'new service\n');
  assert.equal(existsSync(f.upload), false); f.preserved();
});

test('invalid release manifest cannot alter live config and failed staging target is finalized', t => {
  const f = fixture(t, {badManifest: true}), result = f.run();
  assert.notEqual(result.status, 0);
  assert.equal(resolve(readlinkSync(join(f.app, 'current'))), join(f.app, 'releases', old));
  assert.equal(readFileSync(f.unit, 'utf8'), 'original service\n');
  assert.equal(existsSync(join(f.app, 'releases', revision)), false);
  assert.equal(existsSync(f.upload), false); f.preserved();
});
