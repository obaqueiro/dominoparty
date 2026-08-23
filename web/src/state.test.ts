import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import * as state from './state';
import { tileNames } from './pips';

function pair(): [state.GameDoc, state.GameDoc, () => void] {
  const a = new Y.Doc();
  const b = new Y.Doc();
  const sync = () => {
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a, Y.encodeStateVector(b)));
    Y.applyUpdate(a, Y.encodeStateAsUpdate(b, Y.encodeStateVector(a)));
  };
  return [state.gameDoc(a), state.gameDoc(b), sync];
}

describe('game state', () => {
  it('generates correct set sizes', () => {
    expect(tileNames(9)).toHaveLength(55);
    expect(tileNames(12)).toHaveLength(91);
    expect(tileNames(15)).toHaveLength(136);
    expect(tileNames(9)[0]).toBe('0x0');
  });

  it('setup converges across two peers', () => {
    const [a, b, sync] = pair();
    state.setup(a, 12);
    sync();
    expect(b.tiles.size).toBe(91);
    expect(b.meta.get('setSize')).toBe(12);
    expect(b.pieces.get('center')!.get('x')).toBe(900);
    expect([...b.pieces.keys()].filter((k) => k.startsWith('train'))).toHaveLength(8);
  });

  it('concurrent moves of different tiles both survive', () => {
    const [a, b, sync] = pair();
    state.setup(a, 9);
    sync();
    state.updateTile(a, '0x0', { x: 111, y: 222 });
    state.updateTile(b, '1x2', { x: 333, y: 444 });
    sync();
    for (const g of [a, b]) {
      expect(state.readTile(g.tiles.get('0x0')!).x).toBe(111);
      expect(state.readTile(g.tiles.get('1x2')!).y).toBe(444);
    }
  });

  it('hand ownership survives roundtrip and shuffle skips owned tiles', () => {
    const [a, b, sync] = pair();
    state.setup(a, 9);
    sync();
    state.takeToHand(a, '3x5', 'client-a');
    sync();
    expect(state.handTiles(b, 'client-a')).toEqual(['3x5']);

    state.shuffle(b);
    sync();
    const owned = state.readTile(a.tiles.get('3x5')!);
    expect(owned.owner).toBe('client-a');
    expect(owned.flipped).toBe(false); // shuffle must not touch hand tiles
    expect(state.readTile(a.tiles.get('0x0')!).flipped).toBe(true);

    state.playFromHand(a, '3x5', { x: 50, y: 60 });
    sync();
    const played = state.readTile(b.tiles.get('3x5')!);
    expect(played.owner).toBeNull();
    expect(played.x).toBe(50);
  });

  it('persists via full-state update blob (server snapshot model)', () => {
    const [a] = pair();
    state.setup(a, 9);
    state.takeToHand(a, '2x7', 'me');
    const blob = Y.encodeStateAsUpdate(a.doc);

    const restored = state.gameDoc(new Y.Doc());
    Y.applyUpdate(restored.doc, blob);
    expect(restored.tiles.size).toBe(55);
    expect(state.handTiles(restored, 'me')).toEqual(['2x7']);
  });
});
