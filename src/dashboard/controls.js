// controls.js
// Wires up the detail card buttons (Focus, Street View, Close).

import { el }           from '../utils/dom.js';
import { panTo }        from './mapManager.js';
import { deviceStore, selectedId, setSelectedId } from './store.js';
import { renderDeviceList } from './ui.js';

export function initControls() {
  // Focus the map on the selected device
  el('btn-focus').addEventListener('click', () => {
    const entry = deviceStore.get(selectedId);
    if (entry) panTo({ lat: entry.data.lat, lng: entry.data.lng }, 17);
  });

  // Open Google Street View for the selected device's location
  el('btn-street-view').addEventListener('click', () => {
    const entry = deviceStore.get(selectedId);
    if (!entry) return;
    const url = `https://www.google.com/maps?q=${entry.data.lat},${entry.data.lng}&layer=c`;
    window.open(url, '_blank');
  });

  // Close the detail card
  el('btn-close-card').addEventListener('click', () => {
    setSelectedId(null);
    el('detail-card').classList.add('hidden');
    renderDeviceList();
  });
}
