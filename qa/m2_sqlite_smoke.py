#!/usr/bin/env python3
"""M2 real Android SQLite parity, using an isolated DEBUG test APK only."""
import argparse
import hashlib
import html
import json
import pathlib
import sqlite3
import subprocess
import tempfile
import time

ROOT = pathlib.Path(__file__).resolve().parents[1]
PKG = "ru.courier.finance"

def adb(*args, input=None, check=True):
    return subprocess.run(["adb", *args], input=input, capture_output=True, check=check, timeout=40)

def run_as(*args, input=None):
    return adb("shell", "run-as", PKG, *args, input=input)

def copy_database(folder):
    target = pathlib.Path(folder)
    main = adb("exec-out", "run-as", PKG, "cat", "databases/courier_facts_v1.db").stdout
    if not main.startswith(b"SQLite format 3"):
        raise AssertionError("Android SQLite file missing or corrupt (no synthetic database)")
    (target / "facts.db").write_bytes(main)
    for suffix in ("-wal", "-shm"):
        result = adb("exec-out", "run-as", PKG, "cat", "databases/courier_facts_v1.db" + suffix, check=False)
        if result.returncode == 0 and result.stdout:
            (target / ("facts.db" + suffix)).write_bytes(result.stdout)
    return target / "facts.db"

def verify(db_path, fixture):
    con = sqlite3.connect(str(db_path))
    try:
        original, digest = con.execute("SELECT state_json,sha256 FROM legacy_state WHERE id=1").fetchone()
        assert original == fixture, "M2 shadow lost original byte-for-byte JSON backup"
        assert digest == hashlib.sha256(fixture.encode("utf-8")).hexdigest()
        slots = con.execute("SELECT id, date, order_count, accounted_hundredths FROM legacy_slot_facts ORDER BY id").fetchall()
        assert len(slots)==2 and slots[0][0]!=slots[1][0], slots
        assert sum(row[2] for row in slots)==40 and sum(row[3] for row in slots)==1400, slots
        assert con.execute("SELECT COUNT(*) FROM orders").fetchone()[0] == 0, "No made-up RAW"
        count, total = con.execute("SELECT COUNT(*), SUM(order_count) FROM aggregate_order_counts").fetchone()
        assert (count,total)==(2,40), (count,total)
        money = dict(con.execute("SELECT kind, SUM(amount_kopecks) FROM financial_ledger GROUP BY kind"))
        assert money["reward"]==150000 and money["tip"]==9000 and money["tax"]==8400, money
        assert con.execute("SELECT COUNT(*) FROM audit_events").fetchone()[0]==1
        assert con.execute("PRAGMA integrity_check").fetchone()[0]=="ok"
        return {"slots":len(slots),"orders_raw":0,"orders_aggregated":total,"reward_kopecks":money["reward"],"audit_events":1}
    finally:
        con.close()

def main():
    cli=argparse.ArgumentParser()
    cli.add_argument("--apk",required=True)
    args=cli.parse_args()
    fixture=(ROOT/"tests/fixtures/native-state-fixture.json").read_text(encoding="utf8").strip()
    data=json.loads(fixture)
    assert data["schemaVersion"]==6 and len(data["entries"])==2
    # Input is exactly the existing user's JSON wire format, not OCR fake responses.
    xml='<?xml version="1.0" encoding="utf-8" standalone="yes" ?>\n<map><string name="state">'+html.escape(fixture,quote=True)+'</string></map>'
    adb("install","-r",args.apk)
    adb("shell","am","force-stop",PKG)
    run_as("mkdir","-p","shared_prefs")
    run_as("sh","-c","cat > shared_prefs/courier_finance.xml",input=xml.encode("utf8"))
    # XML is an isolated QA fixture in the emulator. No owner data is touched.
    for pass_no in range(2):
        adb("shell","am","force-stop",PKG)
        adb("shell","am","start","-n",PKG+"/.MainActivity")
        with tempfile.TemporaryDirectory() as directory:
            last=None
            for _ in range(25):
                try:
                    path=copy_database(directory)
                    result=verify(path,fixture)
                    break
                except (AssertionError, sqlite3.Error, TypeError) as exc:
                    last=exc
                    time.sleep(1)
            else:
                raise AssertionError(f"M2 DB never passed after Android launch, pass {pass_no}: {last}")
        print("PASS: real Android M2 database migration pass", pass_no+1, result,flush=True)
    adb("shell","am","force-stop",PKG)

if __name__=="__main__":
    main()
