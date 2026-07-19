"""Curated Reddit seller lots in Bella Vista."""

from __future__ import annotations

import asyncio
import json
from functools import lru_cache
from pathlib import Path

import httpx

from benton_parcel_geocoder import geocode_benton_parcel
from curated_listings import curated_property_to_dict
from parser import ParsedProperty

DATA_FILE = Path(__file__).resolve().parent / "data" / "reddit_seller_lots.json"


@lru_cache(maxsize=1)
def _load_dataset() -> dict:
    with open(DATA_FILE, encoding="utf-8") as handle:
        return json.load(handle)


def price_for_acres(acres: float) -> float:
    """$10,750 for 0.29 acres and below; $12,350 for 0.30 acres and above."""
    if acres <= 0.29:
        return 10750.0
    return 12350.0


def _entry_to_property(entry: dict, meta: dict) -> ParsedProperty:
    acres = float(entry["acres"])
    lot_type = entry.get("lot_type", "standard")
    asking_price = entry.get("asking_price")
    if asking_price is None:
        asking_price = price_for_acres(acres)

    listing_notes = entry.get("listing_notes")
    if lot_type == "perc" and listing_notes:
        building_detail = f"Reddit seller perc lot — {listing_notes}"
        legal = f"Perc lot ({listing_notes}) — {acres:.2f} acres"
    else:
        building_detail = "Reddit seller lot"
        legal = f"Bella Vista lot — {acres:.2f} acres"

    return ParsedProperty(
        sale_number=f"REDDIT-{entry['list_number']}",
        list_number=entry["list_number"],
        legal_description=legal,
        parcel_number=entry["parcel_number"],
        acres=acres,
        city=meta["city"],
        county=meta["county"],
        building_status="platted_lot",
        building_detail=building_detail,
        location_type="subdivision",
        property_source=meta["source"],
        source_label=meta["source_label"],
        source_url=meta.get("source_url"),
        min_bid=asking_price,
        asking_price=asking_price,
        listing_notes=listing_notes,
    )


async def fetch_reddit_seller_lots(geocode: bool = True) -> list[dict]:
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
