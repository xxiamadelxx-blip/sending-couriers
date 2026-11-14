# Historical refactor checkpoints

This file retains older verification evidence removed from active project context. Use `../PROJECT_CONTEXT.md` for current state.

- At checkpoint `b699c9e3375d0e68fb76b0078e4325c883c12ff`, Node regressions passed 239/239, Python tests 87/87, `parseWorkbook` differential checks passed 120 deterministic cases, and five-screen save/import/navigation comparisons matched.
- Formula-gate commit `37c94919ccefcd761a24bdf97c38fcf5a60c431e` added targeted financial mutation checks; its report recorded 28/28 mutations killed.
- Context checkpoint `058f40103a96a0c55496eaef114f3d78a23c72ef` passed UI audit run [#42418477418](https://github.com/xxiamadelxx-blip/sending-couriers/actions/runs/42418477418) and Android QA run [#42418477501](https://github.com/xxiamadelxx-blip/sending-couriers/actions/runs/42418477501). The audit checked Android 35 layout, accessibility, import and transfer-package gates.
- The earlier Gradle OOM at run [#42413446003](https://github.com/xxiamadelxx-blip/sending-couriers/actions/runs/42413446003) was superseded by the successful rerun; no memory setting change was made.
- Historical owner certificate fingerprint: `eed086d5bdb63dd425494f3a585e90243224c0305eda4ff40845d7744f7a5ef1`. Previously verified owner-signed APK SHA-256: `3f7bb979935891a43c408ed58e4183f27394fd73c0591f5e175be23abaf25a64`. These are historical identifiers; check local ignored signing files before any transfer build.
- Past UI audit artifacts used a temporary test signer and did not prove an installed-app upgrade. The owner must review real Android captures for visual approval.
