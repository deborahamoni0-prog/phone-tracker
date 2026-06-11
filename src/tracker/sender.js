// sender.js
// Posts the phone's current location to the server via /api/ping.

export async function sendPing({ deviceId, name, lat, lng, accuracy, speed, battery }) {
  const res = await fetch('/api/ping', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deviceId, name, lat, lng, accuracy, speed, battery }),
  });

  if (!res.ok) throw new Error(`Server responded ${res.status}`);
  return res.json();
}
