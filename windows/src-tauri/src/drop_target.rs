//! Own the innermost WebView2 OLE target, rather than relying on a parent target
//! after revocation. Explorer uses the innermost window for file drops.
use std::{cell::{Cell, RefCell}, collections::HashMap};
use tauri::{AppHandle, Emitter};
use windows::core::{implement, Ref, Result, BOOL};
use windows::Win32::{Foundation::{HWND, LPARAM, POINTL}, System::{Com::{IDataObject, FORMATETC, DVASPECT_CONTENT, TYMED_HGLOBAL}, Ole::{IDropTarget, IDropTarget_Impl, RegisterDragDrop, RevokeDragDrop, ReleaseStgMedium, DROPEFFECT, DROPEFFECT_COPY, DROPEFFECT_NONE}, SystemServices::MODIFIERKEYS_FLAGS}, UI::{Shell::{DragQueryFileW, HDROP}, WindowsAndMessaging::{EnumChildWindows, GetClassNameW}}};

thread_local! { static TARGETS: RefCell<HashMap<usize, IDropTarget>> = RefCell::new(HashMap::new()); }

fn format() -> FORMATETC {
    FORMATETC { cfFormat: 15, dwAspect: DVASPECT_CONTENT.0, lindex: -1, tymed: TYMED_HGLOBAL.0 as u32, ..Default::default() }
}

#[implement(IDropTarget)]
struct Target { app: AppHandle, accepts_files: Cell<bool> }

impl Target {
    fn emit(&self, event: &str, paths: Vec<String>) {
        let _ = self.app.emit_to("island", "coucou-file-drag", serde_json::json!({"type":event,"paths":paths}));
    }
    unsafe fn effect(&self, effect: *mut DROPEFFECT) {
        if !effect.is_null() { unsafe { *effect = if self.accepts_files.get() { DROPEFFECT_COPY } else { DROPEFFECT_NONE }; } }
    }
}

impl IDropTarget_Impl for Target_Impl {
    fn DragEnter(&self, data: Ref<'_, IDataObject>, _: MODIFIERKEYS_FLAGS, _: &POINTL, effect: *mut DROPEFFECT) -> Result<()> {
        let accepts = data.as_ref().is_some_and(|d| unsafe { d.QueryGetData(&format()).is_ok() });
        self.accepts_files.set(accepts);
        unsafe { self.effect(effect); }
        if accepts { self.emit("enter", vec![]); }
        Ok(())
    }
    fn DragOver(&self, _: MODIFIERKEYS_FLAGS, _: &POINTL, effect: *mut DROPEFFECT) -> Result<()> {
        unsafe { self.effect(effect); }
        Ok(())
    }
    fn DragLeave(&self) -> Result<()> {
        self.accepts_files.set(false);
        self.emit("leave", vec![]);
        Ok(())
    }
    fn Drop(&self, data: Ref<'_, IDataObject>, _: MODIFIERKEYS_FLAGS, _: &POINTL, effect: *mut DROPEFFECT) -> Result<()> {
        let mut paths = vec![];
        if let Some(data) = data.as_ref() {
            if let Ok(mut medium) = unsafe { data.GetData(&format()) } {
                if medium.tymed == TYMED_HGLOBAL.0 as u32 {
                    let drop = HDROP(unsafe { medium.u.hGlobal.0 });
                    let count = unsafe { DragQueryFileW(drop, u32::MAX, None) }.min(100);
                    for index in 0..count {
                        let len = unsafe { DragQueryFileW(drop, index, None) };
                        if len == 0 || len > 32767 { continue; }
                        let mut name = vec![0u16; len as usize + 1];
                        unsafe { DragQueryFileW(drop, index, Some(&mut name)); }
                        paths.push(String::from_utf16_lossy(&name[..len as usize]));
                    }
                }
                unsafe { ReleaseStgMedium(&mut medium); }
            }
        }
        self.accepts_files.set(!paths.is_empty());
        unsafe { self.effect(effect); }
        if !paths.is_empty() { self.emit("drop", paths); }
        else { self.emit("leave", vec![]); }
        self.accepts_files.set(false);
        Ok(())
    }
}

unsafe fn register(app: &AppHandle, hwnd: HWND) {
    TARGETS.with(|targets| {
        let mut targets = targets.borrow_mut();
        let key = hwnd.0 as usize;
        if targets.contains_key(&key) { return; }
        let target: IDropTarget = Target { app: app.clone(), accepts_files: Cell::new(false) }.into();
        let _ = unsafe { RevokeDragDrop(hwnd) };
        if unsafe { RegisterDragDrop(hwnd, &target) }.is_ok() { targets.insert(key, target); }
    });
}

unsafe extern "system" fn child(hwnd: HWND, param: LPARAM) -> BOOL {
    let mut name = [0u16; 80];
    let len = unsafe { GetClassNameW(hwnd, &mut name) };
    let name = String::from_utf16_lossy(&name[..len.max(0) as usize]);
    if name == "Chrome_RenderWidgetHostHWND" {
        let app = unsafe { &*(param.0 as *const AppHandle) };
        unsafe { register(app, hwnd); }
    }
    true.into()
}

pub fn install(app: &AppHandle, hwnd: HWND) {
    unsafe {
        register(app, hwnd);
        let _ = EnumChildWindows(Some(hwnd), Some(child), LPARAM(app as *const AppHandle as isize));
    }
}
