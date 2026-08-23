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

  document.getElementById('room-label')!.textContent = room;
  document.querySelectorAll<HTMLButtonElement>('[data-setup]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (confirm(`Reset the board with a double-${btn.dataset.setup} set?`)) {
        game.setup(Number(btn.dataset.setup) as 9 | 12 | 15);
      }
    });
  });
  document.getElementById('shuffle-btn')!.addEventListener('click', () => game.shuffle());
  document.getElementById('rotate-btn')!.addEventListener('click', () => game.rotateSelected());
  document.getElementById('arrange-btn')!.addEventListener('click', () => game.arrangeHand());
  document.getElementById('share-btn')!.addEventListener('click', () => {
    navigator.clipboard?.writeText(location.href);
  });

  // Player list from awareness.
  const playersEl = document.getElementById('players')!;
  const renderPlayers = () => {
    const states = [...session.provider.awareness.getStates().values()];
    playersEl.innerHTML = '';
    for (const s of states as Array<{ name?: string; color?: string }>) {
      if (!s?.name) continue;
      const chip = document.createElement('span');
      chip.className = 'player-chip';
      chip.style.borderLeft = `4px solid ${s.color ?? '#888'}`;
      chip.textContent = s.name;
      playersEl.appendChild(chip);
    }
  };
  session.provider.awareness.on('change', renderPlayers);
  renderPlayers();
}

joinBtn.addEventListener('click', join);
for (const input of [nameInput, roomInput]) {
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') join();
  });
}
if (urlRoom && nameInput.value) join();
