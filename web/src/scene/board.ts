import { Container, FederatedPointerEvent } from 'pixi.js';

const MIN_SCALE = 0.4;
const MAX_SCALE = 3;

/**
 * Camera for the shared board: `world` is the zoomable/pannable container.
 * Pan: drag on empty background (any pointer type). Zoom: wheel or two-finger pinch.
 */
export class BoardCamera {
  private pointers = new Map<number, { x: number; y: number }>();
  private pinchStartDist = 0;
  private pinchStartScale = 1;
  private panning = false;

  constructor(
    public world: Container,
    private hitArea: Container,
  ) {
    hitArea.eventMode = 'static';
    hitArea.on('pointerdown', (e) => this.onDown(e));
    hitArea.on('globalpointermove', (e) => this.onMove(e));
    hitArea.on('pointerup', (e) => this.onUp(e));
    hitArea.on('pointerupoutside', (e) => this.onUp(e));
    hitArea.on('wheel', (e) => {
      e.preventDefault();
      this.zoomAt(e.global.x, e.global.y, e.deltaY < 0 ? 1.1 : 1 / 1.1);
    });
  }

  zoomBy(factor: number, cx: number, cy: number): void {
    this.zoomAt(cx, cy, factor);
  }

  private zoomAt(gx: number, gy: number, factor: number): void {
    const s = Math.min(MAX_SCALE, Math.max(MIN_SCALE, this.world.scale.x * factor));
    const wx = (gx - this.world.x) / this.world.scale.x;
    const wy = (gy - this.world.y) / this.world.scale.y;
    this.world.scale.set(s);
    this.world.position.set(gx - wx * s, gy - wy * s);
  }

  private onDown(e: FederatedPointerEvent): void {
    this.pointers.set(e.pointerId, { x: e.global.x, y: e.global.y });
    if (this.pointers.size === 1 && e.target === this.hitArea) {
      this.panning = true;
    } else if (this.pointers.size === 2) {
      this.panning = false;
      const [a, b] = [...this.pointers.values()];
      this.pinchStartDist = Math.hypot(a.x - b.x, a.y - b.y);
      this.pinchStartScale = this.world.scale.x;
    }
  }

  private onMove(e: FederatedPointerEvent): void {
    const prev = this.pointers.get(e.pointerId);
    if (!prev) return;
    const cur = { x: e.global.x, y: e.global.y };

    if (this.pointers.size === 2) {
      this.pointers.set(e.pointerId, cur);
      const [a, b] = [...this.pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (this.pinchStartDist > 0) {
        const target = this.pinchStartScale * (dist / this.pinchStartDist);
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        this.zoomAt(mid.x, mid.y, target / this.world.scale.x);
      }
    } else if (this.panning) {
      this.world.x += cur.x - prev.x;
      this.world.y += cur.y - prev.y;
      this.pointers.set(e.pointerId, cur);
    }
  }

  private onUp(e: FederatedPointerEvent): void {
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) this.pinchStartDist = 0;
    if (this.pointers.size === 0) this.panning = false;
  }

  toWorld(gx: number, gy: number): { x: number; y: number } {
    return {
      x: (gx - this.world.x) / this.world.scale.x,
      y: (gy - this.world.y) / this.world.scale.y,
    };
  }
}
