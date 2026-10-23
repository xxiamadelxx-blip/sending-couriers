#!/usr/bin/env python3
"""Generate a small, entirely synthetic XLSX for the Android document picker."""

import argparse
from pathlib import Path
from xml.sax.saxutils import escape
from zipfile import ZipFile, ZIP_DEFLATED

SHEETS = ["Смены", "Дневные итоги", "Заказы RAW", "Прогнозы", "Точность", "Модели", "Настройки", "Финансовые правила"]
MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
PKG = "http://schemas.openxmlformats.org/package/2006/relationships"


def cell(address, value):
    if isinstance(value, str):
        return f'<c r="{address}" t="inlineStr"><is><t>{escape(value)}</t></is></c>'
    return f'<c r="{address}"><v>{value}</v></c>'


def sheet(rows):
    body = "".join(f'<row r="{number}">{"".join(cell(f"{column}{number}", value) for column, value in values.items())}</row>'
                   for number, values in rows.items())
    return f'<worksheet xmlns="{MAIN}"><sheetData>{body}</sheetData></worksheet>'


def create(path):
    path.parent.mkdir(parents=True, exist_ok=True)
    data = {
        "Смены": {2: {"A": "2026-10-20", "C": "09:00", "D": "23:00", "E": 9, "F": 14, "G": 2, "O": "Реконструкция по графику"}},
        "Дневные итоги": {2: {"A": "2026-10-20", "E": 2, "N": "Реконструкция по графику", "O": 9, "Q": 14}},
        "Заказы RAW": {
            2: {"A": "2026-10-20", "C": "12:00", "D": 1, "K": "Высокая", "L": "12:10", "M": "12:40"},
            3: {"A": "2026-10-20", "C": "13:00", "D": 2, "K": "Высокая"},
        },
    }
    workbook = f'<workbook xmlns="{MAIN}" xmlns:r="{REL}"><sheets>' + "".join(
        f'<sheet name="{escape(name)}" sheetId="{index}" r:id="rId{index}"/>'
        for index, name in enumerate(SHEETS, 1)) + '</sheets></workbook>'
    relations = f'<Relationships xmlns="{PKG}">' + "".join(
        f'<Relationship Id="rId{index}" Type="{REL}/worksheet" Target="worksheets/sheet{index}.xml"/>'
        for index in range(1, len(SHEETS) + 1)) + '</Relationships>'
    root_rels = f'<Relationships xmlns="{PKG}"><Relationship Id="rId1" Type="{REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>'
    types = '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/></Types>'
    with ZipFile(path, "w", ZIP_DEFLATED) as out:
        out.writestr('[Content_Types].xml', types)
        out.writestr('_rels/.rels', root_rels)
        out.writestr('xl/workbook.xml', workbook)
        out.writestr('xl/_rels/workbook.xml.rels', relations)
        for index, name in enumerate(SHEETS, 1):
            out.writestr(f'xl/worksheets/sheet{index}.xml', sheet(data.get(name, {})))
    print(path)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('output', type=Path)
    create(parser.parse_args().output)
