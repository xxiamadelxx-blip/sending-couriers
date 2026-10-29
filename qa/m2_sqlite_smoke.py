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
        version=con.execute("PRAGMA user_version").fetchone()[0]
        assert version==2, "SQLite v1 -> v2 migration must finish with user_version=2"
        views={row[0] for row in con.execute("SELECT name FROM sqlite_master WHERE type='view'")}
        assert "active_aggregate_order_counts" in views and len(views)>=7, views
        return {"slots":len(slots),"orders_raw":0,"orders_aggregated":total,"reward_kopecks":money["reward"],"audit_events":1,"sqlite_version":version}
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
                except (AssertionError, sqlite3.Error, TypeError, subprocess.CalledProcessError) as exc:
                    last=exc
                    time.sleep(1)
            else:
                raise AssertionError(f"M2 DB never passed after Android launch, pass {pass_no}: {last}")
        print("PASS: real Android M2 database migration pass", pass_no+1, result,flush=True)
    # Exercise a genuine Android SQLiteOpenHelper onUpgrade(1, 2):
    # turn the disposable test database back into the pre-v2 schema on disk,
    # restart the exact production Activity, and prove the v2 views reappear.
    adb("shell","am","force-stop",PKG)
    with tempfile.TemporaryDirectory() as directory:
        dbfile=copy_database(directory)
        with sqlite3.connect(str(dbfile)) as con:
            con.execute("PRAGMA wal_checkpoint(TRUNCATE)")
            con.execute("PRAGMA journal_mode=DELETE")
            names=[row[0] for row in con.execute("SELECT name FROM sqlite_master WHERE type='view'")]
            assert len(names)>=7, names
            for name in names:
                assert name.startswith("active_"), "Never drop an unrelated view"
                con.execute('DROP VIEW "'+name+'"')
            con.execute("PRAGMA user_version=1")
            con.commit()
            assert con.execute("PRAGMA integrity_check").fetchone()[0]=="ok"
        run_as("rm","-f","databases/courier_facts_v1.db-wal","databases/courier_facts_v1.db-shm")
        run_as("sh","-c","cat > databases/courier_facts_v1.db",input=dbfile.read_bytes())
    adb("shell","am","start","-n",PKG+"/.MainActivity")
    with tempfile.TemporaryDirectory() as directory:
        last=None
        for _ in range(25):
            try:
                result=verify(copy_database(directory),fixture)
                print("PASS: real Android onUpgrade v1→v2 preserved facts",result,flush=True)
                break
            except (AssertionError, sqlite3.Error, TypeError, subprocess.CalledProcessError) as exc:
                last=exc
                time.sleep(1)
        else:
            raise AssertionError(f"Android v1-to-v2 upgrade failed: {last}")
    adb("shell","am","force-stop",PKG)

if __name__=="__main__":
    main()
