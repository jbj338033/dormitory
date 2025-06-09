use sqlx::{SqlitePool, Row};
use serde::{Deserialize, Serialize};
use chrono::{DateTime, Utc, Local};
use std::path::PathBuf;
use tauri::{Manager, AppHandle};

#[derive(Debug, Serialize, Deserialize)]
pub struct Record {
    pub id: Option<i32>,
    pub student_id: String,
    pub name: String,
    pub reason: String,
    pub points: i32,
    pub point_type: String,
    pub timestamp: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Summary {
    pub student_id: String,
    pub name: String,
    pub merit: i32,
    pub demerit: i32,
    pub offset: i32,
    pub total: i32,
    pub last_activity: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Config {
    pub password: String,
}

pub struct AppState {
    pub db: SqlitePool,
}

fn get_data_directory() -> PathBuf {
    #[cfg(target_os = "windows")]
    {
        let appdata = std::env::var("APPDATA").unwrap_or_else(|_| ".".to_string());
        PathBuf::from(appdata).join("DormitoryManager")
    }
    #[cfg(target_os = "macos")]
    {
        let home = std::env::var("HOME").unwrap_or_else(|_| ".".to_string());
        PathBuf::from(home).join("Library").join("Application Support").join("DormitoryManager")
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        let home = std::env::var("HOME").unwrap_or_else(|_| ".".to_string());
        PathBuf::from(home).join(".dormitory-manager")
    }
}

async fn init_database() -> Result<SqlitePool, sqlx::Error> {
    let data_dir = get_data_directory();
    std::fs::create_dir_all(&data_dir).ok();
    
    let db_path = data_dir.join("data.db");
    let pool = SqlitePool::connect(&format!("sqlite:{}", db_path.display())).await?;
    
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS records (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            student_id TEXT NOT NULL,
            name TEXT NOT NULL,
            reason TEXT NOT NULL,
            points INTEGER NOT NULL,
            point_type TEXT NOT NULL DEFAULT "상점",
            timestamp TEXT NOT NULL
        )
        "#,
    )
    .execute(&pool)
    .await?;
    
    Ok(pool)
}

#[tauri::command]
async fn login(password: String, app_handle: AppHandle) -> Result<bool, String> {
    let data_dir = get_data_directory();
    let config_path = data_dir.join("config.json");
    
    let stored_password = if config_path.exists() {
        match std::fs::read_to_string(&config_path) {
            Ok(content) => {
                match serde_json::from_str::<Config>(&content) {
                    Ok(config) => config.password,
                    Err(_) => "admin123".to_string(),
                }
            }
            Err(_) => "admin123".to_string(),
        }
    } else {
        "admin123".to_string()
    };
    
    Ok(password == stored_password)
}

#[tauri::command]
async fn change_password(old_password: String, new_password: String, app_handle: AppHandle) -> Result<bool, String> {
    let data_dir = get_data_directory();
    let config_path = data_dir.join("config.json");
    
    let stored_password = if config_path.exists() {
        match std::fs::read_to_string(&config_path) {
            Ok(content) => {
                match serde_json::from_str::<Config>(&content) {
                    Ok(config) => config.password,
                    Err(_) => "admin123".to_string(),
                }
            }
            Err(_) => "admin123".to_string(),
        }
    } else {
        "admin123".to_string()
    };
    
    if old_password != stored_password {
        return Ok(false);
    }
    
    if new_password.len() < 3 {
        return Err("비밀번호는 최소 3자 이상이어야 합니다".to_string());
    }
    
    let config = Config { password: new_password };
    std::fs::create_dir_all(&data_dir).ok();
    
    match serde_json::to_string_pretty(&config) {
        Ok(json) => {
            match std::fs::write(&config_path, json) {
                Ok(_) => Ok(true),
                Err(_) => Err("설정 저장에 실패했습니다".to_string()),
            }
        }
        Err(_) => Err("설정 직렬화에 실패했습니다".to_string()),
    }
}

#[tauri::command]
async fn add_record(
    student_id: String,
    name: String,
    reason: String,
    points: i32,
    point_type: String,
    app_handle: AppHandle,
) -> Result<(), String> {
    let state = app_handle.state::<AppState>();
    let timestamp = Local::now().format("%Y-%m-%d %H:%M").to_string();
    
    let actual_points = if point_type == "벌점" { -points.abs() } else { points };
    
    sqlx::query(
        "INSERT INTO records (student_id, name, reason, points, point_type, timestamp) VALUES (?, ?, ?, ?, ?, ?)"
    )
    .bind(&student_id)
    .bind(&name)
    .bind(&reason)
    .bind(actual_points)
    .bind(&point_type)
    .bind(&timestamp)
    .execute(&state.db)
    .await
    .map_err(|e| format!("데이터베이스 오류: {}", e))?;
    
    Ok(())
}

#[tauri::command]
async fn get_records(app_handle: AppHandle) -> Result<Vec<Record>, String> {
    let state = app_handle.state::<AppState>();
    
    let rows = sqlx::query("SELECT id, student_id, name, reason, points, point_type, timestamp FROM records ORDER BY timestamp DESC")
        .fetch_all(&state.db)
        .await
        .map_err(|e| format!("데이터베이스 오류: {}", e))?;
    
    let records: Vec<Record> = rows
        .into_iter()
        .map(|row| Record {
            id: Some(row.get::<i32, _>("id")),
            student_id: row.get::<String, _>("student_id"),
            name: row.get::<String, _>("name"),
            reason: row.get::<String, _>("reason"),
            points: row.get::<i32, _>("points"),
            point_type: row.get::<String, _>("point_type"),
            timestamp: row.get::<String, _>("timestamp"),
        })
        .collect();
    
    Ok(records)
}

#[tauri::command]
async fn get_summary(app_handle: AppHandle) -> Result<Vec<Summary>, String> {
    let state = app_handle.state::<AppState>();
    
    let rows = sqlx::query(
        r#"
        SELECT student_id, name,
               SUM(CASE WHEN point_type = "상점" THEN points ELSE 0 END) as merit,
               SUM(CASE WHEN point_type = "벌점" THEN ABS(points) ELSE 0 END) as demerit,
               SUM(CASE WHEN point_type = "상쇄점" THEN points ELSE 0 END) as offset,
               SUM(points) as total,
               MAX(timestamp) as last_activity
        FROM records 
        GROUP BY student_id, name 
        ORDER BY last_activity DESC
        "#
    )
    .fetch_all(&state.db)
    .await
    .map_err(|e| format!("데이터베이스 오류: {}", e))?;
    
    let summaries: Vec<Summary> = rows
        .into_iter()
        .map(|row| Summary {
            student_id: row.get::<String, _>("student_id"),
            name: row.get::<String, _>("name"),
            merit: row.get::<i32, _>("merit"),
            demerit: row.get::<i32, _>("demerit"),
            offset: row.get::<i32, _>("offset"),
            total: row.get::<i32, _>("total"),
            last_activity: row.get::<String, _>("last_activity"),
        })
        .collect();
    
    Ok(summaries)
}

#[tauri::command]
async fn search_records(term: String, app_handle: AppHandle) -> Result<Vec<Record>, String> {
    let state = app_handle.state::<AppState>();
    let search_term = format!("%{}%", term.to_lowercase());
    
    let rows = sqlx::query(
        "SELECT id, student_id, name, reason, points, point_type, timestamp FROM records 
         WHERE LOWER(student_id) LIKE ? OR LOWER(name) LIKE ? OR LOWER(reason) LIKE ?
         ORDER BY timestamp DESC"
    )
    .bind(&search_term)
    .bind(&search_term)
    .bind(&search_term)
    .fetch_all(&state.db)
    .await
    .map_err(|e| format!("데이터베이스 오류: {}", e))?;
    
    let records: Vec<Record> = rows
        .into_iter()
        .map(|row| Record {
            id: Some(row.get::<i32, _>("id")),
            student_id: row.get::<String, _>("student_id"),
            name: row.get::<String, _>("name"),
            reason: row.get::<String, _>("reason"),
            points: row.get::<i32, _>("points"),
            point_type: row.get::<String, _>("point_type"),
            timestamp: row.get::<String, _>("timestamp"),
        })
        .collect();
    
    Ok(records)
}

#[tauri::command]
async fn search_summary(term: String, app_handle: AppHandle) -> Result<Vec<Summary>, String> {
    let state = app_handle.state::<AppState>();
    let search_term = format!("%{}%", term.to_lowercase());
    
    let rows = sqlx::query(
        r#"
        SELECT student_id, name,
               SUM(CASE WHEN point_type = "상점" THEN points ELSE 0 END) as merit,
               SUM(CASE WHEN point_type = "벌점" THEN ABS(points) ELSE 0 END) as demerit,
               SUM(CASE WHEN point_type = "상쇄점" THEN points ELSE 0 END) as offset,
               SUM(points) as total,
               MAX(timestamp) as last_activity
        FROM records 
        WHERE LOWER(student_id) LIKE ? OR LOWER(name) LIKE ?
        GROUP BY student_id, name 
        ORDER BY last_activity DESC
        "#
    )
    .bind(&search_term)
    .bind(&search_term)
    .fetch_all(&state.db)
    .await
    .map_err(|e| format!("데이터베이스 오류: {}", e))?;
    
    let summaries: Vec<Summary> = rows
        .into_iter()
        .map(|row| Summary {
            student_id: row.get::<String, _>("student_id"),
            name: row.get::<String, _>("name"),
            merit: row.get::<i32, _>("merit"),
            demerit: row.get::<i32, _>("demerit"),
            offset: row.get::<i32, _>("offset"),
            total: row.get::<i32, _>("total"),
            last_activity: row.get::<String, _>("last_activity"),
        })
        .collect();
    
    Ok(summaries)
}

#[tauri::command]
async fn get_student_details(student_id: String, app_handle: AppHandle) -> Result<Vec<Record>, String> {
    let state = app_handle.state::<AppState>();
    
    let rows = sqlx::query(
        "SELECT id, student_id, name, reason, points, point_type, timestamp FROM records 
         WHERE student_id = ? ORDER BY timestamp DESC"
    )
    .bind(&student_id)
    .fetch_all(&state.db)
    .await
    .map_err(|e| format!("데이터베이스 오류: {}", e))?;
    
    let records: Vec<Record> = rows
        .into_iter()
        .map(|row| Record {
            id: Some(row.get::<i32, _>("id")),
            student_id: row.get::<String, _>("student_id"),
            name: row.get::<String, _>("name"),
            reason: row.get::<String, _>("reason"),
            points: row.get::<i32, _>("points"),
            point_type: row.get::<String, _>("point_type"),
            timestamp: row.get::<String, _>("timestamp"),
        })
        .collect();
    
    Ok(records)
}

#[tauri::command]
async fn reset_data(app_handle: AppHandle) -> Result<(), String> {
    let state = app_handle.state::<AppState>();
    
    let data_dir = get_data_directory();
    let backup_dir = data_dir.join("backups");
    std::fs::create_dir_all(&backup_dir).ok();
    
    let backup_name = format!("backup_{}.db", Local::now().format("%Y%m%d_%H%M%S"));
    let backup_path = backup_dir.join(&backup_name);
    let db_path = data_dir.join("data.db");
    
    if db_path.exists() {
        std::fs::copy(&db_path, &backup_path)
            .map_err(|_| "백업 생성에 실패했습니다".to_string())?;
    }
    
    sqlx::query("DELETE FROM records")
        .execute(&state.db)
        .await
        .map_err(|e| format!("데이터 삭제 오류: {}", e))?;
    
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let rt = tokio::runtime::Runtime::new().unwrap();
    let pool = rt.block_on(init_database()).expect("데이터베이스 초기화 실패");
    
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(AppState { db: pool })
        .invoke_handler(tauri::generate_handler![
            login,
            change_password,
            add_record,
            get_records,
            get_summary,
            search_records,
            search_summary,
            get_student_details,
            reset_data
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}