"""Bouw referentiejaren (energie, T1, T5) uit KNMI-uurdata De Bilt en exporteer JSON/CSV.

Gebruik: python -I build_reference_years.py <npz> <out_dir>

Methode (reconstructie van NEN 5060:2018, zie docs):
- Per kalendermaand één werkelijke maand uit 1996-2015 (bronjaar per maand hieronder).
- Schrikkeldag (29 feb) wordt weggelaten -> 365 dagen, 8760 uur.
- Maandovergangen: cross-fade over 16 uur (laatste 8 uur maand A, eerste 8 uur maand B) met de
  werkelijke vervolg-/voorgaande uren van de bronjaren, ook over de jaargrens dec->jan.
- Tijdas: MET (UTC+1), geen zomertijd. Het jaar begint op een maandag (conform NEN 5060).
"""
import sys, os, json, csv
import numpy as np

npz = np.load(sys.argv[1])
out_dir = sys.argv[2]
os.makedirs(out_dir, exist_ok=True)

DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
MAANDEN = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"]
VARS = ["T", "U", "FH", "Q"]

T1_SEL = [1997, 1996, 2005, 2007, 1998, 2006, 2006, 2003, 2011, 2011, 2010, 2010]
SELECTIE = {
    # reconstructie NEN 5060:2018 (maandselectie op gepubliceerde maandgemiddelden, basisperiode 1996-2015)
    "energie": [2001, 2004, 2004, 2002, 2000, 2011, 2008, 2001, 2011, 2010, 2003, 2003],
    "T5":      [2013, 1996, 2013, 1996, 2006, 2011, 2013, 1997, 1999, 2001, 1999, 2009],
    "T1":      T1_SEL,
    # stresstestjaren: T1 met het complete werkelijke stookseizoen nov-mrt van een strenge winter (KNMI 1951-2025)
    "winter1979": [1979, 1979, 1979] + T1_SEL[3:10] + [1978, 1978],   # strenge winter 1978/79
    "winter1963": [1963, 1963, 1963] + T1_SEL[3:10] + [1962, 1962],   # extreme winter 1962/63
}
NEN_TABEL = {
    "energie": [2.64, 4.96, 5.90, 9.34, 14.72, 16.11, 18.04, 18.48, 15.64, 10.42, 7.98, 4.00],
    "T1":      [-1.24, 0.51, 6.57, 13.05, 14.93, 16.69, 22.31, 19.28, 15.68, 11.41, 5.83, -1.15],
    "T5":      [1.98, 0.51, 2.45, 9.38, 14.50, 16.13, 19.18, 20.56, 17.37, 14.21, 6.68, 2.24],
    "winter1979": None, "winter1963": None,
}
OMSCHRIJVING = {
    "energie": "Energiejaar, langjarig gemiddeld (≈ NEN 5060:2018 energie)",
    "T5": "Ontwerpjaar T5, 5 % (≈ NEN 5060:2018 ref T5); winter gemiddeld",
    "T1": "Ontwerpjaar T1, 1 % (≈ NEN 5060:2018 ref T1); winter streng (Dec 2010, Jan 1997, Feb 1996)",
    "winter1979": "Stresstest strenge winter 1978/79 (koudste week −10 °C; ≈ 1× per 25 jaar in 1951–2025); overige maanden T1",
    "winter1963": "Stresstest extreme winter 1962/63 (twee maanden vorst, Hellmann 346; ≈ 1× per eeuw); overige maanden T1",
}
REAL_START, REAL_END = 1951, 2025

def is_leap(y):
    return y % 4 == 0 and (y % 100 != 0 or y % 400 == 0)

def month_bounds(year):
    days = DAYS.copy()
    if is_leap(year):
        days[1] = 29
    idx, out = 0, []
    for d in days:
        out.append((idx, idx + d * 24)); idx += d * 24
    return out

def month_block(year, m):
    """Uurdata (n,4) van maand m (0-based) van bronjaar, zonder 29 feb."""
    a, b = month_bounds(year)[m]
    blk = npz[str(year)][a:b].copy()
    if m == 1 and is_leap(year):
        blk = blk[:28 * 24]
    return blk

def hours_after(year, m, n):
    """De n werkelijke uren die in het bronjaar op maand m volgen (over jaargrens: volgend jaar)."""
    a, b = month_bounds(year)[m]  # b = eerste uur van de volgende maand (bij schrikkeljaar: 1 maart, 29 feb is weggelaten)
    arr = npz[str(year)]
    if b + n <= len(arr):
        return arr[b:b + n]
    nxt = npz.get(str(year + 1))
    if nxt is None:
        return np.repeat(arr[-1:], n, axis=0)
    return nxt[:n]

def hours_before(year, m, n):
    a, b = month_bounds(year)[m]
    arr = npz[str(year)]
    if a - n >= 0:
        return arr[a - n:a]
    prv = npz.get(str(year - 1))
    if prv is None:
        return np.repeat(arr[:1], n, axis=0)
    return prv[-n:]

def build_year(sel):
    blocks = [month_block(sel[m], m) for m in range(12)]
    year = np.concatenate(blocks)  # (8760,4)
    assert year.shape[0] == 8760, year.shape
    # cross-fade per overgang m -> m+1 (incl. dec -> jan)
    starts = np.cumsum([0] + [len(b) for b in blocks])  # startindex per maand
    N = 8
    for m in range(12):
        m2 = (m + 1) % 12
        end_a = starts[m + 1] if m < 11 else 8760       # eerste uur na maand A
        # vervanging: laatste N uren van A (indices end_a-N .. end_a-1) en eerste N uren van B
        contA = hours_after(sel[m], m, N)      # hoe A werkelijk doorliep
        preB = hours_before(sel[m2], m2, N)     # hoe B werkelijk begon
        A_tail = year[end_a - N:end_a].copy()
        B_head = blocks[m2][:N].copy() if m < 11 else year[:N].copy()
        for k in range(2 * N):
            w = (k + 0.5) / (2 * N)             # 0 -> 1 over 16 uur
            if k < N:
                a_val = A_tail[k]; b_val = preB[k]           # B's werkelijke voorgeschiedenis
                idx = end_a - N + k
            else:
                a_val = contA[k - N]; b_val = B_head[k - N]  # A's werkelijke vervolg
                idx = (end_a + k - N) % 8760
            year[idx] = (1 - w) * a_val + w * b_val
    return year

def stats(T):
    T = np.asarray(T)
    d = T.reshape(365, 24).mean(axis=1)
    def coldest(hours):  # cyclisch: een venster mag over de jaargrens dec->jan lopen
        Tc = np.concatenate([T, T[:hours - 1]])
        c = np.convolve(Tc, np.ones(hours) / hours, mode="valid")
        i = int(np.argmin(c)); return float(c[i]), i
    gd18 = float(np.sum(np.clip(18.0 - d, 0, None)))
    gd15 = float(np.sum(np.clip(15.5 - d, 0, None)))
    return {
        "Tgem": round(float(T.mean()), 2), "Tmin": round(float(T.min()), 1),
        "uren_onder_0": int((T < 0).sum()), "uren_onder_min5": int((T < -5).sum()), "uren_onder_min10": int((T < -10).sum()),
        "koudste_24u": round(coldest(24)[0], 2), "koudste_72u": round(coldest(72)[0], 2), "koudste_168u": round(coldest(168)[0], 2),
        "koudste_week_start_uur": coldest(168)[1],
        "graaddagen_18": round(gd18), "graaddagen_15_5": round(gd15),
    }

meta = {
    "bron": "KNMI uurgegevens station 260 De Bilt (open data), samengesteld per maand",
    "methode": "Reconstructie NEN 5060:2018-referentiejaren: per kalendermaand de werkelijke maand uit 1996-2015 waarvan het maandgemiddelde overeenkomt met de gepubliceerde maandgemiddelden (W/E-rapport 9604 voor RVO, tabel 4). Geen officiële NEN-data.",
    "tijdas": "MET (UTC+1), geen zomertijd; uurindex 0 = 1 jan 00:00-01:00; jaar begint op maandag; 365 dagen",
    "variabelen": {"T": "temperatuur 1,5 m [0,1 °C]", "U": "relatieve vochtigheid [%]", "FH": "uurgemiddelde windsnelheid [0,1 m/s]", "Q": "globale straling, uurgemiddelde [W/m2]"},
    "startWeekdag": 1,
    "jaren": {},
}
export = {"meta": meta, "data": {}}
for name, sel in SELECTIE.items():
    yr = build_year(sel)
    T = yr[:, 0]
    mm = [round(float(T[s:e].mean()), 2) for s, e in zip(np.cumsum([0] + [d * 24 for d in DAYS])[:-1], np.cumsum([d * 24 for d in DAYS]))]
    meta["jaren"][name] = {
        "omschrijving": OMSCHRIJVING[name],
        "bronjaar_per_maand": sel,
        "maandgemiddelde_T": mm,
        "maandgemiddelde_T_NEN5060_2018": NEN_TABEL[name],
        "statistiek": stats(T),
    }
    export["data"][name] = {
        "T": [int(round(v * 10)) for v in T],
        "U": [int(round(v)) for v in yr[:, 1]],
        "FH": [int(round(v * 10)) for v in yr[:, 2]],
        "Q": [int(round(v)) for v in yr[:, 3]],
    }
    # CSV
    with open(os.path.join(out_dir, f"referentiejaar_{name}.csv"), "w", newline="") as f:
        w = csv.writer(f, delimiter=";")
        w.writerow(["uur_index", "maand", "dag", "uur_MET", "weekdag", "T_C", "RV_pct", "wind_ms", "Qglob_Wm2", "bronjaar"])
        h = 0
        for m in range(12):
            for d in range(DAYS[m]):
                for u in range(24):
                    wd = ((h // 24) % 7) + 1  # 1 = maandag
                    w.writerow([h, m + 1, d + 1, u, wd, f"{T[h]:.1f}", int(round(yr[h,1])), f"{yr[h,2]:.1f}", int(round(yr[h,3])), sel[m]])
                    h += 1
    print(name, "maandgem:", mm)
    if NEN_TABEL[name]: print("   NEN   :", NEN_TABEL[name])
    print("   stats :", meta["jaren"][name]["statistiek"])

with open(os.path.join(out_dir, "referentiejaren.json"), "w") as f:
    json.dump(export, f, separators=(",", ":"))

# werkelijke jaren (alleen T, 0,1 °C, 8760 uur; 29 feb weggelaten), met weekdag van 1 jan
import datetime as dt
real = {"meta": {"bron": "KNMI uurgegevens station 260 De Bilt, werkelijke jaren, alleen T [0,1 °C], 29 feb weggelaten, tijdas MET", "aanbevolen_stresstest": [1956, 1963, 1979, 1985, 1986, 1987, 1996, 1997, 2010, 2012], "startWeekdag": {}}, "T": {}}
for y in range(REAL_START, REAL_END + 1):
    arr = npz[str(y)][:, 0]
    if is_leap(y):
        a, b = month_bounds(y)[1]
        arr = np.concatenate([arr[:b - 24], arr[b:]])
    assert len(arr) == 8760
    real["T"][str(y)] = [int(round(v * 10)) for v in arr]
    real["meta"]["startWeekdag"][str(y)] = dt.date(y, 1, 1).isoweekday()
    st = stats(arr)
    real["meta"].setdefault("statistiek", {})[str(y)] = st
with open(os.path.join(out_dir, f"knmi-debilt-{REAL_START}-{REAL_END}.json"), "w") as f:
    json.dump(real, f, separators=(",", ":"))

# overzichtstabel werkelijke jaren
with open(os.path.join(out_dir, "statistiek_jaren.csv"), "w", newline="") as f:
    w = csv.writer(f, delimiter=";")
    keys = list(next(iter(real["meta"]["statistiek"].values())).keys())
    w.writerow(["jaar"] + keys)
    for name in SELECTIE:
        w.writerow([f"ref_{name}"] + [meta["jaren"][name]["statistiek"][k] for k in keys])
    for y in range(REAL_START, REAL_END + 1):
        w.writerow([y] + [real["meta"]["statistiek"][str(y)][k] for k in keys])
print("klaar:", os.listdir(out_dir))
