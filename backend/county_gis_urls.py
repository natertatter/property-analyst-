"""County assessor GIS deep links keyed by parcel number."""

from __future__ import annotations

from urllib.parse import quote

from county_geocoder import normalize_county_key

BENTON_PARCELS_URL = "https://gis.bentoncountyar.gov/parcels/index.html"


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
    builder = COUNTY_GIS_URL_BUILDERS.get(normalize_county_key(county))
    if not builder:
        return None
    return builder(parcel_number.strip())
