// stream.js
// Opens a persistent SSE connection to the server and dispatches events
// to deviceManager. Auto-reconnects on drop.

import { addOrUpdateDevice, removeDevice } from './deviceManager.js';

export function connectStream() {
  const es = new EventSource('/api/stream');

  es.onmessage = (event) => {
    const msg = JSON.parse(event.data);

    if (msg.type === 'snapshot') {
      // Server sends the current device list when we first connect
      msg.devices.forEach(addOrUpdateDevice);

    } else if (msg.type === 'update') {
      // A phone moved or connected
      addOrUpdateDevice(msg.device);

    } else if (msg.type === 'device_removed') {
      // A phone went offline
      removeDevice(msg.deviceId);
    }
  };

  es.onerror = () => {
    es.close();
    // Retry connection after 3 seconds
    setTimeout(connectStream, 3000);
  };
}
