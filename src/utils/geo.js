// Haversine formula — straight-line distance in metres between two {lat,lng} points
export function haversine(a, b) {
  const R    = 6371000; // Earth radius in metres
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const x    =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

// Convert degrees → radians
export function toRad(deg) {
  return deg * (Math.PI / 180);
}

// Format a distance number into a readable string
export function formatDist(metres) {
  return metres < 1000
    ? `${metres.toFixed(0)} m`
    : `${(metres / 1000).toFixed(2)} km`;
}
