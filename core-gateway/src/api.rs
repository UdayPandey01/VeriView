use axum::Json;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::collections::HashSet;

#[derive(Deserialize, Debug)]
pub struct DomNode {
    text: String,
    tag: String,
    interactive: bool,
}

#[derive(Deserialize, Debug)]
struct BrowserResponse {
    clean_dom: Vec<DomNode>,
    screenshot_b64: String,
}

#[derive(Deserialize, Debug)]
struct VisionResponse {
    visible_text: Vec<String>,
    injection_attempt: bool,
    risk_score: Option<u8>,
    reason: Option<String>,
    ocr_text: Option<Vec<String>>,
}

#[derive(Deserialize, Debug)]
pub struct NavigateRequest {
    pub url: String,
}

#[derive(Serialize, Debug)]
pub struct NavigateResponse {
    pub safe_snapshot: Vec<String>,
    pub risk_score: u8,
    pub logs: Vec<String>,
}

pub async fn secure_navigate(Json(payload): Json<NavigateRequest>) -> Json<NavigateResponse> {
    println!("Starting 5-Layer Pipeline for: {}", payload.url);
    let client = reqwest::Client::new();
    let mut logs = vec![];

    logs.push("Phase 1: Handshake initiated...".to_string());

    let browser_res = client
        .post("http://localhost:3002/snap")
        .json(&json!({ "url": payload.url }))
        .send()
        .await;

    let browser_data: BrowserResponse = match browser_res {
        Ok(res) => res.json().await.unwrap_or(BrowserResponse {
            clean_dom: vec![],
            screenshot_b64: "".into(),
        }),
        Err(_) => {
            return Json(NavigateResponse {
                safe_snapshot: vec![],
                risk_score: 100,
                logs: vec!["Browser Service Failed".into()],
            });
        }
    };

    logs.push(format!(
        "Phase 2: Speed Trap passed. {} DOM nodes survived sanitization.",
        browser_data.clean_dom.len()
    ));

    let dom_preview: Vec<String> = browser_data
        .clean_dom
        .iter()
        .filter_map(|node| {
            let text = node.text.trim();
            if !text.is_empty() && text.len() > 2 {
                Some(text.to_string())
            } else {
                None
            }
        })
        .take(50)
        .collect();

    logs.push(format!(
        "Phase 2.5: Extracted {} DOM text items for Vision comparison",
        dom_preview.len()
    ));

    let vision_res = client
        .post("http://localhost:5000/analyze")
        .json(&json!({
            "image": browser_data.screenshot_b64,
            "dom_preview": dom_preview
        }))
        .send()
        .await;

    let vision_data: VisionResponse = match vision_res {
        Ok(res) => res.json().await.unwrap_or(VisionResponse {
            visible_text: vec![],
            injection_attempt: false,
            risk_score: None,
            reason: None,
            ocr_text: None,
        }),
        Err(_) => VisionResponse {
            visible_text: vec![],
            injection_attempt: false,
            risk_score: None,
            reason: None,
            ocr_text: None,
        },
    };

    let mut dom_text_set: HashSet<String> = HashSet::new();
    for node in &browser_data.clean_dom {
        if !node.text.is_empty() {
            dom_text_set.insert(node.text.trim().to_lowercase());
        }
    }

    let mut vision_text_set: HashSet<String> = HashSet::new();
    for text in &vision_data.visible_text {
        vision_text_set.insert(text.trim().to_lowercase());
    }

    let mut hidden_threats = vec![];
    for dom_text in &dom_text_set {
        let is_visible = vision_text_set
            .iter()
            .any(|v| v.contains(dom_text) || dom_text.contains(v));

        if !is_visible {
            if dom_text.contains("transfer")
                || dom_text.contains("password")
                || dom_text.contains("confirm")
            {
                hidden_threats.push(dom_text.clone());
            }
        }
    }

    let mut risk_score = vision_data.risk_score.unwrap_or(0);

    if let Some(ref ocr_text) = vision_data.ocr_text {
        logs.push(format!(
            "Phase 3: OCR extracted {} text items",
            ocr_text.len()
        ));
    }

    if let Some(ref reason) = vision_data.reason {
        logs.push(format!("Phase 3: Gemini Analysis - {}", reason));
    }

    if !hidden_threats.is_empty() {
        risk_score = risk_score.max(100);
        logs.push(format!(
            "Phase 3 ALERT: Hidden Threats Detected (Ghost Text): {:?}",
            hidden_threats
        ));
    } else {
        logs.push("Phase 3: Visual Air-Gap Verified. No hidden ghost text.".to_string());
    }

    if vision_data.injection_attempt {
        risk_score = 100;
        logs.push("Phase 3 ALERT: Visual Prompt Injection detected.".to_string());
    }

    let safe_snapshot = vision_data.visible_text;

    logs.push("Phase 4: Safe Snapshot delivered to Agent.".to_string());

    Json(NavigateResponse {
        safe_snapshot,
        risk_score,
        logs,
    })
}

#[derive(Deserialize, Debug)]
pub struct AlertRequest {
    url: String,
    alert_type: String,
    details: String,
}

#[derive(Serialize, Debug)]
pub struct AlertResponse {
    status: String,
    message: String,
}

pub async fn receive_alert(Json(payload): Json<AlertRequest>) -> Json<AlertResponse> {
    println!(
        "ALERT RECEIVED: {} - {} - {}",
        payload.alert_type, payload.url, payload.details
    );

    Json(AlertResponse {
        status: "received".to_string(),
        message: "Alert logged successfully".to_string(),
    })
}
