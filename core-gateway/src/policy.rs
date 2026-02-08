use scraper::Html;

pub fn sanitize_dom(raw_html: &str, visible_text: &Vec<String>) -> (String, u8, String) {
    let _document = Html::parse_document(raw_html);
    let mut _risk_score = 0;
    let mut _log = String::from("Analysis Complete.");

    if raw_html.contains("Ignore previous instructions") {
        let is_visible = visible_text.iter().any(|t| t.contains("Ignore"));

        if !is_visible {
            _risk_score = 100;
            _log = String::from("BLOCKED: Hidden Prompt Injection Detected via Visual Consensus.");
            return (
                "<html><body><h1>Content Blocked by VeriView</h1></body></html>".to_string(),
                _risk_score,
                _log,
            );
        }
    }

    (raw_html.to_string(), 0, "Safe".to_string())
}
