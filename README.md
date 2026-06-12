# Tax Sale Property Analyzer

Prototype web app for analyzing Arkansas Commissioner of State Lands (COSL) tax delinquency sale catalogs. Paste a catalog URL, set filters (city, acres, taxes, land type), and view matched properties on a map.

## Features

- Scrapes COSL tax sale catalog pages (addresses and PLSS legal descriptions)
- Filters by city/area keywords, acreage, taxes owed, and estimated building/land type
- Maps properties using address geocoding, PLSS section centroids (Arkansas GIS), or city-center fallback
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
