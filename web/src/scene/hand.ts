import { Container, Graphics } from 'pixi.js';
import { TILE_H, TILE_W } from '../pips';

export const HAND_HEIGHT = 120;

/**
 * Screen-fixed private hand panel at the bottom of the stage. Acts as the drop
 * zone for drawing tiles (replaces the legacy circular drop areas). Tile layout
 * inside the hand is client-local, persisted to localStorage.
 */
export class HandPanel extends Container {
  private bg: Graphics;
  private layoutKey: string;
  private layoutMap: Record<string, { x: number; y: number }>;
  screenWidth = 0;
  screenHeight = 0;

  constructor(room: string, clientId: string) {
    super();
    this.bg = new Graphics();
    this.addChild(this.bg);
    this.layoutKey = `dp_hand_${room}_${clientId}`;
    try {
      this.layoutMap = JSON.parse(localStorage.getItem(this.layoutKey) ?? '{}');
    } catch {
      this.layoutMap = {};
    }
  }

  resize(width: number, height: number): void {
    this.screenWidth = width;
    this.screenHeight = height;
    this.position.set(0, height - HAND_HEIGHT);
    this.bg.clear();
    this.bg.rect(0, 0, width, HAND_HEIGHT).fill({ color: 0x388e3c, alpha: 0.9 });
    this.bg.rect(0, 0, width, 3).fill(0x2c3e50);
  }

  /** Is a global (screen) point inside the hand panel? */
  contains(gx: number, gy: number): boolean {
    return gy >= this.screenHeight - HAND_HEIGHT;
  }

  savedPosition(tileName: string): { x: number; y: number } | undefined {
    return this.layoutMap[tileName];
  }

  savePosition(tileName: string, x: number, y: number): void {
    this.layoutMap[tileName] = { x, y };
    this.persist();
  }

  forget(tileName: string): void {
    delete this.layoutMap[tileName];
    this.persist();
  }

  /** Grid-tidy layout for the given tile names; returns their new local positions. */
  arrange(tileNames: string[]): Record<string, { x: number; y: number }> {
    const out: Record<string, { x: number; y: number }> = {};
    const gap = TILE_W + 14;
    tileNames.forEach((name, i) => {
      const pos = { x: 40 + i * gap, y: HAND_HEIGHT / 2 };
      out[name] = pos;
      this.layoutMap[name] = pos;
    });
    this.persist();
    return out;
  }

  defaultPosition(index: number): { x: number; y: number } {
    return { x: 40 + index * (TILE_W + 14), y: HAND_HEIGHT / 2 };
  }

  private persist(): void {
    try {
      localStorage.setItem(this.layoutKey, JSON.stringify(this.layoutMap));
    } catch {
      // best-effort only
    }
  }
}

export { TILE_H };
