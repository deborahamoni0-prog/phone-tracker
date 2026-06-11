// mapManager.js
// Handles everything related to the map — Google Maps or Leaflet fallback.
// All other modules call functions here instead of touching the map directly.

let map     = null;
let mapType = null; // 'google' | 'leaflet'

// ── Init ──────────────────────────────────────────────────────────────────────

export async function initMap() {
  const key = window.GOOGLE_MAPS_API_KEY;
  const hasKey = key && key !== 'YOUR_GOOGLE_MAPS_API_KEY';

  if (hasKey) {
    await loadGoogleMaps(key);
    map = new google.maps.Map(document.getElementById('map'), {
      center: { lat: 10.5105, lng: 7.4165 },
      zoom: 6,
      styles: darkStyle(),
      gestureHandling: 'greedy',
    });
    mapType = 'google';
  } else {
    await loadLeaflet();
    map = L.map('map').setView([10.5105, 7.4165], 6);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '© OpenStreetMap © CARTO', maxZoom: 19
    }).addTo(map);
    mapType = 'leaflet';
    showFallbackNotice();
  }

  return map;
}

export function getMapType() { return mapType; }

// ── Marker / circle / polyline creation ──────────────────────────────────────

export function createMarker(latLng, colour, name, onClick) {
  if (mapType === 'google') {
    const marker = new google.maps.Marker({
      position: latLng,
      map,
      title: name,
      icon: googleIcon(colour),
      label: googleLabel(name),
      animation: google.maps.Animation.DROP,
    });
    marker.addListener('click', onClick);
    return marker;
  }

  return L.circleMarker([latLng.lat, latLng.lng], {
    radius: 10, color: '#fff', weight: 2.5,
    fillColor: colour, fillOpacity: 1,
  }).addTo(map)
    .bindTooltip(name, { permanent: true, direction: 'top', offset: [0, -16], className: 'device-label' })
    .on('click', onClick);
}

export function createAccuracyCircle(latLng, radius, colour) {
  if (mapType === 'google') {
    return new google.maps.Circle({
      map, center: latLng, radius,
      fillColor: colour, fillOpacity: 0.1,
      strokeColor: colour, strokeOpacity: 0.4, strokeWeight: 1,
    });
  }
  return L.circle([latLng.lat, latLng.lng], {
    radius, color: colour, fillColor: colour, fillOpacity: 0.1, weight: 1,
  }).addTo(map);
}

export function createPolyline(latLng, colour) {
  if (mapType === 'google') {
    return new google.maps.Polyline({
      map, path: [latLng],
      strokeColor: colour, strokeOpacity: 0.8, strokeWeight: 3, geodesic: true,
    });
  }
  return L.polyline([[latLng.lat, latLng.lng]], {
    color: colour, weight: 3, opacity: 0.75,
  }).addTo(map);
}

// ── Update positions ──────────────────────────────────────────────────────────

export function moveMarker(marker, latLng, name) {
  if (mapType === 'google') {
    marker.setPosition(latLng);
    marker.setLabel(googleLabel(name));
  } else {
    marker.setLatLng([latLng.lat, latLng.lng]);
    marker.setTooltipContent(name);
  }
}

export function moveCircle(circle, latLng, radius) {
  if (mapType === 'google') {
    circle.setCenter(latLng);
    circle.setRadius(radius);
  } else {
    circle.setLatLng([latLng.lat, latLng.lng]);
    circle.setRadius(radius);
  }
}

export function updatePolyline(polyline, trail) {
  if (mapType === 'google') {
    polyline.setPath(trail);
  } else {
    polyline.setLatLngs(trail.map(p => [p.lat, p.lng]));
  }
}

// ── Remove from map ───────────────────────────────────────────────────────────

export function removeFromMap(marker, circle, polyline) {
  if (mapType === 'google') {
    marker.setMap(null);
    circle.setMap(null);
    polyline.setMap(null);
  } else {
    map.removeLayer(marker);
    map.removeLayer(circle);
    map.removeLayer(polyline);
  }
}

// ── Camera ────────────────────────────────────────────────────────────────────

export function panTo(latLng, zoom = 17) {
  if (mapType === 'google') {
    map.setCenter(latLng);
    map.setZoom(zoom);
  } else {
    map.setView([latLng.lat, latLng.lng], zoom);
  }
}

export function fitAll(points) {
  if (points.length === 0) return;
  if (mapType === 'google') {
    const bounds = new google.maps.LatLngBounds();
    points.forEach(p => bounds.extend(p));
    map.fitBounds(bounds);
  } else {
    map.fitBounds(L.latLngBounds(points.map(p => [p.lat, p.lng])), { padding: [60, 60] });
  }
}

// ── Loaders ───────────────────────────────────────────────────────────────────

function loadGoogleMaps(key) {
  return new Promise(resolve => {
    window.__mapsReady = resolve;
    const s = document.createElement('script');
    s.src = `https://maps.googleapis.com/maps/api/js?key=${key}&callback=__mapsReady`;
    s.async = true;
    document.head.appendChild(s);
  });
}

function loadLeaflet() {
  return new Promise(resolve => {
    const css = document.createElement('link');
    css.rel  = 'stylesheet';
    css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(css);

    const js = document.createElement('script');
    js.src    = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    js.onload = resolve;
    document.head.appendChild(js);
  });
}

function showFallbackNotice() {
  const div = document.createElement('div');
  div.id = 'map-notice';
  div.innerHTML = '🗺️ Using OpenStreetMap — <a href="https://console.cloud.google.com" target="_blank">add a Google Maps API key</a> for full Google Maps';
  document.body.appendChild(div);
}

// ── Google Maps style helpers ─────────────────────────────────────────────────

function googleIcon(colour) {
  return {
    path: google.maps.SymbolPath.CIRCLE,
    scale: 10,
    fillColor: colour, fillOpacity: 1,
    strokeColor: '#fff', strokeWeight: 2,
  };
}

function googleLabel(name) {
  return { text: name, color: '#fff', fontSize: '11px', fontWeight: '700' };
}

function darkStyle() {
  return [
    { elementType: 'geometry',             stylers: [{ color: '#0f172a' }] },
    { elementType: 'labels.text.fill',     stylers: [{ color: '#94a3b8' }] },
    { elementType: 'labels.text.stroke',   stylers: [{ color: '#0f172a' }] },
    { featureType: 'road', elementType: 'geometry',        stylers: [{ color: '#1e293b' }] },
    { featureType: 'road.highway', elementType: 'geometry',stylers: [{ color: '#334155' }] },
    { featureType: 'water', elementType: 'geometry',       stylers: [{ color: '#0c4a6e' }] },
    { featureType: 'poi',  elementType: 'geometry',        stylers: [{ color: '#1e293b' }] },
    { featureType: 'poi.park', elementType: 'geometry',    stylers: [{ color: '#14532d' }] },
  ];
}
