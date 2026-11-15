# Transfer APK signing

The existing transfer-app signer is present in the active shared checkout at these paths:

- Keystore: `signing/courier-transfer.jks`
- Password file: `signing/password.txt`
- Alias: `courier-transfer`
- Certificate SHA-256: `eed086d5bdb63dd425494f3a585e90243224c0305eda4ff40845d7744f7a5ef1`

The keystore and password are local private files ignored by Git. Check these paths before reporting that the signing key is unavailable. Never commit, upload, print, or copy them into build artifacts. A fresh clone does not contain ignored files; this active checkout does.

Build an update-compatible transfer APK with `python3 build.py --variant transferRelease`. This requires the existing key and stops if it is missing. `--test-signing` creates or reuses a separate QA-only signer under `signing/qa/`; APKs signed with it cannot update the installed production app.

The original keystore came from the private archive `Courier-Finance-Transfer-Signing-PRIVATE-2026-10-24.zip`; the key identity was verified against the established certificate fingerprint above.
