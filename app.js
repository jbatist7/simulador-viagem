// Estado global
const state = { 
    routes: [], 
    nextRouteId: 1, 
    map: null, 
    markers: {}, 
    routeToDelete: null
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
    console.log('🚀 Iniciando Simulador de Viagem...');
    initMap(); 
    setupEventListeners(); 
    setupSearchBox();
    startSimulationLoop(); 
    console.log('✅ Aplicativo iniciado!');
});

// Inicializar mapa Leaflet
function initMap() {
    console.log('🗺️ Criando mapa...');
    
    state.map = L.map('map', {
        center: CONFIG.defaultCenter,
        zoom: CONFIG.defaultZoom,
        zoomControl: true,
        scrollWheelZoom: true,
        doubleClickZoom: true,
        boxZoom: true,
        keyboard: true,
        dragging: true,
        minZoom: 3,
        maxZoom: 19
    });
    
    // Adicionar camada de satélite (Esri World Imagery)
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
        maxZoom: 19,
        subdomains: ['server', 'services']
    }).addTo(state.map);
    
    // Adicionar camada de labels (opcional - para mostrar nomes de cidades)
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', {
        attribution: '',
        maxZoom: 19,
        opacity: 0.7
    }).addTo(state.map);
    
    // Evento de clique no mapa
    state.map.on('click', onMapClick);
    
    console.log('✅ Mapa inicializado com zoom', CONFIG.defaultZoom);
}

// Configurar event listeners
function setupEventListeners() {
    const btnNewRoute = document.getElementById('btn-new-route');
    const btnConfirmDelete = document.getElementById('btn-confirm-delete');
    const btnCancelDelete = document.getElementById('btn-cancel-delete');
    
    if (btnNewRoute) {
        btnNewRoute.addEventListener('click', () => {
            console.log('➕ Criando nova rota...');
            createNewRoute();
        });
    }
    
    if (btnConfirmDelete) {
        btnConfirmDelete.addEventListener('click', confirmDelete);
    }
    
    if (btnCancelDelete) {
        btnCancelDelete.addEventListener('click', cancelDelete);
    }
    
    console.log('✅ Event listeners configurados');
}

// Configurar busca de cidades
function setupSearchBox() {
    const searchInput = document.getElementById('city-search');
    const resultsDiv = document.getElementById('search-results');
    
    if (!searchInput || !resultsDiv) {
        console.error('❌ Elementos de busca não encontrados!');
        return;
    }
    
    let searchTimeout;
    
    searchInput.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        const query = e.target.value.trim();
        
        console.log('🔍 Buscando:', query);
        
        if (query.length < 3) {
            resultsDiv.classList.add('hidden');
            return;
        }
        
        searchTimeout = setTimeout(() => {
            searchCity(query);
        }, 500);
    });
    
    // Fechar resultados ao clicar fora
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.search-box')) {
            resultsDiv.classList.add('hidden');
        }
    });
    
    console.log('✅ Busca de cidades configurada');
}

// Buscar cidade na API Nominatim
async function searchCity(query) {
    const resultsDiv = document.getElementById('search-results');
    
    try {
        console.log('🌍 Buscando cidade na API:', query);
        
        const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5&addressdetails=1`, {
            headers: {
                'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8'
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const results = await response.json();
        console.log('📍 Resultados encontrados:', results.length);
        
        if (results.length === 0) {
            resultsDiv.innerHTML = '<div class="search-result-item">Nenhuma cidade encontrada</div>';
            resultsDiv.classList.remove('hidden');
            return;
        }
        
        resultsDiv.innerHTML = results.map((place, index) => {
            const displayName = place.display_name.split(',')[0];
            const type = place.type || 'localidade';
            return `
                <div class="search-result-item" 
                     data-index="${index}"
                     data-lat="${place.lat}" 
                     data-lon="${place.lon}" 
                     data-name="${place.display_name.replace(/"/g, '&quot;')}">
                    📍 ${displayName}
                    <div style="font-size:11px;color:#888;margin-top:2px">${type}</div>
                </div>
            `;
        }).join('');
        
        resultsDiv.classList.remove('hidden');
        
        // Adicionar eventos de clique
        resultsDiv.querySelectorAll('.search-result-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                const lat = parseFloat(item.dataset.lat);
                const lon = parseFloat(item.dataset.lon);
                const name = item.dataset.name;
                
                console.log('✅ Cidade selecionada:', name, lat, lon);
                
                addWaypointFromSearch(lat, lon, name);
                resultsDiv.classList.add('hidden');
                document.getElementById('city-search').value = '';
            });
        });
        
    } catch (error) {
        console.error('❌ Erro na busca:', error);
        resultsDiv.innerHTML = '<div class="search-result-item">Erro ao buscar. Tente novamente.</div>';
        resultsDiv.classList.remove('hidden');
    }
}

// Adicionar waypoint da busca
function addWaypointFromSearch(lat, lon, name) {
    console.log('➕ Adicionando waypoint da busca:', lat, lon, name);
    
    if (state.routes.length === 0) {
        createNewRoute();
    }
    
    const lastRoute = state.routes[state.routes.length - 1];
    lastRoute.waypoints.push({ lat, lon, name });
    
    console.log('📍 Waypoints da rota:', lastRoute.waypoints.length);
    
    // Adicionar marcador arrastável
    addDraggableMarker(lastRoute.id, lastRoute.waypoints.length - 1, { lat, lon });
    
    // Centralizar mapa na cidade
    state.map.flyTo([lat, lon], 12, { 
        duration: 1.5,
        easeLinearity: 0.25
    });
    
    // Calcular rota se tiver 2+ pontos
    if (lastRoute.waypoints.length >= 2) {
        console.log('️ Calculando rota com', lastRoute.waypoints.length, 'pontos...');
        calculateRoute(lastRoute);
    }
    
    renderRoutesList();
    showInfo(`✅ Adicionado: ${name.split(',')[0]}`);
}

// Criar nova rota
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
    console.log('🆕 Rota criada:', route.id);
    
    renderRoutesList(); 
    showInfo('🆕 Nova rota! Busque cidades ou clique no mapa.');
}

// Clique no mapa
function onMapClick(e) {
    console.log(' Clique no mapa:', e.latlng);
    
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
    showInfo(`📍 Ponto ${lastRoute.waypoints.length} adicionado`);
}

// Adicionar marcador arrastável
function addDraggableMarker(routeId, pointIndex, latlng) {
    console.log('📍 Criando marcador arrastável:', routeId, pointIndex);
    
    const marker = L.marker([latlng.lat, latlng.lng], {
        draggable: true,
        title: `Ponto ${pointIndex + 1} - Arraste para mover`
    }).addTo(state.map);
    
    // Tooltip
    marker.bindTooltip(`Ponto ${pointIndex + 1}`, {
        permanent: false,
        direction: 'top'
    });
    
    // Evento de arraste
    marker.on('drag', (e) => {
        const route = state.routes.find(r => r.id == routeId);
        if (route && route.waypoints[pointIndex]) {
            route.waypoints[pointIndex].lat = e.target.getLatLng().lat;
            route.waypoints[pointIndex].lon = e.target.getLatLng().lng;
        }
    });
    
    // Recalcular rota após arrastar
    marker.on('dragend', (e) => {
        const route = state.routes.find(r => r.id == routeId);
        if (route && route.waypoints.length >= 2) {
            console.log('🔄 Recalculando rota após arrastar...');
            calculateRoute(route);
        }
    });
    
    // Armazenar marcador
    if (!state.markers[routeId]) {
        state.markers[routeId] = [];
    }
    state.markers[routeId].push(marker);
    
    const route = state.routes.find(r => r.id == routeId);
    if (route) {
        if (!route.leafletMarkers) {
            route.leafletMarkers = [];
        }
        route.leafletMarkers.push(marker);
    }
    
    console.log('✅ Marcador criado');
}

// Calcular rota via OSRM
async function calculateRoute(route) {
    if (route.waypoints.length < 2) {
        console.warn('⚠️ Precisa de pelo menos 2 pontos para calcular rota');
        return;
    }
    
    console.log('🛣️ Calculando rota OSRM...');
    showInfo('🛣️ Calculando rota...');
    
    // Remover polyline anterior se existir
    if (route.leafletPolyline) {
        state.map.removeLayer(route.leafletPolyline);
        route.leafletPolyline = null;
    }
    
    try {
        // Converter waypoints para formato OSRM (lon,lat)
        const coords = route.waypoints.map(w => `${w.lon},${w.lat}`).join(';');
        console.log('📍 Coordenadas OSRM:', coords);
        
        const response = await fetch(`https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson&steps=false`, {
            method: 'GET',
            headers: {
                'Accept': 'application/json'
            }
        });
        
        console.log('📡 Resposta OSRM status:', response.status);
        
        if (!response.ok) {
            throw new Error(`OSRM HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('📦 Dados OSRM:', data);
        
        if (data.code !== 'Ok') {
            throw new Error(`OSRM code: ${data.code}`);
        }
        
        if (!data.routes || data.routes.length === 0) {
            throw new Error('OSRM: nenhuma rota encontrada');
        }
        
        // Extrair polyline
        const geometry = data.routes[0].geometry;
        route.polyline = geometry.coordinates.map(c => ({ lat: c[1], lon: c[0] }));
        route.totalMeters = data.routes[0].distance;
        route.traveledMeters = 0;
        route.cumulativeDistances = calculateCumulativeDistances(route.polyline);
        
        console.log('✅ Rota calculada:', route.totalMeters, 'metros,', route.polyline.length, 'pontos');
        
        // Desenhar polyline no mapa
        drawPolyline(route);
        
        showInfo(`✅ Rota: ${(route.totalMeters / 1000).toFixed(1)} km`);
        
    } catch (error) {
        console.error('❌ Erro ao calcular rota:', error);
        showInfo('⚠️ Erro na rota. Usando linha reta.');
        createDirectLine(route);
    }
    
    renderRoutesList();
}

// Criar linha reta (fallback)
function createDirectLine(route) {
    console.log('📏 Criando linha reta...');
    
    route.polyline = route.waypoints.map(w => ({ lat: w.lat, lon: w.lon }));
    route.totalMeters = calculateCumulativeDistances(route.polyline).pop() || 0;
    route.cumulativeDistances = calculateCumulativeDistances(route.polyline);
    
    drawPolyline(route);
}

// Calcular distâncias acumuladas
function calculateCumulativeDistances(polyline) {
    const cumulative = [0]; 
    let sum = 0;
    
    for (let i = 1; i < polyline.length; i++) {
        const dist = haversineDistance(
            polyline[i-1].lat, 
            polyline[i-1].lon, 
            polyline[i].lat, 
            polyline[i].lon
        );
        sum += dist;
        cumulative.push(sum);
    }
    
    return cumulative;
}

// Desenhar polyline no mapa
function drawPolyline(route) {
    console.log('🎨 Desenhando polyline...');
    
    const routeId = `route-${route.id}`;
    
    // Remover polyline anterior se existir
    if (route.leafletPolyline) {
        state.map.removeLayer(route.leafletPolyline);
        route.leafletPolyline = null;
    }
    
    // Converter coordenadas para formato Leaflet [lat, lon]
    const coordinates = route.polyline.map(p => [p.lat, p.lon]);
    
    // Criar polyline
    route.leafletPolyline = L.polyline(coordinates, {
        color: '#1976D2',
        weight: 5,
        opacity: 0.9,
        lineCap: 'round',
        lineJoin: 'round',
        dashArray: null,
        shadow: true
    }).addTo(state.map);
    
    // Ajustar zoom para mostrar toda a rota
    if (coordinates.length > 0) {
        const bounds = route.leafletPolyline.getBounds();
        state.map.fitBounds(bounds, { 
            padding: [50, 50],
            maxZoom: 14,
            duration: 1
        });
    }
    
    console.log('✅ Polyline desenhada');
}

// Loop de simulação
function startSimulationLoop() {
    console.log('⏱️ Iniciando loop de simulação...');
    
    setInterval(() => {
        state.routes.forEach(route => {
            if (route.isPlaying && route.totalMeters > 0) {
                const speedMps = route.speedKmh / 3.6;
                const newTraveled = route.traveledMeters + (speedMps * 0.1);
                
                route.traveledMeters = Math.min(route.totalMeters, newTraveled);
                
                if (route.traveledMeters >= route.totalMeters) {
                    route.isPlaying = false;
                    showInfo('🏁 Viagem concluída!');
                }
                
                updateSimulatorMarker(route);
                updateRouteCard(route);
            }
        });
    }, 100);
    
    console.log('✅ Loop de simulação iniciado (100ms)');
}

// Atualizar marcador do simulador
function updateSimulatorMarker(route) {
    const position = getPositionAtDistance(route);
    if (!position) return;
    
    const markerId = `simulator-${route.id}`;
    
    // Remover marcador anterior
    if (state.markers[markerId]) {
        state.map.removeLayer(state.markers[markerId]);
    }
    
    // Criar novo marcador (círculo laranja)
    const marker = L.circleMarker([position.lat, position.lon], {
        radius: 12,
        color: '#ff5722',
        fillColor: '#ff9800',
        fillOpacity: 1,
        weight: 3,
        className: 'simulator-marker'
    }).addTo(state.map);
    
    // Tooltip
    marker.bindTooltip(`🚗 ${(route.traveledMeters/1000).toFixed(1)} km`, {
        permanent: false,
        direction: 'top',
        offset: [0, -10]
    });
    
    state.markers[markerId] = marker;
    
    // Pan suave se estiver tocando
    if (route.isPlaying) {
        state.map.panTo([position.lat, position.lon], { 
            animate: true, 
            duration: 0.5,
            easeLinearity: 0.25
        });
    }
}

// Obter posição na distância
function getPositionAtDistance(route) {
    if (!route.polyline || route.polyline.length === 0 || route.totalMeters === 0) {
        return null;
    }
    
    if (route.traveledMeters <= 0) {
        return route.polyline[0];
    }
    
    if (route.traveledMeters >= route.totalMeters) {
        return route.polyline[route.polyline.length - 1];
    }
    
    // Encontrar segmento
    let segmentIndex = 0;
    for (let i = 0; i < route.cumulativeDistances.length; i++) {
        if (route.cumulativeDistances[i] >= route.traveledMeters) { 
            segmentIndex = Math.max(1, i); 
            break; 
        }
    }
    
    const segmentStart = route.cumulativeDistances[segmentIndex - 1];
    const segmentEnd = route.cumulativeDistances[segmentIndex];
    const t = segmentEnd > segmentStart ? 
        (route.traveledMeters - segmentStart) / (segmentEnd - segmentStart) : 0;
    
    const p1 = route.polyline[segmentIndex - 1];
    const p2 = route.polyline[segmentIndex];
    
    return { 
        lat: p1.lat + (p2.lat - p1.lat) * t, 
        lon: p1.lon + (p2.lon - p1.lon) * t 
    };
}

// Toggle play/pause
function togglePlay(route) {
    if (!route.polyline || route.polyline.length === 0) { 
        showInfo('⚠️ Adicione pelo menos 2 pontos'); 
        return; 
    }
    
    route.isPlaying = !route.isPlaying;
    console.log(route.isPlaying ? '▶️ Iniciando' : '⏸️ Pausando', 'rota', route.id);
    
    renderRoutesList();
}

// Seek (slider)
function seekRoute(route, progress) {
    route.traveledMeters = route.totalMeters * progress;
    updateSimulatorMarker(route);
    updateRouteCard(route);
}

// Set velocidade
function setSpeed(route, speed) {
    route.speedKmh = Math.max(CONFIG.minSpeed, Math.min(CONFIG.maxSpeed, speed));
}

// Deletar rota
function deleteRoute(routeId) { 
    console.log('🗑️ Solicitando exclusão da rota:', routeId);
    state.routeToDelete = routeId; 
    document.getElementById('confirm-modal').classList.remove('hidden'); 
}

// Confirmar exclusão
function confirmDelete() {
    if (state.routeToDelete === null) return;
    
    console.log('✅ Confirmando exclusão da rota:', state.routeToDelete);
    
    const routeId = state.routeToDelete;
    
    // Remover marcadores
    if (state.markers[routeId]) {
        state.markers[routeId].forEach(m => {
            state.map.removeLayer(m);
        });
        delete state.markers[routeId];
    }
    
    // Remover marcador do simulador
    const simMarkerId = `simulator-${routeId}`;
    if (state.markers[simMarkerId]) {
        state.map.removeLayer(state.markers[simMarkerId]);
        delete state.markers[simMarkerId];
    }
    
    // Remover polyline
    const route = state.routes.find(r => r.id == routeId);
    if (route && route.leafletPolyline) {
        state.map.removeLayer(route.leafletPolyline);
    }
    
    // Remover da lista
    state.routes = state.routes.filter(r => r.id !== routeId);
    
    state.routeToDelete = null;
    renderRoutesList();
    showInfo('🗑️ Rota excluída');
    
    document.getElementById('confirm-modal').classList.add('hidden');
}

// Cancelar exclusão
function cancelDelete() { 
    console.log('❌ Cancelando exclusão');
    state.routeToDelete = null; 
    document.getElementById('confirm-modal').classList.add('hidden'); 
}

// Renderizar lista de rotas
function renderRoutesList() {
    const container = document.getElementById('routes-list');
    if (!container) {
        console.error('❌ Container de rotas não encontrado!');
        return;
    }
    
    if (state.routes.length === 0) {
        container.innerHTML = `
            <div style="text-align:center;color:#888;padding:20px;font-size:12px;">
                📍 Nenhuma rota criada<br>
                <small>Busque cidades ou clique no mapa</small>
            </div>
        `;
        return;
    }
    
    container.innerHTML = state.routes.map(route => {
        const progress = route.totalMeters > 0 ? 
            (route.traveledMeters / route.totalMeters * 100) : 0;
        
        return `
            <div class="route-card ${route.isPlaying ? 'active' : ''}" data-route-id="${route.id}">
                <div class="route-header">
                    <span class="route-title">🛣️ Rota #${route.id} (${route.waypoints.length} pontos)</span>
                    <div class="route-actions">
                        <button class="btn-icon" onclick="deleteRoute(${route.id})" title="Excluir">🗑️</button>
                    </div>
                </div>
                <div class="route-controls">
                    <button class="play-btn ${route.isPlaying ? 'paused' : ''}" onclick="togglePlay(${route.id})" title="${route.isPlaying ? 'Pausar' : 'Iniciar'}">
                        ${route.isPlaying ? '⏸️' : '▶️'}
                    </button>
                    <input type="range" class="progress-slider" 
                           min="0" max="1" step="0.01" 
                           value="${route.totalMeters > 0 ? route.traveledMeters / route.totalMeters : 0}" 
                           oninput="seekRoute(${route.id}, this.value)"
                           style="--progress: ${progress}%">
                </div>
                <div class="route-stats">
                    <span>📏 ${(route.totalMeters / 1000).toFixed(1)} km total</span>
                    <span>✅ ${(route.traveledMeters / 1000).toFixed(1)} km feito</span>
                    <span>⏳ ${(Math.max(0, route.totalMeters - route.traveledMeters) / 1000).toFixed(1)} km resta</span>
                </div>
                <div class="speed-control">
                    <span>🚗 Velocidade:</span>
                    <input type="range" class="speed-slider" 
                           min="${CONFIG.minSpeed}" max="${CONFIG.maxSpeed}" 
                           value="${route.speedKmh}" 
                           oninput="setSpeed(${route.id}, this.value)">
                    <span style="font-weight:600;color:#1976D2">${route.speedKmh} km/h</span>
                </div>
            </div>
        `;
    }).join('');
    
    console.log('📋 Lista de rotas renderizada:', state.routes.length, 'rotas');
}

// Atualizar card da rota
function updateRouteCard(route) {
    const card = document.querySelector(`.route-card[data-route-id="${route.id}"]`);
    if (!card) return;
    
    const slider = card.querySelector('.progress-slider');
    const stats = card.querySelector('.route-stats');
    const speedDisplay = card.querySelector('.speed-control span:last-child');
    
    const progress = route.totalMeters > 0 ? 
        (route.traveledMeters / route.totalMeters * 100) : 0;
    
    if (slider) {
        slider.value = route.totalMeters > 0 ? route.traveledMeters / route.totalMeters : 0;
        slider.style.setProperty('--progress', `${progress}%`);
    }
    
    if (stats) {
        stats.innerHTML = `
            <span>📏 ${(route.totalMeters / 1000).toFixed(1)} km total</span>
            <span>✅ ${(route.traveledMeters / 1000).toFixed(1)} km feito</span>
            <span>⏳ ${(Math.max(0, route.totalMeters - route.traveledMeters) / 1000).toFixed(1)} km resta</span>
        `;
    }
    
    if (speedDisplay) {
        speedDisplay.textContent = `${route.speedKmh} km/h`;
    }
}

// Mostrar mensagem informativa
function showInfo(message) {
    const infoCard = document.querySelector('.hint');
    if (infoCard) {
        infoCard.textContent = message;
        setTimeout(() => { 
            infoCard.textContent = '👆 Toque no mapa ou busque cidades'; 
        }, 4000);
    }
    console.log('ℹ️', message);
}

// Cálculo de distância (Haversine)
function haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371000; // metros
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) + 
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
              Math.sin(dLon/2) * Math.sin(dLon/2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// Funções globais para os botões
window.togglePlay = function(routeId) {
    const route = state.routes.find(r => r.id == routeId);
    if (route) togglePlay(route);
};

window.seekRoute = function(routeId, value) {
    const route = state.routes.find(r => r.id == routeId);
    if (route) seekRoute(route, parseFloat(value));
};

window.setSpeed = function(routeId, value) {
    const route = state.routes.find(r => r.id == routeId);
    if (route) setSpeed(route, parseFloat(value));
};

window.deleteRoute = function(routeId) {
    deleteRoute(routeId);
};

console.log('✅ app.js carregado com sucesso!');
