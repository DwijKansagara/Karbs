use std::path::PathBuf;
use tauri::Manager;
pub fn root()->PathBuf{std::env::var_os("KARBS_ROOT").map(PathBuf::from).unwrap_or_else(||PathBuf::from("../../runtime"))}
pub fn path(p:&str)->PathBuf{root().join(p)}
pub fn temp()->PathBuf{crate::settings::local_dir().join("temp")}
pub fn node()->PathBuf{crate::settings::local_dir().join("tools/node/node.exe")}
pub fn python()->PathBuf{crate::settings::local_dir().join("tools/python/python.exe")}
pub fn initialize(app:&tauri::AppHandle)->Result<(),Box<dyn std::error::Error>>{
 let resources=app.path().resource_dir()?;
 let runtime=if resources.join("runtime").exists(){resources.join("runtime")}else{PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../runtime")};
 std::env::set_var("KARBS_ROOT",runtime);std::env::set_var("COUCOU_DATA_DIR",crate::settings::local_dir());
 std::env::set_var("KARBS_HOOK",crate::settings::hook_exe_path());
 std::fs::create_dir_all(temp())?;Ok(())
}
#[tauri::command]
pub async fn setup_runtime(voice:bool)->Result<String,String>{
 let mut c=tokio::process::Command::new("powershell.exe");
 c.args(["-NoProfile","-ExecutionPolicy","Bypass","-File"]).arg(path("Setup.ps1"));if voice{c.arg("-Voice");}
 c.creation_flags(0x0800_0000).kill_on_drop(true);
 let out=tokio::time::timeout(std::time::Duration::from_secs(1200),c.output()).await.map_err(|_|"Setup timed out.")?.map_err(|_|"Cannot start setup.")?;
 if !out.status.success(){return Err(String::from_utf8_lossy(&out.stderr).chars().take(600).collect());}Ok("Components are ready.".into())
}
