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

disable_network() {
  adb shell svc wifi disable >/dev/null 2>&1 || true
  adb shell svc data disable >/dev/null 2>&1 || true
  adb shell settings put global airplane_mode_on 1 >/dev/null 2>&1 || true
  adb shell am broadcast -a android.intent.action.AIRPLANE_MODE --ez state true >/dev/null 2>&1 || true
  sleep 3
}

assert_web_morning_catchup() {
  local target="$1"
  adb shell run-as "$package" cat shared_prefs/courier_finance.xml 2>/dev/null \
    | python3 -c 'import json,sys,xml.etree.ElementTree as ET; root=ET.fromstring(sys.stdin.read()); raw=root.find("./string[@name=\"state\"]").text; state=json.loads(raw); rows=state.get("forecast",{}).get("snapshots",[]); found=[row for row in rows if row.get("date")==sys.argv[1] and row.get("kind")=="MORNING" and str(row.get("id","")).startswith("MORNING-"+sys.argv[1]+"-")]; sys.exit(0 if len(found)==1 else 1)' "$target"
}

adb install app/build/outputs/apk/debug/app-debug.apk
adb shell am start -W -n "$package/$activity"
wait_for_marker "M4 FORECAST WRITE PASS" "M4 FORECAST QA FAIL" 90
capture_screen m4-forecast-write.png
adb shell am force-stop "$package"
adb shell am start -W -n "$package/$activity" --ez m4.verifyRestart true
wait_for_marker "M4 FORECAST RESTART PASS" "M4 FORECAST RESTART FAIL" 30
capture_screen m4-forecast-restart.png

adb shell am force-stop "$package"
disable_network
adb shell am start -W -n "$package/$activity" --ez m6.checkOffline true
wait_for_marker "M6 OFFLINE PASS" "M6 OFFLINE FAIL" 30
capture_screen m6-offline-before.png
adb shell am force-stop "$package"
adb shell am start -W -n "$package/$activity" --ez m6.verifyWorker true
wait_for_marker "M6 ENQUEUED" "M6 WORKER FAIL" 30
capture_screen m6-enqueued.png
original_pid=$(adb shell pidof "$package" 2>/dev/null | tr -d '\r' || true)
test -n "$original_pid"
adb shell input keyevent KEYCODE_HOME
sleep 2
adb shell am kill "$package"
process_stopped=0
for attempt in $(seq 1 30); do
  if [[ -z "$(adb shell pidof "$package" 2>/dev/null | tr -d '\r' || true)" ]]; then
    process_stopped=1
    break
  fi
  sleep 1
done
if [[ "$process_stopped" -ne 1 ]]; then
  echo "M6 harness could not kill the background app process"
  fail_with_diagnostics
fi
worker_restarted_process=0
for attempt in $(seq 1 120); do
  restarted_pid=$(adb shell pidof "$package" 2>/dev/null | tr -d '\r' || true)
  if [[ -n "$restarted_pid" && "$restarted_pid" != "$original_pid" ]]; then
    worker_restarted_process=1
    break
  fi
  sleep 1
done
if [[ "$worker_restarted_process" -ne 1 ]]; then
  echo "WorkManager did not restart the app process while its activity was closed"
  fail_with_diagnostics
fi
# Create a new Activity instance so the restart intent is not swallowed by the old task stack.
adb shell am start -W -n "$package/$activity" -f 0x10008000 --ez m6.verifyRestart true
wait_for_marker "M6 RESTART PASS" "M6 RESTART FAIL" 120
capture_screen m6-restart.png

adb shell am force-stop "$package"
adb shell am start -W -n "$package/$activity" -f 0x10008000 --ez m6.queueReboot true
wait_for_marker "M6 REBOOT ENQUEUED" "M6 REBOOT QUEUE FAIL" 30
capture_screen m6-reboot-enqueued.png
adb reboot
timeout 180s adb wait-for-device
booted=0
for attempt in $(seq 1 120); do
  if [[ "$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r' || true)" == "1" ]]; then
    booted=1
    break
  fi
  sleep 2
done
if [[ "$booted" -ne 1 ]]; then
  echo "M6 emulator did not finish rebooting"
  adb logcat -d -s AndroidRuntime:E || true
  exit 1
fi
disable_network
adb shell am start -W -n "$package/$activity" -f 0x10008000 --ez m6.checkOffline true
wait_for_marker "M6 OFFLINE PASS" "M6 OFFLINE FAIL" 30
capture_screen m6-offline-after-reboot.png
adb shell am start -W -n "$package/$activity" -f 0x10008000 --ez m6.verifyReboot true
wait_for_marker "M6 REBOOT PASS" "M6 REBOOT FAIL" 180
capture_screen m6-reboot.png

target=$(adb shell run-as "$package" cat shared_prefs/m6-forecast-qa.xml \
  | python3 -c 'import sys,xml.etree.ElementTree as ET; print(ET.fromstring(sys.stdin.read()).find("./string[@name=\"target\"]").text)')
adb shell am force-stop "$package"
adb shell am start -W -n "$package/ru.courier.finance.MainActivity" -f 0x10008000
catchup=0
for attempt in $(seq 1 60); do
  if assert_web_morning_catchup "$target"; then
    catchup=1
    break
  fi
  sleep 2
done
if [[ "$catchup" -ne 1 ]]; then
  echo "M6 app opening did not persist the current-day Web morning forecast"
  fail_with_diagnostics
fi
echo "M6 APP-OPEN CATCH-UP PASS: $target"
capture_screen m6-app-open-catchup.png

if [[ -f "${RUNNER_TEMP}/m4-real/one.mp4" && -f "${RUNNER_TEMP}/m4-real/two.mp4" ]]; then
  import_real_video() {
    local name="$1" file="$2" expected="$3" screen="" progress="" observed_progress=""
    # run-as is available only for this isolated debug APK. A file URI owned by
    # the app exercises M4VideoImportActivity without relying on MediaStore scan.
    adb push "$file" "/data/local/tmp/$name" >/dev/null
    adb shell run-as "$package" cp "/data/local/tmp/$name" "files/$name"
    adb shell am start -W -a android.intent.action.SEND -t video/mp4 \
      -d "file:///data/user/0/$package/files/$name" \
      -n "$package/ru.courier.finance.M4VideoImportActivity" >/dev/null
    for ((attempt=0; attempt<180; attempt++)); do
      timeout 8s adb shell uiautomator dump "$window" >/dev/null 2>&1 || true
      screen=$(timeout 5s adb shell cat "$window" 2>/dev/null || true)
      if grep -Fq "Распознано и сверено строк заказов: $expected из $expected" <<<"$screen"; then
        adb logcat -d -s M4VideoQa:I | tail -2 || true
        adb shell run-as "$package" rm "files/$name"
        adb shell rm "/data/local/tmp/$name"
        echo "M4 REAL IMPORT PASS: $expected orders"
        return 0
      fi
      if grep -Fq 'text="Импорт видео"' <<<"$screen" \
          || grep -Fq 'text="Результат импорта видео"' <<<"$screen"; then
        progress=$(grep -oE 'Извлечено строк заказов: [0-9]+|строк списка — [0-9]+|На карточке слота указано заказов: [0-9]+' <<<"$screen" | head -3 | tr '\n' ';' || true)
        echo "M4 REAL FAIL: completed import dialog without accepted facts; ${progress}"
        adb logcat -d -s M4VideoQa:I | tail -2 || true
        return 1
      fi
      if ((attempt % 6 == 0)); then
        progress=$(grep -oE 'Кадров обработано: [0-9]+ из [0-9]+' <<<"$screen" | head -1 || true)
        if [[ -n "$progress" ]]; then observed_progress="$progress"; echo "M4 REAL OCR PROGRESS: $progress";
        else echo "M4 REAL UI: waiting for import result"; fi
      fi
      sleep 5
    done
    echo "M4 REAL FAIL: import timed out ${observed_progress}"
    return 1
  }

  real_package=ru.courier.finance.m4probe
  package="$real_package"
  adb shell am force-stop "$package"
  real_source_one=$(sha256sum "${RUNNER_TEMP}/m4-real/one.mp4" | cut -d' ' -f1)
  real_source_two=$(sha256sum "${RUNNER_TEMP}/m4-real/two.mp4" | cut -d' ' -f1)
  import_real_video m4-real-one.mp4 "${RUNNER_TEMP}/m4-real/one.mp4" 28
  import_real_video m4-real-two.mp4 "${RUNNER_TEMP}/m4-real/two.mp4" 9
  adb shell am force-stop "$package"
  adb shell am start -W -n "$package/$activity" --ez m4.verifyReal true \
    --es m4.sourceOne "$real_source_one" --es m4.sourceTwo "$real_source_two" >/dev/null
  for ((attempt=0; attempt<30; attempt++)); do
    adb shell uiautomator dump "$window" >/dev/null 2>&1 || true
    screen=$(adb shell cat "$window" 2>/dev/null || true)
    if grep -Fq 'M4 REAL VIDEO RESTART PASS' <<<"$screen"; then
      echo 'M4 REAL VIDEO RESTART PASS'
      exit 0
    fi
    if grep -Fq 'M4 REAL VIDEO RESTART FAIL' <<<"$screen"; then
      echo 'M4 REAL VIDEO RESTART FAIL'
      exit 1
    fi
    sleep 2
  done
  echo 'M4 REAL VIDEO RESTART TIMEOUT'
  exit 1
fi
