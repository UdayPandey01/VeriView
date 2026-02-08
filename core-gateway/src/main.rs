mod api;
mod policy;

use axum::{
    Router,
    routing::{get, post},
};

use std::net::SocketAddr;
use tower_http::cors::CorsLayer;

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt::init();
    println!("VeriView core gateway is starting in port 8082...");

    let app = Router::new()
        .route("/api/v1/health", get(health_check))
        .route("/api/v1/navigate", post(api::secure_navigate))
        .route("/api/v1/alert", post(api::receive_alert))
        .layer(CorsLayer::permissive());

    let addr = SocketAddr::from(([0, 0, 0, 0], 8082));
    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();

    axum::serve(listener, app).await.unwrap();
}

async fn health_check() -> &'static str {
    "OK"
}