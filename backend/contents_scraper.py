"""Fetch and parse Arkansas COSL auction catalog Contents page."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Optional
from urllib.parse import urljoin, urlparse, parse_qs

import httpx
from bs4 import BeautifulSoup

from county_geocoder import get_auction_city_coords, get_county_centroid, normalize_county_name

USER_AGENT = "PropertyAnalyst/1.0 (tax-sale prototype)"
DEFAULT_CONTENTS_URL = "https://cosl.org/Home/Contents"
COSL_BASE = "https://cosl.org"


@dataclass
class CountySaleEntry:
    sale_date: str
    sale_date_sort: str
    location: str
    auction_city: str
    county: str
    county_code: str
    catalog_url: str
    sale_date_catalog_url: Optional[str] = None
    datascout_url: Optional[str] = None
    map_parcels_url: Optional[str] = None
    lat: Optional[float] = None
    lon: Optional[float] = None
    geo_level: str = "county"


def _parse_sale_date(value: str) -> str:
    for fmt in ("%m/%d/%Y %I:%M %p", "%m/%d/%Y %I:%M:%S %p"):
        try:
            return datetime.strptime(value.strip(), fmt).strftime("%Y-%m-%dT%H:%M")
        except ValueError:
            continue
    return value


def _absolute_url(path: str) -> str:
    if path.startswith("http"):
        return path
    return urljoin(COSL_BASE, path)


def _extract_sale_date_catalog_url(row) -> Optional[str]:
    link = row.select_one('a[href*="CatalogViewBySaleDate"]')
    if link and link.get("href"):
        return _absolute_url(link["href"])
    return None


def _parse_county_dropdown(dropdown) -> Optional[dict]:
    toggle = dropdown.select_one(".dropdown-toggle")
    catalog_link = dropdown.select_one('a[href*="CatalogView?county="]')
    if not toggle or not catalog_link:
        return None

    href = catalog_link["href"]
    params = parse_qs(urlparse(href).query)
    county_code = (params.get("county") or [""])[0]
    sale_date = (params.get("saledate") or [""])[0]

    datascout = dropdown.select_one('a[href*="datascoutpro.com"]')
    map_link = dropdown.select_one('a[href*="AuctionMapResult"]')

    return {
        "county": toggle.get_text(strip=True).upper(),
        "county_code": county_code,
        "catalog_url": _absolute_url(href),
        "sale_date_param": sale_date,
        "datascout_url": datascout["href"] if datascout else None,
        "map_parcels_url": map_link["href"] if map_link else None,
    }


async def fetch_contents(url: str = DEFAULT_CONTENTS_URL) -> tuple[dict, list[CountySaleEntry]]:
    async with httpx.AsyncClient(timeout=60.0, headers={"User-Agent": USER_AGENT}) as client:
        response = await client.get(url)
        response.raise_for_status()
        html = response.text

    soup = BeautifulSoup(html, "lxml")
    entries: list[CountySaleEntry] = []
    sale_events = 0

    for row_container in soup.select("#contents_row"):
        row = row_container.select_one(".row")
        if not row:
            continue

        cols = row.find_all("div", recursive=False)
        if len(cols) < 4:
            continue

        sale_date = cols[0].get_text(strip=True)
        location = cols[1].get_text(" ", strip=True)
        auction_city = cols[2].get_text(strip=True).upper()
        sale_date_catalog_url = _extract_sale_date_catalog_url(row)
        sale_events += 1

        for dropdown in cols[3].select(".dropdown"):
            county_info = _parse_county_dropdown(dropdown)
            if not county_info:
                continue

            centroid = get_county_centroid(county_info["county"])
            city_coords = get_auction_city_coords(auction_city)
            entry = CountySaleEntry(
                sale_date=sale_date,
                sale_date_sort=_parse_sale_date(sale_date),
                location=location,
                auction_city=auction_city,
                county=county_info["county"],
                county_code=county_info["county_code"],
                catalog_url=county_info["catalog_url"],
                sale_date_catalog_url=sale_date_catalog_url,
                datascout_url=county_info.get("datascout_url"),
                map_parcels_url=county_info.get("map_parcels_url"),
                lat=(city_coords or centroid or {}).get("lat"),
                lon=(city_coords or centroid or {}).get("lon"),
            )
            entries.append(entry)

    meta = {
        "source_url": url,
        "sale_events": sale_events,
        "county_entries": len(entries),
        "unique_counties": len({e.county for e in entries}),
    }
    return meta, entries


def entry_to_dict(entry: CountySaleEntry) -> dict:
    county_centroid = get_county_centroid(entry.county)
    return {
        "sale_date": entry.sale_date,
        "sale_date_sort": entry.sale_date_sort,
        "location": entry.location,
        "auction_city": entry.auction_city,
        "county": entry.county,
        "county_code": entry.county_code,
        "catalog_url": entry.catalog_url,
        "sale_date_catalog_url": entry.sale_date_catalog_url,
        "datascout_url": entry.datascout_url,
        "map_parcels_url": entry.map_parcels_url,
        "lat": entry.lat,
        "lon": entry.lon,
        "county_lat": county_centroid["lat"] if county_centroid else None,
        "county_lon": county_centroid["lon"] if county_centroid else None,
        "search_text": " ".join(
            [
                entry.sale_date,
                entry.location,
                entry.auction_city,
                entry.county,
                entry.county_code,
            ]
        ).upper(),
    }


def filter_entries(
    entries: list[CountySaleEntry],
    county_keywords: list[str],
    city_keywords: list[str],
    location_keywords: list[str],
    search_text: str,
    counties: list[str],
) -> list[CountySaleEntry]:
    result = entries

    if counties:
        county_set = {normalize_county_name(c) for c in counties}
        result = [e for e in result if normalize_county_name(e.county) in county_set]

    if county_keywords:
        result = [
            e
            for e in result
            if any(kw.upper() in e.county.upper() for kw in county_keywords)
        ]

    if city_keywords:
        result = [
            e
            for e in result
            if any(kw.upper() in e.auction_city.upper() for kw in city_keywords)
        ]

    if location_keywords:
        result = [
            e
            for e in result
            if any(kw.upper() in e.location.upper() for kw in location_keywords)
        ]

    if search_text:
        needle = search_text.upper()
        result = [
            e
            for e in result
            if needle in entry_to_dict(e)["search_text"]
        ]

    return result


def sort_entries(entries: list[CountySaleEntry], sort_by: str, sort_dir: str) -> list[CountySaleEntry]:
    reverse = sort_dir.lower() == "desc"
    key_map = {
        "sale_date": lambda e: e.sale_date_sort,
        "county": lambda e: e.county,
        "city": lambda e: e.auction_city,
        "location": lambda e: e.location,
    }
    key_fn = key_map.get(sort_by, key_map["sale_date"])
    return sorted(entries, key=key_fn, reverse=reverse)
