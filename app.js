// ─────────────────────────────────────────────────────────────────────────────
//  PhoneTrace — Dashboard (Google Maps)
// ─────────────────────────────────────────────────────────────────────────────

const COLOURS = ['#3b82f6','#22c55e','#f59e0b','#ef4444','#a855f7','#06b6d4','#f97316','#ec4899'];
let colourIndex = 0;
function nextColour() { return COLOURS[colourIndex++ % COLOURS.length]; }

// ── State ─────────────────────────────────────────────────────────────────────
let map = null;
let selectedId = null;
const deviceStore = new Map();
// key: deviceId → { data, colour, marker, accuracyCircle, polyline, trail[], totalDist }

// ── DOM refs ──────────────────────────────────────────────────────────────────
const deviceListEl   = document.getElementById('device-list');
const deviceCountEl  = document.getElementById('device-count');
const sidebarCount   = document.getElementById('sidebar-count');
const detailCard     = document.getElementById('detail-card');
const detailName     = document.getElementById('detail-name');
const dCoords        = document.getElementById('d-coords');
const dAccuracy      = document.getElementById('d-accuracy');
const dSpeed         = document.getElementById('d-speed');
const dBattery       = document.getElementById('d-battery');
const dLastseen      = document.getElementById('d-lastseen');
const dDistance      = document.getElementById('d-distance');
const btnFocus       = document.getElementById('btn-focus');
const btnStreetView  = document.getElementById('btn-street-view');
const btnCloseCard   = document.getElementById('btn-close-card');
const btnShare       = document.getElementById('btn-share');
const modalOverlay   = document.getElementById('modal-overlay');
const modalLink      = document.getElementById('modal-link');
const btnCopy        = document.getElementById('btn-copy');
const btnModalClose  = document.getElementById('btn-modal-close');

// ── Load Google Maps dynamically ──────────────────────────────────────────────
function loadGoogleMaps() {
  return new Promise((resolve) => {
    // If no API key provided, fall back to OpenStreetMap via Leaflet
    if (!window.GOOGLE_MAPS_API_KEY || window.GOOGLE_MAPS_API_KEY === 'YOUR_GOOGLE_MAPS_API_KEY') {
      resolve('leaflet');
      return;
    }
    window.__mapsReady = resolve;
    const s = document.createElement('script');
    s.src = `https://maps.googleapis.com/maps/api/js?key=${window.GOOGLE_MAPS_API_KEY}&callback=__mapsReady`;
    s.async = true;
    document.head.appendChild(s);
  });
}

// ── Init map ──────────────────────────────────────────────────────────────────
async function initMap() {
  const mapType = await loadGoogleMaps();

  if (mapType === 'leaflet') {
    initLeafletFallback();
  } else {
    initGoogleMap();
  }

  setupEvents();
  connectStream();
}

function initGoogleMap() {
  map = new google.maps.Map(document.getElementById('map'), {
    center: { lat: 10.5105, lng: 7.4165 },
    zoom: 6,
    mapTypeId: 'roadmap',
    disableDefaultUI: false,
    styles: darkMapStyle(),
    gestureHandling: 'greedy',
  });
  map._type = 'google';
}

function initLeafletFallback() {
  // Load Leaflet CSS + JS dynamically
  const css = document.createElement('link');
  css.rel  = 'stylesheet';
  css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
  document.head.appendChild(css);

  const js = document.createElement('script');
  js.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
  js.onload = () => {
    map = L.map('map').setView([10.5105, 7.4165], 6);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '© OpenStreetMap © CARTO',
      maxZoom: 19
    }).addTo(map);
    map._type = 'leaflet';

    // Show a small notice
    const note = document.createElement('div');
    note.id = 'map-notice';
    note.innerHTML = '🗺️ Using OpenStreetMap — <a href="https://console.cloud.google.com" target="_blank">add Google Maps API key</a> for full Google Maps';
    document.body.appendChild(note);
  };
  document.head.appendChild(js);
}

// ── Add / update device on map ────────────────────────────────────────────────
function addOrUpdateDevice(data) {
  if (!map) { setTimeout(() => addOrUpdateDevice(data), 500); return; }

  const isNew = !deviceStore.has(data.deviceId);

  if (isNew) {
    const colour = nextColour();
    const entry = {
      data, colour,
      marker: null,
      accuracyCircle: null,
      polyline: null,
      trail: [],
      totalDist: 0,
    };
    deviceStore.set(data.deviceId, entry);

    if (map._type === 'google') {
      createGoogleMarker(entry);
    } else {
      createLeafletMarker(entry);
    }

    if (!selectedId) selectDevice(data.deviceId);
    fitAllDevices();

  } else {
    const entry = deviceStore.get(data.deviceId);
    const prev = { lat: entry.data.lat, lng: entry.data.lng };
    entry.data = data;

    // Distance
    const d = haversine(prev, data);
    if (d > 5) {
      entry.totalDist += d;
      entry.trail.push({ lat: data.lat, lng: data.lng });
      updateTrail(entry);
    }

    moveMarker(entry, data);
  }

  updateDeviceCount();
  renderDeviceList();
  if (selectedId === data.deviceId) updateDetailCard(deviceStore.get(data.deviceId));
}

// ── Google Maps marker ────────────────────────────────────────────────────────
function createGoogleMarker(entry) {
  const pos = { lat: entry.data.lat, lng: entry.data.lng };

  entry.marker = new google.maps.Marker({
    position: pos,
    map,
    title: entry.data.name,
    icon: {
      path: google.maps.SymbolPath.CIRCLE,
      scale: 10,
      fillColor: entry.colour,
      fillOpacity: 1,
      strokeColor: '#ffffff',
      strokeWeight: 2,
    },
    label: {
      text: entry.data.name,
      color: '#ffffff',
      fontSize: '11px',
      fontWeight: '700',
    },
    animation: google.maps.Animation.DROP,
  });

  entry.accuracyCircle = new google.maps.Circle({
    map,
    center: pos,
    radius: entry.data.accuracy,
    fillColor: entry.colour,
    fillOpacity: 0.1,
    strokeColor: entry.colour,
    strokeOpacity: 0.4,
    strokeWeight: 1,
  });

  entry.polyline = new google.maps.Polyline({
    map,
    path: [pos],
    strokeColor: entry.colour,
    strokeOpacity: 0.8,
    strokeWeight: 3,
    geodesic: true,
  });

  entry.trail.push(pos);

  entry.marker.addListener('click', () => selectDevice(entry.data.deviceId));
}

function moveMarker(entry, data) {
  const pos = { lat: data.lat, lng: data.lng };
  if (map._type === 'google') {
    entry.marker.setPosition(pos);
    entry.marker.setLabel({ text: data.name, color: '#ffffff', fontSize: '11px', fontWeight: '700' });
    entry.accuracyCircle.setCenter(pos);
    entry.accuracyCircle.setRadius(data.accuracy);
  } else {
    entry.marker.setLatLng([data.lat, data.lng]);
    entry.accuracyCircle.setLatLng([data.lat, data.lng]);
    entry.accuracyCircle.setRadius(data.accuracy);
  }
}

function updateTrail(entry) {
  if (map._type === 'google') {
    entry.polyline.setPath(entry.trail);
  } else {
    entry.polyline.setLatLngs(entry.trail.map(p => [p.lat, p.lng]));
  }
}

// ── Leaflet marker ────────────────────────────────────────────────────────────
function createLeafletMarker(entry) {
  const pos = [entry.data.lat, entry.data.lng];

  entry.marker = L.circleMarker(pos, {
    radius: 10, color: '#fff', weight: 2.5,
    fillColor: entry.colour, fillOpacity: 1
  }).addTo(map)
    .bindTooltip(entry.data.name, {
      permanent: true, direction: 'top', offset: [0, -16],
      className: 'device-label'
    })
    .on('click', () => selectDevice(entry.data.deviceId));

  entry.accuracyCircle = L.circle(pos, {
    radius: entry.data.accuracy,
    color: entry.colour, fillColor: entry.colour,
    fillOpacity: 0.1, weight: 1
  }).addTo(map);

  entry.polyline = L.polyline([pos], {
    color: entry.colour, weight: 3, opacity: 0.75
  }).addTo(map);

  entry.trail.push({ lat: entry.data.lat, lng: entry.data.lng });
}

// ── Remove device ─────────────────────────────────────────────────────────────
function removeDevice(deviceId) {
  const entry = deviceStore.get(deviceId);
  if (!entry) return;

  if (map._type === 'google') {
    entry.marker.setMap(null);
    entry.accuracyCircle.setMap(null);
    entry.polyline.setMap(null);
  } else {
    map.removeLayer(entry.marker);
    map.removeLayer(entry.accuracyCircle);
    map.removeLayer(entry.polyline);
  }

  deviceStore.delete(deviceId);
  if (selectedId === deviceId) {
    selectedId = null;
    detailCard.classList.add('hidden');
  }
  updateDeviceCount();
  renderDeviceList();
}

// ── Select device ─────────────────────────────────────────────────────────────
function selectDevice(deviceId) {
  selectedId = deviceId;
  const entry = deviceStore.get(deviceId);
  if (!entry) return;
  updateDetailCard(entry);
  detailCard.classList.remove('hidden');
  renderDeviceList();
}

function updateDetailCard(entry) {
  const data = entry.data;
  detailName.textContent   = data.name;
  dCoords.textContent      = `${data.lat.toFixed(5)}, ${data.lng.toFixed(5)}`;
  dAccuracy.textContent    = `±${Math.round(data.accuracy)} m`;
  dSpeed.textContent       = data.speed != null ? `${(data.speed * 3.6).toFixed(1)} km/h` : '—';
  dBattery.textContent     = data.battery != null ? `${data.battery}%` : '—';
  dLastseen.textContent    = new Date(data.lastSeen).toLocaleTimeString();
  dDistance.textContent    = formatDist(entry.totalDist);
}

// ── Device list sidebar ───────────────────────────────────────────────────────
function renderDeviceList() {
  if (deviceStore.size === 0) {
    deviceListEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📱</div>
        <div class="empty-title">No devices yet</div>
        <div class="empty-sub">Share the tracking link to start monitoring a phone</div>
      </div>`;
    return;
  }

  deviceListEl.innerHTML = [...deviceStore.values()].map(entry => {
    const isSelected = entry.data.deviceId === selectedId;
    const bat = entry.data.battery != null ? `🔋 ${entry.data.battery}%` : '';
    const spd = entry.data.speed != null ? `${(entry.data.speed * 3.6).toFixed(0)} km/h` : '';
    return `
      <div class="device-item ${isSelected ? 'selected' : ''}"
           onclick="selectDevice('${entry.data.deviceId}')">
        <div class="di-colour" style="background:${entry.colour}"></div>
        <div class="di-info">
          <div class="di-name">${escHtml(entry.data.name)}</div>
          <div class="di-meta">${entry.data.lat.toFixed(4)}, ${entry.data.lng.toFixed(4)}</div>
          <div class="di-tags">
            ${bat ? `<span class="tag">${bat}</span>` : ''}
            ${spd ? `<span class="tag">${spd}</span>` : ''}
            <span class="tag green">● Live</span>
          </div>
        </div>
        <div class="di-arrow">›</div>
      </div>`;
  }).join('');
}

function updateDeviceCount() {
  const n = deviceStore.size;
  deviceCountEl.textContent  = `${n} device${n !== 1 ? 's' : ''} online`;
  sidebarCount.textContent   = n;
  sidebarCount.style.display = n > 0 ? 'inline-flex' : 'none';
  document.querySelector('.pulse-dot').style.background = n > 0 ? '#22c55e' : '#475569';
}

function fitAllDevices() {
  if (deviceStore.size === 0) return;
  const pts = [...deviceStore.values()].map(e => ({ lat: e.data.lat, lng: e.data.lng }));
  if (map._type === 'google') {
    const bounds = new google.maps.LatLngBounds();
    pts.forEach(p => bounds.extend(p));
    map.fitBounds(bounds);
  } else {
    map.fitBounds(L.latLngBounds(pts.map(p => [p.lat, p.lng])), { padding: [60, 60] });
  }
}

// ── SSE stream ────────────────────────────────────────────────────────────────
function connectStream() {
  const es = new EventSource('/api/stream');
  es.onmessage = e => {
    const msg = JSON.parse(e.data);
    if      (msg.type === 'snapshot')       msg.devices.forEach(addOrUpdateDevice);
    else if (msg.type === 'update')         addOrUpdateDevice(msg.device);
    else if (msg.type === 'device_removed') removeDevice(msg.deviceId);
  };
  es.onerror = () => { es.close(); setTimeout(connectStream, 3000); };
}

// ── Buttons ───────────────────────────────────────────────────────────────────
function setupEvents() {
  btnShare.addEventListener('click', () => {
    const url = `${location.protocol}//${location.host}/track`;
    modalLink.value = url;
    modalOverlay.classList.remove('hidden');
    document.getElementById('qr-code').innerHTML = '';
    new QRCode(document.getElementById('qr-code'), {
      text: url, width: 160, height: 160,
      colorDark: '#1e293b', colorLight: '#f8fafc'
    });
  });

  btnModalClose.addEventListener('click', () => modalOverlay.classList.add('hidden'));
  modalOverlay.addEventListener('click', e => { if (e.target === modalOverlay) modalOverlay.classList.add('hidden'); });

  btnCopy.addEventListener('click', () => {
    navigator.clipboard.writeText(modalLink.value).then(() => {
      btnCopy.textContent = '✓ Copied!';
      setTimeout(() => btnCopy.textContent = 'Copy', 2000);
    });
  });

  btnCloseCard.addEventListener('click', () => {
    selectedId = null;
    detailCard.classList.add('hidden');
    renderDeviceList();
  });

  btnFocus.addEventListener('click', () => {
    const entry = deviceStore.get(selectedId);
    if (!entry) return;
    const pos = { lat: entry.data.lat, lng: entry.data.lng };
    if (map._type === 'google') {
      map.setCenter(pos);
      map.setZoom(17);
    } else {
      map.setView([pos.lat, pos.lng], 17);
    }
  });

  btnStreetView.addEventListener('click', () => {
    const entry = deviceStore.get(selectedId);
    if (!entry) return;
    const url = `https://www.google.com/maps?q=${entry.data.lat},${entry.data.lng}&layer=c`;
    window.open(url, '_blank');
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function haversine(a, b) {
  const R = 6371000, dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
  const x = Math.sin(dLat/2)**2 + Math.cos(toRad(a.lat))*Math.cos(toRad(b.lat))*Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1-x));
}
function toRad(d) { return d * Math.PI / 180; }
function formatDist(m) { return m < 1000 ? `${m.toFixed(0)} m` : `${(m/1000).toFixed(2)} km`; }
function escHtml(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

window.selectDevice = selectDevice;

// ── Google Maps dark style ────────────────────────────────────────────────────
function darkMapStyle() {
  return [
    { elementType: 'geometry', stylers: [{ color: '#0f172a' }] },
    { elementType: 'labels.text.fill', stylers: [{ color: '#94a3b8' }] },
    { elementType: 'labels.text.stroke', stylers: [{ color: '#0f172a' }] },
    { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#1e293b' }] },
    { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#0f172a' }] },
    { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#334155' }] },
    { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0c4a6e' }] },
    { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#1e293b' }] },
    { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#14532d' }] },
    { featureType: 'transit', elementType: 'geometry', stylers: [{ color: '#1e293b' }] },
    { featureType: 'administrative', elementType: 'geometry.stroke', stylers: [{ color: '#334155' }] },
  ];
}

// ── Boot ──────────────────────────────────────────────────────────────────────
initMap();
