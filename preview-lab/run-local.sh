#!/usr/bin/env bash
set -euo pipefail

lab_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ssh_key="$HOME/.ssh/id_rsa"
known_hosts="$lab_dir/../../../outputs/marketing-collector/known_hosts"

if [[ ! -f "$lab_dir/browser/dist/index.html" ]]; then
  echo "Build the browser first: cd browser && npm ci && npm run build" >&2
  exit 1
fi

ssh -N -o ExitOnForwardFailure=yes -o BatchMode=yes \
  -o ServerAliveInterval=30 -o ConnectTimeout=8 \
  -o StrictHostKeyChecking=yes -o UserKnownHostsFile="$known_hosts" \
  -i "$ssh_key" \
  -L 127.0.0.1:18080:127.0.0.1:18080 \
  -L 127.0.0.1:18081:127.0.0.1:18081 \
  -L 127.0.0.1:18082:127.0.0.1:18082 \
  root@49.12.126.233 &
tunnel_pid=$!

cleanup() { kill "$tunnel_pid" 2>/dev/null || true; }
trap cleanup EXIT INT TERM

sleep 1
if ! kill -0 "$tunnel_pid" 2>/dev/null; then
  echo "Preview SSH tunnel did not start. Check host access and port 18080." >&2
  exit 1
fi

echo "Preview app picker: http://127.0.0.1:5173/?pool=1"
echo "Direct worker diagnostics: http://127.0.0.1:5173/ and http://127.0.0.1:5173/?worker=2"
python3 -m http.server 5173 --bind 127.0.0.1 --directory "$lab_dir/browser/dist"
