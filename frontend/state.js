const stateMap = L.map("state-map").setView([34.75, -92.5], 7);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: "&copy; OpenStreetMap contributors",
}).addTo(stateMap);

let stateMarkers = L.layerGroup().addTo(stateMap);
let stateRows = [];
let stateAllRows = [];

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
  panel.innerHTML = `
    <div class="summary-card"><span>Matched entries</span><strong>${rows.length}</strong></div>
    <div class="summary-card"><span>Counties</span><strong>${new Set(rows.map((r) => r.county)).size}</strong></div>
    <div class="summary-card"><span>Sale dates</span><strong>${new Set(rows.map((r) => r.sale_date)).size}</strong></div>
  `;
}

function statePopupCounty(county, items) {
  const lines = items
    .slice(0, 6)
    .map((r) => `<li>${r.sale_date} — ${r.auction_city}</li>`)
    .join("");
  const more = items.length > 6 ? `<li>…and ${items.length - 6} more</li>` : "";
  return `<strong>${county}</strong> (${items.length} sale${items.length === 1 ? "" : "s"})<ul>${lines}${more}</ul>`;
}

function statePopupEntry(row) {
  return `
    <strong>${row.county}</strong><br/>
    ${row.sale_date}<br/>
    ${row.auction_city}<br/>
    <small>${row.location}</small>
  `;
}

function renderStateMap(rows) {
  stateMarkers.clearLayers();
  const geoLevel = document.getElementById("state-geo-level").value;
  const bounds = [];

  if (geoLevel === "state") {
    const byCounty = {};
    rows.forEach((row) => {
      if (!byCounty[row.county]) byCounty[row.county] = [];
      byCounty[row.county].push(row);
    });

    Object.entries(byCounty).forEach(([county, items]) => {
      const lat = items[0].county_lat;
      const lon = items[0].county_lon;
      if (lat == null || lon == null) return;
      const radius = Math.min(18, 6 + items.length * 2);
      const marker = L.circleMarker([lat, lon], {
        radius,
        color: "#1d4ed8",
        fillColor: "#2563eb",
        fillOpacity: 0.7,
        weight: 2,
      }).bindPopup(statePopupCounty(county, items));
      stateMarkers.addLayer(marker);
      bounds.push([lat, lon]);
    });

    if (bounds.length) {
      stateMap.fitBounds(bounds, { padding: [40, 40], maxZoom: 8 });
    } else {
      stateMap.setView([34.75, -92.5], 7);
    }
    return;
  }

  rows.forEach((row, index) => {
    const lat = row.lat ?? row.county_lat;
    const lon = row.lon ?? row.county_lon;
    if (lat == null || lon == null) return;
    const angle = (index * 137.5 * Math.PI) / 180;
    const jlat = lat + Math.sin(angle) * 0.05;
    const jlon = lon + Math.cos(angle) * 0.05;
    const marker = L.circleMarker([jlat, jlon], {
      radius: 8,
      color: "#047857",
      fillColor: "#10b981",
      fillOpacity: 0.8,
      weight: 2,
    }).bindPopup(statePopupEntry(row));
    stateMarkers.addLayer(marker);
    bounds.push([jlat, jlon]);
  });

  if (bounds.length) {
    stateMap.fitBounds(bounds, { padding: [40, 40], maxZoom: 10 });
  }
}

function openCatalogAnalyzer(catalogUrl) {
  document.getElementById("catalog-url").value = catalogUrl;
  document.getElementById("tab-catalog").click();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderStateTable(rows) {
  const tbody = document.querySelector("#state-table tbody");
  document.getElementById("state-result-count").textContent = `(${rows.length})`;
  tbody.innerHTML = "";

  rows.forEach((row, index) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${row.sale_date}</td>
      <td>${row.county}</td>
      <td>${row.auction_city}</td>
      <td>${row.location}</td>
      <td class="actions">
        <button type="button" class="btn-link" data-action="catalog">Catalog</button>
        ${row.map_parcels_url ? '<button type="button" class="btn-link" data-action="map">Map</button>' : ""}
      </td>
    `;

    tr.addEventListener("click", (event) => {
      if (event.target.closest("button")) return;
      const lat = row.county_lat ?? row.lat;
      const lon = row.county_lon ?? row.lon;
      if (lat != null && lon != null) {
        stateMap.setView([lat, lon], 10);
      }
    });

    tr.querySelector('[data-action="catalog"]')?.addEventListener("click", (event) => {
      event.stopPropagation();
      openCatalogAnalyzer(row.catalog_url);
    });
    tr.querySelector('[data-action="map"]')?.addEventListener("click", (event) => {
      event.stopPropagation();
      window.open(row.map_parcels_url, "_blank");
    });

    tbody.appendChild(tr);
  });
}

function refreshStateView() {
  stateRows = applyClientFilters(stateAllRows);
  renderStateSummary(stateRows);
  renderStateTable(stateRows);
  renderStateMap(stateRows);
  setStateStatus(`Showing ${stateRows.length} of ${stateAllRows.length} county sale entries.`);
}

async function loadStateContents(event) {
  if (event) event.preventDefault();
  const button = document.getElementById("state-submit-btn");
  button.disabled = true;
  setStateStatus("Loading state auction calendar…");

  try {
    const url = document.getElementById("contents-url").value.trim();
    const response = await fetch(`/api/contents?url=${encodeURIComponent(url)}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || "Failed to load contents");

    stateAllRows = data.entries || [];
    populateCountySelect(stateAllRows);
    refreshStateView();
  } catch (error) {
    setStateStatus(error.message, true);
  } finally {
    button.disabled = false;
  }
}

document.getElementById("state-form").addEventListener("submit", loadStateContents);
document.getElementById("state-geo-level").addEventListener("change", () => {
  const focusWrap = document.getElementById("focus-county-wrap");
  const isCounty = document.getElementById("state-geo-level").value === "county";
  focusWrap.hidden = !isCounty;
  refreshStateView();
});
document.getElementById("state-focus-county").addEventListener("change", refreshStateView);
["state-county-kw", "state-city-kw", "state-location-kw", "state-search"].forEach((id) => {
  document.getElementById(id).addEventListener("input", () => {
    if (stateAllRows.length) refreshStateView();
  });
});
["state-sort-by", "state-sort-dir"].forEach((id) => {
  document.getElementById(id).addEventListener("change", () => {
    if (stateAllRows.length) refreshStateView();
  });
});

document.querySelectorAll("#state-table th[data-sort]").forEach((th) => {
  th.addEventListener("click", () => {
    document.getElementById("state-sort-by").value = th.dataset.sort;
    refreshStateView();
  });
});

document.getElementById("tab-state").addEventListener("click", () => {
  setTimeout(() => stateMap.invalidateSize(), 100);
});

window.addEventListener("load", () => {
  loadStateContents();
});
