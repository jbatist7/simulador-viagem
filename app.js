const state = { routes: [], nextRouteId: 1, map: null, markers: {}, polylines: {}, routeToDelete: null };
const CONFIG = { defaultCenter: [-51.9253, -14.2350], defaultZoom: 4, minSpeed: 40, maxSpeed: 700, markerOffsetMeters: 300 };

document.addEventListener('DOMContentLoaded', () => { initMap(); setupEventListeners(); startSimulationLoop(); });

function initMap() {
    state.map = new maplibregl.Map({
        container: 'map', style: 'https://demotiles.maplibre.org/style.json',
        center: CONFIG.defaultCenter, zoom: CONFIG.defaultZoom, attributionControl: false
    });
    state.map.addControl(new maplibregl.AttributionControl({ compact: true, customAttribution: '© OpenStreetMap contributors' }), 'bottom-left');
    state.map.on('click', onMapClick);
}

function setupEventListeners() {
    document.getElementById('btn-new-route').addEventListener('click', createNewRoute);
    document.getElementById('btn-confirm-delete').addEventListener('click', confirmDelete);
    document.getElementById('btn-cancel-delete').addEventListener('click', cancelDelete);
}

function createNewRoute() {
    const route = { id: state.nextRouteId++, waypoints: [], polyline: [], totalMeters: 0, traveledMeters: 0, speedKmh: 80, isPlaying: false, cumulativeDistances: [] };
    state.routes.push(route); renderRoutesList(); showInfo('Nova rota criada! Toque no mapa para adicionar pontos.');
}

function onMapClick(e) {
    if (state.routes.length === 0) createNewRoute();
    const lastRoute = state.routes[state.routes.length - 1];
    lastRoute.waypoints.push({ lat: e.lngLat.lat, lon: e.lngLat.lng });
    addMarker(lastRoute.id, lastRoute.waypoints.length - 1, e.lngLat);
    if (lastRoute.waypoints.length >= 2) calculateRoute(lastRoute);
    renderRoutesList();
}

async function calculateRoute(route) {
    if (route.waypoints.length < 2) return;
    showInfo('Calculando rota...');
    try {
        const coords = route.waypoints.map(w => `${w.lon},${w.lat}`).join(';');
        const response = await fetch(`https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson&steps=false`);
        if (!response.ok) throw new Error('Erro OSRM');
        const data = await response.json();
        if (data.code !== 'Ok') throw new Error('Rota não encontrada');
        route.polyline = data.routes[0].geometry.coordinates.map(c => ({ lat: c[1], lon: c[0] }));
        route.totalMeters = data.routes[0].distance;
        route.traveledMeters = 0;
        route.cumulativeDistances = calculateCumulativeDistances(route.polyline);
        drawPolyline(route);
        showInfo(`Rota calculada: ${(route.totalMeters / 1000).toFixed(1)} km`);
    } catch (error) {
        console.error('Erro na rota:', error);
        showInfo('Erro ao calcular rota. Usando linha reta.');
        createDirectLine(route);
    }
    renderRoutesList();
}

function createDirectLine(route) {
    route.polyline = route.waypoints;
    route.totalMeters = calculateCumulativeDistances(route.polyline).pop() || 0;
    route.cumulativeDistances = calculateCumulativeDistances(route.polyline);
    drawPolyline(route);
}

function calculateCumulativeDistances(polyline) {
    const cumulative = [0]; let sum = 0;
    for (let i = 1; i < polyline.length; i++) {
        sum += haversineDistance(polyline[i-1].lat, polyline[i-1].lon, polyline[i].lat, polyline[i].lon);
        cumulative.push(sum);
    }
    return cumulative;
}

function addMarker(routeId, pointIndex, lngLat) {
    const el = document.createElement('div');
    el.style.cssText = 'width:16px;height:16px;background:#1976D2;border:3px solid white;border-radius:50%;box-shadow:0 2px 4px rgba(0,0,0,0.3);';
    const marker = new maplibregl.Marker({ element: el }).setLngLat(lngLat).addTo(state.map);
    if (!state.markers[routeId]) state.markers[routeId] = [];
    state.markers[routeId].push(marker);
}

function drawPolyline(route) {
    const routeId = `route-${route.id}`;
    if (state.polylines[routeId]) {
        if (state.map.getLayer(routeId)) state.map.removeLayer(routeId);
        if (state.map.getSource(routeId)) state.map.removeSource(routeId);
    }
    const coordinates = route.polyline.map(p => [p.lon, p.lat]);
    state.map.addSource(routeId, { type: 'geojson', data: { type: 'Feature', geometry: { type: 'LineString', coordinates } } });
    state.map.addLayer({ id: routeId, type: 'line', source: routeId, layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#1976D2', 'line-width': 4, 'line-opacity': 0.8 } });
    state.polylines[routeId] = true;
    if (coordinates.length > 0) {
        const bounds = coordinates.reduce((b, c) => b.extend(c), new maplibregl.LngLatBounds(coordinates[0], coordinates[0]));
        state.map.fitBounds(bounds, { padding: 50 });
    }
}

function updateSimulatorMarker(route) {
    const markerId = `simulator-${route.id}`;
    const position = getPositionAtDistance(route);
    if (!position) return;
    if (state.markers[markerId]) state.markers[markerId].remove();
    const el = document.createElement('div');
    el.style.cssText = 'width:20px;height:20px;background:#ff5722;border:3px solid white;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,0.4);';
    const marker = new maplibregl.Marker({ element: el }).setLngLat([position.lon, position.lat]).addTo(state.map);
    state.markers[markerId] = marker;
    if (route.isPlaying) {
        const offset = calculateCameraOffset(position.lat, position.lon, CONFIG.markerOffsetMeters);
        state.map.easeTo({ center: [offset.lon, offset.lat], zoom: 13, duration: 500, easing: t => t });
    }
}

function getPositionAtDistance(route) {
    if (route.polyline.length === 0 || route.totalMeters === 0) return null;
    if (route.traveledMeters <= 0) return route.polyline[0];
    if (route.traveledMeters >= route.totalMeters) return route.polyline[route.polyline.length - 1];
    let segmentIndex = 0;
    for (let i = 0; i < route.cumulativeDistances.length; i++) {
        if (route.cumulativeDistances[i] >= route.traveledMeters) { segmentIndex = Math.max(1, i); break; }
    }
    const segmentStart = route.cumulativeDistances[segmentIndex - 1];
    const segmentEnd = route.cumulativeDistances[segmentIndex];
    const t = segmentEnd > segmentStart ? (route.traveledMeters - segmentStart) / (segmentEnd - segmentStart) : 0;
    const p1 = route.polyline[segmentIndex - 1], p2 = route.polyline[segmentIndex];
    return { lat: p1.lat + (p2.lat - p1.lat) * t, lon: p1.lon + (p2.lon - p1.lon) * t };
}

function calculateCameraOffset(lat, lon, offsetMeters) {
    const earthRadius = 6371000;
    const offsetLon = offsetMeters / (earthRadius * Math.cos(lat * Math.PI / 180)) * 180 / Math.PI;
    return { lat, lon: lon + offsetLon };
}

function startSimulationLoop() {
    setInterval(() => {
        state.routes.forEach(route => {
            if (route.isPlaying && route.totalMeters > 0) {
                const speedMps = route.speedKmh / 3.6;
                route.traveledMeters = Math.min(route.totalMeters, route.traveledMeters + speedMps * 0.1);
                if (route.traveledMeters >= route.totalMeters) route.isPlaying = false;
                updateSimulatorMarker(route);
                updateRouteCard(route);
            }
        });
    }, 100);
}

function togglePlay(route) {
    if (route.polyline.length === 0) { showInfo('Adicione pelo menos 2 pontos à rota'); return; }
    route.isPlaying = !route.isPlaying;
    renderRoutesList();
}

function seekRoute(route, progress) {
    route.traveledMeters = route.totalMeters * progress;
    updateSimulatorMarker(route);
    renderRoutesList();
}

function setSpeed(route, speed) {
    route.speedKmh = Math.max(CONFIG.minSpeed, Math.min(CONFIG.maxSpeed, speed));
    renderRoutesList();
}

function deleteRoute(routeId) { state.routeToDelete = routeId; document.getElementById('confirm-modal').classList.remove('hidden'); }

function confirmDelete() {
    if (state.routeToDelete !== null) {
        if (state.markers[state.routeToDelete]) state.markers[state.routeToDelete].forEach(m => m.remove());
        const simMarkerId = `simulator-${state.routeToDelete}`;
        if (state.markers[simMarkerId]) state.markers[simMarkerId].remove();
        const polylineId = `route-${state.routeToDelete}`;
        if (state.map.getLayer(polylineId)) state.map.removeLayer(polylineId);
        if (state.map.getSource(polylineId)) state.map.removeSource(polylineId);
        state.routes = state.routes.filter(r => r.id !== state.routeToDelete);
        state.routeToDelete = null;
        renderRoutesList();
        showInfo('Rota excluída');
    }
    document.getElementById('confirm-modal').classList.add('hidden');
}

function cancelDelete() { state.routeToDelete = null; document.getElementById('confirm-modal').classList.add('hidden'); }

function renderRoutesList() {
    const container = document.getElementById('routes-list');
    if (state.routes.length === 0) {
        container.innerHTML = '<p style="text-align:center;color:#888;padding:20px;">Nenhuma rota criada. Toque no mapa para começar!</p>';
        return;
    }
    container.innerHTML = state.routes.map(route => `
        <div class="route-card ${route.isPlaying ? 'active' : ''}" data-route-id="${route.id}">
            <div class="route-header">
                <span class="route-title">🛣️ Rota #${route.id} (${route.waypoints.length} pontos)</span>
                <div class="route-actions"><button class="btn-icon" onclick="deleteRoute(${route.id})">🗑️</button></div>
            </div>
            <div class="route-controls">
                <button class="play-btn ${route.isPlaying ? 'paused' : ''}" onclick="togglePlay(${route.id})">${route.isPlaying ? '⏸️' : '▶️'}</button>
                <input type="range" class="progress-slider" min="0" max="1" step="0.01" value="${route.totalMeters > 0 ? route.traveledMeters / route.totalMeters : 0}" oninput="seekRoute(${route.id}, this.value)">
            </div>
            <div class="route-stats">
                <span>📏 ${(route.totalMeters / 1000).toFixed(1)} km total</span>
                <span>✅ ${(route.traveledMeters / 1000).toFixed(1)} km feito</span>
                <span>⏳ ${(Math.max(0, route.totalMeters - route.traveledMeters) / 1000).toFixed(1)} km resta</span>
            </div>
            <div class="speed-control">
                <span>🚗 ${route.speedKmh} km/h</span>
                <input type="range" class="speed-slider" min="${CONFIG.minSpeed}" max="${CONFIG.maxSpeed}" value="${route.speedKmh}" oninput="setSpeed(${route.id}, this.value)">
            </div>
        </div>
    `).join('');
}

function updateRouteCard(route) {
    const card = document.querySelector(`.route-card[data-route-id="${route.id}"]`);
    if (!card) return;
    const slider = card.querySelector('.progress-slider');
    const stats = card.querySelector('.route-stats');
    const speedDisplay = card.querySelector('.speed-control span');
    if (slider) slider.value = route.totalMeters > 0 ? route.traveledMeters / route.totalMeters : 0;
    if (stats) stats.innerHTML = `<span>📏 ${(route.totalMeters / 1000).toFixed(1)} km total</span><span>✅ ${(route.traveledMeters / 1000).toFixed(1)} km feito</span><span>⏳ ${(Math.max(0, route.totalMeters - route.traveledMeters) / 1000).toFixed(1)} km resta</span>`;
    if (speedDisplay) speedDisplay.textContent = `🚗 ${route.speedKmh} km/h`;
}

function showInfo(message) {
    const infoCard = document.querySelector('.info-card p:first-child');
    if (infoCard) {
        infoCard.textContent = `ℹ️ ${message}`;
        setTimeout(() => { infoCard.textContent = '👆 Toque no mapa para criar rotas (origem → destino → paradas)'; }, 3000);
    }
}

function haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon/2) * Math.sin(dLon/2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

window.togglePlay = togglePlay; window.seekRoute = (id, v) => seekRoute(state.routes.find(r => r.id == id), parseFloat(v));
window.setSpeed = (id, v) => setSpeed(state.routes.find(r => r.id == id), parseFloat(v)); window.deleteRoute = deleteRoute;
