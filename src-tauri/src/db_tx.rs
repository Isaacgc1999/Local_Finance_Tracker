//! Transacciones atómicas sobre el pool de `tauri-plugin-sql`.
//!
//! El plugin abre un pool de varias conexiones sqlx; dos `execute()` desde JS
//! pueden caer en conexiones distintas, así que `BEGIN`/`COMMIT` sueltos no
//! serían atómicos. Este comando toma UNA conexión del mismo pool y ejecuta
//! todas las sentencias dentro de `BEGIN IMMEDIATE … COMMIT`, con `ROLLBACK`
//! automático si cualquiera falla.

use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;
use sqlx::{sqlite::Sqlite, Connection};
use tauri::State;
use tauri_plugin_sql::{DbInstances, DbPool};

#[derive(Deserialize)]
pub struct TxStatement {
    pub sql: String,
    #[serde(default)]
    pub params: Vec<JsonValue>,
}

#[derive(Serialize)]
pub struct TxOutcome {
    pub rows_affected: u64,
}

fn bind_json<'q>(
    query: sqlx::query::Query<'q, Sqlite, sqlx::sqlite::SqliteArguments<'q>>,
    value: JsonValue,
) -> sqlx::query::Query<'q, Sqlite, sqlx::sqlite::SqliteArguments<'q>> {
    match value {
        JsonValue::Null => query.bind(None::<String>),
        JsonValue::Bool(b) => query.bind(if b { 1_i64 } else { 0_i64 }),
        JsonValue::Number(n) => {
            if let Some(i) = n.as_i64() {
                query.bind(i)
            } else {
                query.bind(n.as_f64().unwrap_or(0.0))
            }
        }
        JsonValue::String(s) => query.bind(s),
        other => query.bind(other.to_string()),
    }
}

/// `db` es la misma clave que se pasó a `Database.load()` en JS (`sqlite:<ruta>`).
#[tauri::command]
pub async fn db_transaction(
    db_instances: State<'_, DbInstances>,
    db: String,
    statements: Vec<TxStatement>,
) -> Result<TxOutcome, String> {
    let pool = {
        let instances = db_instances.0.read().await;
        // `DbPool` solo tiene la variante Sqlite con las features que usamos,
        // así que no hace falta un brazo para "otro motor": si algún día el
        // plugin añade otro, el compilador obligará a tratarlo aquí.
        match instances.get(&db) {
            Some(DbPool::Sqlite(pool)) => pool.clone(),
            None => return Err(format!("base de datos no cargada: {db}")),
        }
    };

    let mut conn = pool.acquire().await.map_err(|e| e.to_string())?;
    let mut tx = conn
        .begin_with("BEGIN IMMEDIATE")
        .await
        .map_err(|e| e.to_string())?;

    let mut rows_affected = 0_u64;
    for statement in statements {
        let mut query = sqlx::query(&statement.sql);
        for value in statement.params {
            query = bind_json(query, value);
        }
        match query.execute(&mut *tx).await {
            Ok(result) => rows_affected += result.rows_affected(),
            Err(e) => {
                // Al soltar `tx` sin commit sqlx hace ROLLBACK; lo hacemos explícito.
                let _ = tx.rollback().await;
                return Err(e.to_string());
            }
        }
    }

    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(TxOutcome { rows_affected })
}
