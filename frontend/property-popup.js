function getCoslPropertyUrl(row) {
  return row.cosl_property_url || row.cosl_parcel_url || row.catalog_url || null;
}

function getParcelDetailUrl(row) {
  return row.parcel_detail_url || null;
}

function getCountyGisUrl(row) {
  return row.county_gis_url || null;
}

function getPrimaryPropertyUrl(row) {
  return getParcelDetailUrl(row) || getCountyGisUrl(row) || getCoslPropertyUrl(row);
}

function countyGisLabel(row) {
  const county = (row.county || "").replace(/\s+county$/i, "").trim();
  return county ? `${county} County GIS` : "County GIS";
}

function externalLink(url, label) {
  if (!url) return "";
  return `<a href="${url}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation();">${label}</a>`;
}

function propertyPopupLinks(row) {
  const parcelDetailUrl = getParcelDetailUrl(row);
  const countyGisUrl = getCountyGisUrl(row);
  const coslUrl = getCoslPropertyUrl(row);
  const links = [];

  if (parcelDetailUrl) {
    links.push(
      `<a class="popup-btn popup-btn-cosl" href="${parcelDetailUrl}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation();">View parcel details</a>`
    );
  }
  if (countyGisUrl) {
    links.push(
      `<a class="popup-btn popup-btn-cosl" href="${countyGisUrl}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation();">View on ${countyGisLabel(row)}</a>`
    );
  }
  if (coslUrl) {
    links.push(
      `<a class="popup-btn popup-btn-cosl" href="${coslUrl}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation();">View property on COSL</a>`
    );
  }
  if (row.datascout_url) {
    links.push(externalLink(row.datascout_url, "DataScoutPro"));
  }
  if (row.catalog_url && row.catalog_url !== coslUrl) {
    links.push(externalLink(row.catalog_url, "Sale catalog"));
  }

  if (!links.length) return "";
  return `<div class="popup-links">${links.join("")}</div>`;
}

function propertyTableLinks(row) {
  const parcelDetailUrl = getParcelDetailUrl(row);
  const countyGisUrl = getCountyGisUrl(row);
  const coslUrl = getCoslPropertyUrl(row);
  const parts = [];
  if (parcelDetailUrl) {
    parts.push(`<a href="${parcelDetailUrl}" target="_blank" rel="noopener noreferrer">Parcel</a>`);
  }
  if (countyGisUrl) {
    parts.push(`<a href="${countyGisUrl}" target="_blank" rel="noopener noreferrer">GIS</a>`);
  }
  if (coslUrl) {
    parts.push(`<a href="${coslUrl}" target="_blank" rel="noopener noreferrer">COSL</a>`);
  }
  if (row.datascout_url) {
    parts.push(`<a href="${row.datascout_url}" target="_blank" rel="noopener noreferrer">DataScout</a>`);
  }
  return parts.join(" · ") || "—";
}

function propertyPopupHtml(row, buildingLabels) {
  const labels = buildingLabels || {
    platted_lot: "Platted lot",
    vacant_land: "Vacant/rural",
    mobile_home_lot: "Mobile home",
    unknown: "Unknown",
  };
  const money =
    row.taxes_owed == null
      ? "—"
      : `$${row.taxes_owed.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const acres = row.acres == null ? "—" : row.acres.toFixed(2);
  const primaryUrl = getPrimaryPropertyUrl(row);
  const parcelLabel = row.parcel_number || "—";
  const parcelHtml = primaryUrl
    ? externalLink(primaryUrl, `Parcel ${parcelLabel}`)
    : `Parcel ${parcelLabel}`;
  const saveBtn = typeof SavedProperties !== "undefined" ? SavedProperties.saveButtonHtml(row) : "";
  const sourceTag = typeof sourceTagHtml !== "undefined" ? sourceTagHtml(row) : "";
  const title = isLotsOfBellaVista(row)
    ? `Listing #${row.list_number || "?"}`
    : `Sale #${row.sale_number || "?"}`;
  const pricingLine = isLotsOfBellaVista(row)
    ? `Min bid ${formatBidMoney(row.min_bid)} · Appraised ${formatBidMoney(row.appraised_value)}`
    : `${acres} acres · ${money}`;

  return `
    <div class="property-popup">
      ${sourceTag ? `<div class="popup-source">${sourceTag}</div>` : ""}
      <strong>${title}</strong><br/>
      ${row.owner_name || row.legal_description || ""}<br/>
      ${row.city || ""} ${row.addition ? "· " + row.addition : ""}<br/>
      ${parcelHtml}<br/>
      ${pricingLine}<br/>
      ${labels[row.building_status] || row.building_status}<br/>
      ${row.geocode_label ? `<small>${row.geocode_label}</small><br/>` : ""}
      ${saveBtn}
      ${propertyPopupLinks(row)}
    </div>
  `;
}

function bindPropertyPopup(marker, row, buildingLabels, baseStyle) {
  SavedProperties.registerRow(row);
  marker._propertyRow = row;
  marker._buildingLabels = buildingLabels;
  marker._baseStyle = baseStyle;
  marker._propertyId = SavedProperties.getPropertyId(row);
  marker.bindPopup(propertyPopupHtml(row, buildingLabels), { maxWidth: 320, minWidth: 220 });
}

function createPropertyMarker(lat, lon, row, buildingLabels, baseStyle) {
  const resolvedStyle = getPropertyMarkerStyle(row, baseStyle);
  const style = SavedProperties.getMarkerStyle(row, resolvedStyle);
  const marker = L.circleMarker([lat, lon], style);
  bindPropertyPopup(marker, row, buildingLabels, resolvedStyle);
  return marker;
}
