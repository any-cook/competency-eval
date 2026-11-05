#!/usr/bin/env python3
"""力量評価表（Excel）から items-data.js を生成する。
使い方: python3 -I tools/build-items.py tools/competency-source.xlsx items-data.js
Excelの各部署シート（製造部/営業部/経理部）を読み、力量区分は結合セル想定で下方向に引き継ぐ。"""
import sys, json, openpyxl

DEPTS = ["製造部", "営業部", "経理部"]
src, out = sys.argv[1], sys.argv[2]
wb = openpyxl.load_workbook(src, data_only=True)
data = {}
for dept in DEPTS:
    ws = wb[dept]
    items, cat = [], None
    for row in ws.iter_rows(min_row=4, values_only=True):
        a, no, name, skill, crit = (list(row) + [None] * 5)[:5]
        if no is None:
            continue
        if a:
            cat = str(a).strip()
        items.append({"no": int(no), "cat": cat, "name": str(name).strip(),
                      "skill": str(skill or "").strip(), "criteria": str(crit or "").strip()})
    data[dept] = items
with open(out, "w", encoding="utf-8") as f:
    f.write("// 自動生成: tools/build-items.py（Excelの力量評価表より）。直接編集せず、Excelを直して再生成してください。\n")
    f.write("window.COMPETENCY_ITEMS = " + json.dumps(data, ensure_ascii=False, indent=1) + ";\n")
print({k: len(v) for k, v in data.items()})
