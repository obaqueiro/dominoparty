use std::time::Duration;

#[derive(Debug, Clone)]
pub struct Config {
    pub port: u16,
    pub db_path: String,
    pub static_dir: String,
    /// How often dirty rooms are flushed to SQLite.
    pub flush_interval: Duration,
    /// How long an empty room stays in memory before being flushed + evicted.
    pub idle_evict_after: Duration,
    /// Rooms untouched for this many days are pruned from SQLite (0 = never).
    pub prune_after_days: u64,
}

impl Config {
    pub fn from_env() -> Self {
        fn var(name: &str) -> Option<String> {
            std::env::var(name).ok().filter(|s| !s.is_empty())
        }
        Config {
            port: var("PORT").and_then(|v| v.parse().ok()).unwrap_or(3000),
            db_path: var("DB_PATH").unwrap_or_else(|| "dominoparty.db".into()),
            static_dir: var("STATIC_DIR").unwrap_or_else(|| "static".into()),
            flush_interval: Duration::from_secs(
                var("FLUSH_INTERVAL_SECS").and_then(|v| v.parse().ok()).unwrap_or(10),
            ),
            idle_evict_after: Duration::from_secs(
                var("IDLE_EVICT_SECS").and_then(|v| v.parse().ok()).unwrap_or(600),
            ),
            prune_after_days: var("PRUNE_AFTER_DAYS").and_then(|v| v.parse().ok()).unwrap_or(30),
        }
    }
}
