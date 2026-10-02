use std::{process::Stdio, sync::Mutex, time::Duration};
use tauri::{AppHandle, Emitter};
use tokio::{io::{AsyncWriteExt, AsyncBufReadExt, BufReader}, process::Command, sync::oneshot};

#[derive(Default)]
pub struct Speech(pub Mutex<Option<oneshot::Sender<()>>>);

fn voice_engine(mode: &str) -> Command {
    let mut command = Command::new(crate::runtime::python());
    command.arg(crate::runtime::path("voice/engine.py")).arg(mode);
    command.env("TEMP",crate::runtime::temp()).env("TMP",crate::runtime::temp()).env("PYTHONPYCACHEPREFIX",crate::settings::local_dir().join("cache/pycache")).env("PYTHONNOUSERSITE","1").env("PYTHONIOENCODING","utf-8");
    command.stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped()).kill_on_drop(true).creation_flags(0x0800_0000);
    command
}

fn helper(file: impl AsRef<std::ffi::OsStr>) -> Command {
    let mut command=Command::new("C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe");
    command.args(["-NoProfile","-ExecutionPolicy","Bypass","-STA","-File"]).arg(file);
    command.env("TEMP",crate::runtime::temp()).env("TMP",crate::runtime::temp());
    command.stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped()).kill_on_drop(true);
    command.creation_flags(0x0800_0000);
    command
}

#[tauri::command]
pub async fn voice_listen(app:AppHandle) -> Result<String,String> {
    let operation=async {
        let mut child=voice_engine("--listen").spawn().map_err(|_|"Could not start Whisper.")?;
        drop(child.stdin.take());
        let mut lines=BufReader::new(child.stdout.take().ok_or("Cannot read voice input.")?).lines();
        let mut text=String::new();let mut error=None;
        while let Some(line)=lines.next_line().await.map_err(|_|"Voice input stopped unexpectedly.")? {
            if let Ok(value)=serde_json::from_str::<serde_json::Value>(&line){
                if value.get("stage").is_some(){let _=app.emit("voice-input",&value);}
                if let Some(result)=value["text"].as_str(){text=result.to_string();}
                if let Some(message)=value["error"].as_str(){error=Some(message.to_string());}
            }
        }
        let output=child.wait_with_output().await.map_err(|_|"Could not finish voice input.")?;
        if !output.status.success(){return Err(error.unwrap_or_else(||"Whisper could not use the microphone. Check Windows input device settings.".into()));}
        if text.is_empty(){return Err("No speech recognized. Please try again.".into());}
        Ok(text)
    };
    tokio::time::timeout(Duration::from_secs(90),operation).await.map_err(|_|"Voice recognition timed out.".to_string())?
}

#[tauri::command]
pub async fn speak(app:AppHandle, speech: tauri::State<'_,Speech>, text:String) -> Result<(),String> {
    if text.len()>16000{return Err("Reply is too long to speak.".into());}
    let offline=crate::settings::load().speech_voice=="windows";
    let mut command=if offline {helper(crate::runtime::path("pc-control/voice.ps1"))} else {voice_engine("--speak")};
    if offline{command.args(["-Mode","speak"]);}
    let mut child=command.spawn().map_err(|_|"Could not start Windows speech.")?;
    if let Some(mut input)=child.stdin.take(){input.write_all(text.as_bytes()).await.map_err(|_|"Could not send speech text.")?;}
    let (cancel, cancelled)=oneshot::channel();
    if let Some(previous)=speech.0.lock().unwrap().replace(cancel){let _=previous.send(());}
    tokio::spawn(async move {
        let operation=async {
            let mut error=None;
            if let Some(stdout)=child.stdout.take(){
                let mut lines=BufReader::new(stdout).lines();
                while let Ok(Some(line))=lines.next_line().await {
                    if let Ok(value)=serde_json::from_str::<serde_json::Value>(&line){
                        let _=app.emit("voice-output",&value);
                        if let Some(message)=value["error"].as_str(){error=Some(message.to_string());}
                    }
                }
            }
            match child.wait_with_output().await {
                Ok(output) if output.status.success()=>{let _=app.emit("voice-output",serde_json::json!({"stage":"finished"}));}
                _=>{let _=app.emit("voice-output",serde_json::json!({"error":error.unwrap_or_else(||"Speech failed. Check your internet and Windows audio output, or choose the offline voice in Settings.".into())}));}
            }
        };
        tokio::select!{ _=operation=>{}, _=cancelled=>{} }
    });
    Ok(())
}

#[tauri::command]
pub fn stop_speech(speech:tauri::State<Speech>){
    if let Some(cancel)=speech.0.lock().unwrap().take(){let _=cancel.send(());}
}

#[tauri::command]
pub async fn pick_file(app:AppHandle)->Result<(),String>{
    let output=helper(crate::runtime::path("pc-control/pick-file.ps1")).output().await.map_err(|_|"Could not open file picker.")?;
    if !output.status.success(){return Err("Could not open file picker.".into());}
    let path=String::from_utf8_lossy(&output.stdout).trim().to_string();
    if !path.is_empty(){let _=app.emit_to("island","coucou-file-drag",serde_json::json!({"type":"drop","paths":[path]}));}
    Ok(())
}

#[tauri::command]
pub fn desktop_status()->serde_json::Value {
    let file=crate::settings::local_dir().join("desktop-status.json");
    let fresh=std::fs::metadata(&file).and_then(|m|m.modified()).ok().and_then(|t|t.elapsed().ok()).is_some_and(|age|age<Duration::from_secs(15));
    if !fresh{return serde_json::json!({});}
    std::fs::read_to_string(file).ok().filter(|s|s.len()<16000).and_then(|s|serde_json::from_str(&s).ok()).unwrap_or_else(||serde_json::json!({}))
}

pub fn start_monitor(){
    let mut command=std::process::Command::new("C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe");
    use std::os::windows::process::CommandExt;
    command.args(["-NoProfile","-ExecutionPolicy","Bypass","-File",crate::runtime::path("pc-control/monitor.ps1").to_str().unwrap_or(""),"-ParentId",&std::process::id().to_string()]);
    command.env("TEMP",crate::runtime::temp()).env("TMP",crate::runtime::temp()).stdout(Stdio::null()).stderr(Stdio::null()).creation_flags(0x0800_0000);
    let _=command.spawn();
}

#[tauri::command]
pub async fn open_agent_window(app_name:String,project:Option<String>)->Result<(),String>{
    if !matches!(app_name.as_str(),"codex"|"gemini"|"vscode"){return Err("Unknown app.".into());}
    let mut command=helper(crate::runtime::path("Focus-Agent.ps1"));
    command.arg("-AppName").arg(app_name);
    if let Some(project)=project {command.arg("-Project").arg(project);}
    let output=tokio::time::timeout(Duration::from_secs(20),command.output()).await.map_err(|_|"Opening the app timed out.")?.map_err(|_|"Cannot open the app.")?;
    if !output.status.success(){return Err(String::from_utf8_lossy(&output.stderr).chars().take(400).collect());}
    Ok(())
}
#[tauri::command]
pub fn open_desktop_app(app_name:String)->Result<(),String>{
    use std::os::windows::process::CommandExt;
    let mut command={
        let mut command=std::process::Command::new("C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe");
        let file=match app_name.as_str(){"gemini"=>crate::runtime::path("Start-Gemini.ps1"),"codex"=>crate::runtime::path("Start-Codex.ps1"),"vscode"=>crate::runtime::path("Start-VSCode.ps1"),_=>return Err("Unknown app.".into())};
        command.args(["-NoProfile","-ExecutionPolicy","Bypass","-File"]).arg(file);
        command
    };
    command.env("TEMP",crate::runtime::temp()).env("TMP",crate::runtime::temp());
    command.creation_flags(if app_name=="codex"{0x00000010}else{0x0800_0000});
    command.spawn().map_err(|_|"Could not open the selected app.".to_string())?;
    Ok(())
}
