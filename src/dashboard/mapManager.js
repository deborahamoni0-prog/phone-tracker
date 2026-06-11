// ─────────────────────────────────────────────────────────────────────────────
//  mapManager.js
//
//  PURPOSE:
//  This file is the ONLY place that talks to the map (Google Maps or Leaflet).
//  No other file is allowed to call L.marker() or google.maps.Marker() directly.
//  Every other file asks THIS file to do map work via the exported functions.
//
//  WHY THIS MATTERS:
//  If you ever want to swap Google Maps for a different map library, you only
//  change THIS file. Nothing else needs to change.
// ─────────────────────────────────────────────────────────────────────────────

// 'map' holds the actual map object once it is created.
// It starts as null because the map hasn't been built yet.
let map     = null;

// 'mapType' tells us which library is in use: 'google' or 'leaflet'
// We need to know this because Google Maps and Leaflet have different APIs.
let mapType = null;


// ── initMap() ─────────────────────────────────────────────────────────────────
//
//  This is the FIRST function called when the dashboard page loads.
//  It decides whether to use Google Maps (if the user added a key) or
//  fall back to free OpenStreetMap via Leaflet.
//
//  It returns a Promise, so callers can do: await initMap()
//  That means "wait until the map is fully ready before doing anything else."
//
export async function initMap() {
  // window.GOOGLE_MAPS_API_KEY is set in index.html
  // If the user left it as the placeholder text, we treat it as "no key"
  const key    = window.GOOGLE_MAPS_API_KEY;
  const hasKey = key && key !== 'YOUR_GOOGLE_MAPS_API_KEY';

  if (hasKey) {
    // Load the Google Maps JavaScript library from Google's servers
    await loadGoogleMaps(key);

    // new google.maps.Map() creates the interactive map inside the <div id="map">
    // center: where the map starts (Kaduna, Nigeria by default)
    // zoom:   how zoomed in we start. 6 = country level, 17 = street level
    // styles: our custom dark colour theme (defined at the bottom of this file)
    map = new google.maps.Map(document.getElementById('map'), {
      center: { lat: 10.5105, lng: 7.4165 },
      zoom: 6,
      styles: darkStyle(),
      gestureHandling: 'greedy', // lets the user scroll the map with one finger on mobile
    });

    mapType = 'google';

  } else {
    // No Google Maps key — load Leaflet instead (completely free, no key needed)
    await loadLeaflet();

    // L.map('map') creates a Leaflet map inside the <div id="map">
    // .setView([lat, lng], zoom) sets starting position and zoom level
    map = L.map('map').setView([10.5105, 7.4165], 6);

    // L.tileLayer() tells Leaflet which map images (tiles) to download and display
    // The {z}/{x}/{y} in the URL are placeholders Leaflet fills in automatically
    // based on what part of the map is visible and at what zoom level
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '© OpenStreetMap © CARTO',
      maxZoom: 19  // how far the user is allowed to zoom in
    }).addTo(map); // .addTo(map) puts this tile layer onto the map

    mapType = 'leaflet';

    // Show a small message at the bottom telling the user they're on OpenStreetMap
    showFallbackNotice();
  }

  // Return the map object so the caller can use it if needed
  return map;
}

// Simple getter — other files can ask "which map type is active?"
export function getMapType() { return mapType; }


// ── createMarker() ────────────────────────────────────────────────────────────
//
//  Creates a coloured dot on the map representing a tracked phone.
//
//  Parameters:
//  - latLng  : { lat, lng } — where to place the dot
//  - colour  : hex colour string like '#3b82f6'
//  - name    : the device name shown as a label above the dot
//  - onClick : function to call when the user clicks the dot
//
export function createMarker(latLng, colour, name, onClick) {
  if (mapType === 'google') {
    // new google.maps.Marker() places a pin on a Google Map
    const marker = new google.maps.Marker({
      position: latLng,       // { lat, lng } where the marker goes
      map,                    // which map to add it to
      title: name,            // tooltip shown on hover
      icon: googleIcon(colour), // our custom coloured circle icon
      label: googleLabel(name), // text label shown next to the icon
      animation: google.maps.Animation.DROP, // plays a drop animation when it appears
    });

    // .addListener() is Google Maps' way of attaching a click event
    marker.addListener('click', onClick);
    return marker;
  }

  // ── LEAFLET VERSION ──────────────────────────────────────────────────────
  //
  //  L.circleMarker() draws a circle that stays the same SIZE on screen
  //  regardless of zoom level (unlike L.circle() which grows/shrinks with zoom)
  //
  //  pos = [lat, lng] — Leaflet uses an array, Google Maps uses an object
  //
  return L.circleMarker([latLng.lat, latLng.lng], {
    radius:      10,      // size of the circle in pixels
    color:       '#fff',  // border colour (white ring around the dot)
    weight:      2.5,     // border thickness in pixels
    fillColor:   colour,  // the fill colour inside the circle
    fillOpacity: 1,       // 1 = fully solid, 0 = invisible
  })
  .addTo(map) // puts the circle onto the map

  // .bindTooltip() attaches a label that floats above the marker
  // permanent: true  = always visible (not just on hover)
  // direction: 'top' = label appears above the dot
  // offset: [0, -16] = move the label 16 pixels upward so it doesn't overlap the dot
  // className       = a CSS class for custom styling
  .bindTooltip(name, {
    permanent:  true,
    direction:  'top',
    offset:     [0, -16],
    className:  'device-label',
  })

  // .on('click', fn) attaches a click event — when the user clicks the dot,
  // call the onClick function (which selects this device and shows the detail card)
  .on('click', onClick);
}


// ── createAccuracyCircle() ───────────────────────────────────────────────────
//
//  Draws a semi-transparent circle showing how accurate the GPS signal is.
//  A larger circle = less accurate GPS. A tiny circle = very accurate GPS.
//
//  Parameters:
//  - latLng  : { lat, lng } — centre of the circle (same as the device position)
//  - radius  : the GPS accuracy in metres (comes from position.coords.accuracy)
//  - colour  : matches the device's dot colour
//
export function createAccuracyCircle(latLng, radius, colour) {
  if (mapType === 'google') {
    // google.maps.Circle() draws a real-world circle that scales with zoom
    return new google.maps.Circle({
      map,
      center:          latLng,  // centre point { lat, lng }
      radius,                   // radius in metres (real-world scale)
      fillColor:       colour,
      fillOpacity:     0.1,     // 10% opacity — just a hint, not solid
      strokeColor:     colour,
      strokeOpacity:   0.4,
      strokeWeight:    1,
    });
  }

  // L.circle() (not circleMarker!) draws a real-world circle that grows/shrinks with zoom
  // This is important — we want the circle to match actual metres on the ground
  return L.circle([latLng.lat, latLng.lng], {
    radius,                     // radius in metres
    color:       colour,        // border colour
    fillColor:   colour,
    fillOpacity: 0.1,           // very transparent fill
    weight:      1,             // thin border
  }).addTo(map);
}


// ── createPolyline() ─────────────────────────────────────────────────────────
//
//  Creates the trail line that shows where the phone has been.
//  It starts as just the first point — we add more points as the phone moves.
//
//  Parameters:
//  - latLng  : { lat, lng } — the starting point
//  - colour  : matches the device's dot colour
//
export function createPolyline(latLng, colour) {
  if (mapType === 'google') {
    // google.maps.Polyline() draws a connected line through a series of points
    // path: [latLng] — starts with just one point (the current location)
    // geodesic: true — the line follows the curvature of the Earth
    return new google.maps.Polyline({
      map,
      path:           [latLng], // array of { lat, lng } points — grows over time
      strokeColor:    colour,
      strokeOpacity:  0.8,
      strokeWeight:   3,        // line thickness in pixels
      geodesic:       true,
    });
  }

  // L.polyline() draws a connected line through an array of [lat, lng] points
  // Note: Leaflet uses [[lat,lng], [lat,lng]] arrays, not objects
  return L.polyline([[latLng.lat, latLng.lng]], {
    color:   colour,
    weight:  3,       // line thickness in pixels
    opacity: 0.75,
  }).addTo(map);
}


// ── moveMarker() ─────────────────────────────────────────────────────────────
//
//  Moves an existing marker to a new position.
//  Called every time a phone sends a new GPS ping.
//
//  Parameters:
//  - marker : the marker object we created in createMarker()
//  - latLng : { lat, lng } — the new position
//  - name   : the device name (in case it changed)
//
export function moveMarker(marker, latLng, name) {
  if (mapType === 'google') {
    marker.setPosition(latLng);       // moves the pin to the new coordinates
    marker.setLabel(googleLabel(name)); // update the label in case name changed
  } else {
    // Leaflet uses setLatLng() to move a marker
    // Note: Leaflet needs [lat, lng] array, not { lat, lng } object
    marker.setLatLng([latLng.lat, latLng.lng]);
    marker.setTooltipContent(name); // update the floating label text
  }
}


// ── moveCircle() ─────────────────────────────────────────────────────────────
//
//  Moves and resizes the accuracy circle when the phone updates its position.
//  The accuracy value changes too — sometimes GPS is more/less accurate.
//
export function moveCircle(circle, latLng, radius) {
  if (mapType === 'google') {
    circle.setCenter(latLng);   // move the circle's centre
    circle.setRadius(radius);   // resize it to match new accuracy
  } else {
    circle.setLatLng([latLng.lat, latLng.lng]); // move it
    circle.setRadius(radius);                    // resize it
  }
}


// ── updatePolyline() ─────────────────────────────────────────────────────────
//
//  This is how the trail line gets updated as the phone moves.
//
//  'trail' is an ARRAY of all positions visited so far:
//  [ {lat:10.51, lng:7.41}, {lat:10.52, lng:7.42}, {lat:10.53, lng:7.43}, ... ]
//
//  We pass the FULL array every time, and the polyline redraws itself
//  through all those points. This is what creates the travel trail you see on the map.
//
//  .setLatLngs() is the Leaflet function that replaces the polyline's path
//  with a completely new set of points. It redraws the line instantly.
//
//  Example:
//    Before: line goes through 3 points
//    Phone moves to a 4th location
//    We push the 4th point onto the trail array
//    We call updatePolyline(polyline, trail)
//    .setLatLngs([[p1],[p2],[p3],[p4]]) redraws the line through all 4 points
//
export function updatePolyline(polyline, trail) {
  if (mapType === 'google') {
    // .setPath() replaces the polyline's points with the new full trail array
    polyline.setPath(trail); // trail is [{ lat, lng }, { lat, lng }, ...]
  } else {
    // .setLatLngs() replaces the polyline's points (Leaflet version of setPath)
    // We use .map() to convert { lat, lng } objects → [lat, lng] arrays
    // because Leaflet requires arrays, not objects
    polyline.setLatLngs(trail.map(p => [p.lat, p.lng]));
  }
}


// ── removeFromMap() ──────────────────────────────────────────────────────────
//
//  Completely removes a device's marker, accuracy circle, and trail from the map.
//  Called when a device goes offline (hasn't pinged in 60 seconds).
//
export function removeFromMap(marker, circle, polyline) {
  if (mapType === 'google') {
    // .setMap(null) removes the object from the map without deleting it from memory
    marker.setMap(null);
    circle.setMap(null);
    polyline.setMap(null);
  } else {
    // map.removeLayer() removes the Leaflet object from the map
    map.removeLayer(marker);
    map.removeLayer(circle);
    map.removeLayer(polyline);
  }
}


// ── panTo() ──────────────────────────────────────────────────────────────────
//
//  Smoothly moves the map camera to focus on a specific location.
//  Called when the user clicks "Focus on Map" in the detail card.
//
//  Parameters:
//  - latLng : { lat, lng } — where to centre the camera
//  - zoom   : how zoomed in to be (default 17 = street level)
//
export function panTo(latLng, zoom = 17) {
  if (mapType === 'google') {
    map.setCenter(latLng);  // moves the camera centre
    map.setZoom(zoom);      // sets the zoom level
  } else {
    // Leaflet combines centre + zoom into one call: setView([lat, lng], zoom)
    map.setView([latLng.lat, latLng.lng], zoom);
  }
}


// ── fitAll() ─────────────────────────────────────────────────────────────────
//
//  Zooms and pans the map so ALL tracked devices are visible at once.
//  Called when a new device connects, so you can always see everyone.
//
//  Parameters:
//  - points : array of { lat, lng } — one for each device
//
export function fitAll(points) {
  if (points.length === 0) return; // nothing to show

  if (mapType === 'google') {
    // LatLngBounds is a rectangle that we expand to include all points
    const bounds = new google.maps.LatLngBounds();
    // .extend() stretches the rectangle to include this point
    points.forEach(p => bounds.extend(p));
    // .fitBounds() moves the camera to fit the whole rectangle on screen
    map.fitBounds(bounds);

  } else {
    // L.latLngBounds() creates a bounding rectangle from an array of points
    // .fitBounds() then zooms/pans the map to show the whole rectangle
    // padding: [60, 60] adds 60px of empty space around the edges so markers
    //          aren't right at the edge of the screen
    map.fitBounds(
      L.latLngBounds(points.map(p => [p.lat, p.lng])),
      { padding: [60, 60] }
    );
  }
}


// ─────────────────────────────────────────────────────────────────────────────
//  PRIVATE HELPERS (not exported — only used inside this file)
// ─────────────────────────────────────────────────────────────────────────────

// Dynamically loads the Google Maps JavaScript library from Google's CDN.
// We do this dynamically (not in index.html) so we can pass the API key.
// Returns a Promise that resolves when Google Maps is fully loaded and ready.
function loadGoogleMaps(key) {
  return new Promise(resolve => {
    // Google Maps calls a "callback" function when it finishes loading.
    // We put our resolve function on window so Google Maps can call it.
    window.__mapsReady = resolve;

    // Create a <script> tag and add it to the page
    const s   = document.createElement('script');
    // The URL tells Google which key to use and which function to call when ready
    s.src     = `https://maps.googleapis.com/maps/api/js?key=${key}&callback=__mapsReady`;
    s.async   = true; // don't block the page while loading
    document.head.appendChild(s);
  });
}

// Dynamically loads the Leaflet CSS and JS library.
// Both are needed — CSS for styling, JS for the map logic.
function loadLeaflet() {
  return new Promise(resolve => {
    // Step 1: Add the Leaflet CSS stylesheet
    const css  = document.createElement('link');
    css.rel    = 'stylesheet';
    css.href   = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(css);

    // Step 2: Add the Leaflet JavaScript file
    // js.onload fires when the script finishes downloading and is ready to use
    const js   = document.createElement('script');
    js.src     = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    js.onload  = resolve; // resolve the Promise once Leaflet is ready
    document.head.appendChild(js);
  });
}

// Shows a small notice at the bottom of the screen when using OpenStreetMap
function showFallbackNotice() {
  const div       = document.createElement('div');
  div.id          = 'map-notice';
  div.innerHTML   = '🗺️ Using OpenStreetMap — <a href="https://console.cloud.google.com" target="_blank">add a Google Maps API key</a> for full Google Maps';
  document.body.appendChild(div);
}

// Returns a Google Maps icon config for a coloured circle dot
// This is what replaces the default red Google Maps pin with our coloured dot
function googleIcon(colour) {
  return {
    path:         google.maps.SymbolPath.CIRCLE, // use a circle shape
    scale:        10,           // size of the circle in pixels
    fillColor:    colour,       // fill with the device's assigned colour
    fillOpacity:  1,
    strokeColor:  '#fff',       // white border
    strokeWeight: 2,
  };
}

// Returns a Google Maps label config — the text shown next to the marker
function googleLabel(name) {
  return {
    text:       name,
    color:      '#fff',
    fontSize:   '11px',
    fontWeight: '700',
  };
}

// Dark colour theme for Google Maps
// Each object targets a specific type of map feature and overrides its colour
function darkStyle() {
  return [
    // The base land colour
    { elementType: 'geometry',             stylers: [{ color: '#0f172a' }] },
    // All text on the map
    { elementType: 'labels.text.fill',     stylers: [{ color: '#94a3b8' }] },
    // The outline/shadow behind text
    { elementType: 'labels.text.stroke',   stylers: [{ color: '#0f172a' }] },
    // Normal roads
    { featureType: 'road',         elementType: 'geometry', stylers: [{ color: '#1e293b' }] },
    // Motorways/highways — slightly lighter than normal roads
    { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#334155' }] },
    // Rivers, lakes, sea
    { featureType: 'water',        elementType: 'geometry', stylers: [{ color: '#0c4a6e' }] },
    // Buildings and points of interest
    { featureType: 'poi',          elementType: 'geometry', stylers: [{ color: '#1e293b' }] },
    // Parks
    { featureType: 'poi.park',     elementType: 'geometry', stylers: [{ color: '#14532d' }] },
  ];
}
