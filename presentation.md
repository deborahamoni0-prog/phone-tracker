# PhoneTrace — Presentation Guide

Use this document as your script. Walk through each section in order. You will never need to open a source file during the presentation.

---

## 1. What is PhoneTrace?

PhoneTrace is a real-time GPS tracking web app built from scratch with:
- **Vanilla JavaScript** — no React, no framework
- **Node.js** — a lightweight custom server (no Express)
- **Leaflet / Google Maps** — for the interactive map
- **Server-Sent Events (SSE)** — for live updates without page refresh

There are exactly **two user-facing pages:**

| Page | URL | Who opens it |
|---|---|---|
| Dashboard | `/` → `index.html` | The person watching the map |
| Tracker | `/track` → `track.html` | The phone being tracked |

---

## 2. The Big Picture — how it all works in 30 seconds

```
PHONE (track.html)
  └── GPS fires every few seconds
  └── POST /api/ping  ──────────────▶  SERVER (server.js)
                                            │
                                     stores in memory
                                            │
                                     broadcast() to all dashboards
                                            │
DASHBOARD (index.html) ◀── SSE stream ─────┘
  └── dot moves on map
  └── trail grows
  └── sidebar updates
```

Three moving parts:
1. **Phone** reads GPS and POSTs it to the server
2. **Server** stores it and pushes it to all open dashboards
3. **Dashboard** receives the push and updates the map instantly

---

## 3. The files — what each one does

You only need to talk about these. Everything else supports them.

### The two entry points

| File | Page | Job |
|---|---|---|
| `src/tracker/main.js` | `track.html` | Reads GPS, sends pings, updates tracker UI |
| `src/dashboard/main.js` | `index.html` | Boots the map, connects the live stream |

### The server

| File | Job |
|---|---|
| `server.js` | Receives pings, stores devices, streams updates to dashboards |

### The dashboard modules (called by `src/dashboard/main.js`)

| File | Job |
|---|---|
| `mapManager.js` | The only file that touches the map — draws and moves all objects |
| `deviceManager.js` | Decides what to do when data arrives — create, update, or remove a device |
| `stream.js` | Keeps the SSE connection open and routes incoming messages |
| `store.js` | The shared notebook — all device data lives here |
| `ui.js` | Updates the sidebar list and detail card |
| `controls.js` | Wires up Focus, Street View, and Close buttons |
| `modal.js` | Handles the Share Link popup and QR code |

---

## 4. The three most important functions to show

### Function 1 — `POST /api/ping` in `server.js`
**"This is how the server tracks a phone"**

```js
// server.js
if (url.pathname === '/api/ping' && req.method === 'POST') {
  let body = '';
  req.on('data', chunk => (body += chunk));   // collect data as it arrives
  req.on('end', () => {
    const d = JSON.parse(body);               // parse the JSON the phone sent

    const device = {
      deviceId: d.deviceId,
      name:     d.name || 'Unknown Device',
      lat:      parseFloat(d.lat),            // latitude as a number
      lng:      parseFloat(d.lng),            // longitude as a number
      accuracy: parseFloat(d.accuracy || 0),
      speed:    d.speed   != null ? parseFloat(d.speed)   : null,
      battery:  d.battery != null ? parseFloat(d.battery) : null,
      lastSeen: Date.now(),                   // timestamp — used to detect offline phones
    };

    devices.set(device.deviceId, device);     // store/overwrite in memory
    broadcast({ type: 'update', device });    // push to every open dashboard instantly
  });
}
```

**Key points to say:**
- The phone calls this URL every few seconds with its GPS coordinates
- The server stores the latest position for every phone in a `Map()` — like a dictionary keyed by phone ID
- `broadcast()` immediately pushes the update to every open dashboard tab over a live stream
- `lastSeen: Date.now()` timestamps every ping — if a phone goes 60 seconds without pinging, the server marks it offline

---

### Function 2 — `onFix(position)` in `src/tracker/main.js`
**"This is how the phone sends its location"**

```js
// src/tracker/main.js
async function onFix(position) {
  const { latitude: lat, longitude: lng, accuracy, speed } = position.coords;

  tCoords.textContent   = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;  // update screen
  tAccuracy.textContent = `±${Math.round(accuracy)} m`;

  try {
    await sendPing({                          // POST to /api/ping
      deviceId: state.deviceId,
      name: nameInput.value.trim() || 'Unnamed Device',
      lat, lng, accuracy, speed,
      battery: state.battery
    });
    state.pings++;
    setStatus('active', `Sharing live · ±${Math.round(accuracy)} m`);
  } catch {
    setStatus('error', 'Cannot reach server. Retrying…');
  }
}
```

**Key points to say:**
- `position.coords` comes from the browser's built-in `navigator.geolocation.watchPosition` — the real GPS chip
- The function runs automatically every time the phone's GPS fires
- It updates the on-screen display immediately, then sends the data to the server
- `await sendPing(...)` pauses here until the server confirms receipt
- If the server is unreachable, it shows a retry message — it does not crash

---

### Function 3 — `_updateDevice(data)` in `src/dashboard/deviceManager.js`
**"This is how the trail grows on the map"**

```js
// src/dashboard/deviceManager.js
function _updateDevice(data) {
  const entry  = deviceStore.get(data.deviceId);
  const prev   = { lat: entry.data.lat, lng: entry.data.lng };  // old position
  const latLng = { lat: data.lat,       lng: data.lng };        // new position

  entry.data = data;                          // update stored data
  moveMarker(entry.marker, latLng, data.name);        // move the dot
  moveCircle(entry.accuracyCircle, latLng, data.accuracy); // move the ring

  const dist = haversine(prev, latLng);       // real-world distance in metres

  if (dist > 5) {                             // only extend trail if phone actually moved
    entry.totalDist += dist;
    entry.trail.push(latLng);                 // append new point to history
    updatePolyline(entry.polyline, entry.trail); // redraw line through all points
  }
}
```

**Key points to say:**
- Every time a phone sends a new ping, this runs
- `haversine()` uses a maths formula to calculate the real distance between two GPS coordinates — it accounts for the curve of the Earth
- The **5 metre filter** is critical — GPS wobbles slightly even when standing still. Without it, trails would fill with random squiggles
- `entry.trail` is an array that keeps growing — every real movement adds a point
- `updatePolyline(entry.polyline, entry.trail)` redraws the entire line through all those points in one call — that is what makes the trail grow visually

---

## 5. How the map works

### Two map options — same code controls both

The app supports **Google Maps** and **OpenStreetMap (Leaflet)**. The choice happens at startup in `mapManager.js`:

```js
// src/dashboard/mapManager.js
const key    = window.GOOGLE_MAPS_API_KEY;
const hasKey = key && key !== 'YOUR_GOOGLE_MAPS_API_KEY';

if (hasKey) {
  // load Google Maps from Google's servers
} else {
  // load Leaflet (free, no key needed)
  map = L.map('map').setView([10.5105, 7.4165], 6);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', ...).addTo(map);
}
```

**Key points to say:**
- `window.GOOGLE_MAPS_API_KEY` is set in `index.html` — one line to change to switch map providers
- Leaflet downloads map tiles (small image squares) from CartoCDN — completely free
- `mapManager.js` is the only file allowed to touch the map. Every other file asks it to draw, move, or remove things. This means swapping map providers only requires changing one file

### The three map objects per device

When a phone appears, three things are drawn:

| Object | Created by | What it looks like |
|---|---|---|
| `marker` | `createMarker()` | Coloured dot with the device name above it |
| `accuracyCircle` | `createAccuracyCircle()` | Translucent ring — bigger = less accurate GPS |
| `polyline` | `createPolyline()` | Coloured line connecting all past positions |

All three are stored in `deviceStore` alongside the GPS data, so they can be moved or removed later.

---

## 6. How live updates work — SSE explained

**"Why doesn't the page need to be refreshed?"**

```js
// src/dashboard/stream.js
const es = new EventSource('/api/stream');   // open a permanent connection

es.onmessage = (event) => {
  const msg = JSON.parse(event.data);

  if (msg.type === 'snapshot')       msg.devices.forEach(addOrUpdateDevice);
  if (msg.type === 'update')         addOrUpdateDevice(msg.device);
  if (msg.type === 'device_removed') removeDevice(msg.deviceId);
};

es.onerror = () => { es.close(); setTimeout(connectStream, 3000); }; // auto-reconnect
```

**Key points to say:**
- `EventSource` is a browser built-in — like keeping a phone call open forever
- Normal HTTP: you ask → server answers → connection closes
- SSE: connection stays open and the **server pushes** data whenever it wants
- Three message types handle everything: load all current devices on connect, update when a phone moves, remove when a phone goes offline
- If the connection drops, `onerror` automatically reconnects after 3 seconds

---

## 7. Where the APIs come from and how they are added

### Browser GPS API — built into every phone browser, free, no key needed

```js
// src/tracker/main.js
state.watchId = navigator.geolocation.watchPosition(onFix, onError, {
  enableHighAccuracy: true,   // use the real GPS chip
  timeout:            20000,  // give up after 20 seconds
  maximumAge:         0,      // never use a cached position
});
```

- `navigator.geolocation` is part of every modern browser
- No sign-up, no key, no cost
- `watchPosition` keeps firing `onFix` every time the phone moves — you don't poll it, it calls you

---

### Leaflet (OpenStreetMap) — free, no key, loaded dynamically

```js
// src/dashboard/mapManager.js
const js  = document.createElement('script');
js.src    = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
js.onload = resolve;
document.head.appendChild(js);
```

- Leaflet JS and CSS are loaded from `unpkg.com` CDN at runtime — not bundled into the project
- Map tiles (the actual images) come from CartoCDN — free, no account needed
- This is the default — works out of the box

---

### Google Maps — requires an API key

**How to get a key:**
1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a project → Enable **Maps JavaScript API**
3. Create an API key under Credentials
4. Google gives $200/month free credit (~28,000 map loads — more than enough for personal use)

**How it is added — one line in `index.html`:**

```html
<!-- index.html -->
<script>
  window.GOOGLE_MAPS_API_KEY = 'AIzaSy...yourkey...';
</script>
```

`mapManager.js` reads `window.GOOGLE_MAPS_API_KEY` at startup. If it finds a real key, it loads Google Maps. If not, it falls back to Leaflet automatically.

---

### QR Code library — loaded from CDN, no key needed

```html
<!-- index.html -->
<script src="https://unpkg.com/qrcodejs@1.0.0/qrcode.min.js"></script>
```

```js
// src/dashboard/modal.js
new QRCode(qrContainer, { text: url, width: 160, height: 160 });
```

One script tag in `index.html` loads the library. One line of JS generates the QR code. No setup required.

---

### Battery Status API — browser built-in, no key needed

```js
// src/tracker/main.js
const battery = await navigator.getBattery();
onUpdate(Math.round(battery.level * 100));   // e.g. 82
```

Another built-in browser API. `battery.level` is a number from 0 to 1 — multiply by 100 for a percentage. Not supported on all browsers (iPhones block it), so the code checks `if (navigator.getBattery)` before using it.

---

## 8. How the files link to each other

```
index.html
  └── loads: src/dashboard/main.js
        ├── mapManager.js    (draws the map)
        ├── stream.js        (opens SSE connection)
        │     └── deviceManager.js  (reacts to each message)
        │           ├── store.js         (reads/writes device data)
        │           ├── mapManager.js    (moves dots and trails)
        │           └── ui.js            (updates sidebar + detail card)
        ├── controls.js      (buttons in detail card)
        │     └── mapManager.js    (Focus button pans the map)
        └── modal.js         (Share popup + QR code)

track.html
  └── loads: src/tracker/main.js  (self-contained — GPS + battery + send, all in one file)

Both pages talk to:
  server.js  (POST /api/ping  ←  tracker sends location)
             (GET  /api/stream → dashboard receives updates)
```

---

## 9. The data that flows through the system

Every phone ping carries this object:

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

The server adds one field and stores it:

```json
{
  ...same fields...,
  "lastSeen":  1718000000000
}
```

The dashboard stores it alongside map objects in `deviceStore`:

```js
{
  data:           { deviceId, name, lat, lng, accuracy, speed, battery, lastSeen },
  colour:         '#3b82f6',
  trail:          [{ lat, lng }, { lat, lng }, ...],   // grows as phone moves
  totalDist:      1450,                                // metres travelled
  marker:         <Leaflet circle marker object>,
  accuracyCircle: <Leaflet circle object>,
  polyline:       <Leaflet polyline object>,
}
```

---

## 10. The offline detection system

```js
// server.js — runs every 10 seconds
setInterval(() => {
  const cutoff = Date.now() - 60_000;   // 60 seconds ago
  for (const [id, device] of devices.entries()) {
    if (device.lastSeen < cutoff) {
      devices.delete(id);
      broadcast({ type: 'device_removed', deviceId: id });
    }
  }
}, 10_000);
```

**Key points to say:**
- Every ping updates `lastSeen` to the current time
- Every 10 seconds the server checks all devices
- Any device that hasn't pinged in 60 seconds is deleted and all dashboards are told to remove it
- No manual cleanup needed — it is fully automatic

---

## 11. Suggested presentation order

1. **Open the dashboard** — show the empty map
2. **Open `/track` on a phone** — tap Start, show the dot appear
3. **Move the phone** — show the trail growing
4. **Click the dot** — show the detail card (coordinates, battery, speed, distance)
5. **Click Share** — show the QR code modal
6. **Go back to slides** — walk through the architecture diagram (section 2)
7. **Show the three key functions** (sections 4) — open the files only for these
8. **Explain SSE** (section 6) — "why no page refresh"
9. **Explain the API sources** (section 7) — browser GPS, Leaflet, Google Maps key
10. **Questions**

---

## 12. Questions you are likely to get

**"Why not use a framework like React?"**
Vanilla JS is enough for this — no components, no state management library, no build complexity beyond Vite. The module system (`import`/`export`) gives the same organisation benefit.

**"What happens if the server restarts?"**
The SSE client in `stream.js` detects the disconnect and reconnects automatically after 3 seconds. Phones also keep pinging — when they reconnect, the server rebuilds its device store from incoming pings.

**"How accurate is the GPS?"**
Accuracy depends on the phone's GPS chip and environment. Outdoors = 3–10 metres. Indoors = 20–100 metres. The accuracy circle on the map shows this radius visually.

**"How many phones can be tracked at once?"**
The server is in-memory (no database) — practically limited by server RAM. At 100 bytes per device × 1000 devices = ~100KB. Thousands of phones could be tracked on a basic server.

**"Why does the trail not appear when standing still?"**
The 5-metre filter in `_updateDevice()`. GPS wobbles slightly even at rest. Without the filter, a stationary phone would produce a messy cloud of points. Any movement under 5m is ignored.

**"Does it work on iPhone?"**
Yes, with one limitation — iOS blocks the Battery Status API, so battery percentage shows as `—`. GPS, tracking, and all other features work normally.
