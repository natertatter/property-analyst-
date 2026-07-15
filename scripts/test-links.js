#!/usr/bin/env node
/** Quick integration test: API links + popup/table HTML generation */

const API = process.env.API_URL || "http://localhost:8000";

async function main() {
  const payload = {
    catalog_url:
      "https://cosl.org/Home/CatalogView?county=BENT&saledate=8%2F11%2F2026%2010%3A00%3A00%20AM",
    city_keywords: ["BELLA VISTA"],
    geocode: false,
  };

  const res = await fetch(`${API}/api/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || "analyze failed");

  const props = data.properties || [];
  const withParcel = props.filter((p) => p.parcel_detail_url);
  const withGis = props.filter((p) => p.county_gis_url);
  const withCosl = props.filter((p) => p.cosl_property_url || p.cosl_parcel_url);
  console.log(`API: ${withParcel.length}/${props.length} properties have parcel detail URLs`);

  const lobv = props.filter((p) => p.property_source === "lotsofbellavista.com");
  console.log(`API: ${lobv.length} Lots of Bella Vista listings included`);
  if (lobv.length !== 20) {
    throw new Error(`Expected 20 Lots of Bella Vista listings, got ${lobv.length}`);
  }
  console.log(`API: ${withGis.length}/${props.length} properties have county GIS URLs`);
  console.log(`API: ${withCosl.length}/${props.length} properties have COSL URLs`);

  const catalogProp = props.find((p) => !p.property_source && p.parcel_detail_url);
  if (!catalogProp?.parcel_detail_url) {
    throw new Error("Catalog property missing parcel_detail_url");
  }
  const expectedParcelPrefix = "https://www.arcountydata.com/parcel_sponsor.asp?parcelid=";
  if (!catalogProp.parcel_detail_url.startsWith(expectedParcelPrefix)) {
    throw new Error(`Unexpected parcel detail URL: ${catalogProp.parcel_detail_url}`);
  }
  console.log(`Catalog parcel URL: ${catalogProp.parcel_detail_url}`);

  const fs = require("fs");
  const path = require("path");
  eval(fs.readFileSync(path.join(__dirname, "../frontend/property-styles.js"), "utf8"));
  eval(fs.readFileSync(path.join(__dirname, "../frontend/property-popup.js"), "utf8"));

  const lobv1 = lobv.find((p) => p.list_number === 1);
  if (!lobv1) throw new Error("Missing LOBV listing #1");
  const lobvPopup = propertyPopupHtml(lobv1);
  if (!lobvPopup.includes("lotsofbellavista.com") && !lobvPopup.includes("Lots of Bella Vista")) {
    throw new Error("LOBV popup missing source tag");
  }

  const tableHtml = propertyTableLinks(catalogProp);
  const popupHtml = propertyPopupHtml(catalogProp);
  if (!tableHtml.includes("Parcel")) throw new Error("Table links missing Parcel anchor");
  if (!tableHtml.includes("arcountydata.com")) {
    throw new Error("Table links missing ARCountyData href");
  }
  if (!popupHtml.includes("View parcel details")) {
    throw new Error("Popup missing parcel details button");
  }
  if (!popupHtml.includes(expectedParcelPrefix)) throw new Error("Popup missing ARCountyData href");

  const staticRes = await fetch(`${API}/static/property-popup.js?v=7`);
  if (!staticRes.ok) throw new Error("property-popup.js not served");
  const appRes = await fetch(`${API}/static/app.js?v=5`);
  const appJs = await appRes.text();
  if (appRes.status !== 200) throw new Error("app.js not served");
  if (appJs.includes("function renderMap(rows) {\n  if (confidence")) {
    throw new Error("app.js still contains corrupted renderMap");
  }
  if (!appJs.includes("function jitterCoordinates")) {
    throw new Error("app.js missing jitterCoordinates");
  }

  console.log("All link integration checks passed.");
}

main().catch((err) => {
  console.error("FAILED:", err.message);
  process.exit(1);
});
