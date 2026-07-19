"""ARCountyData.com parcel detail deep links."""

from __future__ import annotations

from urllib.parse import quote

from county_geocoder import normalize_county_key

ARCD_BASE = "https://www.arcountydata.com/parcel_sponsor.asp"

# Counties served by ARCountyData.com (display names as used in parcel_sponsor.asp).
ARCD_COUNTY_NAMES: dict[str, str] = {
    "ARKANSAS": "Arkansas",
    "BAXTER": "Baxter",
    "BENTON": "Benton",
    "BOONE": "Boone",
    "BRADLEY": "Bradley",
    "CALHOUN": "Calhoun",
    "CARROLL": "Carroll",
    "CHICOT": "Chicot",
    "CLARK": "Clark",
    "CLAY": "Clay",
    "CLEBURNE": "Cleburne",
    "CLEVELAND": "Cleveland",
    "COLUMBIA": "Columbia",
    "CRAIGHEAD": "Craighead",
    "CRAWFORD": "Crawford",
    "CRITTENDEN": "Crittenden",
    "DALLAS": "Dallas",
    "DESHA": "Desha",
    "FAULKNER": "Faulkner",
    "FULTON": "Fulton",
    "GRANT": "Grant",
    "GREENE": "Greene",
    "HEMPSTEAD": "Hempstead",
    "HOTSPRING": "Hot Spring",
    "HOWARD": "Howard",
    "JACKSON": "Jackson",
    "JEFFERSON": "Jefferson",
    "JOHNSON": "Johnson",
    "LAFAYETTE": "Lafayette",
    "LAWRENCE": "Lawrence",
    "LEE": "Lee",
    "LITTLERIVER": "Little River",
    "LOGAN": "Logan",
    "LONOKE": "Lonoke",
    "MARION": "Marion",
    "MILLER": "Miller",
    "MISSISSIPPI": "Mississippi",
    "MONROE": "Monroe",
    "MONTGOMERY": "Montgomery",
    "NEVADA": "Nevada",
    "NEWTON": "Newton",
    "OUACHITA": "Ouachita",
    "PERRY": "Perry",
    "PHILLIPS": "Phillips",
    "PIKE": "Pike",
    "POINSETT": "Poinsett",
    "POLK": "Polk",
    "POPE": "Pope",
    "PRAIRIE": "Prairie",
    "PULASKI": "Pulaski",
    "SALINE": "Saline",
    "SCOTT": "Scott",
    "SEARCY": "Searcy",
    "SEBASTIAN": "Sebastian",
    "SHARP": "Sharp",
    "STFRANCIS": "St. Francis",
    "STONE": "Stone",
    "UNION": "Union",
    "VANBUREN": "Van Buren",
    "WHITE": "White",
    "WOODRUFF": "Woodruff",
    "YELL": "Yell",
}


def get_parcel_detail_url(county: str | None, parcel_number: str | None) -> str | None:
    """Build an ARCountyData parcel detail URL from county and parcel id."""
    parcel = (parcel_number or "").strip()
    if not county or not parcel:
        return None

    county_key = normalize_county_key(county)
    county_name = ARCD_COUNTY_NAMES.get(county_key)
    if not county_name:
        return None

    params = {
        "parcelid": parcel,
        "county": county_name,
        "AISGIS": county_name,
    }
    query = "&".join(f"{key}={quote(value)}" for key, value in params.items())
    return f"{ARCD_BASE}?{query}"
