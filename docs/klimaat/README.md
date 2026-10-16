# Klimaatdata voor het peakshaving-concept

## Bestanden

| Bestand | Inhoud | Gebruik |
|---|---|---|
| `src/concepts/peakshaving/data/referentiejaren.json` | Drie referentiejaren (`energie`, `T5`, `T1`): 8760 uurwaarden T (0,1 °C), RV (%), wind (0,1 m/s), globale straling (W/m²) + metadata en statistiek | runtime |
| `src/concepts/peakshaving/data/knmi-debilt-1991-2025.json` | Werkelijke jaren 1991–2025, alleen T (0,1 °C), 8760 uur per jaar, weekdag van 1 januari, statistiek | runtime (lazy) |
| `docs/klimaat/referentiejaar_{energie,T5,T1}.csv` | Leesbare versie van de referentiejaren (`;`-gescheiden) | documentatie |
| `docs/klimaat/statistiek_jaren.csv` | Statistiek per referentiejaar en per werkelijk jaar | documentatie |

Tijdas: MET (UTC+1) zonder zomertijd; uurindex 0 = 1 januari 00:00–01:00. Referentiejaren beginnen op een maandag en tellen 365 dagen (29 februari weggelaten).

## Herkomst

- **Bron:** KNMI, uurgegevens van station 260 De Bilt via `https://www.daggegevens.knmi.nl/klimatologie/uurgegevens` (open data; bronvermelding "KNMI"). KNMI levert uurvakken in UT; bij het inlezen is één uur opgeschoven naar MET.
- **Referentiejaren:** NEN 5060:2018 stelt haar referentiejaren samen uit werkelijke kalendermaanden van De Bilt uit 1996–2015 (energiejaar; ontwerpjaren T1 = 1 % en T5 = 5 % overschrijdingskans). De uurdata van NEN zijn niet vrij; daarom is per maand de werkelijke maand gekozen waarvan het maandgemiddelde overeenkomt met de gepubliceerde maandgemiddelden (W/E-rapport 9604 "Temperatuuroverschrijding in nieuwe woningen in relatie tot voorgenomen BENG-eisen", RVO, april 2018, tabel 4). Vrijwel elke maand matcht binnen 0,05 K; de reconstructie wijkt per maand maximaal 0,05 K af van de NEN-tabel. Maandovergangen zijn over 16 uur vloeiend gemaakt (cross-fade met de werkelijke aansluitende uren van de bronjaren).
- **Status:** een reconstructie op basis van open data, **geen officiële NEN 5060-data**. Voor normatieve berekeningen de officiële data gebruiken (NEN 5060:2018+A1:2021).

Bronjaar per maand (jan … dec):

| Jaar | jan | feb | mrt | apr | mei | jun | jul | aug | sep | okt | nov | dec |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| energie | 2001 | 2004 | 2004 | 2002 | 2000 | 2011 | 2008 | 2001 | 2011 | 2010 | 2003 | 2003 |
| T5 | 2013 | 1996 | 2013 | 1996 | 2006 | 2011 | 2013 | 1997 | 1999 | 2001 | 1999 | 2009 |
| T1 | 1997 | 1996 | 2005 | 2007 | 1998 | 2006 | 2006 | 2003 | 2011 | 2011 | 2010 | 2010 |

## Reproduceren

```bash
scripts/klimaat/download_knmi.sh knmi_raw 1991 2025          # ±14 MB, 35 bestanden
python3 -I scripts/klimaat/parse_knmi.py knmi_raw knmi.npz    # vereist numpy
python3 -I scripts/klimaat/match_months.py knmi.npz           # (controle) maandselectie t.o.v. NEN-tabel
python3 -I scripts/klimaat/tmy_iso15927.py knmi.npz           # (controle) ISO 15927-4-selectie
python3 -I scripts/klimaat/build_reference_years.py knmi.npz out/   # schrijft JSON + CSV
```
