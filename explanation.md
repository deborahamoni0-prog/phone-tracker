# PhoneTrace — ELI5 Code Explanation

This document explains every line of `app.js`, `server.js`, and `track.js` as if you are 5 years old. No jargon. Plain English.

---

## What the three files do (the big picture)

Imagine a walkie-talkie set with three parts:

- **`track.js`** — runs on the phone. It reads the phone's GPS and shouts "I am here!" to the server every few seconds.
- **`server.js`** — the middleman. It listens for phones shouting, remembers their positions, and passes them on to anyone watching the map.
- **`app.js`** — runs on the dashboard (the map page on a laptop/computer). It watches for updates from the server and draws dots on the map.

---

## `server.js` — the middleman

```js
import http from 'http';
import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
```
These four lines bring in tools that Node.js already has built in.
- `http` — lets Node.js create a web server that browsers can talk to.
- `fs` — lets Node.js read files from the hard drive (so it can send `index.html`, etc.).
- `path` — helps build file paths correctly on any operating system (`/` on Mac/Linux, `\` on Windows).
- `fileURLToPath` — converts the special `import.meta.url` address into a normal folder path.

---

```js
const __dirname = path.dirname(fileURLToPath(import.meta.url));
```
`import.meta.url` is the address of this file on disk.
`fileURLToPath` turns it from a URL into a normal path like `/home/user/findmyphone/server.js`.
`path.dirname` strips the filename and gives us just the folder: `/home/user/findmyphone`.
We store that folder path in `__dirname` so we can find other files next to this one.

---

```js
const PORT = process.env.PORT || 8080;
```
`process.env.PORT` checks if the hosting service (like Render) has told us which port to use.
If not, we use port `8080` as the default.
Think of a port like a door number on a building — browsers knock on this number to reach our server.

---

```js
const isDev  = process.env.NODE_ENV !== 'production';
const STATIC = isDev ? __dirname : path.join(__dirname, 'dist');
```
`process.env.NODE_ENV` is a label set to `'production'` when the app is deployed, and anything else (or nothing) in development.
- In **dev mode**: we serve files straight from the project folder.
- In **production**: Vite has bundled everything into a `/dist` folder, so we serve from there.

---

```js
const devices          = new Map();
const dashboardClients = new Set();
```
- `devices` is like a notebook. Every phone that checks in gets one page. The page title is the phone's ID, and the page content is its GPS coordinates, battery, etc.
- `dashboardClients` is a list of everyone currently looking at the dashboard map. Every open browser tab is one entry.

---

```js
setInterval(() => {
  const cutoff = Date.now() - 60_000;
```
`setInterval` means "run this code on a timer". The `10_000` at the end means every 10,000 milliseconds = every 10 seconds.
`Date.now()` gives the current time as a big number (milliseconds since 1970).
`- 60_000` subtracts 60 seconds. So `cutoff` is the time 60 seconds ago.

---

```js
  for (const [id, device] of devices.entries()) {
    if (device.lastSeen < cutoff) {
```
Loop through every phone in our notebook.
`device.lastSeen` is the timestamp of the last time that phone pinged us.
If it is older than 60 seconds ago (less than `cutoff`), the phone has gone quiet — treat it as offline.

---

```js
      devices.delete(id);
      broadcast({ type: 'device_removed', deviceId: id });
      console.log(`[offline] ${device.name}`);
```
- Remove the phone from our notebook.
- Tell every open dashboard "this phone is gone, remove its dot from the map".
- Print a message in the server's terminal log so we can see it happened.

---

```js
function broadcast(data) {
  const msg = `data: ${JSON.stringify(data)}\n\n`;
  for (const client of dashboardClients) client.write(msg);
}
```
This is like a loudspeaker announcement to all open dashboard tabs.
- `JSON.stringify(data)` converts a JavaScript object like `{ type: 'update', device: {...} }` into a text string, because you can only send text over the internet.
- The `data: ` prefix and `\n\n` double newline are required by the SSE (Server-Sent Events) protocol — it is the format browsers expect for live streaming messages.
- The `for` loop goes through every open dashboard tab and sends them the message.

---

```js
const MIME = {
  '.html': 'text/html',
  '.css':  'text/css',
  '.js':   'text/javascript',
  ...
};
```
A lookup table. When someone asks for a `.css` file, the server needs to tell the browser "this is CSS, not HTML". This table maps file extensions to the correct label (called a MIME type).

---

```js
http.createServer((req, res) => {
```
Creates the actual web server. Every time a browser makes any request — loading the page, sending GPS data, opening the live stream — this function runs.
`req` = the incoming request (what the browser is asking for).
`res` = the response (what we send back).

---

```js
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
```
CORS (Cross-Origin Resource Sharing) — browser security rules.
In development, the map page is on port 5173 (Vite) but the API is on port 8080 (Node). Browsers normally block that. These headers say "it's OK, allow it".
`OPTIONS` requests are a browser's way of asking "can I talk to you?" before sending real data. We say yes (204 = "OK, no content") and move on.

---

```js
  const url = new URL(req.url, `http://${req.headers.host}`);
```
Parses the request URL into a proper object so we can inspect its parts (like `url.pathname`).
For example, `/api/ping?foo=bar` becomes an object where `url.pathname` is `/api/ping`.

---

### `POST /api/ping` — receiving a phone's location

```js
  if (url.pathname === '/api/ping' && req.method === 'POST') {
```
Only handle this block if the request is a POST to `/api/ping`. This is the route phones call to send their GPS coordinates.

---

```js
    let body = '';
    req.on('data', chunk => (body += chunk));
```
Data sent in a POST request arrives in small pieces called "chunks" (like a message arriving letter by letter).
We start with an empty string `body = ''` and glue each chunk onto it as it arrives.

---

```js
    req.on('end', () => {
      const d = JSON.parse(body);
```
`req.on('end', ...)` fires when all chunks have arrived and the message is complete.
`JSON.parse(body)` turns the text string back into a JavaScript object `d` that we can work with.

---

```js
      if (!d.deviceId || d.lat == null || d.lng == null) {
        res.writeHead(400); res.end('Missing fields'); return;
      }
```
Check that the phone sent the three things we must have: its ID, latitude, and longitude.
If any are missing, send back HTTP 400 ("Bad Request") and stop. We do not store broken data.

---

```js
      const device = {
        deviceId: d.deviceId,
        name:     d.name     || 'Unknown Device',
        lat:      parseFloat(d.lat),
        lng:      parseFloat(d.lng),
        accuracy: parseFloat(d.accuracy  || 0),
        speed:    d.speed   != null ? parseFloat(d.speed)   : null,
        battery:  d.battery != null ? parseFloat(d.battery) : null,
        lastSeen: Date.now(),
      };
```
Build a clean device record from the data the phone sent.
- `d.name || 'Unknown Device'` — use the name the phone gave, or fall back to "Unknown Device" if it was not provided.
- `parseFloat(d.lat)` — convert the latitude to a number. It may have arrived as a string.
- `d.speed != null ? parseFloat(d.speed) : null` — speed is optional. Only convert it if it was sent, otherwise leave it as `null`.
- `lastSeen: Date.now()` — stamp the record with the current time. Used later to detect phones that have gone offline.

---

```js
      devices.set(device.deviceId, device);
      broadcast({ type: 'update', device });
```
- Save the device to our notebook, overwriting any older entry for the same phone.
- Immediately tell every open dashboard tab "this phone just updated its position".

---

```js
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
```
Send a success response back to the phone.
HTTP 200 means "everything worked".
`{ ok: true }` is the response body — the phone checks this to know the ping was received.

---

### `GET /api/stream` — keeping the dashboard live

```js
  if (url.pathname === '/api/stream') {
    res.writeHead(200, {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection':    'keep-alive',
    });
```
When the dashboard opens this URL, we start a Server-Sent Events (SSE) stream.
- `text/event-stream` — tells the browser "this connection will stay open and I will keep sending you messages".
- `no-cache` — do not store this stream anywhere, always get it fresh.
- `keep-alive` — keep the TCP connection open instead of closing it after one response.

---

```js
    res.write(`data: ${JSON.stringify({ type: 'snapshot', devices: [...devices.values()] })}\n\n`);
```
As soon as the dashboard connects, immediately send it a "snapshot" — a list of every phone currently being tracked.
Without this, the dashboard would be blank until the next time any phone moves.
`[...devices.values()]` turns the Map of devices into a plain array so it can be sent as JSON.

---

```js
    dashboardClients.add(res);
    req.on('close', () => dashboardClients.delete(res));
```
- Add this browser tab's response object to our list of dashboard clients. Now `broadcast()` will include it.
- When the browser closes the tab, `req.on('close', ...)` fires and removes it from the list. Otherwise we would keep trying to write to a closed connection.

---

### Static file serving

```js
  const aliases  = { '/': 'index.html', '/track': 'track.html' };
  const fileName = aliases[url.pathname] ?? url.pathname.slice(1);
  const filePath = path.join(STATIC, fileName);
```
Map clean URLs to actual files.
- `/` → `index.html` (the dashboard)
- `/track` → `track.html` (the tracker page)
- Anything else: strip the leading `/` and treat it as a filename (e.g. `/styles.css` → `styles.css`).

---

```js
  if (!filePath.startsWith(STATIC)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }
```
Security check. A malicious request like `/../../etc/passwd` could try to escape the static folder and read system files. If the resolved path does not start with our safe folder, refuse it with HTTP 403 ("Forbidden").

---

```js
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'text/plain' });
    res.end(data);
  });
```
Read the file from disk. If it does not exist, send 404 ("Not Found").
Otherwise, look up its extension in the MIME table and send it with the right content type.

---

```js
}).listen(PORT, () => {
  console.log(`🚀 PhoneTrace server running`);
  ...
});
```
Start the server on the chosen port. The callback function runs once when the server is ready, printing a startup message to the terminal.

---

## `track.js` — the phone side

```js
function getDeviceId() {
  let id = localStorage.getItem('tracker_device_id');
  if (!id) {
    id = 'phone-' + Math.random().toString(36).slice(2, 10);
    localStorage.setItem('tracker_device_id', id);
  }
  return id;
}
```
Every phone needs a unique ID so the server knows which dot to move.
- `localStorage.getItem(...)` checks if this phone already has a saved ID.
- If not, generate one: `Math.random().toString(36)` makes a random string using letters and digits. `.slice(2, 10)` trims it to 8 characters. Prefix `'phone-'` makes it readable.
- `localStorage.setItem(...)` saves the ID so the same phone gets the same ID even after closing and reopening the page.

---

```js
const DEVICE_ID = getDeviceId();
```
Call the function once at the top and store the result. This ID never changes while the page is open.

---

```js
const state = {
  watchId:  null,
  pings:    0,
  battery:  null,
};
```
A small container for things that change over time.
- `watchId` — the ID the browser gives us when we start watching GPS. We need it to stop watching later. `null` means GPS is not running.
- `pings` — counts how many times we have successfully sent our location. Shown on screen so the user knows it is working.
- `battery` — the phone's current battery percentage, read by the Battery API and updated when it changes.

---

```js
const btnStart    = document.getElementById('btn-track-start');
const trackDot    = document.getElementById('track-dot');
...
```
These lines grab HTML elements from the page by their `id` attribute and store them in variables.
We do this once at the start so we can update the screen quickly — instead of searching the page every time GPS fires, we already have a direct reference.

---

```js
tNameInput.value = localStorage.getItem('tracker_device_name') || '';
tNameInput.addEventListener('input', () => {
  localStorage.setItem('tracker_device_name', tNameInput.value);
});
```
- On page load, fill the name field with whatever was saved previously.
- Every time the user types, save the new value. This way the name survives page reloads.

---

```js
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
```
The Battery Status API is not supported on all browsers (iPhones block it).
- `if (navigator.getBattery)` checks if the feature exists before trying to use it.
- `navigator.getBattery()` returns a Promise. `.then(b => ...)` runs when the battery info is ready.
- `b.level` is a number between 0 and 1. Multiply by 100 to get a percentage. `Math.round` makes it a whole number.
- `b.addEventListener('levelchange', ...)` fires whenever the battery percentage changes, so the display stays up to date.
- If the API is not available, show `'N/A'` instead.

---

```js
btnStart.addEventListener('click', () => {
  state.watchId === null ? startSharing() : stopSharing();
});
```
Listen for a tap on the Start button.
- If `watchId` is `null`, GPS is not running → start it.
- If `watchId` has a value, GPS is already running → stop it.
The `? :` is a shortcut for if/else.

---

```js
function startSharing() {
  if (!navigator.geolocation) {
    setStatus('error', 'Geolocation not supported on this browser.');
    return;
  }
  setStatus('waiting', 'Waiting for GPS signal…');
  btnStart.textContent = '⏹ Stop Sharing';
  btnStart.style.background = '#ef4444';
  state.watchId = navigator.geolocation.watchPosition(
    onFix, onError,
    { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
  );
}
```
- First check that the browser supports GPS at all. Some old browsers or desktop machines do not.
- Update the status message and turn the button red so the user knows tracking is active.
- `navigator.geolocation.watchPosition(onFix, onError, options)` starts the GPS.
  - `onFix` — the function to call every time a new GPS position arrives.
  - `onError` — the function to call if something goes wrong.
  - `enableHighAccuracy: true` — use the real GPS chip, not a rough estimate from Wi-Fi or cell towers.
  - `timeout: 20000` — if no position arrives within 20 seconds, call `onError`.
  - `maximumAge: 0` — never use a cached old position; always get a fresh one.
- `watchPosition` returns a watch ID. We save it in `state.watchId` so we can stop it later.

---

```js
function stopSharing() {
  if (state.watchId !== null) {
    navigator.geolocation.clearWatch(state.watchId);
    state.watchId = null;
  }
  btnStart.textContent = '▶ Start Sharing';
  btnStart.style.background = '';
  setStatus('idle', 'Stopped. Tap Start to resume.');
}
```
- `clearWatch(state.watchId)` tells the browser to stop firing GPS updates.
- Set `watchId` back to `null` so the button click logic knows GPS is off.
- Reset the button text and colour, and update the status message.

---

```js
async function onFix(position) {
  const { latitude: lat, longitude: lng, accuracy, speed } = position.coords;
```
This function runs every time the phone's GPS chip reports a new position.
`position.coords` contains the GPS data. We destructure it — pull out the fields we need into nicely named variables.
`latitude: lat` means "take `position.coords.latitude` and call it `lat`" — just a shorter name.

---

```js
  tCoords.textContent   = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  tAccuracy.textContent = `±${Math.round(accuracy)} m`;
```
Update the on-screen display immediately, before even trying to contact the server.
- `toFixed(5)` shows 5 decimal places — enough precision to show a position accurate to about 1 metre.
- `Math.round(accuracy)` rounds to a whole number of metres (e.g. `12.7` becomes `13`).

---

```js
  const name = tNameInput.value.trim() || 'Unnamed Device';
```
Read the device name the user typed. `.trim()` removes any accidental spaces at the start or end.
If the field is empty, use `'Unnamed Device'` as a fallback.

---

```js
  try {
    const res = await fetch('/api/ping', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deviceId: DEVICE_ID, name, lat, lng, accuracy, speed, battery: state.battery
      })
    });
```
`fetch` sends an HTTP request to the server.
- `await` pauses here until the server replies. `async` at the top of the function is what makes `await` work.
- `method: 'POST'` — we are sending data, not just requesting a page.
- `'Content-Type': 'application/json'` — tells the server the body is JSON text.
- `JSON.stringify({...})` — converts the GPS object into a text string so it can travel over the network.

---

```js
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
```
- `res.ok` is `true` if the server sent back HTTP 200–299 (success).
- On success: increment the ping counter and update the status dot to green.
- If the server returned an error code: show a warning.
- `catch` runs if the request failed completely (no internet, server is down). Show a different error message.

---

```js
function onError(err) {
  stopSharing();
  const msgs = {
    1: 'Location permission denied. Please allow location in browser settings.',
    2: 'GPS signal unavailable. Try moving outdoors.',
    3: 'GPS timed out. Try again in an open area.',
  };
  setStatus('error', msgs[err.code] || 'GPS error.');
}
```
Called by `watchPosition` when GPS fails.
- Stop tracking so the button resets.
- `err.code` is a number the browser provides: 1 = user denied permission, 2 = signal unavailable, 3 = timed out.
- Look up the human-readable message. `|| 'GPS error.'` is a fallback for any unexpected code.

---

```js
function setStatus(type, msg) {
  trackStatus.textContent = msg;
  trackDot.className = '';
  if (type !== 'idle') trackDot.classList.add(type);
}
```
Updates the status indicator on screen.
- Set the text message next to the dot.
- `trackDot.className = ''` clears all CSS classes from the dot first.
- Then add the new class (`'waiting'`, `'active'`, `'error'`) which the CSS uses to colour the dot (yellow, green, red).
- If type is `'idle'`, leave the dot with no class (grey/off).

---

## `app.js` — the dashboard map

```js
const COLOURS = ['#3b82f6','#22c55e','#f59e0b','#ef4444','#a855f7','#06b6d4','#f97316','#ec4899'];
let colourIndex = 0;
function nextColour() { return COLOURS[colourIndex++ % COLOURS.length]; }
```
A list of 8 colours. Each new phone gets the next colour from this list.
`colourIndex++` increases the index by 1 each call.
`% COLOURS.length` wraps back to 0 after all 8 colours are used, so the 9th phone gets blue again.

---

```js
let map = null;
let selectedId = null;
const deviceStore = new Map();
```
- `map` — the Google Maps or Leaflet map object. Starts as `null` because it has not been created yet.
- `selectedId` — the ID of whichever phone is currently showing in the detail card. `null` means none selected.
- `deviceStore` — the main notebook. Every tracked phone has one entry here, containing its GPS data, colour, and map objects.

---

```js
const deviceListEl   = document.getElementById('device-list');
const deviceCountEl  = document.getElementById('device-count');
...
```
Same as in `track.js` — grab all the HTML elements we will need to update, once at startup.

---

```js
function loadGoogleMaps() {
  return new Promise((resolve) => {
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
```
Tries to load Google Maps. Returns a Promise — a way of saying "do this, and tell me when it is done".
- If there is no real API key, resolve immediately with `'leaflet'` to use the free map instead.
- Otherwise, create a `<script>` tag that loads Google Maps from Google's servers.
- `callback=__mapsReady` tells Google to call our `window.__mapsReady` function when it finishes loading.
- `s.async = true` means the script loads in the background without freezing the page.

---

```js
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
```
The startup function. `await loadGoogleMaps()` waits until we know which map to use.
Then it sets up the correct map, wires up the buttons, and connects to the live update stream.

---

```js
function initGoogleMap() {
  map = new google.maps.Map(document.getElementById('map'), {
    center: { lat: 10.5105, lng: 7.4165 },
    zoom: 6,
    styles: darkMapStyle(),
    gestureHandling: 'greedy',
  });
  map._type = 'google';
}
```
Creates a Google Map inside the `<div id="map">` HTML element.
- `center` — where the map starts looking (Kaduna, Nigeria).
- `zoom: 6` — country-level zoom. 1 = whole world, 20 = individual buildings.
- `styles: darkMapStyle()` — applies a dark colour theme.
- `gestureHandling: 'greedy'` — lets the user scroll the map with one finger on mobile.
- `map._type = 'google'` — a custom label we add so the rest of the code knows which map type is active.

---

```js
function initLeafletFallback() {
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
    ...
  };
  document.head.appendChild(js);
}
```
Loads Leaflet (the free open-source map) dynamically when there is no Google Maps key.
- Two `<link>` / `<script>` tags are added to the page to download Leaflet's CSS and JS.
- `js.onload = () => { ... }` runs after the Leaflet JS finishes downloading — we cannot use `L.map()` until then.
- `L.map('map').setView([lat, lng], zoom)` creates the map at the starting position.
- `L.tileLayer(...)` tells Leaflet which map images (tiles) to download. The `{z}/{x}/{y}` parts are placeholders Leaflet fills in based on zoom level and position.
- `.addTo(map)` adds the tile layer to the map so the map background actually appears.

---

```js
function addOrUpdateDevice(data) {
  if (!map) { setTimeout(() => addOrUpdateDevice(data), 500); return; }
```
Called whenever any phone sends a position update.
The `if (!map)` check handles a race condition: if a phone update arrives before the map finishes loading, wait 500ms and try again.

---

```js
  const isNew = !deviceStore.has(data.deviceId);
  if (isNew) {
    ...create marker, polyline, accuracy circle...
    if (!selectedId) selectDevice(data.deviceId);
    fitAllDevices();
  } else {
    ...update existing marker position...
  }
```
Check if we have seen this phone before.
- **New phone**: create a coloured dot, accuracy ring, and trail line on the map. Auto-select it if no phone is selected yet. Zoom the map to show all devices.
- **Known phone**: just move the existing dot and update the trail.

---

```js
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
    label: { text: entry.data.name, color: '#ffffff', fontSize: '11px', fontWeight: '700' },
    animation: google.maps.Animation.DROP,
  });
```
Creates a custom circle marker on Google Maps for this device.
- `position` — where on the map to place it.
- `icon` — replaces the default red Google Maps pin with a coloured circle.
  - `SymbolPath.CIRCLE` — use a circle shape.
  - `scale: 10` — 10 pixels wide.
  - `fillColor: entry.colour` — use this device's assigned colour.
  - `strokeColor: '#ffffff'` — white border ring around the dot.
- `label` — shows the device name as text next to the dot.
- `animation: DROP` — the dot falls from the top when it first appears (a nice visual effect).

---

```js
  entry.accuracyCircle = new google.maps.Circle({
    map, center: pos, radius: entry.data.accuracy,
    fillColor: entry.colour, fillOpacity: 0.1,
    strokeColor: entry.colour, strokeOpacity: 0.4, strokeWeight: 1,
  });
```
Draws a large transparent circle showing the GPS accuracy zone.
- `radius: entry.data.accuracy` — the GPS reported its accuracy in metres, e.g. `15` means the real position is somewhere within a 15 metre circle.
- `fillOpacity: 0.1` — only 10% visible so it is a subtle hint.

---

```js
  entry.polyline = new google.maps.Polyline({
    map, path: [pos],
    strokeColor: entry.colour, strokeOpacity: 0.8, strokeWeight: 3, geodesic: true,
  });
  entry.trail.push(pos);
```
Draws the travel trail line.
- Starts with one point (current position). More points are added as the phone moves.
- `geodesic: true` — the line follows the curve of the Earth rather than a flat straight line.
- `entry.trail.push(pos)` — also saves this point to our own array so we can manage the full path.

---

```js
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
```
Same idea as the Google Maps marker but using the Leaflet API.
- `L.circleMarker` creates a dot that stays the same pixel size at any zoom level (unlike `L.circle` which scales with zoom).
- Note: Leaflet uses `[lat, lng]` arrays. Google Maps uses `{ lat, lng }` objects. Both do the same thing — this is just a difference in API design.
- `.bindTooltip(...)` attaches a name label above the dot.
  - `permanent: true` — always visible, not just on hover.
  - `offset: [0, -16]` — shift the label 16 pixels upward so it floats above the dot.
- `.on('click', ...)` — when the user clicks the dot, select that device.

---

```js
  entry.accuracyCircle = L.circle(pos, {
    radius: entry.data.accuracy,
    color: entry.colour, fillColor: entry.colour,
    fillOpacity: 0.1, weight: 1
  }).addTo(map);

  entry.polyline = L.polyline([pos], {
    color: entry.colour, weight: 3, opacity: 0.75
  }).addTo(map);

  entry.trail.push({ lat: entry.data.lat, lng: entry.data.lng });
```
- `L.circle` (not `circleMarker`) draws a real-world circle — its size on screen grows and shrinks with the zoom level, which is what we want for the accuracy radius.
- `L.polyline([pos], ...)` starts the trail line with a single point. `[pos]` inside another array `[[lat,lng]]` because Leaflet expects an array of points.
- `entry.trail.push(...)` saves the starting position.

---

```js
function moveMarker(entry, data) {
  const pos = { lat: data.lat, lng: data.lng };
  if (map._type === 'google') {
    entry.marker.setPosition(pos);
    entry.accuracyCircle.setCenter(pos);
    entry.accuracyCircle.setRadius(data.accuracy);
  } else {
    entry.marker.setLatLng([data.lat, data.lng]);
    entry.accuracyCircle.setLatLng([data.lat, data.lng]);
    entry.accuracyCircle.setRadius(data.accuracy);
  }
}
```
Moves an existing device dot and accuracy circle to a new position.
- `map._type` tells us which map library to use.
- Google Maps: `.setPosition()` and `.setCenter()`.
- Leaflet: `.setLatLng()`.
Both do the same thing — move the object — but with different method names.

---

```js
function updateTrail(entry) {
  if (map._type === 'google') {
    entry.polyline.setPath(entry.trail);
  } else {
    entry.polyline.setLatLngs(entry.trail.map(p => [p.lat, p.lng]));
  }
}
```
Redraws the travel trail through all visited points.
- `entry.trail` is an array that grows as the phone moves: `[{lat,lng}, {lat,lng}, {lat,lng}, ...]`.
- `setPath` (Google) / `setLatLngs` (Leaflet) replaces the whole line path with the new full array.
- Leaflet needs `[lat, lng]` arrays, not objects, so `.map(p => [p.lat, p.lng])` converts the format.

---

```js
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
  ...
}
```
Removes all visual objects for a phone that has gone offline.
- Google Maps: `.setMap(null)` detaches the object from the map.
- Leaflet: `map.removeLayer(...)` removes the object from the map.
Then delete the entry from our notebook and update the UI.

---

```js
function selectDevice(deviceId) {
  selectedId = deviceId;
  const entry = deviceStore.get(deviceId);
  if (!entry) return;
  updateDetailCard(entry);
  detailCard.classList.remove('hidden');
  renderDeviceList();
}
```
Called when the user clicks a dot on the map or an item in the sidebar.
- Save the selected ID.
- Fill in the detail card with that device's data and show it.
- Re-render the sidebar list so the selected device gets a highlight style.

---

```js
function updateDetailCard(entry) {
  const data = entry.data;
  detailName.textContent   = data.name;
  dCoords.textContent      = `${data.lat.toFixed(5)}, ${data.lng.toFixed(5)}`;
  dSpeed.textContent       = data.speed != null ? `${(data.speed * 3.6).toFixed(1)} km/h` : '—';
  dBattery.textContent     = data.battery != null ? `${data.battery}%` : '—';
  dLastseen.textContent    = new Date(data.lastSeen).toLocaleTimeString();
  dDistance.textContent    = formatDist(entry.totalDist);
}
```
Updates the detail card panel with the latest data for the selected device.
- `data.speed * 3.6` — convert metres per second (what GPS gives) to kilometres per hour (what humans understand).
- `data.speed != null ? ... : '—'` — if speed was not reported, show a dash instead of a number.
- `new Date(data.lastSeen).toLocaleTimeString()` — convert the Unix timestamp (big milliseconds number) into a readable time like `"14:32:05"`.

---

```js
function renderDeviceList() {
  if (deviceStore.size === 0) {
    deviceListEl.innerHTML = `...empty state HTML...`;
    return;
  }
  deviceListEl.innerHTML = [...deviceStore.values()].map(entry => {
    const isSelected = entry.data.deviceId === selectedId;
    return `<div class="device-item ${isSelected ? 'selected' : ''}" onclick="selectDevice('${entry.data.deviceId}')">
      ...
    </div>`;
  }).join('');
}
```
Rebuilds the entire sidebar list from scratch every time anything changes.
- If there are no devices, show an empty state message.
- Otherwise, loop through every device, build an HTML string for each, and join them all together.
- `isSelected` adds the `'selected'` CSS class to highlight the currently chosen device.
- `escHtml(entry.data.name)` safely encodes the device name so it cannot inject rogue HTML.

---

```js
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
```
Opens the live SSE connection to the server.
- `new EventSource('/api/stream')` — opens a persistent connection. The browser keeps it open automatically and fires `onmessage` every time the server sends data.
- Three message types:
  - `snapshot` — received on first connect. Add all currently tracked phones to the map.
  - `update` — a phone moved. Add or update its dot.
  - `device_removed` — a phone went offline. Remove its dot.
- `es.onerror` — if the connection drops (server restart, network blip), close it and try reconnecting after 3 seconds.

---

```js
btnShare.addEventListener('click', () => {
  const url = `${location.protocol}//${location.host}/track`;
  modalLink.value = url;
  modalOverlay.classList.remove('hidden');
  new QRCode(document.getElementById('qr-code'), {
    text: url, width: 160, height: 160,
    colorDark: '#1e293b', colorLight: '#f8fafc'
  });
});
```
When the Share button is clicked, show a modal with the tracker link and a QR code.
- `location.protocol` + `location.host` builds the current site's base URL (e.g. `https://phonetrace.onrender.com`).
- Append `/track` to get the full tracker link.
- `QRCode(...)` generates a QR code image from that URL — phones can scan it to open the tracker page instantly.

---

```js
btnFocus.addEventListener('click', () => {
  const entry = deviceStore.get(selectedId);
  if (!entry) return;
  const pos = { lat: entry.data.lat, lng: entry.data.lng };
  if (map._type === 'google') {
    map.setCenter(pos); map.setZoom(17);
  } else {
    map.setView([pos.lat, pos.lng], 17);
  }
});
```
The "Focus on Map" button in the detail card. Pans and zooms the map directly to the selected device at street level (zoom 17).

---

```js
function haversine(a, b) {
  const R = 6371000, dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
  const x = Math.sin(dLat/2)**2 + Math.cos(toRad(a.lat))*Math.cos(toRad(b.lat))*Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1-x));
}
```
The Haversine formula — calculates the real straight-line distance in metres between two GPS coordinates.
Needed because GPS coordinates are angles, not flat grid squares. The formula accounts for the curvature of the Earth.
Used to decide whether the phone actually moved (more than 5 metres) before adding a new point to the trail.

---

```js
function formatDist(m) {
  return m < 1000 ? `${m.toFixed(0)} m` : `${(m/1000).toFixed(2)} km`;
}
```
Turns a raw number of metres into a readable string.
- Less than 1000 metres: show as `"452 m"`.
- 1000 or more: show as `"1.50 km"`.

---

```js
function escHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
```
Safety function. If a phone's name contains characters like `<` or `>`, they could be interpreted as HTML tags and break the page (or worse, inject script). This replaces them with safe HTML entities.

---

```js
window.selectDevice = selectDevice;
```
The sidebar HTML uses `onclick="selectDevice('...')"` — a plain string in the HTML. For that to work, `selectDevice` must be accessible on the global `window` object. This line makes it globally available.

---

```js
function darkMapStyle() {
  return [
    { elementType: 'geometry', stylers: [{ color: '#0f172a' }] },
    { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#1e293b' }] },
    { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0c4a6e' }] },
    ...
  ];
}
```
A list of style rules for Google Maps.
Each rule targets a type of map feature (`road`, `water`, `park`, etc.) and overrides its colour.
Together they create the dark navy/slate theme that makes coloured device dots easy to see.

---

```js
initMap();
```
The last line of the file. Kicks everything off — loads the map, connects to the server stream, wires up all the buttons.
Everything above this line is just defining functions. This one line actually runs them.

---

## How the three files connect

```
[track.js on phone]
     │  GPS fires → onFix() runs
     │  POST /api/ping  (sends lat, lng, battery, etc.)
     ▼
[server.js]
     │  stores device in devices Map
     │  broadcast({ type: 'update', device })
     ▼
[app.js on dashboard]
     │  EventSource receives the SSE message
     │  addOrUpdateDevice(data) runs
     │  dot moves on map, trail grows, sidebar updates
```

That is the entire loop — from GPS chip on the phone to moving dot on the map.
