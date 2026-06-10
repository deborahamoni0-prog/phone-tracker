// ── track.js — runs on the phone being tracked ────────────────────────────────

// Persistent device ID stored in localStorage so the same phone keeps its ID
function getDeviceId() {
  let id = localStorage.getItem('tracker_device_id');
  if (!id) {
    id = 'phone-' + Math.random().toString(36).slice(2, 10);
    localStorage.setItem('tracker_device_id', id);
  }
  return id;
}

const DEVICE_ID = getDeviceId();

const state = {
  watchId:  null,
  pings:    0,
  battery:  null,
};

// DOM
const btnStart    = document.getElementById('btn-track-start');
const trackDot    = document.getElementById('track-dot');
const trackStatus = document.getElementById('track-status');
const tCoords     = document.getElementById('t-coords');
const tAccuracy   = document.getElementById('t-accuracy');
const tBattery    = document.getElementById('t-battery');
const tPings      = document.getElementById('t-pings');
const tNameInput  = document.getElementById('t-name-input');

// Load saved name
tNameInput.value = localStorage.getItem('tracker_device_name') || '';
tNameInput.addEventListener('input', () => {
  localStorage.setItem('tracker_device_name', tNameInput.value);
});

// Battery API
if (navigator.getBattery) {
  navigator.getBattery().then(b => {
    state.battery = Math.round(b.level * 100);
    tBattery.textContent = `${state.battery}%`;
    b.addEventListener('levelchange', () => {
      state.battery = Math.round(b.level * 100);
      tBattery.textContent = `${state.battery}%`;
    });
  });
} else {
  tBattery.textContent = 'N/A';
}

// Start / Stop
btnStart.addEventListener('click', () => {
  state.watchId === null ? startSharing() : stopSharing();
});

function startSharing() {
  if (!navigator.geolocation) {
    setStatus('error', 'Geolocation not supported on this browser.');
    return;
  }

  setStatus('waiting', 'Waiting for GPS signal…');
  btnStart.textContent = '⏹ Stop Sharing';
  btnStart.style.background = '#ef4444';

  state.watchId = navigator.geolocation.watchPosition(
    onFix,
    onError,
    { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
  );
}

function stopSharing() {
  if (state.watchId !== null) {
    navigator.geolocation.clearWatch(state.watchId);
    state.watchId = null;
  }
  btnStart.textContent = '▶ Start Sharing';
  btnStart.style.background = '';
  setStatus('idle', 'Stopped. Tap Start to resume.');
}

// Every GPS fix → send to server
async function onFix(position) {
  const { latitude: lat, longitude: lng, accuracy, speed } = position.coords;

  tCoords.textContent   = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  tAccuracy.textContent = `±${Math.round(accuracy)} m`;

  const name = tNameInput.value.trim() || 'Unnamed Device';

  try {
    const res = await fetch('/api/ping', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deviceId: DEVICE_ID,
        name,
        lat, lng, accuracy, speed,
        battery: state.battery
      })
    });

    if (res.ok) {
      state.pings++;
      tPings.textContent = state.pings;
      setStatus('active', `Sharing live · ±${Math.round(accuracy)} m`);
    } else {
      setStatus('error', 'Server error. Retrying…');
    }
  } catch {
    setStatus('error', 'Cannot reach server. Check connection.');
  }
}

function onError(err) {
  stopSharing();
  const msgs = {
    1: 'Location permission denied. Please allow location in browser settings.',
    2: 'GPS signal unavailable. Try moving outdoors.',
    3: 'GPS timed out. Try again in an open area.',
  };
  setStatus('error', msgs[err.code] || 'GPS error.');
}

function setStatus(type, msg) {
  trackStatus.textContent = msg;
  trackDot.className = '';
  if (type !== 'idle') trackDot.classList.add(type);
}
