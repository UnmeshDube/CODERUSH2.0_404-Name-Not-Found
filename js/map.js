/**
 * Explore Your Neighbourhood - Nagpur civic issue wizard.
 * This keeps the existing Leaflet map instance and layers the wizard on top.
 */

const reportState = {
    location: { lat: null, lng: null, address: '', landmark: '', ward: '' },
    category: { id: null, title: '', department: 'Nagpur Municipal Corporation' },
    images: [],
    details: { description: '', customAddress: '' },
    status: 'Open',
    createdAt: null
};

const app = {
    map: null,
    marker: null,
    lastValidLatLng: null,
    boundaryFeature: null,
    boundaryPolygon: null,
    boundaryMaskLayer: null,
    boundaryOutlineLayer: null,
    categoryCache: [],
    activeStep: 1,
    mapReady: false,
    searchAbortController: null,
    geocodeAbortController: null,
    legacyRequestMarkers: []
};

const NAGPUR_CENTER = [21.1458, 79.0882];
const NAGPUR_BOUNDS = L.latLngBounds(
    L.latLng(21.0200, 78.9500),
    L.latLng(21.2500, 79.2000)
);
const NAGPUR_VIEWBOX = '78.95,21.02,79.20,21.25';
const NAGPUR_GEOCODE_URL = 'https://nominatim.openstreetmap.org/search';
const NAGPUR_REVERSE_URL = 'https://nominatim.openstreetmap.org/reverse';
const CATEGORIES_URL = './categories.json';
const BOUNDARY_URL = './nagpur_boundary.geojson';

window.reportState = reportState;
window.bindExistingMap = bindExistingMap;
window.validateNagpurBounds = validateNagpurBounds;
window.loadCategoriesFromDataset = loadCategoriesFromDataset;
window.updatePreviewCard = updatePreviewCard;
window.goToStep = goToStep;
window.handleFinalSubmission = handleFinalSubmission;

document.addEventListener('DOMContentLoaded', () => {
    const mapContainer = document.getElementById('map');
    if (!mapContainer || typeof L === 'undefined') {
        return;
    }

    const map = L.map('map').setView(NAGPUR_CENTER, 13);
    window.exploreMap = map;

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19
    }).addTo(map);

    map.setMaxBounds(NAGPUR_BOUNDS);
    map.options.maxBoundsViscosity = 1.0;
    map.setMinZoom(11);

    bindExistingMap(map);
    setupWizard();
    setupLegacyRequests(map);
    loadCategoriesFromDataset();

    setTimeout(() => {
        map.invalidateSize();
        app.mapReady = true;
    }, 150);
});

function bindExistingMap(mapInstance) {
    app.map = mapInstance;
    loadBoundaryLayers();

    app.map.on('click', (event) => {
        setLocationFromLatLng(event.latlng, { source: 'map', pan: false });
    });
}

function setupWizard() {
    const confirmLocationButton = document.getElementById('btn-confirm-location');
    const submitButton = document.getElementById('btn-submit-report');
    const step3NextButton = document.getElementById('btn-step3-next');
    const skipPhotoButton = document.getElementById('btn-skip-photo');
    const photoInput = document.getElementById('photo-input');
    const categorySearch = document.getElementById('category-search');
    const locationInput = document.getElementById('address-input');
    const findButton = document.getElementById('btn-find');
    const geoButton = document.getElementById('btn-geolocation');
    const descriptionInput = document.getElementById('issue-description');
    const customAddressInput = document.getElementById('custom-address');

    document.querySelectorAll('[data-step-back]').forEach((button) => {
        button.addEventListener('click', () => {
            const targetStep = Number(button.getAttribute('data-step-back') || '1');
            goToStep(targetStep);
        });
    });

    document.querySelectorAll('[data-step-indicator]').forEach((item) => {
        item.addEventListener('click', () => {
            const targetStep = Number(item.getAttribute('data-step-indicator') || '1');
            if (targetStep <= app.activeStep || targetStep === 1) {
                goToStep(targetStep);
            }
        });
    });

    if (confirmLocationButton) {
        confirmLocationButton.addEventListener('click', async () => {
            if (!reportState.location.lat || !reportState.location.lng) {
                showToast('Select a point inside Nagpur before continuing.');
                return;
            }

            const snapshot = await reverseGeocodeSelectedPoint();
            if (snapshot) {
                reportState.location.address = snapshot.address || reportState.location.address;
                reportState.location.landmark = snapshot.landmark || reportState.location.landmark;
                reportState.location.ward = snapshot.ward || reportState.location.ward;
                const addressField = document.getElementById('custom-address');
                if (addressField && !addressField.value.trim()) {
                    addressField.value = snapshot.address || snapshot.landmark || '';
                }
            }

            updatePreviewCard();
            goToStep(2);
        });
    }

    if (findButton && locationInput) {
        const runSearch = () => {
            const query = locationInput.value.trim();
            if (!query) {
                showToast('Enter a place or address to search.');
                return;
            }
            searchNagpurLocation(query);
        };

        findButton.addEventListener('click', runSearch);
        locationInput.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                runSearch();
            }
        });
    }

    if (geoButton) {
        geoButton.addEventListener('click', () => {
            useCurrentLocation();
        });
    }

    if (categorySearch) {
        categorySearch.addEventListener('input', () => {
            renderCategoryList(categorySearch.value.trim());
        });
    }

    if (photoInput) {
        photoInput.addEventListener('change', (event) => {
            handlePhotoSelection(event.target.files);
            photoInput.value = '';
        });
    }

    const dropzone = document.getElementById('photo-dropzone');
    if (dropzone && photoInput) {
        dropzone.addEventListener('dragover', (event) => {
            event.preventDefault();
            dropzone.classList.add('drag-active');
        });
        dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag-active'));
        dropzone.addEventListener('drop', (event) => {
            event.preventDefault();
            dropzone.classList.remove('drag-active');
            handlePhotoSelection(event.dataTransfer.files);
        });
    }

    if (skipPhotoButton) {
        skipPhotoButton.addEventListener('click', () => {
            goToStep(4);
        });
    }

    if (step3NextButton) {
        step3NextButton.addEventListener('click', () => {
            goToStep(4);
        });
    }

    if (descriptionInput) {
        descriptionInput.addEventListener('input', () => {
            reportState.details.description = descriptionInput.value;
            updatePreviewCard();
        });
    }

    if (customAddressInput) {
        customAddressInput.addEventListener('input', () => {
            reportState.details.customAddress = customAddressInput.value;
            updatePreviewCard();
        });
    }

    if (submitButton) {
        submitButton.addEventListener('click', handleFinalSubmission);
    }

    updatePreviewCard();
}

let currentMapCategoryFilter = 'all';
let allNagpurComplaints = [];

async function setupLegacyRequests(map) {
    window.refreshNagpurMap = () => loadAndRenderLiveMapData(map);
    window.filterMapCategory = (cat, btn) => {
        currentMapCategoryFilter = cat;
        if (btn) {
            document.querySelectorAll('.filter-btn-pill').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        }
        renderFilteredNagpurMap(map);
    };

    window.handleMapSearch = (query) => {
        const q = (query || '').toLowerCase().trim();
        const filtered = allNagpurComplaints.filter(c => 
            c.address.toLowerCase().includes(q) || 
            (c.description || '').toLowerCase().includes(q)
        );
        renderComplaintsOnMapAndSidebar(map, filtered);
    };

    await loadAndRenderLiveMapData(map);
}

async function loadAndRenderLiveMapData(map) {
    let reports = [];
    try {
        const res = await fetch('/api/reports');
        if (res.ok) {
            reports = await res.json();
        }
    } catch (e) {
        console.warn("Using localStorage reports fallback", e);
        reports = JSON.parse(localStorage.getItem('civic_reports') || '[]');
    }

    // Default Nagpur seed complaints if DB is empty
    if (reports.length === 0) {
        const sampleLocations = [
            { address: 'Sitabuldi Main Market, Ward 12', title: 'Pothole & Surface Damage', category: 'Infrastructure & Roads', lat: 21.1458, lng: 79.0882, upvotes: 12, priority: 'HIGHEST PRIORITY (URGENT)' },
            { address: 'Sadar Bazar Residency Road, Ward 14', title: 'Garbage Dump Overflow', category: 'Sanitation & Waste', lat: 21.1610, lng: 79.0800, upvotes: 8, priority: 'HIGH' },
            { address: 'Dharampeth College Square, Ward 8', title: 'Water Main Line Burst', category: 'Water & Electricity', lat: 21.1400, lng: 79.0650, upvotes: 14, priority: 'HIGHEST PRIORITY (URGENT)' },
            { address: 'Civil Lines Near High Court, Ward 10', title: 'Dangerous Overhanging Tree Branch', category: 'Environment & Parks', lat: 21.1550, lng: 79.0720, upvotes: 3, priority: 'NORMAL' },
            { address: 'Itwari Grain Market, Ward 18', title: 'Drain Sewage Overflow', category: 'Sanitation & Waste', lat: 21.1520, lng: 79.1120, upvotes: 11, priority: 'HIGHEST PRIORITY (URGENT)' }
        ];

        sampleLocations.forEach((item, idx) => {
            reports.push({
                id: 'NMC-' + (700000 + idx),
                address: item.address,
                description: item.title,
                category: item.category,
                lat: item.lat,
                lng: item.lng,
                upvotes: item.upvotes,
                priority: item.priority,
                photo: 'assets/nagpur.jpeg',
                timestamp: new Date(Date.now() - idx * 3600000).toISOString()
            });
        });
    }

    // Ensure all complaints have lat/lng mapped within Nagpur bounds
    reports.forEach((item, index) => {
        if (!item.lat || !item.lng) {
            const latOffset = (Math.sin(index * 1.5) * 0.04);
            const lngOffset = (Math.cos(index * 1.5) * 0.05);
            item.lat = NAGPUR_CENTER[0] + latOffset;
            item.lng = NAGPUR_CENTER[1] + lngOffset;
        }
    });

    allNagpurComplaints = reports;
    renderFilteredNagpurMap(map);
}

function renderFilteredNagpurMap(map) {
    let filtered = allNagpurComplaints;
    if (currentMapCategoryFilter === 'urgent') {
        filtered = allNagpurComplaints.filter(c => (c.upvotes || 1) >= 10 || c.priority === 'HIGHEST PRIORITY (URGENT)');
    } else if (currentMapCategoryFilter !== 'all') {
        filtered = allNagpurComplaints.filter(c => 
            (c.category && c.category.includes(currentMapCategoryFilter)) || 
            (c.address && c.address.includes(currentMapCategoryFilter)) ||
            (c.description && c.description.includes(currentMapCategoryFilter))
        );
    }
    renderComplaintsOnMapAndSidebar(map, filtered);
}

function renderComplaintsOnMapAndSidebar(map, complaints) {
    const requestList = document.getElementById('request-list');
    const requestCount = document.getElementById('request-count');

    // Clear existing markers
    if (app.legacyRequestMarkers) {
        app.legacyRequestMarkers.forEach(m => map.removeLayer(m));
    }
    app.legacyRequestMarkers = [];

    if (requestCount) {
        requestCount.textContent = `Showing ${complaints.length} Live Issues`;
    }

    if (requestList) {
        requestList.innerHTML = '';
    }

    if (complaints.length === 0 && requestList) {
        requestList.innerHTML = `
            <div style="text-align: center; color: #64748b; padding: 40px 10px;">
                <i class="fas fa-search-location" style="font-size: 2.5rem; margin-bottom: 10px; opacity: 0.5;"></i>
                <p>No complaints found for this filter in Nagpur.</p>
            </div>`;
        return;
    }

    complaints.forEach((complaint) => {
        const votes = complaint.upvotes || 1;
        const isUrgent = votes >= 10 || complaint.priority === 'HIGHEST PRIORITY (URGENT)';
        
        let markerClass = 'marker-low';
        if (isUrgent) {
            markerClass = 'marker-high';
        } else if (votes >= 5 || complaint.priority === 'HIGH') {
            markerClass = 'marker-medium';
        }

        // Custom Leaflet Marker Pin
        const customIcon = L.divIcon({
            className: 'custom-marker',
            html: `<div class="marker-pin ${markerClass}"></div>`,
            iconSize: [32, 42],
            iconAnchor: [16, 42]
        });

        const marker = L.marker([complaint.lat, complaint.lng], { icon: customIcon }).addTo(map);
        
        const popupHtml = `
            <div style="min-width: 200px;">
                <div class="popup-card-header">${complaint.title || 'Civic Issue'} (ID: ${complaint.id})</div>
                <div style="font-size: 0.8rem; font-weight: bold; color: #8b5cf6; margin-bottom: 4px;"><i class="fas fa-tag"></i> ${complaint.category || 'General'}</div>
                <div class="popup-location-tag"><i class="fas fa-map-marker-alt"></i> ${complaint.address}</div>
                <div style="font-size: 0.9rem; color: #334155; margin-bottom: 8px;">${complaint.description || 'Civic Issue Reported'}</div>
                <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid #e2e8f0; padding-top: 8px; margin-top: 8px;">
                    <span style="font-size: 0.8rem; font-weight: 700; color: ${isUrgent ? '#ef4444' : '#0284c7'};">
                        ${isUrgent ? '🔥 HIGHEST PRIORITY (URGENT)' : '👥 ' + votes + ' Citizen Reports'}
                    </span>
                </div>
            </div>`;

        marker.bindPopup(popupHtml);
        app.legacyRequestMarkers.push(marker);

        // Sidebar Card Element
        if (requestList) {
            const card = document.createElement('div');
            card.className = `sidebar-card ${isUrgent ? 'sidebar-card-urgent' : ''}`;
            
            card.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 4px;">
                    <strong style="color: var(--navy); font-size: 0.95rem;">${complaint.title || 'Civic Issue'} (ID: ${complaint.id})</strong>
                    ${isUrgent ? '<span style="background: #ef4444; color: white; font-size: 0.7rem; font-weight: 700; padding: 2px 8px; border-radius: 10px;">🔥 URGENT</span>' : ''}
                </div>
                <div style="font-size: 0.8rem; font-weight: bold; color: #8b5cf6; margin-bottom: 4px;"><i class="fas fa-tag"></i> ${complaint.category || 'General'}</div>
                <div style="font-size: 0.85rem; font-weight: 600; color: var(--teal); margin-bottom: 4px;">
                    <i class="fas fa-location-dot"></i> ${complaint.address}
                </div>
                <div style="font-size: 0.85rem; color: #475569; margin-bottom: 8px; line-height: 1.4;">
                    ${complaint.description || 'Civic complaint'}
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px dashed #e2e8f0; padding-top: 8px;">
                    <span style="font-size: 0.8rem; font-weight: 700; color: #1e40af;">
                        <i class="fas fa-users"></i> ${votes} Citizen ${votes === 1 ? 'Report' : 'Reports'}
                    </span>
                    <button type="button" style="background: var(--navy); color: white; border: none; padding: 4px 10px; border-radius: 6px; font-size: 0.75rem; font-weight: 600; cursor: pointer;">
                        Focus on Map <i class="fas fa-crosshairs"></i>
                    </button>
                </div>
            `;

            card.addEventListener('click', () => {
                map.setView([complaint.lat, complaint.lng], 16, { animate: true });
                marker.openPopup();

                document.querySelectorAll('.sidebar-card').forEach((el) => {
                    el.classList.remove('active');
                });
                card.classList.add('active');
            });

            requestList.appendChild(card);
        }
    });
}

async function loadBoundaryLayers() {
    const fallback = createFallbackBoundaryFeature();
    renderBoundaryFeature(fallback);

    try {
        const response = await fetch(BOUNDARY_URL);
        if (!response.ok) {
            return;
        }

        const geojson = await response.json();
        const feature = normalizeBoundaryFeature(geojson) || fallback;
        renderBoundaryFeature(feature);
    } catch (error) {
        console.warn('Boundary GeoJSON could not be loaded, using fallback boundary.', error);
    }
}

function normalizeBoundaryFeature(geojson) {
    if (!geojson) {
        return null;
    }

    if (geojson.type === 'FeatureCollection' && Array.isArray(geojson.features) && geojson.features.length > 0) {
        return geojson.features[0];
    }

    if (geojson.type === 'Feature' && geojson.geometry) {
        return geojson;
    }

    if (geojson.type === 'Polygon' || geojson.type === 'MultiPolygon') {
        return {
            type: 'Feature',
            properties: {},
            geometry: geojson
        };
    }

    return null;
}

function createFallbackBoundaryFeature() {
    return {
        type: 'Feature',
        properties: { name: 'Nagpur bounds fallback' },
        geometry: {
            type: 'Polygon',
            coordinates: [[
                [78.9500, 21.0200],
                [79.2000, 21.0200],
                [79.2000, 21.2500],
                [78.9500, 21.2500],
                [78.9500, 21.0200]
            ]]
        }
    };
}

function renderBoundaryFeature(feature) {
    if (!app.map || !feature || !feature.geometry) {
        return;
    }

    app.boundaryFeature = feature;
    app.boundaryPolygon = extractPrimaryPolygon(feature.geometry);

    if (app.boundaryMaskLayer) {
        app.map.removeLayer(app.boundaryMaskLayer);
    }
    if (app.boundaryOutlineLayer) {
        app.map.removeLayer(app.boundaryOutlineLayer);
    }

    const maskGeometry = createMaskGeometry(app.boundaryPolygon || createFallbackBoundaryFeature().geometry.coordinates[0]);
    app.boundaryMaskLayer = L.geoJSON(maskGeometry, {
        style: {
            color: '#93c5fd',
            weight: 1,
            fillColor: '#0f172a',
            fillOpacity: 0.20,
            opacity: 0.8
        }
    }).addTo(app.map);

    app.boundaryOutlineLayer = L.geoJSON(feature, {
        style: {
            color: '#2563EB',
            weight: 2,
            dashArray: '5,5',
            fillOpacity: 0
        }
    }).addTo(app.map);
}

function extractPrimaryPolygon(geometry) {
    if (!geometry) {
        return null;
    }

    if (geometry.type === 'Polygon' && Array.isArray(geometry.coordinates)) {
        return geometry.coordinates[0];
    }

    if (geometry.type === 'MultiPolygon' && Array.isArray(geometry.coordinates) && geometry.coordinates.length > 0) {
        return geometry.coordinates[0][0];
    }

    return null;
}

function createMaskGeometry(boundaryRing) {
    const worldRing = [
        [-180, -90],
        [180, -90],
        [180, 90],
        [-180, 90],
        [-180, -90]
    ];

    return {
        type: 'Feature',
        properties: {},
        geometry: {
            type: 'Polygon',
            coordinates: [worldRing, boundaryRing]
        }
    };
}

function validateNagpurBounds(lat, lng) {
    const point = [lng, lat];
    if (window.turf && app.boundaryFeature) {
        try {
            return window.turf.booleanPointInPolygon(window.turf.point(point), app.boundaryFeature);
        } catch (error) {
            console.warn('Turf boundary validation failed, falling back to manual polygon check.', error);
        }
    }

    if (!app.boundaryPolygon) {
        return lat >= 21.0200 && lat <= 21.2500 && lng >= 78.9500 && lng <= 79.2000;
    }

    return pointInPolygon(point, app.boundaryPolygon);
}

function pointInPolygon(point, ring) {
    const x = point[0];
    const y = point[1];
    let inside = false;

    for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
        const xi = ring[i][0];
        const yi = ring[i][1];
        const xj = ring[j][0];
        const yj = ring[j][1];

        const intersects = ((yi > y) !== (yj > y)) &&
            (x < ((xj - xi) * (y - yi)) / ((yj - yi) || Number.EPSILON) + xi);

        if (intersects) {
            inside = !inside;
        }
    }

    return inside;
}

function setLocationFromLatLng(latlng, options = {}) {
    const { source = 'map', pan = true } = options;
    const latitude = Number(latlng.lat);
    const longitude = Number(latlng.lng);

    if (!validateNagpurBounds(latitude, longitude)) {
        showToast('Complaints can only be submitted within Nagpur Municipal Corporation boundaries.');
        if (app.marker && app.lastValidLatLng) {
            app.marker.setLatLng(app.lastValidLatLng);
        }
        if (source === 'geolocation' && app.map) {
            app.map.setView(NAGPUR_CENTER, 13);
        }
        return Promise.resolve(false);
    }

    reportState.location.lat = latitude;
    reportState.location.lng = longitude;
    app.lastValidLatLng = L.latLng(latitude, longitude);

    if (!app.marker) {
        app.marker = L.marker([latitude, longitude], {
            draggable: true,
            icon: createLocationIcon()
        }).addTo(app.map);

        app.marker.on('dragstart', () => {
            app.lastValidLatLng = app.marker.getLatLng();
        });

        app.marker.on('dragend', async () => {
            const markerLatLng = app.marker.getLatLng();
            const allowed = validateNagpurBounds(markerLatLng.lat, markerLatLng.lng);
            if (!allowed) {
                showToast('Complaints can only be submitted within Nagpur Municipal Corporation boundaries.');
                app.marker.setLatLng(app.lastValidLatLng);
                return;
            }

            app.lastValidLatLng = markerLatLng;
            reportState.location.lat = markerLatLng.lat;
            reportState.location.lng = markerLatLng.lng;
            await reverseGeocodeSelectedPoint();
            updatePreviewCard();
        });
    } else {
        app.marker.setLatLng([latitude, longitude]);
    }

    if (pan && app.map) {
        app.map.setView([latitude, longitude], Math.max(app.map.getZoom(), 15), { animate: true });
    }

    reportState.location.lat = latitude;
    reportState.location.lng = longitude;
    updateLocationStatus('Selected location is inside Nagpur.');
    updatePreviewCard();

    return reverseGeocodeSelectedPoint().then((result) => {
        if (result) {
            reportState.location.address = result.address || reportState.location.address;
            reportState.location.landmark = result.landmark || reportState.location.landmark;
            reportState.location.ward = result.ward || reportState.location.ward;

            const customAddressInput = document.getElementById('custom-address');
            if (customAddressInput && !customAddressInput.value.trim()) {
                customAddressInput.value = result.address || result.landmark || '';
                reportState.details.customAddress = customAddressInput.value;
            }

            updateLocationStatus(result.address ? `Pinned: ${result.address}` : 'Location confirmed inside Nagpur.');
            updatePreviewCard();
        }

        return true;
    });
}

function createLocationIcon() {
    return L.divIcon({
        className: 'location-marker',
        html: '<div class="location-pin"></div>',
        iconSize: [30, 42],
        iconAnchor: [15, 42]
    });
}

async function searchNagpurLocation(query) {
    if (app.searchAbortController) {
        app.searchAbortController.abort();
    }

    app.searchAbortController = new AbortController();
    const controller = app.searchAbortController;
    const searchResults = document.getElementById('search-results');

    if (searchResults) {
        searchResults.innerHTML = '<div class="empty-state">Searching Nagpur results...</div>';
    }

    const url = new URL(NAGPUR_GEOCODE_URL);
    url.searchParams.set('q', query);
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('limit', '5');
    url.searchParams.set('addressdetails', '1');
    url.searchParams.set('viewbox', NAGPUR_VIEWBOX);
    url.searchParams.set('bounded', '1');

    try {
        const response = await fetch(url.toString(), {
            signal: controller.signal,
            headers: {
                'Accept': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`Search failed with status ${response.status}`);
        }

        const results = await response.json();
        renderSearchResults(results || []);
    } catch (error) {
        if (error.name === 'AbortError') {
            return;
        }

        console.warn('Location search failed.', error);
        if (searchResults) {
            searchResults.innerHTML = '<div class="empty-state">No search results found. Try a more specific address.</div>';
        }
    }
}

function renderSearchResults(results) {
    const searchResults = document.getElementById('search-results');
    if (!searchResults) {
        return;
    }

    if (!Array.isArray(results) || results.length === 0) {
        searchResults.innerHTML = '<div class="empty-state">No search results found inside Nagpur.</div>';
        return;
    }

    searchResults.innerHTML = '';
    results.forEach((result) => {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'search-result-item';
        item.innerHTML = `
            <strong>${escapeHtml(result.display_name || 'Unknown location')}</strong>
            <span>${escapeHtml(buildResultSummary(result.address || {}))}</span>
        `;
        item.addEventListener('click', () => {
            const lat = Number(result.lat);
            const lng = Number(result.lon);
            setLocationFromLatLng(L.latLng(lat, lng), { source: 'search', pan: true });
            searchResults.innerHTML = '';
        });
        searchResults.appendChild(item);
    });
}

function buildResultSummary(address) {
    const parts = [
        address.road,
        address.suburb,
        address.neighbourhood,
        address.city || address.town || address.village,
        address.postcode
    ].filter(Boolean);

    return parts.join(', ');
}

async function reverseGeocodeSelectedPoint() {
    if (!app.map || reportState.location.lat == null || reportState.location.lng == null) {
        return null;
    }

    if (app.geocodeAbortController) {
        app.geocodeAbortController.abort();
    }

    app.geocodeAbortController = new AbortController();
    const controller = app.geocodeAbortController;

    const url = new URL(NAGPUR_REVERSE_URL);
    url.searchParams.set('lat', String(reportState.location.lat));
    url.searchParams.set('lon', String(reportState.location.lng));
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('addressdetails', '1');
    url.searchParams.set('zoom', '18');
    url.searchParams.set('viewbox', NAGPUR_VIEWBOX);
    url.searchParams.set('bounded', '1');

    try {
        const response = await fetch(url.toString(), {
            signal: controller.signal,
            headers: {
                'Accept': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`Reverse geocode failed with status ${response.status}`);
        }

        const data = await response.json();
        if (!data) {
            return null;
        }

        const address = composeAddress(data.address || {}, data.display_name || '');
        const landmark = buildLandmark(data.address || {}, data.display_name || '');
        const ward = buildWardLabel(data.address || {});

        reportState.location.address = address;
        reportState.location.landmark = landmark;
        reportState.location.ward = ward;

        return { address, landmark, ward };
    } catch (error) {
        if (error.name === 'AbortError') {
            return null;
        }

        console.warn('Reverse geocoding failed.', error);
        const fallbackAddress = `Selected point at ${reportState.location.lat.toFixed(5)}, ${reportState.location.lng.toFixed(5)}`;
        reportState.location.address = fallbackAddress;
        reportState.location.landmark = fallbackAddress;
        return { address: fallbackAddress, landmark: fallbackAddress, ward: '' };
    }
}

function composeAddress(address, displayName) {
    const parts = [
        address.house_number,
        address.road,
        address.neighbourhood || address.suburb,
        address.city || address.town || address.village,
        address.state,
        address.postcode
    ].filter(Boolean);

    if (parts.length > 0) {
        return parts.join(', ');
    }

    return displayName || '';
}

function buildLandmark(address, displayName) {
    const parts = [
        address.road,
        address.neighbourhood,
        address.suburb,
        address.city || address.town || address.village
    ].filter(Boolean);

    if (parts.length > 0) {
        return parts.join(', ');
    }

    return displayName || '';
}

function buildWardLabel(address) {
    const wardValue = address.city_district || address.county || address.state_district || address.suburb;
    return wardValue ? String(wardValue) : '';
}

async function loadCategoriesFromDataset() {
    try {
        const response = await fetch(CATEGORIES_URL);
        if (!response.ok) {
            throw new Error(`Unable to load categories.json (${response.status})`);
        }

        const categories = await response.json();
        app.categoryCache = Array.isArray(categories) ? categories : [];
        renderCategoryList('');
    } catch (error) {
        console.warn('Failed to load categories.json, using fallback categories.', error);
        app.categoryCache = [
            {
                id: 'general-civic-issue',
                title: 'General Civic Issue',
                description: 'Fallback category shown when categories.json cannot be loaded.',
                sourceFile: 'fallback',
                department: 'Nagpur Municipal Corporation'
            }
        ];
        renderCategoryList('');
        showToast('Categories could not be loaded, so a basic fallback list is shown.');
    }
}

function renderCategoryList(filterText) {
    const container = document.getElementById('category-list');
    if (!container) {
        return;
    }

    const query = (filterText || '').toLowerCase();
    const filteredCategories = app.categoryCache.filter((category) => {
        const title = (category.title || '').toLowerCase();
        const description = (category.description || '').toLowerCase();
        return title.includes(query) || description.includes(query);
    });

    container.innerHTML = '';

    if (filteredCategories.length === 0) {
        container.innerHTML = '<div class="empty-state">No matching categories found.</div>';
        return;
    }

    filteredCategories.forEach((category) => {
        const row = document.createElement('button');
        row.type = 'button';
        row.className = `category-row${reportState.category.id === category.id ? ' active' : ''}`;
        row.innerHTML = `
            <div class="category-copy">
                <h3>${escapeHtml(category.title || 'Untitled category')}</h3>
                <p>${escapeHtml(category.description || category.tooltip || category.sourceFile || '')}</p>
            </div>
            <div class="category-meta">
                ${reportState.category.id === category.id ? '<i class="fa-solid fa-check"></i>' : '<i class="fa-regular fa-circle"></i>'}
            </div>
        `;

        row.addEventListener('click', () => {
            reportState.category.id = category.id || '';
            reportState.category.title = category.title || '';
            reportState.category.department = category.department || 'Nagpur Municipal Corporation';
            updatePreviewCard();
            renderCategoryList(query);
            goToStep(3);
        });

        container.appendChild(row);
    });
}

function handlePhotoSelection(fileList) {
    const files = Array.from(fileList || []);
    if (files.length === 0) {
        return;
    }

    const remainingSlots = Math.max(0, 5 - reportState.images.length);
    const acceptedFiles = files.slice(0, remainingSlots);

    if (acceptedFiles.length < files.length) {
        showToast('You can add up to 5 images total.');
    }

    acceptedFiles.forEach((file) => {
        if (!file.type || !file.type.startsWith('image/')) {
            return;
        }

        const reader = new FileReader();
        reader.onload = () => {
            reportState.images.push({
                name: file.name,
                type: file.type,
                dataUrl: String(reader.result || '')
            });
            updatePhotoPreview();
            updatePreviewCard();
        };
        reader.readAsDataURL(file);
    });
}

function updatePhotoPreview() {
    const grid = document.getElementById('thumbnail-grid');
    if (!grid) {
        return;
    }

    grid.innerHTML = '';

    if (reportState.images.length === 0) {
        grid.innerHTML = '<div class="empty-state">No photos added yet. You can still continue without one.</div>';
        return;
    }

    reportState.images.forEach((image, index) => {
        const card = document.createElement('div');
        card.className = 'thumbnail-card';
        card.innerHTML = `
            <img src="${image.dataUrl}" alt="${escapeHtml(image.name)}">
            <button type="button" class="thumbnail-remove" aria-label="Remove image">×</button>
        `;
        const removeButton = card.querySelector('.thumbnail-remove');
        if (removeButton) {
            removeButton.addEventListener('click', () => {
                reportState.images.splice(index, 1);
                updatePhotoPreview();
                updatePreviewCard();
            });
        }
        grid.appendChild(card);
    });
}

function updatePreviewCard() {
    const title = document.getElementById('preview-title');
    const address = document.getElementById('preview-address');
    const status = document.getElementById('preview-status');
    const step = document.getElementById('preview-step');
    const department = document.getElementById('preview-department');
    const previewPhotos = document.getElementById('preview-photos');

    if (title) {
        title.textContent = reportState.category.title || 'Select a category';
    }

    if (address) {
        address.textContent = reportState.location.address || 'No location selected';
    }

    if (status) {
        status.textContent = reportState.status || 'Open';
    }

    if (step) {
        step.textContent = `Step ${app.activeStep} of 4`;
    }

    if (department) {
        department.innerHTML = `<i class="fa-solid fa-landmark"></i> ${escapeHtml(reportState.category.department || 'Nagpur Municipal Corporation')}`;
    }

    if (previewPhotos) {
        previewPhotos.innerHTML = '';
        if (reportState.images.length === 0) {
            previewPhotos.innerHTML = '<span class="text-muted">No photos attached yet.</span>';
        } else {
            reportState.images.slice(0, 3).forEach((image) => {
                const thumb = document.createElement('div');
                thumb.className = 'preview-thumb';
                thumb.innerHTML = `<img src="${image.dataUrl}" alt="${escapeHtml(image.name)}">`;
                previewPhotos.appendChild(thumb);
            });

            if (reportState.images.length > 3) {
                const more = document.createElement('div');
                more.className = 'preview-thumb';
                more.innerHTML = `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-weight:800;color:#0f172a;background:#f8fafc;">+${reportState.images.length - 3}</div>`;
                previewPhotos.appendChild(more);
            }
        }
    }
}

function goToStep(stepNumber) {
    app.activeStep = Math.min(4, Math.max(1, Number(stepNumber) || 1));

    document.querySelectorAll('[data-step-panel]').forEach((panel) => {
        const panelStep = Number(panel.getAttribute('data-step-panel') || '1');
        panel.classList.toggle('active', panelStep === app.activeStep);
    });

    document.querySelectorAll('[data-step-indicator]').forEach((indicator) => {
        const indicatorStep = Number(indicator.getAttribute('data-step-indicator') || '1');
        indicator.classList.toggle('active', indicatorStep === app.activeStep);
    });

    updatePreviewCard();

    if (app.map && app.mapReady) {
        setTimeout(() => {
            app.map.invalidateSize();
        }, 50);
    }

    if (app.activeStep === 2) {
        renderCategoryList(document.getElementById('category-search')?.value || '');
    } else if (app.activeStep === 3) {
        updatePhotoPreview();
    }
}

async function handleFinalSubmission() {
    const descriptionInput = document.getElementById('issue-description');
    const customAddressInput = document.getElementById('custom-address');

    reportState.details.description = descriptionInput ? descriptionInput.value.trim() : '';
    reportState.details.customAddress = customAddressInput ? customAddressInput.value.trim() : '';
    reportState.createdAt = new Date().toISOString();

    const payload = {
        ...reportState,
        source: 'explore.html',
        savedAt: new Date().toISOString()
    };

    try {
        localStorage.setItem('nagpur-civic-issue-draft', JSON.stringify(payload));
    } catch (error) {
        console.warn('Unable to persist report draft locally.', error);
    }

    console.log('Serialized civic issue payload:', payload);
    showToast('Request saved locally and ready for submission.');
    updatePreviewCard();
}

function updateLocationStatus(message) {
    const status = document.getElementById('location-status');
    if (status) {
        status.textContent = message;
    }
}

function showToast(message, title = 'Notice') {
    const container = document.getElementById('toast-container');
    if (!container) {
        alert(message);
        return;
    }

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `
        <strong>${escapeHtml(title)}</strong>
        <p>${escapeHtml(message)}</p>
    `;
    container.appendChild(toast);

    window.setTimeout(() => {
        toast.remove();
    }, 3800);
}

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

async function useCurrentLocation() {
    const button = document.getElementById('btn-geolocation');
    if (!navigator.geolocation) {
        showToast('Geolocation is not supported by this browser.');
        return;
    }

    if (button) {
        button.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
    }

    navigator.geolocation.getCurrentPosition(
        async (position) => {
            const { latitude, longitude } = position.coords;
            if (!validateNagpurBounds(latitude, longitude)) {
                showToast('Complaints can only be submitted within Nagpur Municipal Corporation boundaries.');
                if (app.map) {
                    app.map.setView(NAGPUR_CENTER, 13);
                }
                if (button) {
                    button.innerHTML = '<i class="fa-solid fa-crosshairs"></i>';
                }
                return;
            }

            await setLocationFromLatLng(L.latLng(latitude, longitude), { source: 'geolocation', pan: true });
            if (button) {
                button.innerHTML = '<i class="fa-solid fa-crosshairs"></i>';
            }
        },
        () => {
            showToast('Could not get your location. Returning to Nagpur center.');
            if (app.map) {
                app.map.setView(NAGPUR_CENTER, 13);
            }
            if (button) {
                button.innerHTML = '<i class="fa-solid fa-crosshairs"></i>';
            }
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
}
