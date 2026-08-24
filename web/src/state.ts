// Pure Y-doc game-state operations, independent of rendering (unit-testable).
import * as Y from 'yjs';
import { tileNames } from './pips';

export interface TileState {
  x: number;
  y: number;
  rotation: number;
  flipped: boolean;
  z: number;
  owner: string | null;
}

export interface GameDoc {
  doc: Y.Doc;
  tiles: Y.Map<Y.Map<unknown>>;
  pieces: Y.Map<Y.Map<unknown>>;
  meta: Y.Map<unknown>;
}

export function gameDoc(doc: Y.Doc): GameDoc {
  return {
    doc,
    tiles: doc.getMap('tiles'),
    pieces: doc.getMap('pieces'),
    meta: doc.getMap('meta'),
  };
}

export function readTile(m: Y.Map<unknown>): TileState {
  return {
    x: (m.get('x') as number) ?? 0,
    y: (m.get('y') as number) ?? 0,
    rotation: (m.get('rotation') as number) ?? 0,
    flipped: (m.get('flipped') as boolean) ?? false,
    z: (m.get('z') as number) ?? 0,
    owner: (m.get('owner') as string | null) ?? null,
  };
}

export const TRAIN_COUNT = 8;

/** Replace the board with a fresh double-`setSize` set laid out in a grid, plus center + trains. */
export function setup(g: GameDoc, setSize: 9 | 12 | 15, origin?: unknown): void {
  g.doc.transact(() => {
    g.meta.set('setSize', setSize);
    if (!g.meta.get('createdAt')) g.meta.set('createdAt', Date.now());

    for (const key of [...g.tiles.keys()]) g.tiles.delete(key);
    const names = tileNames(setSize);
    const cols = Math.ceil(Math.sqrt(names.length) * 1.4);
    names.forEach((name, i) => {
      const t = new Y.Map<unknown>();
      t.set('x', 60 + (i % cols) * 46);
      t.set('y', 60 + Math.floor(i / cols) * 90);
      t.set('rotation', 0);
      t.set('flipped', false);
      t.set('z', i);
      t.set('owner', null);
      g.tiles.set(name, t);
    });
    g.meta.set('zCounter', names.length);

    const center = new Y.Map<unknown>();
    center.set('x', 900);
    center.set('y', 250);
    g.pieces.set('center', center);
    for (let i = 0; i < TRAIN_COUNT; i++) {
      const train = new Y.Map<unknown>();
      train.set('x', 700 + (i % 2) * 420);
      train.set('y', 100 + Math.floor(i / 2) * 90);
      g.pieces.set(`train${i}`, train);
    }
  }, origin);
}

/** Scatter all unowned tiles face-down at random positions (legacy: x,y in [100,400), rotation 0-358). */
export function shuffle(g: GameDoc, origin?: unknown): void {
  g.doc.transact(() => {
    for (const t of g.tiles.values()) {
      if (t.get('owner') != null) continue;
      t.set('x', Math.floor(Math.random() * 300) + 100);
      t.set('y', Math.floor(Math.random() * 300) + 100);
      t.set('rotation', Math.floor(Math.random() * 359));
      t.set('flipped', true);
    }
  }, origin);
}

export const SNAP_TOLERANCE_DEG = 7;

/** Normalize to [0,360) and magnetically snap angles within tolerance of a right angle. */
export function softSnap(angleDeg: number, tolerance = SNAP_TOLERANCE_DEG): number {
  const norm = ((angleDeg % 360) + 360) % 360;
  const nearest = (Math.round(norm / 90) * 90) % 360;
  const dist = Math.min(Math.abs(norm - nearest), 360 - Math.abs(norm - nearest));
  return dist <= tolerance ? nearest : norm;
}

export function nextZ(g: GameDoc): number {
  const z = ((g.meta.get('zCounter') as number) ?? 0) + 1;
  g.meta.set('zCounter', z);
  return z;
}

export function updateTile(
  g: GameDoc,
  name: string,
  fields: Partial<TileState>,
  origin?: unknown,
): void {
  const t = g.tiles.get(name);
  if (!t) return;
  g.doc.transact(() => {
    for (const [k, v] of Object.entries(fields)) t.set(k, v);
  }, origin);
}

export function updatePiece(
  g: GameDoc,
  name: string,
  pos: { x: number; y: number },
  origin?: unknown,
): void {
  const p = g.pieces.get(name);
  if (!p) return;
  g.doc.transact(() => {
    p.set('x', pos.x);
    p.set('y', pos.y);
  }, origin);
}

/** Move a tile into a player's hand: face-up, upright, owned. */
export function takeToHand(g: GameDoc, name: string, clientId: string, origin?: unknown): void {
  const t = g.tiles.get(name);
  if (!t) return;
  g.doc.transact(() => {
    t.set('owner', clientId);
    t.set('flipped', false);
    t.set('rotation', 0);
  }, origin);
}

/** Play a tile from hand onto the board at world position. */
export function playFromHand(
  g: GameDoc,
  name: string,
  pos: { x: number; y: number },
  origin?: unknown,
): void {
  const t = g.tiles.get(name);
  if (!t) return;
  g.doc.transact(() => {
    t.set('owner', null);
    t.set('x', pos.x);
    t.set('y', pos.y);
    t.set('flipped', false);
    t.set('z', nextZ(g));
  }, origin);
}

export function handTiles(g: GameDoc, clientId: string): string[] {
  const names: string[] = [];
  for (const [name, t] of g.tiles.entries()) {
    if (t.get('owner') === clientId) names.push(name);
  }
  return names.sort();
}
