#!/usr/bin/env python3
"""Enforce a predeclared mutation score for the two critical finance functions."""
from pathlib import Path
import re
import sys

MIN_SCORE = 85.0
TARGETS = ("calculateScenario",)
ANSI = re.compile(r"\x1b\[[0-9;]*m")


def main() -> int:
    report = Path(sys.argv[1])
    if not report.is_file():
        raise SystemExit(f"Mutation report missing: {report}")
    lines = ANSI.sub("", report.read_text(encoding="utf-8", errors="replace")).splitlines()
    failures = []
    for name in TARGETS:
        row = next((line.split() for line in lines
                    if len(line.split()) >= 7
                    and line.split()[0] == name
                    and line.split()[1] == "web.core"), None)
        if row is None:
            failures.append(f"{name}: no mutation summary row")
            continue
        killed, survived, uncovered, sites = map(int, row[2:6])
        score_text = row[6].rstrip("%")
        if score_text == "n/a" or sites == 0:
            failures.append(f"{name}: no covered mutation sites")
            continue
        score = float(score_text)
        print(f"{name}: {killed}/{sites} killed, {survived} survived, {uncovered} uncovered, score {score:.1f}% (required {MIN_SCORE:.1f}%)")
        if score < MIN_SCORE:
            failures.append(f"{name}: {score:.1f}% is below {MIN_SCORE:.1f}%")
    if failures:
        raise SystemExit("Mutation threshold failed: " + "; ".join(failures))
    print("PASS: critical finance mutation thresholds met.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
