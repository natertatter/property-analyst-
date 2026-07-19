"""Geocode properties using address search and Arkansas PLSS GIS."""

from __future__ import annotations

import asyncio
import re
from typing import Optional

import httpx

from parser import ParsedProperty

USER_AGENT = "PropertyAnalyst/1.0 (tax-sale prototype)"
NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
PLSS_QUERY_URL = (
    "https://gis.arkansas.gov/arcgis/rest/services/FEATURESERVICES/"
    "Planning_Cadastre/FeatureServer/10/query"
)

CITY_CENTERS = {
    "BELLA VISTA VILLAGE": (36.4812, -94.2861),
    "BELLA VISTA": (36.4812, -94.2861),
    "BENTONVILLE": (36.3729, -94.2088),
    "ROGERS": (36.3320, -94.1185),
    "SPRINGDALE": (36.1867, -94.1288),
}


def _polygon_centroid(rings: list) -> tuple[float, float]:
    ring = rings[0]
    lats = [p[1] for p in ring]
    lons = [p[0] for p in ring]
    return sum(lats) / len(lats), sum(lons) / len(lons)


def _format_township_for_gis(township: str) -> str:
    match = re.match(r"(\d+)([NS])", township.upper())
    if not match:
        return township
    return f"{match.group(1)} {match.group(2)}"


def _format_range_for_gis(range_: str) -> str:
    match = re.match(r"(\d+)([EW])", range_.upper())
    if not match:
        return range_
    return f"{match.group(1)} {match.group(2)}"


async def _nominatim_search(client: httpx.AsyncClient, query: str) -> Optional[tuple[float, float, str]]:
    if not query:
        return None

    response = await client.get(
        NOMINATIM_URL,
        params={"q": query, "format": "json", "limit": 1, "countrycodes": "us"},
        headers={"User-Agent": USER_AGENT},
    )
    response.raise_for_status()
    results = response.json()
    if not results:
        return None

    item = results[0]
    return float(item["lat"]), float(item["lon"]), item.get("display_name", query)


async def _plss_centroid(
    client: httpx.AsyncClient,
    section: str,
    township: str,
    range_: str,
) -> Optional[tuple[float, float, str]]:
    where = (
        f"section_='{section}' AND township='{_format_township_for_gis(township)}' "
        f"AND range='{_format_range_for_gis(range_)}'"
    )
    response = await client.get(
        PLSS_QUERY_URL,
        params={
            "where": where,
            "outFields": "str,county",
            "returnGeometry": "true",
            "outSR": "4326",
            "f": "json",
        },
    )
    response.raise_for_status()
    data = response.json()
    features = data.get("features") or []
    if not features:
        return None

    feature = features[0]
    lat, lon = _polygon_centroid(feature["geometry"]["rings"])
    label = feature["attributes"].get("str", f"Sec {section} T{township} R{range_}")
    return lat, lon, f"PLSS {label} (section centroid)"


async def geocode_property(
    client: httpx.AsyncClient,
    prop: ParsedProperty,
) -> dict:
    if prop.is_cancelled:
        return {
            "lat": None,
            "lon": None,
            "geocode_method": None,
            "geocode_label": None,
            "geocode_confidence": None,
        }

    # PLSS section centroid (best available for Arkansas catalog legal descriptions).
    if prop.section and prop.township and prop.range_:
        result = await _plss_centroid(client, prop.section, prop.township, prop.range_)
        if result:
            lat, lon, label = result
            return {
                "lat": lat,
                "lon": lon,
                "geocode_method": "plss_section",
                "geocode_label": label,
                "geocode_confidence": "medium" if prop.location_type == "subdivision" else "low",
            }

    # Street address fallback via Nominatim (rate limit: 1 req/sec).
    if prop.geocode_query:
        result = await _nominatim_search(client, prop.geocode_query)
        await asyncio.sleep(1.05)
        if result:
            lat, lon, label = result
            return {
                "lat": lat,
                "lon": lon,
                "geocode_method": "address",
                "geocode_label": label,
                "geocode_confidence": "medium",
            }

    # City center fallback.
    if prop.city and prop.city in CITY_CENTERS:
        lat, lon = CITY_CENTERS[prop.city]
        return {
            "lat": lat,
            "lon": lon,
            "geocode_method": "city_center",
            "geocode_label": f"{prop.city.title()} area (approximate)",
            "geocode_confidence": "very_low",
        }

    if prop.city and "BELLA VISTA" in prop.city:
        lat, lon = CITY_CENTERS["BELLA VISTA"]
        return {
            "lat": lat,
            "lon": lon,
            "geocode_method": "city_center",
            "geocode_label": "Bella Vista area (approximate)",
            "geocode_confidence": "very_low",
        }

    return {
        "lat": None,
        "lon": None,
        "geocode_method": None,
        "geocode_label": None,
        "geocode_confidence": None,
    }


async def geocode_properties(properties: list[ParsedProperty]) -> list[dict]:
    results = []
    plss_cache: dict[tuple[str, str, str], dict] = {}
    async with httpx.AsyncClient(timeout=30.0) as client:
        for prop in properties:
            if (
                prop.section
                and prop.township
                and prop.range_
                and (prop.section, prop.township, prop.range_) in plss_cache
            ):
                cached = plss_cache[(prop.section, prop.township, prop.range_)]
                results.append({**cached, "geocode_label": cached["geocode_label"]})
                continue

            geo = await geocode_property(client, prop)
            if geo.get("geocode_method") == "plss_section" and prop.section and prop.township and prop.range_:
                plss_cache[(prop.section, prop.township, prop.range_)] = geo
            results.append(geo)
    return results
