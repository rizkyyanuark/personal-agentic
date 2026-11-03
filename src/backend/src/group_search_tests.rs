use crate::{App, api, knowledge::Knowledge, model::*};
use anyhow::Result;
use axum::{
    body::{Body, to_bytes},
    http::{Request, StatusCode},
};
use serde_json::{Value, json};
use std::sync::Arc;
use tower::ServiceExt;

async fn search(
    app: &App,
    group: &str,
    query: &str,
    media: Option<&str>,
    authenticated: bool,
) -> Result<(StatusCode, Value)> {
    let mut params = url::form_urlencoded::Serializer::new(String::new());
    params
        .append_pair("group_id", group)
        .append_pair("q", query);
    if let Some(media) = media {
        params
            .append_pair("semantic", "true")
            .append_pair("media", media);
    }
    let mut request = Request::builder()
        .uri(format!("/api/search?{}", params.finish()))
        .header("host", "127.0.0.1:8765");
    if authenticated {
        request = request.header("authorization", "Bearer owner-test-only");
    }
    let response = api::router(app.clone(), app.store.org.join("unused-frontend"))
        .oneshot(request.body(Body::empty())?)
        .await?;
    let status = response.status();
    let bytes = to_bytes(response.into_body(), 1024 * 1024).await?;
    let body = if status == StatusCode::UNAUTHORIZED {
        Value::Null
    } else {
        serde_json::from_slice(&bytes)?
    };
    Ok((status, body))
}

fn message(app: &App, name: &str, group: &str, body: &str) -> Result<()> {
    app.store.put(
        "messages",
        name,
        &Message {
            id: name.into(),
            group_id: group.into(),
            side_chat_id: None,
            sender: "owner".into(),
            body: body.into(),
            recipients: vec![],
            reply_to: None,
            artifacts: vec![],
            run_id: None,
            created_at: "2026-11-03T00:00:00Z".into(),
            auto_routed: false,
            schedule_id: None,
            command: None,
            usage_report: None,
        },
    )
}

fn artifact(
    app: &App,
    name: &str,
    group: &str,
    media: &str,
    status: &str,
    in_knowledge: bool,
) -> Result<()> {
    app.store.put(
        "artifacts",
        name,
        &Artifact {
            id: name.into(),
            group_id: group.into(),
            name: format!("{name}.txt"),
            media_type: media.into(),
            size: 4,
            sha256: "0".repeat(64),
            status: status.into(),
            error: None,
            created_at: "2026-11-03T00:00:00Z".into(),
            source: None,
            in_knowledge,
        },
    )
}

#[tokio::test]
async fn group_search_normalizes_edges_and_preserves_case_order_limit_and_internal_spaces()
-> Result<()> {
    let temp = tempfile::tempdir()?;
    let app = crate::worker_onboarding_tests::app(temp.path().join("org"))?;
    for i in 0..55 {
        message(
            &app,
            &format!("message-{i}"),
            "general",
            "Example two  spaces",
        )?;
    }
    message(&app, "outside-group", "another-group", "Example")?;
    let (status, baseline) = search(&app, "general", "Example", None, true).await?;
    assert_eq!(status, StatusCode::OK);
    let matches = baseline["messages"].as_array().unwrap();
    assert_eq!(matches.len(), 50);
    assert_eq!(matches.first().unwrap()["id"], "message-54");
    assert_eq!(matches.last().unwrap()["id"], "message-5");
    assert!(baseline.get("indexed_artifact_count").is_none());
    for query in [
        "  Example  ",
        "\t\r\nEXAMPLE\n",
        "\u{a0}Example\u{a0}",
        "\u{85}Example\u{85}",
        "\u{feff}Example\u{feff}",
    ] {
        let (status, result) = search(&app, "general", query, None, true).await?;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(result, baseline, "{query:?}");
    }
    assert_eq!(
        search(&app, "general", "two  spaces", None, true).await?.1["messages"]
            .as_array()
            .unwrap()
            .len(),
        50
    );
    assert_eq!(
        search(&app, "general", "two spaces", None, true).await?.1["messages"],
        json!([])
    );
    assert!(app.store.list::<Run>("runs")?.is_empty());
    Ok(())
}

#[tokio::test]
async fn group_search_enforces_normalized_utf8_bounds_for_both_modes() -> Result<()> {
    let temp = tempfile::tempdir()?;
    let app = crate::worker_onboarding_tests::app(temp.path().join("org"))?;
    for media in [None, Some("documents"), Some("images")] {
        for query in ["", " \t\r\n\u{a0}\u{85}\u{feff}"] {
            let (status, result) = search(&app, "general", query, media, true).await?;
            assert_eq!(status, StatusCode::BAD_REQUEST);
            assert!(result["error"].as_str().unwrap().contains("UTF-8 bytes"));
        }
        for query in ["🚀".repeat(250), format!(" \u{feff}{}\t", "🚀".repeat(250))] {
            assert_eq!(
                search(&app, "general", &query, media, true).await?.0,
                StatusCode::OK
            );
        }
        assert_eq!(
            search(&app, "general", &"🚀".repeat(251), media, true)
                .await?
                .0,
            StatusCode::BAD_REQUEST
        );
    }
    assert!(!app.store.org.join(".state/models").exists());
    Ok(())
}

#[tokio::test]
async fn group_search_empty_corpus_excludes_unready_wrong_group_and_wrong_media_metadata()
-> Result<()> {
    let temp = tempfile::tempdir()?;
    let app = crate::worker_onboarding_tests::app(temp.path().join("org"))?;
    for status in ["stored", "indexing", "failed", "deleted"] {
        artifact(&app, status, "general", "text/plain", status, true)?;
    }
    artifact(
        &app,
        "not-knowledge",
        "general",
        "text/plain",
        "indexed",
        false,
    )?;
    artifact(
        &app,
        "outside",
        "another-group",
        "text/plain",
        "indexed",
        true,
    )?;
    artifact(
        &app,
        "wrong-type",
        "general",
        "application/pdf",
        "indexed",
        true,
    )?;
    for media in ["documents", "images"] {
        assert_eq!(
            search(&app, "general", "  example  ", Some(media), true).await?,
            (
                StatusCode::OK,
                json!({"artifacts":[], "indexed_artifact_count":0})
            )
        );
    }
    artifact(
        &app,
        "image-metadata",
        "general",
        "image/png",
        "indexed",
        true,
    )?;
    assert_eq!(
        search(&app, "general", "example", Some("documents"), true)
            .await?
            .1["indexed_artifact_count"],
        0
    );
    assert!(!app.store.org.join(".state/models").exists());
    assert!(app.store.list::<Run>("runs")?.is_empty());
    Ok(())
}

#[tokio::test]
async fn group_search_populated_metadata_does_not_hide_a_real_index_failure() -> Result<()> {
    let temp = tempfile::tempdir()?;
    let mut app = crate::worker_onboarding_tests::app(temp.path().join("org"))?;
    let blocked = temp.path().join("not-a-directory");
    std::fs::write(&blocked, "filesystem-failure-fixture")?;
    app.knowledge = Arc::new(Knowledge::new(blocked));
    artifact(
        &app,
        "document-metadata",
        "general",
        "text/plain",
        "indexed",
        true,
    )?;
    let (status, result) = search(&app, "general", "example", Some("documents"), true).await?;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert!(result["error"].is_string());
    assert!(result.get("artifacts").is_none());
    assert!(result.get("indexed_artifact_count").is_none());
    assert_eq!(
        app.store
            .get::<Artifact>("artifacts", "document-metadata")?
            .status,
        "indexed"
    );
    Ok(())
}

#[tokio::test]
async fn group_search_checks_auth_and_group_before_revealing_availability() -> Result<()> {
    let temp = tempfile::tempdir()?;
    let app = crate::worker_onboarding_tests::app(temp.path().join("org"))?;
    assert_eq!(
        search(&app, "general", "example", Some("documents"), false)
            .await?
            .0,
        StatusCode::UNAUTHORIZED
    );
    let (status, result) = search(&app, "missing-group", "example", Some("images"), true).await?;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert!(result.get("indexed_artifact_count").is_none());
    assert_eq!(
        search(&app, "general", "example", Some("other"), true)
            .await?
            .0,
        StatusCode::BAD_REQUEST
    );
    Ok(())
}
