#!/usr/bin/env python3
"""Run both evidence captures independently, retaining either failure."""
import json
import os
from pathlib import Path
import subprocess
import sys

root = Path(__file__).resolve().parent.parent
out = root / 'qa-results'
out.mkdir(exist_ok=True)
results = []
cases = [('before', root / 'qa/Courier-Finance-1.7.11.apk'),
         ('after', Path(os.environ['RUNNER_TEMP']) / 'courier-ui-test-only.apk')]
for phase, apk in cases:
    result = subprocess.run([sys.executable, str(root/'qa/ui_audit_matrix.py'), '--apk', str(apk), '--phase', phase])
    results.append({'phase': phase, 'exitCode': result.returncode})
(out/'ui-pair.json').write_text(json.dumps({'captures': results, 'visualAuditStatus': 'NOT_VERIFIED'}, indent=2))
sys.exit(0 if all(r['exitCode'] == 0 for r in results) else 1)
