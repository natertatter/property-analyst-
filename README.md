# Tax Sale Property Analyzer

Prototype web app for analyzing Arkansas Commissioner of State Lands (COSL) tax delinquency sale catalogs. Paste a catalog URL, set filters (city, acres, taxes, land type), and view matched properties on a map.

## Features

### State Overview
- Loads the [COSL Contents](https://cosl.org/Home/Contents) page — all Arkansas county tax sales
- Filter and sort by county, auction city, venue, or any keyword
- **Geo view**: entire state (county markers sized by sale count) or county focus (auction locations)
- Click **Catalog** on any row to jump to parcel-level analysis for that county

### Catalog Analyzer
- Scrapes individual county catalog pages (addresses and PLSS legal descriptions)
- Filters by city/area keywords, acreage, taxes owed, and estimated building/land type
- Maps properties using PLSS section centroids (Arkansas GIS) or address geocoding
- Responsive layout for desktop and mobile

## Quick start

```bash
chmod +x run.sh
./run.sh
```

Open http://localhost:8000

### Default example

The app loads with the Benton County 8/11/2026 catalog and Bella Vista filters pre-filled.

## Building / land classification (heuristic)

Catalog data does not state whether a structure exists. The prototype estimates:

| Status | Meaning |
|--------|---------|
| `platted_lot` | Lot/block in a city subdivision — likely buildable or improved |
| `vacant_land` | Rural / PLSS acreage without platted lot |
| `mobile_home_lot` | Mobile home park lot |
| `unknown` | Could not classify |

## API

`GET /api/contents?url=...` — fetch and parse the state Contents page

`POST /api/contents/filter` — server-side filter/sort of contents entries

`POST /api/analyze` with JSON body:

```json
{
  "catalog_url": "https://cosl.org/Home/CatalogView?county=BENT&saledate=...",
  "city_keywords": ["BELLA VISTA", "BELLA VISTA VILLAGE"],
  "min_acres": null,
  "max_acres": null,
  "min_taxes": null,
  "max_taxes": null,
  "building_statuses": [],
  "search_text": "",
  "geocode": true
}
```

## Notes

- Geocoding uses OpenStreetMap Nominatim (rate-limited) and Arkansas GIS PLSS sections.
- PLSS points are section centroids, not exact parcel boundaries.
- This is a prototype; verify all legal descriptions and locations before making decisions.
