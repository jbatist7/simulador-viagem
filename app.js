// Estado global
const state = { 
    routes: [], 
    nextRouteId: 1, 
    map: null, 
    markers: {}, 
    routeToDelete: null,
    editingRouteId: null,
    editMode: null, // 'add', 'move', 'delete'
    tempMarker: null
};

// Configurações
const CONFIG = { 
    defaultCenter: [-14.2350, -51.9253], 
    defaultZoom: 5, 
    minSpeed: 40, 
    maxSpeed: 700
};

// Inicialização
document.addEventListener('DOMContentLoaded', () => { 
    console.log('🚀 Iniciando Simulador...');
    initMap(); 
    setupEventListeners(); 
    setupSearchBox();
    startSimulationLoop(); 
    console.log('✅ Pronto!');
});

// Inicializar mapa
function initMap() {
    state.map = L.map('map', {
        center: CONFIG.defaultCenter,
        zoom: CONFIG.defaultZoom,
        zoomControl: true,
        scrollWheelZoom: true
    });
    
    // Mapa de satélite Esri
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Esri',
        maxZoom: 19
    }).addTo(state.map);
    
    state.map.on('click', onMapClick);
}

// Event listeners
function setupEventListeners() {
    document.getElementById('btn-new-route').addEventListener('click', createNewRoute);
    document.getElementById('btn-confirm-delete').addEventListener('click', confirmDelete);
    document.getElementById('btn-cancel-delete').addEventListener('click', cancelDelete);
    
    // Tornar painel arrastável
    makePanelDraggable();
}

// Tornar painel arrastável
function makePanelDraggable() {
    const panel = document.querySelector('.routes-panel');
    const header = document.querySelector('.routes-header');
    
    let isDragging = false;
    let startX, startY, initialX, initialY;
    
    header.addEventListener('mousedown', (e) => {
        if (e.target.tagName === 'BUTTON') return;
        
        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;
        
        const rect = panel.getBoundingClientRect();
        initialX = rect.left;
        initialY = rect.top;
        
        panel.style.transition = 'none';
        e.preventDefault();
    });
    
    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        
        panel.style.left = `${initialX + dx}px`;
        panel.style.top = `${initialY + dy}px`;
        panel.style.right = 'auto';
        panel.style.bottom = 'auto';
    });
    
    document.addEventListener('mouseup', () => {
        isDragging = false;
    });
}

// Busca de cidades
function setupSearchBox() {
    const searchInput = document.getElementById('city-search');
    const resultsDiv = document.getElementById('search-results');
    let searchTimeout;
    
    searchInput.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        const query = e.target.value.trim();
        
        if (query.length < 3) {
            resultsDiv.classList.add('hidden');
            return;
        }
        
        searchTimeout = setTimeout(() => searchCity(query), 500);
    });
    
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.search-box')) {
            resultsDiv.classList.add('hidden');
        }
    });
}

async function searchCity(query) {
    const resultsDiv = document.getElementById('search-results');
    
    try {
        const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5&addressdetails=1`);
        const results = await response.json();
        
        if (results.length === 0) {
            resultsDiv.innerHTML = '<div class="search-result-item">Nenhuma cidade encontrada</div>';
            resultsDiv.classList.remove('hidden');
            return;
        }
        
        resultsDiv.innerHTML = results.map(place => `
            <div class="search-result-item" 
                 data-lat="${place.lat}" 
                 data-lon="${place.lon}" 
                 data-name="${place.display_name}">
                📍 ${place.display_name.split(',')[0]}
            </div>
        `).join('');
        
        resultsDiv.classList.remove('hidden');
        
        resultsDiv.querySelectorAll('.search-result-item').forEach(item => {
            item.addEventListener('click', () => {
                const lat = parseFloat(item.dataset.lat);
                const lon = parseFloat(item.dataset.lon);
                const name = item.dataset.name;
                
                addWaypointFromSearch(lat, lon, name);
                resultsDiv.classList.add('hidden');
                document.getElementById('city-search').value = '';
            });
        });
    } catch (error) {
        console.error('Erro na busca:', error);
    }
}

function addWaypointFromSearch(lat, lon, name) {
    if (state.routes.length === 0) createNewRoute();
    
    const lastRoute = state.routes[state.routes.length - 1];
    lastRoute.waypoints.push({ lat, lon, name });
    
    addDraggableMarker(lastRoute.id, lastRoute.waypoints.length - 1, { lat, lon });
    
    if (lastRoute.waypoints.length >= 2) {
        calculateRoute(lastRoute);
    }
    
    state.map.flyTo([lat, lon], 12, { duration: 1.5 });
    renderRoutesList();
    showInfo(`✅ ${name.split(',')[0]}`);
}

function createNewRoute() {
    const route = { 
        id: state.nextRouteId++, 
        waypoints: [], 
        polyline: [], 
        totalMeters: 0, 
        traveledMeters: 0, 
        speedKmh: 80, 
        isPlaying: false, 
        cumulativeDistances: [],
        leafletPolyline: null,
        leafletMarkers: []
    };
    
    state.routes.push(route); 
    renderRoutesList(); 
    showInfo('🆕 Clique no mapa ou busque cidades');
}

function onMapClick(e) {
    // Se estiver em modo de edição (adicionar ponto)
    if (state.editingRouteId && state.editMode === 'add') {
        addPointToRoute(state.editingRouteId, e.latlng);
        return;
    }
    
    if (state.routes.length === 0) {
        createNewRoute();
    }
    
    const lastRoute = state.routes[state.routes.length - 1];
    lastRoute.waypoints.push({ lat: e.latlng.lat, lon: e.latlng.lng });
    
    addDraggableMarker(lastRoute.id, lastRoute.waypoints.length - 1, e.latlng);
    
    if (lastRoute.waypoints.length >= 2) {
        calculateRoute(lastRoute);
    }
    
    renderRoutesList();
}

function addDraggableMarker(routeId, pointIndex, latlng, isIntermediate = false) {
    const marker = L.marker([latlng.lat, latlng.lng], {
        draggable: true,
        title: isIntermediate ? 'Ponto intermediário' : `Ponto ${pointIndex + 1}`
    }).addTo(state.map);
    
    marker.on('drag', (e) => {
        const route = state.routes.find(r => r.id == routeId);
        if (route && route.waypoints[pointIndex]) {
            route.waypoints[pointIndex].lat = e.target.getLatLng().lat;
            route.waypoints[pointIndex].lon = e.target.getLatLng().lng;
        }
    });
    
    marker.on('dragend', (e) => {
        const route = state.routes.find(r => r.id == routeId);
        if (route && route.waypoints.length >= 2) {
            calculateRoute(route);
        }
    });
    
    if (!state.markers[routeId]) state.markers[routeId] = [];
    state.markers[routeId].push(marker);
    
    const route = state.routes.find(r => r.id == routeId);
    if (route) {
        if (!route.leafletMarkers) route.leafletMarkers = [];
        route.leafletMarkers.push(marker);
    }
}

function addPointToRoute(routeId, latlng) {
    const route = state.routes.find(r => r.id == routeId);
    if (!route) return;
    
    // Adicionar ponto no final
    route.waypoints.push({ lat: latlng.lat, lon: latlng.lng });
    
    addDraggableMarker(routeId, route.waypoints.length - 1, latlng);
    calculateRoute(route);
    renderRoutesList();
    
    showInfo(`➕ Ponto ${route.waypoints.length} adicionado`);
}

async function calculateRoute(route) {
    if (route.waypoints.length < 2) return;
    
    showInfo('🛣️ Calculando...');
    
    if (route.leafletPolyline) {
        state.map.removeLayer(route.leafletPolyline);
    }
    
    try {
        const coords = route.waypoints.map(w => `${w.lon},${w.lat}`).join(';');
        const response = await fetch(`https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson&steps=false`);
        const data = await response.json();
        
        if (data.code === 'Ok' && data.routes.length > 0) {
            route.polyline = data.routes[0].geometry.coordinates.map(c => ({ lat: c[1], lon: c[0] }));
            route.totalMeters = data.routes[0].distance;
            route.traveledMeters = 0;
            route.cumulativeDistances = calculateCumulativeDistances(route.polyline);
            drawPolyline(route);
            showInfo(`✅ ${(route.totalMeters / 1000).toFixed(1)} km`);
        } else {
            throw new Error('Rota não encontrada');
        }
    } catch (error) {
        console.error('Erro:', error);
        createDirectLine(route);
    }
    
    renderRoutesList();
}

function createDirectLine(route) {
    route.polyline = route.waypoints.map(w => ({ lat: w.lat, lon: w.lon }));
    route.totalMeters = calculateCumulativeDistances(route.polyline).pop() || 0;
    route.cumulativeDistances = calculateCumulativeDistances(route.polyline);
    drawPolyline(route);
}

function calculateCumulativeDistances(polyline) {
    const cumulative = [0]; 
    let sum = 0;
    
    for (let i = 1; i < polyline.length; i++) {
        sum += haversineDistance(polyline[i-1].lat, polyline[i-1].lon, polyline[i].lat, polyline[i].lon);
        cumulative.push(sum);
    }
    
    return cumulative;
}

function drawPolyline(route) {
    if (route.leafletPolyline) {
        state.map.removeLayer(route.leafletPolyline);
    }
    
    const coordinates = route.polyline.map(p => [p.lat, p.lon]);
    
    route.leafletPolyline = L.polyline(coordinates, {
        color: '#1976D2',
        weight: 5,
        opacity: 0.9,
        lineCap: 'round',
        lineJoin: 'round'
    }).addTo(state.map);
    
    if (coordinates.length > 0) {
        state.map.fitBounds(route.leafletPolyline.getBounds(), { padding: [50, 50], maxZoom: 13 });
    }
}

// Loop de simulação CORRIGIDO
function startSimulationLoop() {
    console.log('⏱️ Loop iniciado');
    
    setInterval(() => {
        state.routes.forEach(route => {
            if (route.isPlaying && route.totalMeters > 0) {
                const speedMps = route.speedKmh / 3.6;
                route.traveledMeters = Math.min(route.totalMeters, route.traveledMeters + (speedMps * 0.1));
                
                if (route.traveledMeters >= route.totalMeters) {
                    route.isPlaying = false;
                    showInfo('🏁 Concluído!');
                }
                
                updateSimulatorMarker(route);
                updateRouteCardUI(route);
            }
        });
    }, 100);
}

function updateSimulatorMarker(route) {
    const position = getPositionAtDistance(route);
    if (!position) return;
    
    const markerId = `simulator-${route.id}`;
    
    if (state.markers[markerId]) {
        state.map.removeLayer(state.markers[markerId]);
    }
    
    const marker = L.circleMarker([position.lat, position.lon], {
        radius: 10,
        color: '#ff5722',
        fillColor: '#ff9800',
        fillOpacity: 1,
        weight: 3
    }).addTo(state.map);
    
    state.markers[markerId] = marker;
    
    if (route.isPlaying) {
        state.map.panTo([position.lat, position.lon], { animate: true, duration: 0.5 });
    }
}

function getPositionAtDistance(route) {
    if (!route.polyline || route.polyline.length === 0 || route.totalMeters === 0) return null;
    if (route.traveledMeters <= 0) return route.polyline[0];
    if (route.traveledMeters >= route.totalMeters) return route.polyline[route.polyline.length - 1];
    
    let segmentIndex = 0;
    for (let i = 0; i < route.cumulativeDistances.length; i++) {
        if (route.cumulativeDistances[i] >= route.traveledMeters) { 
            segmentIndex = Math.max(1, i); 
            break; 
        }
    }
    
    const t = (route.traveledMeters - route.cumulativeDistances[segmentIndex - 1]) / 
              (route.cumulativeDistances[segmentIndex] - route.cumulativeDistances[segmentIndex - 1]);
    
    const p1 = route.polyline[segmentIndex - 1];
    const p2 = route.polyline[segmentIndex];
    
    return { lat: p1.lat + (p2.lat - p1.lat) * t, lon: p1.lon + (p2.lon - p1.lon) * t };
}

// Toggle play/pause CORRIGIDO
window.togglePlay = function(routeId) {
    console.log('🎮 Toggle play:', routeId);
    
    const route = state.routes.find(r => r.id == routeId);
    if (!route) {
        console.error('Rota não encontrada:', routeId);
        return;
    }
    
    if (!route.polyline || route.polyline.length === 0) { 
        showInfo('⚠️ Calcule a rota primeiro'); 
        return; 
    }
    
    route.isPlaying = !route.isPlaying;
    console.log(route.isPlaying ? '▶️ Play' : '⏸️ Pause', 'Rota', route.id);
    
    renderRoutesList();
};

// Seek
window.seekRoute = function(routeId, value) {
    const route = state.routes.find(r => r.id == routeId);
    if (route) {
        route.traveledMeters = route.totalMeters * parseFloat(value);
        updateSimulatorMarker(route);
        updateRouteCardUI(route);
    }
};

// Velocidade
window.setSpeed = function(routeId, value) {
    const route = state.routes.find(r => r.id == routeId);
    if (route) {
        route.speedKmh = Math.max(CONFIG.minSpeed, Math.min(CONFIG.maxSpeed, parseFloat(value)));
    }
};

// Editar rota
window.enableEditMode = function(routeId, mode) {
    state.editingRouteId = routeId;
    state.editMode = mode;
    
    if (mode === 'add') {
        showInfo('➕ Clique no mapa para adicionar ponto');
        state.map.getContainer().style.cursor = 'crosshair';
    } else {
        state.map.getContainer().style.cursor = '';
    }
    
    renderRoutesList();
};

// Deletar rota
window.deleteRoute = function(routeId) { 
    state.routeToDelete = routeId; 
    document.getElementById('confirm-modal').classList.remove('hidden'); 
};

function confirmDelete() {
    if (state.routeToDelete === null) return;
    
    const routeId = state.routeToDelete;
    
    if (state.markers[routeId]) {
        state.markers[routeId].forEach(m => state.map.removeLayer(m));
        delete state.markers[routeId];
    }
    
    const simMarkerId = `simulator-${routeId}`;
    if (state.markers[simMarkerId]) {
        state.map.removeLayer(state.markers[simMarkerId]);
        delete state.markers[simMarkerId];
    }
    
    const route = state.routes.find(r => r.id == routeId);
    if (route && route.leafletPolyline) {
        state.map.removeLayer(route.leafletPolyline);
    }
    
    state.routes = state.routes.filter(r => r.id !== routeId);
    state.routeToDelete = null;
    renderRoutesList();
    showInfo('🗑️ Rota excluída');
    
    document.getElementById('confirm-modal').classList.add('hidden');
}

function cancelDelete() { 
    state.routeToDelete = null; 
    document.getElementById('confirm-modal').classList.add('hidden'); 
}

// Renderizar lista
function renderRoutesList() {
    const container = document.getElementById('routes-list');
    if (!container) return;
    
    if (state.routes.length === 0) {
        container.innerHTML = '<p style="text-align:center;color:#888;padding:15px;font-size:11px;">Nenhuma rota</p>';
        return;
    }
    
    container.innerHTML = state.routes.map(route => {
        const progress = route.totalMeters > 0 ? (route.traveledMeters / route.totalMeters * 100) : 0;
        const isEditing = state.editingRouteId === route.id;
        
        return `
            <div class="route-card ${route.isPlaying ? 'active' : ''}">
                <div class="route-header">
                    <span class="route-title">🛣️ Rota #${route.id} (${route.waypoints.length} pts)</span>
                    <button onclick="deleteRoute(${route.id})">🗑️</button>
                </div>
                <div class="route-controls">
                    <button class="play-btn ${route.isPlaying ? 'paused' : ''}" onclick="togglePlay(${route.id})">
                        ${route.isPlaying ? '⏸️' : '▶️'}
                    </button>
                    <input type="range" class="progress-slider" 
                           min="0" max="1" step="0.01" 
                           value="${route.totalMeters > 0 ? route.traveledMeters / route.totalMeters : 0}" 
                           oninput="seekRoute(${route.id}, this.value)">
                </div>
                <div class="route-stats">
                    <span>📏 ${(route.totalMeters / 1000).toFixed(1)} km</span>
                    <span>✅ ${(route.traveledMeters / 1000).toFixed(1)} km</span>
                    <span>⏳ ${(Math.max(0, route.totalMeters - route.traveledMeters) / 1000).toFixed(1)} km</span>
                </div>
                <div class="speed-control">
                    <span>🚗 ${route.speedKmh} km/h</span>
                    <input type="range" class="speed-slider" 
                           min="${CONFIG.minSpeed}" max="${CONFIG.maxSpeed}" 
                           value="${route.speedKmh}" 
                           oninput="setSpeed(${route.id}, this.value)">
                </div>
                <div class="route-edit-tools">
                    <button class="edit-tool-btn ${isEditing && state.editMode === 'add' ? 'active' : ''}" 
                            onclick="enableEditMode(${route.id}, 'add')">
                        ➕ Adicionar
                    </button>
                    <button class="edit-tool-btn" onclick="enableEditMode(${route.id}, null)">
                        ✔️ OK
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

function updateRouteCardUI(route) {
    const card = document.querySelector(`.route-card:nth-child(${state.routes.indexOf(route) + 1})`);
    if (!card) return;
    
    const slider = card.querySelector('.progress-slider');
    const stats = card.querySelector('.route-stats');
    const speedText = card.querySelector('.speed-control span:first-child');
    
    if (slider) {
        slider.value = route.totalMeters > 0 ? route.traveledMeters / route.totalMeters : 0;
    }
    
    if (stats) {
        stats.innerHTML = `
            <span>📏 ${(route.totalMeters / 1000).toFixed(1)} km</span>
            <span>✅ ${(route.traveledMeters / 1000).toFixed(1)} km</span>
            <span>⏳ ${(Math.max(0, route.totalMeters - route.traveledMeters) / 1000).toFixed(1)} km</span>
        `;
    }
    
    if (speedText) {
        speedText.textContent = `🚗 ${route.speedKmh} km/h`;
    }
}

function showInfo(message) {
    const infoCard = document.querySelector('.hint');
    if (infoCard) {
        infoCard.textContent = message;
        setTimeout(() => { 
            infoCard.textContent = '👆 Toque no mapa ou busque cidades'; 
        }, 3000);
    }
}

function haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) + 
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
              Math.sin(dLon/2) * Math.sin(dLon/2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}
