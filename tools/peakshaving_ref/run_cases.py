"""Draai referentiecases en schrijf referentiewaarden (JSON + Markdown-tabel) voor de Vitest-tests.
Gebruik: python -I run_cases.py <referentiejaren.json> <out_dir>
"""
import sys, os, json, time, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from peakshaving_ref import *

pad, out_dir = sys.argv[1], sys.argv[2]
os.makedirs(out_dir, exist_ok=True)
jaren = {n: laad_referentiejaar(pad, n) for n in ("energie", "T5", "T1", "winter1979", "winter1963")}

def rnd(d):
    return {k: (round(v, 3) if isinstance(v, float) else v) for k, v in d.items()}

cases = []
def case(naam, gb, wp, buf, bat, el, klim, hard=False, sizing=False):
    t0 = time.time()
    Qi = ideale_vraag(gb, klim)
    r = simuleer(gb, wp, buf, bat, el, klim, hard=hard, Q_ideaal=Qi)
    k = rnd(r.kpi)
    k["koudste_week_start"] = koudste_week(Qi, klim.T)
    if sizing:
        k["P_th_min"] = round(dimensioneer_wp(gb, wp, buf, klim, Q_ideaal=Qi), 3)
    cases.append(dict(naam=naam, jaar=klim.naam, hard=hard, gebouw=asdict(gb), wp=asdict(wp), buffer=asdict(buf),
                      batterij=asdict(bat), elektra=asdict(el), kpi=k))
    print(f"{naam:48s} {time.time()-t0:5.1f}s  Qmax {k['Q_ideaal_max']:.2f} Pel_max {k['P_el_wp_max']:.2f} Pnet_max {k['P_net_max']:.2f} "
          f"overschr {k['uren_overschrijding']}h/{k['max_overschrijding']:.2f}kW comfort {k['uren_comfort']}h minTi {k['min_T_i']:.2f} "
          f"SCOP {k['SCOP']:.2f} E_el {k['E_el_wp']:.0f} tap {k['uren_tap_tekort']}h" + (f" P_th_min {k['P_th_min']:.2f}" if sizing else ""))
    return r

P3x25 = 0.400 * math.sqrt(3) * 25
P3x80 = 0.400 * math.sqrt(3) * 80

# ---- Woning 8 kW ----
gbw = woning_defaults(8.0)
elw = Elektra(P_aansluiting=0.230*35, aandeel_wp=0.40)   # 1x35 A: 3,22 kW
for jaar in ("T5",):
    kl = jaren[jaar]
    case("W1 woning 8kW, WP 8kW, geen buffer/batterij", gbw, Warmtepomp(8.0), Buffer(0.0), Batterij(0.0), elw, kl, sizing=True)
    case("W2 woning 8kW, WP 8kW, buffer 1 m3", gbw, Warmtepomp(8.0), Buffer(1.0), Batterij(0.0), elw, kl, sizing=True)
    case("W3 woning 8kW, WP 8kW, buffer 1 m3 + batterij 10 kWh", gbw, Warmtepomp(8.0), Buffer(1.0), Batterij(10.0), elw, kl)
    case("W4 woning 8kW, WP 6kW, buffer 1 m3 + batterij 10 kWh (hard)", gbw, Warmtepomp(6.0), Buffer(1.0), Batterij(10.0), elw, kl, hard=True)
    case("W5 woning 8kW, WP 8kW, buffer 1 m3 'altijd' laden", gbw, Warmtepomp(8.0), Buffer(1.0, strategie="altijd"), Batterij(0.0), elw, kl)
    case("W6 woning 8kW, WP 8kW, buffer 2 m3, 1x35A", gbw, Warmtepomp(8.0), Buffer(2.0), Batterij(0.0), Elektra(0.230*35, 0.40), kl, sizing=True)
case("W7 woning 8kW, WP 8kW, geen buffer (T1)", gbw, Warmtepomp(8.0), Buffer(0.0), Batterij(0.0), elw, jaren["T1"], sizing=True)
case("W8 woning 8kW, WP 8kW, geen buffer (energie)", gbw, Warmtepomp(8.0), Buffer(0.0), Batterij(0.0), elw, jaren["energie"], sizing=True)
case("W9 woning 8kW, WP 8kW, geen buffer (winter1979)", gbw, Warmtepomp(8.0), Buffer(0.0), Batterij(0.0), elw, jaren["winter1979"], sizing=True)
case("W10 woning 8kW, WP 8kW, buffer 1 m3 (winter1979)", gbw, Warmtepomp(8.0), Buffer(1.0), Batterij(0.0), elw, jaren["winter1979"], sizing=True)
case("W11 woning 8kW, WP 8kW, geen buffer (winter1963)", gbw, Warmtepomp(8.0), Buffer(0.0), Batterij(0.0), elw, jaren["winter1963"], sizing=True)

# ---- Kantoor 100 kW ----
gbk = kantoor_defaults(100.0)
elk = Elektra(P_aansluiting=P3x80, aandeel_wp=0.50)   # 27,7 kW
kl = jaren["T5"]
case("K1 kantoor 100kW, WP 100kW, geen buffer/batterij", gbk, Warmtepomp(100.0), Buffer(0.0), Batterij(0.0), elk, kl, sizing=True)
case("K2 kantoor 100kW, WP 100kW, buffer 10 m3", gbk, Warmtepomp(100.0), Buffer(10.0), Batterij(0.0), elk, kl, sizing=True)
case("K3 kantoor 100kW, WP 70kW, buffer 10 m3 + batterij 50 kWh", gbk, Warmtepomp(70.0), Buffer(10.0), Batterij(50.0), elk, kl)
case("K4 kantoor 100kW, WP 70kW, buffer 10 m3 + batterij 50 kWh (hard)", gbk, Warmtepomp(70.0), Buffer(10.0), Batterij(50.0), elk, kl, hard=True)
case("K5 kantoor 100kW, WP 100kW, geen buffer (T1)", gbk, Warmtepomp(100.0), Buffer(0.0), Batterij(0.0), elk, jaren["T1"], sizing=True)
case("K6 kantoor 100kW, WP 100kW, geen buffer (winter1979)", gbk, Warmtepomp(100.0), Buffer(0.0), Batterij(0.0), elk, jaren["winter1979"], sizing=True)
case("K7 kantoor 100kW, WP 100kW, buffer 20 m3 (winter1963)", gbk, Warmtepomp(100.0), Buffer(20.0), Batterij(0.0), elk, jaren["winter1963"], sizing=True)

# ---- gevoeligheid: P_th_min en kleinste aansluiting als functie van buffer (woning, T5) ----
sweep = []
Qi = ideale_vraag(gbw, kl)
for V in (0, 0.25, 0.5, 1.0, 1.5, 2.0, 3.0):
    P_min = dimensioneer_wp(gbw, Warmtepomp(8.0), Buffer(V), kl, Q_ideaal=Qi)
    row = {"V_m3": V, "P_th_min": round(P_min, 3)}
    for E in (0, 5, 10):
        r = simuleer(gbw, Warmtepomp(P_min), Buffer(V), Batterij(E), elw, kl, hard=False, Q_ideaal=Qi).kpi
        lab, _ = kleinste_aansluiting(gbw, Warmtepomp(P_min), Buffer(V), Batterij(E), elw, kl, Q_ideaal=Qi)
        row[f"bat{E}"] = {"P_net_max": round(r["P_net_max"], 3), "uren_overschrijding": r["uren_overschrijding"], "kleinste_aansluiting": lab}
    sweep.append(row)
    print(row)

# ---- gevoeligheid kantoor (T5): P_th_min en netpiek als functie van buffer en batterij ----
sweep_k = []
Qi_k = ideale_vraag(gbk, kl)
for V in (0, 5, 10, 20, 40):
    P_min = dimensioneer_wp(gbk, Warmtepomp(100.0), Buffer(V), kl, Q_ideaal=Qi_k)
    row = {"V_m3": V, "P_th_min": round(P_min, 2)}
    for E in (0, 50, 100, 200):
        r = simuleer(gbk, Warmtepomp(P_min), Buffer(V), Batterij(E), elk, kl, hard=False, Q_ideaal=Qi_k).kpi
        row[f"bat{E}"] = {"P_net_max": round(r["P_net_max"], 2), "uren_overschrijding": r["uren_overschrijding"],
                          "max_overschrijding": round(r["max_overschrijding"], 2), "SCOP": round(r["SCOP"], 2)}
    sweep_k.append(row)
    print(row)

with open(os.path.join(out_dir, "referentiewaarden.json"), "w") as f:
    json.dump({"cases": cases, "sweep_woning_T5": sweep, "sweep_kantoor_T5": sweep_k}, f, indent=1, default=str)
print("klaar")
