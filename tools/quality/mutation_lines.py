#!/usr/bin/env python3
"""Print all source lines in one top-level JavaScript function for Mutator --lines."""
from pathlib import Path
import re
import sys


def main() -> int:
    if len(sys.argv) != 3:
        raise SystemExit("usage: mutation_lines.py <source-file> <function-name>")
    path = Path(sys.argv[1])
    name = sys.argv[2]
    lines = path.read_text(encoding="utf-8").splitlines()
    pattern = re.compile(r"^\s*(?:export\s+)?function\s+" + re.escape(name) + r"\s*\(")
    starts = [index for index, line in enumerate(lines) if pattern.search(line)]
    if len(starts) != 1:
        raise SystemExit(f"expected one function {name}, found {len(starts)}")
    start = starts[0]
    depth = 0
    end = None
    for index in range(start, len(lines)):
        depth += lines[index].count("{") - lines[index].count("}")
        if index > start and depth == 0:
            end = index
            break
    if end is None or end - start > 80:
        raise SystemExit(f"could not safely resolve compact function body: {name}")
    print(",".join(str(number) for number in range(start + 1, end + 2)))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
