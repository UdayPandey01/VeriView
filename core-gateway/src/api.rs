use axum::Json;
use axum::extract::State;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::sync::{Arc, Mutex};

#[derive(Clone, Serialize, Debug)]
pub struct LogEntry {
    pub timestamp: String,
    pub url: String,
    pub phase: String,
    pub message: String,
    pub risk_score: u8,
}

pub type LogStore = Arc<Mutex<Vec<LogEntry>>>;

pub fn new_log_store() -> LogStore {
    Arc::new(Mutex::new(Vec::new()))
}

fn now_timestamp() -> String {
    chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string()
}

fn push_log(store: &LogStore, url: &str, phase: &str, message: &str, risk: u8) {
    let entry = LogEntry {
        timestamp: now_timestamp(),
        url: url.to_string(),
        phase: phase.to_string(),
        message: message.to_string(),
        risk_score: risk,
    };
    println!(
        "[{}] {} | {} | risk={}",
        entry.phase, entry.url, entry.message, risk
    );
    if let Ok(mut logs) = store.lock() {
        logs.push(entry);
        if logs.len() > 500 {
            logs.drain(0..100);
        }
    }
}

const DANGER_KEYWORDS: &[&str] = &[
    "transfer",
    "override",
    "ignore",
    "execute",
    "password",
    "confirm",
    "sudo",
    "admin",
    "system override",
    "ignore previous",
];

#[derive(Deserialize, Debug)]
pub struct DomNode {
    pub text: String,
    pub tag: String,
    pub interactive: bool,
    pub vv_id: Option<String>,
    pub occluded: Option<bool>,
}

#[derive(Deserialize, Debug)]
pub struct SuspiciousNode {
    pub text: String,
    pub tag: String,
    pub reasons: String,
}

#[derive(Deserialize, Debug)]
struct BrowserResponse {
    clean_dom: Vec<DomNode>,
    suspicious_nodes: Option<Vec<SuspiciousNode>>,
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
    pub interactive_elements: Vec<InteractiveElement>,
    pub risk_score: u8,
    pub blocked: bool,
    pub logs: Vec<String>,
}

#[derive(Serialize, Debug)]
pub struct InteractiveElement {
    pub vv_id: String,
    pub tag: String,
    pub text: String,
}

pub async fn secure_navigate(
    State(store): State<LogStore>,
    Json(payload): Json<NavigateRequest>,
) -> Json<NavigateResponse> {
    let url = &payload.url;
    let client = reqwest::Client::new();
    let mut logs: Vec<String> = vec![];

    push_log(&store, url, "Phase 1", "Handshake initiated", 0);
    logs.push("Phase 1: Handshake initiated".to_string());

    let browser_res = client
        .post("http://localhost:3002/snap")
        .json(&json!({ "url": url }))
        .send()
        .await;

    let browser_data: BrowserResponse = match browser_res {
        Ok(res) => res.json().await.unwrap_or(BrowserResponse {
            clean_dom: vec![],
            suspicious_nodes: None,
            screenshot_b64: "".into(),
        }),
        Err(e) => {
            let msg = format!("Browser Service failed: {}", e);
            push_log(&store, url, "Phase 2", &msg, 100);
            return Json(NavigateResponse {
                safe_snapshot: vec![],
                interactive_elements: vec![],
                risk_score: 100,
                blocked: true,
                logs: vec![msg],
            });
        }
    };

    let dom_count = browser_data.clean_dom.len();
    let suspicious_count = browser_data
        .suspicious_nodes
        .as_ref()
        .map_or(0, |s| s.len());
    let msg = format!(
        "{} clean DOM nodes, {} suspicious nodes detected",
        dom_count, suspicious_count
    );
    push_log(&store, url, "Phase 2", &msg, 0);
    logs.push(format!("Phase 2: {}", msg));

    if suspicious_count > 0 {
        push_log(
            &store,
            url,
            "Phase 2",
            &format!(
                "SUSPICIOUS: {} hidden/invisible elements found in DOM",
                suspicious_count
            ),
            50,
        );
        logs.push(format!(
            "Phase 2 WARNING: {} hidden/invisible DOM elements found",
            suspicious_count
        ));
    }

    let interactive_elements: Vec<InteractiveElement> = browser_data
        .clean_dom
        .iter()
        .filter_map(|node| {
            if node.interactive {
                node.vv_id.as_ref().map(|id| InteractiveElement {
                    vv_id: id.clone(),
                    tag: node.tag.clone(),
                    text: node.text.clone(),
                })
            } else {
                None
            }
        })
        .collect();

    logs.push(format!(
        "Phase 2: Found {} interactive elements with VV-IDs",
        interactive_elements.len()
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

    push_log(
        &store,
        url,
        "Phase 3",
        "Sending to Vision Service (OCR + Gemini)",
        0,
    );

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

    if let Some(ref ocr_text) = vision_data.ocr_text {
        logs.push(format!(
            "Phase 3: OCR extracted {} text items",
            ocr_text.len()
        ));
    }

    if let Some(ref reason) = vision_data.reason {
        logs.push(format!("Phase 3: Gemini says - {}", reason));
        push_log(
            &store,
            url,
            "Phase 3",
            &format!("Gemini: {}", reason),
            vision_data.risk_score.unwrap_or(0),
        );
    }

    let mut hidden_threats: Vec<String> = vec![];

    if let Some(ref suspicious) = browser_data.suspicious_nodes {
        for node in suspicious {
            let lower = node.text.to_lowercase();
            for keyword in DANGER_KEYWORDS {
                if lower.contains(keyword) {
                    hidden_threats.push(format!(
                        "[{}] ({}) \"{}\"",
                        node.tag,
                        node.reasons,
                        node.text.chars().take(120).collect::<String>()
                    ));
                    break;
                }
            }
        }
    }

    let mut risk_score = vision_data.risk_score.unwrap_or(0);

    if !hidden_threats.is_empty() {
        risk_score = 100;
        let msg = format!("GHOST TEXT DETECTED: {:?}", hidden_threats);
        push_log(&store, url, "Phase 3", &msg, 100);
        logs.push(format!("Phase 3 ALERT: {}", msg));
    } else {
        push_log(
            &store,
            url,
            "Phase 3",
            "Visual Air-Gap verified. No ghost text.",
            risk_score,
        );
        logs.push("Phase 3: Visual Air-Gap verified. No ghost text.".to_string());
    }

    if vision_data.injection_attempt {
        risk_score = 100;
        push_log(
            &store,
            url,
            "Phase 3",
            "Visual Prompt Injection detected by Gemini",
            100,
        );
        logs.push("Phase 3 ALERT: Visual Prompt Injection detected.".to_string());
    }

    let blocked = risk_score > 50;

    if blocked {
        push_log(
            &store,
            url,
            "Phase 4",
            &format!("BLOCKED. Risk score: {}", risk_score),
            risk_score,
        );
        logs.push(format!("Phase 4: BLOCKED. Risk score: {}", risk_score));
    } else {
        push_log(
            &store,
            url,
            "Phase 4",
            "Safe Snapshot delivered to Agent",
            risk_score,
        );
        logs.push("Phase 4: Safe Snapshot delivered to Agent.".to_string());
    }

    let safe_snapshot = if blocked {
        vec!["BLOCKED BY VERIVIEW".to_string()]
    } else if vision_data.visible_text.is_empty() {
        // Fallback to DOM preview if vision service returns empty
        dom_preview
    } else {
        vision_data.visible_text
    };

    Json(NavigateResponse {
        safe_snapshot,
        interactive_elements,
        risk_score,
        blocked,
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

pub async fn receive_alert(
    State(store): State<LogStore>,
    Json(payload): Json<AlertRequest>,
) -> Json<AlertResponse> {
    push_log(
        &store,
        &payload.url,
        "Watchdog",
        &format!("{}: {}", payload.alert_type, payload.details),
        50,
    );
    Json(AlertResponse {
        status: "received".to_string(),
        message: "Alert logged".to_string(),
    })
}

pub async fn get_logs(State(store): State<LogStore>) -> Json<Vec<LogEntry>> {
    let logs = store.lock().unwrap_or_else(|e| e.into_inner());
    Json(logs.clone())
}
