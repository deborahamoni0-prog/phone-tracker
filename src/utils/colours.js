// Colour palette — each tracked device gets a unique colour
const COLOURS = [
  '#3b82f6', // blue
  '#22c55e', // green
  '#f59e0b', // amber
  '#ef4444', // red
  '#a855f7', // purple
  '#06b6d4', // cyan
  '#f97316', // orange
  '#ec4899', // pink
];

let index = 0;

export function nextColour() {
  return COLOURS[index++ % COLOURS.length];
}
