"""ISO 15927-4 typische-maand-selectie (Finkelstein-Schafer) voor De Bilt 1996-2015.
Gebruik: python -I tmy_iso15927.py <npz>
Parameters: daggemiddelde T, daggemiddelde RV, dagsom globale straling; secundair: windsnelheid.
"""
import sys
import numpy as np

npz = np.load(sys.argv[1])
YEARS = list(range(1996, 2016))
DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

def month_slices(year):
    leap = (year % 4 == 0 and (year % 100 != 0 or year % 400 == 0))
    days = DAYS.copy()
    if leap:
        days[1] = 29
    idx, out = 0, []
    for d in days:
        out.append((idx, idx + d * 24)); idx += d * 24
    return out

def daily(arr, a, b, col, agg):
    seg = arr[a:b, col].reshape(-1, 24)
    return seg.mean(axis=1) if agg == "mean" else seg.sum(axis=1)

def fs_stat(sample, population):
    """Finkelstein-Schafer: gemiddelde absolute afwijking tussen CDF van sample en populatie."""
    pop_sorted = np.sort(population)
    s_sorted = np.sort(sample)
    # CDF van populatie geëvalueerd in sample-punten
    F_pop = np.searchsorted(pop_sorted, s_sorted, side="right") / len(pop_sorted)
    F_s = (np.arange(1, len(s_sorted) + 1) - 0.5) / len(s_sorted)
    return float(np.mean(np.abs(F_pop - F_s)))

params = [(0, "mean"), (1, "mean"), (3, "sum")]  # T, U, Q
result = []
for m in range(12):
    # populatie: alle dagen van maand m over alle jaren
    pop = {p: np.concatenate([daily(npz[str(y)], *month_slices(y)[m], p[0], p[1]) for y in YEARS]) for p in params}
    wind_pop = np.concatenate([daily(npz[str(y)], *month_slices(y)[m], 2, "mean") for y in YEARS]).mean()
    ranks = {}
    for p in params:
        fs = {y: fs_stat(daily(npz[str(y)], *month_slices(y)[m], p[0], p[1]), pop[p]) for y in YEARS}
        order = sorted(YEARS, key=lambda y: fs[y])
        for r, y in enumerate(order):
            ranks[y] = ranks.get(y, 0) + r
    best3 = sorted(YEARS, key=lambda y: ranks[y])[:3]
    # secundair: kleinste afwijking windsnelheid t.o.v. langjarig gemiddelde
    wind_dev = {y: abs(daily(npz[str(y)], *month_slices(y)[m], 2, "mean").mean() - wind_pop) for y in best3}
    pick = min(best3, key=lambda y: wind_dev[y])
    Tm = {y: float(npz[str(y)][slice(*month_slices(y)[m]), 0].mean()) for y in best3}
    print(f"maand {m+1:2d}: top3 {best3} (Tgem {', '.join(f'{Tm[y]:.2f}' for y in best3)}) -> keuze {pick}")
    result.append(pick)
print("ISO 15927-4 selectie:", result)
