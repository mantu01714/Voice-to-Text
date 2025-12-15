// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::ClipboardManager;
use enigo::{Enigo, KeyboardControllable};
use reqwest::multipart;
use serde_json::Value;

#[tauri::command]
async fn copy_to_clipboard(app_handle: tauri::AppHandle, text: String) -> Result<(), String> {
    app_handle
        .clipboard_manager()
        .write_text(text)
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn insert_text(app_handle: tauri::AppHandle, text: String) -> Result<(), String> {
    // First copy text to clipboard
    copy_to_clipboard(app_handle, text).await?;
    
    // Then simulate Ctrl+V to paste
    let mut enigo = Enigo::new();
    
    // Small delay to ensure clipboard is ready
    std::thread::sleep(std::time::Duration::from_millis(100));
    
    // Simulate Ctrl+V
    enigo.key_down(enigo::Key::Control);
    enigo.key_click(enigo::Key::Layout('v'));
    enigo.key_up(enigo::Key::Control);
    
    Ok(())
}

#[tauri::command]
async fn test_deepgram_connection(api_key: String) -> Result<(), String> {
    let client = reqwest::Client::new();
    
    let response = client
        .get("https://api.deepgram.com/v1/projects")
        .header("Authorization", format!("Token {}", api_key))
        .send()
        .await
        .map_err(|e| format!("Connection test failed: {}", e))?;
    
    if !response.status().is_success() {
        if response.status() == 401 {
            return Err("Invalid API key. Please check your Deepgram API key.".to_string());
        }
        return Err(format!("API connection failed: {}", response.status()));
    }
    
    Ok(())
}

#[tauri::command]
async fn transcribe_audio(api_key: String, audio_data: Vec<u8>) -> Result<String, String> {
    let client = reqwest::Client::new();
    
    let form = multipart::Form::new()
        .part("audio", multipart::Part::bytes(audio_data)
            .file_name("audio.webm")
            .mime_str("audio/webm").unwrap());
    
    let response = client
        .post("https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true")
        .header("Authorization", format!("Token {}", api_key))
        .multipart(form)
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?;
    
    if !response.status().is_success() {
        return Err(format!("API error: {}", response.status()));
    }
    
    let json: Value = response.json().await
        .map_err(|e| format!("JSON parse error: {}", e))?;
    
    let transcript = json["results"]["channels"][0]["alternatives"][0]["transcript"]
        .as_str()
        .unwrap_or("")
        .to_string();
    
    Ok(transcript)
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![copy_to_clipboard, insert_text, test_deepgram_connection, transcribe_audio])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}