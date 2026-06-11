# Dashboard JS — ELI5 Code Explanation

This document explains every line of every JavaScript file inside `src/dashboard/`, as if you are 5 years old.

The dashboard is the map page you open on a laptop or computer to watch phones in real time.

---

## How the files connect

```
main.js          ← starts everything, calls the others in order
  │
  ├── mapManager.js   ← the only file allowed to touch the map
  ├── stream.js       ← listens for live updates from the server
  │     └── deviceManager.js  ← decides what to do with each update
  │           ├── store.js         ← shared notebook (all device data lives here)
  │           ├── mapManager.js    ← draws/moves/removes dots on the map
  │           └── ui.js            ← updates the sidebar and detail card
  ├── controls.js     ← wires up the Focus, Street View, Close buttons
  └── modal.js        ← wires up the Share Link modal and QR code
```

---

## `main.js` — the starter

```js
import { initMap }       from './mapManager.js';
import { connectStream } from './stream.js';
import { initControls }  from './controls.js';
import { initModal }     from './modal.js';
```
These four lines bring in the "boot" function from each other file.
- `initMap` — draws the map on screen.
- `connectStream` — opens the live connection to the server.
- `initControls` — makes the buttons in the detail card work.
- `initModal` — makes the Share Link popup work.

---

```js
async function boot() {
  await initMap();
  connectStream();
  initControls();
  initModal();
}
```
`boot` runs everything in the correct order.
`async` means this function can use `await` — a way to say "pause here until this is done before moving on".
`await initMap()` waits until the map is fully loaded before doing anything else.
If we started `connectStream()` before the map was ready, device data would arrive and there would be nowhere to draw the dots.

---

```js
boot();
```
The last line. Everything above is just definitions. This one line actually starts the whole dashboard.

---

## `store.js` — the shared notebook

```js
export const deviceStore = new Map();
```
`deviceStore` is the central notebook for the whole dashboard.
Every phone being tracked has one entry here.
- The key is the phone's `deviceId` (e.g. `'phone-abc123'`).
- The value is an object with everything we know about that phone: its GPS data, colour, and the map objects representing it.

`Map` is like a JavaScript object, but better for this use case — it preserves insertion order, is faster for frequent adds/deletes, and has cleaner methods like `.has()`, `.get()`, `.set()`, `.delete()`.

`export` means other files can import and use this variable.

---

```js
export let selectedId = null;
```
Tracks which device is currently shown in the detail card.
`null` means no device is selected.
`let` instead of `const` because this value changes when the user clicks different devices.

---

```js
export function setSelectedId(id) {
  selectedId = id;
}
```
Other files cannot directly reassign `selectedId` (because of how ES module exports work).
They call this function instead, which updates it.
Think of it as a controlled door — you cannot reach in and grab the variable directly, you knock and ask.

---

## `stream.js` — the live listener

```js
import { addOrUpdateDevice, removeDevice } from './deviceManager.js';
```
Brings in the two functions it needs to react to server messages.
- `addOrUpdateDevice` — called when a phone sends a new position.
- `removeDevice` — called when a phone goes offline.

---

```js
export function connectStream() {
  const es = new EventSource('/api/stream');
```
`EventSource` is a browser built-in that opens a special kind of connection called SSE (Server-Sent Events).
Think of it like leaving a phone call open forever.
- Your browser connects to `/api/stream` on the server.
- The server keeps the connection open.
- Whenever a phone moves, the server pushes a message down that open line instantly.
- The browser receives it without you having to refresh the page.

This is different from a normal request where you ask → server answers → connection closes.

---

```js
  es.onmessage = (event) => {
    const msg = JSON.parse(event.data);
```
`onmessage` fires every time the server sends a message down the open connection.
`event.data` is the raw text that arrived (a JSON string like `'{"type":"update","device":{...}}'`).
`JSON.parse(...)` converts that text string back into a JavaScript object we can work with.

---

```js
    if (msg.type === 'snapshot') {
      msg.devices.forEach(addOrUpdateDevice);
```
`snapshot` is sent once, right when the dashboard first connects.
It contains every phone currently being tracked.
`forEach` loops through the array and calls `addOrUpdateDevice` for each phone — this draws all existing dots on the map so the dashboard is not blank on load.

---

```js
    } else if (msg.type === 'update') {
      addOrUpdateDevice(msg.device);
```
`update` arrives every time any phone sends a new GPS ping.
`msg.device` is the full device object: `{ deviceId, name, lat, lng, accuracy, speed, battery, lastSeen }`.
We pass it straight to `addOrUpdateDevice` which decides whether to create a new dot or move an existing one.

---

```js
    } else if (msg.type === 'device_removed') {
      removeDevice(msg.deviceId);
    }
```
`device_removed` arrives when the server has not heard from a phone in 60 seconds — it is considered offline.
`msg.deviceId` is the ID of the phone to remove.
`removeDevice` deletes its dot, accuracy circle, and trail from the map.

---

```js
  es.onerror = () => {
    es.close();
    setTimeout(connectStream, 3000);
  };
}
```
If the connection drops (server restarts, internet blip), `onerror` fires.
- `es.close()` — cleanly closes the broken connection.
- `setTimeout(connectStream, 3000)` — wait 3 seconds, then call `connectStream` again to reopen it.
This creates an automatic reconnect loop so the dashboard recovers on its own.

---

## `deviceManager.js` — the brain

This is the most important dashboard file. It receives phone data and decides what to do with it.

```js
import { deviceStore, selectedId, setSelectedId } from './store.js';
```
Brings in the shared notebook and the selected device tracker.

---

```js
import {
  createMarker, createAccuracyCircle, createPolyline,
  moveMarker, moveCircle, updatePolyline,
  removeFromMap, fitAll,
} from './mapManager.js';
```
Brings in all the map drawing functions.
`deviceManager` never touches the map directly — it always calls these functions.
This keeps map code in one place (`mapManager.js`) so if you ever swap map libraries, you only change one file.

---

```js
import { nextColour }            from '../utils/colours.js';
import { haversine, formatDist } from '../utils/geo.js';
import { renderDeviceList, updateDeviceCount, updateDetailCard } from './ui.js';
```
- `nextColour` — gives each new device a unique colour from the palette.
- `haversine` — calculates real-world distance between two GPS points.
- `formatDist` — turns `1500` into `"1.50 km"`.
- The `ui` imports — refresh the sidebar and detail card after any change.

---

### `addOrUpdateDevice(data)` — the main entry point

```js
export function addOrUpdateDevice(data) {
  if (!deviceStore.has(data.deviceId)) {
    _createDevice(data);
  } else {
    _updateDevice(data);
  }
```
Called by `stream.js` every time any phone sends data.
`deviceStore.has(data.deviceId)` checks whether we have seen this phone before.
- If not → `_createDevice` — first time we have seen this phone, build all its map objects.
- If yes → `_updateDevice` — we already have a dot for it, just move it.

---

```js
  updateDeviceCount();
  renderDeviceList();
  if (selectedId === data.deviceId) {
    updateDetailCard(deviceStore.get(data.deviceId));
  }
}
```
After every update, refresh the device count badge and the sidebar list.
If the updated phone is the one currently shown in the detail card, refresh the card too so the coordinates and speed stay current.

---

### `removeDevice(deviceId)`

```js
export function removeDevice(deviceId) {
  const entry = deviceStore.get(deviceId);
  if (!entry) return;
```
Look up the device in our notebook. `if (!entry) return` is a safety check — if the device was already removed, do nothing.

---

```js
  removeFromMap(entry.marker, entry.accuracyCircle, entry.polyline);
  deviceStore.delete(deviceId);
```
- `removeFromMap` tells `mapManager` to remove all three visual objects (dot, ring, trail) from the map.
- `deviceStore.delete` removes the device's entry from our notebook.

---

```js
  if (selectedId === deviceId) {
    setSelectedId(null);
    document.getElementById('detail-card').classList.add('hidden');
  }
  updateDeviceCount();
  renderDeviceList();
}
```
If the device that went offline was the one selected in the detail card, close the card and clear the selection.
Then refresh the count badge and sidebar list.

---

### `_createDevice(data)` — building a new device from scratch

```js
function _createDevice(data) {
  const colour = nextColour();
  const latLng = { lat: data.lat, lng: data.lng };
```
`nextColour()` picks the next colour from the palette (blue, green, amber, red...). Each phone gets a unique colour that never changes.
`latLng` is a plain object with the current position — used throughout this function.

---

```js
  const entry = {
    data,
    colour,
    trail:     [latLng],
    totalDist: 0,
    marker:         null,
    accuracyCircle: null,
    polyline:       null,
  };
```
Build the entry object — the record for this device that lives in `deviceStore`.
- `data` — the latest GPS info from the server.
- `colour` — the assigned colour, saved here permanently.
- `trail: [latLng]` — the travel history. Starts with just the current position. New points are pushed here as the phone moves.
- `totalDist: 0` — total metres travelled since tracking started. Increments with every real movement.
- `marker / accuracyCircle / polyline` — the three visual objects on the map. Set to `null` now because they are created in the next lines.

---

```js
  entry.marker = createMarker(latLng, colour, data.name, () => selectDevice(data.deviceId));
```
Creates the coloured dot on the map.
- `latLng` — where to place it.
- `colour` — what colour to fill it with.
- `data.name` — the label text floating above the dot.
- `() => selectDevice(data.deviceId)` — the click handler. When the user clicks the dot, call `selectDevice` with this phone's ID to open the detail card. The arrow function "captures" `data.deviceId` so it always refers to this specific phone.

---

```js
  entry.accuracyCircle = createAccuracyCircle(latLng, data.accuracy, colour);
```
Creates the large translucent ring around the dot showing GPS accuracy.
`data.accuracy` is in metres — e.g. `15` means "the real position is somewhere within a 15 metre circle of this dot".
A big ring = poor GPS signal. A tiny ring = very accurate GPS.

---

```js
  entry.polyline = createPolyline(latLng, colour);
```
Creates the travel trail line. Starts as a single point. It grows as the phone moves (handled in `_updateDevice`).

---

```js
  deviceStore.set(data.deviceId, entry);
  if (!selectedId) selectDevice(data.deviceId);
  fitAll([...deviceStore.values()].map(e => ({ lat: e.data.lat, lng: e.data.lng })));
}
```
- `deviceStore.set(...)` — save the entry to the notebook. Now every future update can find this device by its ID.
- `if (!selectedId) selectDevice(...)` — if no device is selected yet, auto-select this one so the detail card appears immediately.
- `fitAll(...)` — zoom and pan the map so all currently tracked devices are visible at once. `[...deviceStore.values()]` spreads the Map's values into an array, then `.map(...)` extracts just the coordinates.

---

### `_updateDevice(data)` — moving an existing device

```js
function _updateDevice(data) {
  const entry = deviceStore.get(data.deviceId);
  const prev   = { lat: entry.data.lat, lng: entry.data.lng };
  const latLng = { lat: data.lat,       lng: data.lng       };
  entry.data = data;
```
Fetch the existing entry from the notebook.
`prev` = the position before this update (where the phone was).
`latLng` = the new position (where the phone is now).
`entry.data = data` overwrites the stored data with the latest values (new lat/lng, battery, speed, etc.).

---

```js
  moveMarker(entry.marker, latLng, data.name);
  moveCircle(entry.accuracyCircle, latLng, data.accuracy);
```
Tell `mapManager` to move the dot and the accuracy ring to the new position.
`mapManager` handles the Google Maps vs Leaflet difference internally — `deviceManager` does not need to care.

---

```js
  const dist = haversine(prev, latLng);
  if (dist > 5) {
    entry.totalDist += dist;
    entry.trail.push(latLng);
    updatePolyline(entry.polyline, entry.trail);
  }
}
```
`haversine(prev, latLng)` calculates how far the phone actually moved in metres.
`if (dist > 5)` — only extend the trail if the phone moved more than 5 metres.
This filters out GPS jitter — tiny random position wobbles that happen even when standing perfectly still. Without this check, the trail would fill with random squiggles.

When the phone genuinely moved:
- `entry.totalDist += dist` — add the distance to the running total (shown in the detail card).
- `entry.trail.push(latLng)` — append the new position to the history array.
- `updatePolyline(...)` — redraw the trail line through all points including the new one. The trail visually grows.

---

### `selectDevice(deviceId)`

```js
export function selectDevice(deviceId) {
  setSelectedId(deviceId);
  const entry = deviceStore.get(deviceId);
  if (!entry) return;
  updateDetailCard(entry);
  document.getElementById('detail-card').classList.remove('hidden');
  renderDeviceList();
}
window.selectDevice = selectDevice;
```
Called when the user clicks a dot on the map or an item in the sidebar.
- `setSelectedId(deviceId)` — update the global `selectedId` in `store.js`.
- `updateDetailCard(entry)` — fill the detail card panel with this device's stats.
- `classList.remove('hidden')` — make the detail card visible (CSS hides it by default).
- `renderDeviceList()` — re-render the sidebar so the selected device gets the highlight style.

`window.selectDevice = selectDevice` — the sidebar HTML uses `onclick="selectDevice('...')"` as a plain string. For that to work, the function must be on the global `window` object. This line makes it global.

---

## `ui.js` — the screen updater

```js
import { deviceStore, selectedId } from './store.js';
import { formatDist }              from '../utils/geo.js';
import { el, escHtml as esc }      from '../utils/dom.js';
```
- `deviceStore` and `selectedId` — the shared state to read from.
- `formatDist` — for formatting the total distance.
- `el(id)` — a shortcut for `document.getElementById(id)`.
- `escHtml as esc` — imported with a shorter name `esc`. Safely encodes text so it cannot break the HTML.

---

### `updateDeviceCount()`

```js
export function updateDeviceCount() {
  const n = deviceStore.size;
  el('device-count').textContent    = `${n} device${n !== 1 ? 's' : ''} online`;
  el('sidebar-count').textContent   = n;
  el('sidebar-count').style.display = n > 0 ? 'inline-flex' : 'none';
  const dot = document.querySelector('.pulse-dot');
  if (dot) dot.style.background = n > 0 ? '#22c55e' : '#475569';
}
```
Updates the device count shown in the header.
- `deviceStore.size` — how many phones are currently tracked.
- `` `${n} device${n !== 1 ? 's' : ''}` `` — correct grammar: "1 device" vs "2 devices".
- `el('sidebar-count')` — the little badge number next to "Devices" in the sidebar. Hide it (`display: none`) when no devices are connected.
- The pulse dot changes from green (active) to grey (idle) based on whether any device is online.

---

### `renderDeviceList()`

```js
export function renderDeviceList() {
  const listEl = el('device-list');
  if (deviceStore.size === 0) {
    listEl.innerHTML = `...empty state HTML...`;
    return;
  }
```
Rebuilds the entire sidebar device list from scratch every time anything changes.
If there are no devices, show a friendly "No devices yet" message and stop.

---

```js
  listEl.innerHTML = [...deviceStore.values()].map(entry => {
    const d          = entry.data;
    const isSelected = d.deviceId === selectedId;
    const bat        = d.battery != null ? `🔋 ${d.battery}%` : '';
    const spd        = d.speed   != null ? `${(d.speed * 3.6).toFixed(0)} km/h` : '';
    return `<div class="device-item ${isSelected ? 'selected' : ''}" onclick="selectDevice('${esc(d.deviceId)}')">
      ...
    </div>`;
  }).join('');
}
```
`[...deviceStore.values()]` — spreads the Map's values into an array so we can use `.map()`.
For each device:
- `isSelected` — is this the currently selected device? If yes, add the `'selected'` CSS class to highlight it.
- `d.battery != null ? ... : ''` — only show battery if the phone reported it. `null` means it was not sent.
- `d.speed * 3.6` — converts metres per second (what GPS gives) to kilometres per hour (what humans understand). `3.6` is the conversion factor.
- `.toFixed(0)` — round to a whole number.
- `esc(d.deviceId)` — safely encode the ID before putting it in an `onclick` attribute. Prevents broken HTML if the ID contains special characters.

`.join('')` — joins all the HTML strings into one big string with nothing between them.
Setting `listEl.innerHTML` replaces the entire list at once.

---

### `updateDetailCard(entry)`

```js
export function updateDetailCard(entry) {
  const d = entry.data;
  el('detail-name').textContent = d.name;
  el('d-coords').textContent    = `${d.lat.toFixed(5)}, ${d.lng.toFixed(5)}`;
  el('d-accuracy').textContent  = `±${Math.round(d.accuracy)} m`;
  el('d-speed').textContent     = d.speed   != null ? `${(d.speed * 3.6).toFixed(1)} km/h` : '—';
  el('d-battery').textContent   = d.battery != null ? `${d.battery}%` : '—';
  el('d-lastseen').textContent  = new Date(d.lastSeen).toLocaleTimeString();
  el('d-distance').textContent  = formatDist(entry.totalDist);
}
```
Updates every field in the right-side detail card panel.
- `d.lat.toFixed(5)` — 5 decimal places on coordinates (precise to about 1 metre).
- `Math.round(d.accuracy)` — round accuracy to a whole number of metres.
- `d.speed * 3.6` — m/s to km/h.
- `.toFixed(1)` — one decimal place on speed (e.g. `12.4 km/h`).
- `d.speed != null ? ... : '—'` — show a dash if speed was not reported.
- `new Date(d.lastSeen).toLocaleTimeString()` — `d.lastSeen` is a Unix timestamp (big number of milliseconds). `new Date(...)` converts it to a Date object. `.toLocaleTimeString()` formats it as a readable time like `"14:32:05"` in the user's local format.
- `formatDist(entry.totalDist)` — total distance this phone has travelled, formatted as metres or km.

---

## `controls.js` — the button wirer

```js
import { el }                                     from '../utils/dom.js';
import { panTo }                                  from './mapManager.js';
import { deviceStore, selectedId, setSelectedId } from './store.js';
import { renderDeviceList }                       from './ui.js';
```
Brings in everything the button click handlers need.
- `el` — shortcut for `getElementById`.
- `panTo` — asks `mapManager` to move and zoom the map camera.
- `deviceStore / selectedId` — to know which device is selected.
- `renderDeviceList` — to refresh the sidebar after closing the detail card.

---

```js
export function initControls() {
  el('btn-focus').addEventListener('click', () => {
    const entry = deviceStore.get(selectedId);
    if (entry) panTo({ lat: entry.data.lat, lng: entry.data.lng }, 17);
  });
```
Wires up the Focus button.
`deviceStore.get(selectedId)` finds the currently selected device.
`panTo({lat, lng}, 17)` pans the map to that location and zooms to level 17 (street level).
`if (entry)` — safety check: do nothing if no device is selected.

---

```js
  el('btn-street-view').addEventListener('click', () => {
    const entry = deviceStore.get(selectedId);
    if (!entry) return;
    const url = `https://www.google.com/maps?q=${entry.data.lat},${entry.data.lng}&layer=c`;
    window.open(url, '_blank');
  });
```
Wires up the Street View button.
`window.open(url, '_blank')` opens a new browser tab.
`&layer=c` at the end of the Google Maps URL tells Google to open Street View mode at those coordinates.

---

```js
  el('btn-close-card').addEventListener('click', () => {
    setSelectedId(null);
    el('detail-card').classList.add('hidden');
    renderDeviceList();
  });
}
```
Wires up the close (✕) button on the detail card.
- `setSelectedId(null)` — clears the selection.
- `classList.add('hidden')` — hides the detail card (CSS has `.hidden { display: none }`).
- `renderDeviceList()` — re-renders the sidebar so the previously selected device loses its highlight.

---

## `modal.js` — the share link popup

```js
import { el } from '../utils/dom.js';

export function initModal() {
  const btnShare    = el('btn-share');
  const overlay     = el('modal-overlay');
  const btnClose    = el('btn-modal-close');
  const linkInput   = el('modal-link');
  const btnCopy     = el('btn-copy');
  const qrContainer = el('qr-code');
```
Grab all the HTML elements the modal needs.
Stored in variables at the top of `initModal` — one lookup each, then reused.

---

```js
  btnShare.addEventListener('click', () => {
    const url = `${location.protocol}//${location.host}/track`;
    linkInput.value = url;
    overlay.classList.remove('hidden');
```
When the Share button is clicked:
- `location.protocol` = `'https:'` or `'http:'` — whatever protocol the current page is using.
- `location.host` = the domain + port (e.g. `'phonetrace.onrender.com'` or `'localhost:5173'`).
- Together they build the full tracker URL: `https://phonetrace.onrender.com/track`.
- Put that URL in the text input and show the modal.

---

```js
    qrContainer.innerHTML = '';
    new QRCode(qrContainer, {
      text: url, width: 160, height: 160,
      colorDark: '#1e293b', colorLight: '#f8fafc',
    });
  });
```
`qrContainer.innerHTML = ''` — clear any previously generated QR code first.
`new QRCode(...)` — from the `qrcode.js` library (loaded in `index.html`). Generates a QR code image inside `qrContainer`.
- `text: url` — the data encoded in the QR code.
- `width / height` — the pixel size of the generated image.
- `colorDark / colorLight` — custom colours to match the dark theme.

Someone pointing their phone camera at the QR code will be taken straight to `/track` to start sharing their location.

---

```js
  btnClose.addEventListener('click', () => overlay.classList.add('hidden'));
  overlay.addEventListener('click', e => {
    if (e.target === overlay) overlay.classList.add('hidden');
  });
```
Two ways to close the modal:
1. Click the close button → hide the overlay.
2. Click the dark background behind the modal → also hide it.

`e.target === overlay` — only close if the user clicked the dark background itself, not something inside the modal. Without this check, clicking anywhere inside the modal (even the text input) would close it.

---

```js
  btnCopy.addEventListener('click', () => {
    navigator.clipboard.writeText(linkInput.value).then(() => {
      btnCopy.textContent = '✓ Copied!';
      setTimeout(() => (btnCopy.textContent = 'Copy'), 2000);
    });
  });
}
```
Wires up the Copy button.
`navigator.clipboard.writeText(...)` copies text to the user's clipboard. Returns a Promise.
`.then(...)` runs after the copy succeeds.
- Change the button text to `'✓ Copied!'` as instant feedback.
- `setTimeout(..., 2000)` — after 2 seconds (2000 milliseconds), change it back to `'Copy'`.

---

## Summary — what each file is responsible for

| File | One-line job |
|---|---|
| `main.js` | Starts everything in the right order |
| `store.js` | Stores all device data and the selected device ID |
| `stream.js` | Keeps the live connection to the server open and routes messages |
| `deviceManager.js` | Decides what to do when a phone appears, moves, or goes offline |
| `mapManager.js` | The only file that touches the map — draws, moves, removes objects |
| `ui.js` | Keeps the sidebar list and detail card in sync with the data |
| `controls.js` | Makes the Focus, Street View, and Close buttons work |
| `modal.js` | Makes the Share Link popup and QR code work |
