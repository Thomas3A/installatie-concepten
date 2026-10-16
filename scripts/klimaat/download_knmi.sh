#!/usr/bin/env bash
# Download KNMI-uurgegevens (station 260 De Bilt) per jaar: T, U, FH, Q.
# Gebruik: ./download_knmi.sh <doelmap> [startjaar] [eindjaar]
# Bron: https://www.daggegevens.knmi.nl/klimatologie/uurgegevens (KNMI open data, bronvermelding: KNMI)
set -euo pipefail
OUT="${1:-knmi_raw}"; START="${2:-1991}"; END="${3:-2025}"
mkdir -p "$OUT"
for y in $(seq "$START" "$END"); do
  curl -sS -m 180 -o "$OUT/debilt_${y}.txt" \
    "https://www.daggegevens.knmi.nl/klimatologie/uurgegevens?stns=260&vars=T:U:FH:Q&start=${y}010101&end=${y}123124"
  echo "$y: $(grep -vc '^#' "$OUT/debilt_${y}.txt") regels"
done
