const API_BASE = "http://127.0.0.1:8000";
const AI_ENDPOINT = `${API_BASE}/api/locate-from-image`;

const reportState = {
  images: {
    issuePhoto: null,
    landmarkPhoto: null,
    additionalPhotos: [],
  },
  aiExtraction: {
    attempted: false,
    found: false,
    extracted_details: {
      signboard_text_primary: "",
      signboard_text_secondary: "",
      business_or_landmark_name: "",
      locality_hint: "",
      landmark_category: "other",
      confidence: 0,
      ocr_notes: "",
    },
    formatted_address: "",
  },
  location: {
    lat: null,
    lng: null,
    address: "",
    landmark: "",
    ward: "",
    source: "manual",
  },
  autocomplete: {
    items: [],
    activeIndex: -1,
    visible: false,
  },
  category: {
    id: null,
    title: "",
    department: "Nagpur Municipal Corporation",
  },
  details: {
    description: "",
    customAddress: "",
  },
  status: "Open",
  createdAt: null,
};

const app = {
  currentStep: 1,
  highestCompletedStep: 0,
  categories: [],
  filteredCategories: [],
  boundaryGeoJSON: null,
  map: null,
  marker: null,
  lastValidLatLng: null,
  landmarkPhotoSkipped: false,
  photoContinueBusy: false,
  locationNoticeDismissed: false,
  autocomplete: {
    items: [],
    activeIndex: -1,
    visible: false,
  },
  searchCache: new Map(),
  activeSearchRequestId: 0,
  searchAbortController: null,
};

const els = {};
const NAGPUR_CENTER = [21.1458, 79.0882];
const NAGPUR_BOUNDS = { south: 21.02, west: 78.95, north: 21.25, east: 79.2 };

document.addEventListener("DOMContentLoaded", bootstrap);

async function bootstrap() {
  cacheEls();
  bindUI();
  syncPreviewCollapseState();
  renderStepPills();
  renderCategoryList([]);
  renderPhotoSlots();
  renderExtraPhotoGrid();
  updatePhotoStepStatus();
  updatePreviewCard();
  goToStep(1, { force: true });

  const [boundary, categories] = await Promise.all([loadBoundaryGeoJSON(), loadCategories()]);
  app.boundaryGeoJSON = boundary;
  app.categories = categories;
  app.filteredCategories = categories.slice();
  renderCategoryList(app.filteredCategories);
  initReportMap();
  updatePreviewCard();
}

function cacheEls() {
  [
    "stepPills",
    "photoStatus",
    "issuePhotoInput",
    "landmarkPhotoInput",
    "extraPhotosInput",
    "extraPhotosTrigger",
    "issuePhotoPreview",
    "landmarkPhotoPreview",
    "extraPhotoGrid",
    "skipLandmarkBtn",
    "continuePhotoBtn",
    "locationSearch",
    "searchLocationBtn",
    "searchSpinner",
    "autocompleteResults",
    "zoomInBtn",
    "zoomOutBtn",
    "locateBtn",
    "location-map",
    "aiLocationNotice",
    "dismissAiNoticeBtn",
    "locationAddressField",
    "locationWardBadge",
    "locationSourceBadge",
    "confirmLocationBtn",
    "categorySearch",
    "categoryList",
    "categoryNextBtn",
    "descriptionField",
    "landmarkField",
    "submitBtn",
    "confirmationState",
    "referenceId",
    "submissionSummary",
    "previewCard",
    "previewToggle",
    "previewTitle",
    "previewAddress",
    "previewPhotoBadge",
    "previewWardBadge",
    "toast",
  ].forEach((id) => {
    els[id] = document.getElementById(id);
  });
}

function bindUI() {
  bindDropzone("issue");
  bindDropzone("landmark");
  els.extraPhotosTrigger.addEventListener("click", () => els.extraPhotosInput.click());
  els.extraPhotosInput.addEventListener("change", handleExtraPhotosSelected);
  els.skipLandmarkBtn.addEventListener("click", skipLandmarkPhoto);
  els.continuePhotoBtn.addEventListener("click", continueFromPhotoStep);

  els.searchLocationBtn.addEventListener("click", searchLocation);
  els.locationSearch.addEventListener("input", debounce(handleLocationSearchInput, 300));
  els.locationSearch.addEventListener("keydown", handleLocationSearchKeydown);
  document.addEventListener("click", handleDocumentClick);
  els.zoomInBtn.addEventListener("click", () => app.map?.zoomIn());
  els.zoomOutBtn.addEventListener("click", () => app.map?.zoomOut());
  els.locateBtn.addEventListener("click", useCurrentLocation);
  els.dismissAiNoticeBtn.addEventListener("click", () => {
    app.locationNoticeDismissed = true;
    updateLocationNotice();
  });
  els.confirmLocationBtn.addEventListener("click", confirmLocation);
  els.locationAddressField.addEventListener("input", handleLocationAddressEdit);
  els.categorySearch.addEventListener("input", handleCategorySearch);
  els.categoryNextBtn.addEventListener("click", () => {
    markStepComplete(3);
    goToStep(4);
  });
  els.descriptionField.addEventListener("input", (event) => {
    reportState.details.description = event.target.value;
  });
  els.landmarkField.addEventListener("input", (event) => {
    reportState.details.customAddress = event.target.value;
  });
  els.submitBtn.addEventListener("click", handleFinalSubmission);

  els.previewToggle.addEventListener("click", () => {
    const expanded = els.previewCard.classList.toggle("is-open");
    els.previewToggle.setAttribute("aria-expanded", String(expanded));
    els.previewToggle.querySelector("i").className = expanded
      ? "fa-solid fa-chevron-up"
      : "fa-solid fa-chevron-down";
  });

  document.querySelectorAll("[data-step-back]").forEach((button) => {
    button.addEventListener("click", () => goToStep(Number(button.getAttribute("data-step-back"))));
  });
}

function bindDropzone(kind) {
  const input = kind === "issue" ? els.issuePhotoInput : els.landmarkPhotoInput;
  const dropzone = input.closest(".upload-dropzone");

  dropzone.addEventListener("click", (event) => {
    if (event.target === input) return;
    input.click();
  });

  dropzone.addEventListener("dragover", (event) => {
    event.preventDefault();
    dropzone.classList.add("is-dragover");
  });
  dropzone.addEventListener("dragleave", () => dropzone.classList.remove("is-dragover"));
  dropzone.addEventListener("drop", (event) => {
    event.preventDefault();
    dropzone.classList.remove("is-dragover");
    const file = event.dataTransfer.files?.[0];
    if (!file) return;
    setRequiredPhoto(kind === "issue" ? "issuePhoto" : "landmarkPhoto", file);
  });

  input.addEventListener("change", () => {
    const file = input.files?.[0];
    if (!file) return;
    setRequiredPhoto(kind === "issue" ? "issuePhoto" : "landmarkPhoto", file);
    input.value = "";
  });
}

function renderStepPills() {
  const steps = [
    { number: 1, label: "Photo" },
    { number: 2, label: "Location" },
    { number: 3, label: "Category" },
    { number: 4, label: "Details" },
  ];

  els.stepPills.innerHTML = steps
    .map(
      (step) => `
        <button class="step-pill" type="button" data-step-pill="${step.number}">
          <span class="index">${step.number}</span>
          <span>${step.label}</span>
        </button>`
    )
    .join("");

  els.stepPills.querySelectorAll("[data-step-pill]").forEach((button) => {
    button.addEventListener("click", () => {
      const step = Number(button.getAttribute("data-step-pill"));
      if (step === app.currentStep || step <= app.highestCompletedStep) {
        goToStep(step);
      }
    });
  });
}

function updateStepPills() {
  els.stepPills.querySelectorAll("[data-step-pill]").forEach((button) => {
    const step = Number(button.getAttribute("data-step-pill"));
    const completed = step <= app.highestCompletedStep && step !== app.currentStep;
    button.classList.toggle("active", step === app.currentStep);
    button.classList.toggle("completed", completed);
    button.querySelector(".index").textContent = completed ? "OK" : String(step);
  });
}

function markStepComplete(stepNumber) {
  app.highestCompletedStep = Math.max(app.highestCompletedStep, stepNumber);
  updateStepPills();
}

function goToStep(stepNumber, options = {}) {
  if (stepNumber < 1 || stepNumber > 4) return;
  if (!options.force && stepNumber > app.highestCompletedStep + 1 && stepNumber !== app.currentStep) return;

  app.currentStep = stepNumber;
  document.querySelectorAll(".step-panel").forEach((panel) => {
    panel.classList.toggle("active", Number(panel.dataset.step) === stepNumber);
  });
  els.confirmationState.hidden = true;
  updateStepPills();

  if (stepNumber === 2) {
    prepareLocationStep();
    window.setTimeout(() => app.map?.invalidateSize(), 250);
  }

  if (stepNumber === 4) {
    els.landmarkField.value = reportState.details.customAddress || reportState.location.address || "";
  }
}

function syncPreviewCollapseState() {
  const apply = (isMobile) => {
    if (isMobile) {
      els.previewCard.classList.remove("is-open");
      els.previewToggle.setAttribute("aria-expanded", "false");
      els.previewToggle.querySelector("i").className = "fa-solid fa-chevron-down";
    } else {
      els.previewCard.classList.add("is-open");
      els.previewToggle.setAttribute("aria-expanded", "true");
      els.previewToggle.querySelector("i").className = "fa-solid fa-chevron-up";
    }
  };

  const media = window.matchMedia("(max-width: 767px)");
  apply(media.matches);
  if (typeof media.addEventListener === "function") {
    media.addEventListener("change", (event) => apply(event.matches));
  }
}

async function loadCategories() {
  const fallback = [
    { id: "potholes-road-damage", title: "Potholes & Road Damage", sourceFile: "fallback", department: "Nagpur Municipal Corporation", tooltip: "Fallback civic category." },
    { id: "street-lights", title: "Street Light Issues", sourceFile: "fallback", department: "Nagpur Municipal Corporation", tooltip: "Fallback civic category." },
    { id: "waste-cleanliness", title: "Waste & Cleanliness", sourceFile: "fallback", department: "Nagpur Municipal Corporation", tooltip: "Fallback civic category." },
    { id: "trees-greens", title: "Tree & Greenery Concerns", sourceFile: "fallback", department: "Nagpur Municipal Corporation", tooltip: "Fallback civic category." },
  ];

  try {
    const response = await fetch("./categories.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`Status ${response.status}`);
    const data = await response.json();
    if (!Array.isArray(data) || !data.length) throw new Error("Empty category payload");
    return data;
  } catch (error) {
    console.warn("Falling back to generic categories because categories.json could not be loaded.", error);
    return fallback;
  }
}

function renderCategoryList(items) {
  if (!items.length) {
    els.categoryList.innerHTML = '<div class="empty-state">No categories match your search.</div>';
    els.categoryNextBtn.disabled = !reportState.category.id;
    return;
  }

  els.categoryList.innerHTML = items
    .map((item) => {
      const selected = reportState.category.id === item.id;
      return `
        <button class="category-item ${selected ? "selected" : ""}" type="button" data-category-id="${item.id}">
          <div>
            <strong>${escapeHtml(item.title)}</strong>
            <span>${escapeHtml(item.department || "Nagpur Municipal Corporation")}</span>
          </div>
          <div class="selected-mark">${selected ? '<i class="fa-solid fa-check"></i>' : ""}</div>
        </button>
      `;
    })
    .join("");

  els.categoryList.querySelectorAll("[data-category-id]").forEach((button) => {
    button.addEventListener("click", () => selectCategory(button.getAttribute("data-category-id")));
  });

  els.categoryNextBtn.disabled = !reportState.category.id;
  updatePreviewCard();
}

function handleCategorySearch(event) {
  const query = event.target.value.trim().toLowerCase();
  app.filteredCategories = app.categories.filter((item) => {
    return item.title.toLowerCase().includes(query) || (item.tooltip || "").toLowerCase().includes(query);
  });
  renderCategoryList(app.filteredCategories);
}

function selectCategory(categoryId) {
  const category = app.categories.find((item) => item.id === categoryId);
  if (!category) return;

  reportState.category = {
    id: category.id,
    title: category.title,
    department: category.department || "Nagpur Municipal Corporation",
  };
  markStepComplete(3);
  els.categoryNextBtn.disabled = false;
  renderCategoryList(app.filteredCategories.length ? app.filteredCategories : app.categories);
}

function loadBoundaryGeoJSON() {
  const fallback = {
    type: "Feature",
    properties: { name: "Nagpur Municipal Corporation boundary fallback" },
    geometry: {
      type: "Polygon",
      coordinates: [[
        [NAGPUR_BOUNDS.west, NAGPUR_BOUNDS.south],
        [NAGPUR_BOUNDS.east, NAGPUR_BOUNDS.south],
        [NAGPUR_BOUNDS.east, NAGPUR_BOUNDS.north],
        [NAGPUR_BOUNDS.west, NAGPUR_BOUNDS.north],
        [NAGPUR_BOUNDS.west, NAGPUR_BOUNDS.south],
      ]],
    },
  };

  return fetch("./nagpur_boundary.geojson")
    .then((response) => (response.ok ? response.json() : Promise.reject(new Error("Boundary file not found"))))
    .catch(() => fallback);
}

function initReportMap() {
  const nagpurBounds = L.latLngBounds(L.latLng(NAGPUR_BOUNDS.south, NAGPUR_BOUNDS.west), L.latLng(NAGPUR_BOUNDS.north, NAGPUR_BOUNDS.east));

  app.map = L.map("location-map", {
    center: NAGPUR_CENTER,
    zoom: 13,
    minZoom: 11,
    maxBounds: nagpurBounds,
    maxBoundsViscosity: 1.0,
  });

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap contributors",
    maxZoom: 19,
  }).addTo(app.map);

  const polygonFeature = extractPolygonFeature(app.boundaryGeoJSON);
  drawBoundaryOverlay(polygonFeature);
  app.map.on("click", (event) => handleManualLocationAndReverse(event.latlng.lat, event.latlng.lng));
}

function extractPolygonFeature(geojson) {
  if (!geojson) return null;
  if (geojson.type === "FeatureCollection") {
    return geojson.features?.find((feature) => feature.geometry?.type === "Polygon" || feature.geometry?.type === "MultiPolygon") || geojson.features?.[0] || null;
  }
  if (geojson.type === "Feature") return geojson;
  if (geojson.type === "Polygon" || geojson.type === "MultiPolygon") {
    return { type: "Feature", properties: {}, geometry: geojson };
  }
  return null;
}

function drawBoundaryOverlay(feature) {
  if (!feature) return;

  const boundaryLayer = L.geoJSON(feature, {
    style: {
      color: "#2563EB",
      weight: 2,
      dashArray: "5,5",
      fillColor: "#2563EB",
      fillOpacity: 0.03,
    },
  }).addTo(app.map);

  const ring = getOuterRing(feature);
  if (ring.length) {
    const shadow = L.polygon([worldRing(), ring], {
      stroke: false,
      fillColor: "#0f172a",
      fillOpacity: 0.18,
      fillRule: "evenodd",
      interactive: false,
    }).addTo(app.map);
    shadow.bringToBack();
    boundaryLayer.bringToFront();
  }
}

function getOuterRing(feature) {
  const geometry = feature?.geometry;
  if (!geometry) return [];
  const polygon = geometry.type === "Polygon" ? geometry.coordinates[0] : geometry.type === "MultiPolygon" ? geometry.coordinates[0][0] : [];
  return polygon.map(([lng, lat]) => [lat, lng]);
}

function worldRing() {
  return [
    [90, -180],
    [90, 180],
    [-90, 180],
    [-90, -180],
    [90, -180],
  ];
}

function validateNagpurBounds(lat, lng) {
  const feature = app.boundaryGeoJSON;
  if (!feature || !window.turf) {
    return lat >= NAGPUR_BOUNDS.south && lat <= NAGPUR_BOUNDS.north && lng >= NAGPUR_BOUNDS.west && lng <= NAGPUR_BOUNDS.east;
  }
  const polygon = feature.geometry ? feature : extractPolygonFeature(feature);
  return turf.booleanPointInPolygon(turf.point([lng, lat]), polygon);
}

function handleManualLocationAndReverse(lat, lng, options = {}) {
  if (!validateNagpurBounds(lat, lng)) {
    showToast("Complaints can only be submitted within Nagpur Municipal Corporation boundaries.");
    if (app.lastValidLatLng) {
      setMarker(app.lastValidLatLng.lat, app.lastValidLatLng.lng);
    } else {
      clearMarker();
      app.map?.setView(NAGPUR_CENTER, 13);
    }
    return;
  }

  app.locationNoticeDismissed = false;
  reportState.location.source = options.source || "manual";
  reportState.location.lat = lat;
  reportState.location.lng = lng;
  app.lastValidLatLng = { lat, lng };
  setMarker(lat, lng, { pan: !!options.pan, address: options.address, showPopup: !!options.showPopup });
  els.confirmLocationBtn.disabled = false;
  updateLocationNotice();
  reverseGeocode(lat, lng, options.source || "manual");
}

function setMarker(lat, lng, options = {}) {
  const icon = L.divIcon({
    className: "custom-marker",
    html: '<div style="width:18px;height:18px;border-radius:50% 50% 50% 0;background:#f97316;transform:rotate(-45deg);box-shadow:0 8px 18px rgba(249,115,22,.35);border:3px solid white;"></div>',
    iconSize: [24, 24],
    iconAnchor: [12, 24],
  });

  if (!app.marker) {
    app.marker = L.marker([lat, lng], { draggable: true, icon }).addTo(app.map);
    app.marker.on("dragend", (event) => {
      const position = event.target.getLatLng();
      handleManualLocationAndReverse(position.lat, position.lng, { source: "manual" });
    });
  } else {
    app.marker.setLatLng([lat, lng]);
  }

  if (options.address) {
    app.marker.bindPopup(buildMarkerPopup(options.address, lat, lng));
  } else {
    app.marker.bindPopup(buildMarkerPopup(`Selected point at ${lat.toFixed(5)}, ${lng.toFixed(5)}`, lat, lng));
  }

  if (options.showPopup) {
    app.marker.openPopup();
  }

  if (options.pan) {
    app.map.flyTo([lat, lng], Math.max(app.map.getZoom(), 16), { duration: 1.2 });
  }
}

function buildMarkerPopup(address, lat, lng) {
  return `
    <div style="min-width: 180px;">
      <strong>Selected Address</strong>
      <div style="margin-top: 6px; color: #334155;">${escapeHtml(address)}</div>
      <div style="margin-top: 8px; font-size: 0.9rem; color: #64748b;">Latitude: ${lat.toFixed(5)}<br />Longitude: ${lng.toFixed(5)}</div>
    </div>
  `;
}

function clearMarker() {
  if (app.marker) {
    app.map.removeLayer(app.marker);
    app.marker = null;
  }
}

async function reverseGeocode(lat, lng, source = "manual") {
  try {
    const url = new URL("https://nominatim.openstreetmap.org/reverse");
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("lat", lat.toString());
    url.searchParams.set("lon", lng.toString());
    url.searchParams.set("zoom", "18");
    url.searchParams.set("addressdetails", "1");
    url.searchParams.set("accept-language", "en");

    const response = await fetch(url, {
      headers: {
        "Accept": "application/json",
        "User-Agent": "JanSetu-AI/1.0",
      },
    });
    if (!response.ok) throw new Error(`Reverse geocoding failed (${response.status})`);
    const data = await response.json();
    const addressData = data.address || {};
    const parts = [
      addressData.house_number,
      addressData.road,
      addressData.suburb,
      addressData.neighbourhood,
      addressData.city_district,
      addressData.city || addressData.town || addressData.village,
      addressData.state,
      addressData.country,
      addressData.postcode,
    ].filter(Boolean);
    const address = parts.length ? parts.join(", ") : `Selected point at ${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    const ward = addressData.city_district || addressData.suburb || addressData.neighbourhood || "";
    applyLocationAddress(address, ward, source);
  } catch (error) {
    const fallback = `Selected point at ${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    applyLocationAddress(fallback, "", source);
    console.warn("Reverse geocoding failed, using coordinate fallback.", error);
  }
}

function applyLocationAddress(address, ward, source) {
  reportState.location.address = address;
  reportState.location.landmark = address;
  reportState.location.ward = ward;
  reportState.location.source = source;
  els.locationAddressField.value = address;
  els.locationWardBadge.textContent = ward ? `Ward: ${ward}` : "Ward not set";
  els.locationSourceBadge.textContent = `Source: ${source}`;
  updatePreviewCard();
}

function handleLocationAddressEdit(event) {
  reportState.location.address = event.target.value;
  reportState.location.landmark = event.target.value;
  if (reportState.location.source === "ai") {
    reportState.location.source = "manual";
    updateLocationNotice();
  }
  els.locationSourceBadge.textContent = `Source: ${reportState.location.source}`;
  updatePreviewCard();
}

function ensureAutocompleteState() {
  if (!app.autocomplete) {
    app.autocomplete = {
      items: [],
      activeIndex: -1,
      visible: false,
    };
  }
  return app.autocomplete;
}

function searchLocation() {
  const query = els.locationSearch.value.trim();
  closeAutocomplete();
  if (!query) {
    showToast("Type a location or address to search.");
    return;
  }

  fetchPlaceSuggestions(query, { manual: true });
}

function handleLocationSearchInput(event) {
  const query = event.target.value.trim();
  const autocompleteState = ensureAutocompleteState();
  if (query.length < 3) {
    closeAutocomplete();
    setSearchLoading(false);
    return;
  }
  fetchPlaceSuggestions(query);
  if (!autocompleteState.visible) {
    autocompleteState.visible = true;
  }
}

function handleLocationSearchKeydown(event) {
  const autocompleteState = ensureAutocompleteState();
  if (!autocompleteState.visible) return;

  if (event.key === "ArrowDown") {
    event.preventDefault();
    moveAutocompleteSelection(1);
  } else if (event.key === "ArrowUp") {
    event.preventDefault();
    moveAutocompleteSelection(-1);
  } else if (event.key === "Enter") {
    if (autocompleteState.activeIndex >= 0 && autocompleteState.activeIndex < autocompleteState.items.length) {
      event.preventDefault();
      selectAutocompleteSuggestion(autocompleteState.items[autocompleteState.activeIndex]);
    }
  } else if (event.key === "Escape") {
    closeAutocomplete();
  }
}

function handleDocumentClick(event) {
  const container = els.autocompleteResults;
  if (container && !container.contains(event.target) && event.target !== els.locationSearch) {
    closeAutocomplete();
  }
}

function moveAutocompleteSelection(direction) {
  const autocompleteState = ensureAutocompleteState();
  if (!autocompleteState.items.length) return;
  const nextIndex = autocompleteState.activeIndex + direction;
  autocompleteState.activeIndex = Math.max(0, Math.min(autocompleteState.items.length - 1, nextIndex));
  renderAutocompleteResults();
}

function getPhotonQuery(query) {
  return `${query.trim()} Nagpur Maharashtra India`;
}

function isInsideNagpur(feature) {
  const geometry = feature?.geometry;
  const coords = geometry?.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) return false;
  const lat = Number(coords[1]);
  const lng = Number(coords[0]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (!validateNagpurBounds(lat, lng)) return false;
  const props = feature?.properties || {};
  const context = `${props.city || ""} ${props.county || ""} ${props.state || ""} ${props.country || ""}`.toLowerCase();
  return context.includes("nagpur") || context.includes("maharashtra") || context.includes("india");
}

function getPhotonPriority(feature) {
  const props = feature?.properties || {};
  const type = `${props.osm_key || ""} ${props.osm_value || ""} ${props.type || ""}`.toLowerCase();
  const name = `${props.name || ""} ${props.street || ""}`.toLowerCase();
  if (/hospital|school|government|office|shop|building|commercial|bank|clinic|college/.test(type) || /hospital|school|government|office|shop|building/.test(name)) return 3;
  if (/road|street|lane|colony|suburb|locality|neighbourhood|area|market|landmark/.test(type) || /road|street|colony|suburb|locality|market|landmark/.test(name)) return 2;
  return 1;
}

function buildPhotonAddress(feature) {
  const props = feature?.properties || {};
  const parts = [
    props.housenumber,
    props.street,
    props.suburb,
    props.neighbourhood,
    props.city || props.town || props.village,
    props.state,
    props.country,
    props.postcode,
  ].filter(Boolean);
  return parts.length ? parts.join(", ") : props.name || "Selected location";
}

function setSearchLoading(isLoading) {
  els.locationSearch.closest(".map-search")?.classList.toggle("is-loading", isLoading);
  const spinner = els.searchSpinner;
  if (spinner) spinner.hidden = !isLoading;
}

async function fetchPlaceSuggestions(query, options = {}) {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) {
    closeAutocomplete();
    setSearchLoading(false);
    return;
  }

  if (normalizedQuery.length < 3) {
    closeAutocomplete();
    setSearchLoading(false);
    return;
  }

  const autocompleteState = ensureAutocompleteState();

  if (app.searchCache.has(normalizedQuery)) {
    const cached = app.searchCache.get(normalizedQuery);
    autocompleteState.items = cached;
    autocompleteState.activeIndex = -1;
    autocompleteState.visible = true;
    renderAutocompleteResults();
    return;
  }

  if (app.searchAbortController) {
    app.searchAbortController.abort();
  }

  app.activeSearchRequestId += 1;
  const requestId = app.activeSearchRequestId;
  app.searchAbortController = new AbortController();
  setSearchLoading(true);

  try {
    const endpoint = new URL("https://photon.komoot.io/api/");
    endpoint.searchParams.set("q", getPhotonQuery(normalizedQuery));
    endpoint.searchParams.set("limit", "8");
    endpoint.searchParams.set("lang", "en");
    endpoint.searchParams.set("bbox", `${NAGPUR_BOUNDS.west},${NAGPUR_BOUNDS.south},${NAGPUR_BOUNDS.east},${NAGPUR_BOUNDS.north}`);

    const response = await fetch(endpoint, {
      signal: app.searchAbortController.signal,
      headers: { Accept: "application/json" },
    });

    if (!response.ok) throw new Error(`Photon search failed (${response.status})`);
    const data = await response.json();
    const features = Array.isArray(data.features) ? data.features : [];
    const inNagpur = features.filter(isInsideNagpur).sort((a, b) => getPhotonPriority(b) - getPhotonPriority(a));

    const suggestions = inNagpur.slice(0, 8).map((feature) => {
      const coords = feature.geometry?.coordinates || [];
      const lat = Number(coords[1]);
      const lng = Number(coords[0]);
      const props = feature.properties || {};
      const primary = props.name || props.street || props.city || props.state || "Location";
      const secondary = buildPhotonAddress(feature);
      return {
        lat,
        lng,
        primary,
        secondary,
        address: buildPhotonAddress(feature),
        source: "photon",
      };
    });

    if (requestId !== app.activeSearchRequestId) return;

    autocompleteState.items = suggestions;
    autocompleteState.activeIndex = -1;
    autocompleteState.visible = true;
    renderAutocompleteResults();

    if (suggestions.length) {
      const cacheEntries = [...app.searchCache.values()];
      if (cacheEntries.length >= 20) {
        const oldestKey = app.searchCache.keys().next().value;
        if (oldestKey) app.searchCache.delete(oldestKey);
      }
      app.searchCache.set(normalizedQuery, suggestions);
    }
  } catch (error) {
    if (error.name === "AbortError") return;
    if (requestId !== app.activeSearchRequestId) return;
    autocompleteState.items = [];
    autocompleteState.activeIndex = -1;
    autocompleteState.visible = true;
    renderAutocompleteResults("No matching location found.");
    console.warn("Photon search failed.", error);
  } finally {
    if (requestId === app.activeSearchRequestId) {
      setSearchLoading(false);
      app.searchAbortController = null;
    }
  }
}

function renderAutocompleteResults(errorMessage) {
  const autocompleteState = ensureAutocompleteState();
  const container = els.autocompleteResults;
  if (!container) return;

  if (!autocompleteState.visible) {
    container.hidden = true;
    return;
  }

  if (errorMessage) {
    container.innerHTML = `<div class="autocomplete-error">${escapeHtml(errorMessage)}</div>`;
    container.hidden = false;
    return;
  }

  if (!autocompleteState.items.length) {
    container.innerHTML = '<div class="autocomplete-empty">No matching locations found in Nagpur</div>';
    container.hidden = false;
    return;
  }

  container.innerHTML = autocompleteState.items
    .map((item, index) => {
      const active = index === autocompleteState.activeIndex ? "active" : "";
      return `
        <div class="autocomplete-item ${active}" data-suggestion-index="${index}">
          <strong>${escapeHtml(item.primary)}</strong>
          <span>${escapeHtml(item.secondary)}</span>
        </div>
      `;
    })
    .join("");
  container.hidden = false;
  container.querySelectorAll("[data-suggestion-index]").forEach((button) => {
    button.addEventListener("click", () => {
      const index = Number(button.getAttribute("data-suggestion-index"));
      selectAutocompleteSuggestion(autocompleteState.items[index]);
    });
  });
}

async function selectAutocompleteSuggestion(item) {
  if (!item) return;
  closeAutocomplete();
  els.locationSearch.value = item.secondary || item.primary;

  const lat = Number(item.lat);
  const lng = Number(item.lng);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    showToast("No matching location found.");
    return;
  }

  if (!validateNagpurBounds(lat, lng)) {
    showToast("Selected location is outside Nagpur boundaries.");
    return;
  }

  handleManualLocationAndReverse(lat, lng, {
    pan: true,
    showPopup: true,
    address: item.address || item.secondary || item.primary,
    source: "search",
  });
}

function closeAutocomplete() {
  const autocompleteState = ensureAutocompleteState();
  autocompleteState.visible = false;
  autocompleteState.items = [];
  autocompleteState.activeIndex = -1;
  if (els.autocompleteResults) {
    els.autocompleteResults.hidden = true;
  }
}

function debounce(fn, wait) {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = window.setTimeout(() => fn(...args), wait);
  };
}

function useCurrentLocation() {
  if (!navigator.geolocation) {
    showToast("Geolocation is not supported in this browser.");
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (position) => {
      const lat = position.coords.latitude;
      const lng = position.coords.longitude;
      if (!validateNagpurBounds(lat, lng)) {
        showToast("Complaints can only be submitted within Nagpur Municipal Corporation boundaries.");
        app.map?.setView(NAGPUR_CENTER, 13);
        return;
      }
      handleManualLocationAndReverse(lat, lng, { pan: true });
    },
    () => {
      showToast("Unable to access your current location.");
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
  );
}

function updateLocationNotice() {
  const shouldShow = reportState.aiExtraction.found && !app.locationNoticeDismissed;
  els.aiLocationNotice.hidden = !shouldShow;
  if (!shouldShow) return;

  const label = els.aiLocationNotice.querySelector("span");
  label.innerHTML = reportState.location.source === "ai"
    ? '<i class="fa-solid fa-wand-magic-sparkles"></i> Location guessed from your photo - tap or drag the pin to adjust'
    : '<i class="fa-solid fa-wand-magic-sparkles"></i> AI pre-fill was adjusted manually';
}

function setRequiredPhoto(key, file) {
  const current = reportState.images[key];
  if (current?.url) URL.revokeObjectURL(current.url);
  reportState.images[key] = { file, url: URL.createObjectURL(file), name: file.name };
  if (key === "issuePhoto") app.landmarkPhotoSkipped = false;
  renderPhotoSlots();
  updatePhotoStepStatus();
  updatePreviewCard();
  els.continuePhotoBtn.disabled = !reportState.images.issuePhoto || app.photoContinueBusy;
}

function removeRequiredPhoto(key) {
  const current = reportState.images[key];
  if (current?.url) URL.revokeObjectURL(current.url);
  reportState.images[key] = null;
  if (key === "landmarkPhoto") app.landmarkPhotoSkipped = false;
  renderPhotoSlots();
  updatePhotoStepStatus();
  updatePreviewCard();
  els.continuePhotoBtn.disabled = !reportState.images.issuePhoto || app.photoContinueBusy;
}

function skipLandmarkPhoto() {
  removeRequiredPhoto("landmarkPhoto");
  app.landmarkPhotoSkipped = true;
  updatePhotoStepStatus();
  showToast("You can set the location manually on the next step.");
}

function renderPhotoSlots() {
  renderSinglePhotoPreview("issuePhoto", els.issuePhotoPreview, true);
  renderSinglePhotoPreview("landmarkPhoto", els.landmarkPhotoPreview, false);
}

function renderSinglePhotoPreview(key, container, required) {
  const photo = reportState.images[key];
  if (!photo) {
    container.innerHTML = `<div class="empty-state ${required ? "required" : ""}">No photo selected yet.</div>`;
    return;
  }

  container.innerHTML = `
    <div class="photo-thumb single">
      <img src="${photo.url}" alt="${escapeHtml(photo.name)}" />
      <button type="button" data-remove-photo="${key}" aria-label="Remove image">&times;</button>
      <span class="photo-name">${escapeHtml(photo.name)}</span>
    </div>
  `;

  container.querySelector("[data-remove-photo]")?.addEventListener("click", () => removeRequiredPhoto(key));
}

function handleExtraPhotosSelected(event) {
  const files = Array.from(event.target.files || []);
  if (!files.length) return;

  const remaining = Math.max(0, 5 - totalPhotoCount());
  const accepted = files.slice(0, remaining);
  if (!accepted.length) {
    showToast("You can add up to 5 photos in total.");
    event.target.value = "";
    return;
  }

  accepted.forEach((file) => {
    reportState.images.additionalPhotos.push({ file, url: URL.createObjectURL(file), name: file.name });
  });

  event.target.value = "";
  renderExtraPhotoGrid();
  updatePhotoStepStatus();
  updatePreviewCard();
}

function renderExtraPhotoGrid() {
  if (!reportState.images.additionalPhotos.length) {
    els.extraPhotoGrid.innerHTML = '<div class="empty-state">No extra photos added.</div>';
    return;
  }

  els.extraPhotoGrid.innerHTML = reportState.images.additionalPhotos
    .map(
      (photo, index) => `
        <div class="photo-thumb">
          <img src="${photo.url}" alt="${escapeHtml(photo.name)}" />
          <button type="button" data-remove-extra-photo="${index}" aria-label="Remove extra image">&times;</button>
        </div>
      `
    )
    .join("");

  els.extraPhotoGrid.querySelectorAll("[data-remove-extra-photo]").forEach((button) => {
    button.addEventListener("click", () => removeExtraPhoto(Number(button.getAttribute("data-remove-extra-photo"))));
  });
}

function removeExtraPhoto(index) {
  const [removed] = reportState.images.additionalPhotos.splice(index, 1);
  if (removed?.url) URL.revokeObjectURL(removed.url);
  renderExtraPhotoGrid();
  updatePhotoStepStatus();
  updatePreviewCard();
}

function totalPhotoCount() {
  return (reportState.images.issuePhoto ? 1 : 0) + (reportState.images.landmarkPhoto ? 1 : 0) + reportState.images.additionalPhotos.length;
}

function updatePhotoStepStatus() {
  const issueReady = Boolean(reportState.images.issuePhoto);
  const landmarkReady = Boolean(reportState.images.landmarkPhoto);
  const extraCount = reportState.images.additionalPhotos.length;

  if (!issueReady) {
    els.photoStatus.textContent = "Upload the issue photo to continue.";
  } else if (landmarkReady) {
    els.photoStatus.textContent = `Issue photo ready. Landmark photo added. Extra photos: ${extraCount}.`;
  } else if (app.landmarkPhotoSkipped) {
    els.photoStatus.textContent = `Issue photo ready. Landmark photo skipped. Extra photos: ${extraCount}.`;
  } else {
    els.photoStatus.textContent = "Issue photo ready. Add a landmark photo for AI location help, or skip it and continue manually.";
  }

  els.continuePhotoBtn.disabled = !issueReady || app.photoContinueBusy;
}

function setPhotoContinueBusy(isBusy, label) {
  app.photoContinueBusy = isBusy;
  els.continuePhotoBtn.disabled = isBusy || !reportState.images.issuePhoto;
  els.continuePhotoBtn.textContent = label;
  updatePhotoStepStatus();
}

async function continueFromPhotoStep() {
  if (!reportState.images.issuePhoto || app.photoContinueBusy) return;

  markStepComplete(1);

  if (!reportState.images.landmarkPhoto || app.landmarkPhotoSkipped) {
    goToStep(2);
    return;
  }

  setPhotoContinueBusy(true, "Analyzing Image...");
  const fallbackNotice = "Location could not be identified automatically. Please select it manually.";

  try {
    const result = await analyzeLandmarkPhoto();
    reportState.aiExtraction.attempted = true;
    reportState.aiExtraction.found = Boolean(result?.found);
    reportState.aiExtraction.extracted_details = normalizeExtraction(result?.extracted_details);
    reportState.aiExtraction.formatted_address = result?.location?.formatted_address || "";
    updatePreviewCard();

    setPhotoContinueBusy(true, "Finding Location...");
    await delay(250);

    const lat = Number(result?.location?.latitude);
    const lng = Number(result?.location?.longitude);
    const insideNagpur = result?.found && Number.isFinite(lat) && Number.isFinite(lng) && validateNagpurBounds(lat, lng);

    if (insideNagpur) {
      reportState.location.lat = lat;
      reportState.location.lng = lng;
      reportState.location.address = result.location.formatted_address || "";
      reportState.location.landmark = result.location.formatted_address || "";
      reportState.location.ward = "";
      reportState.location.source = "ai";
      app.lastValidLatLng = { lat, lng };
      app.locationNoticeDismissed = false;
      els.locationAddressField.value = reportState.location.address;
      els.locationWardBadge.textContent = "Ward not set";
      els.locationSourceBadge.textContent = "Source: ai";
      els.confirmLocationBtn.disabled = false;
      setMarker(lat, lng);
      app.map?.setView([lat, lng], 16);
      markStepComplete(2);
      updateLocationNotice();
      updatePreviewCard();
      goToStep(2);
    } else {
      reportState.aiExtraction.found = false;
      showToast(fallbackNotice);
      clearLocationForManualFallback();
      goToStep(2);
    }
  } catch (error) {
    console.warn("AI photo analysis failed, using manual fallback.", error);
    reportState.aiExtraction.attempted = true;
    reportState.aiExtraction.found = false;
    reportState.aiExtraction.extracted_details = emptyExtraction();
    reportState.aiExtraction.formatted_address = "";
    showToast(fallbackNotice);
    clearLocationForManualFallback();
    goToStep(2);
  } finally {
    setPhotoContinueBusy(false, "Continue");
    markStepComplete(1);
    updatePreviewCard();
  }
}

async function analyzeLandmarkPhoto() {
  const formData = new FormData();
  formData.append("issue_photo", reportState.images.issuePhoto.file);
  formData.append("landmark_photo", reportState.images.landmarkPhoto.file);

  const response = await fetch(AI_ENDPOINT, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`AI endpoint failed (${response.status})`);
  }

  return response.json();
}

function clearLocationForManualFallback() {
  reportState.location.lat = null;
  reportState.location.lng = null;
  reportState.location.address = "";
  reportState.location.landmark = "";
  reportState.location.ward = "";
  reportState.location.source = "manual";
  app.lastValidLatLng = null;
  clearMarker();
  els.locationAddressField.value = "";
  els.locationWardBadge.textContent = "Ward not set";
  els.locationSourceBadge.textContent = "Source: manual";
  els.confirmLocationBtn.disabled = true;
  app.locationNoticeDismissed = false;
  updateLocationNotice();
  updatePreviewCard();
}

function normalizeExtraction(extracted) {
  return {
    signboard_text_primary: "",
    signboard_text_secondary: "",
    business_or_landmark_name: "",
    locality_hint: "",
    landmark_category: "other",
    confidence: 0,
    ocr_notes: "",
    ...(extracted || {}),
  };
}

function emptyExtraction() {
  return {
    signboard_text_primary: "",
    signboard_text_secondary: "",
    business_or_landmark_name: "",
    locality_hint: "",
    landmark_category: "other",
    confidence: 0,
    ocr_notes: "",
  };
}

function prepareLocationStep() {
  if (!app.map) return;

  if (reportState.location.lat !== null && reportState.location.lng !== null) {
    setMarker(reportState.location.lat, reportState.location.lng);
    app.map.setView([reportState.location.lat, reportState.location.lng], 16);
    els.locationAddressField.value = reportState.location.address || reportState.aiExtraction.formatted_address || "";
    els.locationSourceBadge.textContent = `Source: ${reportState.location.source}`;
    els.locationWardBadge.textContent = reportState.location.ward ? `Ward: ${reportState.location.ward}` : "Ward not set";
    els.confirmLocationBtn.disabled = false;
  } else {
    clearMarker();
    app.map.setView(NAGPUR_CENTER, 13);
    els.locationAddressField.value = "";
    els.locationSourceBadge.textContent = "Source: manual";
    els.locationWardBadge.textContent = "Ward not set";
    els.confirmLocationBtn.disabled = true;
  }

  updateLocationNotice();
}

function confirmLocation() {
  if (reportState.location.lat === null || reportState.location.lng === null) {
    showToast("Choose a valid location inside Nagpur first.");
    return;
  }

  reportState.location.address = els.locationAddressField.value.trim() || reportState.location.address;
  reportState.location.landmark = reportState.location.address;
  reportState.details.customAddress = reportState.location.address;
  markStepComplete(2);
  updatePreviewCard();
  goToStep(3);
}

function handleFinalSubmission() {
  if (reportState.location.lat === null || reportState.location.lng === null) {
    showToast("Please confirm a location inside Nagpur first.");
    goToStep(2);
    return;
  }

  if (!reportState.category.id) {
    showToast("Please choose a request category.");
    goToStep(3);
    return;
  }

  reportState.details.description = els.descriptionField.value.trim();
  reportState.details.customAddress = els.landmarkField.value.trim() || reportState.location.address;
  reportState.createdAt = new Date().toISOString();
  markStepComplete(4);

  const payload = buildSubmissionPayload();
  const referenceId = generateReferenceId();

  console.log("Submitted report payload:", payload);

  els.referenceId.textContent = referenceId;
  els.submissionSummary.textContent = JSON.stringify(payload, null, 2);
  els.confirmationState.hidden = false;
  document.querySelectorAll(".step-panel").forEach((panel) => panel.classList.remove("active"));
  showToast("Request prepared successfully.");
}

function buildSubmissionPayload() {
  return {
    images: {
      issuePhoto: summarizePhoto(reportState.images.issuePhoto),
      landmarkPhoto: summarizePhoto(reportState.images.landmarkPhoto),
      additionalPhotos: reportState.images.additionalPhotos.map((photo) => summarizePhoto(photo)),
    },
    aiExtraction: {
      attempted: reportState.aiExtraction.attempted,
      found: reportState.aiExtraction.found,
      extracted_details: { ...reportState.aiExtraction.extracted_details },
      formatted_address: reportState.aiExtraction.formatted_address,
    },
    location: { ...reportState.location },
    category: { ...reportState.category },
    details: { ...reportState.details },
    status: reportState.status,
    createdAt: reportState.createdAt,
  };
}

function summarizePhoto(photo) {
  return photo ? { name: photo.name } : null;
}

function generateReferenceId() {
  return `JAN-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

function updatePreviewCard() {
  els.previewTitle.textContent = reportState.category.title || "Select a category";
  els.previewAddress.textContent = reportState.location.address || reportState.aiExtraction.formatted_address || "No location selected";
  els.previewPhotoBadge.textContent = `${totalPhotoCount()} photo${totalPhotoCount() === 1 ? "" : "s"}`;
  els.previewWardBadge.textContent = reportState.location.ward ? `Ward: ${reportState.location.ward}` : "Ward not set";
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => els.toast.classList.remove("show"), 2800);
}

function delay(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
