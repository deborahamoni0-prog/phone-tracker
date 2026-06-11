// battery.js
// Reads battery level using the Battery Status API and keeps it updated.

export async function initBattery(onUpdate) {
  if (!navigator.getBattery) return; // not supported on all browsers

  const battery = await navigator.getBattery();

  onUpdate(Math.round(battery.level * 100));

  battery.addEventListener('levelchange', () => {
    onUpdate(Math.round(battery.level * 100));
  });
}
