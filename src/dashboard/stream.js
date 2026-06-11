// ─────────────────────────────────────────────────────────────────────────────
//  stream.js
//
//  PURPOSE:
//  Opens a permanent live connection to the server using SSE
//  (Server-Sent Events). This is what makes the dashboard update in real time
//  without you having to refresh the page.
//
//  HOW SSE WORKS:
//  Imagine leaving a phone call open forever.
//  - Your browser calls the server and says "keep this line open"
//  - The server keeps the connection alive
//  - Whenever a phone moves, the server PUSHES a message down that open line
//  - The browser receives it instantly and updates the map
//
//  This is different from normal HTTP requests where YOU ask, SERVER answers,
//  then the connection closes. With SSE, the connection stays open permanently.
// ─────────────────────────────────────────────────────────────────────────────

import { addOrUpdateDevice, removeDevice } from './deviceManager.js';

// ── connectStream() ───────────────────────────────────────────────────────────
//
//  Opens the SSE connection and handles all incoming messages.
//  Automatically reconnects if the connection drops.
//
export function connectStream() {

  // EventSource is the browser's built-in SSE client.
  // Passing '/api/stream' tells it to connect to that URL on our server.
  // The browser keeps this connection open indefinitely.
  const es = new EventSource('/api/stream');

  // ── es.onmessage ────────────────────────────────────────────────────────
  //
  //  This function fires EVERY TIME the server sends a message.
  //  'event.data' is the raw text the server sent (a JSON string).
  //
  //  There are 3 types of messages:
  //  1. 'snapshot' — sent once when we first connect. Contains all currently
  //                  active devices so the dashboard isn't empty on load.
  //  2. 'update'   — sent whenever a phone pings with a new GPS location.
  //                  Contains the updated device data.
  //  3. 'device_removed' — sent when a phone has been inactive for 60 seconds.
  //
  es.onmessage = (event) => {
    // JSON.parse() converts the text string into a JavaScript object
    // e.g. '{"type":"update","device":{...}}' → { type: 'update', device: {...} }
    const msg = JSON.parse(event.data);

    if (msg.type === 'snapshot') {
      // msg.devices is an array of all devices currently online
      // We call addOrUpdateDevice for each one to put them all on the map
      msg.devices.forEach(addOrUpdateDevice);

    } else if (msg.type === 'update') {
      // A phone sent a new GPS ping — update its position on the map
      // msg.device contains: { deviceId, name, lat, lng, accuracy, speed, battery, lastSeen }
      addOrUpdateDevice(msg.device);

    } else if (msg.type === 'device_removed') {
      // A phone went offline — remove its dot and trail from the map
      // msg.deviceId is the ID of the device to remove
      removeDevice(msg.deviceId);
    }
  };

  // ── es.onerror ──────────────────────────────────────────────────────────
  //
  //  If the connection drops (server restarts, internet blip, etc.),
  //  this fires. We close the broken connection and try again after 3 seconds.
  //  This creates an automatic reconnect loop.
  //
  es.onerror = () => {
    es.close(); // close the broken connection cleanly
    setTimeout(connectStream, 3000); // try to reconnect after 3 seconds
  };
}
