// main.js — Dashboard entry point
// Boots everything in order: map → stream → UI controls → modal

import { initMap }      from './mapManager.js';
import { connectStream } from './stream.js';
import { initControls } from './controls.js';
import { initModal }    from './modal.js';

async function boot() {
  await initMap();    // draw the map first
  connectStream();    // then start listening for phone pings
  initControls();     // wire up detail card buttons
  initModal();        // wire up the share link modal
}

boot();
