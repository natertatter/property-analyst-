"""Fetch and parse Arkansas COSL tax sale catalog pages."""

from __future__ import annotations

import re
from typing import Optional
from urllib.parse import urljoin, parse_qs, urlparse

import httpx
from bs4 import BeautifulSoup

from parser import ParsedProperty, parse_legal_row

USER_AGENT = "PropertyAnalyst/1.0 (tax-sale prototype)"
COSL_HOSTS = ("cosl.org", "www.cosl.org")
COSL_BASE = "https://cosl.org"


def _normalize_catalog_url(url: str) -> str:
    parsed = urlparse(url)
    if parsed.netloc.lower() not in COSL_HOSTS:
        raise ValueError("URL must be from cosl.org (Arkansas Commissioner of State Lands)")

    if "/home/catalogview" in parsed.path.lower():
        return url

    params = parse_qs(parsed.query)
    county = (params.get("county") or params.get("County") or [None])[0]
    sale_date = (params.get("saledate") or params.get("saleDate") or [None])[0]
    if county and sale_date:
        from urllib.parse import quote

        return (
            f"https://cosl.org/Home/CatalogView?county={quote(county)}"
            f"&saledate={quote(sale_date)}"
        )

    return url


def _extract_sale_meta(soup: BeautifulSoup) -> dict:
    county = None
    sale_date = None
    location = None

    h3 = soup.find("h3")
    if h3:
        county = h3.get_text(strip=True)

    h5 = soup.find("h5")
    if h5:
        text = h5.get_text(" ", strip=True)
        match = re.match(r"^(.+?)\s+-\s+(.+)$", text)
        if match:
            sale_date = match.group(1).strip()
            location = match.group(2).strip()
        else:
            sale_date = text

    return {"county": county, "sale_date": sale_date, "sale_location": location}


def _extract_parcel_links(cells: list) -> tuple[Optional[str], Optional[str]]:
    datascout_url = None
    cosl_parcel_url = None

    for cell in cells:
        for link in cell.find_all("a", href=True):
            href = link["href"]
            if "datascoutpro.com" in href and not datascout_url:
                datascout_url = href
            elif "/WebParcels/GetParcel/" in href and not cosl_parcel_url:
                cosl_parcel_url = urljoin(COSL_BASE, href)

    return datascout_url, cosl_parcel_url


async def fetch_catalog(url: str) -> tuple[dict, list[ParsedProperty]]:
    catalog_url = _normalize_catalog_url(url)

    async with httpx.AsyncClient(timeout=60.0, headers={"User-Agent": USER_AGENT}) as client:
        response = await client.get(catalog_url)
        response.raise_for_status()
        html = response.text

    soup = BeautifulSoup(html, "lxml")
    meta = _extract_sale_meta(soup)

    table = soup.find("table", id="tableAllCertifications")
    if not table:
        raise ValueError("Could not find catalog table on page")

    properties: list[ParsedProperty] = []
    body = table.find("tbody") or table
    for row in body.find_all("tr"):
        cells = row.find_all("td")
        if len(cells) < 5:
            continue

        sale_number = cells[0].get_text(strip=True)
        owner_name = cells[1].get_text(" ", strip=True)
        legal_description = cells[2].get_text(" ", strip=True)
        interested_parties = cells[3].get_text(" ", strip=True)
        parcel_number = cells[4].get_text(strip=True)
        taxes = cells[5].get_text(strip=True) if len(cells) > 5 else ""
        datascout_url, cosl_parcel_url = _extract_parcel_links(cells)

        if not sale_number and "CANCELLED" in owner_name.upper():
            properties.append(
                ParsedProperty(
                    owner_name=owner_name,
                    legal_description=legal_description,
                    is_cancelled=True,
                )
            )
            continue

        prop = parse_legal_row(
            sale_number,
            owner_name,
            legal_description,
            interested_parties,
            parcel_number,
            taxes,
        )
        prop.datascout_url = datascout_url
        prop.cosl_parcel_url = cosl_parcel_url
        prop.catalog_url = catalog_url
        properties.append(prop)

    meta["source_url"] = catalog_url
    meta["total_rows"] = len(properties)
    return meta, properties
