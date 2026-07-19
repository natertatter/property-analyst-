const PROPERTY_SOURCE_STYLES = {
  "lotsofbellavista.com": {
    radius: 7,
    color: "#0f766e",
    fillColor: "#14b8a6",
    fillOpacity: 0.9,
    weight: 2,
  },
  reddit_seller: {
    radius: 7,
    color: "#c2410c",
    fillColor: "#f97316",
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

function isCuratedListing(row) {
  return Boolean(row.property_source);
}

function isLotsOfBellaVista(row) {
  return row.property_source === "lotsofbellavista.com";
}

function isRedditSellerLot(row) {
  return row.property_source === "reddit_seller";
}

function getPropertyMarkerStyle(row, baseStyle) {
  if (row.property_source && PROPERTY_SOURCE_STYLES[row.property_source]) {
    return { ...PROPERTY_SOURCE_STYLES[row.property_source] };
  }
  return baseStyle;
}

function sourceTagClass(row) {
  if (isLotsOfBellaVista(row)) return "source-tag source-tag-lobv";
  if (isRedditSellerLot(row)) return "source-tag source-tag-reddit";
  return "source-tag";
}

function sourceTagHtml(row) {
  if (!row.property_source) return "";
  const label = row.source_label || row.property_source;
  const url = row.source_url;
  const className = sourceTagClass(row);
  if (url) {
    return `<a class="${className}" href="${url}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation();">${label}</a>`;
  }
  return `<span class="${className}">${label}</span>`;
}

function curatedListPrice(row) {
  return row.asking_price ?? row.min_bid;
}

function formatBidMoney(value) {
  if (value == null) return "—";
  return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function curatedPricingLine(row) {
  const acres = row.acres == null ? "—" : row.acres.toFixed(2);
  if (isLotsOfBellaVista(row)) {
    return `Min bid ${formatBidMoney(row.min_bid)} · Appraised ${formatBidMoney(row.appraised_value)}`;
  }
  const price = formatBidMoney(curatedListPrice(row));
  const notes = row.listing_notes ? ` · ${row.listing_notes}` : "";
  return `${acres} acres · ${price}${notes}`;
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

async function fetchRedditSellerLots(geocode = true) {
  const response = await fetch(`/api/curated/reddit-seller-lots?geocode=${geocode ? "true" : "false"}`);
  const data = await response.json();
  if (!response.ok) throw new Error(data.detail || "Failed to load Reddit seller lots");
  return data.properties || [];
}

async function fetchAllCuratedListings(geocode = true) {
  const [lobv, reddit] = await Promise.all([
    fetchLotsOfBellaVista(geocode),
    fetchRedditSellerLots(geocode),
  ]);
  return [...lobv, ...reddit];
}
