import { Container, Graphics, Text } from 'pixi.js';
import { TILE_H, TILE_W } from '../pips';

export const TAB_HEIGHT = 30;

/**
 * Screen-fixed, collapsible private-hand panel anchored to the bottom of the
 * stage. A full-width tab (chevron + tile-count badge) toggles it; the tab band
 * still counts as the draw-to-hand drop zone while collapsed. Tiles live in the
 * inner `content` container, which pans horizontally when the hand overflows.
 * Tile layout inside the hand is client-local, persisted to localStorage.
 */
export class HandPanel extends Container {
  /** Tiles are parented here (not directly on the panel) so they can scroll. */
  readonly content = new Container();

  private bg: Graphics;
  private tab: Container;
  private tabBg: Graphics;
  private chevron: Text;
  private badge: Text;
  private layoutKey: string;
  private stateKey: string;
  private layoutMap: Record<string, { x: number; y: number }>;
  private expanded = true;
  private panelHeight = 120;
  private anim: number | null = null;
  private scrollPointer: number | null = null;
  private scrollLastX = 0;

  screenWidth = 0;
  screenHeight = 0;

  constructor(room: string, clientId: string) {
    super();
    this.layoutKey = `dp_hand_${room}_${clientId}`;
    this.stateKey = `dp_hand_open_${room}`;
    try {
      this.layoutMap = JSON.parse(localStorage.getItem(this.layoutKey) ?? '{}');
    } catch {
      this.layoutMap = {};
    }
    this.expanded = localStorage.getItem(this.stateKey) !== '0';

    this.tab = new Container();
    this.tabBg = new Graphics();
    this.tab.addChild(this.tabBg);
    this.chevron = new Text({ text: '', style: { fontSize: 14, fill: 0xffffff } });
    this.chevron.anchor.set(0.5);
    this.tab.addChild(this.chevron);
    this.badge = new Text({ text: '', style: { fontSize: 13, fill: 0xffffff } });
    this.badge.anchor.set(0, 0.5);
    this.tab.addChild(this.badge);
    this.tab.eventMode = 'static';
    this.tab.cursor = 'pointer';
    this.tab.on('pointertap', () => this.toggle());

    this.bg = new Graphics();
    this.bg.position.y = TAB_HEIGHT;
    this.content.position.y = TAB_HEIGHT;
    // One-finger horizontal pan on empty panel background.
    this.bg.eventMode = 'static';
    this.bg.on('pointerdown', (e) => {
      this.scrollPointer = e.pointerId;
      this.scrollLastX = e.global.x;
    });
    this.bg.on('globalpointermove', (e) => {
      if (this.scrollPointer !== e.pointerId) return;
      this.content.x = this.clampScroll(this.content.x + e.global.x - this.scrollLastX);
      this.scrollLastX = e.global.x;
    });
    const endScroll = () => (this.scrollPointer = null);
    this.bg.on('pointerup', endScroll);
    this.bg.on('pointerupoutside', endScroll);

    this.addChild(this.tab, this.bg, this.content);
  }

  get isExpanded(): boolean {
    return this.expanded;
  }

  resize(width: number, height: number): void {
    this.screenWidth = width;
    this.screenHeight = height;
    this.panelHeight = Math.min(120, Math.round(height * 0.22));

    this.tabBg.clear();
    this.tabBg.rect(0, 0, width, TAB_HEIGHT).fill(0x2c3e50);
    this.tabBg.rect(0, TAB_HEIGHT - 2, width, 2).fill(0x1f2d3a);
    this.chevron.position.set(width / 2, TAB_HEIGHT / 2);
    this.badge.position.set(width / 2 + 24, TAB_HEIGHT / 2);

    this.bg.clear();
    this.bg.rect(0, 0, width, this.panelHeight).fill({ color: 0x388e3c, alpha: 0.92 });

    this.snapPosition();
  }

  setCount(n: number): void {
    this.badge.text = n > 0 ? `🁢 ${n}` : '';
  }

  toggle(): void {
    this.setExpanded(!this.expanded);
  }

  setExpanded(expanded: boolean): void {
    if (this.expanded === expanded) return;
    this.expanded = expanded;
    localStorage.setItem(this.stateKey, expanded ? '1' : '0');
    this.animateTo(this.targetY());
  }

  /** Briefly open the hand (used to confirm a drop onto the collapsed tab). */
  flashOpen(): void {
    if (!this.expanded) this.setExpanded(true);
  }

  private targetY(): number {
    return this.expanded
      ? this.screenHeight - TAB_HEIGHT - this.panelHeight
      : this.screenHeight - TAB_HEIGHT;
  }

  private snapPosition(): void {
    if (this.anim !== null) cancelAnimationFrame(this.anim);
    this.anim = null;
    this.position.set(0, this.targetY());
    this.chevron.text = this.expanded ? '▼' : '▲';
    this.content.visible = true;
  }

  private animateTo(targetY: number): void {
    if (this.anim !== null) cancelAnimationFrame(this.anim);
    this.chevron.text = this.expanded ? '▼' : '▲';
    const step = () => {
      const dy = targetY - this.y;
      if (Math.abs(dy) < 1) {
        this.y = targetY;
        this.anim = null;
        return;
      }
      this.y += dy * 0.3;
      this.anim = requestAnimationFrame(step);
    };
    this.anim = requestAnimationFrame(step);
  }

  private clampScroll(x: number): number {
    let maxTileX = 0;
    for (const child of this.content.children) {
      maxTileX = Math.max(maxTileX, child.x + TILE_W);
    }
    const min = Math.min(0, this.screenWidth - maxTileX - 20);
    return Math.max(min, Math.min(0, x));
  }

  /** Is a global (screen) point inside the panel or its tab band? */
  contains(gx: number, gy: number): boolean {
    return gy >= this.targetY();
  }

  /** Convert a global point to content-local coordinates (for tile placement). */
  toContentLocal(gx: number, gy: number): { x: number; y: number } {
    return { x: gx - this.x - this.content.x, y: gy - this.y - this.content.y };
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
      const pos = { x: 40 + i * gap, y: this.panelHeight / 2 };
      out[name] = pos;
      this.layoutMap[name] = pos;
    });
    this.content.x = 0;
    this.persist();
    return out;
  }

  defaultPosition(index: number): { x: number; y: number } {
    return { x: 40 + index * (TILE_W + 14), y: this.panelHeight / 2 };
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
