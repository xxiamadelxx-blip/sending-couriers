# Home premium text on yellow panel · 28 Oct 2026

The real Android 35 dark screenshot `ui-after/home-finance-360-dark.png` at branch SHA `dd4715c05adb2c1ff512585dce3d5e5e6fe24113` ([run 40691445430](https://github.com/xxiamadelxx-blip/sending-couriers/actions/runs/40691445430), artifact `12818303871`) shows pale premium text on the yellow income panel. In light theme the same text is already dark. The proposed fragment, `design/review/home-premiums-contrast-concept.html`, compared the current light-on-yellow copy with dark copy and explicitly marked its icons as schematic. The owner saw the proposal and replied **«Да, реализуйте»**. This approves a narrow color change in the night theme, not a new Home layout or a change to the pace ring.

The source change sets the premium button text, its heading, and explicit amount color to the same dark ink already used for other facts on that panel. No amounts, calculations, storage, navigation, or light-theme colors change. `npm test`: 20 suites PASS. Browser renderings at 360px confirmed dark ink on the heading, labels, SVG icons, and amounts in the night theme; they are not Android visual evidence.

New Android before/after visual review and owner verdict: **PENDING**. The independent native edit-label and 200% font-form diagnostics remain historical FAIL. TalkBack speech and owner-signed upgrade remain NOT RUN.
