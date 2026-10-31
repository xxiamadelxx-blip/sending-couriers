#!/usr/bin/env bash
set -euo pipefail

package=ru.courier.finance.m3probe
activity=ru.courier.finance.m3probe.M3DeviceProbeActivity
apk="${RUNNER_TEMP}/m3-limrun-debug.apk"
window=/sdcard/m3-window.xml
artifact_dir="${RUNNER_TEMP}/m3-artifacts"
mkdir -p "$artifact_dir"

capture_screen() {
  local name="$1"
  adb exec-out screencap -p > "$artifact_dir/$name"
  test -s "$artifact_dir/$name"
  sha256sum "$artifact_dir/$name"
}

fail_with_diagnostics() {
  capture_screen m3-failure.png || true
  adb shell cat "$window" || true
  adb logcat -d -s AndroidRuntime:E
  return 1
}

adb install "$apk"
adb shell am start -W -n "$package/$activity"
for ((attempt=0; attempt<90; attempt++)); do
  adb shell uiautomator dump "$window" >/dev/null 2>&1 || true
  screen=$(adb shell cat "$window" 2>/dev/null || true)
  if grep -Fq 'M3 NATIVE OFFLINE QA PASS' <<<"$screen"; then
    printf '%s\n' "$screen"
    capture_screen m3-native-forecast-pass.png
    echo 'M3 ANDROID 35 PROBE PASS'
    exit 0
  fi
  if grep -Fq 'M3 NATIVE OFFLINE QA FAIL' <<<"$screen"; then
    printf '%s\n' "$screen"
    fail_with_diagnostics
    exit 1
  fi
  sleep 2
done
echo 'Timed out waiting for M3 probe result'
fail_with_diagnostics
