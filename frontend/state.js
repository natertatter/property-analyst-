const stateMap = L.map("state-map").setView([34.75, -92.5], 7);
window.stateMap = stateMap;
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: "&copy; OpenStreetMap contributors",
}).addTo(stateMap);

let stateMarkers = L.layerGroup().addTo(stateMap);
let stateParcels = L.layerGroup().addTo(stateMap);
let stateRows = [];
let stateAllRows = [];
let parcelRows = [];
let drilledCounty = null;
let parcelSortBy = "sale_number";
let parcelSortDir = "asc";

const PARCEL_SORT_FIELDS = {
  sale_number: { key: "sale_number", type: "number" },
  owner_name: { key: "owner_name", type: "string" },
  city: { key: "city", type: "string" },
  acres: { key: "acres", type: "number" },
  taxes_owed: { key: "taxes_owed", type: "number" },
  min_bid: { key: "min_bid", type: "number" },
  building_status: { key: "building_status", type: "string" },
  parcel_number: { key: "parcel_number", type: "string" },
  property_source: { key: "property_source", type: "string" },
  list_number: { key: "list_number", type: "number" },
};

const BUILDING_LABELS = {
  platted_lot: "Platted lot",
  vacant_land: "Vacant/rural",
  mobile_home_lot: "Mobile home",
  unknown: "Unknown",
};

function formatMoney(value) {
  if (value == null) return "—";
  return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatAcres(value) {
  if (value == null) return "—";
  return value.toFixed(2);
}

function splitKeywords(id) {
  return document
    .getElementById(id)
    .value.split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function setStateStatus(message, isError = false) {
  const el = document.getElementById("state-status");
  el.textContent = message;
  el.classList.toggle("error", isError);
}

function getUniqueCounties(rows) {
  return [...new Set(rows.map((r) => r.county))];
}

function shouldShowParcels(rows) {
  if (!document.getElementById("state-show-parcels").checked) return false;
  const counties = getUniqueCounties(rows);
  return counties.length === 1 || drilledCounty != null;
}

function getParcelTargetCounty(rows) {
  if (drilledCounty) return drilledCounty;
  const counties = getUniqueCounties(rows);
  return counties.length === 1 ? counties[0] : null;
}

function compareSortValues(a, b, type, reverse) {
  if (type === "number") {
    const aMissing = a == null;
    const bMissing = b == null;
    if (aMissing && bMissing) return 0;
    if (aMissing) return reverse ? -1 : 1;
    if (bMissing) return reverse ? 1 : -1;
    const av = Number(a);
    const bv = Number(b);
    return reverse ? bv - av : av - bv;
  }
  const av = String(a ?? "");
  const bv = String(b ?? "");
  return reverse ? bv.localeCompare(av) : av.localeCompare(bv);
}

function sortParcelRows(rows) {
  const config = PARCEL_SORT_FIELDS[parcelSortBy];
  if (!config) return rows;
  const reverse = parcelSortDir === "desc";
  return [...rows].sort((a, b) => {
    let av = a[config.key];
    let bv = b[config.key];
    if (parcelSortBy === "taxes_owed") {
      av = a.taxes_owed ?? a.min_bid;
      bv = b.taxes_owed ?? b.min_bid;
    }
    return compareSortValues(av, bv, config.type, reverse);
  });
}

function markSortedHeaders(thead, sortBy, sortDir) {
  thead.querySelectorAll("th[data-sort]").forEach((th) => {
    th.classList.remove("sorted-asc", "sorted-desc");
    if (th.dataset.sort === sortBy) {
      th.classList.add(sortDir === "desc" ? "sorted-desc" : "sorted-asc");
    }
  });
}

function bindSortableHeaders(thead, mode) {
  thead.querySelectorAll("th[data-sort]").forEach((th) => {
    th.addEventListener("click", () => {
      const column = th.dataset.sort;
      if (mode === "parcels") {
        if (parcelSortBy === column) {
          parcelSortDir = parcelSortDir === "asc" ? "desc" : "asc";
        } else {
          parcelSortBy = column;
          parcelSortDir = "asc";
        }
        markSortedHeaders(thead, parcelSortBy, parcelSortDir);
        renderStateTable(stateRows);
        return;
      }

      const sortByEl = document.getElementById("state-sort-by");
      const sortDirEl = document.getElementById("state-sort-dir");
      if (sortByEl.value === column) {
        sortDirEl.value = sortDirEl.value === "asc" ? "desc" : "asc";
      } else {
        sortByEl.value = column;
        sortDirEl.value = "asc";
      }
      refreshStateView();
    });
  });
}

function applyClientFilters(rows) {
  const countyKw = splitKeywords("state-county-kw");
  const cityKw = splitKeywords("state-city-kw");
  const locationKw = splitKeywords("state-location-kw");
  const search = document.getElementById("state-search").value.trim().toUpperCase();
  const focusCounty = document.getElementById("state-focus-county").value;

  let filtered = rows;

  if (countyKw.length) {
    filtered = filtered.filter((r) => countyKw.some((kw) => r.county.includes(kw.toUpperCase())));
  }
  if (cityKw.length) {
    filtered = filtered.filter((r) => cityKw.some((kw) => r.auction_city.includes(kw.toUpperCase())));
  }
  if (locationKw.length) {
    filtered = filtered.filter((r) => locationKw.some((kw) => r.location.toUpperCase().includes(kw.toUpperCase())));
  }
  if (search) {
    filtered = filtered.filter((r) => r.search_text.includes(search));
  }
  if (focusCounty) {
    filtered = filtered.filter((r) => r.county === focusCounty);
  }

  const sortBy = document.getElementById("state-sort-by").value;
  const sortDir = document.getElementById("state-sort-dir").value;
  const reverse = sortDir === "desc";
  filtered.sort((a, b) => {
    const av = a[sortBy === "city" ? "auction_city" : sortBy === "sale_date" ? "sale_date_sort" : sortBy] || "";
    const bv = b[sortBy === "city" ? "auction_city" : sortBy === "sale_date" ? "sale_date_sort" : sortBy] || "";
    return reverse ? bv.localeCompare(av) : av.localeCompare(bv);
  });

  return filtered;
}

function populateCountySelect(rows) {
  const select = document.getElementById("state-focus-county");
  const current = select.value;
  const counties = [...new Set(rows.map((r) => r.county))].sort();
  select.innerHTML = '<option value="">All counties</option>';
  counties.forEach((county) => {
    const opt = document.createElement("option");
    opt.value = county;
    opt.textContent = county;
    select.appendChild(opt);
  });
  if (counties.includes(current)) select.value = current;
}

function renderStateSummary(rows) {
  const panel = document.getElementById("state-summary");
  panel.hidden = false;
  const parcelNote =
    parcelRows.length > 0
      ? `<div class="summary-card"><span>Parcels on map</span><strong>${parcelRows.length}</strong></div>`
      : "";
  panel.innerHTML = `
    <div class="summary-card"><span>Matched entries</span><strong>${rows.length}</strong></div>
    <div class="summary-card"><span>Counties</span><strong>${getUniqueCounties(rows).length}</strong></div>
    <div class="summary-card"><span>Sale dates</span><strong>${new Set(rows.map((r) => r.sale_date)).size}</strong></div>
    ${parcelNote}
    <div class="summary-card"><span>Saved</span><strong>${SavedProperties.count()}</strong></div>
  `;
}

function statePopupCounty(county, items) {
  const lines = items
    .slice(0, 6)
    .map((r) => `<li>${r.sale_date} — ${r.auction_city}</li>`)
    .join("");
  const more = items.length > 6 ? `<li>…and ${items.length - 6} more</li>` : "";
  return `
    <strong>${county}</strong> (${items.length} sale${items.length === 1 ? "" : "s"})
    <ul>${lines}${more}</ul>
    <button type="button" class="popup-btn" onclick="window.drillIntoCounty('${county.replace(/'/g, "\\'")}')">Show parcels on map</button>
  `;
}

function renderCountyMarkers(rows) {
  const byCounty = {};
  rows.forEach((row) => {
    if (!byCounty[row.county]) byCounty[row.county] = [];
    byCounty[row.county].push(row);
  });

  const bounds = [];
  Object.entries(byCounty).forEach(([county, items]) => {
    const lat = items[0].county_lat;
    const lon = items[0].county_lon;
    if (lat == null || lon == null) return;
    const radius = Math.min(18, 6 + items.length * 2);
    const marker = L.circleMarker([lat, lon], {
      radius,
      color: drilledCounty === county ? "#047857" : "#1d4ed8",
      fillColor: drilledCounty === county ? "#10b981" : "#2563eb",
      fillOpacity: 0.7,
      weight: 2,
    }).bindPopup(statePopupCounty(county, items));
    marker.on("click", () => drillIntoCounty(county));
    stateMarkers.addLayer(marker);
    bounds.push([lat, lon]);
  });

  return bounds;
}

function filterParcelRows(rows) {
  if (!document.getElementById("state-saved-only").checked) return rows;
  return rows.filter((row) => SavedProperties.isSaved(row));
}

function renderParcelMarkers(rows) {
  const bounds = [];
  const displayRows = filterParcelRows(rows);
  displayRows.forEach((row) => {
    if (row.lat == null || row.lon == null) return;
    const baseStyle = getPropertyMarkerStyle(row, {
      radius: 5,
      color: "#7c3aed",
      fillColor: "#8b5cf6",
      fillOpacity: 0.85,
      weight: 1,
    });
    const marker = createPropertyMarker(row.lat, row.lon, row, BUILDING_LABELS, baseStyle);
    stateParcels.addLayer(marker);
    bounds.push([row.lat, row.lon]);
  });
  return bounds;
}

function renderStateMap(rows) {
  stateMarkers.clearLayers();
  stateParcels.clearLayers();

  const showParcels = shouldShowParcels(rows);
  const bounds = [];

  if (showParcels && parcelRows.length) {
    bounds.push(...renderParcelMarkers(parcelRows));
    const target = getParcelTargetCounty(rows);
    const countyRows = rows.filter((r) => r.county === target);
    if (countyRows.length) {
      const lat = countyRows[0].county_lat;
      const lon = countyRows[0].county_lon;
      if (lat != null && lon != null) bounds.push([lat, lon]);
    }
    if (bounds.length) {
      stateMap.fitBounds(bounds, { padding: [40, 40], maxZoom: 13 });
    }
    return;
  }

  bounds.push(...renderCountyMarkers(rows));
  if (bounds.length) {
    stateMap.fitBounds(bounds, { padding: [40, 40], maxZoom: drilledCounty ? 10 : 8 });
  } else {
    stateMap.setView([34.75, -92.5], 7);
  }
}

function updateDrillControls(rows) {
  const backBtn = document.getElementById("state-back-btn");
  const target = getParcelTargetCounty(rows);
  backBtn.hidden = !drilledCounty;
  document.getElementById("state-map-title").textContent = target
    ? `Geo View — ${target} County Parcels`
    : "Geo View — Arkansas";
}

async function loadCountyParcels(rows) {
  const target = getParcelTargetCounty(rows);
  if (!target || !shouldShowParcels(rows)) {
    parcelRows = [];
    return;
  }

  const countyRows = rows.filter((r) => r.county === target);
  const catalogUrls = [...new Set(countyRows.map((r) => r.catalog_url))];
  const propertyAreaKw = splitKeywords("state-property-kw");
  const searchText = document.getElementById("state-search").value.trim();

  setStateStatus(`Loading parcels for ${target} County…`);
  parcelRows = [];

  try {
    for (const catalogUrl of catalogUrls) {
      const params = new URLSearchParams({ catalog_url: catalogUrl, geocode: "true" });
      if (propertyAreaKw.length) params.set("city_keywords", propertyAreaKw.join(","));
      if (searchText) params.set("search_text", searchText);

      const response = await fetch(`/api/catalog/map?${params}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Failed to load parcels");
      parcelRows.push(...(data.properties || []));
    }

    if (target.includes("BENTON")) {
      try {
        const curated = await fetchLotsOfBellaVista(true);
        parcelRows = mergeCuratedProperties(parcelRows, curated);
      } catch (error) {
        console.warn("Could not load Lots of Bella Vista listings:", error);
      }
    }

    const mapped = parcelRows.filter((p) => p.lat != null).length;
    setStateStatus(`${target} County: ${parcelRows.length} parcels loaded, ${mapped} on map.`);
  } catch (error) {
    parcelRows = [];
    setStateStatus(error.message, true);
  }
}

async function drillIntoCounty(county) {
  drilledCounty = county;
  document.getElementById("state-focus-county").value = county;
  document.getElementById("state-show-parcels").checked = true;
  document.getElementById("state-county-kw").value = county;
  await refreshStateView();
}

window.drillIntoCounty = drillIntoCounty;

function exitCountyDrill() {
  drilledCounty = null;
  document.getElementById("state-focus-county").value = "";
  document.getElementById("state-county-kw").value = "";
  parcelRows = [];
  refreshStateView();
}

function openCatalogAnalyzer(catalogUrl) {
  document.getElementById("catalog-url").value = catalogUrl;
  document.getElementById("tab-catalog").click();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function setStateTableMode(mode) {
  const thead = document.querySelector("#state-table thead tr");
  if (mode === "parcels") {
    thead.innerHTML = `
      <th></th>
      <th data-sort="sale_number">Sale #</th>
      <th data-sort="owner_name">Owner</th>
      <th data-sort="city">City</th>
      <th data-sort="acres">Acres</th>
      <th data-sort="taxes_owed">Taxes / Bid</th>
      <th data-sort="building_status">Building</th>
      <th data-sort="parcel_number">Parcel</th>
      <th data-sort="property_source">Source</th>
      <th>Links</th>
    `;
    document.getElementById("state-table-caption").textContent = "Parcels in county";
    markSortedHeaders(thead, parcelSortBy, parcelSortDir);
    bindSortableHeaders(thead, "parcels");
    return;
  }
  thead.innerHTML = `
    <th data-sort="sale_date">Sale Date</th>
    <th data-sort="county">County</th>
    <th data-sort="city">Auction City</th>
    <th data-sort="location">Venue</th>
    <th>Actions</th>
  `;
  document.getElementById("state-table-caption").textContent = "County sales";
  const sortBy = document.getElementById("state-sort-by").value;
  const sortDir = document.getElementById("state-sort-dir").value;
  markSortedHeaders(thead, sortBy, sortDir);
  bindSortableHeaders(thead, "counties");
}

function renderStateTable(rows) {
  const tbody = document.querySelector("#state-table tbody");
  document.getElementById("state-result-count").textContent = `(${rows.length})`;
  tbody.innerHTML = "";

  const isParcelView = parcelRows.length > 0 && shouldShowParcels(rows);
  setStateTableMode(isParcelView ? "parcels" : "counties");

  if (isParcelView) {
    const displayRows = sortParcelRows(filterParcelRows(parcelRows));
    displayRows.forEach((row) => {
      const tr = document.createElement("tr");
      if (SavedProperties.isSaved(row)) tr.classList.add("saved-row");
      if (isLotsOfBellaVista(row)) tr.classList.add("lobv-row");
    tr.innerHTML = `
      <td class="pin-cell">${SavedProperties.tablePinButton(row)}</td>
      <td>${isLotsOfBellaVista(row) ? row.list_number || "" : row.sale_number || ""}</td>
      <td>${row.owner_name || row.legal_description || ""}</td>
      <td>${row.city || ""}</td>
      <td>${formatAcres(row.acres)}</td>
      <td>${isLotsOfBellaVista(row) ? formatBidMoney(row.min_bid) : formatMoney(row.taxes_owed)}</td>
      <td>${BUILDING_LABELS[row.building_status] || row.building_status}</td>
      <td>${row.parcel_number || ""}</td>
      <td>${sourceTagHtml(row) || "Tax sale"}</td>
      <td class="actions link-cell">${propertyTableLinks(row)}</td>
    `;
      SavedProperties.bindTablePinButtons(tr);
      tr.querySelectorAll("a").forEach((link) => {
        link.addEventListener("click", (event) => event.stopPropagation());
      });
      tr.addEventListener("click", () => {
        if (row.lat != null && row.lon != null) {
          stateMap.setView([row.lat, row.lon], 15);
        }
      });
      tbody.appendChild(tr);
    });
    document.getElementById("state-result-count").textContent = `(${displayRows.length})`;
    return;
  }

  rows.forEach((row) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${row.sale_date}</td>
      <td>${row.county}</td>
      <td>${row.auction_city}</td>
      <td>${row.location}</td>
      <td class="actions">
        <button type="button" class="btn-link" data-action="parcels">Parcels</button>
        <button type="button" class="btn-link" data-action="catalog">Catalog</button>
      </td>
    `;

    tr.addEventListener("click", (event) => {
      if (event.target.closest("button")) return;
      drillIntoCounty(row.county);
    });

    tr.querySelector('[data-action="parcels"]')?.addEventListener("click", (event) => {
      event.stopPropagation();
      drillIntoCounty(row.county);
    });
    tr.querySelector('[data-action="catalog"]')?.addEventListener("click", (event) => {
      event.stopPropagation();
      openCatalogAnalyzer(row.catalog_url);
    });

    tbody.appendChild(tr);
  });
}

async function refreshStateView() {
  stateRows = applyClientFilters(stateAllRows);
  const counties = getUniqueCounties(stateRows);

  if (counties.length === 1 && !drilledCounty) {
    drilledCounty = counties[0];
    document.getElementById("state-show-parcels").checked = true;
  }

  if (shouldShowParcels(stateRows)) {
    await loadCountyParcels(stateRows);
  } else {
    parcelRows = [];
    if (!drilledCounty) {
      setStateStatus(`Showing ${stateRows.length} of ${stateAllRows.length} county sale entries. Click a county to view parcels.`);
    }
  }

  updateDrillControls(stateRows);
  renderStateSummary(stateRows);
  renderStateTable(stateRows);
  renderStateMap(stateRows);
}

async function loadStateContents(event) {
  if (event) event.preventDefault();
  const button = document.getElementById("state-submit-btn");
  button.disabled = true;
  drilledCounty = null;
  parcelRows = [];
  setStateStatus("Loading state auction calendar…");

  try {
    const url = document.getElementById("contents-url").value.trim();
    const response = await fetch(`/api/contents?url=${encodeURIComponent(url)}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || "Failed to load contents");

    stateAllRows = data.entries || [];
    populateCountySelect(stateAllRows);
    await refreshStateView();
  } catch (error) {
    setStateStatus(error.message, true);
  } finally {
    button.disabled = false;
  }
}

document.getElementById("state-form").addEventListener("submit", loadStateContents);
document.getElementById("state-back-btn").addEventListener("click", exitCountyDrill);
document.getElementById("state-show-parcels").addEventListener("change", () => refreshStateView());
document.getElementById("state-saved-only").addEventListener("change", () => {
  if (parcelRows.length || stateRows.length) refreshStateView();
});

document.addEventListener("saved-properties-changed", () => {
  if (!parcelRows.length && !stateRows.length) return;
  renderStateTable(stateRows);
  if (document.getElementById("state-saved-only").checked) {
    renderStateMap(stateRows);
  } else {
    SavedProperties.refreshMarkerStyles(stateParcels);
    SavedProperties.refreshOpenPopups();
  }
});

document.getElementById("state-focus-county").addEventListener("change", async (event) => {
  drilledCounty = event.target.value || null;
  await refreshStateView();
});

let filterTimer;
["state-county-kw", "state-city-kw", "state-location-kw", "state-search", "state-property-kw"].forEach((id) => {
  document.getElementById(id).addEventListener("input", () => {
    clearTimeout(filterTimer);
    filterTimer = setTimeout(async () => {
      if (!stateAllRows.length) return;
      const counties = getUniqueCounties(applyClientFilters(stateAllRows));
      if (counties.length !== 1) drilledCounty = null;
      await refreshStateView();
    }, 400);
  });
});

["state-sort-by", "state-sort-dir"].forEach((id) => {
  document.getElementById(id).addEventListener("change", () => {
    if (stateAllRows.length) refreshStateView();
  });
});

document.getElementById("tab-state").addEventListener("click", () => {
  setTimeout(() => stateMap.invalidateSize(), 100);
});

window.addEventListener("load", () => {
  loadStateContents();
});
