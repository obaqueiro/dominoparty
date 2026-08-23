import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';

export interface Identity {
  clientId: string;
  name: string;
  color: string;
}

const COLORS = ['#e6194b', '#3cb44b', '#f58231', '#4363d8', '#911eb4', '#46f0f0', '#f032e6', '#008080'];

export function loadIdentity(name: string): Identity {
  let clientId = localStorage.getItem('dp_client_id');
  if (!clientId) {
    clientId = crypto.randomUUID();
    localStorage.setItem('dp_client_id', clientId);
  }
  localStorage.setItem('dp_name', name);
  const color = COLORS[Math.abs(hash(clientId)) % COLORS.length];
  return { clientId, name, color };
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

export interface Session {
  doc: Y.Doc;
  provider: WebsocketProvider;
  tiles: Y.Map<Y.Map<unknown>>;
  pieces: Y.Map<Y.Map<unknown>>;
  meta: Y.Map<unknown>;
  identity: Identity;
  room: string;
}

/** Origin tag for transactions made by this client's gestures. */
export const LOCAL_ORIGIN = 'local';

export function connect(room: string, identity: Identity): Session {
  const doc = new Y.Doc();
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  // WebsocketProvider builds the URL as `${serverUrl}/${roomname}`.
  const provider = new WebsocketProvider(`${proto}://${location.host}/ws`, room, doc, {
    params: { client: identity.clientId, name: identity.name },
  });
  provider.awareness.setLocalState({
    clientId: identity.clientId,
    name: identity.name,
    color: identity.color,
    cursor: null,
    draggingTile: null,
  });
  return {
    doc,
    provider,
    tiles: doc.getMap('tiles'),
    pieces: doc.getMap('pieces'),
    meta: doc.getMap('meta'),
    identity,
    room,
  };
}
