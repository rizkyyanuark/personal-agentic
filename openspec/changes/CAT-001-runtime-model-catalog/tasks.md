# Tasks: CAT-001

[Proposal](proposal.md) | [Verification](verification.md). Satu penulis frontend pada worktree `codex/runtime-model-catalog`, dasar `ec70e3287682fdc3c6a86df03054a38fe6e92817`. Integrasi ADR/evidence bersama change lain dilakukan koordinator; source primary yang dirty dipertahankan.

- [x] T1 — REQ-1/4: telusuri consumer global dan hapus controller Codex fallback; badge memakai recorded name/ID serta harness run.
- [x] T2 — REQ-1/2: dialog memuat `/harness/settings` dengan Local/SSH/runtime/project context, isolate error, refresh, disable Create tanpa model valid, dan abaikan response lama.
- [x] T3 — REQ-1/4: Profile membuang metadata lama saat reload dan menampilkan unavailable dengan tetap menjaga saved model/reasoning/session.
- [x] T4 — REQ-1/2/3/4: browser/API pada service nyata, termasuk error cache, pilihan konteks, stale response, auth/tenant, persistence dan historical fixtures; catat keterbatasan setiap transport.
- [x] T5 — frontend integrity: dari `src`, `npm ci --no-audit --no-fund`, `npm run lint --workspace frontend`, `npm run build --workspace frontend`; review diff, tanpa dependency baru.
- [ ] T6 — integrasi/CI/release: review source dan bukti, pipeline terbaru serta acceptance produksi setelah merge. Koordinator mengelola Issue/MR; jangan menyalin fase Issue ke dokumen.

Predecessor T4: bundle hasil T2/T3 dan kandidat service terisolasi; tidak menulis ke produksi. T6 bergantung T4 dan pemeriksaan perubahan lain yang digabung. Perubahan backend hanya bila bukti resolver/auth menunjukkan defect yang dapat direproduksi.
