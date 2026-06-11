// deviceManager.js
// Handles adding, updating and removing devices from the store and map.

import { deviceStore, selectedId, setSelectedId } from './store.js';
import {
  createMarker, createAccuracyCircle, createPolyline,
  moveMarker, moveCircle, updatePolyline,
  removeFromMap, fitAll,
} from './mapManager.js';
import { nextColour }         from '../utils/colours.js';
import { haversine, formatDist } from '../utils/geo.js';
import { renderDeviceList, updateDeviceCount, updateDetailCard } from './ui.js';

// Called every time an update arrives from the SSE stream
export function addOrUpdateDevice(data) {
  if (!deviceStore.has(data.deviceId)) {
    _createDevice(data);
  } else {
    _updateDevice(data);
  }

  updateDeviceCount();
  renderDeviceList();

  // Refresh detail card if this device is currently selected
  if (selectedId === data.deviceId) {
    updateDetailCard(deviceStore.get(data.deviceId));
  }
}

export function removeDevice(deviceId) {
  const entry = deviceStore.get(deviceId);
  if (!entry) return;

  removeFromMap(entry.marker, entry.accuracyCircle, entry.polyline);
  deviceStore.delete(deviceId);

  if (selectedId === deviceId) {
    setSelectedId(null);
    document.getElementById('detail-card').classList.add('hidden');
  }

  updateDeviceCount();
  renderDeviceList();
}

// ── Private ───────────────────────────────────────────────────────────────────

function _createDevice(data) {
  const colour = nextColour();
  const latLng = { lat: data.lat, lng: data.lng };

  const entry = {
    data,
    colour,
    trail:     [latLng],
    totalDist: 0,
    marker:         null,
    accuracyCircle: null,
    polyline:       null,
  };

  entry.marker         = createMarker(latLng, colour, data.name, () => selectDevice(data.deviceId));
  entry.accuracyCircle = createAccuracyCircle(latLng, data.accuracy, colour);
  entry.polyline       = createPolyline(latLng, colour);

  deviceStore.set(data.deviceId, entry);

  // Auto-select the first device that connects
  if (!selectedId) selectDevice(data.deviceId);

  fitAll([...deviceStore.values()].map(e => ({ lat: e.data.lat, lng: e.data.lng })));
}

function _updateDevice(data) {
  const entry  = deviceStore.get(data.deviceId);
  const prev   = { lat: entry.data.lat, lng: entry.data.lng };
  const latLng = { lat: data.lat,       lng: data.lng };

  entry.data = data;

  moveMarker(entry.marker, latLng, data.name);
  moveCircle(entry.accuracyCircle, latLng, data.accuracy);

  // Only extend the trail if the phone actually moved (>5 m)
  const dist = haversine(prev, latLng);
  if (dist > 5) {
    entry.totalDist += dist;
    entry.trail.push(latLng);
    updatePolyline(entry.polyline, entry.trail);
  }
}

export function selectDevice(deviceId) {
  setSelectedId(deviceId);
  const entry = deviceStore.get(deviceId);
  if (!entry) return;

  updateDetailCard(entry);
  document.getElementById('detail-card').classList.remove('hidden');
  renderDeviceList();
}

// Expose selectDevice globally for inline onclick in rendered HTML
window.selectDevice = selectDevice;
