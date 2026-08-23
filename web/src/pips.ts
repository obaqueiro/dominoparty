// Pip layouts ported verbatim from the legacy Konva Tile.ts (see docs/legacy-reference.md).
// Coordinates are within a 40x40 half-tile.

export interface DotSpec {
  color: string;
  coords: Array<{ x: number; y: number }>;
  size: number;
}

const L = 8, R = 32, M = 20;

const grid43: Array<{ x: number; y: number }> = [];
for (const y of [6, 15, 24]) for (const x of [6, 15, 24, 33]) grid43.push({ x, y });

const cols10 = [
  { x: 6, y: 6 }, { x: 6, y: 15 }, { x: 6, y: 24 }, { x: 6, y: 33 },
  { x: 34, y: 6 }, { x: 34, y: 15 }, { x: 34, y: 24 }, { x: 34, y: 33 },
  { x: 20, y: 6 }, { x: 20, y: 33 },
];

export const DOT_SPECS: Record<number, DotSpec> = {
  0: { color: '', coords: [], size: 0 },
  1: { color: '#D06C31', coords: [{ x: M, y: M }], size: 4 },
  2: { color: '#B95C81', coords: [{ x: L, y: L }, { x: R, y: R }], size: 4 },
  3: { color: '#47806C', coords: [{ x: L, y: L }, { x: R, y: R }, { x: M, y: M }], size: 4 },
  4: { color: '#8D4654', coords: [{ x: L, y: L }, { x: R, y: R }, { x: L, y: R }, { x: R, y: L }], size: 4 },
  5: { color: '#6A7982', coords: [{ x: L, y: L }, { x: R, y: R }, { x: L, y: R }, { x: R, y: L }, { x: M, y: M }], size: 4 },
  6: { color: '#3B485C', coords: [{ x: L, y: L }, { x: R, y: R }, { x: L, y: R }, { x: R, y: L }, { x: L, y: M }, { x: R, y: M }], size: 4 },
  7: { color: '#A3923A', coords: [{ x: L, y: L }, { x: R, y: R }, { x: L, y: R }, { x: R, y: L }, { x: L, y: M }, { x: R, y: M }, { x: M, y: M }], size: 4 },
  8: { color: '#5A535B', coords: [{ x: L, y: L }, { x: R, y: R }, { x: L, y: R }, { x: R, y: L }, { x: L, y: M }, { x: R, y: M }, { x: M, y: L }, { x: M, y: R }], size: 4 },
  9: { color: '#7B7B7B', coords: [{ x: L, y: L }, { x: R, y: R }, { x: L, y: R }, { x: R, y: L }, { x: L, y: M }, { x: R, y: M }, { x: M, y: L }, { x: M, y: R }, { x: M, y: M }], size: 4 },
  10: { color: '#525252', coords: [...cols10], size: 3 },
  11: { color: '#8C4C5B', coords: [...cols10, { x: 20, y: 20 }], size: 3 },
  12: {
    color: '#BB6D88',
    coords: [
      { x: 6, y: 6 }, { x: 6, y: 15 }, { x: 6, y: 24 }, { x: 6, y: 33 },
      { x: 34, y: 6 }, { x: 34, y: 15 }, { x: 34, y: 24 }, { x: 34, y: 33 },
      { x: 20, y: 6 }, { x: 20, y: 15 }, { x: 20, y: 24 }, { x: 20, y: 33 },
    ],
    size: 3,
  },
  13: { color: '#7B6064', coords: [...grid43, { x: 20, y: 33 }], size: 3 },
  14: { color: '#775862', coords: [...grid43, { x: 10, y: 33 }, { x: 30, y: 33 }], size: 3 },
  15: { color: '#5C617D', coords: [...grid43, { x: 10, y: 33 }, { x: 30, y: 33 }, { x: 20, y: 33 }], size: 3 },
};

export const TILE_W = 40;
export const TILE_H = 80;
export const FACE_COLOR = 0xfaf0e6;

/** Tile names for a double-N set: "0x0" .. "NxN" with top <= bottom. */
export function tileNames(setSize: number): string[] {
  const names: string[] = [];
  for (let i = 0; i <= setSize; i++) {
    for (let j = i; j <= setSize; j++) names.push(`${i}x${j}`);
  }
  return names;
}
