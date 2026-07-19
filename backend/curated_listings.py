"""Shared helpers for curated Bella Vista property listings."""

from __future__ import annotations

from typing import Optional

from county_gis_urls import get_county_gis_url
from parcel_detail_urls import get_parcel_detail_url
from parser import ParsedProperty


def curated_property_to_dict(prop: ParsedProperty, geo: Optional[dict] = None) -> dict:
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
        "asking_price": prop.asking_price,
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
        "listing_notes": prop.listing_notes,
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


def merge_curated_rows(properties: list[dict], curated: list[dict]) -> list[dict]:
    existing_parcels = {row.get("parcel_number") for row in properties}
    merged = list(properties)
    for row in curated:
        parcel = row.get("parcel_number")
        if parcel and parcel not in existing_parcels:
            merged.append(row)
            existing_parcels.add(parcel)
    return merged
