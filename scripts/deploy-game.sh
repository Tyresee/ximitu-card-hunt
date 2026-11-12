#!/usr/bin/env bash
set -Eeuo pipefail
cd "$(dirname "$0")/.."
[[ -z $(git status --porcelain --untracked-files=normal) ]] || { echo 'Commit the intended game changes before deploying.' >&2; exit 1; }
npm run verify
release=$(git rev-parse HEAD)
stage=$(mktemp -d /tmp/ximitu-card-hunt.XXXXXXXX)
remote=''
ssh_options=(-o BatchMode=yes -o ConnectTimeout=10 -o StrictHostKeyChecking=yes)
cleanup() {
  local status=$?
  trap - EXIT
  if [[ $remote =~ ^/tmp/ximitu-card-hunt\.[A-Za-z0-9]+$ ]]; then
    ssh "${ssh_options[@]}" aliyun-ecs "rm -rf -- '$remote'" \
      || printf 'Upload staging cleanup needs attention: %s\n' "$remote" >&2
  fi
  rm -rf -- "$stage"
  exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
trap 'exit 129' HUP
python3 - "$stage/game.tar.gz" <<'PY'
import sys,tarfile
from pathlib import Path
with tarfile.open(sys.argv[1],'w:gz',format=tarfile.PAX_FORMAT) as tar:
    for p in sorted(Path('dist').rglob('*')):
        if p.is_file(): tar.add(p,arcname=p.relative_to('dist'),recursive=False)
PY
git bundle create "$stage/source.bundle" HEAD
checksum=$(shasum -a 256 "$stage/game.tar.gz" | cut -d' ' -f1)
ssh "${ssh_options[@]}" aliyun-ecs 'test -f /opt/tim-storage-archive/deploy_artifacts.py && test ! -L /opt/tim-storage-archive/deploy_artifacts.py' \
  || { printf '%s\n' 'Required verified OSS deployment archival helper is missing; upload refused.' >&2; exit 1; }
upload_bytes=$(( $(wc -c < "$stage/game.tar.gz") + $(wc -c < "$stage/source.bundle") ))
minimum_free_bytes=$((10 * 1024 * 1024 * 1024 + 4 * upload_bytes))
remote_available_bytes=$(ssh "${ssh_options[@]}" aliyun-ecs 'LC_ALL=C df -P -B1 /var/www' | awk 'NR == 2 {print $4}')
[[ $remote_available_bytes =~ ^[0-9]+$ ]] || { echo 'Cannot read the server disk reserve; upload refused.' >&2; exit 1; }
(( remote_available_bytes >= minimum_free_bytes )) || {
  printf 'Upload refused: server has %s free bytes; at least %s are required.\n' "$remote_available_bytes" "$minimum_free_bytes" >&2
  exit 1
}
remote=$(ssh "${ssh_options[@]}" aliyun-ecs 'mktemp -d /tmp/ximitu-card-hunt.XXXXXXXX')
[[ $remote =~ ^/tmp/ximitu-card-hunt\.[A-Za-z0-9]+$ ]]
scp "${ssh_options[@]}" "$stage/game.tar.gz" "$stage/source.bundle" "aliyun-ecs:$remote/"
scp "${ssh_options[@]}" deploy/apply-release.sh "aliyun-ecs:$remote/apply.sh"
scp "${ssh_options[@]}" deploy/ximitu-card-hunt.service "aliyun-ecs:$remote/service"
scp "${ssh_options[@]}" deploy/nginx/monopoly-split.locations.conf "aliyun-ecs:$remote/monopoly.conf"
scp "${ssh_options[@]}" scripts/install-platform-game-include.py "aliyun-ecs:$remote/install-include.py"
ssh "${ssh_options[@]}" aliyun-ecs "bash '$remote/apply.sh' '$release' '$checksum' '$remote'"
