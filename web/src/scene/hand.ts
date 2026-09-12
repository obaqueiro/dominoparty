import { Container, Graphics, Text } from 'pixi.js';
import { TILE_H, TILE_W } from '../pips';

export const TAB_HEIGHT = 48;
const MIN_ZOOM = 0.3;
const MAX_ZOOM = 2.5;
/** Touch-target size of the tab-bar buttons. */
const BTN_W = 46;
const BTN_H = 38;
const BTN_GAP = 8;
const EDGE_PAD = 8;
const MIN_PANEL = 70;
/** Drag must exceed this before a bar press counts as a resize (vs. a stray tap). */
const RESIZE_SLOP = 4;

/**
 * Screen-fixed, collapsible private-hand panel anchored to the bottom of the
 * stage. A full-width tab bar carries discrete, finger-sized buttons (collapse,
 * arrange, zoom) — the bar itself never toggles on tap; instead dragging it
 * vertically resizes the split between the hand and the main board. The tab
 * band still counts as the draw-to-hand drop zone while collapsed. Tiles live
 * in the inner `content` container — an unbounded canvas that pans freely in
 * both axes and zooms via the tab buttons. Tile layout, open state, zoom and
 * panel height are client-local, persisted to localStorage.
 */
export class HandPanel extends Container {
  /** Tiles are parented here (not directly on the panel) so they can scroll. */
  readonly content = new Container();

  /** Set by the game to re-run its hand arrangement (tab ⇤ button). */
  onArrange: (() => void) | null = null;

  /** Set by the game to clear the tile selection when the panel felt is tapped. */
  onBackgroundTap: (() => void) | null = null;

  private bg: Graphics;
  private contentMask: Graphics;
  private tab: Container;
  private tabBg: Graphics;
  private grip: Graphics;
  private collapseBtn: TabButton;
  private badge: Text;
  private points: Text;
  private zoomInBtn: TabButton;
  private zoomOutBtn: TabButton;
  private arrangeBtn: TabButton;
  private layoutKey: string;
  private stateKey: string;
  private zoomKey: string;
  private heightKey: string;
  private layoutMap: Record<string, { x: number; y: number }>;
  private expanded = true;
  private panelHeight = 120;
  /** User-chosen height (via the resize drag); null = derive from screen. */
  private userHeight: number | null = null;
  private anim: number | null = null;
  private scrollPointer: number | null = null;
  private scrollLastX = 0;
  private scrollLastY = 0;
  private resizePointer: number | null = null;
  private resizeStartY = 0;
  private resizeStartH = 0;
  private resizing = false;
  private labelsRight = 0;

  screenWidth = 0;
  screenHeight = 0;

  constructor(room: string, clientId: string) {
    super();
    this.layoutKey = `dp_hand_${room}_${clientId}`;
    this.stateKey = `dp_hand_open_${room}`;
    this.zoomKey = `dp_hand_zoom_${room}`;
    this.heightKey = `dp_hand_h_${room}`;
    try {
      this.layoutMap = JSON.parse(localStorage.getItem(this.layoutKey) ?? '{}');
    } catch {
      this.layoutMap = {};
    }
    this.expanded = localStorage.getItem(this.stateKey) !== '0';
    const savedZoom = Number(localStorage.getItem(this.zoomKey));
    if (savedZoom >= MIN_ZOOM && savedZoom <= MAX_ZOOM) this.content.scale.set(savedZoom);
    const savedH = Number(localStorage.getItem(this.heightKey));
    if (savedH >= MIN_PANEL) this.userHeight = savedH;

    this.tab = new Container();
    this.tabBg = new Graphics();
    this.tab.addChild(this.tabBg);
    this.grip = new Graphics();
    this.tab.addChild(this.grip);
    this.badge = new Text({ text: '', style: { fontSize: 14, fill: 0xffffff } });
    this.badge.anchor.set(0, 0.5);
    this.tab.addChild(this.badge);
    this.points = new Text({ text: '', style: { fontSize: 14, fill: 0xcfd8e3 } });
    this.points.anchor.set(0, 0.5);
    this.tab.addChild(this.points);

    const makeTabButton = (label: string, action: () => void): TabButton => {
      const btn = new TabButton(label, action);
      this.tab.addChild(btn);
      return btn;
    };
    this.zoomOutBtn = makeTabButton('－', () => this.zoomBy(1 / 1.25));
    this.zoomInBtn = makeTabButton('＋', () => this.zoomBy(1.25));
    this.arrangeBtn = makeTabButton('⇤', () => this.onArrange?.());
    this.collapseBtn = makeTabButton('▼', () => this.toggle());

    // The bar itself is the resize handle for the hand/board split.
    this.tabBg.eventMode = 'static';
    this.tabBg.cursor = 'ns-resize';
    this.tabBg.on('pointerdown', (e) => {
      this.resizePointer = e.pointerId;
      this.resizeStartY = e.global.y;
      this.resizeStartH = this.panelHeight;
      this.resizing = false;
    });
    this.tabBg.on('globalpointermove', (e) => {
      if (this.resizePointer !== e.pointerId) return;
      const dy = this.resizeStartY - e.global.y;
      if (!this.resizing) {
        if (Math.abs(dy) < RESIZE_SLOP) return;
        this.resizing = true;
        // Dragging the bar upward out of a collapsed state opens the hand.
        if (!this.expanded && dy > 0) this.setExpanded(true);
      }
      if (!this.expanded) return;
      this.setPanelHeight(this.resizeStartH + dy);
    });
    const endResize = () => {
      if (this.resizing) localStorage.setItem(this.heightKey, String(this.panelHeight));
      this.resizePointer = null;
      this.resizing = false;
    };
    this.tabBg.on('pointerup', endResize);
    this.tabBg.on('pointerupoutside', endResize);

    this.bg = new Graphics();
    this.bg.position.y = TAB_HEIGHT;
    this.content.position.y = TAB_HEIGHT;
    this.contentMask = new Graphics();
    this.content.mask = this.contentMask;
    // One-finger free pan (both axes) on empty panel background.
    this.bg.eventMode = 'static';
    this.bg.on('pointerdown', (e) => {
      this.scrollPointer = e.pointerId;
      this.scrollLastX = e.global.x;
      this.scrollLastY = e.global.y;
    });
    this.bg.on('globalpointermove', (e) => {
      if (this.scrollPointer !== e.pointerId) return;
      this.content.x += e.global.x - this.scrollLastX;
      this.content.y += e.global.y - this.scrollLastY;
      this.scrollLastX = e.global.x;
      this.scrollLastY = e.global.y;
    });
    this.bg.on('pointertap', () => this.onBackgroundTap?.());
    const endScroll = () => (this.scrollPointer = null);
    this.bg.on('pointerup', endScroll);
    this.bg.on('pointerupoutside', endScroll);

    this.addChild(this.tab, this.bg, this.content, this.contentMask);
  }

  get isExpanded(): boolean {
    return this.expanded;
  }

  private maxPanelHeight(): number {
    return Math.max(MIN_PANEL, Math.round(this.screenHeight * 0.7) - TAB_HEIGHT);
  }

  resize(width: number, height: number): void {
    this.screenWidth = width;
    this.screenHeight = height;
    const wanted = this.userHeight ?? Math.min(120, Math.round(height * 0.22));
    this.panelHeight = Math.max(MIN_PANEL, Math.min(this.maxPanelHeight(), wanted));

    this.tabBg.clear();
    this.tabBg.rect(0, 0, width, TAB_HEIGHT).fill(0x2c3e50);
    this.tabBg.rect(0, TAB_HEIGHT - 2, width, 2).fill(0x1f2d3a);

    const cy = TAB_HEIGHT / 2;
    let x = width - EDGE_PAD - BTN_W;
    for (const btn of [this.collapseBtn, this.arrangeBtn, this.zoomInBtn, this.zoomOutBtn]) {
      btn.layout(x, cy - BTN_H / 2, BTN_W, BTN_H);
      x -= BTN_W + BTN_GAP;
    }
    this.labelsRight = this.layoutLabels();

    // Grip pill: centred in the free space between the labels and the buttons,
    // signalling the drag-to-resize affordance.
    const gripLeft = this.labelsRight + 16;
    const gripRight = x + BTN_W;
    const gripW = Math.min(64, Math.max(0, gripRight - gripLeft - 16));
    this.grip.clear();
    if (gripW > 16) {
      this.grip
        .roundRect((gripLeft + gripRight - gripW) / 2, cy - 2.5, gripW, 5, 2.5)
        .fill({ color: 0xffffff, alpha: 0.35 });
    }

    this.bg.clear();
    this.bg.rect(0, 0, width, this.panelHeight).fill({ color: 0x388e3c, alpha: 0.92 });
    this.contentMask.clear();
    this.contentMask.rect(0, TAB_HEIGHT, width, this.panelHeight).fill(0xffffff);

    this.snapPosition();
  }

  /** Resize the hand/board split; clamped and applied immediately. */
  private setPanelHeight(h: number): void {
    const next = Math.max(MIN_PANEL, Math.min(this.maxPanelHeight(), Math.round(h)));
    if (next === this.panelHeight) return;
    this.userHeight = next;
    this.resize(this.screenWidth, this.screenHeight);
  }

  /** Zoom the hand tiles around the panel center; panel size is unchanged. */
  zoomBy(factor: number): void {
    const cur = this.content.scale.x;
    const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, cur * factor));
    if (next === cur) return;
    // Keep the content point at the panel center fixed on screen.
    const cx = this.screenWidth / 2;
    const cy = TAB_HEIGHT + this.panelHeight / 2;
    const wx = (cx - this.content.x) / cur;
    const wy = (cy - this.content.y) / cur;
    this.content.scale.set(next);
    this.content.position.set(cx - wx * next, cy - wy * next);
    localStorage.setItem(this.zoomKey, String(next));
    if (!this.expanded) this.setExpanded(true);
  }

  /** Update the tile count and total pip count shown at the left of the bar. */
  setCount(n: number, points: number): void {
    this.badge.text = n > 0 ? `🁢 ${n}` : '';
    this.points.text = n > 0 ? `${points} pts` : '';
    // Re-run the bar layout so the grip stays centred as the labels change width.
    if (this.layoutLabels() !== this.labelsRight) this.resize(this.screenWidth, this.screenHeight);
  }

  /** Place the count labels; returns the x of their right edge. */
  private layoutLabels(): number {
    const cy = TAB_HEIGHT / 2;
    this.badge.position.set(EDGE_PAD + 6, cy);
    this.points.position.set(this.badge.x + this.badge.width + (this.badge.text ? 12 : 0), cy);
    return this.points.x + this.points.width;
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
    this.collapseBtn.setLabel(this.expanded ? '▼' : '▲');
    this.content.visible = true;
    this.publishHeight();
  }

  private animateTo(targetY: number): void {
    if (this.anim !== null) cancelAnimationFrame(this.anim);
    this.collapseBtn.setLabel(this.expanded ? '▼' : '▲');
    this.publishHeight();
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

  /** Expose the occupied bottom height so HTML overlays can sit above it. */
  private publishHeight(): void {
    const h = TAB_HEIGHT + (this.expanded ? this.panelHeight : 0);
    document.documentElement.style.setProperty('--hand-h', `${h}px`);
  }

  /** Is a global (screen) point inside the panel or its tab band? */
  contains(gx: number, gy: number): boolean {
    return gy >= this.targetY();
  }

  /** Convert a global point to content-local coordinates (for tile placement). */
  toContentLocal(gx: number, gy: number): { x: number; y: number } {
    const s = this.content.scale.x;
    return {
      x: (gx - this.x - this.content.x) / s,
      y: (gy - this.y - this.content.y) / s,
    };
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

  /**
   * Lay the tiles out left-to-right in the visible viewport, wrapping to new
   * rows as needed; resets the scroll to the origin. Returns the new local
   * positions.
   */
  arrange(tileNames: string[]): Record<string, { x: number; y: number }> {
    const out: Record<string, { x: number; y: number }> = {};
    const s = this.content.scale.x;
    const gapX = TILE_W + 24;
    const gapY = TILE_H + 24;
    const viewportW = this.screenWidth / s;
    const perRow = Math.max(1, Math.floor((viewportW - 40) / gapX));
    tileNames.forEach((name, i) => {
      const col = i % perRow;
      const row = Math.floor(i / perRow);
      const pos = { x: 40 + col * gapX, y: TILE_H / 2 + 16 + row * gapY };
      out[name] = pos;
      this.layoutMap[name] = pos;
    });
    this.content.position.set(0, TAB_HEIGHT);
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

/**
 * A tab-bar button: a filled rounded rect so the whole touch target — not just
 * the glyph — takes the tap, and swallows the press so the bar's resize drag
 * never starts underneath it.
 */
class TabButton extends Container {
  private bgRect = new Graphics();
  private glyph: Text;
  private w = BTN_W;
  private h = BTN_H;

  constructor(text: string, action: () => void) {
    super();
    this.glyph = new Text({ text, style: { fontSize: 18, fill: 0xffffff } });
    this.glyph.anchor.set(0.5);
    this.addChild(this.bgRect, this.glyph);
    this.eventMode = 'static';
    this.cursor = 'pointer';
    this.on('pointerdown', (e) => {
      e.stopPropagation();
      this.paint(true);
    });
    const release = () => this.paint(false);
    this.on('pointerup', release);
    this.on('pointerupoutside', release);
    this.on('pointertap', (e) => {
      e.stopPropagation();
      action();
    });
  }

  setLabel(text: string): void {
    this.glyph.text = text;
  }

  layout(x: number, y: number, w: number, h: number): void {
    this.position.set(x, y);
    this.w = w;
    this.h = h;
    this.glyph.position.set(w / 2, h / 2);
    this.paint(false);
  }

  private paint(pressed: boolean): void {
    this.bgRect.clear();
    this.bgRect
      .roundRect(0, 0, this.w, this.h, 8)
      .fill({ color: pressed ? 0x4a90e2 : 0x3d566e, alpha: 1 });
  }
}

export { TILE_H };
