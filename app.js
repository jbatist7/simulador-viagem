// Estado global
const state = { 
    routes: [], 
    nextRouteId: 1, 
    map: null, 
    markers: {}, 
    routeToDelete: null,
    allPaused: false,
    waypointFrom: null,
    waypointTo: null
};

const CONFIG = { 
    defaultCenter: [-14.2350, -51.9253], 
    defaultZoom: 5, 
    minSpeed: 40, 
    maxSpeed: 700
};

// Inicialização
document.addEventListener('DOMContentLoaded', () => { 
    console.log('🚀 Iniciando...');
    initMap(); 
    setupEventListeners(); 
    setupSearchBoxes();
    startSimulationLoop(); 
    console.log('✅ Pronto!');
});

function initMap() {
    state.map = L.map('map', {
        center: CONFIG.defaultCenter,
        zoom: CONFIG.defaultZoom,
        zoomControl: true
    });
    
    // Satélite
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 19
    }).addTo(state.map);
    
    // Labels
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 19,
        opacity: 0.9,
        zIndex: 10
    }).addTo(state.map);
    
    // Rodovias
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 19,
        opacity: 0.8,
        zIndex: 11
    }).addTo(state.map);
    
    state.map.on('click', onMapClick);
}

function setupEventListeners() {
    // Toggle search panel
    const btnToggle = document.getElementById('btn-toggle-search');
    const searchPanel = document.getElementById('search-panel');
    
    if (btnToggle && searchPanel) {
        btnToggle.addEventListener('click', () => {
            console.log('🔘 Toggle clicado!');
            searchPanel.classList.toggle('hidden');
        });
    }
    
    // Close button
    const btnClose = document.getElementById('btn-close-search');
    if (btnClose && searchPanel) {
        btnClose.addEventListener('click', () => {
            console.log('✕ Fechar painel');
            searchPanel.classList.add('hidden');
        });
    }
    
    // Botão Criar Rota - CORREÇÃO PRINCIPAL
    const btnCalculate = document.getElementById('btn-calculate-route');
    if (btnCalculate) {
        btnCalculate.addEventListener('click', () => {
            console.log(' Botão Criar Rota clicado!');
            console.log('Origem:', state.waypointFrom);
            console.log('Destino:', state.waypointTo);
            calculateRouteFromTo();
        });
    } else {
        console.error('❌ Botão btn-calculate-route NÃO ENCONTRADO!');
    }
    
    // Outros botões
    document.getElementById('btn-new-route').addEventListener('click', createNewRoute);
    document.getElementById('btn-confirm-delete').addEventListener('click', confirmDelete);
    document.getElementById('btn-cancel-delete').addEventListener('click', cancelDelete);
    document.getElementById('btn-pause-all').addEventListener('click', togglePauseAll);
    
    makeDraggable();
}

function makeDraggable() {
    const panels = [
        { panel: document.getElementById('search-panel'), header: document.querySelector('#search-panel .panel-header') },
        { panel: document.querySelector('.routes-panel'), header: document.querySelector('.routes-panel .panel-header') }
    ];
    
    panels.forEach(({ panel, header }) => {
        if (!panel || !header) return;
        
        let dragging = false;
        let startX, startY, initialX, initialY;
        
        header.addEventListener('mousedown', (e) => {
            if (e.target.tagName === 'BUTTON') return;
            dragging = true;
            startX = e.clientX;
            startY = e.clientY;
            const rect = panel.getBoundingClientRect();
            initialX = rect.left;
            initialY = rect.top;
            panel.style.transition = 'none';
        });
        
        document.addEventListener('mousemove', (e) => {
            if (!dragging) return;
            panel.style.left = (initialX + e.clientX - startX) + 'px';
            panel.style.top = (initialY + e.clientY - startY) + 'px';
            panel.style.right = 'auto';
            panel.style.bottom = 'auto';
        });
        
        document.addEventListener('mouseup', () => dragging = false);
    });
}

function setupSearchBoxes() {
    setupSearchBox('city-from', 'from-results', (lat, lon, name) => {
        state.waypointFrom = { lat, lon, name };
        document.getElementById('city-from').value = name.split(',')[0];
        document.getElementById('from-results').classList.add('hidden');
    });
    
    setupSearchBox('city-to', 'to-results', (lat, lon, name) => {
        state.waypointTo = { lat, lon, name };
        document.getElementById('city-to').value = name.split(',')[0];
        document.getElementById('to-results').classList.add('hidden');
    });
}

function setupSearchBox(inputId, resultsId, onSelect) {
    const input = document.getElementById(inputId);
    const resultsDiv = document.getElementById(resultsId);
    let timeout;
    
    input.addEventListener('input', (e) => {
        clearTimeout(timeout);
        const query = e.target.value.trim();
        if (query.length < 3) {
            resultsDiv.classList.add('hidden');
            return;
        }
        timeout = setTimeout(() => searchCity(query, resultsDiv, onSelect), 500);
    });
    
    document.addEventListener('click', (e) => {
        if (!e.target.closest('#' + inputId) && !e.target.closest('#' + resultsId)) {
            resultsDiv.classList.add('hidden');
        }
    });
}

async function searchCity(query, resultsDiv, onSelect) {
    try {
        const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5`);
        const results = await response.json();
        
        if (results.length === 0) {
            resultsDiv.innerHTML = '<div class="search-result-item">Nenhuma cidade</div>';
            resultsDiv.classList.remove('hidden');
            return;
        }
        
        resultsDiv.innerHTML = results.map(place => `
            <div class="search-result-item" data-lat="${place.lat}" data-lon="${place.lon}" data-name="${place.display_name}">
                ${place.display_name.split(',')[0]}
            </div>
        `).join('');
        
        resultsDiv.classList.remove('hidden');
        
        resultsDiv.querySelectorAll('.search-result-item').forEach(item => {
            item.addEventListener('click', () => {
                onSelect(parseFloat(item.dataset.lat), parseFloat(item.dataset.lon), item.dataset.name);
            });
        });
    } catch (error) {
        console.error('Erro busca:', error);
    }
}

// FUNÇÃO PRINCIPAL - CRIAR ROTA
async function calculateRouteFromTo() {
    console.log(' calculateRouteFromTo chamado');
    
    if (!state.waypointFrom || !state.waypointTo) {
        alert('Selecione origem e destino!');
        return;
    }
    
    console.log('✅ Criando rota:', state.waypointFrom.name, '→', state.waypointTo.name);
    
    const route = { 
        id: state.nextRouteId++, 
        waypoints: [
            { lat: state.waypointFrom.lat, lon: state.waypointFrom.lon },
            { lat: state.waypointTo.lat, lon: state.waypointTo.lon }
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
    addMarker(route.id, 0, route.waypoints[0]);
    addMarker(route.id, 1, route.waypoints[1]);
    
    state.routes.push(route);
    
    // Calcular rota
    await calculateRoute(route);
    
    // Ajustar zoom
    if (route.leafletPolyline) {
        state.map.fitBounds(route.leafletPolyline.getBounds(), { padding: [50, 50] });
    }
    
    renderRoutesList();
    
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
}

function onMapClick(e) {
    if (state.routes.length === 0) createNewRoute();
    const route = state.routes[state.routes.length - 1];
    route.waypoints.push({ lat: e.latlng.lat, lon: e.latlng.lng });
    addMarker(route.id, route.waypoints.length - 1, route.waypoints[route.waypoints.length - 1]);
    if (route.waypoints.length >= 2) calculateRoute(route);
    renderRoutesList();
}

function addMarker(routeId, index, point) {
    const marker = L.marker([point.lat, point.lon], { draggable: true }).addTo(state.map);
    
    marker.on('dragend', (e) => {
        const route = state.routes.find(r => r.id == routeId);
        if (route) {
            route.waypoints[index].lat = e.target.getLatLng().lat;
            route.waypoints[index].lon = e.target.getLatLng().lng;
            if (route.waypoints.length >= 2) calculateRoute(route);
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
    
    if (route.leafletPolyline) {
        state.map.removeLayer(route.leafletPolyline);
    }
    
    try {
        const coords = route.waypoints.map(w => `${w.lon},${w.lat}`).join(';');
        const response = await fetch(`https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`);
        const data = await response.json();
        
        if (data.code === 'Ok' && data.routes[0]) {
            route.polyline = data.routes[0].geometry.coordinates.map(c => ({ lat: c[1], lon: c[0] }));
            route.totalMeters = data.routes[0].distance;
            route.cumulativeDistances = calcCumulative(route.polyline);
            drawPolyline(route);
        }
    } catch (error) {
        console.error('Erro:', error);
    }
    
    renderRoutesList();
}

function calcCumulative(polyline) {
    const cum = [0];
    let sum = 0;
    for (let i = 1; i < polyline.length; i++) {
        sum += haversine(polyline[i-1], polyline[i]);
        cum.push(sum);
    }
    return cum;
}

function drawPolyline(route) {
    if (route.leafletPolyline) state.map.removeLayer(route.leafletPolyline);
    
    const coords = route.polyline.map(p => [p.lat, p.lon]);
    route.leafletPolyline = L.polyline(coords, {
        color: '#1976D2',
        weight: 4,
        opacity: 0.9,
        zIndexOffset: 2
    }).addTo(state.map);
    
    route.leafletPolyline.bringToBack();
}

function startSimulationLoop() {
    setInterval(() => {
        state.routes.forEach(route => {
            if (route.isPlaying && route.totalMeters > 0) {
                route.traveledMeters = Math.min(route.totalMeters, route.traveledMeters + (route.speedKmh / 3.6) * 0.1);
                if (route.traveledMeters >= route.totalMeters) route.isPlaying = false;
                updateSimMarker(route);
                updateRouteUI(route);
            }
        });
    }, 100);
}

function updateSimMarker(route) {
    const pos = getPosition(route);
    if (!pos) return;
    
    const id = `sim-${route.id}`;
    if (state.markers[id]) state.map.removeLayer(state.markers[id]);
    
    state.markers[id] = L.circleMarker([pos.lat, pos.lon], {
        radius: 8, color: '#ff5722', fillColor: '#ff9800', fillOpacity: 1, weight: 2
    }).addTo(state.map);
    
    if (route.isPlaying) state.map.panTo([pos.lat, pos.lon], { animate: true });
}

function getPosition(route) {
    if (!route.polyline.length || !route.totalMeters) return null;
    if (route.traveledMeters <= 0) return route.polyline[0];
    if (route.traveledMeters >= route.totalMeters) return route.polyline[route.polyline.length - 1];
    
    let idx = route.cumulativeDistances.findIndex(d => d >= route.traveledMeters);
    if (idx < 1) idx = 1;
    
    const t = (route.traveledMeters - route.cumulativeDistances[idx-1]) / 
              (route.cumulativeDistances[idx] - route.cumulativeDistances[idx-1]);
    
    const p1 = route.polyline[idx-1], p2 = route.polyline[idx];
    return { lat: p1.lat + (p2.lat - p1.lat) * t, lon: p1.lon + (p2.lon - p1.lon) * t };
}

function togglePauseAll() {
    state.allPaused = !state.allPaused;
    state.routes.forEach(r => {
        if (state.allPaused) { r._was = r.isPlaying; r.isPlaying = false; }
        else { if (r._was) r.isPlaying = true; }
    });
    document.getElementById('btn-pause-all').textContent = state.allPaused ? '▶️' : '⏸️';
    renderRoutesList();
}

window.togglePlay = (id) => {
    const route = state.routes.find(r => r.id == id);
    if (route && route.polyline.length) {
        route.isPlaying = !route.isPlaying;
        renderRoutesList();
    }
};

window.seekRoute = (id, val) => {
    const route = state.routes.find(r => r.id == id);
    if (route) {
        route.traveledMeters = route.totalMeters * parseFloat(val);
        updateSimMarker(route);
    }
};

window.setSpeed = (id, val) => {
    const route = state.routes.find(r => r.id == id);
    if (route) {
        route.speedKmh = Math.max(40, Math.min(700, parseFloat(val)));
        
        // ✅ Atualiza o texto da velocidade IMEDIATAMENTE
        const card = document.querySelector(`.route-card:nth-child(${state.routes.indexOf(route) + 1})`);
        if (card) {
            const speedText = card.querySelector('.speed-control span:first-child');
            if (speedText) {
                speedText.textContent = `${route.speedKmh} km/h`;
            }
        }
    }
};

window.deleteRoute = (id) => {
    state.routeToDelete = id;
    document.getElementById('confirm-modal').classList.remove('hidden');
};

function confirmDelete() {
    if (!state.routeToDelete) return;
    const id = state.routeToDelete;
    
    if (state.markers[id]) state.markers[id].forEach(m => state.map.removeLayer(m));
    const sim = state.markers[`sim-${id}`];
    if (sim) state.map.removeLayer(sim);
    
    const route = state.routes.find(r => r.id == id);
    if (route && route.leafletPolyline) state.map.removeLayer(route.leafletPolyline);
    
    state.routes = state.routes.filter(r => r.id !== id);
    state.routeToDelete = null;
    document.getElementById('confirm-modal').classList.add('hidden');
    renderRoutesList();
}

function cancelDelete() {
    state.routeToDelete = null;
    document.getElementById('confirm-modal').classList.add('hidden');
}

function renderRoutesList() {
    const container = document.getElementById('routes-list');
    if (!container) return;
    
    if (!state.routes.length) {
        container.innerHTML = '<p style="text-align:center;color:#888;padding:10px;font-size:9px;">Nenhuma rota</p>';
        return;
    }
    
    container.innerHTML = state.routes.map(route => {
        const from = route.waypoints[0]?.name || 'Origem';
        const to = route.waypoints[route.waypoints.length-1]?.name || 'Destino';
        
        return `
            <div class="route-card ${route.isPlaying ? 'active' : ''}">
                <div class="route-header">
                    <div>
                        <div class="route-title">Rota #${route.id}</div>
                        <div style="font-size:7px;color:#666">${from.split(',')[0]} → ${to.split(',')[0]}</div>
                    </div>
                    <button onclick="deleteRoute(${route.id})" style="background:none;border:none;cursor:pointer">🗑️</button>
                </div>
                <div class="route-controls">
                    <button class="play-btn ${route.isPlaying ? 'paused' : ''}" onclick="togglePlay(${route.id})">
                        ${route.isPlaying ? '⏸️' : '▶️'}
                    </button>
                    <input type="range" class="progress-slider" min="0" max="1" step="0.01" 
                           value="${route.totalMeters ? route.traveledMeters/route.totalMeters : 0}" 
                           oninput="seekRoute(${route.id}, this.value)">
                </div>
                <div class="route-stats">
                    <span>${(route.totalMeters/1000).toFixed(1)} km</span>
                    <span>${(route.traveledMeters/1000).toFixed(1)} km</span>
                    <span>${((route.totalMeters-route.traveledMeters)/1000).toFixed(1)} km</span>
                </div>
                <div class="speed-control">
                    <span>${route.speedKmh} km/h</span>
                    <input type="range" class="speed-slider" min="40" max="700" value="${route.speedKmh}" 
                           oninput="setSpeed(${route.id}, this.value)">
                </div>
            </div>
        `;
    }).join('');
}

function updateRouteUI(route) {
    const cards = document.querySelectorAll('.route-card');
    const idx = state.routes.findIndex(r => r.id == route.id);
    const card = cards[idx];
    if (!card) return;
    
    const slider = card.querySelector('.progress-slider');
    const stats = card.querySelector('.route-stats');
    
    if (slider) slider.value = route.totalMeters ? route.traveledMeters/route.totalMeters : 0;
    if (stats) {
        stats.innerHTML = `
            <span>${(route.totalMeters/1000).toFixed(1)} km</span>
            <span>${(route.traveledMeters/1000).toFixed(1)} km</span>
            <span>${((route.totalMeters-route.traveledMeters)/1000).toFixed(1)} km</span>
        `;
    }
}

function haversine(p1, p2) {
    const R = 6371000;
    const dLat = (p2.lat - p1.lat) * Math.PI / 180;
    const dLon = (p2.lon - p1.lon) * Math.PI / 180;
    const a = Math.sin(dLat/2)**2 + Math.cos(p1.lat*Math.PI/180) * Math.cos(p2.lat*Math.PI/180) * Math.sin(dLon/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}
