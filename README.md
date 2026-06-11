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
