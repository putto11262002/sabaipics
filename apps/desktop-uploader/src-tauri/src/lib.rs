#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_oauth::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            set_auth_token,
            get_auth_token,
            clear_auth_token
        ])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

const TOKEN_SERVICE: &str = "FrameFast";
const TOKEN_ACCOUNT: &str = "auth_token";

#[tauri::command]
fn set_auth_token(token: String) -> Result<(), String> {
    let entry = keyring::Entry::new(TOKEN_SERVICE, TOKEN_ACCOUNT).map_err(|e| e.to_string())?;
    entry.set_password(&token).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn get_auth_token() -> Result<Option<String>, String> {
    let entry = keyring::Entry::new(TOKEN_SERVICE, TOKEN_ACCOUNT).map_err(|e| e.to_string())?;
    match entry.get_password() {
        Ok(token) => Ok(Some(token)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(err) => Err(err.to_string()),
    }
}

#[tauri::command]
fn clear_auth_token() -> Result<(), String> {
    let entry = keyring::Entry::new(TOKEN_SERVICE, TOKEN_ACCOUNT).map_err(|e| e.to_string())?;
    match entry.delete_password() {
        Ok(_) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(err) => Err(err.to_string()),
    }
}
