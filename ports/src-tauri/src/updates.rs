use tauri::{AppHandle,Emitter};use serde_json::{json,Value};
#[cfg(not(any(target_os="android",target_os="ios")))]use tauri_plugin_updater::UpdaterExt;
#[tauri::command]
pub async fn check_update(app:AppHandle)->Result<Value,String>{
 #[cfg(not(any(target_os="android",target_os="ios")))]{let update=app.updater().map_err(|_|"Updater is unavailable.")?.check().await.map_err(|_|"Cannot reach the preview update channel. Check GitHub releases.")?;Ok(match update{Some(u)=>json!({"version":u.version,"notes":u.body}),None=>json!({"current":true})})}
 #[cfg(any(target_os="android",target_os="ios"))]{let _=app;Ok(json!({"manual":true,"message":"Download the latest signed Android APK from the Karbs website. Android asks you to approve installation."}))}
}
#[tauri::command]
pub async fn install_update(app:AppHandle)->Result<(),String>{
 #[cfg(not(any(target_os="android",target_os="ios")))]{if let Some(u)=app.updater().map_err(|_|"Updater is unavailable.")?.check().await.map_err(|_|"Cannot reach the preview update channel.")?{u.download_and_install(|_,_|{},||{}).await.map_err(|_|"The signed update could not be installed.")?;app.restart();}Ok(())}
 #[cfg(any(target_os="android",target_os="ios"))]{let _=app;Err("Use the signed APK download on Android.".into())}
}
pub fn start(app:AppHandle){
 #[cfg(not(any(target_os="android",target_os="ios")))]tauri::async_runtime::spawn(async move{tokio::time::sleep(std::time::Duration::from_secs(20)).await;loop{if let Ok(info)=check_update(app.clone()).await{if info.get("version").is_some(){let _=app.emit("update-available",info);}}tokio::time::sleep(std::time::Duration::from_secs(6*60*60)).await;}});
 #[cfg(any(target_os="android",target_os="ios"))]let _=app;
}
