# Proposal: CAT-001 — Runtime-Aware Model Catalog & Multi-Harness

Tanggal: 14 Oktober 2026 (Asia/Jakarta).  
ADR Rujukan: [0001-personal-agentic-architecture-contract](../../../docs/decisions/0001-personal-agentic-architecture-contract.md).  
Bukti Audit: [`docs/evidence/ev-004-architecture-proposal-review.md`](../../../docs/evidence/ev-004-architecture-proposal-review.md).

---

## 1. Identitas dan Kondisi Awal

- **Change ID**: `CAT-001-runtime-model-catalog`
- **Tautan Arsitektur**: [architecture-plan.md](../../../docs/architecture-plan.md)
- **Komponen Terdampak**:
  - `src/frontend/src/App.tsx`
  - `src/frontend/src/components/NewAgentDialog.tsx`
  - `src/frontend/src/runtimeCatalog.ts`
  - `src/backend/src/api.rs`

Kondisi awal:
- Dashboard frontend di `src/frontend/src/App.tsx:292` secara global memanggil `/codex/settings` tanpa konteks runtime/host.
- Jika controller lokal tidak memiliki instalasi Codex, pemanggilan ini memicu banner error merah `models_cache.json` di dashboard, padahal pengguna mungkin menggunakan runtime remote SSH atau harness Antigravity yang valid.
- Usulan sebelumnya untuk mem-bind-mount seluruh direktori host `.codex` ke kontainer platform ditolak karena mengekspos file kredensial sensitif (`auth.json`).

---

## 2. Masalah, Hasil, dan Scope

### Hasil Pengguna yang Ditargetkan
1. Ketersediaan katalog model mengikuti *effective runtime* (lokal, SSH, atau registered worker) dan harness yang aktif.
2. Tidak ada banner error palsu di UI ketika runtime non-Codex dipilih.
3. Kredensial host terlindungi dan tidak dibocorkan ke kontainer platform.

### Scope
- Audit dan perbaikan pemanggilan katalog model global di `src/frontend/src/App.tsx`.
- Pemanfaatan endpoint `/harness/settings` yang sudah mendukung parameter harness, agent, dan host context.
- Penanganan fallback yang bersih di frontend: ketiadaan cache model lokal tidak boleh merusak alur runtime lain yang valid.

### Non-Goal
- Memaksa seluruh agen menggunakan satu harness default.
- Mem-mount direktori `.codex` host ke kontainer.

---

## 3. Requirement dan Skenario Penerimaan

### REQ-CAT-001-1: Resolusi Katalog Sesuai Runtime Aktif
- **GIVEN** Pengguna memilih runtime SSH atau registered worker.
- **WHEN** Daftar model dimuat pada modal pembuatan agen atau profile.
- **THEN** Katalog model diambil dari context runtime tersebut, bukan dari controller lokal.

### REQ-CAT-001-2: Isolasi Kredensial Autentikasi
- **GIVEN** Kontainer platform berjalan di server produksi.
- **WHEN** File `.codex` diperiksa di dalam kontainer.
- **THEN** Tidak ada akses baca langsung ke token atau `auth.json` milik host.
