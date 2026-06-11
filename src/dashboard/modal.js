// modal.js
// Controls the "Share Tracking Link" modal — link display, copy, QR code.

import { el } from '../utils/dom.js';

export function initModal() {
  const btnShare      = el('btn-share');
  const overlay       = el('modal-overlay');
  const btnClose      = el('btn-modal-close');
  const linkInput     = el('modal-link');
  const btnCopy       = el('btn-copy');
  const qrContainer   = el('qr-code');

  // Open modal and generate QR code
  btnShare.addEventListener('click', () => {
    const url = `${location.protocol}//${location.host}/track`;
    linkInput.value = url;
    overlay.classList.remove('hidden');

    // Regenerate QR each open (URL might change)
    qrContainer.innerHTML = '';
    new QRCode(qrContainer, {
      text: url, width: 160, height: 160,
      colorDark: '#1e293b', colorLight: '#f8fafc',
    });
  });

  // Close modal
  btnClose.addEventListener('click', () => overlay.classList.add('hidden'));
  overlay.addEventListener('click', e => {
    if (e.target === overlay) overlay.classList.add('hidden');
  });

  // Copy link to clipboard
  btnCopy.addEventListener('click', () => {
    navigator.clipboard.writeText(linkInput.value).then(() => {
      btnCopy.textContent = '✓ Copied!';
      setTimeout(() => (btnCopy.textContent = 'Copy'), 2000);
    });
  });
}
