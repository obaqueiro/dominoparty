import { Container, Graphics, Text } from 'pixi.js';
import type { Awareness } from 'y-protocols/awareness';

interface PeerState {
  clientId?: string;
  name?: string;
  color?: string;
  cursor?: { x: number; y: number } | null;
  draggingTile?: string | null;
}

/** Renders remote players' cursors (world coordinates) inside the world container. */
export class CursorLayer extends Container {
  private views = new Map<number, Container>();

  constructor(private awareness: Awareness) {
    super();
    this.eventMode = 'none';
    awareness.on('change', () => this.refresh());
  }

  refresh(): void {
    const states = this.awareness.getStates() as Map<number, PeerState>;
    const seen = new Set<number>();
    for (const [id, state] of states) {
      if (id === this.awareness.clientID || !state?.cursor) continue;
      seen.add(id);
      let view = this.views.get(id);
      if (!view) {
        view = this.makeCursor(state.name ?? '?', state.color ?? '#888888');
        this.views.set(id, view);
        this.addChild(view);
      }
      view.position.set(state.cursor.x, state.cursor.y);
    }
    for (const [id, view] of this.views) {
      if (!seen.has(id)) {
        view.destroy();
        this.views.delete(id);
      }
    }
  }

  private makeCursor(name: string, color: string): Container {
    const c = new Container();
    const arrow = new Graphics();
    arrow.poly([0, 0, 12, 10, 5, 12, 0, 18]).fill(color).stroke({ color: 0xffffff, width: 1 });
    c.addChild(arrow);
    const label = new Text({
      text: name,
      style: { fontSize: 12, fill: 0xffffff, stroke: { color: 0x000000, width: 3 } },
    });
    label.position.set(14, 14);
    c.addChild(label);
    return c;
  }
}
