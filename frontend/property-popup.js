function getCoslPropertyUrl(row) {
  return row.cosl_property_url || row.cosl_parcel_url || row.catalog_url || null;
}

function externalLink(url, label) {
  if (!url) return "";
  return `<a href="${url}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation();">${label}</a>`;
}

function propertyPopupLinks(row) {
  const coslUrl = getCoslPropertyUrl(row);
  const links = [];

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
  const coslUrl = getCoslPropertyUrl(row);
  const parts = [];
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
  const coslUrl = getCoslPropertyUrl(row);
  const parcelLabel = row.parcel_number || "—";
  const parcelHtml = coslUrl
    ? externalLink(coslUrl, `Parcel ${parcelLabel}`)
    : `Parcel ${parcelLabel}`;

  return `
    <div class="property-popup">
      <strong>Sale #${row.sale_number || "?"}</strong><br/>
      ${row.owner_name || ""}<br/>
      ${row.city || ""} ${row.addition ? "· " + row.addition : ""}<br/>
      ${parcelHtml}<br/>
      ${acres} acres · ${money}<br/>
      ${labels[row.building_status] || row.building_status}<br/>
      ${row.geocode_label ? `<small>${row.geocode_label}</small><br/>` : ""}
      ${propertyPopupLinks(row)}
    </div>
  `;
}

function bindPropertyPopup(marker, row, buildingLabels) {
  marker.bindPopup(propertyPopupHtml(row, buildingLabels), { maxWidth: 320, minWidth: 220 });
}
