use tauri::{AppHandle, Manager};
#[cfg(target_os="android")]use serde_json::{json,Value};

#[cfg(target_os="android")]
pub struct Android(pub tauri::plugin::PluginHandle<tauri::Wry>);
pub fn plugin()->tauri::plugin::TauriPlugin<tauri::Wry>{
    tauri::plugin::Builder::new("karbs-platform").setup(|_app,_api|{
        #[cfg(target_os="android")]{let handle=_api.register_android_plugin("com.dwijkansagara.karbs.portable","KarbsPlatformPlugin")?;_app.manage(Android(handle));}
        Ok(())
    }).build()
}
#[cfg(target_os="android")]
fn mobile(app:&AppHandle,command:&str,args:Value)->Result<Value,String>{app.state::<Android>().0.run_mobile_plugin(command,args).map_err(|_|"Device service is unavailable. Reopen Karbs and try again.".into())}

#[cfg(not(target_os="android"))]
fn entry()->Result<keyring::Entry,String>{keyring::Entry::new("com.dwijkansagara.karbs.portable","gemini-api-key").map_err(|_|"Cannot open the system keyring.".into())}
pub fn read_key(app:&AppHandle)->Result<String,String>{
    #[cfg(target_os="android")]{Ok(mobile(app,"readKey",json!({}))?["value"].as_str().unwrap_or_default().to_owned())}
    #[cfg(not(target_os="android"))]{let _=app;match entry()?.get_password(){Ok(v)=>Ok(v),Err(keyring::Error::NoEntry)=>Ok(String::new()),Err(_)=>Err("Unlock your system keyring to load the Gemini key.".into())}}
}
pub fn write_key(app:&AppHandle,key:&str)->Result<(),String>{
    #[cfg(target_os="android")]{mobile(app,if key.is_empty(){"clearKey"}else{"saveKey"},json!({"value":key}))?;Ok(())}
    #[cfg(not(target_os="android"))]{let _=app;if key.is_empty(){match entry()?.delete_credential(){Ok(())|Err(keyring::Error::NoEntry)=>Ok(()),Err(_)=>Err("Cannot remove the key from the system keyring.".into())}}else{entry()?.set_password(key).map_err(|_|"Cannot save the key. Unlock your system keyring and try again.".into())}}
}
pub fn speak(app:&AppHandle,text:&str)->Result<(),String>{
    if text.len()>20_000{return Err("Reply is too long for speech.".into());}
    #[cfg(target_os="android")]{mobile(app,"speak",json!({"text":text}))?;Ok(())}
    #[cfg(not(target_os="android"))]{let shared=app.state::<crate::Shared>();let mut current=shared.speech.lock().map_err(|_|"Speech state unavailable.")?;if let Some(mut child)=current.take(){let _=child.kill();let _=child.wait();}
        #[cfg(target_os="macos")] let mut command=std::process::Command::new("/usr/bin/say");
        #[cfg(target_os="linux")] let mut command=std::process::Command::new("espeak-ng");
        #[cfg(target_os="windows")] return Err("This preview's Windows speech is not enabled; use the stable Windows app.".into());
        #[cfg(any(target_os="macos",target_os="linux"))]{command.arg("--").arg(text);*current=Some(command.spawn().map_err(|_|"System speech is unavailable. On Linux, install espeak-ng.")?);Ok(())}
    }
}
pub fn stop_speech(app:&AppHandle)->Result<(),String>{
    #[cfg(target_os="android")]{mobile(app,"stopSpeech",json!({}))?;}
    #[cfg(not(target_os="android"))]{if let Some(mut child)=app.state::<crate::Shared>().speech.lock().map_err(|_|"Speech state unavailable.")?.take(){let _=child.kill();let _=child.wait();}}
    Ok(())
}
pub fn attachment_name(app:&AppHandle,path:&str)->Result<String,String>{
    #[cfg(target_os="android")]{Ok(mobile(app,"fileName",json!({"path":path}))?["name"].as_str().ok_or("Cannot read the selected filename.")?.into())}
    #[cfg(not(target_os="android"))]{let _=app;Ok(std::path::Path::new(path).file_name().ok_or("Invalid filename.")?.to_string_lossy().into())}
}
pub fn overlay(app:&AppHandle,action:&str,text:&str,working:bool)->Result<serde_json::Value,String>{
    #[cfg(target_os="android")]{let command=match action{"status"=>"overlayStatus","permission"=>"overlayPermission","show"=>"showOverlay","hide"=>"hideOverlay","update"=>"updateOverlay",_=>return Err("Unknown floating-bar action.".into())};mobile(app,command,json!({"text":text,"working":working}))}
    #[cfg(not(target_os="android"))]{let _=(app,action,text,working);Err("This floating bar is available on Android.".into())}
}

