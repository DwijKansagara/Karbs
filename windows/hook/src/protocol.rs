//! Provider adapters. Only Codex/Claude PermissionRequest can return a decision.
use serde_json::{json, Value};

pub fn normalize(mut value: Value, provider: &str, arg_event: &str) -> Option<(Value, String)> {
    let map = value.as_object_mut()?;
    let original = map.get("hook_event_name").and_then(Value::as_str)
        .filter(|s| !s.is_empty()).unwrap_or(arg_event).to_string();
    let event = if provider == "gemini" {
        match original.as_str() {
            "BeforeAgent" => "UserPromptSubmit",
            "BeforeTool" => "PreToolUse",
            "AfterTool" => "PostToolUse",
            "AfterAgent" => "Stop",
            _ => &original,
        }
    } else if original == "Interrupt" { "SessionInterrupted" } else { &original }.to_string();
    // Gemini has no PermissionRequest hook. Never invent an approval endpoint.
    if provider == "gemini" && event == "PermissionRequest" { return None; }
    // A cropped command cannot be meaningfully approved. Let the terminal show it in full.
    if event == "PermissionRequest" && map.get("tool_input").and_then(Value::as_object)
        .map(|input| input.values().any(|v| v.as_str().map(|s| s.len() > 2000).unwrap_or(false)))
        .unwrap_or(false) { return None; }
    map.insert("provider".into(), json!(provider));
    map.insert("hook_event_name".into(), json!(event));
    if !map.contains_key("message") {
        if let Some(message) = map.get("last_assistant_message").or_else(|| map.get("prompt_response")).cloned() {
            map.insert("message".into(), message);
        }
    }
    // Forward only what the island displays, not transcripts, file bodies or tool results.
    let input = map.get("tool_input").and_then(Value::as_object).map(|input| {
        let keys = ["command", "cmd", "file_path", "path", "dir_path", "url", "query", "pattern", "description"];
        input.iter().filter(|(key, _)| keys.contains(&key.as_str()))
            .map(|(k, v)| (k.clone(), v.clone())).collect::<serde_json::Map<String, Value>>()
    });
    map.retain(|key, _| ["provider", "client_name", "hook_event_name", "session_id", "cwd", "prompt", "message", "tool_name", "notification_type"].contains(&key.as_str()));
    if let Some(input) = input { map.insert("tool_input".into(), Value::Object(input)); }
    Some((value, event))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn gemini_events_map_without_faking_permissions() {
        for (from, to) in [("BeforeAgent", "UserPromptSubmit"), ("BeforeTool", "PreToolUse"),
            ("AfterTool", "PostToolUse"), ("AfterAgent", "Stop")] {
            let (payload, event) = normalize(json!({"hook_event_name": from, "session_id": "one"}), "gemini", "").unwrap();
            assert_eq!(event, to);
            assert_eq!(payload["provider"], "gemini");
        }
        assert!(normalize(json!({"hook_event_name":"PermissionRequest"}), "gemini", "").is_none());
    }
    #[test]
    fn codex_completion_and_privacy() {
        let (payload, event) = normalize(json!({"hook_event_name":"Stop", "last_assistant_message":"Done",
            "transcript_path":"private", "tool_response":"secret", "tool_input":{"command":"echo hi", "content":"private file"}}), "codex", "").unwrap();
        assert_eq!(event, "Stop");
        assert_eq!(payload["message"], "Done");
        assert!(payload.get("transcript_path").is_none());
        assert!(payload.get("tool_response").is_none());
        assert!(payload["tool_input"].get("content").is_none());
        assert_eq!(payload["tool_input"]["command"], "echo hi");
    }
    #[test]
    fn oversized_approvals_fall_back_to_terminal() {
        assert!(normalize(json!({"hook_event_name":"PermissionRequest", "tool_input":{"command":"x".repeat(2001)}}), "codex", "").is_none());
    }
}
