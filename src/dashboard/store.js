// Central state for the dashboard
// Holds every tracked device and which one is currently selected

export const deviceStore = new Map();
// Map<deviceId, { data, colour, marker, accuracyCircle, polyline, trail[], totalDist }>

export let selectedId = null;

export function setSelectedId(id) {
  selectedId = id;
}
