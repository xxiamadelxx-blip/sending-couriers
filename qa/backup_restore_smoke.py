#!/usr/bin/env python3
"""Exercise Android Auto Backup with a synthetic finance and forecast database."""

import hashlib
import json
import time

from emulator_smoke import APK, OUT, PACKAGE, ACTIVITY, adb, dump, screenshot, wait_node
from xlsx_import_smoke import exported_state


TRANSPORT = "com.android.localtransport/.LocalTransport"


def durable_data(state):
    forecast = state["forecast"]
    return {
        "schemaVersion": state["schemaVersion"],
        "entries": state["entries"],
        "settings": state["settings"],
        "days": forecast["days"],
        "profiles": forecast["profiles"],
        "plans": forecast["plans"],
        "typicalPlan": forecast["typicalPlan"],
        "imports": forecast["imports"],
    }


def main():
    before = durable_data(exported_state())
    assert len(before["entries"]) == 3, "Fixture lost its three financial slots"
    assert before["days"]["2026-10-20"]["orders"] == 2, "XLSX facts missing before backup"
    assert before["settings"]["theme"] == "light", "Theme persistence fixture is missing"
    transports = adb("shell", "bmgr", "list", "transports")
    assert TRANSPORT in transports, f"Local backup transport unavailable: {transports}"
    adb("shell", "bmgr", "enable", "true")
    selected = adb("shell", "bmgr", "transport", TRANSPORT)
    assert "Selected transport" in selected, f"Cannot select local transport: {selected}"
    adb("shell", "settings", "put", "secure", "backup_local_transport_parameters", "is_encrypted=true")
    backup = adb("shell", "bmgr", "backupnow", PACKAGE)
    assert f"Package {PACKAGE} with result: Success" in backup, f"Backup failed: {backup}"
    assert "Backup finished with result: Success" in backup, f"Backup pass failed: {backup}"

    removed = adb("shell", "pm", "uninstall", "--user", "0", PACKAGE)
    assert "Success" in removed, f"Uninstall failed: {removed}"
    installed = adb("shell", "pm", "list", "packages", "--user", "0", PACKAGE)
    assert f"package:{PACKAGE}" not in installed, "Package remains installed for user 0"
    adb("install-multiple", "-t", "--user", "0", str(APK))
    time.sleep(5)
    adb("shell", "am", "start", "-n", ACTIVITY)
    wait_node("Главная", 45)
    after = durable_data(exported_state())
    assert after == before, "Auto Backup restore changed or lost durable finance/forecast facts"
    screenshot("backup-restored-390-light")
    payload = json.dumps(before, ensure_ascii=False, sort_keys=True).encode()
    (OUT / "backup-restore-result.json").write_text(json.dumps({
        "result": "PASS", "transport": TRANSPORT, "restore": "automatic after reinstall",
        "entries": len(before["entries"]), "importedOrders": before["days"]["2026-10-20"]["orders"],
        "theme": before["settings"]["theme"], "durableStateSHA256": hashlib.sha256(payload).hexdigest(),
    }, ensure_ascii=False, indent=2))
    print("Auto Backup PASS: finance and forecast facts survived uninstall/reinstall", flush=True)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        screenshot("backup-restore-failure")
        dump("backup-restore-failure")
        (OUT / "backup-restore-result.json").write_text(json.dumps({"result": "FAIL", "error": str(error)}, ensure_ascii=False))
        raise
