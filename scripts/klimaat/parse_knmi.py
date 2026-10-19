"""Parse KNMI uurgegevens (station 260 De Bilt) naar één compacte NumPy-array per jaar.

Gebruik: python -I parse_knmi.py <raw_dir> <out_npz>
Kolommen: STN,YYYYMMDD,HH,T,U,FH,Q  (T 0.1 °C, U %, FH 0.1 m/s, Q J/cm2 per uurvak)
HH is het uurvak-einde in UT (1..24). We zetten om naar MET (UT+1) zonder zomertijd.
"""
import sys, glob, os, datetime as dt
import numpy as np

raw_dir, out = sys.argv[1], sys.argv[2]
years = {}
for path in sorted(glob.glob(os.path.join(raw_dir, "debilt_*.txt"))):
    year = int(os.path.basename(path)[7:11])
    rows = []
    with open(path, encoding="latin-1") as f:
        for line in f:
            if line.startswith("#") or not line.strip():
                continue
            parts = [p.strip() for p in line.split(",")]
            stn, ymd, hh = parts[0], parts[1], int(parts[2])
            vals = [float(p) if p != "" else np.nan for p in parts[3:7]]
            rows.append((ymd, hh, *vals))
    # tijdstempel: uurvak eindigend op HH UT -> begin uurvak in MET = (HH-1) UT = HH MET.
    # We indexeren per uur: index 0 = 00:00-01:00 MET op 1 jan.
    n = 8784 if (year % 4 == 0 and (year % 100 != 0 or year % 400 == 0)) else 8760
    arr = np.full((n, 4), np.nan)
    base = dt.datetime(year, 1, 1)
    for ymd, hh, T, U, FH, Q in rows:
        t_ut_start = dt.datetime(int(ymd[:4]), int(ymd[4:6]), int(ymd[6:8])) + dt.timedelta(hours=hh - 1)
        t_met_start = t_ut_start + dt.timedelta(hours=1)
        idx = int((t_met_start - base).total_seconds() // 3600)
        if 0 <= idx < n:
            arr[idx] = (T / 10.0, U, FH / 10.0, Q * 10000.0 / 3600.0)  # Q -> W/m2 gemiddeld over uurvak
    # eerste uur van het jaar (00-01 MET) komt uit uurvak 24 UT van 31 dec vorig jaar -> ontbreekt; vul met uur 1
    if np.isnan(arr[0]).any():
        arr[0] = arr[1]
    miss = int(np.isnan(arr).sum())
    # kleine gaten lineair interpoleren (per kolom)
    for c in range(4):
        col = arr[:, c]
        bad = np.isnan(col)
        if bad.any() and (~bad).sum() > 2:
            col[bad] = np.interp(np.flatnonzero(bad), np.flatnonzero(~bad), col[~bad])
    years[year] = arr
    print(f"{year}: {n} uren, ontbrekend {miss}, Tmin {np.nanmin(arr[:,0]):.1f} Tmean {np.nanmean(arr[:,0]):.2f} Tmax {np.nanmax(arr[:,0]):.1f}")

np.savez_compressed(out, **{str(y): a for y, a in years.items()})
print("saved", out)
