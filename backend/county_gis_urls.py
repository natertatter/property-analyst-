"""County assessor GIS deep links keyed by parcel number."""

from __future__ import annotations

import re
from urllib.parse import quote

BENTON_PARCELS_URL = "https://gis.bentoncountyar.gov/parcels/index.html"


def _normalize_county_key(county: str) -> str:
    name = (county or "").upper().strip()
    name = re.sub(r"\s+COUNTY\s*$", "", name).strip()
    return re.sub(r"[^A-Z]", "", name)


def benton_county_gis_url(parcel_number: str) -> str:
    parcel = (parcel_number or "").strip()
    if not parcel:
        return BENTON_PARCELS_URL
    return f"{BENTON_PARCELS_URL}?parcel={quote(parcel)}"


COUNTY_GIS_URL_BUILDERS = {
    "BENTON": benton_county_gis_url,
}


def get_county_gis_url(county: str | None, parcel_number: str | None) -> str | None:
    if not county or not parcel_number:
        return None
    builder = COUNTY_GIS_URL_BUILDERS.get(_normalize_county_key(county))
    if not builder:
        return None
    return builder(parcel_number.strip())
