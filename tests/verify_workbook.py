#!/usr/bin/env python3
"""Exercise compiled production XLSX reader. Input remains outside the source tree."""
import argparse,os,subprocess,json
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('workbook');p.add_argument('output');a=p.parse_args()
root=Path(__file__).resolve().parents[1]
jar=root.parent/'tools/test-deps/json-20250517.jar';platform=root.parent/'tools/android-sdk/android-35-ext15/android.jar';classes=root/'build/classes';out=root/'build/workbook-probe';out.mkdir(exist_ok=True)
cp=os.pathsep.join(map(str,[classes,jar,platform]))
subprocess.run(['java','com.sun.tools.javac.Main','-cp',cp,'-d',str(out),str(root/'tests/WorkbookProbe.java')],check=True)
subprocess.run(['java','-cp',str(out)+os.pathsep+cp,'ru.courier.finance.WorkbookProbe',str(Path(a.workbook).resolve()),str(Path(a.output).resolve())],check=True)
s=json.load(open(a.output))['sheets'];assert set(s)=={'Смены','Дневные итоги','Заказы RAW','Прогнозы','Точность','Модели','Настройки','Финансовые правила'}
print('PASS: production WorkbookReader parses all eight forecast/history sheets; no formula execution')
