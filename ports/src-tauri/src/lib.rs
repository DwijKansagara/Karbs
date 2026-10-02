mod platform;
mod updates;
use karbs_port_core::{Conversation,Turn};
use serde::{Deserialize,Serialize};
use serde_json::{json,Value};
use std::{path::PathBuf,sync::{Mutex,atomic::{AtomicBool,Ordering}}};
use tauri::{AppHandle,Emitter,Manager,State};
use tauri_plugin_opener::OpenerExt;
use tokio::io::{AsyncBufReadExt,BufReader};

#[derive(Clone,Serialize,Deserialize)]
#[serde(rename_all="camelCase",default)]
pub struct Preferences{provider:String,gemini_model:String,codex_model:String,full_access:bool,phone_access:bool,speak_replies:bool}
impl Default for Preferences{fn default()->Self{Self{provider:"gemini".into(),gemini_model:"gemini-2.5-flash".into(),codex_model:String::new(),full_access:false,phone_access:false,speak_replies:false}}}
pub struct Shared{preferences:Mutex<Preferences>,conversation:tokio::sync::Mutex<Conversation>,cancel:tokio::sync::Notify,key:Mutex<String>,login:AtomicBool,speech:Mutex<Option<std::process::Child>>,data:PathBuf}
fn data(app:&AppHandle)->Result<PathBuf,String>{std::env::var_os("KARBS_PORT_DATA").map(PathBuf::from).map(Ok).unwrap_or_else(||app.path().app_data_dir().map_err(|_|"Cannot locate app storage.".into()))}
fn codex_path(app:&AppHandle)->Result<PathBuf,String>{
    if !karbs_port_core::desktop(){return Err("Codex CLI is unavailable on Android.".into());}
    if let Some(path)=std::env::var_os("KARBS_CODEX_PATH"){return Ok(PathBuf::from(path));}
    let resource=app.path().resource_dir().map_err(|_|"Cannot locate app components.")?;
    Ok(resource.join("codex").join(if cfg!(windows){"codex.exe"}else{"codex"}))
}
#[tauri::command]
async fn boot(app:AppHandle,shared:State<'_,Shared>)->Result<Value,String>{
    let key=platform::read_key(&app);let key_error=key.as_ref().err().cloned();if let Ok(k)=key{*shared.key.lock().map_err(|_|"Key state unavailable.")?=k;}
    Ok(json!({"preferences":shared.preferences.lock().map_err(|_|"Settings unavailable.")?.clone(),"platform":std::env::consts::OS,"version":env!("CARGO_PKG_VERSION"),"keyPresent":!shared.key.lock().map_err(|_|"Key state unavailable.")?.is_empty(),"keyError":key_error,"capabilities":{"codex":karbs_port_core::desktop(),"fullAccess":karbs_port_core::desktop(),"gemini":true,"attachments":true,"systemSpeech":cfg!(any(target_os="macos",target_os="linux",target_os="android")),"pointerControl":false,"voiceInput":false}}))
}
#[tauri::command]
fn save_preferences(app:AppHandle,shared:State<Shared>,mut preferences:Preferences)->Result<(),String>{
    if !["gemini","codex"].contains(&preferences.provider.as_str()){return Err("Unknown provider.".into());}
    karbs_port_core::validate_model(&preferences.gemini_model)?;
    if !karbs_port_core::desktop(){preferences.provider="gemini".into();preferences.full_access=false;}
    if preferences.phone_access { if !cfg!(target_os="android"){return Err("Phone Assist requires Android.".into());}if platform::phone(&app,"phoneStatus",json!({}))?["enabled"]!=true{return Err("Enable Karbs Phone Assist in Android Accessibility settings first.".into());} }
    let text=serde_json::to_vec_pretty(&preferences).map_err(|_|"Cannot encode preferences.")?;
    let path=shared.data.join("preferences.json");let temp=shared.data.join("preferences.next.json");
    std::fs::write(&temp,text).map_err(|_|"Cannot save preferences.")?;
    #[cfg(windows)]if path.exists(){std::fs::remove_file(&path).map_err(|_|"Cannot replace preferences.")?;}
    std::fs::rename(temp,path).map_err(|_|"Cannot replace preferences.")?;*shared.preferences.lock().map_err(|_|"Settings unavailable.")?=preferences;Ok(())
}
#[tauri::command]
async fn set_gemini_key(app:AppHandle,shared:State<'_,Shared>,value:String)->Result<(),String>{
    if value.len()>4096{return Err("Invalid key length.".into());}
    let key=value.trim();platform::write_key(&app,key)?;*shared.key.lock().map_err(|_|"Key state unavailable.")?=key.to_owned();Ok(())
}
#[tauri::command]
async fn use_session_key(shared:State<'_,Shared>,value:String)->Result<(),String>{if value.trim().is_empty()||value.len()>4096{return Err("Enter a valid key.".into());}*shared.key.lock().map_err(|_|"Key state unavailable.")?=value.trim().into();Ok(())}
#[tauri::command]
async fn attachment_name(app:AppHandle,path:String)->Result<String,String>{platform::attachment_name(&app,&path)}
#[tauri::command]
async fn list_models(shared:State<'_,Shared>)->Result<Vec<String>,String>{let key=shared.key.lock().map_err(|_|"Key state unavailable.")?.clone();karbs_port_core::models(&key).await}
#[tauri::command]
async fn chat_send(app:AppHandle,shared:State<'_,Shared>,turn:Turn)->Result<String,String>{
    karbs_port_core::validate_turn(&turn)?;
    if turn.full_access&&!shared.preferences.lock().map_err(|_|"Settings unavailable.")?.full_access{return Err("Enable Full access in Settings before sending this task.".into());}
    if turn.phone_access&&!shared.preferences.lock().map_err(|_|"Settings unavailable.")?.phone_access{return Err("Enable Phone Assist in Settings before sending this task.".into());}
    let mut chat=shared.conversation.try_lock().map_err(|_|"A task is already running.")?;
    let cancelled=shared.cancel.notified();tokio::pin!(cancelled);cancelled.as_mut().enable();
    let history=if chat.provider==turn.provider{chat.messages.clone()}else{Vec::new()};
    let emit=|message:String|{let _=app.emit("activity",message);};
    struct PhoneGuard(Option<AppHandle>);impl Drop for PhoneGuard{fn drop(&mut self){if let Some(app)=&self.0{let _=platform::phone(app,"phoneTask",json!({"active":false}));}}}
    let _phone_guard=if turn.phone_access{platform::phone(&app,"phoneTask",json!({"active":true}))?;PhoneGuard(Some(app.clone()))}else{PhoneGuard(None)};
    let phone_app=app.clone();let phone_executor:Box<karbs_port_core::PhoneExecutor>=Box::new(move|args:Value|{let app=phone_app.clone();Box::pin(async move{let action=args["action"].as_str().ok_or("Missing phone action.")?.to_owned();let args=serde_json::to_string(&args).map_err(|_|"Invalid phone arguments.")?;let result=tauri::async_runtime::spawn_blocking(move||platform::phone(&app,"phoneAction",json!({"action":action,"args":args}))).await.map_err(|_|"Phone service interrupted.")??;tokio::time::sleep(std::time::Duration::from_millis(600)).await;serde_json::to_string(&result).map_err(|_|"Invalid phone result.".into())})});
    let task=async{if turn.provider=="gemini"{let key=shared.key.lock().map_err(|_|"Key state unavailable.")?.clone();karbs_port_core::gemini(&turn,&history,&key,&shared.data.join("workspace"),&emit,if turn.phone_access{Some(phone_executor.as_ref())}else{None}).await}else{karbs_port_core::codex(&turn,&history,&codex_path(&app)?,&shared.data.join("workspace"),&emit).await}};
    let reply=tokio::select!{result=task=>result,_=cancelled=>Err("Task stopped. Actions already completed remain in effect.".into())};
    let (text,messages)=reply?;chat.provider=turn.provider;chat.messages=messages;Ok(text)
}
#[tauri::command]
async fn reset_chat(shared:State<'_,Shared>)->Result<(),String>{let mut chat=shared.conversation.try_lock().map_err(|_|"Wait for the active task to finish.")?;*chat=Conversation::default();Ok(())}
#[tauri::command]
fn stop_task(shared:State<Shared>){shared.cancel.notify_waiters();}
#[tauri::command]
async fn floating_bar(app:AppHandle,action:String,text:Option<String>,working:Option<bool>)->Result<Value,String>{platform::overlay(&app,&action,text.as_deref().unwrap_or("Karbs · Ready"),working.unwrap_or(false))}
#[tauri::command]
async fn phone_setup(app:AppHandle,shared:State<'_,Shared>,action:String)->Result<Value,String>{match action.as_str(){"permission"=>platform::phone(&app,"phonePermission",json!({})),"status"=>platform::phone(&app,"phoneStatus",json!({})),"test"=>{if !shared.preferences.lock().map_err(|_|"Settings unavailable.")?.phone_access{return Err("Enable Phone Assist first.".into());}let _guard=shared.conversation.try_lock().map_err(|_|"Wait for the active task to finish.")?;platform::phone(&app,"testPhone",json!({}))},_=>Err("Unknown phone setup action.".into())}}
struct LoginGuard<'a>(&'a AtomicBool);
impl Drop for LoginGuard<'_>{fn drop(&mut self){self.0.store(false,Ordering::Release);}}
#[tauri::command]
async fn login_codex(app:AppHandle,shared:State<'_,Shared>)->Result<(),String>{
    if shared.login.swap(true,Ordering::AcqRel){return Err("Codex sign-in is already open.").map_err(str::to_owned);}
    let _guard=LoginGuard(&shared.login);let mut command=tokio::process::Command::new(codex_path(&app)?);command.args(["login","--device-auth"]).stdout(std::process::Stdio::piped()).stderr(std::process::Stdio::piped()).kill_on_drop(true);
    #[cfg(windows)]command.creation_flags(0x0800_0000);
    let mut child=command.spawn().map_err(|_|"Could not start Codex sign-in.")?;
    let out=child.stdout.take().ok_or("Cannot read sign-in.")?;let err=child.stderr.take().ok_or("Cannot read sign-in status.")?;
    let read=|stream|{let app=app.clone();async move{let mut lines=BufReader::new(stream).lines();while let Some(line)=lines.next_line().await.map_err(|_|"Cannot read sign-in status.")?{let _=app.emit("auth-status",line);}Ok::<(),&str>(())}};
    // stdout/stderr have distinct types, so use equivalent readers explicitly.
    let stderr=async{let mut lines=BufReader::new(err).lines();while let Some(line)=lines.next_line().await.map_err(|_|"Cannot read sign-in status.")?{let _=app.emit("auth-status",line);}Ok::<(),&str>(())};
    let status=tokio::time::timeout(std::time::Duration::from_secs(600),async{let(_,_,status)=tokio::try_join!(read(out),stderr,async{child.wait().await.map_err(|_|"Cannot wait for sign-in.")})?;Ok::<_,&str>(status)}).await.map_err(|_|"Codex sign-in timed out.")?.map_err(str::to_owned)?;
    if status.success(){Ok(())}else{Err("Codex sign-in did not complete. Try again.".into())}
}
#[tauri::command]
fn open_provider(app:AppHandle,provider:String)->Result<(),String>{let url=match provider.as_str(){"gemini"=>"https://gemini.google.com/","codex"=>"https://chatgpt.com/codex","privacy"=>"https://karbs.antideploy.app/privacy/","terms"=>"https://karbs.antideploy.app/terms/",_=>return Err("Unknown app link.".into())};app.opener().open_url(url,None::<&str>).map_err(|_|"Cannot open the system browser.".into())}
#[tauri::command]
async fn speak(app:AppHandle,text:String)->Result<(),String>{platform::speak(&app,&text)}
#[tauri::command]
async fn stop_speech(app:AppHandle)->Result<(),String>{platform::stop_speech(&app)}

#[cfg_attr(mobile,tauri::mobile_entry_point)]
pub fn run(){
    let builder=tauri::Builder::default().plugin(platform::plugin()).plugin(tauri_plugin_dialog::init()).plugin(tauri_plugin_fs::init()).plugin(tauri_plugin_opener::init());
    #[cfg(not(any(target_os="android",target_os="ios")))]let builder=builder.plugin(tauri_plugin_updater::Builder::new().build());
    builder.setup(|app|{
        let dir=data(app.handle())?;std::fs::create_dir_all(&dir)?;
        let mut preferences=std::fs::read(dir.join("preferences.json")).ok().and_then(|b|serde_json::from_slice::<Preferences>(&b).ok()).unwrap_or_default();
        if !karbs_port_core::desktop(){preferences.full_access=false;preferences.provider="gemini".into();}
        app.manage(Shared{preferences:Mutex::new(preferences),conversation:tokio::sync::Mutex::new(Conversation::default()),cancel:tokio::sync::Notify::new(),key:Mutex::new(String::new()),login:AtomicBool::new(false),speech:Mutex::new(None),data:dir});updates::start(app.handle().clone());Ok(())
    }).invoke_handler(tauri::generate_handler![boot,save_preferences,set_gemini_key,use_session_key,attachment_name,list_models,chat_send,reset_chat,stop_task,floating_bar,phone_setup,login_codex,open_provider,speak,stop_speech,updates::check_update,updates::install_update]).run(tauri::generate_context!()).expect("Unable to start Karbs");
}
