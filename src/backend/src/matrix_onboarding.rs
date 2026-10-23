//! Invitation credentials authorize one local account; upstream uncertainty never proves ownership.
use crate::{platform::Platform, security::ApiError};
use anyhow::Result;
use axum::{
    body::to_bytes,
    extract::Request,
    http::{Method, StatusCode},
    response::{IntoResponse, Response},
};
use hmac::{Hmac, Mac};
use rusqlite::{Connection, OptionalExtension, params};
use serde::Deserialize;
use serde_json::{Value, json};
use sha1::Sha1;
use sha2::{Digest, Sha256};
use std::{path::PathBuf, sync::Arc, time::Duration};
use subtle::ConstantTimeEq;

fn digest(value: &str) -> String {
    format!("{:x}", Sha256::digest(value.as_bytes()))
}
fn fresh() -> String {
    format!(
        "{}{}",
        uuid::Uuid::new_v4().simple(),
        uuid::Uuid::new_v4().simple()
    )
}
fn fail(code: StatusCode, message: &str) -> ApiError {
    ApiError(code, message.into())
}
fn unavailable() -> ApiError {
    fail(
        StatusCode::SERVICE_UNAVAILABLE,
        "New-account invitations are unavailable. Ask the operator to enable local Synapse provisioning and its dedicated secret file.",
    )
}
fn invalid() -> ApiError {
    fail(
        StatusCode::GONE,
        "This invitation is invalid, expired, revoked, or no longer authorized. Ask the owner for a new invitation.",
    )
}
fn storage(_: anyhow::Error) -> ApiError {
    fail(
        StatusCode::SERVICE_UNAVAILABLE,
        "Invitation state could not be confirmed. Keep this page open and retry the same claim.",
    )
}

pub fn migrate(db: &Connection) -> Result<()> {
    db.execute_batch("CREATE TABLE IF NOT EXISTS member_invitations(
        id TEXT PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE, tenant TEXT NOT NULL REFERENCES tenants(id),
        issuer TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'member' CHECK(role='member'),
        created INTEGER NOT NULL DEFAULT(unixepoch()), expires INTEGER NOT NULL DEFAULT(unixepoch()+86400),
        status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','claiming','account_confirmed','membership_pending','accepted','revoked','expired','unresolved')),
        claim_hash TEXT, username TEXT, matrix_user TEXT, attempts INTEGER NOT NULL DEFAULT 0,
        updated INTEGER NOT NULL DEFAULT(unixepoch()));
        CREATE UNIQUE INDEX IF NOT EXISTS member_invite_username ON member_invitations(username) WHERE username IS NOT NULL;
        CREATE INDEX IF NOT EXISTS member_invite_workspace ON member_invitations(tenant,created);
        CREATE TABLE IF NOT EXISTS member_invitation_audit(id INTEGER PRIMARY KEY, invitation TEXT NOT NULL, actor TEXT NOT NULL, phase TEXT NOT NULL, created INTEGER NOT NULL DEFAULT(unixepoch()));
        CREATE TABLE IF NOT EXISTS member_invitation_limits(bucket TEXT PRIMARY KEY, window INTEGER NOT NULL, attempts INTEGER NOT NULL);
        UPDATE member_invitations SET status='unresolved',updated=unixepoch() WHERE status='claiming';")?;
    Ok(())
}
fn audit(db: &Connection, id: &str, actor: &str, phase: &str) -> Result<()> {
    db.execute(
        "INSERT INTO member_invitation_audit(invitation,actor,phase) VALUES(?,?,?)",
        [id, actor, phase],
    )?;
    Ok(())
}
fn authorized(db: &Connection, tenant: &str, issuer: &str) -> Result<bool> {
    Ok(db.query_row("SELECT EXISTS(SELECT 1 FROM tenants t JOIN members m ON t.id=m.tenant WHERE t.id=? AND t.deleted=0 AND m.user=? AND m.role='owner')", [tenant,issuer], |r|r.get(0))?)
}
fn rate(db: &Connection, bucket: &str, max: i64) -> Result<bool> {
    db.execute("INSERT INTO member_invitation_limits VALUES(?,unixepoch()/60,1) ON CONFLICT(bucket) DO UPDATE SET attempts=CASE WHEN window=unixepoch()/60 THEN attempts+1 ELSE 1 END,window=unixepoch()/60", [bucket])?;
    Ok(db.query_row(
        "SELECT attempts<=? FROM member_invitation_limits WHERE bucket=?",
        params![max, bucket],
        |r| r.get(0),
    )?)
}

struct Provisioner {
    http: reqwest::Client,
    origin: String,
    server: String,
    secret: String,
}
impl Provisioner {
    fn configured(p: &Platform) -> Result<Self, ApiError> {
        if std::env::var("AE_MATRIX_ONBOARDING").as_deref() != Ok("true") {
            return Err(unavailable());
        }
        let origin = p
            .homeserver
            .as_ref()
            .ok_or_else(unavailable)?
            .trim_end_matches('/')
            .to_owned();
        let url = url::Url::parse(&origin).map_err(|_| unavailable())?;
        if !["http", "https"].contains(&url.scheme())
            || url.host_str().is_none()
            || !url.username().is_empty()
            || url.password().is_some()
            || url.query().is_some()
            || url.fragment().is_some()
            || url.path() != "/"
        {
            return Err(unavailable());
        }
        let server = std::env::var("AE_MATRIX_SERVER_NAME").map_err(|_| unavailable())?;
        matrix_sdk::ruma::UserId::parse(format!("@invitecheck:{server}"))
            .map_err(|_| unavailable())?;
        let file = PathBuf::from(
            std::env::var("AE_MATRIX_REGISTRATION_SECRET_FILE").map_err(|_| unavailable())?,
        );
        let meta = std::fs::symlink_metadata(&file).map_err(|_| unavailable())?;
        if !file.is_absolute() || !meta.is_file() || meta.len() > 4096 {
            return Err(unavailable());
        }
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            if meta.permissions().mode() & 0o077 != 0 {
                return Err(unavailable());
            }
        }
        let secret = std::fs::read_to_string(file)
            .map_err(|_| unavailable())?
            .trim()
            .to_owned();
        if secret.len() < 32 || secret.contains(['\n', '\r', '\0']) {
            return Err(unavailable());
        }
        let http = reqwest::Client::builder()
            .timeout(Duration::from_secs(12))
            .connect_timeout(Duration::from_secs(4))
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .map_err(|_| unavailable())?;
        Ok(Self {
            http,
            origin,
            server,
            secret,
        })
    }
    async fn nonce(&self) -> Result<String, ApiError> {
        let r = self
            .http
            .get(format!("{}/_synapse/admin/v1/register", self.origin))
            .send()
            .await
            .map_err(|_| unavailable())?;
        if !r.status().is_success() {
            return Err(unavailable());
        }
        let v: Value = r.json().await.map_err(|_| unavailable())?;
        v["nonce"]
            .as_str()
            .filter(|s| !s.is_empty() && s.len() < 512 && !s.contains('\0'))
            .map(str::to_owned)
            .ok_or_else(unavailable)
    }
    async fn register(&self, username: &str, password: &str) -> Result<(), ApiError> {
        let nonce = self.nonce().await?;
        let mut mac =
            Hmac::<Sha1>::new_from_slice(self.secret.as_bytes()).map_err(|_| unavailable())?;
        mac.update(format!("{nonce}\0{username}\0{password}\0notadmin").as_bytes());
        let mac = format!("{:x}", mac.finalize().into_bytes());
        let r=self.http.post(format!("{}/_synapse/admin/v1/register",self.origin)).json(&json!({"nonce":nonce,"username":username,"password":password,"admin":false,"mac":mac,"inhibit_login":true})).send().await.map_err(|_|fail(StatusCode::BAD_GATEWAY,"Account creation could not be confirmed. Retry this same claim with the same credentials to verify ownership; do not create another account."))?;
        if !r.status().is_success() {
            let status = r.status();
            let v: Value = r.json().await.unwrap_or(Value::Null);
            return Err(match v["errcode"].as_str() {
                Some("M_USER_IN_USE") => fail(
                    StatusCode::CONFLICT,
                    "That username already exists. Use the existing-account invite flow or choose a different username. Its password was not changed.",
                ),
                Some("M_INVALID_USERNAME") | Some("M_INVALID_PARAM") => fail(
                    StatusCode::UNPROCESSABLE_ENTITY,
                    "Synapse rejected that username or password. Review its policy and choose valid credentials.",
                ),
                Some("M_WEAK_PASSWORD") => fail(
                    StatusCode::UNPROCESSABLE_ENTITY,
                    "Synapse requires a stronger password.",
                ),
                _ if status == StatusCode::TOO_MANY_REQUESTS => fail(
                    StatusCode::TOO_MANY_REQUESTS,
                    "Synapse is rate limiting registration. Retry later with this same claim.",
                ),
                _ => fail(
                    StatusCode::BAD_GATEWAY,
                    "Synapse did not confirm account creation. Retry this same claim to reconcile the account before any membership grant.",
                ),
            });
        }
        let v:Value=r.json().await.map_err(|_|fail(StatusCode::BAD_GATEWAY,"Account creation returned an unreadable response. Retry the same claim to verify ownership."))?;
        self.confirm_identity_and_logout(&v, username).await
    }
    async fn confirm_identity_and_logout(&self, v: &Value, username: &str) -> Result<(), ApiError> {
        let expected = format!("@{username}:{}", self.server);
        // Logout any access token returned by older Synapse versions, including unexpected identities.
        if let Some(token) = v["access_token"].as_str() {
            let r=self.http.post(format!("{}/_matrix/client/v3/logout",self.origin)).bearer_auth(token).json(&json!({})).send().await.map_err(|_|fail(StatusCode::BAD_GATEWAY,"Temporary Matrix session cleanup could not be confirmed. Retry the same claim to recover."))?;
            if !r.status().is_success() {
                return Err(fail(
                    StatusCode::BAD_GATEWAY,
                    "Temporary Matrix session cleanup failed. Retry this claim later.",
                ));
            }
        }
        if v["user_id"].as_str() != Some(expected.as_str()) {
            return Err(fail(
                StatusCode::BAD_GATEWAY,
                "Matrix account identity could not be verified. Ask the operator to check the configured local server name.",
            ));
        }
        Ok(())
    }
    async fn authenticate(&self, username: &str, password: &str) -> Result<(), ApiError> {
        let r=self.http.post(format!("{}/_matrix/client/v3/login",self.origin)).json(&json!({"type":"m.login.password","identifier":{"type":"m.id.user","user":format!("@{username}:{}",self.server)},"password":password})).send().await.map_err(|_|fail(StatusCode::BAD_GATEWAY,"The account may already exist, but ownership could not be checked. Retry this claim when Matrix is available."))?;
        if !r.status().is_success() {
            return Err(fail(
                StatusCode::UNAUTHORIZED,
                "The account outcome remains unresolved. Verify the same username and password or contact the owner; no membership was granted.",
            ));
        }
        let v: Value = r.json().await.map_err(|_| {
            fail(
                StatusCode::BAD_GATEWAY,
                "Matrix ownership response could not be read. Retry this claim.",
            )
        })?;
        self.confirm_identity_and_logout(&v, username).await
    }
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Inspect {
    token: String,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Accept {
    token: String,
    claim: String,
    username: String,
    password: String,
}
async fn input<T: serde::de::DeserializeOwned>(req: Request) -> Result<T, ApiError> {
    let bytes = to_bytes(req.into_body(), 4096).await.map_err(|_| {
        fail(
            StatusCode::BAD_REQUEST,
            "Invitation request is too large or unreadable.",
        )
    })?;
    serde_json::from_slice(&bytes).map_err(|_| {
        fail(
            StatusCode::BAD_REQUEST,
            "Invalid invitation request fields.",
        )
    })
}
fn validate_username(s: &str) -> Result<(), ApiError> {
    let bot = std::env::var("AE_MATRIX_BOT_USERNAME").unwrap_or_else(|_| "agentic".into());
    if !(3..=32).contains(&s.len())
        || !s
            .bytes()
            .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b"._-".contains(&b))
        || !s.as_bytes()[0].is_ascii_lowercase()
        || [
            "owner",
            "admin",
            "administrator",
            "root",
            "system",
            "server",
            "agentic",
            "synapse",
        ]
        .contains(&s)
        || s == bot
        || s.starts_with('_')
    {
        return Err(fail(
            StatusCode::UNPROCESSABLE_ENTITY,
            "Choose a username of 3–32 lowercase letters, digits, dots, dashes or underscores, starting with a letter. Platform and bot names are reserved.",
        ));
    }
    Ok(())
}
enum Reservation {
    Invalid,
    Collision,
    Ready(Invite),
}

struct Invite {
    id: String,
    tenant: String,
    issuer: String,
    status: String,
    username: Option<String>,
    claim: Option<String>,
    valid: bool,
    attempts: i64,
}
fn find(db: &Connection, token: &str) -> Result<Option<Invite>> {
    Ok(db.query_row("SELECT id,tenant,issuer,status,username,claim_hash,expires>unixepoch(),attempts FROM member_invitations WHERE token_hash=?",[digest(token)],|r|Ok(Invite{id:r.get(0)?,tenant:r.get(1)?,issuer:r.get(2)?,status:r.get(3)?,username:r.get(4)?,claim:r.get(5)?,valid:r.get(6)?,attempts:r.get(7)?})).optional()?)
}
fn live(db: &Connection, i: &Invite) -> Result<bool> {
    Ok(i.valid
        && !["revoked", "expired"].contains(&i.status.as_str())
        && authorized(db, &i.tenant, &i.issuer)?)
}

pub async fn owner(
    p: &Arc<Platform>,
    tenant: &str,
    user: &str,
    sub: &str,
    req: Request,
) -> Result<Response, ApiError> {
    let method = req.method().clone();
    if !p.db(|db| authorized(db, tenant, user)).map_err(storage)? {
        return Err(fail(
            StatusCode::FORBIDDEN,
            "A current owner of an active workspace is required.",
        ));
    }
    if sub == "invitations" && method == Method::GET {
        let ready = match Provisioner::configured(p) {
            Ok(c) => c.nonce().await.is_ok(),
            Err(_) => false,
        };
        let rows=p.db(|db|{
            db.execute("UPDATE member_invitations SET status='expired' WHERE expires<=unixepoch() AND status NOT IN ('accepted','revoked','expired','claiming')",[])?;
            let mut q=db.prepare("SELECT id,status,created,expires,username FROM member_invitations WHERE tenant=? ORDER BY created DESC LIMIT 100")?;
            Ok(q.query_map([tenant],|r|Ok(json!({"id":r.get::<_,String>(0)?,"status":r.get::<_,String>(1)?,"created":r.get::<_,i64>(2)?,"expires":r.get::<_,i64>(3)?,"username":r.get::<_,Option<String>>(4)?})))?.collect::<rusqlite::Result<Vec<_>>>()?)
        }).map_err(storage)?;
        return Ok(axum::Json(json!({"ready":ready,"invitations":rows,"guidance":if ready {"Share links privately. Anyone with a link can choose a new local account. Links expire after 24 hours."}else{"New-account invitations require operator setup of local Synapse and a dedicated registration secret file. Existing Matrix invitations still work."}})).into_response());
    }
    if sub == "invitations" && method == Method::POST {
        let body: serde_json::Map<String, Value> = input(req).await?;
        if !body.is_empty() {
            return Err(fail(
                StatusCode::BAD_REQUEST,
                "Invitation creation does not accept role, server or account options.",
            ));
        }
        let c = Provisioner::configured(p)?;
        c.nonce().await?;
        let token = fresh();
        let id = uuid::Uuid::new_v4().to_string();
        p.db(|db|{
            let tx=db.unchecked_transaction()?;
            anyhow::ensure!(authorized(&tx,tenant,user)?,"Owner authority changed");
            let count:i64=tx.query_row("SELECT count(*) FROM member_invitations WHERE tenant=? AND expires>unixepoch() AND status NOT IN ('accepted','revoked','expired')",[tenant],|r|r.get(0))?;
            anyhow::ensure!(count<50,"Pending invitation limit reached");
            anyhow::ensure!(rate(&tx,&format!("create:{tenant}:{user}"),5)?,"Invitation creation limit reached; retry in a minute");
            tx.execute("INSERT INTO member_invitations(id,token_hash,tenant,issuer) VALUES(?,?,?,?)",params![id,digest(&token),tenant,user])?;audit(&tx,&id,user,"created")?;tx.commit()?;Ok(())
        }).map_err(|_|fail(StatusCode::TOO_MANY_REQUESTS,"Invitation could not be created. Check owner access or pending limits and retry later."))?;
        return Ok(axum::Json(json!({"id":id,"link":format!("{}/join#invite={token}",p.base.public_url.trim_end_matches('/')),"expires":chrono::Utc::now().timestamp()+86400})).into_response());
    }
    if let Some(id) = sub.strip_prefix("invitations/")
        && method == Method::DELETE
    {
        let result = p
            .db(|db| {
                let tx = db.unchecked_transaction()?;
                anyhow::ensure!(authorized(&tx, tenant, user)?, "Owner required");
                let status: Option<String> = tx
                    .query_row(
                        "SELECT status FROM member_invitations WHERE tenant=? AND id=?",
                        [tenant, id],
                        |r| r.get(0),
                    )
                    .optional()?;
                let Some(status) = status else {
                    return Ok("missing".to_owned());
                };
                if status == "claiming" {
                    return Ok("busy".to_owned());
                }
                if status == "accepted" {
                    return Ok("accepted".to_owned());
                }
                tx.execute(
                    "UPDATE member_invitations SET status='revoked',updated=unixepoch() WHERE id=?",
                    [id],
                )?;
                audit(&tx, id, user, "revoked")?;
                tx.commit()?;
                Ok("revoked".into())
            })
            .map_err(storage)?;
        return match result.as_str(){"missing"=>Err(invalid()),"busy"=>Err(fail(StatusCode::CONFLICT,"Account creation is in progress. Wait for its outcome, then revoke if necessary; a created Matrix account cannot be rolled back.")),"accepted"=>Err(fail(StatusCode::CONFLICT,"This invitation was already accepted. Use People to manage membership.")),_=>Ok(axum::Json(json!({"status":"revoked","notice":"Any previously created Matrix account remains; this link can no longer grant access."})).into_response())};
    }
    Ok(StatusCode::METHOD_NOT_ALLOWED.into_response())
}

pub async fn recipient(p: &Arc<Platform>, req: Request) -> Result<Response, ApiError> {
    if req.method() != Method::POST || req.uri().query().is_some() {
        return Err(fail(
            StatusCode::METHOD_NOT_ALLOWED,
            "Invitations require a same-origin POST; links and previews do not create accounts.",
        ));
    }
    let expected = p.base.public_url.trim_end_matches('/');
    if req.headers().get("origin").and_then(|h| h.to_str().ok()) != Some(expected) {
        return Err(fail(
            StatusCode::FORBIDDEN,
            "Open the invitation on this platform before submitting.",
        ));
    }
    if !p.db(|db| rate(db, "recipient", 60)).map_err(storage)? {
        return Err(fail(
            StatusCode::TOO_MANY_REQUESTS,
            "Too many invitation requests. Retry in a minute.",
        ));
    }
    let path = req.uri().path().to_owned();
    if path == "/api/invitations/inspect" {
        let v: Inspect = input(req).await?;
        let info=p.db(|db|{
            let Some(i)=find(db,&v.token)? else{return Ok(None);};
            if !live(db,&i)? || i.status=="accepted" {return Ok(None);}
            let name:String=db.query_row("SELECT name FROM tenants WHERE id=?",[&i.tenant],|r|r.get(0))?;
            Ok(Some(json!({"workspace":name,"status":i.status,"username":i.username,"server_name":std::env::var("AE_MATRIX_SERVER_NAME").unwrap_or_default()})))
        }).map_err(storage)?.ok_or_else(invalid)?;
        Provisioner::configured(p)?;
        return Ok(axum::Json(info).into_response());
    }
    if path != "/api/invitations/accept" {
        return Err(fail(StatusCode::NOT_FOUND, "Unknown invitation operation."));
    }
    let v: Accept = input(req).await?;
    validate_username(&v.username)?;
    if v.password.chars().count() < 12 || v.password.len() > 256 || v.password.contains('\0') {
        return Err(fail(
            StatusCode::UNPROCESSABLE_ENTITY,
            "Choose a password of at least 12 characters and at most 256 bytes, without null characters.",
        ));
    }
    if v.token.len() != 64 || v.claim.len() != 64 || !v.claim.bytes().all(|b| b.is_ascii_hexdigit())
    {
        return Err(invalid());
    }
    let c = Provisioner::configured(p)?;
    let reservation=p.db(|db|{
        let tx=db.unchecked_transaction()?;
        tx.execute("UPDATE member_invitations SET status='unresolved',updated=unixepoch() WHERE status='claiming' AND updated<unixepoch()-90",[])?;
        let Some(i)=find(&tx,&v.token)? else{return Ok(Reservation::Invalid);};
        if !live(&tx,&i)? {return Ok(Reservation::Invalid);}
        if let Some(saved)=&i.claim {
            if !bool::from(saved.as_bytes().ct_eq(digest(&v.claim).as_bytes())) || i.username.as_deref()!=Some(&v.username) {return Ok(Reservation::Invalid);}
        }
        if i.status=="accepted" {return Ok(Reservation::Ready(i));}
        if i.status=="claiming" || i.attempts>=10 {return Ok(Reservation::Ready(i));}
        let conflict:bool=tx.query_row("SELECT EXISTS(SELECT 1 FROM member_invitations WHERE username=? AND id<>?)",params![v.username,i.id],|r|r.get(0))?;
        if conflict {return Ok(Reservation::Collision);}
        tx.execute("UPDATE member_invitations SET status='claiming',claim_hash=?,username=?,attempts=attempts+1,updated=unixepoch() WHERE id=?",params![digest(&v.claim),v.username,i.id])?;
        audit(&tx,&i.id,"recipient","claiming")?;tx.commit()?;Ok(Reservation::Ready(i))
    }).map_err(storage)?;
    let i = match reservation {
        Reservation::Invalid => return Err(invalid()),
        Reservation::Collision => {
            return Err(fail(
                StatusCode::CONFLICT,
                "That username is already reserved or registered. Choose another username or ask the owner to invite your existing Matrix ID.",
            ));
        }
        Reservation::Ready(i) => i,
    };
    if i.status == "accepted" {
        return Ok(axum::Json(
            json!({"status":"accepted","user":format!("@{}:{}",v.username,c.server)}),
        )
        .into_response());
    }
    if i.status == "claiming" {
        return Err(fail(
            StatusCode::CONFLICT,
            "This invitation is already being processed. Keep the same page open and retry after completion.",
        ));
    }
    if i.attempts >= 10 {
        return Err(fail(
            StatusCode::TOO_MANY_REQUESTS,
            "This invitation has exhausted its attempts. Ask the owner for a new link; an account may already exist.",
        ));
    }
    let result = if i.status == "pending" {
        c.register(&v.username, &v.password).await
    } else {
        c.authenticate(&v.username, &v.password).await
    };
    if let Err(error) = result {
        let rejected = i.status == "pending"
            && [
                StatusCode::CONFLICT,
                StatusCode::UNPROCESSABLE_ENTITY,
                StatusCode::TOO_MANY_REQUESTS,
                StatusCode::SERVICE_UNAVAILABLE,
            ]
            .contains(&error.0);
        p.db(|db|{
            let tx=db.unchecked_transaction()?;
            if rejected {tx.execute("UPDATE member_invitations SET status='pending',username=NULL,claim_hash=NULL,updated=unixepoch() WHERE id=? AND status='claiming'",[&i.id])?;}
            else {tx.execute("UPDATE member_invitations SET status='unresolved',updated=unixepoch() WHERE id=? AND status='claiming'",[&i.id])?;}
            audit(&tx,&i.id,"recipient",if rejected{"registration_rejected"}else{"unresolved"})?;tx.commit()?;Ok(())
        }).map_err(storage)?;
        return Err(error);
    }
    let matrix_user = format!("@{}:{}", v.username, c.server);
    p.db(|db|{db.execute("UPDATE member_invitations SET status='account_confirmed',matrix_user=?,updated=unixepoch() WHERE id=? AND status='claiming'",params![matrix_user,i.id])?;audit(db,&i.id,"recipient","account_confirmed")?;Ok(())}).map_err(storage)?;
    // Record the recoverable phase before entering the separate membership transaction.
    p.db(|db|{db.execute("UPDATE member_invitations SET status='membership_pending' WHERE id=? AND status='account_confirmed'",[&i.id])?;Ok(())}).map_err(storage)?;
    let complete = p.db(|db| {
        let tx = db.unchecked_transaction()?;
        let current =
            find(&tx, &v.token)?.ok_or_else(|| anyhow::anyhow!("Invitation unavailable"))?;
        anyhow::ensure!(
            live(&tx, &current)? && current.status == "membership_pending",
            "Invitation authority changed after account creation"
        );
        tx.execute(
            "INSERT OR IGNORE INTO members(tenant,user,role) VALUES(?,?,'member')",
            params![i.tenant, matrix_user],
        )?;
        tx.execute(
            "UPDATE member_invitations SET status='accepted',updated=unixepoch() WHERE id=?",
            [&i.id],
        )?;
        audit(&tx, &i.id, "recipient", "accepted")?;
        tx.commit()?;
        Ok(())
    });
    if complete.is_err() {
        return Err(fail(
            StatusCode::SERVICE_UNAVAILABLE,
            "Your Matrix account is confirmed, but workspace access is pending or no longer authorized. Keep this claim and retry with the same credentials; no account will be reset or recreated.",
        ));
    }
    Ok(axum::Json(json!({"status":"accepted","user":matrix_user})).into_response())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn matrix_invite_migration_preserves_identity() {
        let db = Connection::open_in_memory().unwrap();
        db.execute_batch("CREATE TABLE tenants(id TEXT PRIMARY KEY,name TEXT,deleted INTEGER DEFAULT 0);CREATE TABLE members(tenant TEXT,user TEXT,role TEXT,PRIMARY KEY(tenant,user));CREATE TABLE logins(token_hash TEXT PRIMARY KEY,user TEXT,expires INTEGER);INSERT INTO tenants VALUES('default','Existing',0);INSERT INTO members VALUES('default','owner','owner');INSERT INTO logins VALUES('hash','owner',9999999999);").unwrap();
        migrate(&db).unwrap();
        migrate(&db).unwrap();
        assert!(authorized(&db, "default", "owner").unwrap());
        assert_eq!(
            db.query_row("SELECT count(*) FROM logins", [], |r| r.get::<_, i64>(0))
                .unwrap(),
            1
        );
    }
    #[test]
    fn matrix_invite_names_and_rate_limit() {
        for s in [
            "owner",
            "admin",
            "agentic",
            "_bot",
            "Uppercase",
            "ab",
            "a@remote:server",
        ] {
            assert!(validate_username(s).is_err());
        }
        assert!(validate_username("teammate.one").is_ok());
        let db = Connection::open_in_memory().unwrap();
        db.execute_batch("CREATE TABLE tenants(id TEXT PRIMARY KEY);")
            .unwrap();
        migrate(&db).unwrap();
        assert!(rate(&db, "x", 2).unwrap());
        assert!(rate(&db, "x", 2).unwrap());
        assert!(!rate(&db, "x", 2).unwrap());
    }
}
