// Preferences, stored as plain JSON in %APPDATA%\Coucou\settings.json.
// No secret ever lands here — API keys live in the Windows Credential Manager.

use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub sound_enabled: bool,
    pub sound_volume: f64,
    pub auto_close_interval: f64,
    pub absence_interval: f64,
    pub active_integrations: Vec<String>,
    /// "primary" = the main display, "cursor" = whichever display the mouse is on.
    pub screen: String,
    pub autostart: bool,
    pub hooks_installed: bool,
    /// Claude model used by the chat. Changeable in the settings window.
    /// Defaulted explicitly so a settings.json written by an older build still loads.
    #[serde(default = "default_model")]
    pub model: String,
    #[serde(default = "default_chat_provider")]
    pub chat_provider: String,
    #[serde(default)]
    pub codex_path: String,
    #[serde(default)]
    pub codex_model: String,
    #[serde(default = "default_gemini_model")]
    pub gemini_model: String,
    #[serde(default)]
    pub computer_control: bool,
    #[serde(default)]
    pub full_access: bool,
    #[serde(default)]
    pub speak_replies: bool,
    #[serde(default = "default_speech_voice")]
    pub speech_voice: String,
}

fn default_speech_voice() -> String { "en-IN-NeerjaNeural".into() }

fn default_chat_provider() -> String { "codex".into() }
fn default_gemini_model() -> String { "gemini-3.5-flash-lite".into() }

fn default_model() -> String {
    crate::claude::DEFAULT_MODEL.to_string()
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            sound_enabled: false,
            sound_volume: 0.12,
            auto_close_interval: 15.0,
            absence_interval: 180.0,
            active_integrations: vec![],
            screen: "primary".into(),
            autostart: false,
            hooks_installed: false,
            model: default_model(),
            chat_provider: default_chat_provider(),
            codex_path: String::new(),
            codex_model: String::new(),
            gemini_model: default_gemini_model(),
            computer_control: false,
            full_access: false,
            speak_replies: false,
            speech_voice: default_speech_voice(),
        }
    }
}

/// %APPDATA%\Coucou
pub fn config_dir() -> PathBuf {
    if let Some(dir) = portable_dir() { return dir.join("config"); }
    let base = std::env::var_os("APPDATA")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("."));
    base.join("Karbs")
}

/// %LOCALAPPDATA%\Coucou — where karbs-hook.exe and the log live.
pub fn local_dir() -> PathBuf {
    if let Some(dir) = portable_dir() { return dir; }
    let base = std::env::var_os("LOCALAPPDATA")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("."));
    base.join("Karbs")
}

fn portable_dir() -> Option<PathBuf> { std::env::var_os("COUCOU_DATA_DIR").map(PathBuf::from) }

pub fn hook_exe_path() -> PathBuf {
    local_dir().join("bin").join("karbs-hook.exe")
}

fn settings_path() -> PathBuf {
    config_dir().join("settings.json")
}

pub fn load() -> Settings {
    match std::fs::read(settings_path()) {
        Ok(bytes) => serde_json::from_slice(&bytes).unwrap_or_default(),
        Err(_) => Settings::default(),
    }
}

pub fn save(settings: &Settings) -> std::io::Result<()> {
    let dir = config_dir();
    std::fs::create_dir_all(&dir)?;
    let json = serde_json::to_vec_pretty(settings)
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))?;
    std::fs::write(settings_path(), json)
}
