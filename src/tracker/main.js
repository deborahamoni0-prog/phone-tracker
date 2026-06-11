// main.js — Tracker (phone) entry point
// Runs on track.html. Reads GPS, sends pings, updates the UI.

import { getDeviceId }  from './deviceId.js';
import { initBattery }  from './battery.js';
import { startGPS, stopGPS } from './gps.js';
import { sendPing }     from './sender.js';

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

// ── Called on every GPS position update ──────────────────────────────────────
async function onFix(position) {
  const { latitude: lat, longitude: lng, accuracy, speed } = position.coords;
  const name = nameInput.value.trim() || 'Unnamed Device';

  // Update UI immediately
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

// ── GPS error handler ─────────────────────────────────────────────────────────
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
