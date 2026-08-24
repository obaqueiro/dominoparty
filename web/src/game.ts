import { Application, Container, FederatedPointerEvent, Graphics } from 'pixi.js';
import * as Y from 'yjs';
import { LOCAL_ORIGIN, Session } from './doc';
import * as state from './state';
import { BoardCamera } from './scene/board';
import { CursorLayer } from './scene/cursors';
import { HandPanel } from './scene/hand';
import { makeCenter, makeTrain } from './scene/pieces';
import { TileTextures, TileView } from './scene/tile';

const DRAG_THRESHOLD = 5; // px of movement before a press counts as a drag
const DRAG_SYNC_MS = 33; // ~30 Hz position sync while dragging

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
}

export class Game {
  private app!: Application;
  private camera!: BoardCamera;
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
    this.world.addChild(this.piecesLayer, this.tilesLayer);
    this.cursors = new CursorLayer(this.session.provider.awareness);
    this.world.addChild(this.cursors);

    this.hand = new HandPanel(this.session.room, this.session.identity.clientId);
    this.hand.onArrange = () => this.arrangeHand();
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
    this.app.ticker.add(() => this.selected?.setGizmoScale(this.world.scale.x));

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
      if (this.selected === view) this.deselect();
      if (view.parent !== this.hand.content) this.hand.content.addChild(view);
      const pos =
        this.hand.savedPosition(name) ?? this.hand.defaultPosition(this.hand.content.children.length - 1);
      view.position.set(pos.x, pos.y);
      view.rotation = 0;
      view.setFlipped(false);
      view.zIndex = 0;
    } else {
      if (view.parent !== this.tilesLayer) this.tilesLayer.addChild(view);
      view.position.set(t.x, t.y);
      view.rotation = (t.rotation * Math.PI) / 180;
      view.setFlipped(t.flipped);
      view.zIndex = t.z;
    }
    this.hand.setCount(state.handTiles(this.g, this.session.identity.clientId).length);
  }

  // ---------- selection gizmo ----------

  private select(view: TileView): void {
    if (this.selected === view) return;
    this.deselect();
    this.selected = view;
    // Selecting counts as picking the tile up: bring it above neighbors so the gizmo is reachable.
    const z = state.nextZ(this.g);
    state.updateTile(this.g, view.tileName, { z }, LOCAL_ORIGIN);
    view.zIndex = z;
    view.showGizmo(this.world.scale.x);
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
    // Presses on the gizmo buttons must not start a move-drag on the tile.
    view.flipButton!.on('pointerdown', (e: FederatedPointerEvent) => e.stopPropagation());
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
      (d.target as TileView).rotation = 0;
      this.hand.savePosition(d.name, pos.x, pos.y);
      if (!d.fromHand || this.g.tiles.get(d.name)?.get('owner') == null) {
        state.takeToHand(this.g, d.name, this.session.identity.clientId, LOCAL_ORIGIN);
      }
      this.syncTile(d.name);
    } else if (d.fromHand) {
      // Play from hand onto the board at the drop point.
      state.playFromHand(this.g, d.name, { x: d.target.x, y: d.target.y }, LOCAL_ORIGIN);
      this.hand.forget(d.name);
      this.syncTile(d.name);
    } else {
      state.updateTile(this.g, d.name, { x: d.target.x, y: d.target.y }, LOCAL_ORIGIN);
    }
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
    // Single tap: toggle selection (rotate/flip gizmo). Board tiles only.
    if (this.selected === view) {
      this.deselect();
    } else if (view.parent === this.tilesLayer) {
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
