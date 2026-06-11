// ─────────────────────────────────────────────────────────────────────────────
//  deviceManager.js
//
//  PURPOSE:
//  The brain of the dashboard. Decides what to do when a phone's data arrives:
//  - Is this a new phone? Create its dot, circle, and trail on the map.
//  - Is this a phone we already know? Move its dot and extend its trail.
//  - Did a phone go offline? Remove everything for that phone.
//
//  This file connects the live data stream → the map → the UI.
// ─────────────────────────────────────────────────────────────────────────────

// Import the shared state store (where we keep all device data)
import { deviceStore, selectedId, setSelectedId } from './store.js';

// Import all map drawing functions from mapManager
import {
  createMarker,           // draws the coloured dot
  createAccuracyCircle,   // draws the accuracy ring
  createPolyline,         // draws the trail line
  moveMarker,             // moves the dot to a new position
  moveCircle,             // moves and resizes the accuracy ring
  updatePolyline,         // redraws the trail with new points
  removeFromMap,          // removes all map objects for a device
  fitAll,                 // zooms map to show all devices
} from './mapManager.js';

// nextColour() gives each new device a unique colour from our palette
import { nextColour }            from '../utils/colours.js';

// haversine() calculates the real-world distance between two GPS points
// formatDist() turns a number like 1500 into "1.50 km"
import { haversine, formatDist } from '../utils/geo.js';

// UI rendering functions
import { renderDeviceList, updateDeviceCount, updateDetailCard } from './ui.js';


// ── addOrUpdateDevice() ───────────────────────────────────────────────────────
//
//  THE MAIN ENTRY POINT — called by stream.js every time any phone sends data.
//
//  Parameter:
//  - data: the device object from the server:
//    {
//      deviceId: 'phone-abc123',   ← unique ID for this phone
//      name:     "John's iPhone",  ← display name
//      lat:      10.5105,          ← GPS latitude
//      lng:      7.4165,           ← GPS longitude
//      accuracy: 12.5,             ← GPS accuracy in metres
//      speed:    1.4,              ← speed in m/s (multiply by 3.6 for km/h)
//      battery:  82,               ← battery percentage
//      lastSeen: 1718000000000,    ← Unix timestamp in milliseconds
//    }
//
export function addOrUpdateDevice(data) {
  // deviceStore.has() checks if we've seen this deviceId before
  if (!deviceStore.has(data.deviceId)) {
    // This is a NEW device — create all its map objects
    _createDevice(data);
  } else {
    // This is an EXISTING device — just update its position
    _updateDevice(data);
  }

  // After adding/updating, refresh the count badge and sidebar list
  updateDeviceCount();
  renderDeviceList();

  // If this device is the one currently shown in the detail card, refresh the card
  if (selectedId === data.deviceId) {
    updateDetailCard(deviceStore.get(data.deviceId));
  }
}


// ── removeDevice() ────────────────────────────────────────────────────────────
//
//  Removes a device that has gone offline (no ping for 60 seconds).
//  Cleans up everything — map objects, store entry, detail card.
//
//  Parameter:
//  - deviceId: the ID of the device to remove (string)
//
export function removeDevice(deviceId) {
  // Get the device's data from the store
  const entry = deviceStore.get(deviceId);
  if (!entry) return; // already removed, nothing to do

  // Remove the dot, accuracy circle, and trail line from the map
  removeFromMap(entry.marker, entry.accuracyCircle, entry.polyline);

  // Delete the device from our in-memory store
  deviceStore.delete(deviceId);

  // If this was the selected device, close the detail card
  if (selectedId === deviceId) {
    setSelectedId(null);
    document.getElementById('detail-card').classList.add('hidden');
  }

  // Refresh the count and list
  updateDeviceCount();
  renderDeviceList();
}


// ─────────────────────────────────────────────────────────────────────────────
//  PRIVATE HELPERS
// ─────────────────────────────────────────────────────────────────────────────

// ── _createDevice() ───────────────────────────────────────────────────────────
//
//  Called the FIRST TIME we see a device. Builds all its map objects.
//
function _createDevice(data) {
  // Pick the next available colour from the palette
  const colour = nextColour();

  // latLng is a { lat, lng } object — the device's current position
  const latLng = { lat: data.lat, lng: data.lng };

  // 'entry' is the object we store in deviceStore for this device.
  // It holds EVERYTHING we know about this device:
  const entry = {
    data,           // the latest raw data from the server (lat, lng, battery, etc.)
    colour,         // the assigned colour (never changes for this device)
    trail:     [latLng], // array of ALL past positions — starts with current position
    totalDist: 0,        // total distance travelled in metres (starts at 0)

    // Map objects — null until created below
    marker:         null,
    accuracyCircle: null,
    polyline:       null,
  };

  // Create the coloured dot on the map
  // The third argument is a click handler: when the user clicks the dot,
  // call selectDevice() with this device's ID
  entry.marker = createMarker(
    latLng,
    colour,
    data.name,
    () => selectDevice(data.deviceId)  // arrow function captures deviceId
  );

  // Create the translucent accuracy ring around the dot
  // data.accuracy is in metres — e.g. 15 means "I'm somewhere within 15m of this point"
  entry.accuracyCircle = createAccuracyCircle(latLng, data.accuracy, colour);

  // Create the trail polyline — starts as a single point
  // It will grow as the device moves (see _updateDevice below)
  entry.polyline = createPolyline(latLng, colour);

  // Save this entry in the global deviceStore so we can find it later
  // deviceStore is a Map: deviceStore.set(key, value)
  deviceStore.set(data.deviceId, entry);

  // Auto-select the first device that connects (so the detail card shows immediately)
  if (!selectedId) selectDevice(data.deviceId);

  // Zoom the map to show all currently tracked devices
  fitAll([...deviceStore.values()].map(e => ({ lat: e.data.lat, lng: e.data.lng })));
}


// ── _updateDevice() ───────────────────────────────────────────────────────────
//
//  Called every time an EXISTING device sends a new GPS ping.
//  Updates the dot position, accuracy circle, and potentially extends the trail.
//
function _updateDevice(data) {
  // Get the existing entry from the store
  const entry = deviceStore.get(data.deviceId);

  // 'prev' = where the device was BEFORE this update
  // We need this to calculate how far it moved
  const prev   = { lat: entry.data.lat, lng: entry.data.lng };

  // The new position
  const latLng = { lat: data.lat, lng: data.lng };

  // Update the stored data to the latest values
  entry.data = data;

  // Move the dot and accuracy circle to the new position
  moveMarker(entry.marker, latLng, data.name);
  moveCircle(entry.accuracyCircle, latLng, data.accuracy);

  // Calculate how far the device moved since the last update (in metres)
  const dist = haversine(prev, latLng);

  // Only extend the trail if the device actually moved more than 5 metres.
  // This filters out GPS jitter — tiny random movements when standing still.
  if (dist > 5) {
    entry.totalDist += dist; // add this step to the total distance

    // Push the new position onto the trail array
    // This array now contains every point the device has visited
    entry.trail.push(latLng);

    // Redraw the trail line through all points including the new one
    // updatePolyline calls polyline.setLatLngs(entry.trail) under the hood
    updatePolyline(entry.polyline, entry.trail);
  }
}


// ── selectDevice() ───────────────────────────────────────────────────────────
//
//  Called when the user clicks a device dot on the map OR a device in the sidebar.
//  Shows the detail card with all the device's stats.
//
//  Parameter:
//  - deviceId: which device to select (string)
//
export function selectDevice(deviceId) {
  // Update the global selectedId so other functions know which device is focused
  setSelectedId(deviceId);

  const entry = deviceStore.get(deviceId);
  if (!entry) return;

  // Fill in and show the detail card
  updateDetailCard(entry);
  document.getElementById('detail-card').classList.remove('hidden');

  // Re-render the sidebar so the selected device gets the highlight style
  renderDeviceList();
}

// Expose selectDevice on window because the sidebar HTML calls it via onclick=""
// Without this, clicking a device in the sidebar would throw "selectDevice is not defined"
window.selectDevice = selectDevice;
