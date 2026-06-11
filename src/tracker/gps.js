// gps.js
// Wraps navigator.geolocation.watchPosition with clean start/stop helpers.

export function startGPS(onFix, onError) {
  if (!navigator.geolocation) {
    onError({ code: 0, message: 'Geolocation not supported by this browser.' });
    return null;
  }

  return navigator.geolocation.watchPosition(onFix, onError, {
    enableHighAccuracy: true, // use the real GPS chip, not IP
    timeout:            20000,
    maximumAge:         0,    // never use a cached position
  });
}

export function stopGPS(watchId) {
  if (watchId !== null) navigator.geolocation.clearWatch(watchId);
}
