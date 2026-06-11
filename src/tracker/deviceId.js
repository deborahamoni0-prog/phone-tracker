// deviceId.js
// Generates and persists a unique ID for this phone in localStorage.
// Same phone always gets the same ID even after page refresh.

const KEY = 'phonetrace_device_id';

export function getDeviceId() {
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = 'phone-' + Math.random().toString(36).slice(2, 10);
    localStorage.setItem(KEY, id);
  }
  return id;
}
