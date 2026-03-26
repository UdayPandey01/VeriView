use axum::{
    Json,
    extract::State,
    http::{Request, StatusCode},
    middleware::Next,
    response::{IntoResponse, Response},
};
use redis::AsyncCommands;
use serde::{Deserialize, Serialize};
use serde_json::json;
use sha2::{Digest, Sha256};
use std::collections::HashSet;
use std::sync::{Arc, Mutex};
use tokio::sync::Mutex as TokioMutex;

#[derive(Clone, Serialize, Debug)]
pub struct LogEntry {
    pub timestamp: String,
    pub url: String,
    pub phase: String,
    pub message: String,
    pub risk_score: u8,
}

pub type LogStore = Arc<Mutex<Vec<LogEntry>>>;

#[derive(Clone)]
pub struct RedisCache {
    conn: Arc<TokioMutex<redis::aio::MultiplexedConnection>>,
}

impl RedisCache {
    pub fn new(conn: redis::aio::MultiplexedConnection) -> Self {
        Self {
            conn: Arc::new(TokioMutex::new(conn)),
        }
    }
}

#[derive(Clone)]
pub struct AppState {
    pub log_store: LogStore,
    pub redis: Option<RedisCache>,
    pub valid_api_keys: HashSet<String>,
    pub http_client: reqwest::Client,
}

impl AppState {
    pub fn new(
        log_store: LogStore,
        redis: Option<RedisCache>,
        valid_api_keys: HashSet<String>,
        http_client: reqwest::Client,
    ) -> Self {
        Self {
            log_store,
            redis,
            valid_api_keys,
            http_client,
        }
    }
}

pub fn load_valid_api_keys() -> HashSet<String> {
    let keys: HashSet<String> = std::env::var("VALID_API_KEYS")
        .unwrap_or_else(|_| String::new())
        .split(',')
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect();
    if keys.is_empty() {
        tracing::warn!(
            "VALID_API_KEYS is empty; /api/v1/navigate will reject all requests with 401"
        );
    }
    keys
}

const RATE_LIMIT_MAX: i64 = 60;
const RATE_LIMIT_WINDOW_SECS: u64 = 60;

fn api_key_redis_id(api_key: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(api_key.as_bytes());
    let digest = hasher.finalize();
    digest
        .iter()
        .map(|b| format!("{:02x}", b))
        .collect::<String>()
}

async fn check_rate_limit(state: &AppState, api_key: &str) -> Result<bool, ()> {
    let Some(redis_cache) = state.redis.as_ref() else {
        tracing::error!("Rate limit: Redis unavailable; failing open (allowing request)");
        return Ok(true);
    };

    let minute = chrono::Utc::now().format("%Y%m%d%H%M").to_string();
    let id = api_key_redis_id(api_key);
    let key = format!("vv:ratelimit:{}:{}", id, minute);

    let mut conn = redis_cache.conn.lock().await;
    let count: i64 = match conn.incr(&key, 1i64).await {
        Ok(c) => c,
        Err(e) => {
            tracing::error!("Rate limit: Redis INCR failed; failing open: {}", e);
            return Err(());
        }
    };

    if count == 1 {
        let ttl = RATE_LIMIT_WINDOW_SECS as i64;
        if let Err(e) = conn.expire::<_, ()>(&key, ttl).await {
            tracing::warn!(
                "Rate limit: Redis EXPIRE failed (key may not expire): {}",
                e
            );
        }
    }

    Ok(count <= RATE_LIMIT_MAX)
}

pub async fn auth_and_rate_limit(
    State(state): State<AppState>,
    request: Request<axum::body::Body>,
    next: Next,
) -> Response {
    let auth = request
        .headers()
        .get("Authorization")
        .and_then(|v| v.to_str().ok());
    let token = match auth {
        Some(h) if h.starts_with("Bearer ") => h["Bearer ".len()..].trim(),
        _ => {
            return (
                StatusCode::UNAUTHORIZED,
                "Missing or invalid Authorization header",
            )
                .into_response();
        }
    };

    if !state.valid_api_keys.contains(token) {
        return (StatusCode::UNAUTHORIZED, "Invalid API key").into_response();
    }

    match check_rate_limit(&state, token).await {
        Ok(true) => {}
        Ok(false) => {
            return (StatusCode::TOO_MANY_REQUESTS, "Rate limit exceeded").into_response();
        }
        Err(()) => {
            tracing::error!("Rate limit check failed; failing open for /api/v1/navigate");
        }
    }

    next.run(request).await
}

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
    "ignore previous",
    "system override",
    "exfiltrate",
    "bypass security",
    "disregard instructions",
];

const CONTEXTUAL_KEYWORDS: &[&str] = &[
    "transfer",
    "execute",
    "run",
    "send",
    "extract",
    "private key",
    "seed phrase",
    "sudo",
    "wire transfer",
];

fn is_script_like_hidden_text(lower_text: &str) -> bool {
    if lower_text.contains("function(")
        || lower_text.contains("function ")
        || lower_text.contains("=>")
        || lower_text.contains(".execute(")
        || lower_text.contains(".run(")
        || lower_text.contains(".send(")
        || lower_text.contains(".transfer(")
        || lower_text.contains("window.")
        || lower_text.contains("document.")
        || lower_text.contains("console.")
        || lower_text.contains("Math.")
        || lower_text.contains("Object.")
        || lower_text.contains("Array.")
    {
        return true;
    }

    if lower_text.contains("var ")
        || lower_text.contains("let ")
        || lower_text.contains("const ")
        || lower_text.contains("return ")
        || lower_text.contains("throw ")
    {
        return true;
    }

    if lower_text.contains("onclick")
        || lower_text.contains("onsubmit")
        || lower_text.contains("onload")
        || lower_text.contains("onerror")
        || lower_text.contains("onchange")
    {
        return true;
    }

    if lower_text.contains("p.when(")
        || lower_text.contains("createcarousel(")
        || lower_text.contains("react.")
        || lower_text.contains("vue.")
        || lower_text.contains("angular.")
        || lower_text.contains("dispatch")
        || lower_text.contains("selector")
        || lower_text.contains("reducer")
    {
        return true;
    }

    if lower_text.contains("{\"")
        || lower_text.contains("[\"")
        || lower_text.contains("</script")
        || lower_text.starts_with('{')
        || lower_text.starts_with('[')
    {
        return true;
    }

    if lower_text.contains("analytics")
        || lower_text.contains("tracking")
        || lower_text.contains("pixel")
        || lower_text.contains("beacon")
        || lower_text.contains("telemetry")
        || lower_text.contains("sessionId")
        || lower_text.contains("userId")
        || lower_text.contains("deviceId")
    {
        return true;
    }

    if lower_text.contains("sr-only")
        || lower_text.contains("screen reader")
        || lower_text.contains("visually hidden")
        || lower_text.contains("accessible")
    {
        return true;
    }

    if lower_text.contains("tooltip")
        || lower_text.contains("dropdown")
        || lower_text.contains("modal")
        || lower_text.contains("accordion")
        || lower_text.contains("carousel")
        || lower_text.contains("slider")
        || lower_text.contains("tab")
        || lower_text.contains("menu")
        || lower_text.contains("navigation")
    {
        return true;
    }

    if lower_text.contains("-icon")
        || lower_text.contains("-btn")
        || lower_text.contains("-wrapper")
        || lower_text.contains("-container")
    {
        return true;
    }

    false
}

fn is_imperative_threat(text: &str, lower_text: &str) -> bool {
    if text.len() < 15 {
        return false;
    }

    let imperative_markers = [
        "you must",
        "you should",
        "you will",
        "do not",
        "dont",
        "ignore",
        "override",
        "bypass",
        "silently",
        "secretly",
        "immediately",
        "without asking",
        "confirm that",
        "make sure to",
    ];

    let has_imperative = imperative_markers.iter().any(|m| lower_text.contains(m));

    let threat_verbs = [
        "transfer",
        "send",
        "execute",
        "run",
        "extract",
        "exfiltrate",
        "delete",
        "modify",
        "change",
        "update",
        "create",
        "generate",
    ];

    let has_threat_verb = threat_verbs.iter().any(|v| lower_text.contains(v));

    let agent_targets = [
        "ai",
        "agent",
        "assistant",
        "bot",
        "model",
        "llm",
        "language model",
    ];

    let targets_agent = agent_targets.iter().any(|t| lower_text.contains(t));

    has_imperative && (has_threat_verb || targets_agent)
}

fn analyze_hidden_threat(text: &str, _reasons: &str) -> bool {
    let lower = text.to_lowercase();

    if is_script_like_hidden_text(&lower) {
        return false;
    }

    if text.len() < 20 {
        return false;
    }

    for keyword in DANGER_KEYWORDS {
        if lower.contains(keyword) {
            return true;
        }
    }

    for keyword in CONTEXTUAL_KEYWORDS {
        if lower.contains(keyword) {
            if is_imperative_threat(text, &lower) {
                return true;
            }
            if lower.starts_with(keyword) && text.len() > 30 {
                if is_imperative_threat(text, &lower) {
                    return true;
                }
            }
        }
    }

    let threat_patterns = [
        "transfer all funds",
        "transfer money to",
        "send money to",
        "execute this command",
        "run this code",
        "ignore all previous",
        "override all security",
        "bypass all checks",
        "do not reveal",
        "do not show",
        "hide this from",
        "keep this secret",
    ];

    for pattern in threat_patterns.iter() {
        if lower.contains(pattern) {
            return true;
        }
    }

    false
}

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
    session_id: String,
    clean_dom: Vec<DomNode>,
    suspicious_nodes: Option<Vec<SuspiciousNode>>,
    screenshot_id: String,
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

#[derive(Serialize, Deserialize, Debug)]
pub struct NavigateResponse {
    pub session_id: String,
    pub safe_snapshot: Vec<String>,
    pub interactive_elements: Vec<InteractiveElement>,
    pub risk_score: u8,
    pub blocked: bool,
    pub logs: Vec<String>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct InteractiveElement {
    pub vv_id: String,
    pub tag: String,
    pub text: String,
}

const CACHE_TTL_SECONDS: u64 = 60;

fn url_cache_key(url: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(url.as_bytes());
    let digest = hasher.finalize();
    let hex = digest
        .iter()
        .map(|b| format!("{:02x}", b))
        .collect::<String>();
    format!("vv:url:{}", hex)
}

async fn redis_cache_get(state: &AppState, key: &str) -> Option<NavigateResponse> {
    let redis_cache = state.redis.as_ref()?;
    let mut conn = redis_cache.conn.lock().await;
    let cached: Option<String> = match conn.get(key).await {
        Ok(v) => v,
        Err(e) => {
            tracing::warn!("Redis GET failed (falling back): {}", e);
            return None;
        }
    };

    let raw = cached?;
    match serde_json::from_str::<NavigateResponse>(&raw) {
        Ok(v) => Some(v),
        Err(e) => {
            tracing::warn!("Redis cached value JSON decode failed (ignoring): {}", e);
            None
        }
    }
}

async fn redis_cache_setex(state: &AppState, key: &str, value: &NavigateResponse) {
    let Some(redis_cache) = state.redis.as_ref() else {
        return;
    };

    let serialized = match serde_json::to_string(value) {
        Ok(s) => s,
        Err(e) => {
            tracing::warn!("Redis cache serialize failed (skipping): {}", e);
            return;
        }
    };

    let mut conn = redis_cache.conn.lock().await;
    if let Err(e) = conn
        .set_ex::<_, _, ()>(key, serialized, CACHE_TTL_SECONDS)
        .await
    {
        tracing::warn!("Redis SETEX failed (continuing): {}", e);
    }
}

pub async fn secure_navigate(
    State(state): State<AppState>,
    Json(payload): Json<NavigateRequest>,
) -> Json<NavigateResponse> {
    let url = &payload.url;
    let store = &state.log_store;
    let cache_key = url_cache_key(url);
    let client = &state.http_client;
    let mut logs: Vec<String> = vec![];

    if let Some(mut cached) = redis_cache_get(&state, &cache_key).await {
        cached
            .logs
            .push("Phase 1: Cache HIT — returning verified snapshot".to_string());
        push_log(
            store,
            url,
            "Phase 1",
            "Cache HIT — returning verified snapshot",
            0,
        );
        redis_cache_setex(&state, &cache_key, &cached).await;
        return Json(cached);
    }

    push_log(store, url, "Phase 1", "Handshake initiated", 0);
    logs.push("Phase 1: Handshake initiated".to_string());

    let browser_url =
        std::env::var("BROWSER_URL").unwrap_or_else(|_| "http://localhost:3002".to_string());
    let browser_base = browser_url.trim_end_matches('/');
    let browser_res = client
        .post(format!("{}/snap-with-session", browser_base))
        .json(&json!({ "url": url }))
        .send()
        .await;

    let browser_data: BrowserResponse = match browser_res {
        Ok(res) => {
            if !res.status().is_success() {
                let msg = format!("Browser Service failed with status: {}", res.status());
                push_log(store, url, "Phase 2", &msg, 100);
                return Json(NavigateResponse {
                    session_id: String::new(),
                    safe_snapshot: vec![],
                    interactive_elements: vec![],
                    risk_score: 100,
                    blocked: true,
                    logs: vec![msg],
                });
            }

            match res.json().await {
                Ok(parsed) => parsed,
                Err(e) => {
                    let msg = format!("Browser Service JSON parse failed: {}", e);
                    push_log(store, url, "Phase 2", &msg, 100);
                    return Json(NavigateResponse {
                        session_id: String::new(),
                        safe_snapshot: vec![],
                        interactive_elements: vec![],
                        risk_score: 100,
                        blocked: true,
                        logs: vec![msg],
                    });
                }
            }
        }
        Err(e) => {
            let msg = format!("Browser Service failed: {}", e);
            push_log(store, url, "Phase 2", &msg, 100);
            return Json(NavigateResponse {
                session_id: String::new(),
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
    push_log(store, url, "Phase 2", &msg, 0);
    logs.push(format!("Phase 2: {}", msg));

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

    let mut risk_score: u8 = 0;
    let mut hidden_threats: Vec<String> = vec![];
    let mut threat_node_count: usize = 0;

    if let Some(ref suspicious) = browser_data.suspicious_nodes {
        for node in suspicious {
            if analyze_hidden_threat(&node.text, &node.reasons) {
                threat_node_count += 1;
                hidden_threats.push(format!(
                    "[{}] ({}) \"{}\"",
                    node.tag,
                    node.reasons,
                    node.text.chars().take(120).collect::<String>()
                ));
            }
        }
    }

    if threat_node_count > 0 {
        let content_risk = ((threat_node_count as u8).saturating_mul(30)).min(90);
        risk_score = risk_score.max(content_risk);
        push_log(
            &store,
            url,
            "Phase 2",
            &format!(
                "{} nodes with threatening content found — risk raised to {}",
                threat_node_count, content_risk
            ),
            risk_score,
        );
        logs.push(format!(
            "Phase 2 ALERT: {} threatening hidden nodes detected",
            threat_node_count
        ));
    }

    if suspicious_count == 0 && hidden_threats.is_empty() {
        let msg = "Fast-path: No suspicious DOM elements or hidden threats detected. Skipping Vision analysis.";
        push_log(store, url, "Phase 3", msg, 0);
        logs.push(format!("Phase 3: {}", msg));

        let resp = NavigateResponse {
            session_id: browser_data.session_id.clone(),
            safe_snapshot: dom_preview,
            interactive_elements,
            risk_score: 0,
            blocked: false,
            logs,
        };
        redis_cache_setex(&state, &cache_key, &resp).await;
        return Json(resp);
    }

    if suspicious_count > 0 {
        push_log(
            &store,
            url,
            "Phase 2",
            &format!(
                "INFO: {} hidden/invisible elements found — analysing content",
                suspicious_count
            ),
            0,
        );
        logs.push(format!(
            "Phase 2: {} hidden DOM elements found — scanning content",
            suspicious_count
        ));
    }

    push_log(
        &store,
        url,
        "Phase 3",
        "Sending to Vision Service (OCR + Gemini)",
        0,
    );

    let vision_url =
        std::env::var("VISION_URL").unwrap_or_else(|_| "http://localhost:5000".to_string());
    let vision_base = vision_url.trim_end_matches('/');
    let vision_res = client
        .post(format!("{}/analyze", vision_base))
        .json(&json!({
            "screenshot_id": &browser_data.screenshot_id,
            "dom_preview": dom_preview
        }))
        .send()
        .await;
    let vision_data: VisionResponse = match vision_res {
        Ok(res) => {
            if !res.status().is_success() {
                let msg = format!("Vision Service failed with status: {}", res.status());
                push_log(store, url, "Phase 3", &msg, 100);
                logs.push(format!("Phase 3: {}", msg));
                return Json(NavigateResponse {
                    session_id: String::new(),
                    safe_snapshot: vec![],
                    interactive_elements,
                    risk_score: 100,
                    blocked: true,
                    logs,
                });
            }

            match res.json().await {
                Ok(parsed) => parsed,
                Err(e) => {
                    let msg = format!("Vision Service JSON parse failed: {}", e);
                    push_log(store, url, "Phase 3", &msg, 100);
                    logs.push(format!("Phase 3: {}", msg));
                    return Json(NavigateResponse {
                        session_id: String::new(),
                        safe_snapshot: vec![],
                        interactive_elements,
                        risk_score: 100,
                        blocked: true,
                        logs,
                    });
                }
            }
        }
        Err(e) => {
            let msg = format!("Vision Service failed: {}", e);
            push_log(store, url, "Phase 3", &msg, 100);
            logs.push(format!("Phase 3: {}", msg));
            return Json(NavigateResponse {
                session_id: String::new(),
                safe_snapshot: vec![],
                interactive_elements,
                risk_score: 100,
                blocked: true,
                logs,
            });
        }
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

    let vision_risk = vision_data.risk_score.unwrap_or(0);
    risk_score = risk_score.max(vision_risk);

    if !hidden_threats.is_empty() {
        let msg = format!("Potential ghost text patterns found: {:?}", hidden_threats);
        push_log(store, url, "Phase 3", &msg, 0);
        logs.push(format!("Phase 3: {}", msg));
    } else {
        push_log(
            store,
            url,
            "Phase 3",
            "Visual Air-Gap verified. No ghost text patterns.",
            risk_score,
        );
        logs.push("Phase 3: Visual Air-Gap verified. No ghost text patterns.".to_string());
    }

    if vision_data.injection_attempt {
        risk_score = 100;
        push_log(
            store,
            url,
            "Phase 3",
            "Visual Prompt Injection confirmed by Gemini",
            100,
        );
        logs.push("Phase 3 ALERT: Visual Prompt Injection confirmed.".to_string());
    }

    let blocked = risk_score >= 60;

    if blocked {
        push_log(
            store,
            url,
            "Phase 4",
            &format!("BLOCKED. Risk score: {}", risk_score),
            risk_score,
        );
        logs.push(format!("Phase 4: BLOCKED. Risk score: {}", risk_score));
    } else {
        push_log(
            store,
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
        dom_preview
    } else {
        vision_data.visible_text
    };

    let resp = NavigateResponse {
        session_id: browser_data.session_id.clone(),
        safe_snapshot,
        interactive_elements,
        risk_score,
        blocked,
        logs,
    };

    redis_cache_setex(&state, &cache_key, &resp).await;
    Json(resp)
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
    State(state): State<AppState>,
    Json(payload): Json<AlertRequest>,
) -> Json<AlertResponse> {
    let store = &state.log_store;
    push_log(
        store,
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

pub async fn get_logs(State(state): State<AppState>) -> Json<Vec<LogEntry>> {
    let logs = state.log_store.lock().unwrap_or_else(|e| e.into_inner());
    Json(logs.clone())
}

// ============== ACTION ENDPOINT (Task 2: Rescan Loop Orchestrator) ==============

#[derive(Deserialize, Debug)]
pub struct ActionRequest {
    pub session_id: String,
    pub action: String,
    pub vv_id: String,
    pub value: Option<String>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct ActionResponse {
    pub safe_snapshot: Vec<String>,
    pub interactive_elements: Vec<InteractiveElement>,
    pub risk_score: u8,
    pub blocked: bool,
    pub logs: Vec<String>,
    pub action_success: bool,
    pub action_message: Option<String>,
}

pub async fn execute_action(
    State(state): State<AppState>,
    Json(payload): Json<ActionRequest>,
) -> Json<ActionResponse> {
    let store = &state.log_store;
    let client = &state.http_client;
    let mut logs: Vec<String> = vec![];
    let session_id = &payload.session_id;

    push_log(
        store,
        session_id,
        "Action",
        &format!("Executing {} on {}", payload.action, payload.vv_id),
        0,
    );
    logs.push(format!("Executing action: {} on element {}", payload.action, payload.vv_id));

    // Get browser service URL
    let browser_url =
        std::env::var("BROWSER_URL").unwrap_or_else(|_| "http://localhost:3002".to_string());
    let browser_base = browser_url.trim_end_matches('/');

    // Step 1: Forward action to Node.js /action endpoint
    let action_res = client
        .post(format!("{}/action", browser_base))
        .json(&json!({
            "sessionId": session_id,
            "action": payload.action,
            "vv_id": payload.vv_id,
            "value": payload.value
        }))
        .send()
        .await;

    match action_res {
        Ok(res) => {
            if !res.status().is_success() {
                let msg = format!("Browser /action failed: {}", res.status());
                push_log(store, session_id, "Action", &msg, 100);
                return Json(ActionResponse {
                    safe_snapshot: vec!["Action failed".to_string()],
                    interactive_elements: vec![],
                    risk_score: 100,
                    blocked: true,
                    logs: vec![msg],
                    action_success: false,
                    action_message: None,
                });
            }
        }
        Err(e) => {
            let msg = format!("Browser /action request failed: {}", e);
            push_log(store, session_id, "Action", &msg, 100);
            return Json(ActionResponse {
                safe_snapshot: vec!["Action failed".to_string()],
                interactive_elements: vec![],
                risk_score: 100,
                blocked: true,
                logs: vec![msg],
                action_success: false,
                action_message: None,
            });
        }
    };

    logs.push("Action executed successfully on browser".to_string());

    // ============== CRITICAL: RESCAN LOOP ==============
    // Step 2: After action succeeds, command Node.js to take new DOM snapshot
    push_log(store, session_id, "Rescan", "Triggering post-action resnapshot", 0);
    logs.push("Rescan Loop: Fetching new page state...".to_string());

    let resnap_res = client
        .post(format!("{}/resnap", browser_base))
        .json(&json!({ "sessionId": session_id }))
        .send()
        .await;

    let resnap_data: BrowserResponse = match resnap_res {
        Ok(res) => {
            if !res.status().is_success() {
                let msg = format!("Browser /resnap failed: {}", res.status());
                push_log(store, session_id, "Rescan", &msg, 80);
                logs.push(format!("Rescan Loop Warning: {}", msg));
                // Continue with elevated risk but don't block
                return Json(ActionResponse {
                    safe_snapshot: vec!["Rescan failed - page may be unstable".to_string()],
                    interactive_elements: vec![],
                    risk_score: 80,
                    blocked: true,
                    logs,
                    action_success: true,
                    action_message: Some("Action succeeded but rescan failed".to_string()),
                });
            }
            match res.json().await {
                Ok(parsed) => parsed,
                Err(e) => {
                    let msg = format!("Browser /resnap JSON parse failed: {}", e);
                    push_log(store, session_id, "Rescan", &msg, 80);
                    logs.push(format!("Rescan Loop Warning: {}", msg));
                    return Json(ActionResponse {
                        safe_snapshot: vec!["Rescan failed - parse error".to_string()],
                        interactive_elements: vec![],
                        risk_score: 80,
                        blocked: true,
                        logs,
                        action_success: true,
                        action_message: Some("Action succeeded but rescan parse failed".to_string()),
                    });
                }
            }
        }
        Err(e) => {
            let msg = format!("Browser /resnap request failed: {}", e);
            push_log(store, session_id, "Rescan", &msg, 80);
            logs.push(format!("Rescan Loop Warning: {}", msg));
            return Json(ActionResponse {
                safe_snapshot: vec!["Rescan failed - connection error".to_string()],
                interactive_elements: vec![],
                risk_score: 80,
                blocked: true,
                logs,
                action_success: true,
                action_message: Some("Action succeeded but rescan connection failed".to_string()),
            });
        }
    };

    let dom_count = resnap_data.clean_dom.len();
    let suspicious_count = resnap_data
        .suspicious_nodes
        .as_ref()
        .map_or(0, |s| s.len());
    logs.push(format!(
        "Rescan Loop: {} clean DOM nodes, {} suspicious nodes",
        dom_count, suspicious_count
    ));

    // Extract interactive elements from new snapshot
    let interactive_elements: Vec<InteractiveElement> = resnap_data
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

    // Build DOM preview for Vision service
    let dom_preview: Vec<String> = resnap_data
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

    // Step 3: If new snapshot has hidden/suspicious nodes, send to Vision Service
    let mut risk_score: u8 = 0;
    let mut visible_text: Vec<String> = dom_preview.clone();
    let mut blocked = false;

    if suspicious_count > 0 {
        push_log(
            store,
            session_id,
            "Rescan",
            &format!("Suspicious nodes detected post-action - scanning with Vision ({})", suspicious_count),
            0,
        );
        logs.push(format!("Rescan Loop: Sending {} suspicious nodes to Vision Service", suspicious_count));

        let vision_url =
            std::env::var("VISION_URL").unwrap_or_else(|_| "http://localhost:5000".to_string());
        let vision_base = vision_url.trim_end_matches('/');

        let vision_res = client
            .post(format!("{}/analyze", vision_base))
            .json(&json!({
                "screenshot_id": &resnap_data.screenshot_id,
                "dom_preview": &dom_preview
            }))
            .send()
            .await;

        match vision_res {
            Ok(res) => {
                if res.status().is_success() {
                    match res.json::<VisionResponse>().await {
                        Ok(vision_data) => {
                            logs.push(format!("Vision analysis: risk={}, reason={:?}",
                                vision_data.risk_score.unwrap_or(0),
                                vision_data.reason));

                            risk_score = vision_data.risk_score.unwrap_or(0);

                            if vision_data.injection_attempt {
                                risk_score = 100;
                                logs.push("RESCAN ALERT: Visual Prompt Injection confirmed!".to_string());
                            }

                            if !vision_data.visible_text.is_empty() {
                                visible_text = vision_data.visible_text;
                            }

                            push_log(
                                store,
                                session_id,
                                "Rescan",
                                &format!("Vision scan complete - risk score: {}", risk_score),
                                risk_score,
                            );
                        }
                        Err(e) => {
                            let msg = format!("Vision JSON parse failed: {}", e);
                            push_log(store, session_id, "Rescan", &msg, 50);
                            logs.push(format!("Rescan Warning: {}", msg));
                            risk_score = 50;
                        }
                    }
                } else {
                    let msg = format!("Vision service returned: {}", res.status());
                    push_log(store, session_id, "Rescan", &msg, 50);
                    logs.push(format!("Rescan Warning: {}", msg));
                    risk_score = 50;
                }
            }
            Err(e) => {
                let msg = format!("Vision request failed: {}", e);
                push_log(store, session_id, "Rescan", &msg, 50);
                logs.push(format!("Rescan Warning: {}", msg));
                risk_score = 50;
            }
        }
    } else {
        logs.push("Rescan Loop: No suspicious nodes - skipping Vision scan".to_string());
    }

    // Determine if blocked based on risk score
    if risk_score >= 60 {
        blocked = true;
        push_log(
            store,
            session_id,
            "Rescan",
            &format!("BLOCKED post-action. Risk score: {}", risk_score),
            risk_score,
        );
        logs.push(format!("RESCAN ALERT: Page blocked after action. Risk: {}", risk_score));
    } else {
        push_log(
            store,
            session_id,
            "Rescan",
            "Safe snapshot returned to agent",
            risk_score,
        );
        logs.push("Rescan Loop: Safe snapshot delivered".to_string());
    }

    let safe_snapshot = if blocked {
        vec!["BLOCKED BY VERIVIEW".to_string()]
    } else {
        visible_text
    };

    Json(ActionResponse {
        safe_snapshot,
        interactive_elements,
        risk_score,
        blocked,
        logs,
        action_success: true,
        action_message: Some("Action and rescan completed".to_string()),
    })
}
