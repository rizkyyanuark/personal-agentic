use anyhow::{Context, Result, ensure};
use serde::{Deserialize, Serialize};
use std::{
    fmt,
    path::PathBuf,
    sync::{
        Arc, RwLock,
        atomic::{AtomicUsize, Ordering},
    },
};
use ts_rs::TS;

#[derive(Clone, Copy, Debug, Default, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export)]
pub enum Phase {
    #[default]
    Open,
    Draining,
    Sealed,
}

#[derive(Clone, Debug, PartialEq, Serialize, TS)]
#[ts(export)]
pub struct Maintenance {
    pub phase: Phase,
    #[ts(type = "number | null")]
    pub deadline_unix_seconds: Option<i64>,
}

#[derive(Clone, Copy)]
pub enum Admission {
    Root,
    Continuation,
    Progress,
}

#[derive(Debug)]
pub struct Closed;
impl fmt::Display for Closed {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str("Deployment maintenance is active. Try again after maintenance finishes.")
    }
}
impl std::error::Error for Closed {}
#[derive(Debug)]
pub struct Conflict(pub &'static str);
impl fmt::Display for Conflict {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.0)
    }
}
impl std::error::Error for Conflict {}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Record {
    phase: Phase,
    generation: Option<String>,
    deadline_unix_seconds: Option<i64>,
    last_generation: Option<String>,
}

#[derive(Deserialize)]
#[serde(tag = "action", rename_all = "snake_case", deny_unknown_fields)]
pub enum Control {
    Begin {
        generation: String,
        #[serde(default = "timeout")]
        timeout_seconds: u16,
    },
    Seal {
        generation: String,
    },
    Resume {
        generation: String,
    },
}
fn timeout() -> u16 {
    900
}

#[derive(Debug, Serialize)]
pub struct Status {
    pub protocol_version: u8,
    pub phase: Phase,
    pub generation: Option<String>,
    pub deadline_unix_seconds: Option<i64>,
    pub active_operations: usize,
    pub inflight_operations: usize,
}

#[derive(Debug)]
pub struct Drain {
    path: PathBuf,
    state: RwLock<Record>,
    inflight: AtomicUsize,
}
#[derive(Debug)]
pub struct Permit {
    drain: Arc<Drain>,
    counted: bool,
}
impl Drop for Permit {
    fn drop(&mut self) {
        if self.counted {
            self.drain.inflight.fetch_sub(1, Ordering::SeqCst);
        }
    }
}

impl Drain {
    pub fn open(path: PathBuf) -> Result<Arc<Self>> {
        let record = match std::fs::symlink_metadata(&path) {
            Ok(metadata) => {
                ensure!(
                    metadata.is_file() && !metadata.file_type().is_symlink(),
                    "Invalid deployment drain record"
                );
                serde_json::from_slice::<Record>(&std::fs::read(&path)?)?
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Record::default(),
            Err(error) => return Err(error.into()),
        };
        Self::validate(&record)?;
        let drain = Arc::new(Self {
            path,
            state: RwLock::new(record),
            inflight: AtomicUsize::new(0),
        });
        drain.expire()?;
        Ok(drain)
    }
    fn validate(record: &Record) -> Result<()> {
        ensure!(
            match record.phase {
                Phase::Open =>
                    record.generation.is_none() && record.deadline_unix_seconds.is_none(),
                Phase::Draining =>
                    record.generation.is_some() && record.deadline_unix_seconds.is_some(),
                Phase::Sealed =>
                    record.generation.is_some() && record.deadline_unix_seconds.is_none(),
            },
            "Invalid deployment drain state"
        );
        for generation in [&record.generation, &record.last_generation]
            .into_iter()
            .flatten()
        {
            Self::generation(generation)?;
        }
        Ok(())
    }
    fn generation(value: &str) -> Result<()> {
        ensure!(
            uuid::Uuid::parse_str(value)?.to_string() == value,
            "Generation must be a canonical UUID"
        );
        Ok(())
    }
    fn persist(&self, record: &Record) -> Result<()> {
        crate::store::atomic_write(&self.path, &serde_json::to_vec(record)?)?;
        #[cfg(unix)]
        std::fs::File::open(
            self.path
                .parent()
                .context("Drain state directory missing")?,
        )?
        .sync_all()?;
        Ok(())
    }
    fn expire(&self) -> Result<()> {
        let mut record = self
            .state
            .write()
            .map_err(|_| anyhow::anyhow!("Deployment gate unavailable"))?;
        if record.phase == Phase::Draining
            && record
                .deadline_unix_seconds
                .is_some_and(|at| at <= chrono::Utc::now().timestamp())
        {
            let next = Record {
                last_generation: record.generation.clone(),
                ..Record::default()
            };
            self.persist(&next)?;
            *record = next;
        }
        Ok(())
    }
    pub fn maintenance(&self) -> Result<Maintenance> {
        self.expire()?;
        let record = self
            .state
            .read()
            .map_err(|_| anyhow::anyhow!("Deployment gate unavailable"))?;
        Ok(Maintenance {
            phase: record.phase,
            deadline_unix_seconds: record.deadline_unix_seconds,
        })
    }
    pub fn transaction<T>(
        &self,
        admission: Option<Admission>,
        f: impl FnOnce() -> Result<T>,
    ) -> Result<T> {
        self.with_state(admission, |_| f())
    }
    fn with_state<T>(
        &self,
        admission: Option<Admission>,
        f: impl FnOnce(&Record) -> Result<T>,
    ) -> Result<T> {
        self.expire()?;
        let record = self
            .state
            .read()
            .map_err(|_| anyhow::anyhow!("Deployment gate unavailable"))?;
        if admission.is_some_and(|kind| {
            !matches!(kind, Admission::Progress)
                && (record.phase == Phase::Sealed
                    || (record.phase == Phase::Draining && matches!(kind, Admission::Root)))
        }) {
            return Err(Closed.into());
        }
        f(&record)
    }
    pub fn operation(self: &Arc<Self>, kind: Admission) -> Result<Permit> {
        self.with_state(Some(kind), |record| {
            let counted = !(record.phase == Phase::Sealed && matches!(kind, Admission::Progress));
            if counted {
                self.inflight.fetch_add(1, Ordering::SeqCst);
            }
            Ok(Permit {
                drain: self.clone(),
                counted,
            })
        })
    }
    fn snapshot(&self, record: &Record, active: usize) -> Status {
        let inflight = self.inflight.load(Ordering::SeqCst);
        Status {
            protocol_version: 1,
            phase: record.phase,
            generation: record.generation.clone(),
            deadline_unix_seconds: record.deadline_unix_seconds,
            active_operations: active + inflight,
            inflight_operations: inflight,
        }
    }
    pub fn status(&self, count: impl FnOnce() -> Result<usize>) -> Result<Status> {
        self.expire()?;
        let record = self
            .state
            .read()
            .map_err(|_| anyhow::anyhow!("Deployment gate unavailable"))?;
        Ok(self.snapshot(&record, count()?))
    }
    pub fn control(&self, input: Control, count: impl FnOnce() -> Result<usize>) -> Result<Status> {
        self.expire()?;
        let mut record = self
            .state
            .write()
            .map_err(|_| anyhow::anyhow!("Deployment gate unavailable"))?;
        let mut next = record.clone();
        match input {
            Control::Begin {
                generation,
                timeout_seconds,
            } => {
                Self::generation(&generation)?;
                ensure!(
                    (1..=900).contains(&timeout_seconds),
                    "Drain wait must be between 1 and 900 seconds"
                );
                if record.phase != Phase::Open {
                    if record.generation.as_ref() != Some(&generation) {
                        return Err(Conflict("Another deployment owns maintenance").into());
                    }
                } else {
                    if record.last_generation.as_ref() == Some(&generation) {
                        return Err(Conflict("Deployment generation already finished").into());
                    }
                    next.phase = Phase::Draining;
                    next.generation = Some(generation);
                    next.deadline_unix_seconds =
                        Some(chrono::Utc::now().timestamp() + i64::from(timeout_seconds));
                }
            }
            Control::Seal { generation } => {
                Self::generation(&generation)?;
                if record.generation.as_ref() != Some(&generation) || record.phase == Phase::Open {
                    return Err(Conflict("Deployment generation does not own maintenance").into());
                }
                if self.inflight.load(Ordering::SeqCst) != 0 || count()? != 0 {
                    let error = Conflict("Accepted work is still active; deployment is not sealed");
                    return Err(error.into());
                }
                next.phase = Phase::Sealed;
                next.deadline_unix_seconds = None;
                self.persist(&next)?;
                *record = next;
                return Ok(self.snapshot(&record, 0));
            }
            Control::Resume { generation } => {
                Self::generation(&generation)?;
                if !(record.generation.as_ref() == Some(&generation)
                    || (record.phase == Phase::Open
                        && record.last_generation.as_ref() == Some(&generation)))
                {
                    return Err(Conflict("Deployment generation does not own maintenance").into());
                }
                next = Record {
                    last_generation: Some(generation),
                    ..Record::default()
                };
            }
        }
        let active = count()?;
        self.persist(&next)?;
        *record = next;
        Ok(self.snapshot(&record, active))
    }
}
