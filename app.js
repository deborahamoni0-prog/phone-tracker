// ── app.js — dashboard that watches all tracked phones ────────────────────────

// Each device gets a random colour for its marker and trail
const COLOURS = ['#3b82f6','#22c55e','#f59e0b','#ef4444','#a855f7','#06b6d4','#f97316','#ec4899'];
let colourIndex = 0;
function nextColour() { return COLOURS[colourIndex++ % COLOURS.length]; }

// ── Map ───────────────────────────────────────────────────────────────────────
const map = L.map('map').setView([10.5105, 7.4165], 6);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  maxZoom: 19
}).addTo(map);

// ── Device store ──────────────────────────────────────────────────────────────
// key: deviceId
// value: { data, colour, marker, accuracyCircle, trail (L.LatLng[]), polyline, lastSeen }
const deviceStore = new Map();

let selectedId = null;

// ── DOM ───────────────────────────────────────────────────────────────────────
const deviceCountEl  = document.getElementById('device-count');
const deviceListEl   = document.getElementById('device-list');
const detailCard     = document.getElementById('detail-card');
const detailName     = document.getElementById('detail-name');
const dCoords        = document.getElementById('d-coords');
const dAccuracy      = document.getElementById('d-accuracy');
const dSpeed         = document.getElementById('d-speed');
const dBattery       = document.getElementById('d-battery');
const dLastseen      = document.getElementById('d-lastseen');
const btnFocus       = document.getElementById('btn-focus');
const btnDeselect    = document.getElementById('btn-deselect');
const btnShare       = document.getElementById('btn-share');
const modalOverlay   = document.getElementById('modal-overlay');
const modalLink      = document.getElementById('modal-link');
const btnCopy        = document.getElementById('btn-copy');
const btnModalClose  = document.getElementById('btn-modal-close');

// ── Share link modal ──────────────────────────────────────────────────────────
btnShare.addEventListener('click', () => {
  const trackUrl = `${location.protocol}//${location.host}/track`;
  modalLink.value = trackUrl;
  modalOverlay.style.display = 'flex';

  // Generate QR code so a nearby phone can just scan it
  const qrContainer = document.getElementById('qr-code');
  qrContainer.innerHTML = '';
  new QRCode(qrContainer, {
    text:   trackUrl,
    width:  180,
    height: 180,
    colorDark:  '#f1f5f9',
    colorLight: '#1e293b',
  });
});

btnModalClose.addEventListener('click', () => { modalOverlay.style.display = 'none'; });
modalOverlay.addEventListener('click', e => { if (e.target === modalOverlay) modalOverlay.style.display = 'none'; });

btnCopy.addEventListener('click', () => {
  navigator.clipboard.writeText(modalLink.value).then(() => {
    btnCopy.textContent = '✓ Copied!';
    setTimeout(() => btnCopy.textContent = 'Copy', 2000);
  });
});

// ── Detail card ───────────────────────────────────────────────────────────────
btnFocus.addEventListener('click', () => {
  const d = deviceStore.get(selectedId);
  if (d) map.setView([d.data.lat, d.data.lng], 17);
});

btnDeselect.addEventListener('click', () => {
  selectedId = null;
  detailCard.style.display = 'none';
  renderDeviceList();
});

// ── SSE: connect to server and listen for device updates ──────────────────────
function connectStream() {
  const es = new EventSource('/api/stream');

  es.onmessage = (event) => {
    const msg = JSON.parse(event.data);

    if (msg.type === 'snapshot') {
      // Initial list of already-connected devices
      msg.devices.forEach(addOrUpdateDevice);
    } else if (msg.type === 'update') {
      addOrUpdateDevice(msg.device);
    } else if (msg.type === 'device_removed') {
      removeDevice(msg.deviceId);
    }
  };

  es.onerror = () => {
    // Auto-reconnect after 3 s
    setTimeout(connectStream, 3000);
    es.close();
  };
}

connectStream();

// ── Add or update a device on the map ────────────────────────────────────────
function addOrUpdateDevice(data) {
  const latLng = L.latLng(data.lat, data.lng);

  if (!deviceStore.has(data.deviceId)) {
    // New device — create map objects
    const colour = nextColour();

    const marker = L.circleMarker(latLng, {
      radius: 10, color: '#fff', weight: 2,
      fillColor: colour, fillOpacity: 1
    }).addTo(map)
      .bindTooltip(data.name, { permanent: true, direction: 'top', offset: [0, -14],
        className: 'device-tooltip' })
      .on('click', () => selectDevice(data.deviceId));

    const accuracyCircle = L.circle(latLng, {
      radius: data.accuracy, color: colour,
      fillColor: colour, fillOpacity: 0.08, weight: 1
    }).addTo(map);

    const polyline = L.polyline([latLng], { color: colour, weight: 3, opacity: 0.7 }).addTo(map);

    deviceStore.set(data.deviceId, {
      data, colour, marker, accuracyCircle,
      trail: [latLng], polyline
    });

    // Auto-select first device
    if (!selectedId) selectDevice(data.deviceId);

    // Pan map to show all devices
    fitAllDevices();

  } else {
    // Existing device — update position
    const d = deviceStore.get(data.deviceId);
    d.data = data;

    d.marker.setLatLng(latLng);
    d.marker.setTooltipContent(data.name);
    d.accuracyCircle.setLatLng(latLng);
    d.accuracyCircle.setRadius(data.accuracy);

    // Add point to trail if moved more than 5 m
    const last = d.trail[d.trail.length - 1];
    if (last.distanceTo(latLng) > 5) {
      d.trail.push(latLng);
      d.polyline.setLatLngs(d.trail);
    }
  }

  updateDeviceCount();
  renderDeviceList();

  // Refresh detail card if this is the selected device
  if (selectedId === data.deviceId) updateDetailCard(data);
}

function removeDevice(deviceId) {
  const d = deviceStore.get(deviceId);
  if (!d) return;
  map.removeLayer(d.marker);
  map.removeLayer(d.accuracyCircle);
  map.removeLayer(d.polyline);
  deviceStore.delete(deviceId);

  if (selectedId === deviceId) {
    selectedId = null;
    detailCard.style.display = 'none';
  }

  updateDeviceCount();
  renderDeviceList();
}

// ── Select a device to show its detail card ───────────────────────────────────
function selectDevice(deviceId) {
  selectedId = deviceId;
  const d = deviceStore.get(deviceId);
  if (!d) return;
  updateDetailCard(d.data);
  detailCard.style.display = 'block';
  renderDeviceList();
}

function updateDetailCard(data) {
  detailName.textContent  = data.name;
  dCoords.textContent     = `${data.lat.toFixed(5)}, ${data.lng.toFixed(5)}`;
  dAccuracy.textContent   = `±${Math.round(data.accuracy)} m`;
  dSpeed.textContent      = data.speed != null ? `${(data.speed * 3.6).toFixed(1)} km/h` : '—';
  dBattery.textContent    = data.battery != null ? `${data.battery}%` : '—';
  dLastseen.textContent   = new Date(data.lastSeen).toLocaleTimeString();
}

// ── Device list panel ─────────────────────────────────────────────────────────
function renderDeviceList() {
  if (deviceStore.size === 0) {
    deviceListEl.innerHTML = '<p class="empty-msg">No devices connected yet.<br>Share the tracking link with a phone.</p>';
    return;
  }

  deviceListEl.innerHTML = [...deviceStore.values()].map(d => {
    const isSelected = d.data.deviceId === selectedId;
    return `
      <div class="device-item ${isSelected ? 'selected' : ''}"
           style="border-left: 3px solid ${d.colour};"
           onclick="selectDevice('${d.data.deviceId}')">
        <div class="di-name">${escHtml(d.data.name)}</div>
        <div class="di-meta">
          ${d.data.lat.toFixed(4)}, ${d.data.lng.toFixed(4)}
          ${d.data.battery != null ? ` · 🔋 ${d.data.battery}%` : ''}
        </div>
      </div>`;
  }).join('');
}

function updateDeviceCount() {
  const n = deviceStore.size;
  deviceCountEl.textContent = `${n} device${n !== 1 ? 's' : ''} online`;
}

function fitAllDevices() {
  if (deviceStore.size === 0) return;
  const points = [...deviceStore.values()].map(d => [d.data.lat, d.data.lng]);
  map.fitBounds(L.latLngBounds(points), { padding: [60, 60], maxZoom: 15 });
}

// Expose to inline HTML onclick
window.selectDevice = selectDevice;

function escHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
