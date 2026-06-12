function propertyPopupLinks(row) {
  const links = [];
  if (row.datascout_url) {
    links.push(
      `<a href="${row.datascout_url}" target="_blank" rel="noopener noreferrer">DataScoutPro property page</a>`
    );
  }
  if (row.cosl_parcel_url) {
    links.push(
      `<a href="${row.cosl_parcel_url}" target="_blank" rel="noopener noreferrer">COSL parcel details</a>`
    );
  }
  if (row.catalog_url) {
    links.push(
      `<a href="${row.catalog_url}" target="_blank" rel="noopener noreferrer">Sale catalog</a>`
    );
  }
  if (!links.length) return "";
  return `<div class="popup-links">${links.join(" · ")}</div>`;
}

function propertyTableLinks(row) {
  const parts = [];
  if (row.datascout_url) {
    parts.push(`<a href="${row.datascout_url}" target="_blank" rel="noopener noreferrer">DataScout</a>`);
  }
  if (row.cosl_parcel_url) {
    parts.push(`<a href="${row.cosl_parcel_url}" target="_blank" rel="noopener noreferrer">COSL</a>`);
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

  return `
    <strong>Sale #${row.sale_number || "?"}</strong><br/>
    ${row.owner_name || ""}<br/>
    ${row.city || ""} ${row.addition ? "· " + row.addition : ""}<br/>
    Parcel ${row.parcel_number || "—"}<br/>
    ${acres} acres · ${money}<br/>
    ${labels[row.building_status] || row.building_status}<br/>
    ${row.geocode_label ? `<small>${row.geocode_label}</small><br/>` : ""}
    ${propertyPopupLinks(row)}
  `;
}
