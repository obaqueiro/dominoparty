use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::Mutex;
use std::time::Instant;

use tokio::sync::broadcast;
use yrs::sync::Awareness;
use yrs::updates::decoder::Decode;
use yrs::{Doc, ReadTxn, StateVector, Transact, Update};

/// A broadcast frame: pre-encoded protocol message plus the id of the
/// connection that produced it (so it can skip its own echo).
#[derive(Clone)]
pub struct Frame {
    pub from: usize,
    pub payload: Vec<u8>,
}

pub struct Room {
    pub id: String,
    /// Awareness owns the yrs Doc. Sync mutex: all doc operations are short and CPU-bound.
    pub awareness: Mutex<Awareness>,
    pub tx: broadcast::Sender<Frame>,
    pub dirty: AtomicBool,
    pub connections: AtomicUsize,
    pub last_active: Mutex<Instant>,
}

impl Room {
    pub fn new(id: String, snapshot: Option<&[u8]>) -> Self {
        let doc = Doc::new();
        if let Some(blob) = snapshot {
            if let Ok(update) = Update::decode_v1(blob) {
                let _ = doc.transact_mut().apply_update(update);
            } else {
                tracing::warn!(room = %id, "corrupt snapshot ignored; starting empty");
            }
        }
        let (tx, _) = broadcast::channel(256);
        Room {
            id,
            awareness: Mutex::new(Awareness::new(doc)),
            tx,
            dirty: AtomicBool::new(false),
            connections: AtomicUsize::new(0),
            last_active: Mutex::new(Instant::now()),
        }
    }

    pub fn encode_snapshot(&self) -> Vec<u8> {
        let awareness = self.awareness.lock().unwrap();
        let txn = awareness.doc().transact();
        txn.encode_state_as_update_v1(&StateVector::default())
    }

    pub fn mark_dirty(&self) {
        self.dirty.store(true, Ordering::Relaxed);
        *self.last_active.lock().unwrap() = Instant::now();
    }

    pub fn take_dirty(&self) -> bool {
        self.dirty.swap(false, Ordering::Relaxed)
    }

    pub fn touch(&self) {
        *self.last_active.lock().unwrap() = Instant::now();
    }

    pub fn idle_for(&self) -> std::time::Duration {
        self.last_active.lock().unwrap().elapsed()
    }
}
