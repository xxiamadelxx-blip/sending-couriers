#!/usr/bin/env bash
set -euo pipefail

package=ru.courier.finance.m4probe
activity=ru.courier.finance.M4DeviceProbeActivity
window=/sdcard/m4-window.xml
artifact_dir="${RUNNER_TEMP:-/tmp}/m4-artifacts"
mkdir -p "$artifact_dir"

capture_screen() {
  local name="$1"
  adb exec-out screencap -p > "$artifact_dir/$name"
  test -s "$artifact_dir/$name"
  sha256sum "$artifact_dir/$name"
}

fail_with_diagnostics() {
  capture_screen m4-failure.png || true
  adb shell cat "$window" || true
  adb logcat -d -s AndroidRuntime:E
  return 1
}

wait_for_marker() {
  local success_marker="$1"
  local failure_marker="$2"
  local attempts="$3"
  local screen
  for ((attempt=0; attempt<attempts; attempt++)); do
    adb shell uiautomator dump "$window" >/dev/null 2>&1 || true
    screen=$(adb shell cat "$window" 2>/dev/null || true)
    if grep -Fq "$success_marker" <<<"$screen"; then
      printf '%s\n' "$screen"
      return 0
    fi
    if grep -Fq "$failure_marker" <<<"$screen"; then
      printf '%s\n' "$screen"
      fail_with_diagnostics
      return 1
    fi
    sleep 2
  done
  fail_with_diagnostics
}

adb install app/build/outputs/apk/debug/app-debug.apk
adb shell am start -W -n "$package/$activity"
wait_for_marker "M4 FORECAST WRITE PASS" "M4 FORECAST QA FAIL" 90
capture_screen m4-forecast-write.png
adb shell am force-stop "$package"
adb shell am start -W -n "$package/$activity" --ez m4.verifyRestart true
wait_for_marker "M4 FORECAST RESTART PASS" "M4 FORECAST RESTART FAIL" 30
capture_screen m4-forecast-restart.png
