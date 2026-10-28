//! Persistent outbound workers. The controller owns scheduling; workers own processes,
//! native login state, workdirs, and an acknowledged result outbox. Claims never replay.
use crate::{
    App,
    model::{self, Harness, Workspace},
    security, store,
};
use anyhow::{Context, Result, ensure};
use rusqlite::{Connection, OptionalExtension, params};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{
    collections::HashMap,
    fs::OpenOptions,
    io::{BufRead, BufReader, Write},
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
    time::{Duration, Instant},
};

const SCHEMA: &str = "CREATE TABLE IF NOT EXISTS fleet_jobs(id TEXT PRIMARY KEY,runtime TEXT NOT NULL,state TEXT NOT NULL,request TEXT,done INTEGER NOT NULL DEFAULT 0); CREATE TABLE IF NOT EXISTS fleet_frames(job TEXT NOT NULL,seq INTEGER NOT NULL,frame TEXT NOT NULL,PRIMARY KEY(job,seq));";
pub fn initialize(app: &App) -> Result<()> {
    app.store.write(|db| {
        db.execute_batch(SCHEMA)?;
        Ok(())
    })
}
fn hash(s: &str) -> String {
    format!("{:x}", Sha256::digest(s.as_bytes()))
}
fn read(db: &Connection, key: &str) -> Result<Option<Value>> {
    Ok(db
        .query_row("SELECT value FROM metadata WHERE key=?", [key], |r| {
            r.get::<_, String>(0)
        })
        .optional()?
        .map(|s| serde_json::from_str(&s))
        .transpose()?)
}
fn put(db: &Connection, key: &str, v: &Value) -> Result<()> {
    db.execute(
        "INSERT INTO metadata VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        [key, &v.to_string()],
    )?;
    Ok(())
}
fn cancel_job(db: &Connection, job: &str) -> Result<()> {
    db.execute("UPDATE fleet_jobs SET done=CASE WHEN state IN ('preparing','queued') THEN 1 ELSE done END,state='cancelled' WHERE id=?", [job])?;
    Ok(())
}
pub fn register(app: &App, name: &str) -> Result<Value> {
    ensure!(
        !name.trim().is_empty() && name.len() <= 80,
        "Runtime name required (maximum 80 bytes)"
    );
    let id = model::id();
    let enrollment = format!("{}{}", model::id(), model::id());
    app.store.write(|db|put(db,&format!("runtime:{id}"),&json!({"id":id,"name":name,"enrollment":hash(&enrollment),"expires":chrono::Utc::now().timestamp()+900,"revoked":false})))?;
    Ok(json!({"id":id,"enrollment_token":enrollment,"expires_in":900}))
}
pub fn worker_identity(
    apps: &[(String, App)],
    token: &str,
    pending: bool,
) -> Result<Option<Value>> {
    if token.is_empty() {
        return Ok(None);
    }
    let digest = hash(token);
    for (tenant, app) in apps {
        if !app.enabled.load(Ordering::Relaxed) {
            continue;
        }
        let found = app.store.read(|db| {
            let mut q = db.prepare("SELECT value FROM metadata WHERE key LIKE 'runtime:%'")?;
            for row in q.query_map([], |r| r.get::<_, String>(0))? {
                let r: Value = serde_json::from_str(&row?)?;
                if r["revoked"] != false {
                    continue;
                }
                let enrolled = r["token"] == digest;
                let enrollment = pending && r["enrollment"] == digest
                    && r["expires"].as_i64().unwrap_or(0) > chrono::Utc::now().timestamp();
                if enrolled || enrollment {
                    return Ok(Some(json!({
                        "id": r["id"], "workspace": tenant, "name": r["name"],
                        "root": r["root"], "os": r["os"], "enrolled": enrolled,
                        "heartbeat": r["heartbeat"].as_u64().unwrap_or(0),
                        "last_seen": r["last_seen"],
                        "online": enrolled && r["last_seen"].as_i64().unwrap_or(0) > chrono::Utc::now().timestamp() - 30,
                    })));
                }
            }
            Ok(None)
        })?;
        if found.is_some() {
            return Ok(found);
        }
    }
    Ok(None)
}
pub fn list(app: &App) -> Result<Vec<Value>> {
    app.store.read(|db| {
        let mut q = db.prepare("SELECT value FROM metadata WHERE key LIKE 'runtime:%'")?;
        let values = q
            .query_map([], |r| r.get::<_, String>(0))?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        values
            .into_iter()
            .map(|s| {
                let mut v: Value = serde_json::from_str(&s)?;
                v.as_object_mut()
                    .context("Invalid runtime")?
                    .remove("token");
                v.as_object_mut()
                    .context("Invalid runtime")?
                    .remove("enrollment");
                v["online"] = (v["last_seen"].as_i64().unwrap_or(0)
                    > chrono::Utc::now().timestamp() - 30
                    && !v["revoked"].as_bool().unwrap_or(true))
                .into();
                Ok(v)
            })
            .collect()
    })
}
pub fn revoke(app: &App, id: &str) -> Result<()> {
    security::validate_id(id)?;
    app.store.write(|db| {
        let key = format!("runtime:{id}");
        let mut v = read(db, &key)?.context("Runtime not found")?;
        v["revoked"] = true.into();
        put(db, &key, &v)?;
        db.execute(
            "UPDATE fleet_jobs SET done=CASE WHEN state IN ('preparing','queued') THEN 1 ELSE done END,state='cancelled' WHERE runtime=? AND done=0",
            [id],
        )?;
        Ok(())
    })
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct RuntimeMetadata {
    pub name: String,
    pub description: String,
}
pub fn update(db: &Connection, id: &str, input: RuntimeMetadata) -> Result<()> {
    security::validate_id(id)?;
    let name = input.name.trim();
    ensure!(
        !name.is_empty() && name.len() <= 80 && !name.chars().any(char::is_control),
        "Runtime name must contain 1–80 bytes without control characters"
    );
    ensure!(
        input.description.len() <= 2000 && !input.description.contains('\0'),
        "Description must be at most 2000 bytes without null characters"
    );
    let key = format!("runtime:{id}");
    let mut runtime = read(db, &key)?.context("Runtime not found")?;
    ensure!(
        runtime["revoked"] == false,
        "Revoked runtimes cannot be edited"
    );
    runtime["name"] = name.into();
    runtime["description"] = input.description.trim().into();
    put(db, &key, &runtime)?;
    store::event(db, "runtime.updated", &json!({"runtime_id":id}))?;
    Ok(())
}
pub fn settings(
    app: &App,
    id: &str,
    harness: Harness,
) -> Result<crate::codex_settings::CodexSettings> {
    let values = list(app)?;
    let runtime = values
        .iter()
        .find(|v| v["id"] == id && v["online"] == true)
        .context("Registered runtime is offline or revoked")?;
    serde_json::from_value(runtime["capabilities"][harness.as_str()].clone())
        .context("Harness is not signed in or its model catalog is unavailable on this runtime")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn worker_enterprise_environment_keeps_antigravity_native_and_other_harnesses_authenticated()
    -> Result<()> {
        for token in [Value::Null, json!("unused-platform-token")] {
            let mut command = Command::new("agy");
            command.env_clear();
            let mut secrets = Vec::new();
            enterprise_environment(
                &mut command,
                &json!({"harness":"antigravity","tool_token":token}),
                &mut secrets,
            )?;
            assert!(command.get_envs().next().is_none());
            assert!(secrets.is_empty());
        }
        for harness in ["codex", "opencode"] {
            let mut command = Command::new(harness);
            command.env_clear();
            let mut secrets = Vec::new();
            let error = enterprise_environment(
                &mut command,
                &json!({"harness":harness,"tool_token":null}),
                &mut secrets,
            )
            .unwrap_err();
            assert_eq!(error.to_string(), "Tool token required");
            assert!(command.get_envs().next().is_none());
            assert!(secrets.is_empty());
            enterprise_environment(
                &mut command,
                &json!({"harness":harness,"tool_token":"platform-token"}),
                &mut secrets,
            )?;
            assert!(command.get_envs().any(|(key, value)| {
                key == "AE_TOOL_TOKEN" && value == Some(std::ffi::OsStr::new("platform-token"))
            }));
            assert_eq!(security::redacted("platform-token", &secrets), "[REDACTED]");
        }
        Ok(())
    }

    #[test]
    fn large_output_batches_preserve_frames_and_completion() -> Result<()> {
        let temp = tempfile::tempdir()?;
        let path = temp.path().join("frames.jsonl");
        let large = "x".repeat(4 * 1024 * 1024);
        append(
            &path,
            &Frame {
                stderr: false,
                line: large.clone(),
            },
        )?;
        append(
            &path,
            &Frame {
                stderr: false,
                line: large.clone(),
            },
        )?;
        append(
            &path,
            &Frame {
                stderr: false,
                line: "completed".into(),
            },
        )?;
        let bytes = std::fs::read(&path)?;
        let first = report_batch(&bytes, 0)?;
        assert_eq!(first.len(), 1);
        assert_eq!(first[0]["line"], large);
        let last = report_batch(&bytes, first.len())?;
        assert_eq!(last.len(), 2);
        assert_eq!(last[0]["line"], large);
        assert_eq!(last[1]["line"], "completed");
        assert!(report_batch(&bytes, 3)?.is_empty());
        assert!(
            append(
                &path,
                &Frame {
                    stderr: false,
                    line: "x".repeat(MAX_REPORT_BYTES)
                }
            )
            .is_err()
        );
        assert_eq!(std::fs::read(&path)?, bytes);
        let (tx, rx) = std::sync::mpsc::sync_channel(2);
        let reader = crate::runtime::read_pipe(
            std::io::Cursor::new(format!("{large}\ncompleted\n")),
            tx,
            false,
        );
        assert_eq!(rx.recv()?.1, large);
        assert_eq!(rx.recv()?.1, "completed");
        reader.join().unwrap()?;
        Ok(())
    }

    #[test]
    fn metadata_updates_preserve_worker_registration_and_reject_configuration_injection()
    -> Result<()> {
        let directory = tempfile::tempdir()?;
        let store = store::Store::open(directory.path().join("org"))?;
        let original = json!({"id":"worker","name":"Before","token":"private-hash","root":"/workdir","os":"linux","revoked":false,"last_seen":123,"capabilities":{"codex":{"models":[]}}});
        store.write(|db| put(db, "runtime:worker", &original))?;
        store.write(|db| {
            update(
                db,
                "worker",
                RuntimeMetadata {
                    name: " After ".into(),
                    description: " Notes ".into(),
                },
            )
        })?;
        let updated = store.read(|db| read(db, "runtime:worker"))?.unwrap();
        assert_eq!(updated["name"], "After");
        assert_eq!(updated["description"], "Notes");
        for key in [
            "token",
            "root",
            "os",
            "revoked",
            "last_seen",
            "capabilities",
        ] {
            assert_eq!(updated[key], original[key]);
        }
        assert!(
            serde_json::from_value::<RuntimeMetadata>(
                json!({"name":"x","description":"","root":"/"})
            )
            .is_err()
        );
        for name in ["", " ", "bad\nname"] {
            assert!(
                store
                    .write(|db| update(
                        db,
                        "worker",
                        RuntimeMetadata {
                            name: name.into(),
                            description: String::new()
                        }
                    ))
                    .is_err()
            );
        }
        assert!(
            store
                .write(|db| update(
                    db,
                    "missing",
                    RuntimeMetadata {
                        name: "x".into(),
                        description: String::new()
                    }
                ))
                .is_err()
        );
        store.write(|db| {
            let mut runtime = updated.clone();
            runtime["revoked"] = true.into();
            put(db, "runtime:worker", &runtime)
        })?;
        assert!(
            store
                .write(|db| update(
                    db,
                    "worker",
                    RuntimeMetadata {
                        name: "x".into(),
                        description: String::new()
                    }
                ))
                .is_err()
        );
        Ok(())
    }
}
pub fn validate(app: &App, w: &Workspace) -> Result<Workspace> {
    let id = w.runtime_id.as_ref().context("Runtime required")?;
    security::validate_id(id)?;
    ensure!(
        w.ssh_host.is_none(),
        "Choose either a runtime or an SSH workstation"
    );
    ensure!(!w.path.trim().is_empty(), "Workdir required");
    let mut validated: Workspace =
        serde_json::from_value(inspect(app, id, &w.path, "probe", "workspace")?)?;
    validated.runtime_id = Some(id.clone());
    Ok(validated)
}
pub fn usage(app: &App, id: &str) -> Result<crate::codex_usage::UsageReport> {
    let runtimes = list(app)?;
    let runtime = runtimes
        .iter()
        .find(|r| r["id"] == id && r["online"] == true)
        .context("Runtime offline")?;
    ensure!(
        runtime["capabilities"]["read_operations"]["usage"] == 1,
        "Worker usage capability unavailable"
    );
    serde_json::from_value(inspect(app, id, "", "usage", "usage")?)
        .context("Unsupported usage response")
}

pub fn directories(app: &App, id: &str, path: &str) -> Result<crate::workspaces::DirectoryView> {
    serde_json::from_value(inspect(app, id, path, "directories", "directories")?)
        .map_err(Into::into)
}
fn inspect(app: &App, id: &str, path: &str, operation: &str, key: &str) -> Result<Value> {
    security::validate_id(id)?;
    ensure!(
        path.len() <= 4096 && !path.contains('\0'),
        "Invalid folder path"
    );
    let values = list(app)?;
    ensure!(
        values
            .iter()
            .any(|v| v["id"] == *id && v["revoked"] == false),
        "Runtime not available in this workspace"
    );
    ensure!(
        values.iter().any(|v| v["id"] == *id && v["online"] == true),
        "Runtime is offline; reconnect it before attaching a workdir"
    );
    let job = model::id();
    app.store.write(|db| {
        db.execute(
            "INSERT INTO fleet_jobs(id,runtime,state,request) VALUES(?,?,'queued',?)",
            params![job, id, json!({"op":operation,"path":path}).to_string()],
        )?;
        Ok(())
    })?;
    let deadline = Instant::now();
    loop {
        let done = app.store.read(|db| {
            Ok(
                db.query_row("SELECT done FROM fleet_jobs WHERE id=?", [&job], |r| {
                    r.get::<_, bool>(0)
                })?,
            )
        })?;
        if done {
            let frames = app.store.read(|db| {
                let mut q =
                    db.prepare("SELECT frame FROM fleet_frames WHERE job=? ORDER BY seq")?;
                Ok(q.query_map([&job], |r| r.get::<_, String>(0))?
                    .collect::<rusqlite::Result<Vec<_>>>()?)
            })?;
            for frame in frames {
                let f: Frame = serde_json::from_str(&frame)?;
                let v: Value = serde_json::from_str(&f.line)?;
                if let Some(result) = v.get(key) {
                    return Ok(result.clone());
                }
                if v["type"] == "error" {
                    anyhow::bail!(
                        "{}",
                        v["message"].as_str().unwrap_or("Runtime probe failed")
                    );
                }
            }
            anyhow::bail!("Runtime inspection ended without a result");
        }
        if deadline.elapsed() > Duration::from_secs(30) {
            app.store.write(|db| {
                cancel_job(db, &job)?;
                Ok(())
            })?;
            anyhow::bail!("Runtime did not respond within 30 seconds");
        }
        std::thread::sleep(Duration::from_millis(100));
    }
}
pub fn command(app: &App, runtime: &str) -> Result<Command> {
    let job = model::id();
    app.store.write(|db| {
        db.execute(
            "INSERT INTO fleet_jobs(id,runtime,state) VALUES(?,?,'preparing')",
            [&job, runtime],
        )?;
        Ok(())
    })?;
    let mut command = Command::new(std::env::current_exe()?);
    command
        .arg("--relay-db")
        .arg(app.store.org.join(".state/app.sqlite3"))
        .arg("--relay-job")
        .arg(job)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    Ok(command)
}
pub fn relay(path: &Path, job: &str) -> Result<()> {
    security::validate_id(job)?;
    let db = Connection::open(path)?;
    db.busy_timeout(Duration::from_secs(5))?;
    let mut input = BufReader::new(std::io::stdin());
    let mut line = String::new();
    input.read_line(&mut line)?;
    let request: Value = serde_json::from_str(&line)?;
    db.execute(
        "UPDATE fleet_jobs SET request=?,state='queued' WHERE id=? AND state='preparing'",
        [request.to_string(), job.into()],
    )?;
    let cancelled = Arc::new(AtomicBool::new(false));
    let flag = cancelled.clone();
    std::thread::spawn(move || {
        let mut last = String::new();
        loop {
            last.clear();
            match input.read_line(&mut last) {
                Ok(0) | Err(_) => {
                    flag.store(true, Ordering::SeqCst);
                    break;
                }
                Ok(_) => {
                    if last.trim() == "cancel" {
                        flag.store(true, Ordering::SeqCst);
                    }
                }
            }
        }
    });
    let mut seq = 0i64;
    let started = Instant::now();
    loop {
        let (state, done, runtime): (String, bool, String) = db.query_row(
            "SELECT state,done,runtime FROM fleet_jobs WHERE id=?",
            [job],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )?;
        if cancelled.load(Ordering::SeqCst) {
            cancel_job(&db, job)?;
        }
        let rows = {
            let mut q = db.prepare(
                "SELECT seq,frame FROM fleet_frames WHERE job=? AND seq>=? ORDER BY seq LIMIT 256",
            )?;
            q.query_map(params![job, seq], |r| {
                Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?))
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?
        };
        for (n, s) in rows {
            let f: Frame = serde_json::from_str(&s)?;
            if f.stderr {
                eprintln!("{}", f.line)
            } else {
                println!("{}", f.line)
            }
            seq = n + 1;
        }
        std::io::stdout().flush()?;
        let last: i64 = db.query_row(
            "SELECT COALESCE(MAX(seq)+1,0) FROM fleet_frames WHERE job=?",
            [job],
            |r| r.get(0),
        )?;
        if done && seq >= last {
            return Ok(());
        }
        let seen = read(&db, &format!("runtime:{runtime}"))?
            .and_then(|v| v["last_seen"].as_i64())
            .unwrap_or(0);
        if started.elapsed() > Duration::from_secs(65) && seen < chrono::Utc::now().timestamp() - 60
        {
            cancel_job(&db, job)?;
            anyhow::bail!(
                "Runtime disconnected; execution was not replayed. Reconcile its workdir before retrying"
            );
        }
        if state == "cancelled" && started.elapsed() > Duration::from_secs(15) {
            anyhow::bail!("Runtime job cancelled");
        }
        std::thread::sleep(Duration::from_millis(100));
    }
}
/// Called before human authentication. Every request is scoped to one registered runtime.
pub fn worker_request(
    apps: &[(String, App)],
    op: &str,
    token: &str,
    input: &Value,
) -> Result<Option<Value>> {
    let digest = hash(token);
    for (tenant, app) in apps {
        if !app.enabled.load(Ordering::Relaxed) {
            continue;
        }
        let result=app.store.write(|db|->Result<Option<Value>>{
            let mut q=db.prepare("SELECT key,value FROM metadata WHERE key LIKE 'runtime:%'")?;
            let rows=q.query_map([],|r|Ok((r.get::<_,String>(0)?,r.get::<_,String>(1)?)))?.collect::<rusqlite::Result<Vec<_>>>()?;
            for (key,value) in rows {
                let mut runtime:Value=serde_json::from_str(&value)?;
                if runtime["revoked"]==true{continue;}
                let field=if op=="enroll"{"enrollment"}else{"token"};
                if runtime[field]!=digest{continue;}
                let id=runtime["id"].as_str().context("Runtime ID missing")?.to_owned();
                if op=="enroll" {
                    ensure!(runtime["expires"].as_i64().unwrap_or(0)>chrono::Utc::now().timestamp(),"Enrollment expired");
                    let secret=format!("{}{}",model::id(),model::id());runtime["enrollment"]=Value::Null;runtime["token"]=hash(&secret).into();put(db,&key,&runtime)?;
                    return Ok(Some(json!({"id":id,"workspace":tenant,"token":secret})));
                }
                runtime["last_seen"]=chrono::Utc::now().timestamp().into();
                if op=="poll" {
                    runtime["heartbeat"] = runtime["heartbeat"].as_u64().unwrap_or(0).saturating_add(1).into();
                    runtime["capabilities"]=input["capabilities"].clone();runtime["os"]=input["os"].clone();runtime["root"]=input["root"].clone();put(db,&key,&runtime)?;
                    let job:Option<(String,String)>=db.query_row("SELECT id,request FROM fleet_jobs WHERE runtime=? AND state='queued' ORDER BY rowid LIMIT 1",[&id],|r|Ok((r.get(0)?,r.get(1)?))).optional()?;
                    let mut response=json!({"job":null});
                    if let Some((job,request))=job {
                        let request:Value=serde_json::from_str(&request)?;
                        let active=if matches!(request["op"].as_str(),Some("probe" | "directories" | "usage")){true}else{let run:crate::model::Run=store::get(db,"runs",request["run_id"].as_str().context("Run required")?)?;["starting","running"].contains(&run.status.as_str())};
                        if !active{cancel_job(db,&job)?;}
                        else {db.execute("UPDATE fleet_jobs SET state='claimed' WHERE id=? AND state='queued'",[&job])?;response["job"]=json!({"id":job,"request":request});}
                    }
                    return Ok(Some(response));
                }
                if op=="report" {
                    let job=input["job"].as_str().context("Job required")?;
                    let(state,request):(String,String)=db.query_row("SELECT state,request FROM fleet_jobs WHERE id=? AND runtime=?",[job,&id],|r|Ok((r.get(0)?,r.get(1)?))).context("Job is not owned by this runtime")?;
                    let request:Value=serde_json::from_str(&request)?;
                    let active=if matches!(request["op"].as_str(),Some("probe" | "directories" | "usage")){true}else{let run:crate::model::Run=store::get(db,"runs",request["run_id"].as_str().context("Run required")?)?;["starting","running"].contains(&run.status.as_str())};
                    let frames=input["frames"].as_array().context("Frames required")?;ensure!(frames.len()<=256,"Too many frames");
                    let offset=input["offset"].as_i64().context("Offset required")?;ensure!(offset>=0,"Invalid offset");
                    let expected:i64=db.query_row("SELECT COALESCE(MAX(seq)+1,0) FROM fleet_frames WHERE job=?",[job],|r|r.get(0))?;ensure!(offset<=expected,"Outbox gap; resend unacknowledged frames");
                    for (i,frame) in frames.iter().enumerate(){let _:Frame=serde_json::from_value(frame.clone())?;ensure!(frame.to_string().len()<=MAX_REPORT_BYTES,"Provider frame exceeds 8 MiB");let seq=offset+i as i64;
                        let old:Option<String>=db.query_row("SELECT frame FROM fleet_frames WHERE job=? AND seq=?",params![job,seq],|r|r.get(0)).optional()?;
                        if let Some(old)=old{ensure!(old==frame.to_string(),"Conflicting replay");}else{db.execute("INSERT INTO fleet_frames VALUES(?,?,?)",params![job,seq,frame.to_string()])?;}
                    }
                    if input["done"]==true {db.execute("UPDATE fleet_jobs SET done=1,state=CASE WHEN state='cancelled' THEN state ELSE 'finished' END WHERE id=?",[job])?;}
                    put(db,&key,&runtime)?;
                    return Ok(Some(json!({"ack":expected.max(offset+frames.len() as i64),"cancel":state=="cancelled"||!active,"done":input["done"]==true})));
                }
                anyhow::bail!("Unknown runtime operation");
            }
            Ok(None)
        })?;
        if result.is_some() {
            return Ok(result);
        }
    }
    Ok(None)
}

#[derive(Serialize, Deserialize)]
struct Registration {
    id: String,
    workspace: String,
    token: String,
    #[serde(default)]
    url: String,
}
#[derive(Serialize, Deserialize)]
struct Frame {
    stderr: bool,
    line: String,
}
const MAX_REPORT_BYTES: usize = 8 * 1024 * 1024;
fn report_batch(bytes: &[u8], ack: usize) -> Result<Vec<Value>> {
    let mut frames = Vec::new();
    let mut size = 0;
    for line in bytes
        .split_inclusive(|b| *b == b'\n')
        .filter(|line| line.ends_with(b"\n"))
        .skip(ack)
        .take(128)
    {
        let frame: Value = serde_json::from_slice(line)?;
        let length = frame.to_string().len();
        ensure!(length <= MAX_REPORT_BYTES, "Provider frame exceeds 8 MiB");
        if size + length > MAX_REPORT_BYTES {
            break;
        }
        size += length;
        frames.push(frame);
    }
    Ok(frames)
}
fn append(path: &Path, frame: &Frame) -> Result<()> {
    ensure!(
        serde_json::to_vec(frame)?.len() <= MAX_REPORT_BYTES,
        "Provider frame exceeds 8 MiB"
    );
    let mut out = OpenOptions::new().create(true).append(true).open(path)?;
    serde_json::to_writer(&mut out, frame)?;
    out.write_all(b"\n")?;
    out.sync_data()?;
    Ok(())
}
pub fn worker(
    url: Option<&str>,
    enrollment: Option<&str>,
    directory: &Path,
    root: &Path,
    enroll_only: bool,
    stopping: &AtomicBool,
) -> Result<()> {
    std::fs::create_dir_all(directory)?;
    std::fs::create_dir_all(root)?;
    let root = root.canonicalize()?;
    let directory = directory.canonicalize()?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&directory, std::fs::Permissions::from_mode(0o700))?;
    }
    let lock = OpenOptions::new()
        .create(true)
        .truncate(false)
        .read(true)
        .write(true)
        .open(directory.join("worker.lock"))?;
    fs2::FileExt::try_lock_exclusive(&lock)
        .context("A worker already owns this state directory")?;
    let http = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(15))
        .build()?;
    let config = directory.join("registration.json");
    if let Some(enrollment) = enrollment
        .filter(|s| !s.is_empty())
        .filter(|_| !config.exists())
    {
        ensure!(
            !config.exists(),
            "Worker is already registered; revoke it before using a new state directory"
        );
        let url = url
            .context("Controller URL required")?
            .trim_end_matches('/');
        let parsed = url::Url::parse(url)?;
        ensure!(
            ["http", "https"].contains(&parsed.scheme()) && parsed.host_str().is_some(),
            "HTTP(S) controller URL required"
        );
        let mut registration: Registration = http
            .post(format!("{url}/api/runtime/enroll"))
            .bearer_auth(enrollment)
            .json(&json!({}))
            .send()?
            .error_for_status()?
            .json()?;
        registration.url = url.into();
        store::atomic_write(&config, &serde_json::to_vec(&registration)?)?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(&config, std::fs::Permissions::from_mode(0o600))?;
        }
    }
    let registration: Registration =
        serde_json::from_slice(&std::fs::read(&config).context("Enroll this worker first")?)?;
    if enroll_only {
        tracing::info!(runtime=%registration.id,"Runtime enrolled");
        return Ok(());
    }
    let outbox = directory.join("outbox");
    std::fs::create_dir_all(&outbox)?;
    for entry in std::fs::read_dir(&outbox)? {
        let p = entry?.path();
        if p.is_dir() && !p.join("done").exists() {
            let frames = p.join("frames.jsonl");
            if frames.exists() {
                let bytes = std::fs::read(&frames)?;
                let committed = bytes.iter().rposition(|b| *b == b'\n').map_or(0, |i| i + 1);
                OpenOptions::new()
                    .write(true)
                    .open(&frames)?
                    .set_len(committed as u64)?;
            }
            append(
                &p.join("frames.jsonl"),
                &Frame {
                    stderr: false,
                    line:
                        json!({"type":"ae.remote.finished","status":"interrupted","exit_code":null})
                            .to_string(),
                },
            )?;
            store::atomic_write(&p.join("done"), b"1")?;
        }
    }
    let mut running = HashMap::<String, Arc<AtomicBool>>::new();
    let mut last_online = Instant::now();
    let mut refreshed = Instant::now() - Duration::from_secs(60);
    let mut capabilities = json!({});
    tracing::info!(runtime=%registration.id,workspace=%registration.workspace,"Registered runtime started");
    loop {
        if stopping.load(Ordering::SeqCst) {
            for flag in running.values() {
                flag.store(true, Ordering::SeqCst);
            }
            return Ok(());
        }
        if refreshed.elapsed() > Duration::from_secs(60) {
            capabilities = crate::worker_catalog::read();
            refreshed = Instant::now();
        }
        let iteration = (|| -> Result<()> {
            for entry in std::fs::read_dir(&outbox)? {
                let path = entry?.path();
                if !path.is_dir() || path.join("acknowledged").exists() {
                    continue;
                }
                let report = (|| -> Result<()> {
                    let id = path
                        .file_name()
                        .context("Outbox name")?
                        .to_string_lossy()
                        .into_owned();
                    let ack = std::fs::read_to_string(path.join("ack"))
                        .ok()
                        .and_then(|s| s.parse::<usize>().ok())
                        .unwrap_or(0);
                    let finished = path.join("done").exists();
                    let bytes = std::fs::read(path.join("frames.jsonl")).unwrap_or_default();
                    let frames = report_batch(&bytes, ack)?;
                    let count = bytes
                        .split_inclusive(|b| *b == b'\n')
                        .filter(|line| line.ends_with(b"\n"))
                        .count();
                    let done = finished && ack + frames.len() == count;
                    let response: Value = http
                        .post(format!("{}/api/runtime/report", registration.url))
                        .bearer_auth(&registration.token)
                        .json(&json!({"job":id,"offset":ack,"frames":frames,"done":done}))
                        .send()?
                        .error_for_status()?
                        .json()?;
                    store::atomic_write(&path.join("ack"), response["ack"].to_string().as_bytes())?;
                    if response["cancel"] == true {
                        if let Some(flag) = running.get(&id) {
                            flag.store(true, Ordering::SeqCst);
                        }
                    }
                    if done {
                        store::atomic_write(&path.join("acknowledged"), b"1")?;
                        running.remove(&id);
                    }
                    Ok(())
                })();
                if let Err(error) = report {
                    tracing::warn!(job=%path.file_name().unwrap_or_default().to_string_lossy(), "Worker output upload pending: {error}");
                }
            }
            let response: Value = http
                .post(format!("{}/api/runtime/poll", registration.url))
                .bearer_auth(&registration.token)
                .json(&json!({"capabilities":capabilities,"os":std::env::consts::OS,"root":root}))
                .send()?
                .error_for_status()?
                .json()?;
            if !response["job"].is_null() {
                let job = &response["job"];
                let id = job["id"].as_str().context("Job ID required")?;
                security::validate_id(id)?;
                let path = outbox.join(id);
                ensure!(
                    !path.exists(),
                    "Controller tried to replay an already claimed job"
                );
                std::fs::create_dir(&path)?;
                let flag = Arc::new(AtomicBool::new(false));
                running.insert(id.into(), flag.clone());
                let mut request = job["request"].clone();
                if let Some(args) = request["arguments"].as_array_mut() {
                    for arg in args {
                        if arg
                            .as_str()
                            .is_some_and(|s| s.starts_with("mcp_servers.enterprise.url="))
                        {
                            *arg =
                                format!("mcp_servers.enterprise.url=\"{}/mcp\"", registration.url)
                                    .into();
                        }
                    }
                }
                if request["harness"] == "opencode" {
                    request["opencode_config"]["mcp"]["enterprise"]["url"] =
                        format!("{}/mcp", registration.url).into();
                }
                let root = root.clone();
                let directory = directory.clone();
                std::thread::spawn(move || {
                    let result = execute_job(&request, &root, &directory, &path, &flag);
                    if let Err(e) = result {
                        let _ = append(
                            &path.join("frames.jsonl"),
                            &Frame {
                                stderr: false,
                                line: json!({"type":"error","message":e.to_string()}).to_string(),
                            },
                        );
                        let _=append(&path.join("frames.jsonl"),&Frame{stderr:false,line:json!({"type":"ae.remote.finished","status":"failed","exit_code":1}).to_string()});
                    }
                    if let Err(e) = store::atomic_write(&path.join("done"), b"1") {
                        tracing::error!("Persist worker completion: {e}");
                    }
                });
            }
            Ok(())
        })();
        match iteration {
            Ok(()) => last_online = Instant::now(),
            Err(e) => {
                tracing::warn!("Worker reconnecting: {e}");
                std::thread::sleep(Duration::from_secs(3));
            }
        }
        if last_online.elapsed() > Duration::from_secs(60) {
            for flag in running.values() {
                flag.store(true, Ordering::SeqCst);
            }
        }
        std::thread::sleep(Duration::from_millis(500));
    }
}
fn enterprise_environment(
    command: &mut Command,
    request: &Value,
    secrets: &mut Vec<String>,
) -> Result<()> {
    if request["harness"] == "antigravity" {
        return Ok(());
    }
    let token = request["tool_token"]
        .as_str()
        .context("Tool token required")?;
    secrets.push(token.into());
    command.env("AE_TOOL_TOKEN", token);
    Ok(())
}

fn execute_job(
    request: &Value,
    root: &Path,
    directory: &Path,
    outbox: &Path,
    cancel: &AtomicBool,
) -> Result<()> {
    if request["op"] == "usage" {
        let executable = std::env::var_os("AE_CODEX")
            .map(PathBuf::from)
            .unwrap_or_else(|| PathBuf::from("codex"));
        let report = crate::codex_usage::read_native(&executable, &directory.join("usage"))?;
        append(
            &outbox.join("frames.jsonl"),
            &Frame {
                stderr: false,
                line: json!({"usage":report}).to_string(),
            },
        )?;
        return Ok(());
    }
    if request["op"] == "directories" {
        let view = crate::workspaces::browse_runtime(
            root,
            directory,
            request["path"].as_str().context("Folder path required")?,
        )?;
        append(
            &outbox.join("frames.jsonl"),
            &Frame {
                stderr: false,
                line: json!({"directories":view}).to_string(),
            },
        )?;
        return Ok(());
    }
    let path = request["path"].as_str().context("Workdir required")?;
    let workspace = security::validate_workspace(path)?;
    let canonical = Path::new(&workspace.canonical_path);
    ensure!(
        canonical.starts_with(root),
        "Workdir is outside the runtime's registered root"
    );
    ensure!(
        !canonical.starts_with(directory),
        "Worker state cannot be used as a workdir"
    );
    if request["op"] == "probe" {
        append(
            &outbox.join("frames.jsonl"),
            &Frame {
                stderr: false,
                line: json!({"workspace":workspace}).to_string(),
            },
        )?;
        return Ok(());
    }
    ensure!(
        request["workspace"]["canonical_path"] == workspace.canonical_path,
        "Attached directory identity changed; reattach it explicitly"
    );
    let session = request["session_id"].as_str().context("Session required")?;
    security::validate_id(session)?;
    let home = directory.join("sessions").join(session);
    std::fs::create_dir_all(&home)?;
    store::atomic_write(
        &home.join("AGENTS.md"),
        request["instructions"].as_str().unwrap_or("").as_bytes(),
    )?;
    let opencode = request["harness"] == "opencode";
    let antigravity = request["harness"] == "antigravity";
    let auth = if opencode || antigravity {
        None
    } else {
        Some(crate::runtime::seed_auth(&home)?)
    };
    let open_auth = if opencode {
        Some(crate::opencode::seed_credentials(&workspace, &home)?)
    } else {
        None
    };
    let mut args: Vec<String> = serde_json::from_value(request["arguments"].clone())?;
    if let Some(schema) = request["schema"].as_str() {
        store::atomic_write(&home.join("schema.json"), schema.as_bytes())?;
        args.extend([
            "--output-schema".into(),
            home.join("schema.json").to_string_lossy().into_owned(),
        ]);
    }
    for image in request["images"].as_array().context("Images required")? {
        use base64::Engine;
        let id = image["id"].as_str().context("Image ID")?;
        security::validate_id(id)?;
        let file = home.join(id);
        store::atomic_write(
            &file,
            &base64::engine::general_purpose::STANDARD
                .decode(image["data"].as_str().context("Image data")?)?,
        )?;
        args.extend([
            if opencode { "--file" } else { "--image" }.into(),
            file.to_string_lossy().into_owned(),
        ]);
    }
    if !opencode && !antigravity {
        args.push("--ignore-user-config".into());
        if let Some(catalog) = crate::codex_settings::catalog_argument()? {
            args.extend(["-c".into(), catalog]);
        }
    }
    #[cfg(windows)]
    if !opencode && !antigravity {
        args.extend(["-c".into(), "windows.sandbox=\"elevated\"".into()]);
    }
    if let Some(native) = request["native_session_id"]
        .as_str()
        .filter(|_| !antigravity)
    {
        args.extend([
            if opencode {
                "--session"
            } else if antigravity {
                "--conversation"
            } else {
                "resume"
            }
            .into(),
            native.into(),
        ]);
    }
    if !opencode && !antigravity {
        args.push("-".into());
    }
    let executable = if antigravity {
        crate::antigravity::executable()?
    } else if opencode {
        crate::opencode::executable()?
    } else {
        std::env::var_os("AE_CODEX")
            .map(PathBuf::from)
            .unwrap_or_else(|| PathBuf::from("codex"))
    };
    let env = security::workdir_env(&workspace)?;
    let mut secrets: Vec<String> = env.values().cloned().collect();
    if let Some(auth) = &open_auth {
        secrets.extend(auth.secrets());
    }
    let mut command = Command::new(&executable);
    command.args(&args).current_dir(canonical).env_clear();
    crate::runtime::system_environment(&mut command);
    command
        .envs(env)
        .env("CODEX_HOME", &home)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    enterprise_environment(&mut command, request, &mut secrets)?;
    if opencode {
        crate::opencode::environment(&mut command, Some(&home));
        let mut config = request["opencode_config"].clone();
        config["instructions"] = json!([home.join("AGENTS.md")]);
        command.env("OPENCODE_CONFIG_CONTENT", config.to_string());
    }
    #[cfg(windows)]
    let (mut child, owner) =
        crate::process_tree::OwnedProcessTree::spawn_with_creation_flags(&mut command, 0x08000000)?;
    #[cfg(not(windows))]
    let (mut child, owner) = crate::process_tree::OwnedProcessTree::spawn(&mut command)?;
    let frames = outbox.join("frames.jsonl");
    append(&frames,&Frame{stderr:false,line:json!({"type":"ae.remote.started","pid":child.id(),"executable":executable,"arguments":args,"cwd":canonical}).to_string()})?;
    let (mut stdin, stdout, stderr) = (
        child.stdin.take().context("stdin")?,
        child.stdout.take().context("stdout")?,
        child.stderr.take().context("stderr")?,
    );
    let prompt = request["prompt"]
        .as_str()
        .context("Prompt required")?
        .to_owned();
    let writer = std::thread::spawn(move || {
        if !antigravity {
            let _ = stdin.write_all(prompt.as_bytes());
        }
    });
    let (tx, rx) = std::sync::mpsc::sync_channel(128);
    let reader =
        |pipe: Box<dyn std::io::Read + Send>, error, tx: std::sync::mpsc::SyncSender<Frame>| {
            std::thread::spawn(move || -> Result<()> {
                for line in BufReader::new(pipe).lines() {
                    if tx
                        .send(Frame {
                            stderr: error,
                            line: line?,
                        })
                        .is_err()
                    {
                        break;
                    }
                }
                Ok(())
            })
        };
    let readers = [
        reader(Box::new(stdout), false, tx.clone()),
        reader(Box::new(stderr), true, tx),
    ];
    let mut size = 0;
    let mut stopped = None;
    let status = loop {
        for mut f in rx.try_iter().take(256) {
            f.line = security::redacted(&f.line, &secrets);
            size += f.line.len();
            if size > 8 * 1024 * 1024 {
                stopped = Some("failed");
                break;
            }
            append(&frames, &f)?;
        }
        if cancel.load(Ordering::SeqCst) {
            stopped = Some("cancelled");
        }
        // The controller accounts for active time, excluding human-question waits.
        // Its cancellation and the worker's offline watchdog own termination.
        if stopped.is_some() {
            owner.request_stop()?;
            owner.terminate()?;
        }
        if let Some(status) = owner.try_wait(|| child.try_wait())? {
            break status;
        }
        std::thread::sleep(Duration::from_millis(50));
    };
    while readers.iter().any(|r| !r.is_finished()) {
        for mut f in rx.try_iter() {
            f.line = security::redacted(&f.line, &secrets);
            append(&frames, &f)?;
        }
        std::thread::sleep(Duration::from_millis(10));
    }
    for r in readers {
        r.join()
            .map_err(|_| anyhow::anyhow!("Pipe reader panicked"))??;
    }
    for mut f in rx.try_iter() {
        f.line = security::redacted(&f.line, &secrets);
        append(&frames, &f)?;
    }
    let _ = writer.join();
    append(
        &frames,
        &Frame {
            stderr: false,
            line: json!({"type":"ae.remote.finished","exit_code":status.code(),"status":stopped})
                .to_string(),
        },
    )?;
    if let Some(auth) = auth {
        auth.finish()?;
    }
    if let Some(auth) = open_auth {
        auth.finish()?;
    }
    Ok(())
}
