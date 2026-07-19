"""Tax sale property analyzer API."""

from __future__ import annotations

from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from contents_scraper import (
    DEFAULT_CONTENTS_URL,
    entry_to_dict,
    fetch_contents,
    filter_entries,
    sort_entries,
)
from county_geocoder import all_county_centroids
from county_gis_urls import get_county_gis_url
from parcel_detail_urls import get_parcel_detail_url
from geocoder import geocode_properties
from lots_of_bella_vista import fetch_lots_of_bella_vista, is_bella_vista_context
from reddit_seller_lots import fetch_reddit_seller_lots
from curated_listings import merge_curated_rows
from parser import ParsedProperty, matches_criteria
from scraper import fetch_catalog

ROOT = Path(__file__).resolve().parent.parent
FRONTEND_DIR = ROOT / "frontend"

app = FastAPI(title="Tax Sale Property Analyzer", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ContentsFilterRequest(BaseModel):
    contents_url: str = DEFAULT_CONTENTS_URL
    county_keywords: list[str] = Field(default_factory=list)
    city_keywords: list[str] = Field(default_factory=list)
    location_keywords: list[str] = Field(default_factory=list)
    search_text: str = ""
    counties: list[str] = Field(default_factory=list)
    sort_by: str = "sale_date"
    sort_dir: str = "asc"


class AnalyzeRequest(BaseModel):
    catalog_url: str = Field(
        ...,
        description="COSl.org catalog URL",
        examples=[
            "https://cosl.org/Home/CatalogView?county=BENT&saledate=8%2F11%2F2026%2010%3A00%3A00%20AM"
        ],
    )
    city_keywords: list[str] = Field(
        default_factory=lambda: ["BELLA VISTA", "BELLA VISTA VILLAGE"],
        description="Match if any keyword appears in city or legal description",
    )
    min_acres: Optional[float] = None
    max_acres: Optional[float] = None
    min_taxes: Optional[float] = None
    max_taxes: Optional[float] = None
    building_statuses: list[str] = Field(
        default_factory=list,
        description="platted_lot, vacant_land, mobile_home_lot, unknown",
    )
    search_text: str = ""
    geocode: bool = True


def _property_to_dict(prop: ParsedProperty, geo: Optional[dict] = None) -> dict:
    cosl_property_url = prop.cosl_parcel_url or prop.catalog_url
    county_gis_url = get_county_gis_url(prop.county, prop.parcel_number)
    parcel_detail_url = get_parcel_detail_url(prop.county, prop.parcel_number)
    data = {
        "sale_number": prop.sale_number,
        "owner_name": prop.owner_name,
        "legal_description": prop.legal_description,
        "interested_parties": prop.interested_parties,
        "county": prop.county,
        "parcel_number": prop.parcel_number,
        "taxes_owed": prop.taxes_owed,
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
        "datascout_url": prop.datascout_url,
        "cosl_parcel_url": prop.cosl_parcel_url,
        "catalog_url": prop.catalog_url,
        "cosl_property_url": cosl_property_url,
        "county_gis_url": county_gis_url,
        "parcel_detail_url": parcel_detail_url,
        "property_source": prop.property_source,
        "source_label": prop.source_label,
        "source_url": prop.source_url,
        "min_bid": prop.min_bid,
        "asking_price": prop.asking_price,
        "appraised_value": prop.appraised_value,
        "listing_notes": prop.listing_notes,
        "list_number": prop.list_number,
    }
    if geo:
        data.update(geo)
    return data


async def _analyze_catalog(
    catalog_url: str,
    city_keywords: list[str],
    min_acres: Optional[float],
    max_acres: Optional[float],
    min_taxes: Optional[float],
    max_taxes: Optional[float],
    building_statuses: list[str],
    search_text: str,
    geocode: bool,
) -> dict:
    meta, properties = await fetch_catalog(catalog_url)
    active = [p for p in properties if not p.is_cancelled]
    filtered = [
        p
        for p in active
        if matches_criteria(
            p,
            city_keywords,
            min_acres,
            max_acres,
            min_taxes,
            max_taxes,
            building_statuses,
            search_text,
        )
    ]

    geocodes = []
    if geocode and filtered:
        geocodes = await geocode_properties(filtered)

    for prop in filtered:
        if not prop.catalog_url:
            prop.catalog_url = catalog_url

    results = [
        _property_to_dict(prop, geo if geocode else None)
        for prop, geo in zip(filtered, geocodes or [None] * len(filtered))
    ]
    results = await _merge_curated_listings(results, city_keywords, geocode)

    summary = {
        "total_catalog_rows": len(properties),
        "active_rows": len(active),
        "matched_rows": len(filtered),
        "mapped_rows": sum(1 for r in results if r.get("lat") is not None),
        "curated_rows": sum(1 for r in results if r.get("property_source")),
        "lobv_rows": sum(1 for r in results if r.get("property_source") == "lotsofbellavista.com"),
        "reddit_rows": sum(1 for r in results if r.get("property_source") == "reddit_seller"),
        "by_building_status": {},
        "taxes_total": round(sum(r["taxes_owed"] or 0 for r in results), 2),
        "acres_total": round(sum(r["acres"] or 0 for r in results), 2),
    }
    for row in results:
        status = row["building_status"]
        summary["by_building_status"][status] = summary["by_building_status"].get(status, 0) + 1

    return {"meta": meta, "summary": summary, "properties": results}


async def _merge_curated_listings(
    properties: list[dict],
    city_keywords: list[str],
    geocode: bool,
) -> list[dict]:
    if not is_bella_vista_context(city_keywords):
        return properties

    lobv = await fetch_lots_of_bella_vista(geocode=geocode)
    reddit = await fetch_reddit_seller_lots(geocode=geocode)
    return merge_curated_rows(merge_curated_rows(properties, lobv), reddit)


@app.get("/api/health")
async def health():
    return {"status": "ok"}


@app.get("/api/contents")
async def get_contents(url: str = DEFAULT_CONTENTS_URL):
    try:
        meta, entries = await fetch_contents(url)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return {
        "meta": meta,
        "county_centroids": all_county_centroids(),
        "entries": [entry_to_dict(e) for e in entries],
    }


@app.post("/api/contents/filter")
async def filter_contents(request: ContentsFilterRequest):
    try:
        meta, entries = await fetch_contents(request.contents_url)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    filtered = filter_entries(
        entries,
        request.county_keywords,
        request.city_keywords,
        request.location_keywords,
        request.search_text,
        request.counties,
    )
    sorted_entries = sort_entries(filtered, request.sort_by, request.sort_dir)

    return {
        "meta": meta,
        "criteria": request.model_dump(),
        "summary": {
            "total_entries": len(entries),
            "matched_entries": len(sorted_entries),
            "unique_counties": len({e.county for e in sorted_entries}),
            "unique_sale_dates": len({e.sale_date for e in sorted_entries}),
        },
        "entries": [entry_to_dict(e) for e in sorted_entries],
    }


@app.post("/api/analyze")
async def analyze(request: AnalyzeRequest):
    try:
        result = await _analyze_catalog(
            request.catalog_url,
            request.city_keywords,
            request.min_acres,
            request.max_acres,
            request.min_taxes,
            request.max_taxes,
            request.building_statuses,
            request.search_text,
            request.geocode,
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return {**result, "criteria": request.model_dump()}


@app.get("/api/catalog/map")
async def catalog_map(
    catalog_url: str,
    city_keywords: str = "",
    search_text: str = "",
    geocode: bool = True,
):
    """Return geocoded catalog parcels for map display (used by state county drill-down)."""
    keywords = [k.strip() for k in city_keywords.split(",") if k.strip()]
    try:
        result = await _analyze_catalog(
            catalog_url,
            keywords,
            None,
            None,
            None,
            None,
            [],
            search_text,
            geocode,
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return {
        "meta": result["meta"],
        "summary": result["summary"],
        "properties": result["properties"],
    }


@app.get("/api/curated/reddit-seller-lots")
async def reddit_seller_lots(geocode: bool = True):
    try:
        properties = await fetch_reddit_seller_lots(geocode=geocode)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return {
        "meta": {
            "source": "reddit_seller",
            "source_label": "Reddit seller lot",
            "count": len(properties),
        },
        "properties": properties,
    }


@app.get("/api/curated/lots-of-bella-vista")
async def lots_of_bella_vista(geocode: bool = True):
    try:
        properties = await fetch_lots_of_bella_vista(geocode=geocode)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return {
        "meta": {
            "source": "lotsofbellavista.com",
            "source_label": "Lots of Bella Vista",
            "count": len(properties),
        },
        "properties": properties,
    }


@app.get("/")
async def index():
    return FileResponse(FRONTEND_DIR / "index.html")


if FRONTEND_DIR.exists():
    app.mount("/static", StaticFiles(directory=FRONTEND_DIR), name="static")
