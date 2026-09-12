import { Application, Container, FederatedPointerEvent, Graphics } from 'pixi.js';
import * as Y from 'yjs';
import { LOCAL_ORIGIN, Session } from './doc';
import * as state from './state';
import { BoardCamera } from './scene/board';
import { CursorLayer } from './scene/cursors';
import { HandPanel } from './scene/hand';
import { makeCenter, makeTrain } from './scene/pieces';
import { TILE_H, TILE_W, tilePoints } from './pips';
import { makeGhostTile, TileTextures, TileView } from './scene/tile';

const DRAG_THRESHOLD = 5; // px of movement before a press counts as a drag
const DRAG_SYNC_MS = 33; // ~30 Hz position sync while dragging
// Snap slots are generated from board tiles within this radius of the dragged
// tile, and the ghost outline only appears (and the drop only snaps) when the
// dragged tile's centre is this close to a slot.
const SLOT_SEARCH_RADIUS = TILE_H * 2;
const SLOT_SNAP_DIST = TILE_W;
/** A slot is considered taken if another tile's centre sits this close to it. */
const SLOT_OCCUPIED_DIST = TILE_W * 0.7;

interface SnapSlot {
  x: number;
  y: number;
  /** Degrees. */
  rotation: number;
}

interface DragState {
  target: TileView | Container;
  kind: 'tile' | 'piece' | 'rotate';
  name: string;
  fromHand: boolean;
  startGlobal: { x: number; y: number };
  grabOffset: { x: number; y: number };
  moved: boolean;
  lastSync: number;
  /** rotate-drag only: pointer angle (deg) at drag start and tile rotation at drag start */
  startPointerAngle?: number;
  startRotation?: number;
  /** Angle adopted from the nearest board tile while dragging, if any. */
  /** Snap slot the ghost outline is currently showing, if any. */
  snapSlot?: SnapSlot;
}

export class Game {
  private app!: Application;
  private camera!: BoardCamera;
  /** Outline shown at the slot a dragged tile will snap into. */
  private ghost!: Graphics;
  private world = new Container();
  private tilesLayer = new Container();
  private piecesLayer = new Container();
  private hand!: HandPanel;
  private cursors!: CursorLayer;
  private textures!: TileTextures;
  private g: state.GameDoc;

  private tileViews = new Map<string, TileView>();
  private pieceViews = new Map<string, Container>();
  private drag: DragState | null = null;
  private selected: TileView | null = null;
  private lastTap = new Map<string, number>();
  private lastCursorSync = 0;

  constructor(private session: Session) {
    this.g = state.gameDoc(session.doc);
  }

  async init(container: HTMLElement): Promise<void> {
    this.app = new Application();
    await this.app.init({
      resizeTo: container,
      background: 0x35654d,
      antialias: true,
      resolution: Math.min(window.devicePixelRatio, 2),
      autoDensity: true,
    });
    container.appendChild(this.app.canvas);
    this.textures = new TileTextures(this.app.renderer as never);

    // Screen-fixed background = pan/zoom hit area.
    const bg = new Graphics();
    const drawBg = () => {
      bg.clear();
      bg.rect(0, 0, this.app.screen.width, this.app.screen.height).fill({ alpha: 0.0001 });
    };
    drawBg();
    this.app.stage.addChild(bg);
    this.camera = new BoardCamera(this.world, bg as unknown as Container);
    bg.on('pointertap', () => this.deselect());
    this.app.stage.addChild(this.world);

    this.tilesLayer.sortableChildren = true;
    this.ghost = makeGhostTile();
    this.ghost.zIndex = 1e9;
    this.world.addChild(this.piecesLayer, this.tilesLayer);
    this.cursors = new CursorLayer(this.session.provider.awareness);
    this.world.addChild(this.cursors);

    this.hand = new HandPanel(this.session.room, this.session.identity.clientId);
    this.hand.onArrange = () => this.arrangeHand();
    this.hand.onBackgroundTap = () => this.deselect();
    this.app.stage.addChild(this.hand);
    const onResize = () => {
      drawBg();
      this.hand.resize(this.app.screen.width, this.app.screen.height);
    };
    onResize();
    this.app.renderer.on('resize', onResize);

    // Global pointer handlers drive dragging & cursor awareness.
    this.app.stage.eventMode = 'static';
    this.app.stage.hitArea = { contains: () => true };
    this.app.stage.on('globalpointermove', (e) => this.onPointerMove(e));
    this.app.stage.on('pointerup', (e) => this.onPointerUp(e));
    this.app.stage.on('pointerupoutside', (e) => this.onPointerUp(e));

    // Keep the selection gizmo a constant on-screen size across zoom levels.
    this.app.ticker.add(() => this.selected?.setGizmoScale(this.gizmoScale()));

    this.g.tiles.observeDeep((events, txn) => this.onTilesChanged(events, txn));
    this.g.pieces.observeDeep(() => this.syncPieces());
    this.fullSync();
    // `sync` re-fires after every websocket reconnect; only fit the camera the
    // first time so reconnects don't reset the user's view.
    let fitted = false;
    this.session.provider.on('sync', () => {
      this.fullSync();
      if (!fitted) {
        fitted = true;
        this.fitBoard();
      }
    });
  }

  /** Fit the current board tiles into view (initial camera for small screens). */
  private fitBoard(): void {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const m of this.g.tiles.values()) {
      const t = state.readTile(m);
      if (t.owner !== null) continue;
      minX = Math.min(minX, t.x - 60);
      minY = Math.min(minY, t.y - 60);
      maxX = Math.max(maxX, t.x + 60);
      maxY = Math.max(maxY, t.y + 60);
    }
    if (!isFinite(minX)) return;
    const sw = this.app.screen.width;
    const sh = this.app.screen.height - 120;
    const scale = Math.min(1.5, Math.max(0.4, Math.min(sw / (maxX - minX), sh / (maxY - minY))));
    this.world.scale.set(scale);
    this.world.position.set(-minX * scale + (sw - (maxX - minX) * scale) / 2, -minY * scale + 10);
  }

  zoom(factor: number): void {
    this.camera.zoomBy(factor, this.app.screen.width / 2, this.app.screen.height / 2);
  }

  // ---------- doc -> scene ----------

  private fullSync(): void {
    const known = new Set<string>();
    for (const name of this.g.tiles.keys()) {
      known.add(name);
      this.syncTile(name);
    }
    for (const [name, view] of this.tileViews) {
      if (!known.has(name)) {
        view.destroy();
        this.tileViews.delete(name);
      }
    }
    this.syncPieces();
  }

  private onTilesChanged(events: Y.YEvent<Y.Map<unknown>>[], txn: Y.Transaction): void {
    const touched = new Set<string>();
    for (const ev of events) {
      if (ev.path.length === 0) {
        for (const key of ev.changes.keys.keys()) touched.add(key as string);
      } else {
        touched.add(String(ev.path[0]));
      }
    }
    for (const name of touched) {
      // While this client drags a tile, its own doc echoes must not fight the pointer.
      if (txn.origin === LOCAL_ORIGIN && this.drag?.name === name) continue;
      this.syncTile(name);
    }
  }

  private syncTile(name: string): void {
    const m = this.g.tiles.get(name);
    if (!m) {
      this.tileViews.get(name)?.destroy();
      this.tileViews.delete(name);
      return;
    }
    const t = state.readTile(m);
    const mine = t.owner === this.session.identity.clientId;

    if (t.owner !== null && !mine) {
      // In someone else's hand: hidden.
      const view = this.tileViews.get(name);
      if (view) {
        view.destroy();
        this.tileViews.delete(name);
      }
      return;
    }

    let view = this.tileViews.get(name);
    if (!view || view.destroyed) {
      view = new TileView(name, this.textures);
      this.tileViews.set(name, view);
      this.attachTileEvents(view);
    }

    if (this.drag?.name === name && this.drag.kind !== 'piece') return;

    if (mine) {
      if (view.parent !== this.hand.content) {
        // Moving board -> hand: the board gizmo no longer applies.
        if (this.selected === view) this.deselect();
        this.hand.content.addChild(view);
      }
      const pos =
        this.hand.savedPosition(name) ?? this.hand.defaultPosition(this.hand.content.children.length - 1);
      view.position.set(pos.x, pos.y);
      view.rotation = (t.rotation * Math.PI) / 180;
      view.setFlipped(false);
      view.zIndex = 0;
    } else {
      if (view.parent !== this.tilesLayer) this.tilesLayer.addChild(view);
      view.position.set(t.x, t.y);
      view.rotation = (t.rotation * Math.PI) / 180;
      view.setFlipped(t.flipped);
      view.zIndex = t.z;
    }
    const handNames = state.handTiles(this.g, this.session.identity.clientId);
    this.hand.setCount(handNames.length, handNames.reduce((sum, n) => sum + tilePoints(n), 0));
  }

  // ---------- selection gizmo ----------

  private select(view: TileView): void {
    if (this.selected === view) return;
    this.deselect();
    this.selected = view;
    if (view.parent === this.hand.content) {
      // Hand tiles have no z ordering: re-add to draw the gizmo over neighbours.
      this.hand.content.addChild(view);
    } else if (view.parent === this.tilesLayer) {
      // Selecting counts as picking the tile up: bring it above neighbors so the gizmo is reachable.
      const z = state.nextZ(this.g);
      state.updateTile(this.g, view.tileName, { z }, LOCAL_ORIGIN);
      view.zIndex = z;
    }
    const inHand = view.parent === this.hand.content;
    view.showGizmo(this.gizmoScale(), inHand);
    view.rotateKnob!.removeAllListeners('pointerdown');
    view.rotateKnob!.on('pointerdown', (e: FederatedPointerEvent) => {
      if (this.drag) return;
      e.stopPropagation();
      const center = view.parent!.toGlobal(view.position);
      this.drag = {
        target: view,
        kind: 'rotate',
        name: view.tileName,
        fromHand: false,
        startGlobal: { x: center.x, y: center.y },
        grabOffset: { x: 0, y: 0 },
        moved: true,
        lastSync: 0,
        startPointerAngle:
          (Math.atan2(e.global.y - center.y, e.global.x - center.x) * 180) / Math.PI,
        startRotation: (this.g.tiles.get(view.tileName)?.get('rotation') as number) ?? 0,
      };
    });
    view.flipButton!.removeAllListeners('pointertap');
    view.flipButton!.on('pointertap', (e: FederatedPointerEvent) => {
      e.stopPropagation();
      const flipped = !(this.g.tiles.get(view.tileName)?.get('flipped') as boolean);
      state.updateTile(this.g, view.tileName, { flipped }, LOCAL_ORIGIN);
    });
    // Take the tile off the board into this player's private hand.
    view.handButton!.removeAllListeners('pointertap');
    view.handButton!.on('pointertap', (e: FederatedPointerEvent) => {
      e.stopPropagation();
      state.takeToHand(this.g, view.tileName, this.session.identity.clientId, LOCAL_ORIGIN);
      this.hand.flashOpen();
      this.syncTile(view.tileName);
    });
    // Presses on the gizmo buttons must not start a move-drag on the tile.
    view.flipButton!.on('pointerdown', (e: FederatedPointerEvent) => e.stopPropagation());
    view.handButton!.on('pointerdown', (e: FederatedPointerEvent) => e.stopPropagation());
    // Put a hand tile back on the board, at the centre of the current view.
    view.boardButton!.removeAllListeners('pointertap');
    view.boardButton!.on('pointertap', (e: FederatedPointerEvent) => {
      e.stopPropagation();
      const c = this.camera.toWorld(this.app.screen.width / 2, this.app.screen.height / 3);
      state.playFromHand(this.g, view.tileName, c, LOCAL_ORIGIN);
      this.hand.forget(view.tileName);
      this.deselect();
      this.syncTile(view.tileName);
    });
    view.boardButton!.on('pointerdown', (e: FederatedPointerEvent) => e.stopPropagation());
  }

  /** Counter-scale factor source: the container the selected tile lives in. */
  private gizmoScale(): number {
    return this.selected?.parent === this.hand.content
      ? this.hand.content.scale.x
      : this.world.scale.x;
  }

  private deselect(): void {
    if (this.selected && !this.selected.destroyed) this.selected.hideGizmo();
    this.selected = null;
  }

  private syncPieces(): void {
    for (const [name, m] of this.g.pieces.entries()) {
      if (this.drag?.name === name && this.drag.kind === 'piece') continue;
      let view = this.pieceViews.get(name);
      if (!view || view.destroyed) {
        view = name === 'center' ? makeCenter() : makeTrain();
        this.pieceViews.set(name, view);
        this.piecesLayer.addChild(view);
        this.attachPieceEvents(view, name);
      }
      view.position.set((m.get('x') as number) ?? 0, (m.get('y') as number) ?? 0);
    }
  }

  // ---------- interactions ----------

  private attachTileEvents(view: TileView): void {
    view.on('pointerdown', (e: FederatedPointerEvent) => {
      if (this.drag) return;
      e.stopPropagation();
      const fromHand = view.parent === this.hand.content;
      const local = view.parent!.toLocal(e.global);
      this.drag = {
        target: view,
        kind: 'tile',
        name: view.tileName,
        fromHand,
        startGlobal: { x: e.global.x, y: e.global.y },
        grabOffset: { x: local.x - view.x, y: local.y - view.y },
        moved: false,
        lastSync: 0,
      };
    });
  }

  private attachPieceEvents(view: Container, name: string): void {
    view.on('pointerdown', (e: FederatedPointerEvent) => {
      if (this.drag) return;
      e.stopPropagation();
      const local = this.world.toLocal(e.global);
      this.drag = {
        target: view,
        kind: 'piece',
        name,
        fromHand: false,
        startGlobal: { x: e.global.x, y: e.global.y },
        grabOffset: { x: local.x - view.x, y: local.y - view.y },
        moved: false,
        lastSync: 0,
        startRotation: (((view.rotation * 180) / Math.PI) % 360 + 360) % 360,
      };
    });
  }

  private onPointerMove(e: FederatedPointerEvent): void {
    this.publishCursor(e);
    const d = this.drag;
    if (!d) return;

    if (d.kind === 'rotate') {
      const angle =
        (Math.atan2(e.global.y - d.startGlobal.y, e.global.x - d.startGlobal.x) * 180) / Math.PI;
      const rotation = state.softSnap((d.startRotation ?? 0) + angle - (d.startPointerAngle ?? 0));
      (d.target as TileView).rotation = (rotation * Math.PI) / 180;
      const now = performance.now();
      if (now - d.lastSync > DRAG_SYNC_MS) {
        d.lastSync = now;
        state.updateTile(this.g, d.name, { rotation }, LOCAL_ORIGIN);
      }
      return;
    }

    if (!d.moved) {
      const dist = Math.hypot(e.global.x - d.startGlobal.x, e.global.y - d.startGlobal.y);
      if (dist < DRAG_THRESHOLD) return;
      d.moved = true;
      this.deselect();
      if (d.kind === 'tile' && d.target.parent === this.hand.content) {
        // Hand tiles have no z ordering: re-add to drag above the neighbours.
        this.hand.content.addChild(d.target);
      }
      if (d.kind === 'tile') {
        const z = state.nextZ(this.g);
        state.updateTile(this.g, d.name, { z }, LOCAL_ORIGIN);
        d.target.zIndex = z;
        this.setAwareness({ draggingTile: d.name });
      }
      // Dragging out of the hand: reparent to the world so it follows world coords.
      if (d.fromHand && d.target.parent === this.hand.content) {
        const world = this.camera.toWorld(e.global.x, e.global.y);
        this.tilesLayer.addChild(d.target);
        d.target.position.set(world.x, world.y);
        d.grabOffset = { x: 0, y: 0 };
      }
    }

    const parent = d.target.parent!;
    const local = parent.toLocal(e.global);
    d.target.position.set(local.x - d.grabOffset.x, local.y - d.grabOffset.y);

    if (d.kind === 'tile' && parent === this.tilesLayer) {
      d.snapSlot = this.nearestSnapSlot(d.target as TileView);
      this.showGhost(d.snapSlot);
    }

    // Throttled live sync for board pieces/tiles.
    const now = performance.now();
    if (parent !== this.hand.content && now - d.lastSync > DRAG_SYNC_MS) {
      d.lastSync = now;
      if (d.kind === 'tile' && !d.fromHand) {
        state.updateTile(this.g, d.name, { x: d.target.x, y: d.target.y }, LOCAL_ORIGIN);
      } else if (d.kind === 'piece') {
        state.updatePiece(this.g, d.name, { x: d.target.x, y: d.target.y }, LOCAL_ORIGIN);
      }
    }
  }

  private onPointerUp(e: FederatedPointerEvent): void {
    const d = this.drag;
    if (!d) return;
    this.drag = null;
    this.showGhost(undefined);

    if (d.kind === 'rotate') {
      const rotation = (((d.target as TileView).rotation * 180) / Math.PI + 360) % 360;
      state.updateTile(this.g, d.name, { rotation: state.softSnap(rotation) }, LOCAL_ORIGIN);
      return;
    }

    if (!d.moved) {
      if (d.kind === 'tile') this.onTileTap(d.target as TileView);
      else this.deselect();
      return;
    }

    if (d.kind === 'piece') {
      state.updatePiece(this.g, d.name, { x: d.target.x, y: d.target.y }, LOCAL_ORIGIN);
      return;
    }

    this.setAwareness({ draggingTile: null });
    const inHandZone = this.hand.contains(e.global.x, e.global.y);

    if (inHandZone) {
      // Draw to hand (or move within hand).
      const handLocal = this.hand.toContentLocal(e.global.x, e.global.y);
      const pos = { x: handLocal.x - d.grabOffset.x, y: handLocal.y - d.grabOffset.y };
      this.hand.flashOpen();
      this.hand.content.addChild(d.target);
      d.target.position.set(pos.x, pos.y);
      // Tiles arriving from the board are straightened (takeToHand zeroes the
      // stored rotation); a move within the hand keeps its angle.
      if (!d.fromHand) (d.target as TileView).rotation = 0;
      this.hand.savePosition(d.name, pos.x, pos.y);
      if (!d.fromHand || this.g.tiles.get(d.name)?.get('owner') == null) {
        state.takeToHand(this.g, d.name, this.session.identity.clientId, LOCAL_ORIGIN);
      }
      this.syncTile(d.name);
    } else if (d.fromHand) {
      // Play from hand onto the board, dropping into the ghost slot if shown.
      const slot = d.snapSlot;
      state.playFromHand(this.g, d.name, slot ?? { x: d.target.x, y: d.target.y }, LOCAL_ORIGIN);
      if (slot) state.updateTile(this.g, d.name, { rotation: slot.rotation }, LOCAL_ORIGIN);
      this.hand.forget(d.name);
      this.syncTile(d.name);
    } else if (d.snapSlot) {
      // Released on the ghost outline: take its exact position and angle.
      const slot = d.snapSlot;
      d.target.position.set(slot.x, slot.y);
      (d.target as TileView).rotation = (slot.rotation * Math.PI) / 180;
      state.updateTile(this.g, d.name, { x: slot.x, y: slot.y, rotation: slot.rotation }, LOCAL_ORIGIN);
    } else {
      state.updateTile(this.g, d.name, { x: d.target.x, y: d.target.y }, LOCAL_ORIGIN);
    }
  }

  /**
   * The snap slot nearest to a dragged tile, or undefined when none is close
   * enough. Slots are the free attachment points of every board tile within
   * `SLOT_SEARCH_RADIUS`: end to end along the neighbour's long axis (same
   * angle), and against its long sides (quarter turn), which is how a tile
   * joins a crosswise double.
   * A slot's angle keeps the half-turn the dragged tile already has, so the
   * end the player pointed at the chain stays pointing at it.
   */
  private nearestSnapSlot(view: TileView): SnapSlot | undefined {
    const neighbours: TileView[] = [];
    for (const other of this.tileViews.values()) {
      if (other === view || other.destroyed || other.parent !== this.tilesLayer) continue;
      if (Math.hypot(other.x - view.x, other.y - view.y) <= SLOT_SEARCH_RADIUS) neighbours.push(other);
    }

    const dragged = (((view.rotation * 180) / Math.PI) % 360 + 360) % 360;
    // Keep the tile's own half-turn: 17° and 197° place the same ends of the
    // tile against the chain, so pick whichever is closer to how it is held.
    const keepEnds = (base: number): number => {
      const aligned = base + 180 * Math.round((dragged - base) / 180);
      return ((aligned % 360) + 360) % 360;
    };

    let best: SnapSlot | undefined;
    let bestDist = SLOT_SNAP_DIST;
    for (const n of neighbours) {
      const rad = n.rotation;
      const deg = (((n.rotation * 180) / Math.PI) % 360 + 360) % 360;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      // Local offsets: along the long axis (ends) and across it (sides).
      const candidates: Array<{ lx: number; ly: number; rotation: number }> = [
        { lx: 0, ly: -TILE_H, rotation: deg },
        { lx: 0, ly: TILE_H, rotation: deg },
        { lx: -(TILE_W + TILE_H) / 2, ly: 0, rotation: deg + 90 },
        { lx: (TILE_W + TILE_H) / 2, ly: 0, rotation: deg + 90 },
      ];
      for (const c of candidates) {
        const x = n.x + c.lx * cos - c.ly * sin;
        const y = n.y + c.lx * sin + c.ly * cos;
        const dist = Math.hypot(x - view.x, y - view.y);
        if (dist >= bestDist) continue;
        if (this.slotOccupied(x, y, view)) continue;
        bestDist = dist;
        best = { x, y, rotation: keepEnds(c.rotation) };
      }
    }
    return best;
  }

  private slotOccupied(x: number, y: number, dragged: TileView): boolean {
    for (const other of this.tileViews.values()) {
      if (other === dragged || other.destroyed || other.parent !== this.tilesLayer) continue;
      if (Math.hypot(other.x - x, other.y - y) < SLOT_OCCUPIED_DIST) return true;
    }
    return false;
  }

  /** Move the drop-target outline to `slot`, or hide it when there is none. */
  private showGhost(slot: SnapSlot | undefined): void {
    if (!slot) {
      this.ghost.visible = false;
      if (this.ghost.parent) this.ghost.parent.removeChild(this.ghost);
      return;
    }
    if (this.ghost.parent !== this.tilesLayer) this.tilesLayer.addChild(this.ghost);
    this.ghost.visible = true;
    this.ghost.position.set(slot.x, slot.y);
    this.ghost.rotation = (slot.rotation * Math.PI) / 180;
  }

  private onTileTap(view: TileView): void {
    const name = view.tileName;
    const now = performance.now();
    const last = this.lastTap.get(name) ?? 0;
    this.lastTap.set(name, now);

    if (now - last < 350) {
      // Double tap: flip (board tiles only).
      if (view.parent === this.tilesLayer) {
        const flipped = !(this.g.tiles.get(name)?.get('flipped') as boolean);
        state.updateTile(this.g, name, { flipped }, LOCAL_ORIGIN);
      }
      return;
    }
    // Single tap: toggle the selection gizmo (board and hand tiles alike).
    if (this.selected === view) {
      this.deselect();
    } else if (view.parent === this.tilesLayer || view.parent === this.hand.content) {
      this.select(view);
    }
  }

  arrangeHand(): void {
    const names = state.handTiles(this.g, this.session.identity.clientId);
    const positions = this.hand.arrange(names);
    for (const [name, pos] of Object.entries(positions)) {
      const view = this.tileViews.get(name);
      if (view && view.parent === this.hand.content) view.position.set(pos.x, pos.y);
    }
  }

  setup(size: 9 | 12 | 15): void {
    state.setup(this.g, size, LOCAL_ORIGIN);
    this.fullSync();
  }

  shuffle(): void {
    state.shuffle(this.g, LOCAL_ORIGIN);
  }

  // ---------- awareness ----------

  private publishCursor(e: FederatedPointerEvent): void {
    const now = performance.now();
    if (now - this.lastCursorSync < 50) return;
    this.lastCursorSync = now;
    const world = this.camera.toWorld(e.global.x, e.global.y);
    this.setAwareness({ cursor: { x: world.x, y: world.y } });
  }

  private setAwareness(fields: Record<string, unknown>): void {
    const aw = this.session.provider.awareness;
    aw.setLocalState({ ...(aw.getLocalState() ?? {}), ...fields });
  }
}
