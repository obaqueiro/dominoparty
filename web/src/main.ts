import { connect, loadIdentity } from './doc';
import { Game } from './game';

const lobby = document.getElementById('lobby')!;
const gameEl = document.getElementById('game')!;
const nameInput = document.getElementById('player-name') as HTMLInputElement;
const roomInput = document.getElementById('room-code') as HTMLInputElement;
const joinBtn = document.getElementById('join-btn') as HTMLButtonElement;

nameInput.value = localStorage.getItem('dp_name') ?? '';
const urlRoom = new URLSearchParams(location.search).get('room');
if (urlRoom) roomInput.value = urlRoom;

function sanitizeRoom(s: string): string {
  return s.trim().toLowerCase().replace(/[^a-z0-9-_]/g, '-').slice(0, 30);
}

async function join(): Promise<void> {
  const name = nameInput.value.trim() || 'Player';
  const room = sanitizeRoom(roomInput.value);
  if (!room) {
    roomInput.focus();
    return;
  }
  history.replaceState(null, '', `?room=${room}`);
  lobby.hidden = true;
  gameEl.hidden = false;

  const identity = loadIdentity(name);
  const session = connect(room, identity);
  const game = new Game(session);
  await game.init(document.getElementById('stage')!);
  // Debug/e2e hooks.
  (window as unknown as Record<string, unknown>).__game = game;
  (window as unknown as Record<string, unknown>).__doc = session.doc;

  document.getElementById('room-label')!.textContent = room;

  const menu = document.getElementById('menu')!;
  const menuBtn = document.getElementById('menu-btn')!;
  menuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    menu.hidden = !menu.hidden;
  });
  document.addEventListener('pointerdown', (e) => {
    if (!menu.hidden && !menu.contains(e.target as Node)) menu.hidden = true;
  });
  const menuAction = (id: string, fn: () => void) => {
    document.getElementById(id)!.addEventListener('click', () => {
      menu.hidden = true;
      fn();
    });
  };

  const toastEl = document.getElementById('toast')!;
  let toastTimer = 0;
  const toast = (msg: string) => {
    toastEl.textContent = msg;
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => (toastEl.hidden = true), 1800);
  };

  document.querySelectorAll<HTMLButtonElement>('[data-setup]').forEach((btn) => {
    btn.addEventListener('click', () => {
      menu.hidden = true;
      if (confirm(`Reset the board with a double-${btn.dataset.setup} set?`)) {
        game.setup(Number(btn.dataset.setup) as 9 | 12 | 15);
      }
    });
  });
  menuAction('shuffle-btn', () => {
    if (confirm('Shuffle all tiles on the board face-down? Tiles in hands are kept.')) game.shuffle();
  });
  menuAction('arrange-btn', () => game.arrangeHand());
  menuAction('share-btn', async () => {
    if (navigator.share) {
      await navigator.share({ title: 'DominoParty', url: location.href }).catch(() => {});
    } else {
      await navigator.clipboard?.writeText(location.href);
      toast('Link copied');
    }
  });

  document.getElementById('zoom-in')!.addEventListener('click', () => game.zoom(1.25));
  document.getElementById('zoom-out')!.addEventListener('click', () => game.zoom(1 / 1.25));

  // Player avatars from awareness.
  const playersEl = document.getElementById('players')!;
  const handCounts = () => {
    const counts = new Map<string, number>();
    for (const t of session.tiles.values()) {
      const owner = t.get('owner') as string | null;
      if (owner != null) counts.set(owner, (counts.get(owner) ?? 0) + 1);
    }
    return counts;
  };
  const renderPlayers = () => {
    const states = [...session.provider.awareness.getStates().values()];
    const counts = handCounts();
    playersEl.innerHTML = '';
    for (const s of states as Array<{ clientId?: string; name?: string; color?: string }>) {
      if (!s?.name) continue;
      const wrap = document.createElement('span');
      wrap.className = 'player';
      const chip = document.createElement('span');
      chip.className = 'player-chip';
      chip.style.background = s.color ?? '#888';
      chip.title = s.name;
      chip.textContent = s.name.charAt(0).toUpperCase();
      wrap.appendChild(chip);
      const count = document.createElement('span');
      count.className = 'player-count';
      count.textContent = String(s.clientId ? counts.get(s.clientId) ?? 0 : 0);
      wrap.appendChild(count);
      playersEl.appendChild(wrap);
    }
  };
  session.provider.awareness.on('change', renderPlayers);
  // Tiles change at ~30 Hz during drags; only re-render when hand counts change.
  let lastCounts = '';
  session.tiles.observeDeep(() => {
    const key = JSON.stringify([...handCounts().entries()].sort());
    if (key === lastCounts) return;
    lastCounts = key;
    renderPlayers();
  });
  renderPlayers();
}

joinBtn.addEventListener('click', join);
for (const input of [nameInput, roomInput]) {
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') join();
  });
}
if (urlRoom && nameInput.value) join();
