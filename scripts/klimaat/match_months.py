"""Zoek per kalendermaand welk jaar (1996-2015) het best past bij de gepubliceerde maandgemiddelden
van de NEN 5060:2018-referentiejaren (tabel 4, W/E-rapport 9604 voor RVO, 2018).
Gebruik: python -I match_months.py <npz>
"""
import sys
import numpy as np

npz = np.load(sys.argv[1])
DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

NEN2018 = {
    "energie": [2.64, 4.96, 5.90, 9.34, 14.72, 16.11, 18.04, 18.48, 15.64, 10.42, 7.98, 4.00],
    "T1":      [-1.24, 0.51, 6.57, 13.05, 14.93, 16.69, 22.31, 19.28, 15.68, 11.41, 5.83, -1.15],
    "T5":      [1.98, 0.51, 2.45, 9.38, 14.50, 16.13, 19.18, 20.56, 17.37, 14.21, 6.68, 2.24],
}

def month_slices(year):
    leap = (year % 4 == 0 and (year % 100 != 0 or year % 400 == 0))
    days = DAYS.copy()
    if leap:
        days[1] = 29
    idx = 0
    out = []
    for d in days:
        out.append((idx, idx + d * 24))
        idx += d * 24
    return out

means = {}  # (year, month) -> mean T
for year in range(1996, 2016):
    arr = npz[str(year)]
    for m, (a, b) in enumerate(month_slices(year)):
        means[(year, m)] = float(np.mean(arr[a:b, 0]))

for name, targets in NEN2018.items():
    print(f"\n== {name} ==")
    for m, tgt in enumerate(targets):
        cands = sorted(((abs(means[(y, m)] - tgt), y, means[(y, m)]) for y in range(1996, 2016)))
        best = cands[:3]
        flag = "" if best[0][0] < 0.08 else "  <-- geen scherpe match"
        print(f"maand {m+1:2d} doel {tgt:6.2f}: " + "  ".join(f"{y} ({v:.2f}, d={d:.2f})" for d, y, v in best) + flag)
