// Tab switching
document.getElementById("tab-state").addEventListener("click", () => {
  document.getElementById("tab-state").classList.add("active");
  document.getElementById("tab-catalog").classList.remove("active");
  document.getElementById("view-state").hidden = false;
  document.getElementById("view-catalog").hidden = true;
  document.getElementById("tab-state").setAttribute("aria-selected", "true");
  document.getElementById("tab-catalog").setAttribute("aria-selected", "false");
});

document.getElementById("tab-catalog").addEventListener("click", () => {
  document.getElementById("tab-catalog").classList.add("active");
  document.getElementById("tab-state").classList.remove("active");
  document.getElementById("view-catalog").hidden = false;
  document.getElementById("view-state").hidden = true;
  document.getElementById("tab-catalog").setAttribute("aria-selected", "true");
  document.getElementById("tab-state").setAttribute("aria-selected", "false");
  setTimeout(() => map.invalidateSize(), 100);
});

const map = L.map("map").setView([36.48, -94.28], 12);
window.map = map;
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: "&copy; OpenStreetMap contributors",
}).addTo(map);

let markersLayer = L.layerGroup().addTo(map);
let currentRows = [];

const BUILDING_LABELS = {
  platted_lot: "Platted lot",
  vacant_land: "Vacant/rural",
  mobile_home_lot: "Mobile home",
  unknown: "Unknown",
};

const CONFIDENCE_COLORS = {
  medium: "#2563eb",
  low: "#d97706",
  very_low: "#dc2626",
};

function formatMoney(value) {
  if (value == null) return "—";
  return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatAcres(value) {
  if (value == null) return "—";
  return value.toFixed(2);
}

function parseOptionalNumber(id) {
  const raw = document.getElementById(id).value.trim();
  if (!raw) return null;
  const num = Number(raw);
  return Number.isFinite(num) ? num : null;
}

function getSelectedBuildingStatuses() {
  return [...document.querySelectorAll('input[name="building"]:checked')].map((el) => el.value);
}

function setStatus(message, isError = false) {
  const el = document.getElementById("status");
  el.textContent = message;
  el.classList.toggle("error", isError);
}

function renderSummary(data) {
  const panel = document.getElementById("summary-panel");
  const summary = document.getElementById("summary");
  const s = data.summary;
  const meta = data.meta || {};

  panel.hidden = false;
  summary.innerHTML = `
    <p><strong>${meta.county || ""}</strong> — ${meta.sale_date || ""}</p>
    <div class="summary-grid">
      <div class="summary-card"><span>Catalog rows</span><strong>${s.total_catalog_rows}</strong></div>
      <div class="summary-card"><span>Matched</span><strong>${s.matched_rows}</strong></div>
      <div class="summary-card"><span>On map</span><strong>${s.mapped_rows}</strong></div>
      <div class="summary-card"><span>Total taxes</span><strong>${formatMoney(s.taxes_total)}</strong></div>
      <div class="summary-card"><span>Total acres</span><strong>${formatAcres(s.acres_total)}</strong></div>
      <div class="summary-card"><span>Saved</span><strong>${SavedProperties.count()}</strong></div>
    </div>
    <p style="margin-top:0.75rem;font-size:0.9rem;">
      By type:
      ${Object.entries(s.by_building_status)
        .map(([k, v]) => `${BUILDING_LABELS[k] || k}: ${v}`)
        .join(" · ")}
    </p>
  `;
}

function popupHtml(row) {
  return propertyPopupHtml(row, BUILDING_LABELS);
}

function jitterCoordinates(lat, lon, index, confidence) {
  if (confidence === "medium") return [lat, lon];
  const spread = confidence === "very_low" ? 0.008 : 0.004;
  const angle = (index * 137.5 * Math.PI) / 180;
  return [lat + Math.sin(angle) * spread, lon + Math.cos(angle) * spread];
}

function filterRowsForDisplay(rows) {
  if (!document.getElementById("saved-only").checked) return rows;
  return rows.filter((row) => SavedProperties.isSaved(row));
}

function renderMap(rows) {
  markersLayer.clearLayers();
  const displayRows = filterRowsForDisplay(rows);
  const mappable = displayRows.filter((r) => r.lat != null && r.lon != null);
  if (!mappable.length) {
    map.setView([36.48, -94.28], 11);
    return;
  }

  const bounds = [];
  mappable.forEach((row, index) => {
    const confidence = row.geocode_confidence || "low";
    const [lat, lon] = jitterCoordinates(row.lat, row.lon, index, confidence);
    const baseStyle = {
      radius: 7,
      color: CONFIDENCE_COLORS[confidence] || "#333",
      fillColor: CONFIDENCE_COLORS[confidence] || "#333",
      fillOpacity: 0.75,
      weight: 2,
    };
    const marker = createPropertyMarker(lat, lon, row, BUILDING_LABELS, baseStyle);
    markersLayer.addLayer(marker);
    bounds.push([lat, lon]);
  });

  map.fitBounds(bounds, { padding: [30, 30], maxZoom: 14 });
}

function renderTable(rows) {
  const tbody = document.querySelector("#results-table tbody");
  const displayRows = filterRowsForDisplay(rows);
  document.getElementById("result-count").textContent = `(${displayRows.length})`;
  tbody.innerHTML = "";

  displayRows.forEach((row, index) => {
    const tr = document.createElement("tr");
    if (SavedProperties.isSaved(row)) tr.classList.add("saved-row");
    const plss =
      row.section && row.township && row.range
        ? `S${row.section} T${row.township} R${row.range}`
        : "—";

    tr.innerHTML = `
      <td class="pin-cell">${SavedProperties.tablePinButton(row)}</td>
      <td>${row.sale_number || ""}</td>
      <td>${row.owner_name || ""}</td>
      <td>${row.city || ""}</td>
      <td>${formatAcres(row.acres)}</td>
      <td>${formatMoney(row.taxes_owed)}</td>
      <td>${BUILDING_LABELS[row.building_status] || row.building_status}</td>
      <td>${plss}</td>
      <td>${row.parcel_number || ""}</td>
      <td class="actions link-cell">${propertyTableLinks(row)}</td>
    `;

    SavedProperties.bindTablePinButtons(tr);
    tr.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", (event) => event.stopPropagation());
    });

    tr.addEventListener("click", () => {
      if (row.lat == null || row.lon == null) return;
      const [lat, lon] = jitterCoordinates(row.lat, row.lon, index, row.geocode_confidence || "low");
      map.setView([lat, lon], 15);
      markersLayer.eachLayer((layer) => {
        const ll = layer.getLatLng();
        if (Math.abs(ll.lat - lat) < 0.0001 && Math.abs(ll.lng - lon) < 0.0001) {
          layer.openPopup();
        }
      });
    });

    tbody.appendChild(tr);
  });
}

document.getElementById("saved-only").addEventListener("change", () => {
  if (currentRows.length) {
    renderTable(currentRows);
    renderMap(currentRows);
  }
});

document.addEventListener("saved-properties-changed", () => {
  if (!currentRows.length) return;
  renderTable(currentRows);
  if (document.getElementById("saved-only").checked) {
    renderMap(currentRows);
  } else {
    SavedProperties.refreshMarkerStyles(markersLayer);
    SavedProperties.refreshOpenPopups();
  }
});

document.getElementById("analyze-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = document.getElementById("submit-btn");
  button.disabled = true;
  setStatus("Fetching catalog and applying filters…");

  const payload = {
    catalog_url: document.getElementById("catalog-url").value.trim(),
    city_keywords: document
      .getElementById("city-keywords")
      .value.split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    min_acres: parseOptionalNumber("min-acres"),
    max_acres: parseOptionalNumber("max-acres"),
    min_taxes: parseOptionalNumber("min-taxes"),
    max_taxes: parseOptionalNumber("max-taxes"),
    building_statuses: getSelectedBuildingStatuses(),
    search_text: document.getElementById("search-text").value.trim(),
    geocode: document.getElementById("geocode").checked,
  };

  try {
    const response = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.detail || "Analysis failed");
    }

    currentRows = data.properties || [];
    renderSummary(data);
    renderTable(currentRows);
    renderMap(currentRows);
    setStatus(`Done. ${currentRows.length} properties matched.`);
  } catch (error) {
    setStatus(error.message, true);
  } finally {
    button.disabled = false;
  }
});
