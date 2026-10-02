//! Chrome native-messaging adapter. Only Gemini page status, never chat contents.
use std::io::{Read, Write};
use std::time::Duration;
use serde_json::{json, Value};
mod win;

fn status_payload(input: &Value) -> Option<Value> {
    let phase = input.get("phase")?.as_str()?;
    let session = input.get("session_id")?.as_str()?;
    if session.is_empty() || session.len() > 96 || !session.chars().all(|c| c.is_ascii_alphanumeric() || c == '-') { return None; }
    let (event, label) = match phase {
        "connected" => ("SessionStart", "Gemini website connected"),
        "thinking" => ("UserPromptSubmit", "Gemini is thinking"),
        "working" => ("PreToolUse", "Gemini is responding"),
        "finished" => ("Stop", "Gemini finished replying"),
        "disconnected" => ("SessionEnd", "Gemini website closed"),
        _ => return None,
    };
    Some(json!({"provider":"gemini", "client_name":"Gemini Website", "session_id":session,
        "hook_event_name":event, "message":label, "prompt":label, "tool_name":label,
        "cwd":"Gemini website"}))
}

fn deliver(payload: Value) -> bool {
    let (tx, rx) = std::sync::mpsc::channel();
    std::thread::spawn(move || {
        use std::os::windows::io::AsRawHandle;
        let result = (|| {
            let sid = win::current_user_sid()?;
            let mut pipe = std::fs::OpenOptions::new().read(true).write(true).open(format!(r"\\.\pipe\karbs-{sid}")).ok()?;
            if !win::pipe_server_is_same_user(windows::Win32::Foundation::HANDLE(pipe.as_raw_handle())) { return None; }
            writeln!(pipe, "{payload}").ok()?;
            Some(())
        })().is_some();
        let _ = tx.send(result);
    });
    rx.recv_timeout(Duration::from_millis(500)).unwrap_or(false)
}

fn main() {
    let allowed = include_str!("web-origin.txt").trim();
    if std::env::args().nth(1).as_deref() != Some(allowed) { return; }
    let mut input = std::io::stdin().lock();
    let mut header = [0u8; 4];
    // sendNativeMessage sends one frame per process. A stuck pipe worker can then
    // never accumulate across messages, and Chrome gets a bounded response.
    if input.read_exact(&mut header).is_err() { return; }
    let length = u32::from_le_bytes(header) as usize;
    if length == 0 || length > 16_384 { return; }
    let mut bytes = vec![0u8; length];
    if input.read_exact(&mut bytes).is_err() { return; }
    let response = match serde_json::from_slice::<Value>(&bytes).ok().and_then(|v| status_payload(&v)) {
        Some(payload) => json!({"ok":true, "app_running":deliver(payload)}),
        None => json!({"ok":false, "error":"Invalid status event"}),
    };
    let bytes = response.to_string().into_bytes();
    let mut output = std::io::stdout().lock();
    let _ = output.write_all(&(bytes.len() as u32).to_le_bytes());
    let _ = output.write_all(&bytes);
    let _ = output.flush();
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn accepts_status_only_and_drops_page_contents() {
        let payload = status_payload(&json!({"phase":"working", "session_id":"web-123", "chat":"private", "url":"private"})).unwrap();
        assert_eq!(payload["client_name"], "Gemini Website");
        assert!(payload.get("chat").is_none());
        assert!(payload.get("url").is_none());
        assert!(status_payload(&json!({"phase":"approve", "session_id":"web-123"})).is_none());
        assert!(status_payload(&json!({"phase":"working", "session_id":"bad/id"})).is_none());
    }
}
