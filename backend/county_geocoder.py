"""Arkansas county centroid lookup."""

from __future__ import annotations

import json
import re
from functools import lru_cache
from pathlib import Path

DATA_FILE = Path(__file__).resolve().parent / "data" / "county_centroids.json"
AUCTION_CITIES_FILE = Path(__file__).resolve().parent / "data" / "auction_cities.json"


def normalize_county_key(name: str) -> str:
    """Normalize catalog/county labels like 'BENTON County' to centroid keys."""
    cleaned = (name or "").upper().strip()
    cleaned = re.sub(r"\s+COUNTY\s*$", "", cleaned).strip()
    return re.sub(r"[^A-Z]", "", cleaned)


def normalize_county_name(name: str) -> str:
    return normalize_county_key(name)


@lru_cache(maxsize=1)
def _load_counties() -> dict:
    with open(DATA_FILE, encoding="utf-8") as handle:
        return json.load(handle)


@lru_cache(maxsize=1)
def _load_auction_cities() -> dict:
    if not AUCTION_CITIES_FILE.exists():
        return {}
    with open(AUCTION_CITIES_FILE, encoding="utf-8") as handle:
        return json.load(handle)


def get_county_centroid(county_name: str) -> dict | None:
    counties = _load_counties()
    return counties.get(normalize_county_name(county_name))


def get_auction_city_coords(city_name: str) -> dict | None:
    cities = _load_auction_cities()
    return cities.get((city_name or "").upper())


def all_county_centroids() -> dict:
    return _load_counties()
