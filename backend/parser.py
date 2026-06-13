"""Parse tax sale legal descriptions into structured property fields."""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Optional


CANCELLED_MARKERS = ("ENTRY CANCELLED", "REDEEMED")


@dataclass
class ParsedProperty:
    sale_number: Optional[str] = None
    owner_name: str = ""
    legal_description: str = ""
    interested_parties: str = ""
    parcel_number: str = ""
    taxes_owed: Optional[float] = None
    acres: Optional[float] = None
    city: Optional[str] = None
    section: Optional[str] = None
    township: Optional[str] = None
    range_: Optional[str] = None
    lot: Optional[str] = None
    block: Optional[str] = None
    addition: Optional[str] = None
    is_cancelled: bool = False
    building_status: str = "unknown"
    building_detail: str = ""
    location_type: str = "unknown"
    geocode_query: str = ""
    county: Optional[str] = None
    datascout_url: Optional[str] = None
    cosl_parcel_url: Optional[str] = None
    catalog_url: Optional[str] = None
    raw: dict = field(default_factory=dict)


def _parse_money(value: str) -> Optional[float]:
    cleaned = re.sub(r"[^0-9.]", "", value or "")
    if not cleaned:
        return None
    try:
        return float(cleaned)
    except ValueError:
        return None


def _parse_acres(text: str) -> Optional[float]:
  patterns = [
      r"([\d.]+)\s*ACRES?\b",
      r"\b([\d.]+)\s*A\b",
  ]
  for pattern in patterns:
      match = re.search(pattern, text, re.IGNORECASE)
      if match:
          try:
              return float(match.group(1))
          except ValueError:
              continue
  return None


def _normalize_city(city: str) -> str:
    return re.sub(r"\s+", " ", city.strip().upper())


def _extract_city(text: str) -> Optional[str]:
    match = re.search(
        r"\bCITY\s+([A-Z][A-Z0-9\s.'/-]+?)(?:\s+SD\b|\s+\d+\s+\d+[NS]\s+\d+[EW]|\s*$)",
        text,
        re.IGNORECASE,
    )
    if match:
        city = match.group(1).strip()
        city = re.sub(r"\s+SD\s+.*$", "", city, flags=re.IGNORECASE)
        return _normalize_city(city)
    return None


def _extract_plss(text: str) -> tuple[Optional[str], Optional[str], Optional[str]]:
    section = township = range_ = None

    verbose = re.search(
        r"SECTION\s+(\d+)[,\s]+TOWNSHIP\s+(\d+)\s*(NORTH|SOUTH)[,\s]+RANGE\s+(\d+)\s*(EAST|WEST)",
        text,
        re.IGNORECASE,
    )
    if verbose:
        section = verbose.group(1)
        twp_dir = "N" if verbose.group(3).upper().startswith("N") else "S"
        rng_dir = "W" if verbose.group(5).upper().startswith("W") else "E"
        township = f"{verbose.group(2)}{twp_dir}"
        range_ = f"{verbose.group(4)}{rng_dir}"
        return section, township, range_

    compact = re.search(
        r"\b(\d{1,2})\s+(\d{1,2})\s*([NS])\s+(\d{1,2})\s*([EW])\b",
        text,
        re.IGNORECASE,
    )
    if compact:
        section = compact.group(1)
        township = f"{compact.group(2)}{compact.group(3).upper()}"
        range_ = f"{compact.group(4)}{compact.group(5).upper()}"

    return section, township, range_


def _extract_lot_block_addition(text: str) -> tuple[Optional[str], Optional[str], Optional[str]]:
    lot = block = addition = None

    lot_match = re.search(r"\bLOTS?\s+([\dA-Z,\s&/-]+?)(?:\s+BLOCK|\s+PLAT|\s+CITY|\s+\d+\s+\d+[NS])", text, re.IGNORECASE)
    if lot_match:
        lot = lot_match.group(1).strip().rstrip(",")

    block_match = re.search(r"\bBLOCK\s+([\dA-Z]+)", text, re.IGNORECASE)
    if block_match:
        block = block_match.group(1).strip()

    addition_match = re.search(
        r"(?:ADDITION|SUB(?:DIVISION)?|PH(?:ASE)?\s*\d+[A-Z]?)\s*(?:CITY|$)",
        text,
        re.IGNORECASE,
    )
    if addition_match:
        start = text[: addition_match.start()]
        add_match = re.search(
            r"([A-Z][A-Z0-9\s.'/-]+?)\s+(?:ADDITION|SUB(?:DIVISION)?|PH(?:ASE)?\s*\d+[A-Z]?)\b",
            start,
            re.IGNORECASE,
        )
        if add_match:
            addition = re.sub(r"\s+", " ", add_match.group(1).strip().upper())
            addition = re.sub(r"^(LOT\s+[\d,\s&/-]+\s+BLOCK\s+[\dA-Z]+\s+)", "", addition, flags=re.IGNORECASE)

    if not addition:
        add_match = re.search(
            r"BLOCK\s+[\dA-Z]+\s+([A-Z][A-Z0-9\s.'/-]+?)\s+ADDITION",
            text,
            re.IGNORECASE,
        )
        if add_match:
            addition = re.sub(r"\s+", " ", add_match.group(1).strip().upper())

    return lot, block, addition


def _classify_building(text: str, city: Optional[str], lot: Optional[str], block: Optional[str], acres: Optional[float]) -> tuple[str, str]:
    upper = text.upper()

    if "MHP" in upper or "MOBILE HOME" in upper:
        return "mobile_home_lot", "Mobile home park lot"

    if city and city not in ("RURAL", "RURBAN") and lot and block:
        return "platted_lot", "Platted city lot (subdivision; structure likely or buildable)"

    if city in ("RURAL", "RURBAN") or re.search(r"\bCITY\s+RURAL\b", upper):
        if acres and acres >= 2:
            return "vacant_land", "Rural acreage (typically unimproved land)"
        return "vacant_land", "Rural parcel (typically vacant or lightly improved)"

    if re.search(r"\b(NE|NW|SE|SW)\s*1/4\b", upper) and not lot:
        return "vacant_land", "PLSS land description without platted lot"

    if lot or block:
        return "platted_lot", "Platted lot"

    return "unknown", "Unable to determine from catalog description"


def _build_geocode_query(city: Optional[str], lot: Optional[str], block: Optional[str], addition: Optional[str]) -> str:
    parts = []
    if lot:
        parts.append(f"Lot {lot}")
    if block:
        parts.append(f"Block {block}")
    if addition:
        parts.append(addition.title())
    if city and city not in ("RURAL", "RURBAN"):
        city_display = city.title().replace("Bella Vista Village", "Bella Vista")
        parts.append(f"{city_display}, AR")
    elif city:
        parts.append("Benton County, AR")
    return ", ".join(parts)


def parse_legal_row(
    sale_number: str,
    owner_name: str,
    legal_description: str,
    interested_parties: str,
    parcel_number: str,
    taxes: str,
) -> ParsedProperty:
    text = legal_description or owner_name or ""
    upper = text.upper()

    if any(marker in upper for marker in CANCELLED_MARKERS) and not parcel_number:
        return ParsedProperty(
            sale_number=sale_number,
            owner_name=owner_name,
            legal_description=legal_description,
            is_cancelled=True,
        )

    acres = _parse_acres(text)
    city = _extract_city(text)
    section, township, range_ = _extract_plss(text)
    lot, block, addition = _extract_lot_block_addition(text)
    building_status, building_detail = _classify_building(text, city, lot, block, acres)

    if lot and block and city and city not in ("RURAL", "RURBAN"):
        location_type = "subdivision"
    elif section and township and range_:
        location_type = "plss"
    elif city:
        location_type = "city"
    else:
        location_type = "unknown"

    return ParsedProperty(
        sale_number=sale_number,
        owner_name=owner_name,
        legal_description=legal_description,
        interested_parties=interested_parties,
        parcel_number=parcel_number,
        taxes_owed=_parse_money(taxes),
        acres=acres,
        city=city,
        section=section,
        township=township,
        range_=range_,
        lot=lot,
        block=block,
        addition=addition,
        building_status=building_status,
        building_detail=building_detail,
        location_type=location_type,
        geocode_query=_build_geocode_query(city, lot, block, addition),
    )


def matches_criteria(
    prop: ParsedProperty,
    city_keywords: list[str],
    min_acres: Optional[float],
    max_acres: Optional[float],
    min_taxes: Optional[float],
    max_taxes: Optional[float],
    building_statuses: list[str],
    search_text: str,
) -> bool:
    if prop.is_cancelled:
        return False

    if city_keywords:
        haystack = " ".join(
            filter(
                None,
                [prop.city, prop.legal_description, prop.owner_name, prop.addition],
            )
        ).upper()
        if not any(kw.upper() in haystack for kw in city_keywords):
            return False

    if min_acres is not None and (prop.acres is None or prop.acres < min_acres):
        return False
    if max_acres is not None and (prop.acres is None or prop.acres > max_acres):
        return False

    if min_taxes is not None and (prop.taxes_owed is None or prop.taxes_owed < min_taxes):
        return False
    if max_taxes is not None and (prop.taxes_owed is None or prop.taxes_owed > max_taxes):
        return False

    if building_statuses and prop.building_status not in building_statuses:
        return False

    if search_text:
        needle = search_text.upper()
        hay = f"{prop.owner_name} {prop.legal_description} {prop.parcel_number}".upper()
        if needle not in hay:
            return False

    return True
