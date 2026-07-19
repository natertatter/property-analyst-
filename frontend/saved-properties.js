const SavedProperties = (() => {
  const STORAGE_KEY = "tax-sale-saved-properties";
  const rowRegistry = new Map();

  const SAVED_STYLE = {
    radius: 9,
    color: "#b45309",
    fillColor: "#f59e0b",
    fillOpacity: 0.95,
    weight: 3,
  };

  function load() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    } catch {
      return {};
    }
  }

  function save(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    document.dispatchEvent(new CustomEvent("saved-properties-changed"));
    updateSavedBadge();
  }

  function getPropertyId(row) {
    return [row.property_source || "cosl", row.parcel_number || "", row.sale_number || "", row.catalog_url || ""].join("|");
  }

  function registerRow(row) {
    const id = getPropertyId(row);
    rowRegistry.set(id, row);
    return id;
  }

  function getRow(id) {
    return rowRegistry.get(id) || load()[id]?.row || null;
  }

  function isSaved(row) {
    const id = typeof row === "string" ? row : getPropertyId(row);
    return Boolean(load()[id]);
  }

  function count() {
    return Object.keys(load()).length;
  }

  function getAll() {
    const data = load();
    return Object.entries(data).map(([id, entry]) => ({ id, ...entry.row, saved_at: entry.saved_at }));
  }

  function toggle(row) {
    const id = getPropertyId(row);
    const data = load();
    if (data[id]) {
      delete data[id];
      save(data);
      return false;
    }
    data[id] = { row, saved_at: new Date().toISOString() };
    registerRow(row);
    save(data);
    return true;
  }

  function toggleById(id) {
    const row = getRow(id);
    if (!row) return isSaved(id);
    return toggle(row);
  }

  function getMarkerStyle(row, baseStyle) {
    if (isSaved(row)) {
      return { ...baseStyle, ...SAVED_STYLE };
    }
    return baseStyle;
  }

  function updateSavedBadge() {
    const el = document.getElementById("saved-count-badge");
    if (!el) return;
    const n = count();
    el.textContent = n ? `${n} saved` : "";
    el.hidden = !n;
  }

  function handlePopupToggle(propertyId) {
    toggleById(propertyId);
  }

  function saveButtonHtml(row) {
    const id = registerRow(row);
    const saved = isSaved(row);
    const label = saved ? "★ Saved for later" : "☆ Save for later";
    return `<button type="button" class="popup-btn popup-btn-save${saved ? " is-saved" : ""}" data-property-id="${id}" onclick="SavedProperties.handlePopupToggle(this.dataset.propertyId)">${label}</button>`;
  }

  function tablePinButton(row) {
    const id = registerRow(row);
    const saved = isSaved(row);
    const label = saved ? "★" : "☆";
    const title = saved ? "Saved for later — click to remove" : "Save for later";
    return `<button type="button" class="pin-btn${saved ? " is-saved" : ""}" data-property-id="${id}" title="${title}" aria-label="${title}">${label}</button>`;
  }

  function bindTablePinButtons(container) {
    container.querySelectorAll(".pin-btn").forEach((btn) => {
      btn.addEventListener("click", (event) => {
        event.stopPropagation();
        toggleById(btn.dataset.propertyId);
      });
    });
  }

  function refreshOpenPopups() {
    [window.map, window.stateMap].forEach((mapInstance) => {
      if (!mapInstance) return;
      mapInstance.eachLayer((layer) => {
        if (!layer._propertyRow || !layer.getPopup || !layer.isPopupOpen || !layer.isPopupOpen()) return;
        const labels = layer._buildingLabels || {};
        layer.setPopupContent(propertyPopupHtml(layer._propertyRow, labels));
      });
    });
  }

  function refreshMarkerStyles(markersLayer) {
    if (!markersLayer) return;
    markersLayer.eachLayer((marker) => {
      if (!marker._propertyRow || !marker._baseStyle) return;
      marker.setStyle(getMarkerStyle(marker._propertyRow, marker._baseStyle));
    });
  }

  document.addEventListener("saved-properties-changed", () => {
    refreshOpenPopups();
  });

  window.addEventListener("load", updateSavedBadge);

  return {
    getPropertyId,
    registerRow,
    isSaved,
    toggle,
    toggleById,
    count,
    getAll,
    getMarkerStyle,
    saveButtonHtml,
    tablePinButton,
    bindTablePinButtons,
    handlePopupToggle,
    updateSavedBadge,
    refreshMarkerStyles,
    SAVED_STYLE,
  };
})();

window.SavedProperties = SavedProperties;
