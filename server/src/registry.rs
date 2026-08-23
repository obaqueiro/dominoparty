use std::sync::atomic::Ordering;
use std::sync::Arc;

use dashmap::DashMap;

use crate::persistence::Persistence;
use crate::room::Room;

pub struct Registry {
    rooms: DashMap<String, Arc<Room>>,
    persistence: Persistence,
}

impl Registry {
    pub fn new(persistence: Persistence) -> Self {
        Registry { rooms: DashMap::new(), persistence }
    }

    /// Get the in-memory room, lazily restoring it from SQLite (or creating it empty).
    pub fn get_or_load(&self, id: &str) -> Arc<Room> {
        if let Some(room) = self.rooms.get(id) {
            return room.clone();
        }
        // entry() serializes concurrent loads of the same room.
        self.rooms
            .entry(id.to_string())
            .or_insert_with(|| {
                let snapshot = self
                    .persistence
                    .load_room(id)
                    .unwrap_or_else(|e| {
                        tracing::error!(room = id, error = %e, "failed to load snapshot");
                        None
                    });
                tracing::info!(room = id, restored = snapshot.is_some(), "room loaded");
                Arc::new(Room::new(id.to_string(), snapshot.as_deref()))
            })
            .clone()
    }

    pub fn flush_dirty(&self) {
        for entry in self.rooms.iter() {
            let room = entry.value();
            if room.take_dirty() {
                let blob = room.encode_snapshot();
                if let Err(e) = self.persistence.save_room(&room.id, &blob) {
                    tracing::error!(room = %room.id, error = %e, "flush failed");
                    room.mark_dirty();
                }
            }
        }
    }

    /// Flush everything (dirty or not) — used on shutdown.
    pub fn flush_all(&self) {
        for entry in self.rooms.iter() {
            let room = entry.value();
            room.take_dirty();
            let blob = room.encode_snapshot();
            if let Err(e) = self.persistence.save_room(&room.id, &blob) {
                tracing::error!(room = %room.id, error = %e, "shutdown flush failed");
            }
        }
    }

    /// Evict rooms with no connections that have been idle longer than the threshold.
    pub fn evict_idle(&self, idle_after: std::time::Duration) {
        let victims: Vec<String> = self
            .rooms
            .iter()
            .filter(|e| {
                e.value().connections.load(Ordering::Relaxed) == 0
                    && e.value().idle_for() > idle_after
            })
            .map(|e| e.key().clone())
            .collect();
        for id in victims {
            if let Some((_, room)) = self.rooms.remove(&id) {
                let blob = room.encode_snapshot();
                if let Err(e) = self.persistence.save_room(&room.id, &blob) {
                    tracing::error!(room = %room.id, error = %e, "evict flush failed");
                }
                tracing::info!(room = %id, "room evicted");
            }
        }
    }

    pub fn persistence(&self) -> &Persistence {
        &self.persistence
    }
}
