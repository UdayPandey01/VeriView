mod api;
mod policy;

use axum::{
    Router, middleware,
    routing::{get, post},
};

use std::net::SocketAddr;
use tower_http::cors::CorsLayer;

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt::init();

    let http_timeout_secs = std::env::var("HTTP_TIMEOUT_SECS")
        .ok()
        .and_then(|v| v.parse::<u64>().ok())
        .unwrap_or(180);

    let http_client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(http_timeout_secs))
        .pool_max_idle_per_host(20)
        .build()
        .expect("Failed to build HTTP client");

    let log_store = api::new_log_store();
    let redis_cache = init_redis_cache().await;
    let valid_api_keys = api::load_valid_api_keys();
    let state = api::AppState::new(log_store, redis_cache, valid_api_keys, http_client);

    let navigate_route = Router::new()
        .route("/api/v1/navigate", post(api::secure_navigate))
        .route_layer(middleware::from_fn_with_state(
            state.clone(),
            api::auth_and_rate_limit,
        ));

    let app = Router::new()
        .route("/api/v1/health", get(health_check))
        .route("/api/v1/alert", post(api::receive_alert))
        .route("/api/v1/logs", get(api::get_logs))
        .merge(navigate_route)
        .layer(CorsLayer::permissive())
        .with_state(state);

    let addr = SocketAddr::from(([0, 0, 0, 0], 8082));
    println!("VeriView core gateway running on {}", addr);
    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .expect("Failed to bind port 8082");

    axum::serve(listener, app)
        .await
        .expect("Failed to start server");
}

async fn health_check() -> &'static str {
    "OK"
}

async fn init_redis_cache() -> Option<api::RedisCache> {
    let redis_url = std::env::var("REDIS_URL").unwrap_or_else(|_| "redis://127.0.0.1/".to_string());
    let redis_url = redis_url.trim().to_string();
    if redis_url.is_empty()
        || redis_url.eq_ignore_ascii_case("disabled")
        || redis_url.eq_ignore_ascii_case("off")
    {
        tracing::info!("Redis cache disabled (REDIS_URL is empty/off).");
        return None;
    }

    let client = match redis::Client::open(redis_url.clone()) {
        Ok(c) => c,
        Err(e) => {
            tracing::warn!("Redis client init failed for {}: {}", redis_url, e);
            return None;
        }
    };

    match client.get_multiplexed_async_connection().await {
        Ok(conn) => {
            tracing::info!("Redis cache enabled.");
            Some(api::RedisCache::new(conn))
        }
        Err(e) => {
            tracing::warn!("Redis connection failed (cache disabled): {}", e);
            None
        }
    }
}
