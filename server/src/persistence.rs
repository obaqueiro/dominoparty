use rusqlite::{params, Connection};
use std::path::Path;
use std::sync::{Arc, Mutex};

/// SQLite is a backup/restore store only: rooms live in memory (yrs docs) and are
/// written here as full-state update blobs on debounced flush, eviction and shutdown.
#[derive(Clone)]
pub struct Persistence {
    conn: Arc<Mutex<Connection>>,
}

impl Persistence {
    pub fn open(path: impl AsRef<Path>) -> rusqlite::Result<Self> {
        let conn = Connection::open(path)?;
        conn.pragma_update(None, "journal_mode", "WAL")?;
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS rooms (
                id TEXT PRIMARY KEY,
                doc BLOB NOT NULL,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS sessions (
                client_id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                last_seen INTEGER NOT NULL
            );",
        )?;
        Ok(Self { conn: Arc::new(Mutex::new(conn)) })
    }

    pub fn save_room(&self, id: &str, doc_update: &[u8]) -> rusqlite::Result<()> {
        let now = unix_now();
        self.conn.lock().unwrap().execute(
            "INSERT INTO rooms (id, doc, created_at, updated_at) VALUES (?1, ?2, ?3, ?3)
             ON CONFLICT(id) DO UPDATE SET doc = ?2, updated_at = ?3",
            params![id, doc_update, now],
        )?;
        Ok(())
    }

    pub fn load_room(&self, id: &str) -> rusqlite::Result<Option<Vec<u8>>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare("SELECT doc FROM rooms WHERE id = ?1")?;
        let mut rows = stmt.query(params![id])?;
        match rows.next()? {
            Some(row) => Ok(Some(row.get(0)?)),
            None => Ok(None),
        }
    }

    pub fn touch_session(&self, client_id: &str, name: &str) -> rusqlite::Result<()> {
        self.conn.lock().unwrap().execute(
            "INSERT INTO sessions (client_id, name, last_seen) VALUES (?1, ?2, ?3)
             ON CONFLICT(client_id) DO UPDATE SET name = ?2, last_seen = ?3",
            params![client_id, name, unix_now()],
        )?;
        Ok(())
    }

    pub fn prune_rooms_older_than_days(&self, days: u64) -> rusqlite::Result<usize> {
        if days == 0 {
            return Ok(0);
        }
        let cutoff = unix_now() - (days as i64) * 86_400;
        self.conn
            .lock()
            .unwrap()
            .execute("DELETE FROM rooms WHERE updated_at < ?1", params![cutoff])
    }
}

fn unix_now() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64
}

#[cfg(test)]
mod tests {
    use super::*;
    use yrs::updates::decoder::Decode;
    use yrs::{Doc, GetString, ReadTxn, StateVector, Text, Transact, Update};

    #[test]
    fn room_roundtrip() {
        let p = Persistence::open(":memory:").unwrap();
        let doc = Doc::new();
        let text = doc.get_or_insert_text("t");
        text.insert(&mut doc.transact_mut(), 0, "hello");
        let blob = doc.transact().encode_state_as_update_v1(&StateVector::default());

        p.save_room("room1", &blob).unwrap();
        let loaded = p.load_room("room1").unwrap().unwrap();

        let doc2 = Doc::new();
        doc2.transact_mut().apply_update(Update::decode_v1(&loaded).unwrap()).unwrap();
        let text2 = doc2.get_or_insert_text("t");
        assert_eq!(text2.get_string(&doc2.transact()), "hello");
        assert!(p.load_room("missing").unwrap().is_none());
    }
}
