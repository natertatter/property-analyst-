#!/usr/bin/env node
/** Quick integration test: API links + popup/table HTML generation */

const API = process.env.API_URL || "http://localhost:8000";

async function main() {
  const payload = {
    catalog_url:
      "https://cosl.org/Home/CatalogView?county=BENT&saledate=8%2F11%2F2026%2010%3A00%3A00%20AM",
    city_keywords: ["BELLA VISTA"],
    geocode: true,
  };

  const res = await fetch(`${API}/api/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || "analyze failed");

  const props = data.properties || [];
  const withCosl = props.filter((p) => p.cosl_property_url || p.cosl_parcel_url);
  console.log(`API: ${withCosl.length}/${props.length} properties have COSL URLs`);

  const sale3940 = props.find((p) => p.sale_number === "3940");
  if (!sale3940?.cosl_property_url) {
    throw new Error("Sale #3940 missing cosl_property_url");
  }
  console.log(`Sale #3940 COSL URL: ${sale3940.cosl_property_url}`);

  const fs = require("fs");
  const path = require("path");
  eval(fs.readFileSync(path.join(__dirname, "../frontend/property-popup.js"), "utf8"));

  const tableHtml = propertyTableLinks(sale3940);
  const popupHtml = propertyPopupHtml(sale3940);
  if (!tableHtml.includes("COSL")) throw new Error("Table links missing COSL anchor");
  if (!popupHtml.includes("View property on COSL")) throw new Error("Popup missing COSL button");
  if (!popupHtml.includes("WebParcels/GetParcel/829778")) throw new Error("Popup missing COSL href");

  const staticRes = await fetch(`${API}/static/property-popup.js?v=3`);
  if (!staticRes.ok) throw new Error("property-popup.js not served");
  const appRes = await fetch(`${API}/static/app.js?v=3`);
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
