use super::types::FeedItem;
use serde::Deserialize;

#[derive(Debug, Clone, Deserialize)]
pub struct OpenCodeToolState {
    pub status: String,
    pub input: Option<serde_json::Value>,
    pub output: Option<String>,
    pub error: Option<String>,
    #[serde(flatten)]
    pub extra: serde_json::Value,
}

#[derive(Debug, Clone, Deserialize)]
pub struct OpenCodePart {
    #[serde(rename = "type")]
    pub part_type: String,
    pub text: Option<String>,
    pub tool: Option<String>,
    #[serde(rename = "callID")]
    pub call_id: Option<String>,
    #[serde(rename = "messageID")]
    pub message_id: Option<String>,
    pub state: Option<OpenCodeToolState>,
    pub cost: Option<f64>,
    pub reason: Option<String>,
    #[serde(rename = "sessionID")]
    pub session_id: Option<String>,
    #[serde(flatten)]
    pub extra: serde_json::Value,
}

#[derive(Debug, Clone, Deserialize)]
pub struct OpenCodeError {
    pub name: Option<String>,
    #[serde(flatten)]
    pub extra: serde_json::Value,
}

#[derive(Debug, Clone, Deserialize)]
pub struct OpenCodeEvent {
    #[serde(rename = "type")]
    pub event_type: String,
    #[serde(rename = "sessionID")]
    pub session_id: Option<String>,
    pub part: Option<OpenCodePart>,
    pub error: Option<OpenCodeError>,
    pub timestamp: Option<u64>,
    #[serde(flatten)]
    pub extra: serde_json::Value,
}

#[derive(Debug, Default)]
pub struct OpenCodeAccumulator {
    pub cost_usd: f64,
}

pub fn extract_session_id(line: &str) -> Option<String> {
    let event: OpenCodeEvent = serde_json::from_str(line.trim()).ok()?;
    event.session_id
}

pub fn parse_opencode_event(line: &str, acc: &mut OpenCodeAccumulator) -> Vec<FeedItem> {
    let line = line.trim();
    if line.is_empty() {
        return vec![];
    }

    let event: OpenCodeEvent = match serde_json::from_str(line) {
        Ok(e) => e,
        Err(e) => {
            tracing::error!("Failed to parse OpenCode event: {e}\nLine: {line}");
            return vec![];
        }
    };

    match event.event_type.as_str() {
        "text" => parse_text(&event),
        "reasoning" => parse_reasoning(&event),
        "tool_use" => parse_tool_use(&event),
        "step_start" => vec![],
        "step_finish" => {
            if let Some(part) = &event.part {
                if let Some(cost) = part.cost {
                    acc.cost_usd += cost;
                }
            }
            vec![]
        }
        "error" => parse_error(&event),
        _ => {
            tracing::debug!("[opencode] unhandled event type: {}", event.event_type);
            vec![]
        }
    }
}

fn parse_text(event: &OpenCodeEvent) -> Vec<FeedItem> {
    let Some(part) = &event.part else {
        return vec![];
    };
    match &part.text {
        Some(text) if !text.is_empty() => vec![FeedItem::AssistantText(text.clone())],
        _ => vec![],
    }
}

fn parse_reasoning(event: &OpenCodeEvent) -> Vec<FeedItem> {
    let Some(part) = &event.part else {
        return vec![];
    };
    match &part.text {
        Some(text) if !text.is_empty() => vec![FeedItem::Thinking(text.clone())],
        _ => vec![],
    }
}

fn parse_tool_use(event: &OpenCodeEvent) -> Vec<FeedItem> {
    let Some(part) = &event.part else {
        return vec![];
    };
    let Some(state) = &part.state else {
        return vec![];
    };
    let name = part.tool.as_deref().unwrap_or("unknown").to_string();
    let input = state.input.clone().unwrap_or(serde_json::Value::Null);
    let call = FeedItem::ToolCall {
        name: name.clone(),
        input: input.clone(),
    };
    match state.status.as_str() {
        "completed" => {
            let content = state.output.clone().unwrap_or_default();
            vec![
                call,
                FeedItem::ToolResult {
                    content,
                    is_error: false,
                },
            ]
        }
        "error" => {
            let content = state.error.clone().unwrap_or_else(|| "Unknown tool error".into());
            vec![
                call,
                FeedItem::ToolResult {
                    content,
                    is_error: true,
                },
            ]
        }
        _ => vec![call],
    }
}

fn parse_error(event: &OpenCodeEvent) -> Vec<FeedItem> {
    let Some(error) = &event.error else {
        return vec![];
    };
    match error.name.as_deref() {
        Some("ProviderAuthError") => {
            vec![FeedItem::SystemMessage(
                "Not authenticated — sign in again to continue".to_string(),
            )]
        }
        other => {
            let name = other.unwrap_or("UnknownError");
            let message = error
                .extra
                .get("data")
                .and_then(|d| d.get("message"))
                .and_then(|m| m.as_str())
                .unwrap_or("Unknown error");
            vec![FeedItem::SystemMessage(format!("{name}: {message}"))]
        }
    }
}

pub fn finalize(acc: &OpenCodeAccumulator) -> Vec<FeedItem> {
    if acc.cost_usd > 0.0 {
        vec![FeedItem::FinalResult {
            result: "Completed".to_string(),
            cost_usd: Some(acc.cost_usd),
            duration_ms: None,
        }]
    } else {
        vec![]
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn acc() -> OpenCodeAccumulator {
        OpenCodeAccumulator::default()
    }

    #[test]
    fn parse_text_event() {
        let line = r#"{"type":"text","timestamp":1000,"sessionID":"sess-1","part":{"id":"p-1","sessionID":"sess-1","messageID":"m-1","type":"text","text":"Hello, world!","time":{"start":1000,"end":2000}}}"#;
        let items = parse_opencode_event(line, &mut acc());
        assert_eq!(items.len(), 1);
        assert!(matches!(&items[0], FeedItem::AssistantText(t) if t == "Hello, world!"));
    }

    #[test]
    fn parse_reasoning_event() {
        let line = r#"{"type":"reasoning","timestamp":1000,"sessionID":"sess-1","part":{"id":"p-2","sessionID":"sess-1","messageID":"m-2","type":"reasoning","text":"Let me think...","time":{"start":1000,"end":2000}}}"#;
        let items = parse_opencode_event(line, &mut acc());
        assert_eq!(items.len(), 1);
        assert!(matches!(&items[0], FeedItem::Thinking(t) if t == "Let me think..."));
    }

    #[test]
    fn parse_tool_use_completed() {
        let line = r#"{"type":"tool_use","timestamp":1000,"sessionID":"sess-1","part":{"id":"p-3","sessionID":"sess-1","messageID":"m-3","type":"tool","callID":"c-1","tool":"read","state":{"status":"completed","input":{"path":"src/main.rs"},"output":"fn main() {}"},"time":{"start":1000,"end":2000}}}"#;
        let items = parse_opencode_event(line, &mut acc());
        assert_eq!(items.len(), 2);
        match &items[0] {
            FeedItem::ToolCall { name, input } => {
                assert_eq!(name, "read");
                assert_eq!(input["path"], "src/main.rs");
            }
            other => panic!("expected ToolCall, got {other:?}"),
        }
        match &items[1] {
            FeedItem::ToolResult { content, is_error } => {
                assert_eq!(content, "fn main() {}");
                assert!(!is_error);
            }
            other => panic!("expected ToolResult, got {other:?}"),
        }
    }

    #[test]
    fn parse_tool_use_error() {
        let line = r#"{"type":"tool_use","timestamp":1000,"sessionID":"sess-1","part":{"id":"p-4","sessionID":"sess-1","messageID":"m-4","type":"tool","callID":"c-2","tool":"bash","state":{"status":"error","input":{"command":"false"},"error":"Exit code 1"},"time":{"start":1000,"end":2000}}}"#;
        let items = parse_opencode_event(line, &mut acc());
        assert_eq!(items.len(), 2);
        match &items[0] {
            FeedItem::ToolCall { name, .. } => assert_eq!(name, "bash"),
            other => panic!("expected ToolCall, got {other:?}"),
        }
        match &items[1] {
            FeedItem::ToolResult { content, is_error } => {
                assert_eq!(content, "Exit code 1");
                assert!(is_error);
            }
            other => panic!("expected ToolResult, got {other:?}"),
        }
    }

    #[test]
    fn parse_tool_use_pending() {
        let line = r#"{"type":"tool_use","timestamp":1000,"sessionID":"sess-1","part":{"id":"p-5","sessionID":"sess-1","messageID":"m-5","type":"tool","callID":"c-3","tool":"write","state":{"status":"pending","input":{"path":"out.txt"}},"time":{"start":1000}}}"#;
        let items = parse_opencode_event(line, &mut acc());
        assert_eq!(items.len(), 1);
        match &items[0] {
            FeedItem::ToolCall { name, input } => {
                assert_eq!(name, "write");
                assert_eq!(input["path"], "out.txt");
            }
            other => panic!("expected ToolCall, got {other:?}"),
        }
    }

    #[test]
    fn parse_tool_use_running() {
        let line = r#"{"type":"tool_use","timestamp":1000,"sessionID":"sess-1","part":{"id":"p-6","sessionID":"sess-1","messageID":"m-6","type":"tool","callID":"c-4","tool":"bash","state":{"status":"running","input":{"command":"sleep 1"}},"time":{"start":1000}}}"#;
        let items = parse_opencode_event(line, &mut acc());
        assert_eq!(items.len(), 1);
        assert!(matches!(&items[0], FeedItem::ToolCall { name, .. } if name == "bash"));
    }

    #[test]
    fn parse_step_start_returns_empty() {
        let line = r#"{"type":"step_start","timestamp":1000,"sessionID":"sess-1","part":{"id":"p-7","sessionID":"sess-1","messageID":"m-7","type":"step-start"}}"#;
        let items = parse_opencode_event(line, &mut acc());
        assert!(items.is_empty());
    }

    #[test]
    fn parse_step_finish_accumulates_cost() {
        let mut a = acc();
        let line = r#"{"type":"step_finish","timestamp":2000,"sessionID":"sess-1","part":{"id":"p-8","sessionID":"sess-1","messageID":"m-8","type":"step-finish","reason":"end_turn","cost":0.003,"tokens":{"total":150,"input":100,"output":50}}}"#;
        let items = parse_opencode_event(line, &mut a);
        assert!(items.is_empty());
        assert!((a.cost_usd - 0.003).abs() < f64::EPSILON);
    }

    #[test]
    fn finalize_emits_cost_when_nonzero() {
        let mut a = acc();
        a.cost_usd = 0.007;
        let items = finalize(&a);
        assert_eq!(items.len(), 1);
        match &items[0] {
            FeedItem::FinalResult { result, cost_usd, duration_ms } => {
                assert_eq!(result, "Completed");
                assert_eq!(cost_usd.unwrap(), 0.007);
                assert!(duration_ms.is_none());
            }
            other => panic!("expected FinalResult, got {other:?}"),
        }
    }

    #[test]
    fn finalize_empty_when_zero_cost() {
        let a = acc();
        let items = finalize(&a);
        assert!(items.is_empty());
    }

    #[test]
    fn parse_error_provider_auth() {
        let line = r#"{"type":"error","timestamp":1000,"sessionID":"sess-1","error":{"name":"ProviderAuthError","data":{"providerID":"anthropic","message":"Invalid API key"}}}"#;
        let items = parse_opencode_event(line, &mut acc());
        assert_eq!(items.len(), 1);
        match &items[0] {
            FeedItem::SystemMessage(msg) => {
                assert_eq!(msg, "Not authenticated — sign in again to continue");
            }
            other => panic!("expected SystemMessage, got {other:?}"),
        }
    }

    #[test]
    fn parse_error_provider_auth_is_detectable() {
        let line = r#"{"type":"error","timestamp":1000,"sessionID":"sess-1","error":{"name":"ProviderAuthError","data":{"providerID":"anthropic","message":"Invalid API key"}}}"#;
        let items = parse_opencode_event(line, &mut acc());
        assert_eq!(items.len(), 1);
        assert!(
            matches!(&items[0], FeedItem::SystemMessage(m) if crate::auth_error::is_auth_error(m))
        );
    }

    #[test]
    fn parse_error_unknown() {
        let line = r#"{"type":"error","timestamp":1000,"sessionID":"sess-1","error":{"name":"UnknownError","data":{"message":"Something went wrong"}}}"#;
        let items = parse_opencode_event(line, &mut acc());
        assert_eq!(items.len(), 1);
        match &items[0] {
            FeedItem::SystemMessage(msg) => {
                assert_eq!(msg, "UnknownError: Something went wrong");
            }
            other => panic!("expected SystemMessage, got {other:?}"),
        }
    }

    #[test]
    fn parse_error_api_error() {
        let line = r#"{"type":"error","timestamp":1000,"sessionID":"sess-1","error":{"name":"APIError","data":{"message":"Rate limit exceeded","statusCode":429}}}"#;
        let items = parse_opencode_event(line, &mut acc());
        assert_eq!(items.len(), 1);
        match &items[0] {
            FeedItem::SystemMessage(msg) => {
                assert_eq!(msg, "APIError: Rate limit exceeded");
            }
            other => panic!("expected SystemMessage, got {other:?}"),
        }
    }

    #[test]
    fn extract_session_id_from_event() {
        let line = r#"{"type":"text","timestamp":1000,"sessionID":"sess-42","part":{"id":"p-1","sessionID":"sess-42","messageID":"m-1","type":"text","text":"hi"}}"#;
        assert_eq!(extract_session_id(line), Some("sess-42".to_string()));
    }

    #[test]
    fn extract_session_id_returns_none_when_absent() {
        let line = r#"{"type":"step_start","timestamp":1000}"#;
        assert_eq!(extract_session_id(line), None);
    }

    #[test]
    fn parse_unknown_event_type_ignored() {
        let line = r#"{"type":"something_new","timestamp":1000}"#;
        let items = parse_opencode_event(line, &mut acc());
        assert!(items.is_empty());
    }

    #[test]
    fn parse_empty_and_invalid() {
        assert!(parse_opencode_event("", &mut acc()).is_empty());
        assert!(parse_opencode_event("  ", &mut acc()).is_empty());
        assert!(parse_opencode_event("not json", &mut acc()).is_empty());
    }

    #[test]
    fn multiple_step_finish_accumulates_cost() {
        let mut a = acc();
        let step1 = r#"{"type":"step_finish","timestamp":1000,"sessionID":"sess-1","part":{"id":"p-1","type":"step-finish","cost":0.003}}"#;
        let step2 = r#"{"type":"step_finish","timestamp":2000,"sessionID":"sess-1","part":{"id":"p-2","type":"step-finish","cost":0.005}}"#;
        parse_opencode_event(step1, &mut a);
        parse_opencode_event(step2, &mut a);
        assert!((a.cost_usd - 0.008).abs() < 1e-9);
        let items = finalize(&a);
        assert_eq!(items.len(), 1);
        match &items[0] {
            FeedItem::FinalResult { cost_usd, .. } => {
                assert!((cost_usd.unwrap() - 0.008).abs() < 1e-9);
            }
            other => panic!("expected FinalResult, got {other:?}"),
        }
    }

    #[test]
    fn text_event_with_empty_text_ignored() {
        let line = r#"{"type":"text","timestamp":1000,"sessionID":"sess-1","part":{"id":"p-1","type":"text","text":""}}"#;
        let items = parse_opencode_event(line, &mut acc());
        assert!(items.is_empty());
    }
}