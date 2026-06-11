// server.js
// Node.js HTTP server — handles the API and serves static files.
// In dev:  Vite runs on :5173, this runs on :8080. Vite proxies /api → here.
// In prod: run `npm run build` first, then `npm start`. Server serves /dist.

import http from 'http';
import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT      = process.env.PORT || 8080;

// In production Vite outputs to /dist, in dev we serve root files directly
const isDev     = process.env.NODE_ENV !== 'production';
const STATIC    = isDev ? __dirname : path.join(__dirname, 'dist');

// ── In-memory device store ────────────────────────────────────────────────────
// key: deviceId → value: { deviceId, name, lat, lng, accuracy, speed, battery, lastSeen }
const devices         = new Map();
const dashboardClients = new Set();

// Remove devices that haven't pinged in 60 seconds (checked every 10 s)
setInterval(() => {
  const cutoff = Date.now() - 60_000;
  for (const [id, device] of devices.entries()) {
    if (device.lastSeen < cutoff) {
      devices.delete(id);
      broadcast({ type: 'device_removed', deviceId: id });
      console.log(`[offline] ${device.name}`);
    }
  }
}, 10_000);

// Send a message to every connected dashboard browser tab
function broadcast(data) {
  const msg = `data: ${JSON.stringify(data)}\n\n`;
  for (const client of dashboardClients) client.write(msg);
}

// ── MIME types for static file serving ───────────────────────────────────────
const MIME = {
  '.html': 'text/html',
  '.css':  'text/css',
  '.js':   'text/javascript',
  '.json': 'application/json',
  '.png':  'image/png',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
};

// ── Request handler ───────────────────────────────────────────────────────────
http.createServer((req, res) => {

  // Allow requests from Vite dev server (CORS)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  const url = new URL(req.url, `http://${req.headers.host}`);

  // ── POST /api/ping — phone sends its GPS location ──────────────────────────
  if (url.pathname === '/api/ping' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => (body += chunk));
    req.on('end', () => {
      try {
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
      } catch {
        res.writeHead(400); res.end('Bad JSON');
      }
    });
    return;
  }

  // ── GET /api/stream — dashboard opens a live SSE connection ───────────────
  if (url.pathname === '/api/stream') {
    res.writeHead(200, {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection':    'keep-alive',
    });

    // Immediately send the current device list so the dashboard loads fast
    res.write(`data: ${JSON.stringify({ type: 'snapshot', devices: [...devices.values()] })}\n\n`);

    dashboardClients.add(res);

    // Keepalive: send a comment every 25 s to prevent Render/proxies closing idle SSE
    const keepalive = setInterval(() => res.write(': keepalive\n\n'), 25_000);
    req.on('close', () => { clearInterval(keepalive); dashboardClients.delete(res); });
    return;
  }

  // ── Static files ───────────────────────────────────────────────────────────
  const aliases  = { '/': 'index.html', '/track': 'track.html' };
  const fileName = aliases[url.pathname] ?? url.pathname.slice(1);
  const filePath = path.join(STATIC, fileName);

  // Security: prevent directory traversal
  if (!filePath.startsWith(STATIC)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'text/plain' });
    res.end(data);
  });

}).listen(PORT, () => {
  console.log(`\n🚀 PhoneTrace server running`);
  console.log(`   API      → http://localhost:${PORT}`);
  if (isDev) {
    console.log(`   Dev UI   → http://localhost:5173  (run: npm run dev)`);
  } else {
    console.log(`   Dashboard → http://localhost:${PORT}`);
    console.log(`   Tracker   → http://localhost:${PORT}/track`);
  }
});
