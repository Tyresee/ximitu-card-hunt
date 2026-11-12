#!/usr/bin/env bash
set -Eeuo pipefail
[[ $(id -u) == 0 && $# == 0 ]]
bridge=monopoly-points-bridge.service
platform=voice-word-attack.service
unit=/etc/systemd/system/$bridge
[[ $(systemctl show "$bridge" -p FragmentPath --value) == "$unit" ]]
[[ $(sed -n '/^Requires=/p' "$unit") == 'Requires=voice-word-attack.service' \
  || ( -z $(sed -n '/^Requires=/p' "$unit") && $(sed -n '/^Wants=/p' "$unit") == 'Wants=voice-word-attack.service' ) ]]
systemctl is-active --quiet "$platform"
platform_pid=$(systemctl show "$platform" -p MainPID --value)
[[ $platform_pid =~ ^[1-9][0-9]*$ ]]
backup=/opt/monopoly-points-bridge/backups/lifecycle-$(date -u +%Y%m%dT%H%M%SZ)
install -d -m 0700 "$backup"
cp -p "$unit" "$backup/service"
systemctl show "$bridge" -p Requires -p Wants -p After -p MainPID -p ActiveState > "$backup/before.txt"
rollback() {
  local status=$?
  trap - EXIT
  if (( status != 0 )); then
    cp -p "$backup/service" "$unit"
    systemctl daemon-reload
    echo "Lifecycle configuration restored; backup: $backup" >&2
  fi
  exit "$status"
}
trap rollback EXIT
# Dependencies cannot be removed through a drop-in. Change exactly this line in
# the full installed unit, keeping every Service setting and sandbox unchanged.
python3 - "$unit" "$backup/service" <<'PY'
from pathlib import Path
import sys
path, original = map(Path, sys.argv[1:])
before = original.read_bytes()
old = b'Requires=voice-word-attack.service\n'
new = b'Wants=voice-word-attack.service\n'
assert before.count(old) == 1 or (old not in before and before.count(new) == 1)
after = before.replace(old, new)
assert before.split(b'[Service]', 1)[1] == after.split(b'[Service]', 1)[1]
path.write_bytes(after)
PY
systemctl daemon-reload
requires=$(systemctl show "$bridge" -p Requires --value)
wants=$(systemctl show "$bridge" -p Wants --value)
after=$(systemctl show "$bridge" -p After --value)
[[ " $requires " != *" $platform "* && " $wants " == *" $platform "* && " $after " == *" $platform "* ]]
# Starting an already active unit leaves its process and original events intact.
systemctl start "$bridge"
for attempt in {1..10}; do
  if curl --fail --silent --max-time 3 http://127.0.0.1:19423/healthz > "$backup/health.json"; then break; fi
  sleep 1
done
node -e 'const h=JSON.parse(require("fs").readFileSync(process.argv[1])); if(h.ok!==true||h.service!=="monopoly-points-bridge")process.exit(1)' "$backup/health.json"
[[ $(systemctl show "$platform" -p MainPID --value) == "$platform_pid" ]]
systemctl is-active --quiet "$platform" "$bridge"
systemctl show "$bridge" -p Requires -p Wants -p After -p MainPID -p ActiveState > "$backup/after.txt"
printf 'Bridge lifecycle repaired; platform PID unchanged; backup: %s\n' "$backup"
