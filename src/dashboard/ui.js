// ui.js
// Renders the sidebar device list, detail card, and device count badge.

import { deviceStore, selectedId } from './store.js';
import { formatDist }             from '../utils/geo.js';
import { el, escHtml as esc }     from '../utils/dom.js';

// ── Device count ──────────────────────────────────────────────────────────────

export function updateDeviceCount() {
  const n = deviceStore.size;
  el('device-count').textContent    = `${n} device${n !== 1 ? 's' : ''} online`;
  el('sidebar-count').textContent   = n;
  el('sidebar-count').style.display = n > 0 ? 'inline-flex' : 'none';

  const dot = document.querySelector('.pulse-dot');
  if (dot) dot.style.background = n > 0 ? '#22c55e' : '#475569';
}

// ── Sidebar list ──────────────────────────────────────────────────────────────

export function renderDeviceList() {
  const listEl = el('device-list');

  if (deviceStore.size === 0) {
    listEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📱</div>
        <div class="empty-title">No devices yet</div>
        <div class="empty-sub">Share the tracking link to start monitoring a phone</div>
      </div>`;
    return;
  }

  listEl.innerHTML = [...deviceStore.values()].map(entry => {
    const d          = entry.data;
    const isSelected = d.deviceId === selectedId;
    const bat        = d.battery != null ? `🔋 ${d.battery}%` : '';
    const spd        = d.speed   != null ? `${(d.speed * 3.6).toFixed(0)} km/h` : '';

    return `
      <div class="device-item ${isSelected ? 'selected' : ''}"
           onclick="selectDevice('${esc(d.deviceId)}')">
        <div class="di-colour" style="background:${entry.colour}"></div>
        <div class="di-info">
          <div class="di-name">${esc(d.name)}</div>
          <div class="di-meta">${d.lat.toFixed(4)}, ${d.lng.toFixed(4)}</div>
          <div class="di-tags">
            ${bat ? `<span class="tag">${bat}</span>` : ''}
            ${spd ? `<span class="tag">${spd}</span>` : ''}
            <span class="tag green">● Live</span>
          </div>
        </div>
        <div class="di-arrow">›</div>
      </div>`;
  }).join('');
}

// ── Detail card ───────────────────────────────────────────────────────────────

export function updateDetailCard(entry) {
  const d = entry.data;
  el('detail-name').textContent = d.name;
  el('d-coords').textContent    = `${d.lat.toFixed(5)}, ${d.lng.toFixed(5)}`;
  el('d-accuracy').textContent  = `±${Math.round(d.accuracy)} m`;
  el('d-speed').textContent     = d.speed   != null ? `${(d.speed * 3.6).toFixed(1)} km/h` : '—';
  el('d-battery').textContent   = d.battery != null ? `${d.battery}%` : '—';
  el('d-lastseen').textContent  = new Date(d.lastSeen).toLocaleTimeString();
  el('d-distance').textContent  = formatDist(entry.totalDist);
}
