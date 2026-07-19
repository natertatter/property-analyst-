"""Curated Lots of Bella Vista property listings."""

from __future__ import annotations

import asyncio
import json
import re
from functools import lru_cache
from pathlib import Path
from typing import Optional

import httpx

from benton_parcel_geocoder import geocode_benton_parcel
from curated_listings import curated_property_to_dict
from parser import ParsedProperty, parse_legal_row

DATA_FILE = Path(__file__).resolve().parent / "data" / "lots_of_bella_vista.json"


@lru_cache(maxsize=1)
def _load_dataset() -> dict:
    with open(DATA_FILE, encoding="utf-8") as handle:
        return json.load(handle)


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
    prop.asking_price = entry.get("min_bid")
    prop.appraised_value = entry.get("appraised_value")
    prop.list_number = entry.get("list_number")
    return prop


async def fetch_lots_of_bella_vista(geocode: bool = True) -> list[dict]:
    meta = _load_dataset()
    properties = [_entry_to_property(entry, meta) for entry in meta["properties"]]

    if not geocode:
        return [curated_property_to_dict(prop) for prop in properties]

    results: list[dict] = []
    cache: dict[str, dict] = {}
    async with httpx.AsyncClient(timeout=30.0) as client:
        for prop in properties:
            parcel = prop.parcel_number
            if parcel in cache:
                geo = cache[parcel]
            else:
                geo = await geocode_benton_parcel(client, parcel)
                if geo:
                    cache[parcel] = geo
                await asyncio.sleep(0.05)
            results.append(curated_property_to_dict(prop, geo))
    return results


def is_bella_vista_context(city_keywords: list[str]) -> bool:
    if not city_keywords:
        return True
    joined = " ".join(city_keywords).upper()
    return "BELLA VISTA" in joined
