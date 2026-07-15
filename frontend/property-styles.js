const PROPERTY_SOURCE_STYLES = {
  "lotsofbellavista.com": {
    radius: 7,
    color: "#0f766e",
    fillColor: "#14b8a6",
    fillOpacity: 0.9,
    weight: 2,
  },
};

const TAX_SALE_STYLE = {
  radius: 7,
  color: "#7c3aed",
  fillColor: "#8b5cf6",
  fillOpacity: 0.85,
  weight: 2,
};

function isLotsOfBellaVista(row) {
  return row.property_source === "lotsofbellavista.com";
}

function getPropertyMarkerStyle(row, baseStyle) {
  if (row.property_source && PROPERTY_SOURCE_STYLES[row.property_source]) {
    return { ...PROPERTY_SOURCE_STYLES[row.property_source] };
  }
  return baseStyle;
}

function sourceTagHtml(row) {
  if (!row.property_source) return "";
  const label = row.source_label || row.property_source;
  const url = row.source_url;
  const className = row.property_source === "lotsofbellavista.com" ? "source-tag source-tag-lobv" : "source-tag";
  if (url) {
    return `<a class="${className}" href="${url}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation();">${label}</a>`;
  }
  return `<span class="${className}">${label}</span>`;
}

function formatBidMoney(value) {
  if (value == null) return "—";
  return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function mergeCuratedProperties(rows, curatedRows) {
  const existing = new Set(rows.map((row) => row.parcel_number).filter(Boolean));
  const merged = [...rows];
  curatedRows.forEach((row) => {
    if (!row.parcel_number || existing.has(row.parcel_number)) return;
    merged.push(row);
    existing.add(row.parcel_number);
  });
  return merged;
}

async function fetchLotsOfBellaVista(geocode = true) {
  const response = await fetch(`/api/curated/lots-of-bella-vista?geocode=${geocode ? "true" : "false"}`);
  const data = await response.json();
  if (!response.ok) throw new Error(data.detail || "Failed to load Lots of Bella Vista listings");
  return data.properties || [];
}
