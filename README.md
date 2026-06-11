# 📡 PhoneTrace — Real-Time Multi-Device GPS Tracker

Track any phone's live location from your laptop or another device.  
Built with vanilla JavaScript, Vite, and a lightweight Node.js server.

---

## What It Does

- **Dashboard** (`/`) — shows a live map with every tracked phone as a dot
- **Tracker** (`/track`) — the page you open on the phone being tracked
- The phone sends its GPS coordinates to the server every few seconds
- The dashboard receives them instantly and moves the marker on the map
- Every phone's full travel trail is drawn as a coloured line on the map

---

## Project Structure

```
phonetrace/
│
├── index.html          ← Dashboard HTML (map + sidebar + detail card)
├── track.html          ← Tracker HTML (the page opened on the tracked phone)
├── styles.css          ← All styling for both pages
│
├── server.js           ← Node.js backend (API + static file server)
├── vite.config.js      ← Vite config (dev proxy + build entries)
├── package.json
│
└── src/
    ├── dashboard/      ← Everything that runs on the dashboard page
    │   ├── main.js         → Entry point — boots map, stream, controls, modal
    │   ├── mapManager.js   → All map operations (Google Maps or Leaflet)
    │   ├── deviceManager.js→ Add/update/remove devices on the map and store
    │   ├── store.js        → Shared state (deviceStore, selectedId)
    │   ├── stream.js       → SSE connection to the server
    │   ├── ui.js           → Renders sidebar list and detail card
    │   ├── controls.js     → Focus, Street View, Close card buttons
    │   └── modal.js        → Share link modal + QR code
    │
    ├── tracker/        ← Everything that runs on the tracked phone
    │   ├── main.js         → Entry point — boots GPS, battery, sender
    │   ├── gps.js          → Wraps watchPosition with start/stop
    │   ├── battery.js      → Reads battery level via Battery Status API
    │   ├── sender.js       → POSTs location to /api/ping
    │   └── deviceId.js     → Generates/persists a unique ID per phone
    │
    └── utils/
        ├── colours.js      → Assigns a unique colour to each tracked device
        ├── geo.js          → Haversine distance formula + formatDist
        └── dom.js          → el() helper + escHtml()
```

---

## How the Data Flows

```
[Phone opens /track]
        │
        ▼ GPS fires every few seconds
[src/tracker/gps.js]
        │
        ▼ sends coordinates
[POST /api/ping  →  server.js]
        │
        ▼ updates in-memory Map, broadcasts to all dashboards
[GET  /api/stream →  server.js]  ←── SSE (live connection)
        │
        ▼ message received
[src/dashboard/stream.js]
        │
        ▼
[src/dashboard/deviceManager.js]  → moves marker on map
        │
        ▼
[src/dashboard/ui.js]             → updates sidebar + detail card
```

---

## Getting Started

### 1. Install dependencies
```bash
npm install
```

### 2. Run in development mode
```bash
npm run dev
```
This starts two things at once:
- Node.js server on `http://localhost:8080` (handles API)
- Vite dev server on `http://localhost:5173` (serves the UI with hot reload)

Open `http://localhost:5173` for the dashboard.  
Open `http://localhost:5173/track` on the phone you want to track.

### 3. Build for production
```bash
npm run build
npm start
```
Vite bundles everything into `/dist`, then the Node server serves it.  
Open `http://localhost:8080`.

---

## Deploying Online (so any phone can be tracked from anywhere)

### Render (recommended — free tier)
1. Push this repo to GitHub
2. Go to [render.com](https://render.com) → New → Web Service
3. Connect your repo
4. Build command: `npm install && npm run build`
5. Start command: `node server.js`
6. You get a URL like `https://phonetrace.onrender.com`

Set `NODE_ENV=production` in Render's environment variables.

### Netlify ❌
Netlify only hosts static files — it **cannot** run `server.js`.  
Use Render, Railway, or Fly.io instead.

---

## Google Maps vs OpenStreetMap

By default the dashboard uses **OpenStreetMap** (free, no key needed).

To use **Google Maps** (satellite view, Street View, better detail):

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a project → Enable **Maps JavaScript API**
3. Create an API key
4. Open `index.html` and replace the placeholder:

```html
<script>
  window.GOOGLE_MAPS_API_KEY = 'YOUR_ACTUAL_KEY_HERE';
</script>
```

---

## API Reference

### `POST /api/ping`
Phone sends its location to the server.

**Body:**
```json
{
  "deviceId":  "phone-abc123",
  "name":      "John's iPhone",
  "lat":       10.5105,
  "lng":       7.4165,
  "accuracy":  12.5,
  "speed":     1.4,
  "battery":   82
}
```

**Response:** `{ "ok": true }`

---

### `GET /api/stream`
Dashboard subscribes to live updates via Server-Sent Events.

**Events received:**
```
snapshot       → { type: 'snapshot', devices: [...] }   // on connect
update         → { type: 'update', device: {...} }       // phone moved
device_removed → { type: 'device_removed', deviceId }   // phone went offline
```

---

## Detailed Code Explanation — Line by Line

---

### 1. Server tracking (`server.js`) — how the server receives and stores locations

This is the central hub. It receives pings from phones and pushes live updates to dashboards.

#### Data structures

```js
const devices          = new Map();
const dashboardClients = new Set();
```

| Variable | Type | What it stores |
|---|---|---|
| `devices` | `Map` | One entry per tracked phone. Key = `deviceId`, value = the full device object |
| `dashboardClients` | `Set` | Every open dashboard browser tab as a response object. Used to push updates |

#### Cleanup interval

```js
setInterval(() => {
  const cutoff = Date.now() - 60_000;
  for (const [id, device] of devices.entries()) {
    if (device.lastSeen < cutoff) {
      devices.delete(id);
      broadcast({ type: 'device_removed', deviceId: id });
    }
  }
}, 10_000);
```

| Line | What it does |
|---|---|
| `setInterval(..., 10_000)` | Runs the cleanup function every 10 seconds automatically |
| `Date.now() - 60_000` | Calculates a timestamp 60 seconds in the past. Any device last seen before this is considered offline |
| `devices.entries()` | Loops through every device in the store as `[id, device]` pairs |
| `device.lastSeen < cutoff` | True if the device hasn't sent a ping in over 60 seconds |
| `devices.delete(id)` | Removes the device from memory |
| `broadcast({ type: 'device_removed', deviceId: id })` | Tells all open dashboards to remove the dot from the map |

#### `broadcast(data)` — sends a message to every open dashboard

```js
function broadcast(data) {
  const msg = `data: ${JSON.stringify(data)}\n\n`;
  for (const client of dashboardClients) client.write(msg);
}
```

| Line | What it does |
|---|---|
| `JSON.stringify(data)` | Converts the JavaScript object into a JSON string so it can be sent as text |
| `` `data: ${...}\n\n` `` | Wraps the string in the Server-Sent Events format. The `data:` prefix and double newline `\n\n` are required by the SSE protocol |
| `for (const client of dashboardClients)` | Loops through every connected dashboard tab |
| `client.write(msg)` | Pushes the message into that tab's open HTTP stream |

---

#### `POST /api/ping` — the function that allows the server to track a device

This is the route the phone calls every few seconds with its current GPS coordinates.

```js
if (url.pathname === '/api/ping' && req.method === 'POST') {
  let body = '';
  req.on('data', chunk => (body += chunk));
  req.on('end', () => {
    const d = JSON.parse(body);

    if (!d.deviceId || d.lat == null || d.lng == null) {
      res.writeHead(400); res.end('Missing fields'); return;
    }

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

    devices.set(device.deviceId, device);
    broadcast({ type: 'update', device });

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
  });
}
```

| Line | What it does |
|---|---|
| `url.pathname === '/api/ping' && req.method === 'POST'` | Only handles requests sent to exactly `/api/ping` using the POST method |
| `let body = ''` | Creates an empty string to collect the incoming request body |
| `req.on('data', chunk => (body += chunk))` | HTTP data arrives in small pieces called chunks. This appends each chunk to `body` until all data has arrived |
| `req.on('end', () => { ... })` | Fires once all chunks have been received — safe to parse the body now |
| `JSON.parse(body)` | Converts the raw JSON string the phone sent into a JavaScript object `d` |
| `!d.deviceId \|\| d.lat == null \|\| d.lng == null` | Validates the required fields. If any are missing, responds with HTTP 400 (Bad Request) and stops |
| `d.name \|\| 'Unknown Device'` | Uses the name the phone sent, or falls back to `'Unknown Device'` if none was provided |
| `parseFloat(d.lat)` | Converts the lat/lng values to proper numbers (they may arrive as strings) |
| `d.speed != null ? parseFloat(d.speed) : null` | Only converts speed if it was actually sent — it is optional |
| `lastSeen: Date.now()` | Records the exact time this ping arrived, in milliseconds. Used by the cleanup interval to detect offline devices |
| `devices.set(device.deviceId, device)` | Stores the device in memory, overwriting any previous entry for that same `deviceId` |
| `broadcast({ type: 'update', device })` | Pushes the updated device data to every open dashboard immediately |
| `res.writeHead(200, ...)` | Sends HTTP 200 OK back to the phone |
| `res.end(JSON.stringify({ ok: true }))` | Sends the success response body and closes the connection |

---

#### `GET /api/stream` — keeps the dashboard updated in real time

```js
if (url.pathname === '/api/stream') {
  res.writeHead(200, {
    'Content-Type':  'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection':    'keep-alive',
  });

  res.write(`data: ${JSON.stringify({ type: 'snapshot', devices: [...devices.values()] })}\n\n`);

  dashboardClients.add(res);
  req.on('close', () => dashboardClients.delete(res));
}
```

| Line | What it does |
|---|---|
| `'Content-Type': 'text/event-stream'` | Tells the browser this is an SSE stream, not a normal HTTP response. The connection stays open |
| `'Cache-Control': 'no-cache'` | Prevents the browser from caching the stream |
| `'Connection': 'keep-alive'` | Keeps the TCP connection open so the server can keep sending messages |
| `{ type: 'snapshot', devices: [...devices.values()] }` | Immediately sends every currently tracked device so the dashboard isn't blank on load. `[...devices.values()]` spreads the Map's values into an array |
| `dashboardClients.add(res)` | Saves this response object so `broadcast()` can write to it later |
| `req.on('close', () => dashboardClients.delete(res))` | When the user closes the dashboard tab, this fires and removes the stale connection from the set |

---

### 2. Phone send-location logic (`src/tracker/main.js`)

This runs in the browser on `track.html`. It reads GPS and posts it to the server.

#### Imports

```js
import { getDeviceId }       from './deviceId.js';
import { initBattery }       from './battery.js';
import { startGPS, stopGPS } from './gps.js';
import { sendPing }          from './sender.js';
```

| Import | What it provides |
|---|---|
| `getDeviceId()` | Returns a unique ID for this phone, stored in `localStorage` so it survives page reloads |
| `initBattery(callback)` | Reads battery level via the Battery Status API and calls `callback` with the percentage |
| `startGPS(onFix, onError)` | Starts `navigator.geolocation.watchPosition` and returns the watch ID |
| `stopGPS(watchId)` | Calls `navigator.geolocation.clearWatch(watchId)` to stop GPS |
| `sendPing(data)` | POSTs the location to `/api/ping` |

#### State

```js
const state = {
  deviceId: getDeviceId(),
  watchId:  null,
  pings:    0,
  battery:  null,
};
```

| Property | What it stores |
|---|---|
| `deviceId` | Unique string ID for this phone, e.g. `"phone-abc123"`. Created once and reused on every ping |
| `watchId` | The ID returned by `startGPS()`. Stored so we can call `stopGPS(watchId)` later. `null` means not currently tracking |
| `pings` | Running count of successful location sends. Shown on screen |
| `battery` | Current battery percentage. Updated by `initBattery()` and sent with every ping |

#### DOM references

```js
const btnStart    = document.getElementById('btn-track-start');
const trackDot    = document.getElementById('track-dot');
const trackStatus = document.getElementById('track-status');
const tCoords     = document.getElementById('t-coords');
const tAccuracy   = document.getElementById('t-accuracy');
const tBattery    = document.getElementById('t-battery');
const tPings      = document.getElementById('t-pings');
const nameInput   = document.getElementById('t-name-input');
```

Each line grabs one element from `track.html` by its `id`. Stored in a constant once at startup — faster than calling `getElementById` every time GPS fires.

#### Device name persistence

```js
nameInput.value = localStorage.getItem('phonetrace_device_name') || '';
nameInput.addEventListener('input', () => {
  localStorage.setItem('phonetrace_device_name', nameInput.value.trim());
});
```

| Line | What it does |
|---|---|
| `localStorage.getItem(...)` | Loads the previously saved name from the browser when the page opens |
| `nameInput.value = ...` | Pre-fills the text input so the user doesn't have to retype their name |
| `addEventListener('input', ...)` | Fires every time the user types a character into the name field |
| `localStorage.setItem(...)` | Saves the new name immediately so it persists across page reloads |
| `.trim()` | Removes any leading or trailing spaces before saving |

#### `startTracking()` — the function that allows the user to begin sending location

```js
function startTracking() {
  setStatus('waiting', 'Waiting for GPS signal…');
  btnStart.textContent = '⏹ Stop Sharing';
  btnStart.style.background = '#ef4444';
  state.watchId = startGPS(onFix, onError);
}
```

| Line | What it does |
|---|---|
| `setStatus('waiting', ...)` | Changes the status dot to yellow and shows "Waiting for GPS signal" |
| `btnStart.textContent = '⏹ Stop Sharing'` | Changes the button label so the user knows tapping again will stop tracking |
| `btnStart.style.background = '#ef4444'` | Turns the button red to signal it is now active |
| `startGPS(onFix, onError)` | Starts watching GPS. Calls `onFix` when a position arrives, `onError` if GPS fails |
| `state.watchId = ...` | Stores the watch ID returned by `startGPS` so we can stop it later |

#### `onFix(position)` — called every time the phone gets a GPS fix

This is the core function that actually sends the location to the server.

```js
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
```

| Line | What it does |
|---|---|
| `const { latitude: lat, longitude: lng, accuracy, speed } = position.coords` | Destructures the GPS data. Renames `latitude` → `lat` and `longitude` → `lng` for shorter code |
| `nameInput.value.trim() \|\| 'Unnamed Device'` | Uses the name from the input, or a fallback if the field is empty |
| `lat.toFixed(5)` | Formats the latitude to 5 decimal places for the on-screen display |
| `Math.round(accuracy)` | Rounds the accuracy to a whole number of metres for display |
| `await sendPing({...})` | Sends the location to the server and waits for the response. `await` means this line pauses until the server replies |
| `state.pings++` | Increments the counter after a successful send |
| `tPings.textContent = state.pings` | Updates the number shown on screen |
| `setStatus('active', ...)` | Changes the status dot to green and shows the accuracy |
| `catch { setStatus('error', ...) }` | If `sendPing` throws (network error or server error), shows a retry message instead of crashing |

#### `onError(err)` — handles GPS failures

```js
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
```

| Line | What it does |
|---|---|
| `stopTracking()` | Resets the button and clears `watchId` |
| `messages` | Maps each numeric error code from the Geolocation API to a human-readable message |
| `err.code` | The numeric error code provided by the browser: 1 = permission denied, 2 = unavailable, 3 = timeout |
| `messages[err.code] \|\| 'Unknown GPS error.'` | Looks up the message, or uses a generic fallback for any unexpected code |

---

### 3. Sending the ping (`src/tracker/sender.js`)

The function that posts the phone's location to the server.

```js
export async function sendPing({ deviceId, name, lat, lng, accuracy, speed, battery }) {
  const res = await fetch('/api/ping', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ deviceId, name, lat, lng, accuracy, speed, battery }),
  });

  if (!res.ok) throw new Error(`Server responded ${res.status}`);
  return res.json();
}
```

| Line | What it does |
|---|---|
| `{ deviceId, name, lat, lng, accuracy, speed, battery }` | Destructured parameters — the caller passes one object and each field is extracted automatically |
| `fetch('/api/ping', {...})` | Makes an HTTP request to the server. Returns a Promise that resolves when the server replies |
| `method: 'POST'` | Tells the server this is a POST request (sending data, not requesting a page) |
| `'Content-Type': 'application/json'` | Tells the server the body is JSON text, so it knows to parse it as JSON |
| `JSON.stringify({...})` | Converts the JavaScript object into a JSON string for the request body |
| `if (!res.ok) throw new Error(...)` | `res.ok` is `true` for 200–299 status codes. If the server returns an error, throw so `onFix()` can catch it and show a retry message |
| `return res.json()` | Parses the server's JSON response (`{ ok: true }`) and returns it |

---

### 4. `createLeafletMarker` — how a new device appears on the map

This logic is spread across `mapManager.js` and `deviceManager.js`. Here is the full picture of what happens when a new device is seen for the first time.

#### Step 1 — Assign a colour and build the entry (`deviceManager.js` → `_createDevice`)

```js
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
```

| Line | What it does |
|---|---|
| `nextColour()` | Picks the next unused colour from the palette (e.g. `'#3b82f6'`). Each device gets a unique colour |
| `{ lat: data.lat, lng: data.lng }` | Extracts just the coordinates into a plain object used throughout |
| `entry.data` | Stores the full raw device object from the server so it can be displayed in the detail card |
| `entry.trail = [latLng]` | The trail starts as an array with a single point — the current location. New points are pushed here as the phone moves |
| `entry.totalDist = 0` | Starts the total distance travelled counter at zero |
| `marker / accuracyCircle / polyline` | Set to `null` for now — will be set to real Leaflet objects in the next steps |

#### Step 2 — Create the marker dot (`mapManager.js` → `createMarker`)

```js
entry.marker = createMarker(
  latLng,
  colour,
  data.name,
  () => selectDevice(data.deviceId)
);
```

Inside `createMarker`, for Leaflet:

```js
return L.circleMarker([latLng.lat, latLng.lng], {
  radius:      10,
  color:       '#fff',
  weight:      2.5,
  fillColor:   colour,
  fillOpacity: 1,
})
.addTo(map)
.bindTooltip(name, {
  permanent:  true,
  direction:  'top',
  offset:     [0, -16],
  className:  'device-label',
})
.on('click', onClick);
```

| Line | What it does |
|---|---|
| `L.circleMarker([lat, lng], {...})` | Creates a circle that stays the same pixel size at any zoom level. Leaflet requires `[lat, lng]` as an array, not an object |
| `radius: 10` | The dot is 10 pixels wide on screen regardless of zoom |
| `color: '#fff'` | White border ring around the coloured dot |
| `weight: 2.5` | The border ring is 2.5 pixels thick |
| `fillColor: colour` | The dot's fill colour — the unique colour assigned to this device |
| `fillOpacity: 1` | Fully solid fill — no transparency |
| `.addTo(map)` | Places the marker onto the Leaflet map so it becomes visible |
| `.bindTooltip(name, {...})` | Attaches a text label showing the device name |
| `permanent: true` | The label is always visible, not just on hover |
| `direction: 'top'` | The label appears above the dot |
| `offset: [0, -16]` | Moves the label 16 pixels upward so it doesn't sit on top of the dot |
| `className: 'device-label'` | Applies the `.device-label` CSS class for custom styling |
| `.on('click', onClick)` | When the user clicks the dot, calls `() => selectDevice(data.deviceId)` to open the detail card |

#### Step 3 — Create the accuracy circle (`mapManager.js` → `createAccuracyCircle`)

```js
entry.accuracyCircle = createAccuracyCircle(latLng, data.accuracy, colour);
```

Inside `createAccuracyCircle`, for Leaflet:

```js
return L.circle([latLng.lat, latLng.lng], {
  radius,
  color:       colour,
  fillColor:   colour,
  fillOpacity: 0.1,
  weight:      1,
}).addTo(map);
```

| Line | What it does |
|---|---|
| `L.circle(...)` | Unlike `circleMarker`, `L.circle` draws a real-world circle that scales with the map zoom. This is what we want for GPS accuracy |
| `radius` | The GPS accuracy in metres. A value of `15` draws a circle with a 15m radius on the ground |
| `fillOpacity: 0.1` | The fill is 10% visible — just a subtle hint, not solid |
| `weight: 1` | A thin border around the circle |

#### Step 4 — Create the trail polyline (`mapManager.js` → `createPolyline`)

```js
entry.polyline = createPolyline(latLng, colour);
```

Inside `createPolyline`, for Leaflet:

```js
return L.polyline([[latLng.lat, latLng.lng]], {
  color:   colour,
  weight:  3,
  opacity: 0.75,
}).addTo(map);
```

| Line | What it does |
|---|---|
| `L.polyline([[lat, lng]], {...})` | Creates a line through an array of points. Starts with one point — the current position. The double array `[[...]]` is because `L.polyline` expects an array of points, and each point is itself a `[lat, lng]` array |
| `weight: 3` | The line is 3 pixels thick |
| `opacity: 0.75` | Slightly transparent so it doesn't dominate the map |

#### Step 5 — Store everything

```js
deviceStore.set(data.deviceId, entry);
```

Saves the complete `entry` object (with marker, circle, polyline, trail, colour, data) into the global `deviceStore` Map. Every future update looks the device up here by `deviceId`.

---

### 5. `polyline.setLatLngs(...)` — how the trail grows as the phone moves

Every time an existing device sends a new ping, `_updateDevice()` runs in `deviceManager.js`:

```js
const dist = haversine(prev, latLng);

if (dist > 5) {
  entry.totalDist += dist;
  entry.trail.push(latLng);
  updatePolyline(entry.polyline, entry.trail);
}
```

Inside `updatePolyline`, for Leaflet:

```js
polyline.setLatLngs(trail.map(p => [p.lat, p.lng]));
```

| Line | What it does |
|---|---|
| `haversine(prev, latLng)` | Calculates the real-world distance in metres between the previous and new GPS point using the Haversine formula |
| `if (dist > 5)` | Only extends the trail if the phone moved more than 5 metres. This prevents GPS jitter (tiny random position wobbles when standing still) from cluttering the trail |
| `entry.trail.push(latLng)` | Appends the new position to the history array. This array grows with every real movement |
| `trail.map(p => [p.lat, p.lng])` | Converts the trail from `[{ lat, lng }, ...]` objects to `[[lat, lng], ...]` arrays — the format Leaflet requires |
| `polyline.setLatLngs(...)` | Replaces the entire path of the existing line with the new full array. Leaflet redraws the line instantly through all points |

Without `setLatLngs`, the trail line would stay frozen at the first position and never grow.

---

## Key Concepts Explained Simply

| Term | What it means |
|------|--------------|
| **SSE** | A one-way live connection from server to browser. Like a radio — server broadcasts, dashboard listens |
| **watchPosition** | The browser GPS function that keeps firing every time the phone moves |
| **deviceStore** | A Map (like a dictionary) that holds every phone's current data + map objects |
| **Haversine** | A maths formula that calculates the real distance between two GPS coordinates |
| **Vite proxy** | In dev mode, Vite forwards `/api` requests from port 5173 to port 8080 so they reach Node |
| **ES Modules** | Each `src/` file uses `import`/`export` so code is split into small focused pieces |

---

## Why This Structure?

The old version had all code in one big `app.js` file (300+ lines).  
The new structure splits it by **responsibility**:

- `mapManager` only knows about the map
- `deviceManager` only knows about devices
- `stream` only knows about the server connection
- `ui` only knows about rendering HTML
- `sender` only knows about posting to the API

Each file is small, focused, and easy to change without breaking everything else.
