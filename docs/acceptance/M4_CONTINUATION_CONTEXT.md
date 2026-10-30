# M4 continuation context

Updated: 2026-10-30

## User constraints and infrastructure

- User reports Limrun is unavailable. Do not retry Limrun without a credit/subscription change.
- In this session, Limrun returned: “organization has no remaining credits and no active subscription.” This confirms Limrun is blocked.
- User previously reported GitHub Actions unavailable until November. Latest user instruction was to check whether the limits had reopened and use Actions economically.
- Run #44 (`1ffd129407ead19df7bd1775f26e7f9f28fd41f4`) completed successfully. Run #45 (`64a72b18552cd8679b89f49b9e46667d77bb9244`) passed parser, unit, build, and package checks but failed after a 10-minute Android emulator boot timeout. The job log shows the runner used `-accel off`; KVM group permissions had not been configured.
- GitHub Actions is currently able to execute jobs, although quota availability is not guaranteed. Use at most one targeted rerun after the KVM and probe fixes below; do not repeat the prior emulator command without those fixes.
- The repository `xxiamadelxx-blip/sending-couriers` is public. Do not copy the user's source video or its frames into it, even temporarily.
- No new Actions run has been started for the current edits. The sole planned run should exercise Android OCR, write forecast facts, force-stop the app, restart it, and verify the facts through the active forecast views.

## M4 acceptance target

The parser must read the user's source video without AI, produce 33 distinct order rows at 100 ₽ each (3,300 ₽ total), write forecast facts, and preserve them after restarting the app. M4 remains IN PROGRESS until the actual source video is processed on Android and the forecast database is verified after restart.

## Current implementation and verified local path

- Current branch: `m4/offline-video-ocr-20261029`.
- Current repository head when this note was written: `64a72b18552cd8679b89f49b9e46667d77bb9244`.
- Parser v8 uses Tesseract hOCR word coordinates to pair the left time column with the right amount column. Candidate support counts unique frame fingerprints. It may discard one single-frame extra row only if all other rows repeat in at least three unique frames and removing it exactly matches both the slot row count and total.
- Source video: `/workspace/scratch/ddf598e00ab1/m4-source/1000048527(1).mp4` (81.407 s, 720×1608). It is outside the repository.
- Local diagnostic route that worked: sample 55 frames every 1.5 s; run host Tesseract 5.3.4 with pinned `rus+eng` models; parse both text and hOCR. This produced 33 rows × 100 ₽ after removing the one-frame `21:50` false candidate; `21:57` had five unique-frame observations, and both `18:57` occurrences were preserved.
- The host result is diagnostic only. It does not prove Android Tesseract, Android `MediaMetadataRetriever`, forecast-fact writing, or restart persistence.
- Local checks already passed on the implementation: parser Java harness 19/19, `npm test` 188/188, Python M4 tests 7/7, and `git diff --check`.
- Android SDK and Gradle are absent from the current container (`adb` and `gradle` unavailable).
- The current synthetic Android probe is being upgraded to call `M4ForecastFactWriter`, then verify one ₹100 order and one aggregate forecast row after an app process restart. A PASS here validates the Android pipeline shape only; it is not a PASS on the user's actual video.

## Paths already attempted

| Route | Result | Next action |
| --- | --- | --- |
| Local OCR/parser harness | Works; exact 33 × 100 ₽ diagnostic result | Reuse if the source file and `/tmp` assets still exist; regenerate otherwise |
| Limrun cloud emulator | Blocked by zero organization credits | Do not retry until access/credits change |
| GitHub Actions emulator probe | Run #45 failed because KVM acceleration permissions were missing; other CI steps passed | One configured run is justified by the latest user instruction; set KVM permissions and verify forecast DB restart persistence |

The next continuation should inspect the latest result of the single configured Android run before spending more Actions quota. The actual video remains at `/workspace/scratch/ddf598e00ab1/m4-source/1000048527(1).mp4`; keep it local because its source repository is public. To reach the real-video Android acceptance target, use an already authorized private/device-local route or ask for authorization before transferring the clip to another service.
