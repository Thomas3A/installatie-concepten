"""Winterstatistiek per stookseizoen (1 nov – 31 mrt) De Bilt 1951/52 – 2024/25, plus de referentiejaren.
Gebruik: python -I winter_stats.py <npz_1951_2025> <referentiejaren.json> <out_csv>
"""
import sys, json, csv
import numpy as np

z = np.load(sys.argv[1])
ref = json.load(open(sys.argv[2]))
out = sys.argv[3]

def is_leap(y): return y % 4 == 0 and (y % 100 != 0 or y % 400 == 0)
def nov1(y): return (304 + (1 if is_leap(y) else 0)) * 24      # uurindex 1 nov
def season_T(y):
    """T van 1 nov jaar y t/m 31 mrt jaar y+1."""
    a = z[str(y)][nov1(y):, 0]
    b = z[str(y + 1)][: (31 + 28 + 31) * 24 + (24 if is_leap(y + 1) else 0), 0]
    return np.concatenate([a, b])

def stats(T, label):
    d = T[: len(T) // 24 * 24].reshape(-1, 24).mean(axis=1)
    hell = float(np.sum(-d[d < 0]))
    def cold(h): return float(np.convolve(T, np.ones(h) / h, mode="valid").min()) if len(T) >= h else np.nan
    return dict(seizoen=label, Hellmann=round(hell), Tmin=round(float(T.min()), 1),
                uren_onder_min5=int((T < -5).sum()), uren_onder_min10=int((T < -10).sum()),
                koudste_24u=round(cold(24), 1), koudste_72u=round(cold(72), 1), koudste_168u=round(cold(168), 1),
                koudste_336u=round(cold(336), 1), koudste_720u=round(cold(720), 1))

rows = []
for y in range(1951, 2025):
    rows.append(stats(season_T(y), f"{y}/{str(y+1)[2:]}"))
# referentiejaren: nov-mrt uit hetzelfde fictieve jaar (dec -> jan loopt door via de cross-fade)
for name in ref["data"]:
    T = np.array(ref["data"][name]["T"]) / 10.0
    Tn = np.concatenate([T[304 * 24:], T[: 90 * 24]])
    rows.append(stats(Tn, f"ref_{name}"))

with open(out, "w", newline="") as f:
    w = csv.DictWriter(f, fieldnames=list(rows[0].keys()), delimiter=";")
    w.writeheader(); w.writerows(rows)

real = [r for r in rows if not r["seizoen"].startswith("ref")]
print("Rangorde op koudste 168 uur (strengste eerst):")
for i, r in enumerate(sorted(real, key=lambda r: r["koudste_168u"])[:20], 1):
    print(f"{i:2d}. {r['seizoen']}  168u {r['koudste_168u']:6.1f}  336u {r['koudste_336u']:6.1f}  720u {r['koudste_720u']:6.1f}  Hellmann {r['Hellmann']:4d}  Tmin {r['Tmin']:6.1f}  h<-10 {r['uren_onder_min10']}")
print("\nRangorde op Hellmann:")
for i, r in enumerate(sorted(real, key=lambda r: -r["Hellmann"])[:12], 1):
    print(f"{i:2d}. {r['seizoen']}  Hellmann {r['Hellmann']:4d}  168u {r['koudste_168u']:6.1f}  720u {r['koudste_720u']:6.1f}")
print("\nReferentiejaren:")
for r in rows:
    if r["seizoen"].startswith("ref"): print(r)
print("\nRang van 1996-2015-winters (basisperiode NEN 5060:2018) op 168u:")
order = sorted(real, key=lambda r: r["koudste_168u"])
for i, r in enumerate(order, 1):
    y = int(r["seizoen"][:4])
    if 1996 <= y <= 2014: print(f"  rang {i:2d}/{len(order)}: {r['seizoen']} 168u {r['koudste_168u']}")
