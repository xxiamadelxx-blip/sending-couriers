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

adb shell am force-stop "$package"
adb shell am start -W -n "$package/$activity" --ez m6.verifyWorker true
wait_for_marker "M6 WORKER PASS" "M6 WORKER FAIL" 120
capture_screen m6-worker.png
adb shell am force-stop "$package"
adb shell am start -W -n "$package/$activity" --ez m6.verifyRestart true
wait_for_marker "M6 RESTART PASS" "M6 RESTART FAIL" 30
capture_screen m6-restart.png

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
