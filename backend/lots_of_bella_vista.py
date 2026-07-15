"""Curated Lots of Bella Vista property listings."""

from __future__ import annotations

import asyncio
import json
import re
from functools import lru_cache
from pathlib import Path
from typing import Optional

import httpx

from county_gis_urls import get_county_gis_url
from parcel_detail_urls import get_parcel_detail_url
from parser import ParsedProperty, parse_legal_row

DATA_FILE = Path(__file__).resolve().parent / "data" / "lots_of_bella_vista.json"
BENTON_PARCEL_QUERY_URL = (
    "https://gis.bentoncountyar.gov/arcgis/rest/services/Assessor/ParcelMobile/MapServer/1/query"
)
USER_AGENT = "PropertyAnalyst/1.0 (tax-sale prototype)"


@lru_cache(maxsize=1)
def _load_dataset() -> dict:
    with open(DATA_FILE, encoding="utf-8") as handle:
        return json.load(handle)


def _polygon_centroid(rings: list) -> tuple[float, float]:
    ring = rings[0]
    lats = [p[1] for p in ring]
    lons = [p[0] for p in ring]
    return sum(lats) / len(lats), sum(lons) / len(lons)


def _parse_lot_block_addition(legal: str) -> tuple[Optional[str], Optional[str], Optional[str]]:
    lot = block = addition = None
    lot_match = re.search(r"\bLot\s+([\dA-Z]+)", legal, re.IGNORECASE)
    block_match = re.search(r"\bBlock\s+([\dA-Z]+)", legal, re.IGNORECASE)
    add_match = re.search(r"\bBlock\s+[\dA-Z]+,\s*(.+)$", legal, re.IGNORECASE)
    if lot_match:
        lot = lot_match.group(1)
    if block_match:
        block = block_match.group(1)
    if add_match:
        addition = add_match.group(1).strip().upper()
    return lot, block, addition


def _entry_to_property(entry: dict, meta: dict) -> ParsedProperty:
    legal = entry["legal_description"]
    prop = parse_legal_row(
        sale_number=f"LOBV-{entry['list_number']}",
        owner_name="",
        legal_description=f"{legal} CITY BELLA VISTA",
        interested_parties="",
        parcel_number=entry["parcel_number"],
        taxes="",
    )
    lot, block, addition = _parse_lot_block_addition(legal)
    prop.lot = lot or prop.lot
    prop.block = block or prop.block
    prop.addition = addition or prop.addition
    prop.city = meta["city"]
    prop.county = meta["county"]
    prop.building_status = "platted_lot"
    prop.building_detail = "Lots of Bella Vista listing"
    prop.location_type = "subdivision"
    prop.property_source = meta["source"]
    prop.source_label = meta["source_label"]
    prop.source_url = meta["source_url"]
    prop.min_bid = entry.get("min_bid")
    prop.appraised_value = entry.get("appraised_value")
    prop.list_number = entry.get("list_number")
    return prop


async def _geocode_benton_parcel(
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


def property_to_dict(prop: ParsedProperty, geo: Optional[dict] = None) -> dict:
    data = {
        "sale_number": prop.sale_number,
        "list_number": prop.list_number,
        "owner_name": prop.owner_name,
        "legal_description": prop.legal_description,
        "interested_parties": prop.interested_parties,
        "county": prop.county,
        "parcel_number": prop.parcel_number,
        "taxes_owed": prop.taxes_owed,
        "min_bid": prop.min_bid,
        "appraised_value": prop.appraised_value,
        "acres": prop.acres,
        "city": prop.city,
        "section": prop.section,
        "township": prop.township,
        "range": prop.range_,
        "lot": prop.lot,
        "block": prop.block,
        "addition": prop.addition,
        "building_status": prop.building_status,
        "building_detail": prop.building_detail,
        "location_type": prop.location_type,
        "geocode_query": prop.geocode_query,
        "is_cancelled": prop.is_cancelled,
        "property_source": prop.property_source,
        "source_label": prop.source_label,
        "source_url": prop.source_url,
        "datascout_url": prop.datascout_url,
        "cosl_parcel_url": prop.cosl_parcel_url,
        "catalog_url": prop.catalog_url,
        "cosl_property_url": prop.cosl_parcel_url or prop.catalog_url,
        "county_gis_url": get_county_gis_url(prop.county, prop.parcel_number),
        "parcel_detail_url": get_parcel_detail_url(prop.county, prop.parcel_number),
    }
    if geo:
        data.update(geo)
    return data


async def fetch_lots_of_bella_vista(geocode: bool = True) -> list[dict]:
    meta = _load_dataset()
    properties = [_entry_to_property(entry, meta) for entry in meta["properties"]]

    if not geocode:
        return [property_to_dict(prop) for prop in properties]

    results: list[dict] = []
    cache: dict[str, dict] = {}
    async with httpx.AsyncClient(timeout=30.0) as client:
        for prop in properties:
            parcel = prop.parcel_number
            if parcel in cache:
                geo = cache[parcel]
            else:
                geo = await _geocode_benton_parcel(client, parcel)
                if geo:
                    cache[parcel] = geo
                await asyncio.sleep(0.05)
            results.append(property_to_dict(prop, geo))
    return results


def is_bella_vista_context(city_keywords: list[str]) -> bool:
    if not city_keywords:
        return True
    joined = " ".join(city_keywords).upper()
    return "BELLA VISTA" in joined
