# Klimaatdata voor het peakshaving-concept

## Bestanden

| Bestand | Inhoud | Gebruik |
|---|---|---|
| `src/concepts/peakshaving/data/referentiejaren.json` | Vijf referentiejaren (`energie`, `T5`, `T1`, `winter1979`, `winter1963`): 8760 uurwaarden T (0,1 °C), RV (%), wind (0,1 m/s), globale straling (W/m²) + metadata en statistiek | runtime |
| `src/concepts/peakshaving/data/knmi-debilt-1951-2025.json` | Werkelijke jaren 1951–2025, alleen T (0,1 °C), 8760 uur per jaar, weekdag van 1 januari, statistiek, aanbevolen stresstestjaren | runtime (lazy) |
| `docs/klimaat/referentiejaar_*.csv` | Leesbare versie van de referentiejaren (`;`-gescheiden) | documentatie |
| `docs/klimaat/statistiek_jaren.csv` | Statistiek per referentiejaar en per werkelijk jaar | documentatie |
| `docs/klimaat/winterstatistiek_1951_2025.csv` | Per stookseizoen (1 nov – 31 mrt, 1951/52 – 2024/25): Hellmann-getal, T min, uren < −5/−10 °C, koudste 24/72/168/336/720 uur; plus de referentiejaren | documentatie |

Tijdas: MET (UTC+1) zonder zomertijd; uurindex 0 = 1 januari 00:00–01:00. Referentiejaren beginnen op een maandag en tellen 365 dagen (29 februari weggelaten). De jaren worden cyclisch gebruikt (december loopt door in januari).

## Herkomst

- **Bron:** KNMI, uurgegevens van station 260 De Bilt via `https://www.daggegevens.knmi.nl/klimatologie/uurgegevens` (open data; bronvermelding "KNMI"). KNMI levert uurvakken in UT; bij het inlezen is één uur opgeschoven naar MET. Globale straling ontbreekt vóór 1957 (alleen relevant voor de kolom Q; het model gebruikt uitsluitend T).
- **NEN-referentiejaren (`energie`, `T5`, `T1`):** NEN 5060:2018 stelt haar referentiejaren samen uit werkelijke kalendermaanden van De Bilt uit 1996–2015 (energiejaar; ontwerpjaren T1 = 1 % en T5 = 5 % overschrijdingskans, bedoeld voor temperatuuroverschrijdings- en koellastberekeningen). De uurdata van NEN zijn niet vrij; daarom is per maand de werkelijke maand gekozen waarvan het maandgemiddelde overeenkomt met de gepubliceerde maandgemiddelden (W/E-rapport 9604 "Temperatuuroverschrijding in nieuwe woningen in relatie tot voorgenomen BENG-eisen", RVO, april 2018, tabel 4). Vrijwel elke maand matcht binnen 0,05 K; de reconstructie wijkt per maand maximaal 0,05 K af van de NEN-tabel. Maandovergangen zijn over 16 uur vloeiend gemaakt (cross-fade met de werkelijke aansluitende uren van de bronjaren).
- **Stresstestjaren (`winter1979`, `winter1963`):** het T1-jaar waarin het complete werkelijke stookseizoen 1 november – 31 maart is vervangen door dat van 1978/79 (strenge winter: koudste week −10,2 °C, Hellmann 206, ≈ 1× per 25 jaar in 1951–2025) resp. 1962/63 (extreme winter: Hellmann 346, twee maanden vorst, ≈ 1× per eeuw). Toegevoegd omdat de basisperiode 1996–2015 van NEN 5060:2018 geen winter van dit kaliber bevat; T1 heeft wel een strenge winter (de drie koudste maanden uit 1996–2015), T5 een gemiddelde. Herhalingstijden zijn empirisch en in het huidige klimaat eerder langer.
- **Status:** een reconstructie op basis van open data, **geen officiële NEN 5060-data**. Voor normatieve berekeningen de officiële data gebruiken (NEN 5060:2018+A1:2021).

Bronjaar per maand (jan … dec):

| Jaar | jan | feb | mrt | apr | mei | jun | jul | aug | sep | okt | nov | dec |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| energie | 2001 | 2004 | 2004 | 2002 | 2000 | 2011 | 2008 | 2001 | 2011 | 2010 | 2003 | 2003 |
| T5 | 2013 | 1996 | 2013 | 1996 | 2006 | 2011 | 2013 | 1997 | 1999 | 2001 | 1999 | 2009 |
| T1 | 1997 | 1996 | 2005 | 2007 | 1998 | 2006 | 2006 | 2003 | 2011 | 2011 | 2010 | 2010 |
| winter1979 | 1979 | 1979 | 1979 | 2007 | 1998 | 2006 | 2006 | 2003 | 2011 | 2011 | 1978 | 1978 |
| winter1963 | 1963 | 1963 | 1963 | 2007 | 1998 | 2006 | 2006 | 2003 | 2011 | 2011 | 1962 | 1962 |

Winterstrengheid ter vergelijking (koudste 168 uur / Hellmann): energie −2,5 / 27 · T5 −4,2 / 122 · T1 −7,6 / 195 · winter1979 −10,2 / 206 · winter1963 −8,7 / 346. Strengste werkelijke seizoenen sinds 1951 op koudste week: 1978/79 (−10,2), 1955/56 (−10,0), 1986/87 (−9,9), 1962/63 (−8,7), 1984/85 (−8,4), 1996/97 (−8,4), 2011/12 (−8,0).

## Reproduceren

```bash
scripts/klimaat/download_knmi.sh knmi_raw 1951 2025            # ±30 MB, 75 bestanden
python3 -I scripts/klimaat/parse_knmi.py knmi_raw knmi.npz      # vereist numpy
python3 -I scripts/klimaat/match_months.py knmi.npz             # (controle) maandselectie t.o.v. NEN-tabel
python3 -I scripts/klimaat/tmy_iso15927.py knmi.npz             # (controle) ISO 15927-4-selectie
python3 -I scripts/klimaat/build_reference_years.py knmi.npz out/                  # schrijft JSON + CSV
python3 -I scripts/klimaat/winter_stats.py knmi.npz out/referentiejaren.json out/winterstatistiek_1951_2025.csv
```
