// Estado global
const state = { 
    routes: [], 
    nextRouteId: 1, 
    map: null, 
    markers: {}, 
    routeToDelete: null,
    allPaused: false,
    waypointFrom: null,
    waypointTo: null,
    searchPanelVisible: true
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
    setupSearchBoxes();
    startSimulationLoop(); 
    console.log('✅ Pronto!');
});

// Inicializar mapa - ORDEM DAS CAMADAS CORRIGIDA
function initMap() {
    state.map = L.map('map', {
        center: CONFIG.defaultCenter,
        zoom: CONFIG.defaultZoom,
        zoomControl: true,
        scrollWheelZoom: true
    });
    
    // 1ª camada: Satélite (base)
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Esri',
        maxZoom: 19,
        opacity: 1
    }).addTo(state.map);
    
    // 2ª camada: Rotas (polyline vai aqui - entre base e labels)
    // As rotas serão adicionadas dinamicamente com zIndex: 2
    
    // 3ª camada: Labels (cidades, lugares) - POR ÚLTIMO para ficar por cima
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', {
        attribution: '',
        maxZoom: 19,
        opacity: 0.9,
        zIndex: 10
    }).addTo(state.map);
    
    // 4ª camada: Rodovias e transporte
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}', {
        attribution: '',
        maxZoom: 19,
        opacity: 0.8,
        zIndex: 11
    }).addTo(state.map);
    
    state.map.on('click', onMapClick);
}

// Configurar event listeners
function setupEventListeners() {
    // Toggle search panel
    document.getElementById('btn-toggle-search').addEventListener('click', toggleSearchPanel);
    document.getElementById('btn-close-search').addEventListener('click', () => {
        document.getElementById('search-panel').classList.add('hidden-mobile');
        state.searchPanelVisible = false;
    });
    
    document.getElementById('btn-new-route').addEventListener('click', createNewRoute);
    document.getElementById('btn-confirm-delete').addEventListener('click', confirmDelete);
    document.getElementById('btn-cancel-delete').addEventListener('click', cancelDelete);
    document.getElementById('btn-calculate-route').addEventListener('click', calculateRouteFromTo);
    document.getElementById('btn-pause-all').addEventListener('click', togglePauseAll);
    
    makePanelDraggable();
}

// Toggle search panel
function toggleSearchPanel() {
    const panel = document.getElementById('search-panel');
    state.searchPanelVisible = !state.searchPanelVisible;
    
    if (state.searchPanelVisible) {
        panel.classList.remove('hidden-mobile');
    } else {
        panel.classList.add('hidden-mobile');
    }
}

// Tornar painéis arrastáveis
function makePanelDraggable() {
    // Search panel
    const searchPanel = document.getElementById('search-panel');
    const searchHeader = document.querySelector('.search-panel-header');
    
    if (searchHeader) {
        makeDraggable(searchPanel, searchHeader);
    }
    
    // Routes panel
    const routesPanel = document.querySelector('.routes-panel');
    const routesHeader = document.querySelector('.routes-header');
    
    if (routesHeader) {
        makeDraggable(routesPanel, routesHeader);
    }
}

function makeDraggable(panel, header) {
    let isDragging = false;
    let startX, startY, initialX, initialY;
    
    header.addEventListener('mousedown', (e) => {
        if (e.target.tagName === 'BUTTON' || e.target.closest('button')) return;
        
        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;
        
        const rect = panel.getBoundingClientRect();
        initialX = rect.left;
        initialY = rect.top;
        
        panel.style.transition = 'none';
        panel.style.position = 'absolute';
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

// Configurar caixas de busca
function setupSearchBoxes() {
    setupSearchBox('city-from', 'from-results', (lat, lon, name) => {
        state.waypointFrom = { lat, lon, name };
        document.getElementById('city-from').value = name.split(',')[0];
        document.getElementById('from-results').classList.add('hidden');
        showInfo(`📍 Origem: ${name.split(',')[0]}`);
    });
    
    setupSearchBox('city-to', 'to-results', (lat, lon, name) => {
        state.waypointTo = { lat, lon, name };
        document.getElementById('city-to').value = name.split(',')[0];
        document.getElementById('to-results').classList.add('hidden');
        showInfo(`🎯 Destino: ${name.split(',')[0]}`);
    });
}

function setupSearchBox(inputId, resultsId, onSelect) {
    const input = document.getElementById(inputId);
    const resultsDiv = document.getElementById(resultsId);
    let searchTimeout;
    
    input.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        const query = e.target.value.trim();
        
        if (query.length < 3) {
            resultsDiv.classList.add('hidden');
            return;
        }
        
        searchTimeout = setTimeout(() => searchCity(query, resultsDiv, onSelect), 500);
    });
    
    document.addEventListener('click', (e) => {
        if (!e.target.closest(`#${inputId}`) && !e.target.closest(`#${resultsId}`)) {
            resultsDiv.classList.add('hidden');
        }
    });
}

async function searchCity(query, resultsDiv, onSelect) {
    try {
        const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5&addressdetails=1`);
        const results = await response.json();
        
        if (results.length === 0) {
            resultsDiv.innerHTML = '<div class="search-result-item">Nenhuma cidade encontrada</div>';
            resultsDiv.classList.remove('hidden');
            return;
        }
        
        resultsDiv.innerHTML = results.map(place => {
            const displayName = place.display_name.split(',')[0];
            const type = place.type || 'local';
            return `
                <div class="search-result-item" 
                     data-lat="${place.lat}" 
                     data-lon="${place.lon}" 
                     data-name="${place.display_name}">
                    📍 ${displayName}
                    <div style="font-size:9px;color:#888">${type}</div>
                </div>
            `;
        }).join('');
        
        resultsDiv.classList.remove('hidden');
        
        resultsDiv.querySelectorAll('.search-result-item').forEach(item => {
            item.addEventListener('click', () => {
                const lat = parseFloat(item.dataset.lat);
                const lon = parseFloat(item.dataset.lon);
                const name = item.dataset.name;
                onSelect(lat, lon, name);
            });
        });
    } catch (error) {
        console.error('Erro na busca:', error);
    }
}

// Calcular rota De: Para: - CORRIGIDO
async function calculateRouteFromTo() {
    console.log('🔘 Botão Criar Rota clicado');
    console.log('Origem:', state.waypointFrom);
    console.log('Destino:', state.waypointTo);
    
    if (!state.waypointFrom || !state.waypointTo) {
        showInfo('⚠️ Selecione origem e destino');
        return;
    }
    
    console.log('🚀 Criando rota:', state.waypointFrom.name, '→', state.waypointTo.name);
    
    // Criar nova rota
    const route = { 
        id: state.nextRouteId++, 
        waypoints: [
            { lat: state.waypointFrom.lat, lon: state.waypointFrom.lon, name: state.waypointFrom.name },
            { lat: state.waypointTo.lat, lon: state.waypointTo.lon, name: state.waypointTo.name }
        ], 
        polyline: [], 
        totalMeters: 0, 
        traveledMeters: 0, 
        speedKmh: 80, 
        isPlaying: false, 
        cumulativeDistances: [],
        leafletPolyline: null,
        leafletMarkers: []
    };
    
    // Adicionar marcadores
    addDraggableMarker(route.id, 0, { lat: route.waypoints[0].lat, lon: route.waypoints[0].lon });
    addDraggableMarker(route.id, 1, { lat: route.waypoints[1].lat, lon: route.waypoints[1].lon });
    
    state.routes.push(route);
    
    // Calcular rota
    await calculateRoute(route);
    
    // Centralizar mapa
    if (route.leafletPolyline) {
        state.map.fitBounds(route.leafletPolyline.getBounds(), { padding: [50, 50], maxZoom: 10 });
    }
    
    renderRoutesList();
    showInfo(`✅ Rota #${route.id} criada!`);
    
    // Limpar campos
    document.getElementById('city-from').value = '';
    document.getElementById('city-to').value = '';
    state.waypointFrom = null;
    state.waypointTo = null;
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
    showInfo('🆕 Clique no mapa para adicionar pontos');
}

function onMapClick(e) {
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

function addDraggableMarker(routeId, pointIndex, latlng) {
    const marker = L.marker([latlng.lat, latlng.lng], {
        draggable: true,
        title: `Ponto ${pointIndex + 1}`,
        zIndexOffset: 5
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

// Desenhar polyline ATRÁS dos labels
function drawPolyline(route) {
    if (route.leafletPolyline) {
        state.map.removeLayer(route.leafletPolyline);
    }
    
    const coordinates = route.polyline.map(p => [p.lat, p.lon]);
    
    // Criar polyline com zIndex baixo para ficar atrás dos labels
    route.leafletPolyline = L.polyline(coordinates, {
        color: '#1976D2',
        weight: 5,
        opacity: 0.9,
        lineCap: 'round',
        lineJoin: 'round',
        zIndexOffset: 2  // Fica atrás dos labels (zIndex 10+)
    }).addTo(state.map);
    
    // Trazer para trás (atrás dos tiles de label)
    route.leafletPolyline.bringToBack();
    
    if (coordinates.length > 0) {
        state.map.fitBounds(route.leafletPolyline.getBounds(), { padding: [50, 50], maxZoom: 13 });
    }
}

// Loop de simulação
function startSimulationLoop() {
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

// Pausar/Retomar todas
function togglePauseAll() {
    if (state.routes.length === 0) {
        showInfo('⚠️ Nenhuma rota ativa');
        return;
    }
    
    state.allPaused = !state.allPaused;
    
    state.routes.forEach(route => {
        if (state.allPaused) {
            route._wasPlaying = route.isPlaying;
            route.isPlaying = false;
        } else {
            if (route._wasPlaying) {
                route.isPlaying = true;
            }
        }
    });
    
    const btn = document.getElementById('btn-pause-all');
    btn.textContent = state.allPaused ? '▶️' : '⏸️';
    btn.title = state.allPaused ? 'Retomar todas' : 'Pausar todas';
    
    showInfo(state.allPaused ? '⏸️ Todas pausadas' : '▶️ Todas retomadas');
    renderRoutesList();
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
        weight: 3,
        zIndexOffset: 100  // Marcador do simulador por cima de tudo
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

// Toggle play/pause
window.togglePlay = function(routeId) {
    const route = state.routes.find(r => r.id == routeId);
    if (!route) return;
    
    if (!route.polyline || route.polyline.length === 0) { 
        showInfo('⚠️ Calcule a rota primeiro'); 
        return; 
    }
    
    route.isPlaying = !route.isPlaying;
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
        container.innerHTML = '<p style="text-align:center;color:#888;padding:15px;font-size:10px;">Nenhuma rota</p>';
        return;
    }
    
    container.innerHTML = state.routes.map(route => {
        const fromName = route.waypoints[0]?.name ? route.waypoints[0].name.split(',')[0] : 'Origem';
        const toName = route.waypoints[route.waypoints.length - 1]?.name ? route.waypoints[route.waypoints.length - 1].name.split(',')[0] : 'Destino';
        
        return `
            <div class="route-card ${route.isPlaying ? 'active' : ''}">
                <div class="route-header">
                    <div style="flex:1;min-width:0;">
                        <div class="route-title">🛣️ Rota #${route.id}</div>
                        <div class="route-info">${fromName} → ${toName}</div>
                    </div>
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
            </div>
        `;
    }).join('');
}

function updateRouteCardUI(route) {
    const cards = document.querySelectorAll('.route-card');
    const routeIndex = state.routes.findIndex(r => r.id == route.id);
    const card = cards[routeIndex];
    
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
            infoCard.textContent = '👆 Ou clique no mapa para rota manual'; 
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
