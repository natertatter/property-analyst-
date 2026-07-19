"""Geocode Benton County parcels via the county GIS REST API."""

from __future__ import annotations

from typing import Optional

import httpx

BENTON_PARCEL_QUERY_URL = (
    "https://gis.bentoncountyar.gov/arcgis/rest/services/Assessor/ParcelMobile/MapServer/1/query"
)
USER_AGENT = "PropertyAnalyst/1.0 (tax-sale prototype)"


def _polygon_centroid(rings: list) -> tuple[float, float]:
    ring = rings[0]
    lats = [p[1] for p in ring]
    lons = [p[0] for p in ring]
    return sum(lats) / len(lats), sum(lons) / len(lons)


async def geocode_benton_parcel(
    client: httpx.AsyncClient,
    parcel_number: str,
) -> Optional[dict]:
    response = await client.get(
        BENTON_PARCEL_QUERY_URL,
        params={
            "where": f"PARCELID='{parcel_number}'",
            "returnGeometry": "true",
            "outSR": "4326",
            "f": "json",
        },
        headers={"User-Agent": USER_AGENT},
    )
    response.raise_for_status()
    data = response.json()
    features = data.get("features") or []
    if not features:
        return None

    geometry = features[0].get("geometry") or {}
    rings = geometry.get("rings")
    if not rings:
        return None

    lat, lon = _polygon_centroid(rings)
    attrs = features[0].get("attributes") or {}
    label = attrs.get("PH_ADD") or attrs.get("PARCELID") or parcel_number
    return {
        "lat": lat,
        "lon": lon,
        "geocode_method": "benton_parcel",
        "geocode_label": f"{label} (Benton County parcel)",
        "geocode_confidence": "high",
    }
