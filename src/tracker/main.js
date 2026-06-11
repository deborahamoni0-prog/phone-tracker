// main.js — Tracker (phone) entry point
// Runs on track.html. Reads GPS, sends pings, updates the UI.
// (gps.js, battery.js, deviceId.js, sender.js merged in)

// ── deviceId ──────────────────────────────────────────────────────────────────
function getDeviceId() {
  const KEY = 'phonetrace_device_id';
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = 'phone-' + Math.random().toString(36).slice(2, 10);
    localStorage.setItem(KEY, id);
  }
  return id;
}

// ── battery ───────────────────────────────────────────────────────────────────
async function initBattery(onUpdate) {
  if (!navigator.getBattery) return;
  const battery = await navigator.getBattery();
  onUpdate(Math.round(battery.level * 100));
  battery.addEventListener('levelchange', () => onUpdate(Math.round(battery.level * 100)));
}

// ── gps ───────────────────────────────────────────────────────────────────────
function startGPS(onFix, onError) {
  if (!navigator.geolocation) { onError({ code: 0 }); return null; }
  return navigator.geolocation.watchPosition(onFix, onError, {
    enableHighAccuracy: true,
    timeout:            20000,
    maximumAge:         0,
  });
}

function stopGPS(watchId) {
  if (watchId !== null) navigator.geolocation.clearWatch(watchId);
}

// ── sender ────────────────────────────────────────────────────────────────────
async function sendPing(data) {
  const res = await fetch('/api/ping', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Server responded ${res.status}`);
  return res.json();
}

// ── State ─────────────────────────────────────────────────────────────────────
const state = {
  deviceId: getDeviceId(),
  watchId:  null,
  pings:    0,
  battery:  null,
};

// ── DOM ───────────────────────────────────────────────────────────────────────
const btnStart    = document.getElementById('btn-track-start');
const trackDot    = document.getElementById('track-dot');
const trackStatus = document.getElementById('track-status');
const tCoords     = document.getElementById('t-coords');
const tAccuracy   = document.getElementById('t-accuracy');
const tBattery    = document.getElementById('t-battery');
const tPings      = document.getElementById('t-pings');
const nameInput   = document.getElementById('t-name-input');

// ── Restore saved device name ─────────────────────────────────────────────────
nameInput.value = localStorage.getItem('phonetrace_device_name') || '';
nameInput.addEventListener('input', () => {
  localStorage.setItem('phonetrace_device_name', nameInput.value.trim());
});

// ── Battery ───────────────────────────────────────────────────────────────────
initBattery((level) => {
  state.battery = level;
  tBattery.textContent = `${level}%`;
});

// ── Start / Stop ──────────────────────────────────────────────────────────────
btnStart.addEventListener('click', () => {
  state.watchId === null ? startTracking() : stopTracking();
});

function startTracking() {
  setStatus('waiting', 'Waiting for GPS signal…');
  btnStart.textContent = '⏹ Stop Sharing';
  btnStart.style.background = '#ef4444';
  state.watchId = startGPS(onFix, onError);
}

function stopTracking() {
  stopGPS(state.watchId);
  state.watchId = null;
  btnStart.textContent = '▶ Start Sharing Location';
  btnStart.style.background = '';
  setStatus('idle', 'Stopped. Tap Start to resume.');
}

// ── GPS position update ───────────────────────────────────────────────────────
async function onFix(position) {
  const { latitude: lat, longitude: lng, accuracy, speed } = position.coords;
  const name = nameInput.value.trim() || 'Unnamed Device';

  tCoords.textContent   = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  tAccuracy.textContent = `±${Math.round(accuracy)} m`;

  try {
    await sendPing({ deviceId: state.deviceId, name, lat, lng, accuracy, speed, battery: state.battery });
    state.pings++;
    tPings.textContent = state.pings;
    setStatus('active', `Sharing live · ±${Math.round(accuracy)} m`);
  } catch {
    setStatus('error', 'Cannot reach server. Retrying on next GPS update…');
  }
}

// ── GPS error ─────────────────────────────────────────────────────────────────
function onError(err) {
  stopTracking();
  const messages = {
    0: 'Geolocation not supported by this browser.',
    1: 'Location permission denied. Please allow it in browser settings.',
    2: 'GPS signal unavailable. Try moving outdoors.',
    3: 'GPS timed out. Try again in an open area.',
  };
  setStatus('error', messages[err.code] || 'Unknown GPS error.');
}

// ── Status helper ─────────────────────────────────────────────────────────────
function setStatus(type, msg) {
  trackStatus.textContent = msg;
  trackDot.className = type !== 'idle' ? type : '';
}
