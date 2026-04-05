use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};

use crate::{Result, metadata::ExternalAgentSource, state_store::SessionStateStore};

pub const COORDINATOR_NAMESPACE: &str = "coordinator";
pub const DECISION_KEY: &str = "decision";
pub const CURRENT_PLAN_KEY: &str = "current_plan";
pub const NEXT_ACTION_KEY: &str = "next_action";
pub const ROUTE_CONSTRAINTS_KEY: &str = "route_constraints";
pub const DURABLE_NOTES_KEY: &str = "durable_notes";
pub const EXTERNAL_ACTIVITIES_KEY: &str = "external_activities";

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
pub struct CoordinationState {
    pub decision: Option<String>,
    pub current_plan: Option<String>,
    pub next_action: Option<String>,
    pub route_constraints: Option<String>,
    pub durable_notes: Option<String>,
    #[serde(default)]
    pub external_activities: Vec<ExternalActivity>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ExternalActivity {
    pub id: String,
    pub source: ExternalAgentSource,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    pub summary: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub link: Option<String>,
    pub attached_at: u64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub imported_session_key: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub imported_message_count: Option<u32>,
}

#[derive(Debug, Clone, Default)]
pub struct CoordinationPatch {
    pub decision: Option<Option<String>>,
    pub current_plan: Option<Option<String>>,
    pub next_action: Option<Option<String>>,
    pub route_constraints: Option<Option<String>>,
    pub durable_notes: Option<Option<String>>,
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

fn normalize_text(value: Option<String>) -> Option<String> {
    value
        .map(|text| text.trim().to_string())
        .filter(|text| !text.is_empty())
}

async fn set_optional_text(
    store: &SessionStateStore,
    session_key: &str,
    state_key: &str,
    patch: Option<Option<String>>,
) -> Result<()> {
    let Some(value) = patch else {
        return Ok(());
    };
    match normalize_text(value) {
        Some(value) => {
            store
                .set(session_key, COORDINATOR_NAMESPACE, state_key, &value)
                .await?;
        },
        None => {
            store
                .delete(session_key, COORDINATOR_NAMESPACE, state_key)
                .await?;
        },
    }
    Ok(())
}

pub async fn load(store: &SessionStateStore, session_key: &str) -> Result<CoordinationState> {
    let decision = store
        .get(session_key, COORDINATOR_NAMESPACE, DECISION_KEY)
        .await?;
    let current_plan = store
        .get(session_key, COORDINATOR_NAMESPACE, CURRENT_PLAN_KEY)
        .await?;
    let next_action = store
        .get(session_key, COORDINATOR_NAMESPACE, NEXT_ACTION_KEY)
        .await?;
    let route_constraints = store
        .get(session_key, COORDINATOR_NAMESPACE, ROUTE_CONSTRAINTS_KEY)
        .await?;
    let durable_notes = store
        .get(session_key, COORDINATOR_NAMESPACE, DURABLE_NOTES_KEY)
        .await?;
    let external_activities = store
        .get(session_key, COORDINATOR_NAMESPACE, EXTERNAL_ACTIVITIES_KEY)
        .await?
        .and_then(|value| serde_json::from_str::<Vec<ExternalActivity>>(&value).ok())
        .unwrap_or_default();

    Ok(CoordinationState {
        decision,
        current_plan,
        next_action,
        route_constraints,
        durable_notes,
        external_activities,
    })
}

pub async fn apply_patch(
    store: &SessionStateStore,
    session_key: &str,
    patch: CoordinationPatch,
) -> Result<CoordinationState> {
    set_optional_text(store, session_key, DECISION_KEY, patch.decision).await?;
    set_optional_text(store, session_key, CURRENT_PLAN_KEY, patch.current_plan).await?;
    set_optional_text(store, session_key, NEXT_ACTION_KEY, patch.next_action).await?;
    set_optional_text(
        store,
        session_key,
        ROUTE_CONSTRAINTS_KEY,
        patch.route_constraints,
    )
    .await?;
    set_optional_text(store, session_key, DURABLE_NOTES_KEY, patch.durable_notes).await?;
    load(store, session_key).await
}

pub async fn append_external_activity(
    store: &SessionStateStore,
    session_key: &str,
    mut activity: ExternalActivity,
) -> Result<CoordinationState> {
    if activity.id.trim().is_empty() {
        activity.id = uuid::Uuid::new_v4().to_string();
    }
    if activity.attached_at == 0 {
        activity.attached_at = now_ms();
    }
    activity.title = normalize_text(activity.title);
    activity.summary = activity.summary.trim().to_string();
    activity.link = normalize_text(activity.link);

    let mut state = load(store, session_key).await?;
    state.external_activities.insert(0, activity);
    state.external_activities.truncate(20);
    store
        .set(
            session_key,
            COORDINATOR_NAMESPACE,
            EXTERNAL_ACTIVITIES_KEY,
            &serde_json::to_string(&state.external_activities)?,
        )
        .await?;
    load(store, session_key).await
}

#[allow(clippy::unwrap_used, clippy::expect_used)]
#[cfg(test)]
mod tests {
    use super::*;

    async fn test_store() -> SessionStateStore {
        let pool = sqlx::SqlitePool::connect("sqlite::memory:").await.unwrap();
        sqlx::query(
            r#"CREATE TABLE IF NOT EXISTS session_state (
                session_key TEXT NOT NULL,
                namespace   TEXT NOT NULL,
                key         TEXT NOT NULL,
                value       TEXT NOT NULL,
                updated_at  INTEGER NOT NULL,
                PRIMARY KEY (session_key, namespace, key)
            )"#,
        )
        .execute(&pool)
        .await
        .unwrap();
        SessionStateStore::new(pool)
    }

    #[tokio::test]
    async fn coordination_patch_sets_and_clears_fields() {
        let store = test_store().await;
        let state = apply_patch(&store, "main", CoordinationPatch {
            decision: Some(Some("Ship the coding-memory flow".into())),
            next_action: Some(Some("Bind the session to a workspace".into())),
            ..Default::default()
        })
        .await
        .unwrap();
        assert_eq!(
            state.decision.as_deref(),
            Some("Ship the coding-memory flow")
        );
        assert_eq!(
            state.next_action.as_deref(),
            Some("Bind the session to a workspace")
        );

        let cleared = apply_patch(&store, "main", CoordinationPatch {
            decision: Some(None),
            ..Default::default()
        })
        .await
        .unwrap();
        assert!(cleared.decision.is_none());
        assert_eq!(
            cleared.next_action.as_deref(),
            Some("Bind the session to a workspace")
        );
    }

    #[tokio::test]
    async fn append_external_activity_keeps_latest_first() {
        let store = test_store().await;
        append_external_activity(&store, "main", ExternalActivity {
            id: String::new(),
            source: ExternalAgentSource::Codex,
            title: Some("Patch auth routes".into()),
            summary: "Reviewed and patched auth routes".into(),
            link: None,
            attached_at: 0,
            imported_session_key: None,
            imported_message_count: Some(12),
        })
        .await
        .unwrap();
        let state = append_external_activity(&store, "main", ExternalActivity {
            id: String::new(),
            source: ExternalAgentSource::ClaudeCode,
            title: Some("Summarize tests".into()),
            summary: "Captured validation notes".into(),
            link: Some("https://example.com/run/123".into()),
            attached_at: 0,
            imported_session_key: Some("session:abc".into()),
            imported_message_count: None,
        })
        .await
        .unwrap();

        assert_eq!(state.external_activities.len(), 2);
        assert_eq!(
            state.external_activities[0].source,
            ExternalAgentSource::ClaudeCode
        );
        assert_eq!(
            state.external_activities[1].source,
            ExternalAgentSource::Codex
        );
    }
}
