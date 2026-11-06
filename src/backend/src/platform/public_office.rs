use super::*;
use ts_rs::TS;

#[derive(Clone, Copy, Debug, PartialEq, Serialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export)]
pub enum PublicOfficeStatus {
    Published,
    Unpublished,
    Unavailable,
}

#[derive(Clone, Serialize, TS)]
#[ts(export)]
pub struct PublicOfficeWorkspace {
    pub id: String,
    pub name: String,
}

#[derive(Serialize, TS)]
#[ts(export)]
pub struct OfficePublication {
    #[ts(type = "number")]
    pub revision: i64,
    pub workspace_id: Option<String>,
    pub status: PublicOfficeStatus,
    pub workspace: Option<PublicOfficeWorkspace>,
}

#[derive(Serialize, TS)]
#[ts(export)]
pub struct PublicOfficeState {
    pub schema_version: u32,
    #[ts(type = "number")]
    pub revision: i64,
    pub status: PublicOfficeStatus,
    pub workspace: Option<PublicOfficeWorkspace>,
    pub snapshot: Option<crate::cockpit::CockpitState>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct PublicationInput {
    #[serde(deserialize_with = "required_target")]
    workspace_id: Option<String>,
}

fn required_target<'de, D: serde::Deserializer<'de>>(
    deserializer: D,
) -> std::result::Result<Option<String>, D::Error> {
    Option::<String>::deserialize(deserializer)
}

impl Platform {
    fn publication_record(&self) -> Result<(i64, Option<String>)> {
        self.db(|db| {
            Ok(db.query_row(
                "SELECT revision,workspace_id FROM office_publication WHERE id=1",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )?)
        })
    }

    fn published_app(&self, id: &str) -> Result<Option<(App, PublicOfficeWorkspace)>> {
        let name: Option<String> = self.db(|db| {
            Ok(db.query_row(
                "SELECT t.name FROM tenants t JOIN members m ON m.tenant=t.id WHERE t.id=? AND t.deleted=0 AND m.user='owner' AND m.role='owner'",
                [id], |row| row.get(0),
            ).optional()?)
        })?;
        let Some(name) = name else { return Ok(None) };
        let app = self
            .apps
            .lock()
            .map_err(|_| anyhow::anyhow!("Workspace registry unavailable"))?
            .get(id)
            .cloned();
        Ok(app.map(|mut app| {
            app.identity = Some(Identity {
                user: "owner".into(),
                role: "owner".into(),
            });
            (
                app,
                PublicOfficeWorkspace {
                    id: id.into(),
                    name,
                },
            )
        }))
    }

    pub(super) fn office_publication(&self) -> Result<OfficePublication> {
        let (revision, workspace_id) = self.publication_record()?;
        let workspace = match workspace_id.as_deref() {
            Some(id) => self.published_app(id)?.map(|(_, workspace)| workspace),
            None => None,
        };
        let status = if workspace_id.is_none() {
            PublicOfficeStatus::Unpublished
        } else if workspace.is_some() {
            PublicOfficeStatus::Published
        } else {
            PublicOfficeStatus::Unavailable
        };
        Ok(OfficePublication {
            revision,
            workspace_id,
            status,
            workspace,
        })
    }

    pub(super) fn save_office_publication(
        &self,
        input: PublicationInput,
    ) -> Result<OfficePublication> {
        if let Some(id) = &input.workspace_id {
            crate::security::validate_id(id)?;
        }
        self.db(|db| {
            let transaction = db.unchecked_transaction()?;
            if let Some(id) = &input.workspace_id {
                let eligible: bool = transaction.query_row(
                    "SELECT EXISTS(SELECT 1 FROM tenants t JOIN members m ON m.tenant=t.id WHERE t.id=? AND t.deleted=0 AND m.user='owner' AND m.role='owner')",
                    [id], |row| row.get(0),
                )?;
                anyhow::ensure!(eligible, "Choose an active workspace that you own");
            }
            let (revision, current): (i64, Option<String>) = transaction.query_row(
                "SELECT revision,workspace_id FROM office_publication WHERE id=1", [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )?;
            if current != input.workspace_id {
                anyhow::ensure!(revision < 9_007_199_254_740_991, "Publication revision limit reached");
                transaction.execute("UPDATE office_publication SET workspace_id=?,revision=revision+1 WHERE id=1", [&input.workspace_id])?;
            }
            transaction.commit()?;
            Ok(())
        })?;
        self.office_publication()
    }

    pub(super) fn public_office_state(&self) -> Result<PublicOfficeState, ApiError> {
        let unavailable = |_| {
            ApiError(
                StatusCode::SERVICE_UNAVAILABLE,
                "Live Office status is unavailable".into(),
            )
        };
        for _ in 0..2 {
            let publication = self.office_publication().map_err(unavailable)?;
            let mut state = PublicOfficeState {
                schema_version: 1,
                revision: publication.revision,
                status: publication.status,
                workspace: None,
                snapshot: None,
            };
            if let Some(id) = publication.workspace_id.as_deref()
                && let Some((app, workspace)) = self.published_app(id).map_err(unavailable)?
            {
                let snapshot = crate::cockpit::snapshot(&app, None).map_err(unavailable)?;
                state.workspace = Some(workspace);
                state.snapshot = Some(snapshot);
            }
            // Publication and workspace data live in separate SQLite stores.
            let current = self.office_publication().map_err(unavailable)?;
            if current.revision != publication.revision
                || current.workspace_id != publication.workspace_id
                || current.status != publication.status
            {
                continue;
            }
            return Ok(state);
        }
        Err(ApiError(
            StatusCode::SERVICE_UNAVAILABLE,
            "Live Office publication changed; retry the request".into(),
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::{Ipv4Addr, SocketAddrV4};

    fn application(directory: &std::path::Path) -> Result<App> {
        let store = Arc::new(Store::open(directory.to_path_buf())?);
        Ok(App {
            workspace_id: "default".into(),
            identity: None,
            public_url: Arc::new("http://127.0.0.1:8765".into()),
            enabled: Arc::new(AtomicBool::new(false)),
            store,
            token: Arc::new("test-owner-token".into()),
            address: SocketAddrV4::new(Ipv4Addr::LOCALHOST, 8765),
            codex: PathBuf::from("provider-must-not-run"),
            codex_version: Arc::new(String::new()),
            wake: Arc::new(tokio::sync::Notify::new()),
            cancellations: Default::default(),
            knowledge: Arc::new(crate::knowledge::Knowledge::new(directory.join(".state"))),
            tool_tokens: Default::default(),
        })
    }

    async fn request(
        platform: &Arc<Platform>,
        method: Method,
        path: &str,
        token: Option<&str>,
        headers: &[(&str, &str)],
        body: Value,
    ) -> Result<(StatusCode, Value)> {
        let mut request = Request::builder()
            .method(method)
            .uri(path)
            .header("host", "127.0.0.1:8765")
            .header("origin", "http://127.0.0.1:8765")
            .header("content-type", "application/json");
        if let Some(token) = token {
            request = request.header("authorization", format!("Bearer {token}"));
        }
        for (key, value) in headers {
            request = request.header(*key, *value);
        }
        let response = super::super::router(platform.clone())
            .oneshot(request.body(Body::from(body.to_string()))?)
            .await?;
        assert_eq!(response.headers()[header::CACHE_CONTROL], "no-store");
        let status = response.status();
        let bytes = to_bytes(response.into_body(), 1024 * 1024).await?;
        let value = if bytes.is_empty() {
            Value::Null
        } else {
            serde_json::from_slice(&bytes)?
        };
        Ok((status, value))
    }

    #[tokio::test]
    async fn public_office_publication_is_explicit_idempotent_and_persistent() -> Result<()> {
        let directory = tempfile::tempdir()?;
        let base = application(directory.path())?;
        let platform = Platform::open(base.clone(), directory.path().join("frontend"))?;
        assert_eq!(
            platform.office_publication()?.status,
            PublicOfficeStatus::Unpublished
        );
        assert_eq!(platform.office_publication()?.revision, 0);
        let agents = serde_json::to_value(base.store.list::<crate::model::Agent>("agents")?)?;
        let publish = || PublicationInput {
            workspace_id: Some("default".into()),
        };
        assert_eq!(platform.save_office_publication(publish())?.revision, 1);
        assert_eq!(platform.save_office_publication(publish())?.revision, 1);
        assert!(
            platform
                .save_office_publication(PublicationInput {
                    workspace_id: Some("missing".into())
                })
                .is_err()
        );
        assert_eq!(
            platform.office_publication()?.workspace_id.as_deref(),
            Some("default")
        );
        let reopened = Platform::open(base.clone(), directory.path().join("frontend"))?;
        assert_eq!(reopened.office_publication()?.revision, 1);
        assert_eq!(
            reopened
                .public_office_state()
                .map_err(|error| anyhow::anyhow!(error.1))?
                .status,
            PublicOfficeStatus::Published
        );
        assert_eq!(
            serde_json::to_value(base.store.list::<crate::model::Agent>("agents")?)?,
            agents
        );
        assert!(base.store.list::<crate::model::Run>("runs")?.is_empty());
        assert_eq!(
            reopened
                .save_office_publication(PublicationInput { workspace_id: None })?
                .revision,
            2
        );
        assert_eq!(
            reopened
                .save_office_publication(PublicationInput { workspace_id: None })?
                .revision,
            2
        );
        Ok(())
    }

    #[tokio::test]
    async fn public_office_http_enforces_publisher_and_ignores_visitor_identity() -> Result<()> {
        let directory = tempfile::tempdir()?;
        let platform = Platform::open(
            application(directory.path())?,
            directory.path().join("frontend"),
        )?;
        let management = "/api/office/publication";
        for method in [Method::GET, Method::PUT] {
            assert_eq!(
                request(
                    &platform,
                    method.clone(),
                    management,
                    None,
                    &[],
                    json!({"workspace_id":"default"})
                )
                .await?
                .0,
                StatusCode::UNAUTHORIZED
            );
            for (user, role) in [("member", "member"), ("workspace-owner", "owner")] {
                let token = format!("fixture-{user}");
                platform.db(|db| {
                    db.execute(
                        "INSERT OR REPLACE INTO members VALUES('default',?,?)",
                        [user, role],
                    )?;
                    db.execute(
                        "INSERT OR REPLACE INTO logins VALUES(?,?,unixepoch()+3600)",
                        [hash(&token), user.into()],
                    )?;
                    Ok(())
                })?;
                assert_eq!(
                    request(
                        &platform,
                        method.clone(),
                        management,
                        Some(&token),
                        &[],
                        json!({"workspace_id":"default"})
                    )
                    .await?
                    .0,
                    StatusCode::FORBIDDEN
                );
            }
        }
        for body in [
            json!({}),
            json!({"workspace_id":1}),
            json!({"workspace_id":"default","other":true}),
        ] {
            assert_eq!(
                request(
                    &platform,
                    Method::PUT,
                    management,
                    Some("test-owner-token"),
                    &[],
                    body
                )
                .await?
                .0,
                StatusCode::UNPROCESSABLE_ENTITY
            );
        }
        assert_eq!(platform.office_publication()?.revision, 0);
        assert_eq!(
            request(
                &platform,
                Method::PUT,
                management,
                Some("test-owner-token"),
                &[],
                json!({"workspace_id":"default"})
            )
            .await?
            .0,
            StatusCode::OK
        );
        platform.db(|db| {
            db.execute("INSERT INTO tenants(id,name,deleted) VALUES('deleted','Deleted',1),('inaccessible','Private',0)", [])?;
            db.execute("INSERT INTO members VALUES('deleted','owner','owner'),('inaccessible','owner','member')", [])?;
            Ok(())
        })?;
        for id in ["missing", "deleted", "inaccessible", "../invalid"] {
            assert_eq!(
                request(
                    &platform,
                    Method::PUT,
                    management,
                    Some("test-owner-token"),
                    &[],
                    json!({"workspace_id":id})
                )
                .await?
                .0,
                StatusCode::BAD_REQUEST
            );
            let saved = platform.office_publication()?;
            assert_eq!(saved.revision, 1);
            assert_eq!(saved.workspace_id.as_deref(), Some("default"));
        }
        for (token, headers, path) in [
            (None, vec![], "/api/public/office/state"),
            (
                Some("invalid-session"),
                vec![
                    ("cookie", "ae_workspace=missing"),
                    ("x-ae-workspace", "missing"),
                ],
                "/api/public/office/state?workspace_id=missing&group_id=private",
            ),
            (
                Some("fixture-member"),
                vec![("cookie", "ae_workspace=other")],
                "/api/public/office/state?group=other",
            ),
        ] {
            let (status, value) =
                request(&platform, Method::GET, path, token, &headers, json!({})).await?;
            assert_eq!(status, StatusCode::OK);
            assert_eq!(value["workspace"]["id"], "default");
            assert_eq!(value["snapshot"]["workspace_id"], "default");
            assert_eq!(value["snapshot"]["group_id"], Value::Null);
            assert_eq!(value["revision"], 1);
            assert!(!value.to_string().contains("missing"));
        }
        assert_eq!(
            request(
                &platform,
                Method::GET,
                "/api/cockpit/state",
                None,
                &[],
                json!({})
            )
            .await?
            .0,
            StatusCode::UNAUTHORIZED
        );
        assert_eq!(
            request(
                &platform,
                Method::GET,
                "/api/cockpit/state",
                Some("test-owner-token"),
                &[],
                json!({})
            )
            .await?
            .0,
            StatusCode::OK
        );
        platform.db(|db| {
            db.execute(
                "DELETE FROM members WHERE tenant='default' AND user='owner'",
                [],
            )?;
            Ok(())
        })?;
        let unavailable = platform
            .public_office_state()
            .map_err(|error| anyhow::anyhow!(error.1))?;
        assert_eq!(unavailable.status, PublicOfficeStatus::Unavailable);
        assert!(unavailable.snapshot.is_none() && unavailable.workspace.is_none());
        assert!(
            platform
                .save_office_publication(PublicationInput { workspace_id: None })?
                .workspace_id
                .is_none()
        );
        Ok(())
    }

    #[tokio::test]
    async fn public_office_missing_deleted_and_private_source_fields_stay_unpublished() -> Result<()>
    {
        let directory = tempfile::tempdir()?;
        let platform = Platform::open(
            application(directory.path())?,
            directory.path().join("frontend"),
        )?;
        let app = platform.base.clone();
        let mut agent: crate::model::Agent = app.store.get("agents", "ceo")?;
        agent.instructions = "PRIVATE_INSTRUCTIONS".into();
        agent.agents_md = "PRIVATE_AGENTS_MD".into();
        app.store.put("agents", "ceo", &agent)?;
        app.store.write(|db| {
            db.execute(
                "INSERT OR REPLACE INTO metadata(key,value) VALUES('cockpit_mapping_v1',?)",
                [json!({"hq_lab_director":"ceo"}).to_string()],
            )?;
            Ok(())
        })?;
        platform.save_office_publication(PublicationInput {
            workspace_id: Some("default".into()),
        })?;
        let state = serde_json::to_value(
            platform
                .public_office_state()
                .map_err(|error| anyhow::anyhow!(error.1))?,
        )?;
        assert_eq!(state["snapshot"]["agents"][0]["agent_id"], "ceo");
        let serialized = state.to_string();
        for private in [
            "PRIVATE_INSTRUCTIONS",
            "PRIVATE_AGENTS_MD",
            "test-owner-token",
            "owner.key",
            "canonical_path",
        ] {
            assert!(
                !serialized.contains(private),
                "Public state exposed {private}"
            );
        }
        let keys: Vec<_> = state["snapshot"]
            .as_object()
            .unwrap()
            .keys()
            .map(String::as_str)
            .collect();
        assert_eq!(
            keys,
            [
                "actions",
                "agents",
                "events",
                "generated_at",
                "group_id",
                "groups",
                "mapping",
                "schema_version",
                "setup_required",
                "totals",
                "workspace_id"
            ]
        );
        let agent_keys: Vec<_> = state["snapshot"]["agents"][0]
            .as_object()
            .unwrap()
            .keys()
            .map(String::as_str)
            .collect();
        assert_eq!(
            agent_keys,
            [
                "active_runs",
                "agent_id",
                "availability",
                "color",
                "connection_checked_at",
                "current_activity",
                "enabled",
                "in_scope",
                "latest_result",
                "name",
                "office_role",
                "phase",
                "position",
                "reports_to",
                "role"
            ]
        );
        platform.db(|db| {
            db.execute("UPDATE tenants SET deleted=1 WHERE id='default'", [])?;
            Ok(())
        })?;
        let state = platform
            .public_office_state()
            .map_err(|error| anyhow::anyhow!(error.1))?;
        assert_eq!(state.status, PublicOfficeStatus::Unavailable);
        assert!(state.snapshot.is_none() && state.workspace.is_none());
        assert_eq!(state.revision, 1);
        Ok(())
    }
}
