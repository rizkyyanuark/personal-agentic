# Proposal: AGT-001 — Sub-Agent Concurrency & Process Ownership Audit

Tanggal: 14 Oktober 2026 (Asia/Jakarta).  
ADR Rujukan: [0003-subagent-concurrency-and-process-guard](../../../docs/decisions/0003-subagent-concurrency-and-process-guard.md).  
Bukti Audit: [`docs/evidence/ev-004-architecture-proposal-review.md`](../../../docs/evidence/ev-004-architecture-proposal-review.md).

---

## 1. Identitas dan Kondisi Awal

- **Change ID**: `AGT-001-subagent-concurrency-and-process-guard`
- **Tautan Arsitektur**: [architecture-plan.md](../../../docs/architecture-plan.md)
- **Komponen Terdampak**:
  - `src/backend/remote_bridge.py`
  - `src/backend/src/runtime.rs`
  - `src/backend/src/coordination.rs`
  - `src/backend/src/process_tree/spawn.rs`

Kondisi awal di codebase:
- `remote_bridge.py` (baris 348–368 & 433–434) telah menggunakan `start_new_session=True` dan mengirim sinyal `TERM`/`KILL` ke process group (`killpg`).
- `runtime.rs` (baris 711 & 788–798) telah menggunakan `OwnedProcessTree` dan timeout runtime per agent.
- `coordination.rs` (baris 406–442) telah membatasi routing coordinator, menolak pemanggilan duplikat, dan membatasi relasi delegate.
- `runtime.rs` (baris 124–142) telah menyerialkan antrean untuk sesi/workdir yang sama, sembari mengizinkan eksekusi paralel yang sah antara main chat dan side chat sesuai [PRD.md](../../../PRD.md#L49).

Oleh karena itu, kontrol proses yang diusulkan sebelumnya sebagian besar **sudah ada**. Paket ini diubah dari implementasi kontrol baru menjadi **paket audit investigasi dan pengujian regresi terarah**.

---

## 2. Masalah, Hasil, dan Scope

### Hasil Pengguna yang Ditargetkan
1. Pemastian bahwa proses agen yang dihentikan (manual stop, timeout, atau disconnect) benar-benar mati bersih tanpa meninggalkan proses zombie di host.
2. Mempertahankan paralelisme main/side chat yang sah sesuai PRD, dengan pemisahan worktree terpisah bila agen melakukan penulisan kode bersamaan.
3. Menemukan dan mereproduksi celah nyata (jika ada) sebelum menambahkan kode pengaman baru.

### Scope
- Pemetaan alur terminasi proses agen di `remote_bridge.py` dan `runtime.rs`.
- Pengujian regresi skenario pembatalan agen (Stop di UI) pada lingkungan Linux/SSH.
- Audit batas routing delegasi antar-agen.

### Non-Goal
- Membuat lock file universal satu folder yang merusak paralelisme chat yang sah.
- Mengubah arsitektur process ownership yang sudah stabil di backend.

---

## 3. Requirement dan Skenario Penerimaan

### REQ-AGT-001-1: Verifikasi Terminasi Bersih Process Group
- **GIVEN** Agen menjalankan runtime aktif beserta child process.
- **WHEN** Tindakan Stop dipicu dari platform UI.
- **THEN** Seluruh process tree diterminasi dalam 10 detik tanpa proses zombie yang tertinggal di host.

### REQ-AGT-001-2: Preservasi Paralelisme Sah Sesuai PRD
- **GIVEN** Sesi main chat dan side chat berjalan bersamaan pada workdir yang berbeda atau read-only.
- **WHEN** Permintaan dikirim ke masing-masing sesi.
- **THEN** Kedua sesi dapat berjalan secara paralel tanpa saling memblokir secara sepihak.
