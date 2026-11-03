# UI geometry — working audit, 3 November 2026

Baseline: branch ui/unslop-light-polish-20261102, c3a01859810a62ff76b3c0131188cab9c6d809b5. The supplied video shows different CSS and app script hashes from this baseline; matching the exact build in the recording is not established. The reference APK named Round-FAB was compared locally, not asserted to be the one in the video.

| Observation | Screen | Code / change | Evidence and status |
|---|---|---|---|
| Square plus; light active tab too faint | navigation | web/style.css: nav is a sibling of #app; repair selectors, circle 56px, theme accent | Video 00:00–01:24; Android recheck NOT RUN |
| Lines inset, warning visually detached | Home | web/style.css: separate padded sections and their borders in home-focus | User annotation; Android recheck NOT RUN |
| Narrow financial columns, duplicate lines | Home | web/style.css: label/value rows, single full-width section boundary | Video 00:00–00:08; Android recheck NOT RUN |
| Dots outside cards | Home | web/style.css: remove decorative route rail and marker | Video 00:00–00:08; Android recheck NOT RUN |
| Day information displaced; slot details | Period | web/period-day-view.mjs, web/style.css: title left, money right, facts below, grouped editable slots | Video 00:08–00:17; Android recheck NOT RUN |
| Nested frames | History | web/style.css: separate nested slots with horizontal lines | Video 00:18–00:36; Android recheck NOT RUN |
| Half-width deduction summary and double chevron | Add slot | web/style.css and web/app.mjs: full grid span and one disclosure marker | Video 00:44; Android recheck NOT RUN |
| Settings date spacing | Settings | web/style.css: single 8px field gap | Video 01:24; Android recheck NOT RUN |

Reference mapping: [YNAB app overview](https://www.ynab.com/features) for total and categorized money, [Actual Budget example](https://actualbudget.org/docs/contributing/writing-docs/) for stable numeric columns, [Toggl Android List View and editing](https://support.toggl.com/en-us/article/toggl-track-timer-for-android-1v3i5g8/) for date-grouped entries and editing. Adaptation only; radii and spacing are the owner's specification, not reference measurements. These links are source pointers; side-by-side visual evidence remains NOT RUN.

Full Android matrix, visual owner approval, weather live request, built versionCode verification, signing and real 1.7.27 upgrade with data preserved remain NOT RUN. No release PASS is claimed.
