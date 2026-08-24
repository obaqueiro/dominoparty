use std::collections::{HashMap, HashSet};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;

use axum::extract::ws::{Message as WsMessage, WebSocket, WebSocketUpgrade};
use axum::extract::{Path, Query, State};
use axum::response::Response;
use futures_util::{SinkExt, StreamExt};
use yrs::encoding::read::Cursor;
use yrs::sync::protocol::MessageReader;
use yrs::sync::{Message, SyncMessage};
use yrs::updates::decoder::{Decode, DecoderV1};
use yrs::updates::encoder::Encode;
use yrs::{ReadTxn, Transact, Update};

use crate::room::{Frame, Room};
use crate::AppState;

static CONN_SEQ: AtomicUsize = AtomicUsize::new(1);

pub async fn ws_handler(
    ws: WebSocketUpgrade,
    Path(room_id): Path<String>,
    Query(params): Query<HashMap<String, String>>,
    State(state): State<Arc<AppState>>,
) -> Response {
    ws.on_upgrade(move |socket| async move {
        if let (Some(client), Some(name)) = (params.get("client"), params.get("name")) {
            let _ = state.registry.persistence().touch_session(client, name);
        }
        let room = state.registry.get_or_load(&room_id);
        handle_connection(socket, room).await;
    })
}

async fn handle_connection(socket: WebSocket, room: Arc<Room>) {
    let conn_id = CONN_SEQ.fetch_add(1, Ordering::Relaxed);
    room.connections.fetch_add(1, Ordering::Relaxed);
    room.touch();
    let mut rx = room.tx.subscribe();
    let (mut sink, mut stream) = socket.split();

    // Initial handshake: our SyncStep1, then the full awareness state.
    // One protocol message per websocket frame — y-websocket clients only
    // process the first message of each frame.
    let hello: Vec<Vec<u8>> = {
        let awareness = room.awareness.lock().unwrap();
        let sv = awareness.doc().transact().state_vector();
        let mut frames = vec![Message::Sync(SyncMessage::SyncStep1(sv)).encode_v1()];
        if let Ok(update) = awareness.update() {
            frames.push(Message::Awareness(update).encode_v1());
        }
        frames
    };
    for frame in hello {
        if sink.send(WsMessage::Binary(frame.into())).await.is_err() {
            cleanup(&room, conn_id, &HashSet::new());
            return;
        }
    }

    // Awareness client ids seen on this connection, cleared on disconnect.
    let mut my_clients: HashSet<yrs::block::ClientID> = HashSet::new();

    loop {
        tokio::select! {
            frame = rx.recv() => match frame {
                Ok(Frame { from, payload }) if from != conn_id => {
                    if sink.send(WsMessage::Binary(payload.into())).await.is_err() {
                        break;
                    }
                }
                Ok(_) => {}
                Err(tokio::sync::broadcast::error::RecvError::Lagged(n)) => {
                    tracing::warn!(room = %room.id, conn_id, lagged = n, "slow consumer; resyncing");
                    // Force a full resync rather than dropping updates silently.
                    let msg = {
                        let awareness = room.awareness.lock().unwrap();
                        let txn = awareness.doc().transact();
                        let update = txn.encode_state_as_update_v1(&yrs::StateVector::default());
                        Message::Sync(SyncMessage::Update(update)).encode_v1()
                    };
                    if sink.send(WsMessage::Binary(msg.into())).await.is_err() {
                        break;
                    }
                }
                Err(_) => break,
            },
            incoming = stream.next() => match incoming {
                Some(Ok(WsMessage::Binary(data))) => {
                    if let Some(replies) = handle_payload(&room, conn_id, &data, &mut my_clients) {
                        for reply in replies {
                            if sink.send(WsMessage::Binary(reply.into())).await.is_err() {
                                cleanup(&room, conn_id, &my_clients);
                                return;
                            }
                        }
                    }
                }
                Some(Ok(WsMessage::Close(_))) | None => break,
                Some(Ok(_)) => {}
                Some(Err(_)) => break,
            },
        }
    }
    cleanup(&room, conn_id, &my_clients);
}

/// Decode and process every protocol message in one websocket payload.
/// Returns direct replies for this connection; broadcasts to peers as a side effect.
fn handle_payload(
    room: &Room,
    conn_id: usize,
    data: &[u8],
    my_clients: &mut HashSet<yrs::block::ClientID>,
) -> Option<Vec<Vec<u8>>> {
    let mut decoder = DecoderV1::new(Cursor::new(data));
    let mut replies = Vec::new();
    let mut awareness = room.awareness.lock().unwrap();

    for msg in MessageReader::new(&mut decoder) {
        let msg = match msg {
            Ok(m) => m,
            Err(e) => {
                tracing::warn!(room = %room.id, conn_id, error = %e, "bad message");
                break;
            }
        };
        match msg {
            Message::Sync(SyncMessage::SyncStep1(sv)) => {
                let txn = awareness.doc().transact();
                let update = txn.encode_state_as_update_v1(&sv);
                replies.push(Message::Sync(SyncMessage::SyncStep2(update)).encode_v1());
            }
            Message::Sync(SyncMessage::SyncStep2(update))
            | Message::Sync(SyncMessage::Update(update)) => {
                match Update::decode_v1(&update) {
                    Ok(decoded) => {
                        let mut txn = awareness.doc().transact_mut();
                        if let Err(e) = txn.apply_update(decoded) {
                            tracing::warn!(room = %room.id, error = %e, "apply_update failed");
                            continue;
                        }
                        drop(txn);
                        room.mark_dirty();
                        let frame = Message::Sync(SyncMessage::Update(update)).encode_v1();
                        let _ = room.tx.send(Frame { from: conn_id, payload: frame });
                    }
                    Err(e) => tracing::warn!(room = %room.id, error = %e, "bad update"),
                }
            }
            Message::Awareness(update) => {
                my_clients.extend(update.clients.keys().copied());
                if awareness.apply_update(update.clone()).is_ok() {
                    room.touch();
                    let frame = Message::Awareness(update).encode_v1();
                    let _ = room.tx.send(Frame { from: conn_id, payload: frame });
                }
            }
            Message::AwarenessQuery => {
                if let Ok(update) = awareness.update() {
                    replies.push(Message::Awareness(update).encode_v1());
                }
            }
            Message::Auth(_) | Message::Custom(..) => {}
        }
    }
    Some(replies)
}

fn cleanup(room: &Room, conn_id: usize, my_clients: &HashSet<yrs::block::ClientID>) {
    // Announce departure: remove this connection's awareness clients and broadcast.
    if !my_clients.is_empty() {
        let mut awareness = room.awareness.lock().unwrap();
        for &client in my_clients {
            awareness.remove_state(client);
        }
        if let Ok(update) = awareness.update_with_clients(my_clients.iter().copied()) {
            let frame = Message::Awareness(update).encode_v1();
            let _ = room.tx.send(Frame { from: conn_id, payload: frame });
        }
    }
    room.connections.fetch_sub(1, Ordering::Relaxed);
    room.touch();
}
