#!/usr/bin/env bash
set -euo pipefail

emulator_service="${PREVIEW_EMULATOR_SERVICE:-northstar-preview-emulator.service}"
device="${PREVIEW_DEVICE:-emulator-5560}"
package="${PREVIEW_PACKAGE:-org.wikipedia}"
state_dir="${PREVIEW_STATE_DIR:-/var/lib/northstar-preview}"
if [[ -r "$state_dir/last-package" ]]; then
  last_package=""
  IFS= read -r last_package < "$state_dir/last-package" || true
  if [[ "$last_package" =~ ^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$ ]] &&
     [[ -f "/opt/northstar/preview-lab/apks/$last_package/manifest.json" ]] &&
     { [[ "${PREVIEW_ALLOWED_PACKAGES:-$package}" == "*" ]] ||
       [[ ",${PREVIEW_ALLOWED_PACKAGES:-$package}," == *",$last_package,"* ]]; }; then
    package="$last_package"
  fi
fi
export PREVIEW_DEVICE="$device"
export PREVIEW_PACKAGE="$package"
export PREVIEW_APP_NAME="${PREVIEW_APP_NAME:-Wikipedia}"
export PREVIEW_PORT="${PREVIEW_PORT:-18080}"
export PREVIEW_RESET_REQUEST="$state_dir/reset-request"

emulator_pid="$(systemctl show --property=MainPID --value "$emulator_service")"
if [[ ! "$emulator_pid" =~ ^[1-9][0-9]*$ ]]; then
  echo "Preview emulator is not running" >&2
  exit 1
fi

discovery_file="/opt/northstar/.android/avd/running/pid_${emulator_pid}.ini"
adb="/opt/android-sdk/platform-tools/adb"
for attempt in {1..30}; do
  if [[ -f "$discovery_file" ]]; then
    break
  fi
  sleep 1
done

if [[ ! -f "$discovery_file" ]]; then
  echo "Preview emulator discovery file did not appear" >&2
  exit 1
fi

boot_marker="$state_dir/served-emulator-pid"
if [[ -f "$boot_marker" && "$(cat "$boot_marker")" == "$emulator_pid" ]]; then
  echo "Gateway restarted on a previously served device; forcing a clean boot" >&2
  : > "$PREVIEW_RESET_REQUEST"
  exit 1
fi
printf '%s\n' "$emulator_pid" > "$boot_marker"

for attempt in {1..300}; do
  if [[ "$("$adb" -s "$device" shell getprop sys.boot_completed 2>/dev/null || true)" == "1" ]]; then
    break
  fi
  sleep 1
done

if [[ "$("$adb" -s "$device" shell getprop sys.boot_completed 2>/dev/null || true)" != "1" ]]; then
  echo "Preview emulator did not finish booting" >&2
  exit 1
fi

# Android can report boot_completed before PackageManager accepts installs.
# A wiped guest must finish bringing that service up before we stage the app.
package_manager_ready=false
for attempt in {1..45}; do
  if "$adb" -s "$device" shell pm path com.android.vending 2>/dev/null | grep -q '^package:'; then
    package_manager_ready=true
    break
  fi
  sleep 2
done
if [[ "$package_manager_ready" != true ]]; then
  echo "Preview emulator package manager did not become ready" >&2
  exit 1
fi

account_dump="$("$adb" -s "$device" shell dumpsys account)"
account_count="$(grep -c 'Account {' <<< "$account_dump" || true)"
if [[ "$account_count" != "0" ]]; then
  echo "Preview emulator contains an Android account; refusing to serve it" >&2
  exit 1
fi

installed=false
for attempt in {1..3}; do
  if python3 /opt/northstar/preview-lab/app_catalog.py install "$package" --serial "$device"; then
    installed=true
    break
  fi
  sleep 5
done
if [[ "$installed" != true ]]; then
  echo "Preview app installation failed after retry" >&2
  exit 1
fi
python3 /opt/northstar/preview-lab/prepare_headless_input.py --ensure "$device"
# This emulator has no Bluetooth packet streamer. Its Google Bluetooth process
# repeatedly crashes on cold boots and covers the app with an error dialog.
# Keep this workaround confined to the standalone preview AVD.
"$adb" -s "$device" shell settings put global bluetooth_on 0
"$adb" -s "$device" shell pm disable-user --user 0 com.google.android.bluetooth >/dev/null
"$adb" -s "$device" shell am force-stop com.google.android.bluetooth
"$adb" -s "$device" shell input keyevent 4
"$adb" -s "$device" shell monkey -p "$package" -c android.intent.category.LAUNCHER 1 >/dev/null
# The Bluetooth process can crash during the wiped boot before its package is
# disabled. Android may surface that queued error after the app launches. Only
# dismiss this exact system crash; never hide an error from the previewed app.
for attempt in {1..10}; do
  focus="$("$adb" -s "$device" shell dumpsys window 2>/dev/null | grep 'mCurrentFocus=' | head -1 || true)"
  if [[ "$focus" == *"Application Error: com.google.android.bluetooth"* ]]; then
    "$adb" -s "$device" shell input keyevent 4
  fi
  sleep 1
done

exec /opt/northstar/preview-lab/venv/bin/python \
  /opt/northstar/preview-lab/server/preview_server.py \
  --discovery-file="$discovery_file"
