const http = require('http');
const fs   = require('fs');
const path = require('path');

const PORT = process.env.PORT || 8080;

// In-memory store of all active devices
// key: deviceId, value: { deviceId, name, lat, lng, accuracy, speed, battery, lastSeen }
const devices = new Map();

// All dashboard SSE clients waiting for updates
const dashboardClients = new Set();

// Remove a device if it hasn't sent a ping in 60 seconds
setInterval(() => {
  const cutoff = Date.now() - 60000;
  for (const [id, device] of devices.entries()) {
    if (device.lastSeen < cutoff) {
      devices.delete(id);
      broadcast({ type: 'device_removed', deviceId: id });
      console.log(`[removed] ${device.name} went offline`);
    }
  }
}, 10000);

// Send a JSON event to every connected dashboard
function broadcast(data) {
  const msg = `data: ${JSON.stringify(data)}\n\n`;
  for (const client of dashboardClients) {
    client.write(msg);
  }
}

const MIME = {
  '.html': 'text/html',
  '.css':  'text/css',
  '.js':   'text/javascript',
};

http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  // ── POST /api/ping  — tracked phone sends its location ──────────────────
  if (url.pathname === '/api/ping' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const d = JSON.parse(body);
        if (!d.deviceId || d.lat == null || d.lng == null) {
          res.writeHead(400); res.end('Missing fields'); return;
        }

        const device = {
          deviceId: d.deviceId,
          name:     d.name || 'Unknown Device',
          lat:      parseFloat(d.lat),
          lng:      parseFloat(d.lng),
          accuracy: parseFloat(d.accuracy || 0),
          speed:    d.speed != null ? parseFloat(d.speed) : null,
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

  // ── GET /api/stream  — dashboard subscribes to live updates ─────────────
  if (url.pathname === '/api/stream') {
    res.writeHead(200, {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection':    'keep-alive',
    });

    // Send current device list immediately on connect
    const snapshot = { type: 'snapshot', devices: [...devices.values()] };
    res.write(`data: ${JSON.stringify(snapshot)}\n\n`);

    dashboardClients.add(res);
    req.on('close', () => dashboardClients.delete(res));
    return;
  }

  // ── Static files ─────────────────────────────────────────────────────────
  // /        → index.html  (dashboard)
  // /track   → track.html  (phone transmitter)
  const aliases = { '/': 'index.html', '/track': 'track.html' };
  const fileName = aliases[url.pathname] || url.pathname.slice(1);
  const filePath = path.join(__dirname, fileName);

  if (!filePath.startsWith(__dirname)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'text/plain' });
    res.end(data);
  });

}).listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
