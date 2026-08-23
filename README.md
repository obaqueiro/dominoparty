# DominoParty

A minimalistic online multiplayer domino table — a shared virtual tabletop, not a rules engine. Players drag, flip and rotate tiles on a shared board exactly like around a physical table, with Mexican-Train markers and a center hub. No turns, no scoring, no move validation.

## Architecture

- **`server/`** — Rust (axum + tokio). A y-websocket-compatible sync server built on [yrs](https://github.com/y-crdt/y-crdt): each room is one Y-CRDT document held **in memory**; SQLite is used only to snapshot rooms (debounced every ~10 s, on idle eviction, and on graceful shutdown) and to lazily restore them after a restart. The server knows nothing about dominoes — all game semantics live in the shared document.
- **`web/`** — Vanilla TypeScript + [PixiJS](https://pixijs.com) (Vite build, no framework). [Yjs](https://yjs.dev) + `y-websocket` keep every client's board converged; the awareness protocol carries presence, live cursors and drag highlights.

### Shared document model (per room)

- `tiles` — `Y.Map` keyed by tile name (`"3x5"`), each a nested map `{x, y, rotation, flipped, z, owner}`. `owner: null` means on the shared board; `owner: <clientId>` means in that player's hand (hidden from everyone else). Tiles are never created/destroyed after setup, which makes moves conflict-free per field.
- `pieces` — `center {x,y}` and `train0..7 {x,y}`.
- `meta` — `setSize` (9 | 12 | 15), `zCounter`, `createdAt`.

Identity is a client-generated UUID in `localStorage` plus a display name — no accounts. Hands survive refresh and reconnect; hand *layout* stays local to the browser.

## Development

```sh
# server (port 3000)
cd server && cargo run

# frontend dev server (port 5173, proxies /ws to :3000)
cd web && npm install && npm run dev
```

Tests: `cargo test` in `server/`, `npm test` in `web/`.

## Production

One container serves both the API and the built frontend (single origin):

```sh
docker compose up --build
# open http://localhost:3000, pick a name and a room code
```

Room snapshots persist in the `db-data` volume. Configuration (env): `PORT`, `DB_PATH`, `STATIC_DIR`, `FLUSH_INTERVAL_SECS` (10), `IDLE_EVICT_SECS` (600), `PRUNE_AFTER_DAYS` (30, 0 = never prune).

## Controls

- **Drag** tiles, train markers and the center hub; drag on empty felt to pan.
- **Wheel / pinch** to zoom.
- **Tap** a tile to select it, then **R** (or ↻) to rotate 90°.
- **Double-tap** a board tile to flip it face-down.
- Drag a tile onto the bottom green panel to take it into your **hand**; drag it back out to play it.
- **Setup 9/12/15** resets the board with a double-9/12/15 set; **Shuffle** scatters all unowned tiles face-down.

See `docs/legacy-reference.md` for the pip-layout and behavior reference carried over from the original implementation.
