#!/usr/bin/env bash
set -Eeuo pipefail
umask 027
release=${1:?full Git SHA required}
checksum=${2:?archive checksum required}
upload=${3:?upload directory required}
die(){ printf '%s\n' "$*" >&2; exit 1; }
[[ $release =~ ^[0-9a-f]{40}$ && $checksum =~ ^[0-9a-f]{64}$ ]] || die 'Invalid release identity/checksum.'
[[ $upload =~ ^/tmp/ximitu-card-hunt\.[A-Za-z0-9]+$ ]] || die 'Invalid upload directory.'
[[ $(id -u) == 0 ]] || die 'Root is required.'
[[ $(hostname) == iZbp14nomwqy2mytgji1y2Z ]] || die 'Unexpected production host.'
exec 9>/run/lock/ximitu-card-hunt-deploy.lock
flock -n 9 || die 'Another deployment, rollback or archive is active.'
base=/var/www/ximitu-card-hunt
nginx=/etc/nginx/conf.d/wordattack.timclass.cn.conf
snippet=/etc/nginx/voice-word-attack-games/monopoly.conf
unit=/etc/systemd/system/ximitu-card-hunt.service
archive=$upload/game.tar.gz
artifact_helper=/opt/tim-storage-archive/deploy_artifacts.py
backup=$upload/rollback
previous=''; previous_link=''; changed=false; target_created=false
target=$base/releases/$release
swap_link() {
  local temporary=$2.swap.$$
  [[ ! -e $temporary && ! -L $temporary ]] || return 1
  ln -s "$1" "$temporary" || return 1
  mv -Tf "$temporary" "$2" || { rm -f -- "$temporary"; return 1; }
}
finish() {
  local status=$? rollback_failed=0
  trap - EXIT
  set +e
  if ((status != 0)) && $changed; then
    cp -p "$backup/nginx.conf" "$nginx" || rollback_failed=1
    cp -p "$backup/service" "$unit" || rollback_failed=1
    if [[ -f $backup/monopoly.conf ]]; then cp -p "$backup/monopoly.conf" "$snippet" || rollback_failed=1; else rm -f "$snippet" || rollback_failed=1; fi
    swap_link "$previous" "$base/current" || rollback_failed=1
    if [[ -n $previous_link ]]; then swap_link "$previous_link" "$base/previous" || rollback_failed=1; else rm -f "$base/previous" || rollback_failed=1; fi
    systemctl daemon-reload || rollback_failed=1
    systemctl restart ximitu-card-hunt || rollback_failed=1
    nginx -t && systemctl reload nginx || rollback_failed=1
    if ((rollback_failed)); then
      printf 'ROLLBACK NEEDS OPERATOR ATTENTION; verified configuration archive is in the private OSS recovery index.\n' >&2
    else
      printf 'Deployment failed; restored %s\n' "$previous" >&2
    fi
  fi
  # The helper owns validated archival/removal of failed inactive targets too.
  # If OSS is unavailable it keeps that target; the next publish must finalize
  # successfully before it can create another persistent release.
  if $target_created && [[ $(readlink -f "$base/current" 2>/dev/null) != "$target" ]]; then
    python3 "$artifact_helper" finalize --project ximitu-card-hunt \
      || printf 'Inactive failed release retained; required archival must succeed before the next deployment.\n' >&2
  fi
  rm -rf -- "$upload"
  exit "$status"
}
trap finish EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
trap 'exit 129' HUP
[[ -f $artifact_helper && ! -L $artifact_helper ]] || { printf '%s\n' 'Required verified OSS deployment archival helper is missing; deployment refused.' >&2; exit 1; }
[[ $(sha256sum "$archive" | cut -d' ' -f1) == "$checksum" ]] || die 'Release archive checksum mismatch.'
if [[ -f /opt/tim-storage-archive/disk_preflight.py ]]; then
  python3 /opt/tim-storage-archive/disk_preflight.py --archive "$archive" --source-bundle "$upload/source.bundle" \
    || { printf '%s\n' 'Disk reserve preflight refused this deployment.' >&2; exit 1; }
fi
[[ $(curl --fail --silent --max-time 5 http://127.0.0.1:19321/api/health | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).status') == ok ]] || die 'Shared platform is not healthy.'
previous=$(readlink -f "$base/current")
[[ $previous == "$base/releases/"* && -d $previous ]] || die 'Current release is not a managed directory.'
if [[ -e $base/previous || -L $base/previous ]]; then
  [[ -L $base/previous ]] || die 'Previous release pointer must be a symlink.'
  previous_link=$(readlink -f "$base/previous")
  [[ $previous_link == "$base/releases/"* && -d $previous_link ]] || die 'Previous release is not a managed directory.'
fi
[[ ! -e $target && ! -L $target ]] || die 'Release target already exists.'
python3 "$artifact_helper" finalize --project ximitu-card-hunt
python3 "$artifact_helper" archive --project ximitu-card-hunt --kind source --artifact "$upload/source.bundle" --revision "$release" > "$upload/source.archive.json"
rm -f -- "$upload/source.bundle"
python3 "$artifact_helper" archive --project ximitu-card-hunt --kind release --artifact "$archive" --revision "$release" > "$upload/release.archive.json"
install -d -m 0700 "$backup"
cp -p "$nginx" "$backup/nginx.conf"
cp -p "$unit" "$backup/service"
if [[ -f $snippet ]]; then cp -p "$snippet" "$backup/monopoly.conf"; fi
printf '%s\n' "$previous" > "$backup/previous-release"
printf '%s\n' "$previous_link" > "$backup/previous-pointer"
tar -czf "$upload/rollback.tar.gz" -C "$backup" .
python3 "$artifact_helper" archive --project ximitu-card-hunt --kind data-backup --artifact "$upload/rollback.tar.gz" --revision "$release" > "$upload/rollback.archive.json"
rm -f -- "$upload/rollback.tar.gz"
mkdir "$target"
target_created=true
python3 - "$archive" "$target" "$release" <<'PY'
import tarfile,sys,json,hashlib
from pathlib import Path
archive,target,release=sys.argv[1:]
root=Path(target)
with tarfile.open(archive) as tar:
    for entry in tar.getmembers():
        if entry.name.startswith('/') or '..' in Path(entry.name).parts or not (entry.isfile() or entry.isdir()):
            raise ValueError('Unsafe archive member')
    tar.extractall(target)
manifest=json.loads((root/'release.json').read_text())
assert manifest['version']==release
for name,digest in manifest['files'].items():
    assert name.startswith('/games/monopoly/') or name.startswith('/games/monopoly-runtime/')
    assert hashlib.sha256((root/'public'/name.lstrip('/')).read_bytes()).hexdigest()==digest,name
PY
rm -f -- "$archive"
chown -R root:root "$target"
chmod -R a+rX "$target"
changed=true
install -m 0644 "$upload/monopoly.conf" "$snippet"
python3 "$upload/install-include.py" "$nginx"
install -m 0644 "$upload/service" "$unit"
nginx -t
swap_link "$target" "$base/current"
systemctl daemon-reload
systemctl restart ximitu-card-hunt
for attempt in {1..20}; do
  actual=$(curl --fail --silent --max-time 2 http://127.0.0.1:19421/health | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).version' 2>/dev/null || true)
  [[ $actual == "$release" ]] && break
  sleep 1
done
[[ $actual == "$release" ]] || die 'New game service did not become healthy.'
systemctl reload nginx
[[ $(curl --silent --output /dev/null --write-out '%{http_code}' --max-time 10 https://wordattack.timclass.cn/games/monopoly/) == 302 ]] || die 'Public game route check failed.'
[[ $(curl --fail --silent --max-time 10 https://wordattack.timclass.cn/games/monopoly/health | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).version') == "$release" ]] || die 'Public game version check failed.'
systemctl is-active voice-word-attack ximitu-card-hunt nginx
swap_link "$previous" "$base/previous"
# Healthy application activation is committed before maintenance finalization.
# A later OSS outage reports failure but must not roll back a healthy release.
changed=false
python3 "$artifact_helper" finalize --project ximitu-card-hunt
printf 'Deployed %s; source, release and rollback configuration verified in private OSS.\n' "$release"
