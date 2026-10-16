import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from peakshaving_ref import *
pad = sys.argv[1]
kl = laad_referentiejaar(pad, "T5")

def toon(naam, gb, wp, buf, bat, el, hard=False, uren=48):
    Qi = ideale_vraag(gb, kl)
    r = simuleer(gb, wp, buf, bat, el, kl, hard=hard, Q_ideaal=Qi)
    R = r.reeksen; s = koudste_week(Qi, kl.T)
    print(f"\n=== {naam} | koudste week start uur {s} (dag {s//24}) | E_buf {r.kpi['E_buf_kWh']:.1f} kWh, P_lim {r.kpi['P_limiet']:.2f} kW")
    print(" t    Te   Tef   Ti  Tset  Qreq  Qcv  Qtap Qbufin Qbufuit tekort SoCbuf SoCbat Pel  Pbat  Pnet  COP")
    for t in range(s, s + uren):
        print(f"{t:5d} {R.T_e[t]:5.1f} {R.T_ef[t]:5.1f} {R.T_i[t]:5.2f} {R.T_set[t]:4.1f} {R.Q_req[t]:5.2f} {R.Q_wp_cv[t]:5.2f} {R.Q_wp_tap[t]:5.2f} "
              f"{R.Q_wp_buf[t]:6.2f} {R.Q_buf_uit[t]:6.2f} {R.Q_tekort[t]:6.2f} {R.SoC_buf[t]:6.2f} {R.SoC_bat[t]:6.2f} {R.P_el_wp[t]:5.2f} {R.P_bat[t]:5.2f} {R.P_net[t]:5.2f} {R.COP[t]:4.2f}")
    # energiebalans gebouw: som geleverd + winsten = som verlies + dC
    k = r.kpi
    print("KPI:", {x: (round(v, 2) if isinstance(v, float) else v) for x, v in k.items()})

gbw = woning_defaults(8.0)
toon("W woning 8kW WP 8.9 kW buffer 1 m3, 1x35A 40%", gbw, Warmtepomp(8.9), Buffer(1.0), Batterij(5.0), Elektra(0.230*35, 0.40), uren=36)
gbk = kantoor_defaults(100.0)
toon("K kantoor 100kW WP 126 kW buffer 10 m3 + 50 kWh, 3x80A 50%", gbk, Warmtepomp(126.0), Buffer(10.0), Batterij(50.0), Elektra(0.4*math.sqrt(3)*80, 0.5), uren=36)
