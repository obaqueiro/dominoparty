mod config;
mod persistence;
mod registry;
mod room;
mod ws;

use std::sync::Arc;
use std::time::Duration;

use axum::routing::{any, get};
use axum::Router;
use tower_http::services::{ServeDir, ServeFile};

use config::Config;
use persistence::Persistence;
use registry::Registry;

pub struct AppState {
    pub registry: Registry,
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "info".into()),
        )
        .init();

    let cfg = Config::from_env();
    let persistence = Persistence::open(&cfg.db_path).expect("failed to open SQLite db");
    let state = Arc::new(AppState { registry: Registry::new(persistence) });

    // Background maintenance: debounced flush, idle eviction, daily prune.
    {
        let state = state.clone();
        let cfg = cfg.clone();
        tokio::spawn(async move {
            let mut flush = tokio::time::interval(cfg.flush_interval);
            let mut prune = tokio::time::interval(Duration::from_secs(86_400));
            loop {
                tokio::select! {
                    _ = flush.tick() => {
                        let s = state.clone();
                        let idle = cfg.idle_evict_after;
                        tokio::task::spawn_blocking(move || {
                            s.registry.flush_dirty();
                            s.registry.evict_idle(idle);
                        }).await.ok();
                    }
                    _ = prune.tick() => {
                        let s = state.clone();
                        let days = cfg.prune_after_days;
                        tokio::task::spawn_blocking(move || {
                            match s.registry.persistence().prune_rooms_older_than_days(days) {
                                Ok(n) if n > 0 => tracing::info!(pruned = n, "pruned stale rooms"),
                                Ok(_) => {}
                                Err(e) => tracing::error!(error = %e, "prune failed"),
                            }
                        }).await.ok();
                    }
                }
            }
        });
    }

    let index = format!("{}/index.html", cfg.static_dir);
    let app = Router::new()
        .route("/health", get(|| async { "ok" }))
        .route("/ws/{room}", any(ws::ws_handler))
        .fallback_service(ServeDir::new(&cfg.static_dir).fallback(ServeFile::new(index)))
        .with_state(state.clone());

    let addr = format!("0.0.0.0:{}", cfg.port);
    let listener = tokio::net::TcpListener::bind(&addr).await.expect("bind failed");
    tracing::info!(%addr, db = %cfg.db_path, "dominoparty server listening");

    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await
        .expect("server error");

    tracing::info!("shutting down: flushing all rooms");
    let s = state.clone();
    tokio::task::spawn_blocking(move || s.registry.flush_all()).await.ok();
}

async fn shutdown_signal() {
    let ctrl_c = tokio::signal::ctrl_c();
    #[cfg(unix)]
    {
        let mut term = tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
            .expect("failed to install SIGTERM handler");
        tokio::select! {
            _ = ctrl_c => {},
            _ = term.recv() => {},
        }
    }
    #[cfg(not(unix))]
    ctrl_c.await.ok();
}
