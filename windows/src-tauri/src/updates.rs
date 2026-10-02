use tauri_plugin_updater::UpdaterExt;
use tauri::Emitter;
pub fn start(app:tauri::AppHandle){
 tauri::async_runtime::spawn(async move{
  tokio::time::sleep(std::time::Duration::from_secs(20)).await;
  loop{
   if let Ok(updater)=app.updater(){if let Ok(Some(update))=updater.check().await{let _=app.emit("update-available",serde_json::json!({"version":update.version}));}}
   tokio::time::sleep(std::time::Duration::from_secs(6*60*60)).await;
  }
 });
}
#[tauri::command]
pub async fn check_update(app:tauri::AppHandle)->Result<serde_json::Value,String>{
 let update=app.updater().map_err(|e|e.to_string())?.check().await.map_err(|e|e.to_string())?;
 Ok(match update{Some(u)=>serde_json::json!({"version":u.version,"notes":u.body}),None=>serde_json::json!({"current":true})})
}
#[tauri::command]
pub async fn install_update(app:tauri::AppHandle)->Result<(),String>{
 if let Some(update)=app.updater().map_err(|e|e.to_string())?.check().await.map_err(|e|e.to_string())?{
  update.download_and_install(|_,_|{},||{}).await.map_err(|e|e.to_string())?;app.restart();
 }Ok(())
}
