"""
Referentie-implementatie peakshaving-model (Python).
Doel: de TypeScript-implementatie in src/concepts/peakshaving/model/ moet deze uitkomsten
reproduceren (zie docs/SPEC-peakshaving.md §9 en tests/). Dit bestand is de bron van waarheid
voor de rekenregels; variabelenamen zijn 1-op-1 overgenomen in de spec.

Eenheden intern: kW, kWh, K/°C, h. Tijdstap 1 uur. Tijdas MET (UTC+1).
Alleen de standaardbibliotheek + numpy (voor laden JSON-data) — het model zelf is puur Python,
zodat elke regel direct naar TypeScript te vertalen is.
"""
from __future__ import annotations
from dataclasses import dataclass, field, asdict
import json, math

# ----------------------------------------------------------------------------
# 1. Data: referentiejaar
# ----------------------------------------------------------------------------

@dataclass
class Klimaatjaar:
    naam: str
    T: list[float]          # 8760 uurwaarden [°C]
    start_weekdag: int      # 1 = maandag ... 7 = zondag (ISO)

def laad_referentiejaar(pad: str, naam: str) -> Klimaatjaar:
    with open(pad) as f:
        d = json.load(f)
    return Klimaatjaar(naam, [v / 10.0 for v in d["data"][naam]["T"]], d["meta"]["startWeekdag"])

def laad_werkelijk_jaar(pad: str, jaar: int) -> Klimaatjaar:
    with open(pad) as f:
        d = json.load(f)
    return Klimaatjaar(str(jaar), [v / 10.0 for v in d["T"][str(jaar)]], d["meta"]["startWeekdag"][str(jaar)])

# ----------------------------------------------------------------------------
# 2. Parameters (defaults = UI-defaults)
# ----------------------------------------------------------------------------

AANSLUITINGEN = [  # (label, fasen, A, P_kW) ; P = 0,230*I (1f) of 0,400*sqrt(3)*I (3f), cos phi = 1
    ("1×25 A", 1, 25, 0.230 * 25), ("1×35 A", 1, 35, 0.230 * 35), ("1×40 A", 1, 40, 0.230 * 40),
    ("3×25 A", 3, 25, 0.400 * math.sqrt(3) * 25), ("3×35 A", 3, 35, 0.400 * math.sqrt(3) * 35),
    ("3×40 A", 3, 40, 0.400 * math.sqrt(3) * 40), ("3×50 A", 3, 50, 0.400 * math.sqrt(3) * 50),
    ("3×63 A", 3, 63, 0.400 * math.sqrt(3) * 63), ("3×80 A", 3, 80, 0.400 * math.sqrt(3) * 80),
]

STOOKLIJN_PRESETS = {  # (T_aanvoer bij T_e,ontwerp, T_retour bij ontwerp, T_aanvoer_min bij T_e >= 15 °C)
    "LT": (35.0, 28.0, 25.0),
    "MT": (45.0, 35.0, 30.0),
    "HT": (55.0, 45.0, 35.0),
}

# Capaciteitsfactor lucht/water-WP t.o.v. A7/W35 (incl. ontdooien), lineair geïnterpoleerd, geklemd
CAP_FACTOR = [(-20, 0.55), (-15, 0.62), (-10, 0.70), (-7, 0.76), (2, 0.86), (7, 1.00), (15, 1.10), (25, 1.15)]

# Tapwaterprofiel woning (fractie van dagverbruik per uur MET), wordt genormaliseerd
TAP_PROFIEL = [0.005, 0.003, 0.002, 0.002, 0.005, 0.02, 0.07, 0.12, 0.10, 0.05, 0.04, 0.035,
               0.035, 0.03, 0.03, 0.03, 0.04, 0.06, 0.09, 0.09, 0.06, 0.04, 0.025, 0.012]

@dataclass
class Gebouw:
    functie: str = "woning"          # 'woning' | 'kantoor'
    P_ontwerp: float = 8.0           # kW, transmissie+ventilatie bij T_e,ontwerp en T_i,ontwerp (excl. opwarmtoeslag)
    T_e_ontwerp: float = -10.0       # °C (NEN-EN 12831, De Bilt)
    T_i_ontwerp: float = 20.0        # °C (woning 20, kantoor 21)
    T_set_gebruik: float = 20.0      # °C setpoint tijdens gebruik
    T_set_nacht: float = 20.0        # °C setpoint buiten gebruik (woning default geen verlaging; kantoor 19)
    stookgrens: float = 15.0         # °C: interne winsten tijdens gebruik = UA*(T_set_gebruik - stookgrens); woning 15, kantoor 12
    tau_gebouw_h: float = 40.0       # h, C = tau*UA (licht 20 / gemiddeld 40 / zwaar 80); kantoor default 20
    tau_gevel_h: float = 2.0         # h, 1e-orde filter op T_e (traagheid schil); 0 = uit
    f_boost: float = 0.3             # max extra vermogen voor opwarmen als fractie van P_ontwerp
    opstook_h: int = 0               # kantoor: uren vóór gebruik waarin naar T_set_gebruik wordt gestookt (default 4)
    gebruik_start: int = 7           # kantoor gebruiksuren [start, eind) op werkdagen
    gebruik_eind: int = 18
    tapwater_aan: bool = True        # woning: ja
    E_tap_dag: float = 10.0          # kWh/dag warm tapwater (nuttig)
    V_boiler_l: float = 200.0        # boilervat
    T_tap: float = 55.0              # °C boilersetpoint

    @property
    def UA(self) -> float:           # kW/K
        return self.P_ontwerp / (self.T_i_ontwerp - self.T_e_ontwerp)

    @property
    def C(self) -> float:            # kWh/K
        return self.tau_gebouw_h * self.UA

    @property
    def E_boiler(self) -> float:     # kWh nuttig (10 °C koud water, 85 % benutbaar)
        return self.V_boiler_l / 1000 * 1.163 * (self.T_tap - 10.0) * 0.85 if self.tapwater_aan else 0.0

def kantoor_defaults(P_ontwerp: float) -> Gebouw:
    return Gebouw(functie="kantoor", P_ontwerp=P_ontwerp, T_i_ontwerp=21, T_set_gebruik=21, T_set_nacht=19,
                  stookgrens=12, tau_gebouw_h=20, opstook_h=4, tapwater_aan=False, E_tap_dag=0, V_boiler_l=0)

def woning_defaults(P_ontwerp: float) -> Gebouw:
    return Gebouw(functie="woning", P_ontwerp=P_ontwerp)

@dataclass
class Warmtepomp:
    P_th_nom: float = 8.0            # kW thermisch bij A7/W35
    eta_carnot: float = 0.45         # Carnot-rendement (0,35-0,55)
    stooklijn: str = "MT"            # preset
    T_wp_max: float = 60.0           # °C max aanvoer WP (55 R32/R410A, 65-75 R290/CO2)
    P_bijstook: float = 0.0          # kW elektrisch bijstookelement (COP 1), 0 = geen

    @property
    def T_sup_ontwerp(self): return STOOKLIJN_PRESETS[self.stooklijn][0]
    @property
    def T_ret_ontwerp(self): return STOOKLIJN_PRESETS[self.stooklijn][1]
    @property
    def T_sup_min(self): return STOOKLIJN_PRESETS[self.stooklijn][2]
    @property
    def T_buf_max(self): return self.T_wp_max - 2.0   # 2 K aanlegverschil

@dataclass
class Buffer:
    V_m3: float = 0.0
    f_strat: float = 0.90            # benutbaar deel (menging/stratificatie)
    k_verlies: float = 1.5           # W/K per m^(2) mantel-equivalent: UA = k * V^(2/3)
    T_omgeving: float = 15.0
    strategie: str = "voorspellend"  # 'voorspellend' (24 u vooruit) | 'altijd'
    horizon_h: int = 24

@dataclass
class Batterij:
    E_kWh: float = 0.0               # bruto capaciteit
    P_kW: float | None = None        # laad/ontlaadvermogen; None = 0,5 C
    DoD: float = 0.90
    eta_rt: float = 0.90             # roundtrip

    @property
    def P(self) -> float: return self.E_kWh / 2 if self.P_kW is None else self.P_kW
    @property
    def E_nuttig(self) -> float: return self.E_kWh * self.DoD
    @property
    def eta(self) -> float: return math.sqrt(self.eta_rt)   # per richting

@dataclass
class Elektra:
    P_aansluiting: float = 0.400 * math.sqrt(3) * 25   # kW (3×25 A)
    aandeel_wp: float = 0.40         # deel van aansluiting voor WP(+batterij)
    @property
    def P_limiet(self) -> float: return self.P_aansluiting * self.aandeel_wp

# ----------------------------------------------------------------------------
# 3. Componentfuncties
# ----------------------------------------------------------------------------

def interp(table, x):
    if x <= table[0][0]: return table[0][1]
    if x >= table[-1][0]: return table[-1][1]
    for (x0, y0), (x1, y1) in zip(table, table[1:]):
        if x <= x1:
            return y0 + (y1 - y0) * (x - x0) / (x1 - x0)
    return table[-1][1]

def cap_factor(T_e: float) -> float:
    return interp(CAP_FACTOR, T_e)

def f_ontdooi(T_e: float) -> float:
    """Extra elektriciteit door ontdooien: factor op COP."""
    return interp([(-7, 1.0), (-5, 0.9), (5, 0.9), (7, 1.0)], T_e)

def cop(wp: Warmtepomp, T_e: float, T_sup: float) -> float:
    dT = max(T_sup - T_e, 8.0)
    c = wp.eta_carnot * (T_sup + 273.15) / dT * f_ontdooi(T_e)
    return min(max(c, 1.2), 7.0)

def stooklijn(wp: Warmtepomp, gb: Gebouw, T_e: float) -> float:
    """Weersafhankelijke aanvoertemperatuur, lineair tussen T_e,ontwerp en 15 °C."""
    if T_e <= gb.T_e_ontwerp: return wp.T_sup_ontwerp
    if T_e >= 15.0: return wp.T_sup_min
    return wp.T_sup_ontwerp + (wp.T_sup_min - wp.T_sup_ontwerp) * (T_e - gb.T_e_ontwerp) / (15.0 - gb.T_e_ontwerp)

def buffer_dT(wp: Warmtepomp) -> float:
    return max(wp.T_buf_max - wp.T_ret_ontwerp, 0.0)

def buffer_E(buf: Buffer, wp: Warmtepomp) -> float:
    """Nuttige opslag [kWh] = V * 1,163 kWh/(m3·K) * dT_nuttig * f_strat."""
    return buf.V_m3 * 1.163 * buffer_dT(wp) * buf.f_strat

def buffer_UA(buf: Buffer) -> float:  # kW/K
    return buf.k_verlies * buf.V_m3 ** (2 / 3) / 1000 if buf.V_m3 > 0 else 0.0

# ----------------------------------------------------------------------------
# 4. Gebouwschema (setpoint, winsten, tapwater)
# ----------------------------------------------------------------------------

def weekdag(klim: Klimaatjaar, t: int) -> int:
    return ((klim.start_weekdag - 1 + t // 24) % 7) + 1   # 1 = ma

def in_gebruik(gb: Gebouw, klim: Klimaatjaar, t: int) -> bool:
    if gb.functie == "woning": return True
    u = t % 24
    return weekdag(klim, t) <= 5 and gb.gebruik_start <= u < gb.gebruik_eind

def setpoint(gb: Gebouw, klim: Klimaatjaar, t: int) -> float:
    if in_gebruik(gb, klim, t): return gb.T_set_gebruik
    if gb.functie == "kantoor" and gb.opstook_h > 0:
        for k in range(1, gb.opstook_h + 1):           # komt gebruik eraan binnen opstook_h uur?
            if in_gebruik(gb, klim, (t + k) % 8760):
                return gb.T_set_gebruik
    return gb.T_set_nacht

def winsten(gb: Gebouw, klim: Klimaatjaar, t: int) -> float:  # kW
    if gb.functie == "woning": return gb.UA * (gb.T_set_gebruik - gb.stookgrens)
    return gb.UA * (gb.T_set_gebruik - gb.stookgrens) if in_gebruik(gb, klim, t) else 0.0

_tap_sum = sum(TAP_PROFIEL)
def tapvraag(gb: Gebouw, t: int) -> float:  # kWh in dit uur
    if not gb.tapwater_aan: return 0.0
    return gb.E_tap_dag * TAP_PROFIEL[t % 24] / _tap_sum

# ----------------------------------------------------------------------------
# 5. Simulatie
# ----------------------------------------------------------------------------

@dataclass
class Reeksen:
    T_e: list = field(default_factory=list); T_ef: list = field(default_factory=list)
    T_i: list = field(default_factory=list); T_set: list = field(default_factory=list)
    Q_req: list = field(default_factory=list)      # gevraagd ruimteverwarming (incl. opwarmen) [kW]
    Q_wp_cv: list = field(default_factory=list); Q_wp_tap: list = field(default_factory=list); Q_wp_buf: list = field(default_factory=list)
    Q_buf_uit: list = field(default_factory=list); Q_bijstook: list = field(default_factory=list); Q_tekort: list = field(default_factory=list)
    SoC_buf: list = field(default_factory=list); SoC_bat: list = field(default_factory=list); SoC_boiler: list = field(default_factory=list)
    P_el_wp: list = field(default_factory=list); P_bat: list = field(default_factory=list)   # P_bat > 0 = ontladen
    P_net: list = field(default_factory=list); COP: list = field(default_factory=list)

@dataclass
class Resultaat:
    reeksen: Reeksen
    kpi: dict

def ideale_vraag(gb: Gebouw, klim: Klimaatjaar) -> list[float]:
    """Pass 1: onbegrensde warmtelevering -> T_i volgt setpoint; levert de 'warmtevraag' Q_ideaal(t) [kW]
    (ruimteverwarming, incl. begrensd opwarmvermogen). Begin met 1 week inregelen (cyclisch)."""
    UA, C = gb.UA, gb.C
    alpha = 1 - math.exp(-1 / gb.tau_gevel_h) if gb.tau_gevel_h > 0 else 1.0
    T_ef = klim.T[-168]; T_i = gb.T_set_gebruik
    out = [0.0] * 8760
    for h in range(-168, 8760):
        t = h % 8760
        T_ef += alpha * (klim.T[t] - T_ef)
        T_set = setpoint(gb, klim, t); g = winsten(gb, klim, t)
        Q_ss = UA * (T_i - T_ef) - g
        Q_req = max(0.0, Q_ss + min(C * (T_set - T_i), gb.f_boost * gb.P_ontwerp))
        T_i += (Q_req - UA * (T_i - T_ef) + g) / C
        if h >= 0: out[t] = Q_req
    return out

def simuleer(gb: Gebouw, wp: Warmtepomp, buf: Buffer, bat: Batterij, el: Elektra, klim: Klimaatjaar,
             hard: bool = False, Q_ideaal: list[float] | None = None) -> Resultaat:
    """Pass 2: volledige dispatch.
    hard=False ('zacht'): WP mag boven de limiet; batterij schaaft af; rest = overschrijding (geteld).
    hard=True: WP-elektra + batterij <= P_limiet; tekort -> buffer -> onderlevering (comfortverlies)."""
    UA, C = gb.UA, gb.C
    alpha = 1 - math.exp(-1 / gb.tau_gevel_h) if gb.tau_gevel_h > 0 else 1.0
    E_buf = buffer_E(buf, wp); UA_buf = buffer_UA(buf); dT_buf = buffer_dT(wp)
    E_bat = bat.E_nuttig; P_bat_max = bat.P; eta = bat.eta
    E_boiler = gb.E_boiler
    P_lim = el.P_limiet if (el.aandeel_wp > 0 and math.isfinite(el.P_aansluiting)) else float("inf")
    if Q_ideaal is None: Q_ideaal = ideale_vraag(gb, klim)
    cap_cache = [wp.P_th_nom * cap_factor(T) for T in klim.T]
    # grens voor voorspellend laden: wat de WP alléén (thermisch én binnen P_limiet) kan leveren
    grens = [min(cap_cache[t], P_lim * cop(wp, klim.T[t], stooklijn(wp, gb, klim.T[t]))) if math.isfinite(P_lim)
             else cap_cache[t] for t in range(8760)]

    # begintoestand (vol), 1 week inregelen
    T_ef = klim.T[-168]; T_i = gb.T_set_gebruik
    soc_buf = E_buf; soc_bat = E_bat; soc_boiler = E_boiler; dhw_mode = False
    R = Reeksen()
    kpi = dict(uren_overschrijding=0, max_overschrijding=0.0, kWh_overschrijding=0.0,
               uren_comfort=0, min_T_i=99.0, kWh_tekort=0.0, uren_tap_tekort=0, kWh_tap_tekort=0.0,
               P_el_wp_max=0.0, P_net_max=0.0, Q_wp_max=0.0,
               E_el_wp=0.0, E_el_bijstook=0.0, E_th_cv=0.0, E_th_tap=0.0, E_th_buf_in=0.0, E_th_buf_uit=0.0,
               E_buf_verlies=0.0, E_bat_in=0.0, E_bat_uit=0.0, E_net=0.0)

    for h in range(-168, 8760):
        t = h % 8760
        T_e = klim.T[t]
        T_ef += alpha * (T_e - T_ef)
        T_set = setpoint(gb, klim, t); g = winsten(gb, klim, t)

        # --- vraag ruimteverwarming (regelaar) ---
        Q_ss = UA * (T_i - T_ef) - g
        Q_req = max(0.0, Q_ss + min(C * (T_set - T_i), gb.f_boost * gb.P_ontwerp))

        # --- tapwater: boiler ---
        tap = tapvraag(gb, t)
        tap_tekort = 0.0
        if tap > 0:
            if soc_boiler >= tap: soc_boiler -= tap
            else: tap_tekort = tap - soc_boiler; soc_boiler = 0.0
        if E_boiler > 0:
            if not dhw_mode and soc_boiler < 0.5 * E_boiler: dhw_mode = True
            if dhw_mode and soc_boiler >= E_boiler - 1e-9: dhw_mode = False

        # --- WP-capaciteit en COP's ---
        cap = cap_cache[t]
        T_sup = stooklijn(wp, gb, T_e)
        cop_cv = cop(wp, T_e, T_sup); cop_tap = cop(wp, T_e, gb.T_tap); cop_buf = cop(wp, T_e, wp.T_buf_max)

        # elektrisch budget van de begrenzer = limiet + wat de batterij dit uur kan ontladen (netzijde)
        bat_dis_max = min(P_bat_max, soc_bat * eta)
        budget = P_lim + bat_dis_max            # inf als er geen limiet is
        P_el = 0.0

        # 1) tapwater (prioriteit) — WP in boilerbedrijf, begrensd door capaciteit en budget
        Q_tap = 0.0
        if dhw_mode and E_boiler > 0:
            Q_tap = min(cap, E_boiler - soc_boiler, max(0.0, (budget - P_el) * cop_tap))
            soc_boiler += Q_tap; P_el += Q_tap / cop_tap
            if soc_boiler >= E_boiler - 1e-9: dhw_mode = False
        cap_rest = cap - Q_tap

        # 2) ruimteverwarming direct door WP, binnen het budget van de begrenzer
        Q_cv = min(Q_req, cap_rest, max(0.0, (budget - P_el) * cop_cv))
        P_el += Q_cv / cop_cv
        cap_rest -= Q_cv
        tekort = Q_req - Q_cv

        # 3) tekort uit buffer
        Q_buf_uit = min(tekort, soc_buf)
        soc_buf -= Q_buf_uit; tekort -= Q_buf_uit

        # 3b) 'zacht': buffer leeg -> WP mag tóch boven de limiet (dit wordt als overschrijding geteld)
        if not hard and tekort > 0 and cap_rest > 0:
            Q_extra = min(tekort, cap_rest)
            Q_cv += Q_extra; P_el += Q_extra / cop_cv; cap_rest -= Q_extra; tekort -= Q_extra

        # 4) bijstook (COP 1): 'hard' binnen budget, 'zacht' onbegrensd (telt als overschrijding)
        Q_bij = 0.0
        if wp.P_bijstook > 0 and tekort > 0:
            Q_bij = min(tekort, wp.P_bijstook, max(0.0, budget - P_el) if hard else wp.P_bijstook)
            P_el += Q_bij; tekort -= Q_bij

        # 5) buffer laden met restcapaciteit, alleen binnen P_limiet (niet met batterijstroom, nooit boven de limiet)
        Q_buf_in = 0.0
        if E_buf > 0 and cap_rest > 0 and soc_buf < E_buf:
            laden = True
            if buf.strategie == "voorspellend":
                # (a) binnen de horizon een uur waarin de WP alléén (thermisch of binnen P_limiet) tekortschiet, of
                # (b) reserve om de ruimteverwarming te overbruggen tijdens boilerbedrijf (tapwater):
                #     reserve = max_k (Q_ideaal[k] / cap[k]) * E_boiler / 2
                laden = False; reserve = 0.0
                for k in range(1, buf.horizon_h + 1):
                    tk = (t + k) % 8760
                    if Q_ideaal[tk] > grens[tk]: laden = True; break
                    if E_boiler > 0 and cap_cache[tk] > 0:
                        reserve = max(reserve, Q_ideaal[tk] / cap_cache[tk] * E_boiler / 2)
                if not laden and soc_buf < min(reserve, E_buf) - 1e-9: laden = True
            if laden:
                ruimte_el = max(0.0, P_lim - P_el) if math.isfinite(P_lim) else float("inf")
                Q_buf_in = min(cap_rest, E_buf - soc_buf, ruimte_el * cop_buf)
                soc_buf += Q_buf_in; P_el += Q_buf_in / cop_buf

        # bufferverlies
        verlies = 0.0
        if buf.V_m3 > 0:
            T_gem = wp.T_ret_ontwerp + (soc_buf / E_buf if E_buf > 0 else 0) * dT_buf
            verlies = min(soc_buf, UA_buf * max(T_gem - buf.T_omgeving, 0.0))
            soc_buf -= verlies

        # 6) batterij: afschaven boven limiet, laden onder limiet (gretig)
        P_bat = 0.0
        if math.isfinite(P_lim):
            if P_el > P_lim + 1e-9:
                P_bat = min(P_el - P_lim, bat_dis_max)       # ontladen (netzijde)
                soc_bat -= P_bat / eta
            elif P_el < P_lim and soc_bat < E_bat - 1e-9:
                laad = min(P_lim - P_el, P_bat_max, (E_bat - soc_bat) / eta)
                P_bat = -laad; soc_bat += laad * eta
        P_net = P_el - P_bat

        # gebouw: energiebalans
        Q_lever = Q_cv + Q_buf_uit + Q_bij
        T_i += (Q_lever - UA * (T_i - T_ef) + g) / C

        if h < 0: continue
        # --- KPI's ---
        if math.isfinite(P_lim) and P_net > P_lim + 1e-6:
            kpi["uren_overschrijding"] += 1
            kpi["max_overschrijding"] = max(kpi["max_overschrijding"], P_net - P_lim)
            kpi["kWh_overschrijding"] += P_net - P_lim
        if in_gebruik(gb, klim, t) and T_i < T_set - 0.5:
            kpi["uren_comfort"] += 1
        kpi["min_T_i"] = min(kpi["min_T_i"], T_i)
        kpi["kWh_tekort"] += tekort
        if tap_tekort > 1e-9: kpi["uren_tap_tekort"] += 1; kpi["kWh_tap_tekort"] += tap_tekort
        kpi["P_el_wp_max"] = max(kpi["P_el_wp_max"], P_el); kpi["P_net_max"] = max(kpi["P_net_max"], P_net)
        kpi["Q_wp_max"] = max(kpi["Q_wp_max"], Q_cv + Q_tap + Q_buf_in)
        kpi["E_el_wp"] += P_el - Q_bij; kpi["E_el_bijstook"] += Q_bij
        kpi["E_th_cv"] += Q_cv + Q_buf_uit + Q_bij; kpi["E_th_tap"] += Q_tap
        kpi["E_th_buf_in"] += Q_buf_in; kpi["E_th_buf_uit"] += Q_buf_uit; kpi["E_buf_verlies"] += verlies
        if P_bat > 0: kpi["E_bat_uit"] += P_bat
        else: kpi["E_bat_in"] += -P_bat
        kpi["E_net"] += P_net
        for k, v in dict(T_e=T_e, T_ef=T_ef, T_i=T_i, T_set=T_set, Q_req=Q_req, Q_wp_cv=Q_cv, Q_wp_tap=Q_tap, Q_wp_buf=Q_buf_in,
                         Q_buf_uit=Q_buf_uit, Q_bijstook=Q_bij, Q_tekort=tekort, SoC_buf=soc_buf, SoC_bat=soc_bat, SoC_boiler=soc_boiler,
                         P_el_wp=P_el, P_bat=P_bat, P_net=P_net, COP=cop_cv).items():
            getattr(R, k).append(v)

    E_el_tot = kpi["E_el_wp"] + kpi["E_el_bijstook"]
    kpi["SCOP"] = (kpi["E_th_cv"] + kpi["E_th_tap"]) / E_el_tot if E_el_tot > 0 else 0.0
    kpi["Q_ideaal_max"] = max(Q_ideaal)
    kpi["E_th_vraag"] = sum(Q_ideaal)
    kpi["cycli_buffer"] = kpi["E_th_buf_uit"] / E_buf if E_buf > 0 else 0.0
    kpi["cycli_batterij"] = kpi["E_bat_uit"] / E_bat if E_bat > 0 else 0.0
    kpi["E_buf_kWh"] = E_buf; kpi["dT_buf"] = dT_buf; kpi["P_limiet"] = P_lim
    return Resultaat(R, kpi)

# ----------------------------------------------------------------------------
# 6. Dimensionering
# ----------------------------------------------------------------------------

def dimensioneer_wp(gb: Gebouw, wp: Warmtepomp, buf: Buffer, klim: Klimaatjaar, tol_uren: int = 0,
                    Q_ideaal=None) -> float:
    """Kleinste P_th_nom (A7/W35) zodat zonder elektrische begrenzing het comfort gehaald wordt
    (uren_comfort <= tol en geen tapwatertekort). Bisectie op [0,1 ; 3]·P_ontwerp, 14 iteraties (~0,02 % nauwkeurig)."""
    if Q_ideaal is None: Q_ideaal = ideale_vraag(gb, klim)
    el_vrij = Elektra(P_aansluiting=float("inf"), aandeel_wp=1.0)
    bat0 = Batterij(0.0)
    def ok(P):
        w = Warmtepomp(P, wp.eta_carnot, wp.stooklijn, wp.T_wp_max, wp.P_bijstook)
        r = simuleer(gb, w, buf, bat0, el_vrij, klim, hard=True, Q_ideaal=Q_ideaal).kpi
        return r["uren_comfort"] <= tol_uren and r["uren_tap_tekort"] == 0
    lo, hi = 0.1 * gb.P_ontwerp, 3.0 * gb.P_ontwerp
    if not ok(hi): return float("nan")
    for _ in range(14):
        mid = 0.5 * (lo + hi)
        if ok(mid): hi = mid
        else: lo = mid
    return hi

def kleinste_aansluiting(gb, wp, buf, bat, el: Elektra, klim, tol_uren=0, Q_ideaal=None):
    """Kleinste standaardaansluiting (zelfde aandeel_wp) met uren_overschrijding <= tol in 'zacht' bedrijf."""
    for label, fasen, A, P in AANSLUITINGEN:
        e = Elektra(P_aansluiting=P, aandeel_wp=el.aandeel_wp)
        r = simuleer(gb, wp, buf, bat, e, klim, hard=False, Q_ideaal=Q_ideaal).kpi
        if r["uren_overschrijding"] <= tol_uren: return label, P
    return "grootverbruik", float("nan")

def koudste_week(Q_ideaal: list[float], T: list[float]) -> int:
    """Startuur van de 168-uurs periode met de hoogste warmtevraagsom (tie-break: laagste T-gemiddelde)."""
    best, best_i = -1.0, 0
    s = sum(Q_ideaal[:168]); sT = sum(T[:168])
    for i in range(0, 8760 - 168):
        if i > 0:
            s += Q_ideaal[i + 167] - Q_ideaal[i - 1]; sT += T[i + 167] - T[i - 1]
        if s > best + 1e-9 or (abs(s - best) <= 1e-9 and sT < best_T):
            best, best_i, best_T = s, i, sT
        if i == 0: best_T = sT
    return best_i
