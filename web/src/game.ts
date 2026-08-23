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
  kind: 'tile' | 'piece';
  name: string;
  fromHand: boolean;
  startGlobal: { x: number; y: number };
  grabOffset: { x: number; y: number };
  moved: boolean;
  lastSync: number;
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
    this.app.stage.addChild(this.world);

    this.tilesLayer.sortableChildren = true;
    this.world.addChild(this.piecesLayer, this.tilesLayer);
    this.cursors = new CursorLayer(this.session.provider.awareness);
    this.world.addChild(this.cursors);

    this.hand = new HandPanel(this.session.room, this.session.identity.clientId);
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

    window.addEventListener('keydown', (e) => {
      if (e.key === 'r' || e.key === 'R') this.rotateSelected();
    });

    this.g.tiles.observeDeep((events, txn) => this.onTilesChanged(events, txn));
    this.g.pieces.observeDeep(() => this.syncPieces());
    this.fullSync();
    this.session.provider.on('sync', () => this.fullSync());
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

    if (this.drag?.name === name && this.drag.kind === 'tile') return;

    if (mine) {
      if (view.parent !== this.hand) this.hand.addChild(view);
      const pos =
        this.hand.savedPosition(name) ?? this.hand.defaultPosition(this.hand.children.length - 1);
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
      const fromHand = view.parent === this.hand;
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
    if (!d.moved) {
      const dist = Math.hypot(e.global.x - d.startGlobal.x, e.global.y - d.startGlobal.y);
      if (dist < DRAG_THRESHOLD) return;
      d.moved = true;
      if (d.kind === 'tile') {
        const z = state.nextZ(this.g);
        state.updateTile(this.g, d.name, { z }, LOCAL_ORIGIN);
        d.target.zIndex = z;
        this.setAwareness({ draggingTile: d.name });
      }
      // Dragging out of the hand: reparent to the world so it follows world coords.
      if (d.fromHand && d.target.parent === this.hand) {
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
    if (parent !== this.hand && now - d.lastSync > DRAG_SYNC_MS) {
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

    if (!d.moved) {
      if (d.kind === 'tile') this.onTileTap(d.target as TileView);
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
      const handLocal = this.hand.toLocal(e.global);
      const pos = { x: handLocal.x - d.grabOffset.x, y: handLocal.y - d.grabOffset.y };
      this.hand.addChild(d.target);
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
    // Single tap: select for rotation.
    if (this.selected && !this.selected.destroyed) this.selected.setHighlight(false);
    if (this.selected === view) {
      this.selected = null;
    } else {
      this.selected = view;
      view.setHighlight(true);
    }
  }

  rotateSelected(): void {
    const view = this.selected;
    if (!view || view.destroyed || view.parent !== this.tilesLayer) return;
    const cur = (this.g.tiles.get(view.tileName)?.get('rotation') as number) ?? 0;
    const next = (Math.round(cur / 90) * 90 + 90) % 360;
    state.updateTile(this.g, view.tileName, { rotation: next }, LOCAL_ORIGIN);
  }

  arrangeHand(): void {
    const names = state.handTiles(this.g, this.session.identity.clientId);
    const positions = this.hand.arrange(names);
    for (const [name, pos] of Object.entries(positions)) {
      const view = this.tileViews.get(name);
      if (view && view.parent === this.hand) view.position.set(pos.x, pos.y);
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
