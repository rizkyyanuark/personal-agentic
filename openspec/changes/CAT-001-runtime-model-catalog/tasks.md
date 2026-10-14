# Tasks: CAT-001 — Runtime-Aware Model Catalog & Multi-Harness

Proposal: [proposal.md](proposal.md) | Verifikasi: [verification.md](verification.md).

---

## Daftar Tugas

### T1-1: Audit Consumer Global Catalog di Frontend
**Requirement**: REQ-CAT-001-1  
**File**: `src/frontend/src/App.tsx`, `src/frontend/src/runtimeCatalog.ts`  
**Perubahan**: Telusuri seluruh consumer dari `setCatalog` global di `App.tsx`. Pastikan ketiadaan katalog controller tidak memblokir render atau memunculkan banner error jika user berada pada runtime lain.  
**Bukti selesai**: Dashboard tidak menampilkan banner merah saat dibuka tanpa controller Codex cache.

---

### T1-2: Sinkronkan Model Selection dengan Endpoint `/harness/settings`
**Requirement**: REQ-CAT-001-1  
**File**: `src/frontend/src/components/NewAgentDialog.tsx`, `src/frontend/src/App.tsx`  
**Perubahan**: Arahkan pemuatan katalog model ke endpoint `/harness/settings` yang menyertakan informasi runtime/harness terpilih.  
**Bukti selesai**: Modal agen menampilkan daftar model yang sesuai dengan runtime target.

---

### T1-3: Typecheck & Build Verifikasi Frontend
**Requirement**: Frontend Integrity  
**File**: `src/frontend/`  
**Perubahan**: Jalankan lint dan check:
```bash
npm run check
```
**Bukti selesai**: `npm run check` lulus dengan 0 TypeScript errors.
