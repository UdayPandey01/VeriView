use crate::policy;
use axum::Json;
use serde::{Deserialize, Serialize};

#[derive(Deserialize)]
pub struct NavigateRequest {
    pub url: String,
}

#[derive(Serialize)]
pub struct NavigateResponse {
    pub clean_html: String,
    pub risk_score: u8,
    pub reason: String,
}

#[derive(Deserialize, Debug)]
struct BrowserResponse {
    dom: String,
    screenshot_b64: String,
}

#[derive(Deserialize, Debug)]
struct VisionResponse {
    visible_text: Vec<String>,
    _bad_images: Vec<String>,
}

pub async fn secure_navigate(Json(payload): Json<NavigateRequest>) -> Json<NavigateResponse> {
    println!("Analyzing URL: {}", payload.url);

    let client = reqwest::Client::new();

    let browser_res = client
        .post("http://browser-service:3000/snap")
        .json(&serde_json::json!({ "url": payload.url }))
        .send()
        .await;

    let browser_data: BrowserResponse = match browser_res {
        Ok(res) => res.json().await.unwrap_or(BrowserResponse {
            dom: "<html>Error</html>".to_string(),
            screenshot_b64: "".to_string(),
        }),
        Err(_) => {
            return Json(NavigateResponse {
                clean_html: "".to_string(),
                risk_score: 100,
                reason: "Browser Service Unavailable".to_string(),
            });
        }
    };

    let vision_res = client
        .post("http://vision-service:5000/analyze")
        .json(&serde_json::json!({ "image": browser_data.screenshot_b64 }))
        .send()
        .await;

    let vision_data: VisionResponse = match vision_res {
        Ok(res) => res.json().await.unwrap_or(VisionResponse {
            visible_text: vec![],
            _bad_images: vec![],
        }),
        Err(_) => VisionResponse {
            visible_text: vec![],
            _bad_images: vec![],
        },
    };

    let (safe_html, risk, logs) =
        policy::sanitize_dom(&browser_data.dom, &vision_data.visible_text);

    Json(NavigateResponse {
        clean_html: safe_html,
        risk_score: risk,
        reason: logs,
    })
}
