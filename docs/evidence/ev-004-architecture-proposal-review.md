# Review kontrak arsitektur personal-agentic — 13 Oktober 2026

Jenis bukti: **Inspected** (source, kontrak, dan API GitLab). Dokumen ini berisi koreksi dan rumusan issue untuk ditinjau; bukan penerimaan implementasi atau bukti deploy.

## Identitas dan batas review

- Checkout yang diminta pemilik: C:/Users/rizky/Documents/GitHub/personal-agentic.
- Branch main; HEAD ec70e3287682fdc3c6a86df03054a38fe6e92817.
- Kondisi awal: docs/development.md modified; architecture-plan.md, deployment.md, decisions/, evidence/, dan tiga folder change baru masih untracked. Draft kolega dipertahankan.
- Sumber masukan: notulensi lampiran, tiga ADR, DEP-003/OPS-001/AGT-001 beserta tasks dan verification, kode/config, template lokal, serta dokumentasi resmi OpenSpec.
- GitLab project 5 saat diperiksa memiliki Issue #1–#5. Tiga change baru belum mempunyai issue GitLab. Issue #5 CI-003 masih opened; deskripsinya masih menyebut merge sebagai langkah berikutnya, walaupun MR !6 telah merged dalam pemeriksaan sebelumnya.
- Review ini tidak menjalankan cleanup, retensi, model/provider run, restart, deployment, atau perubahan issue GitLab. Snapshot host pada notulensi tidak diperlakukan sebagai pengukuran terbaru.

## Keputusan pemilik pada review ini

1. Tetap multi-harness; ketersediaan dan katalog mengikuti workstation/runtime yang dipilih.
2. Pertahankan paralel; gunakan worktree terpisah untuk pekerjaan menulis bila diperlukan. Ini tidak menyetujui lock universal satu folder atau pembuatan worktree otomatis tanpa pilihan pengguna.
3. Otomatisasi cleanup hanya untuk cache/image yang terbukti aman. Volume dan riwayat chat tetap manual.
4. Backup seluruh state yang dikelola platform: DB, attachment, volume workdir internal, konfigurasi dan kunci runtime yang diperlukan. Source proyek eksternal mengikuti backup proyeknya sendiri. Inventaris diperlukan sebelum menghapus arsip runtime lama.

Keputusan ini menerima batas produk di atas, bukan seluruh rancangan ADR lama. Klaim Accepted pada ADR lama perlu diganti menjadi Proposed/reviewed, lalu keputusan yang benar-benar diterima dicatat beserta asal persetujuannya.

## Kesimpulan pembagian pekerjaan

Tiga issue implementasi masuk akal, tetapi pembagiannya sebaiknya **release, katalog/runtime, dan operasi host**. AGT menjadi audit/regresi terarah dahulu karena sebagian besar mekanisme yang hendak dibuat sudah ada.

| Pekerjaan | Tracking yang disarankan | Hasil mandiri | Ketergantungan |
| --- | --- | --- | --- |
| Release preflight dan diagnosis kegagalan | Lanjutkan [Issue #5 CI-003](https://gitlab.tugasakhir.space/rizkyyanuark/personal-agentic/-/work_items/5); gunakan DEP-003 terpisah hanya bila inventaris membuktikan perlu perubahan format/semantik backup | Release gagal jelas sebelum stop untuk prasyarat yang tidak terpenuhi, mempertahankan state/recovery | Inventaris state; kompatibilitas manifest jika format berubah |
| Katalog sesuai harness/runtime | Issue baru, ID usulan CAT-001 | Dashboard/Profile benar pada local, SSH dan registered runtime | Tidak bergantung pada perbaikan release untuk source/acceptance lokal |
| Maintenance aman dan baseline kapasitas | OPS-001 dipersempit | Cleanup terarah dan batas kapasitas berdasarkan workload | Memahami image/journal yang perlu dilindungi; mengukur beban lintas proyek |
| Audit keselamatan eksekusi agen | AGT-001 sebagai backlog investigasi; bukan implementasi empat kontrol baru | Matriks perilaku dan reproduksi bug bila ada | Tidak menjadi gate wajib bagi release atau katalog |

Tidak perlu rantai DEP → OPS → AGT yang menghalangi pekerjaan independen. Prioritas release lebih tinggi karena ada job gagal; ini prioritas operasional, bukan dependency teknis seluruh paket. Issue baru hanya diperlukan jika hasilnya dapat diterima/dirilis sendiri atau scope memang berubah.

## Koreksi berbasis source

### F1 — Backup bukan hanya SQLite, dan penghapusan arsip mengubah recovery

**Draft:** ADR 0001 dan DEP-003 mengutip PRD baris 249 untuk backup SQLite saja, lalu menghapus runtime-workdirs.tar.gz.

**Evidence:** [PRD](../../PRD.md), baris 249, mengatur snapshot binding workdir sebelum run. Baris 253–254 memisahkan codebase eksternal dari metadata attachment; baris 416 meminta snapshot DB konsisten beserta manifest immutable files. [release.py](../../infra/production/release.py), baris 32 dan 477–510, mencakup tiga volume (termasuk platform-workdir), runtime workdir, env, Compose dan dedicated SSH key. Baris 379 mewajibkan exact archive set saat recovery, termasuk runtime-workdirs.tar.gz.

**Koreksi:** inventaris state milik platform vs source eksternal, lalu pilih cakupan sesuai keputusan pemilik. Jangan hanya menghapus konstanta/arsip. Bila format berubah, tentukan identitas format, kompatibilitas backup lama yang masih direferensikan current/previous/pending, dan uji recovery. Hilangnya string path dari source bukan bukti data tetap dapat dipulihkan.

### F2 — Penyebab spesifik Job 260 masih hipotesis; preflight dan kehilangan diagnosis terbukti

**Evidence:** log job hanya mengatakan release aborted sebelum image replacement dan verified source restarted. [release.py](../../infra/production/release.py), baris 615–637, meliputi stop, pemeriksaan DB dan backup. Pemeriksaan path/capacity berada di backup setelah stop. Error asli dibungkus di baris 636 dan diringkas lagi oleh [deploy.py](../../infra/ci/deploy.py), baris 36–51. Pending journal baru ditulis pada release.py baris 647.

**Koreksi:** tulis “gagal sebelum penggantian image; hipotesis prasyarat backup/runtime; alasan asli tidak tersedia”. Perbaikan yang terbukti diperlukan adalah pemeriksaan prasyarat sebelum stop dan diagnosis tersanitasi yang mempertahankan tahap/kategori kegagalan. Jangan mencetak raw Docker/SSH stderr yang dapat memuat konfigurasi privat. Kondisi path saat ini tidak membuktikan kondisi persis saat job gagal.

### F3 — Parameter ssh_host opsional; gunakan jalur katalog sesuai konteks

**Evidence:** [App.tsx](../../src/frontend/src/App.tsx), baris 292, memuat katalog Codex controller setelah login. [api.rs](../../src/backend/src/api.rs), baris 142–150, mendukung katalog lokal jika host tidak diberikan. Profile sudah memakai /harness/settings dengan harness, agent dan runtime/host pada App.tsx baris 1666; resolusi backend ada di api.rs baris 160–191.

**Koreksi:** audit consumer fetch global yang tidak relevan untuk agen non-Codex/remote. Jangan mengarang satu activeHost global atau mewajibkan ssh_host untuk local runtime. Ketiadaan katalog controller tidak boleh merusak alur runtime lain yang valid. Error autentikasi/offline/missing binary pada runtime yang dipilih tetap harus terlihat.

### F4 — Jangan mount seluruh .codex atau mengunci produk ke Antigravity

**Evidence:** [runtime.rs](../../src/backend/src/runtime.rs), baris 266–268, menunjukkan auth.json dalam home Codex. Mount read-only tetap memberi akses baca credential. [remote.rs](../../src/backend/src/remote.rs), baris 147–155, dan [remote_bridge.py](../../src/backend/src/remote_bridge.py), baris 856–861, sudah menyediakan katalog dari host SSH. [codex_settings.rs](../../src/backend/src/codex_settings.rs), baris 52–74, juga mendukung custom catalog path. [runtimeCatalog.ts](../../src/frontend/src/runtimeCatalog.ts), baris 6 dan seterusnya, menangani capabilities registered runtime.

**Koreksi:** katalog mengikuti effective runtime/harness dengan API yang ada; pertahankan pilihan dan session tersimpan. Tidak ada kebutuhan terbukti untuk membaca seluruh credential directory host. Klaim “host hanya punya agy” perlu output discovery dengan PATH/user/transport yang benar; percobaan command tanpa output mentah tidak cukup.

### F5 — Limit memori sudah ada; limit dua service bukan anggaran seluruh host

**Evidence:** [compose.yaml](../../infra/production/compose.yaml), baris 8–10 dan 40–42: masing-masing platform/Matrix dibatasi 0,5 CPU, RAM 512 MiB, RAM+swap 1 GiB. [runner README](../../infra/gitlab-runner/README.md), baris 16–34: job 1 GiB, manager 192 MiB, satu manager personal-agentic; manager Yunesa terpisah dapat overlap.

**Koreksi:** pertahankan kontrol existing dan ukur CPU, available RAM, swap-in/out, I/O pressure, HTTP latency, OOM/restart pada workload bernama. Jumlah batas 1,6 GB tidak menjamin 400 MB headroom karena host/runtime/service lain berada di luar Compose tersebut. Swap terpakai saja bukan bukti thrashing. Target disk <70%/swap <60% harus menjadi kebijakan terukur, bukan jaminan dari pemasangan cron.

### F6 — Reclaimable tidak berarti aman dihapus; scope prune harus berdasarkan ownership

**Evidence:** notulensi menyebut disk sekitar 80 GB dengan 35 GB tersisa; draft mengubahnya menjadi kapasitas 30–40 GB. Notulensi menyebut total image 10,82 GB dan sekitar 3,4 GB tidak terpakai; ADR menganggap 10,8 GB semuanya dangling. Script OPS tasks melakukan image/volume/network/builder prune global. Production volume belum mempunyai label keep, dan label negatif bukan allowlist kepemilikan.

**Koreksi:** tandai angka notulensi sebagai snapshot yang dilaporkan sampai ada output bertanggal. Inventaris dan rencana kandidat harus mendahului deletion. Default exclude semua volume, riwayat chat, data/backup/key dan resource proyek lain. Lindungi image yang direferensikan current/previous/pending; jangan menganggap image tidak dipakai container berarti tidak diperlukan rollback. Cleanup saat build/deploy aktif harus menunda operasi yang konflik atau membuktikan kandidat tidak sedang dipakai.

Docker menjelaskan bahwa [image prune -a](https://docs.docker.com/reference/cli/docker/image/prune/) mencakup image tanpa referensi container, termasuk yang bertag; filter waktu berdasarkan creation time. [Volume prune](https://docs.docker.com/reference/cli/docker/volume/prune/) tidak membuktikan volume kosong/tidak bernilai. Pemilik sudah memilih volume tetap manual.

### F7 — Retensi Matrix adalah perubahan data; sumber Git belum membuktikan konfigurasi live

**Evidence:** [bootstrap.sh](../../infra/production/bootstrap.sh), baris 64–81, mempertahankan atau menghasilkan homeserver.yaml di volume matrix-data. [matrix.rs](../../src/backend/src/matrix.rs), baris 181–188 dan 292–311, menghubungkan pesan Matrix dengan store platform.

**Koreksi:** keluarkan auto-retention dari OPS sesuai pilihan pemilik. Jika nanti dibutuhkan, ukur pertumbuhan dan tetapkan data/room yang boleh dihapus. Retensi Synapse tidak otomatis menghapus history platform atau mengecilkan file SQLite. Startup healthy tidak membuktikan expiry bekerja. Lihat [dokumentasi Synapse](https://element-hq.github.io/synapse/latest/message_retention_policies.html).

### F8 — Process-group cleanup, timeout dan delegation guard sudah ada

**Evidence:** [remote_bridge.py](../../src/backend/src/remote_bridge.py), baris 348–368, sudah mengirim TERM/KILL ke process group; baris 433–434 memakai start_new_session; baris 501–523 menangani stop/heartbeat/timeout/finally. [spawn.rs](../../src/backend/src/process_tree/spawn.rs), baris 5 dan seterusnya, menangani Unix groups/Windows Job Objects. [runtime.rs](../../src/backend/src/runtime.rs), baris 711 dan 788–798, memakai OwnedProcessTree dan timeout per agent dengan pengecualian waktu menunggu jawaban manusia. [fleet.rs](../../src/backend/src/fleet.rs), baris 1044–1106, memakai mekanisme process ownership.

[coordination.rs](../../src/backend/src/coordination.rs), baris 406–442, hanya memproses routing Coordinator, membatasi tiga worker dan menolak self/duplicate. Child berjenis Delegate. Tiga worker berbeda dari tiga tingkat. [agent_tools.rs](../../src/backend/src/agent_tools.rs), baris 246–265, membatasi summary/review invocation serta cross-chat satu hop.

**Koreksi:** jangan menambah ulang kontrol tersebut atau mengubah depth menjadi tiga. Audit cancellation/disconnect/timeout dengan PID/PGID run milik sendiri dan side effect yang terukur. Bedakan zombie yang sudah exit dari orphan/background process hidup; daemon sengaja detach berada di luar batas PRD sekarang. action_invoke melalui actions.rs baris 176 merupakan jalur berbeda yang perlu ditelusuri bila sasaran audit adalah rantai invocation lintas fitur; source checks di coordinator tidak membuktikan semua jalur bebas siklus.

### F9 — Lock global akan mengubah paralelisme yang disengaja

**Evidence:** [runtime.rs](../../src/backend/src/runtime.rs), baris 124–142, menyerialkan session yang sama serta agent/workdir sama di queue yang sama. [PRD](../../PRD.md), baris 49, mengizinkan main/side chat paralel; [chat_commands.rs](../../src/backend/src/chat_commands.rs), baris 194 dan seterusnya, memiliki regression terkait. PRD juga meminta satu writer dan worktree yang dipilih eksplisit: kebijakan tersebut perlu dijelaskan bersama, bukan diganti dengan reject universal.

**Koreksi:** sesuai keputusan pemilik, pertahankan paralel dan pisahkan effective workdir untuk pekerjaan menulis bila diperlukan. Jangan menerapkan satu lock untuk semua run atau membangun mekanisme PID-file baru sebelum kebutuhan dan domain ownership terbukti. Klaim lock atomik/stale recovery tidak cukup hanya dengan os.kill(pid,0): permission error, PID reuse, namespace dan host berbeda perlu dibedakan.

### F10 — Kontrak dan bukti belum memenuhi format lokal

- Ketiga proposal tidak memuat baseline SHA/dirty preservation, tautan issue, file owner dan dependensi task yang memadai.
- Local link audit terhadap 15 dokumen menemukan **10 target tidak ada dari 61 link lokal**: 7 salah relative path pada proposal, 3 placeholder evidence. Dari folder change, arah ke docs/PRD adalah ../../../, bukan ../../.
- DEP verification menggunakan unittest discover default yang mencari test*.py, sedangkan suite bernama release_test.py. Gunakan command proyek yang benar: python -B infra/production/tests/release_test.py di Linux, atau discovery dengan pola *_test.py. Jangan menganggap output nol test sebagai lulus.
- Curl katalog tanpa session autentikasi tidak membuktikan HTTP200; route dilindungi security::guard di api.rs baris 136. Fixture host harus benar-benar dipilih/tersedia.
- Evidence index tidak memiliki tiga file proof yang dirujuk. Tandai Not run; jangan menyatakan inspeksi empiris lengkap tanpa output yang bisa ditelusuri.
- [docs/deployment.md](../deployment.md), baris 29–30, menyebut rolling update tanpa downtime dan auto-rollback. Helper aktual menghentikan service untuk backup; kegagalan kandidat menyimpan evidence dan memerlukan recovery/rollback eksplisit. Source restart sebelum replacement berbeda dari rollback kandidat.
- Jangan menyalin fase Planned/Accepted ke beberapa indeks. GitLab Issue memiliki fase kerja; file verification memiliki hasil inspeksi/pengujian spesifik.
- Template change sendiri masih menyebut manual production gate pada bagian publikasi; selaraskan ke automatic deploy setelah merge dan smoke sesuai CI-003. Ini koreksi dokumentasi kecil, tidak perlu issue tata kelola baru.

## Rumusan issue revisi

Bagian di bawah mengikuti lima bagian [template Feature](../../.gitlab/issue_templates/Feature.md). ID CAT-001 adalah usulan, belum dipublish. File owner implementasi/review ditetapkan ketika pekerjaan diambil, bukan diisi dengan nama orang yang belum menyatakan menerima.

### A. CI-003 follow-up: preflight backup dan diagnosis release yang dapat ditindaklanjuti

**Masalah dan hasil pengguna.** Job260 gagal sebelum penggantian image; error CI kehilangan penyebab asli. Pemeriksaan path/capacity backup terjadi setelah stop. Pengguna membutuhkan deploy otomatis yang menolak prasyarat invalid sebelum downtime, tetap menjaga data/recovery, dan memberi alasan kegagalan tersanitasi.

**Scope dan kontrak.** Lanjutkan Issue5 dan kontrak CI-003 untuk preflight/diagnosis; DEP-003 menjadi change khusus hanya bila inventory membutuhkan perubahan format/cakupan backup. Minimum files: release.py, deploy.py, suite terkait, runbook. Katalog, global scheduler, registry migration dan auto-rollback DB berada di luar scope.

Acceptance:
- REL-R1: GIVEN required state/path unavailable, redirected, unreadable or backup capacity inadequate, WHEN promote starts, THEN fail with safe category before service stop; current image/journals stay valid. Recheck under release lock at appropriate transition.
- REL-R2: GIVEN valid quiet source, WHEN backup completes, THEN all managed state, files and private config/key selected by the contract have verified archive/manifest evidence; external project source is excluded by explicit inventory, not guessed from a pathname.
- REL-R3: GIVEN any supported backup still referenced by journals, WHEN recovery validates it, THEN valid historical formats remain supported and corrupted/mismatched evidence is refused. Required if backup format changes.
- REL-R4: GIVEN backup/command failure, WHEN CI reports it, THEN a stage/category and useful safe diagnostic/reference survive; secrets/raw private command output stay out of CI. Source restart is reported only after verification.
- REL-R5: GIVEN a tested candidate with correct SHA/digest, WHEN main deploy succeeds, THEN installed-helper identity, authenticated production smoke and actual release identity are recorded. Busy work and real failures must still fail; “pipeline always green” is not a requirement.

**Fase dan penanggung jawab.** Proposed correction to open Issue5; owner product: repository owner. Inventory → contract choice → implementation by release file owner → independent review → targeted proof → normal MR/CI/deploy flow. Shared helper files have one active writer.

**Bukti dan publikasi.** F1–F2 and Job260; implementation/recovery tests Not run in this review. Use Linux helper tests, isolated real files/SQLite, injected external-command failure where justified, then a controlled real job. No new merge/deployment authorization is implied by this planning document.

**Tindakan berikutnya.** Inventory runtime/state ownership and required archive set, then prepare the smallest compatible preflight/diagnostic patch. Update Issue5's stale phase when explicitly authorized to write GitLab.

### B. CAT-001: katalog dan ketersediaan harness mengikuti effective runtime

**Masalah dan hasil pengguna.** Dashboard requests a controller Codex catalog independently of the selected harness. Profile already has a richer runtime-aware route. An unavailable unrelated Codex cache should not block a valid Antigravity/OpenCode/remote workflow.

**Scope dan kontrak.** Audit global catalog consumers and reuse /harness/settings and effective workspace resolution. Minimum likely files: App.tsx, NewAgentDialog.tsx, runtimeCatalog.ts; backend settings adapters only for demonstrated gaps. Preserve saved profiles/session mappings, auth and supported transports. Exclude whole .codex mount, forced global Antigravity default and deployment backup changes.

Acceptance:
- CAT-R1: GIVEN authenticated owner and a supported Antigravity runtime with no controller Codex cache, WHEN dashboard/Profile loads, THEN the relevant catalog loads and unrelated cache absence creates no global failure.
- CAT-R2: GIVEN local, SSH or registered runtime selection, WHEN models are refreshed, THEN catalog/availability belongs to that runtime and selected harness; valid local mode does not require ssh_host.
- CAT-R3: GIVEN absent CLI, offline host, missing native auth or custom catalog configuration, WHEN selected context is queried, THEN success/error reflects that context without fabricated options, credential leakage or silent fallback.
- CAT-R4: GIVEN saved harness/model/session, WHEN another runtime is inspected or settings reload, THEN saved selections and session identity are not silently migrated. Anonymous access remains refused.

**Fase dan penanggung jawab.** Draft for new issue; product owner as above. Trace consumer/state flow → frontend owner and adapter owner → independent auth/context review → browser/API proof. No technical dependency on completion of all OPS/AGT work.

**Bukti dan publikasi.** F3–F4; code Inspected, reported UI symptom not reproduced in this review. Use an authenticated real app and genuine configured adapters for acceptance; report unavailable transports as Not run rather than claiming blanket parity.

**Tindakan berikutnya.** Reproduce the global catalog error with the affected runtime and trace every consumer of the global catalog state before editing.

### C. OPS-001: maintenance cache/image terarah dan baseline kapasitas host

**Masalah dan hasil pengguna.** CI, production and other services share a small host. Existing limits are useful but do not prove headroom under concurrent workload. Cleanup should reclaim only demonstrably disposable resources and preserve release/data across projects.

**Scope dan kontrak.** Inventory, safe candidate plan, narrowly owned cache/image cleanup, and an on-demand resource report using existing tooling. Retain existing compose/runner budgets unless measurements justify a change. Exclude automatic volume/network deletion, Matrix history purge, cross-project scheduler, automatic resize and generic monitoring platform.

Acceptance:
- OPS-R1: GIVEN inventory with owner/last-use evidence and retained release references, WHEN a cleanup plan is generated, THEN it names exact disposable candidates and excludes volumes, backup/config/key, current/previous/pending images and unrelated-project resources.
- OPS-R2: GIVEN an active build/deploy or changed references, WHEN cleanup would conflict, THEN postpone affected cleanup or refuse safely; never prune the entire shared daemon as a shortcut.
- OPS-R3: GIVEN approved scoped candidates, WHEN cleanup executes, THEN report actual reclaimed bytes and verify service/data/release references remain usable; an empty candidate set is valid success, not a reason to broaden deletion.
- OPS-R4: GIVEN a named representative workload and observation window, WHEN capacity is measured, THEN record available RAM, swap-in/out or pressure, CPU/I/O, disk/inodes, production HTTP latency/errors and OOM/restarts. Capacity conclusions apply to the measured envelope; thresholds and next action are explicit.

**Fase dan penanggung jawab.** Draft; host-maintenance owner and reviewer to be assigned. Read-only inventory → candidate/protection contract → dry-run → isolated deletion proof → scoped live installation/operation under the accepted boundary. Align shared files with the release owner.

**Bukti dan publikasi.** F5–F7; source budgets Inspected and notes' host numbers historical/reported. No cleanup or production capacity test ran in this review. An exit-zero cron and one idle docker stats snapshot are insufficient acceptance.

**Tindakan berikutnya.** Capture timestamped host/container/volume/image/build-cache inventory and ownership map; propose candidates without deleting them.

### D. AGT-001: audit dan regresi ownership proses, antrean dan invocation

**Masalah dan hasil pengguna.** The notes claim absent safety controls, while code already has queue guards, process ownership, timeout and bounded routing. Verify real failure paths before adding competing mechanisms.

**Scope dan kontrak.** Audit the transports actually used; reproduce stop, timeout, disconnect, parent exit and wait-for-owner behavior in isolated runs. Preserve parallel main/side execution and selected workdir/session identity. Track writing isolation via explicitly chosen distinct worktrees where needed. Exclude a new universal writer lock, recursive delegation depth3, AGENTS.md as runtime timeout configuration, and automatic worktree management.

Acceptance:
- AGT-A1: Map supported local/SSH/registered-worker paths, OS ownership boundary and relevant existing tests, marking Inspected vs Passed vs Not run.
- AGT-A2: Follow owned PID/PGID or Job Object and run state through cancellation/timeout/disconnect; another unrelated run survives. Deliberately detached daemons are an explicit existing limitation, not mislabeled as covered.
- AGT-A3: Coordinator, delegate, summary/review and cross-chat keep their intended routing limits. Audit action_invoke lineage/cycle exposure separately; do not infer a universal chain bound from coordinator checks alone.
- AGT-A4: Main/side and distinct workdirs retain intended parallelism; same session/queue conflicts retain existing behavior. Demonstrate any writer collision in isolated repositories before proposing a product change.
- Any implementation task must name a reproducible gap, affected entrypoint and regression. If no gap is reproduced, close the audit with limits rather than inventing new code.

**Fase dan penanggung jawab.** Optional investigation backlog, not a release gate. Runtime reviewer/verifier first; implementer only after an actionable defect exists.

**Bukti dan publikasi.** F8–F9, source Inspected; runtime process tests Not run here. Fixtures may replace paid CLI/provider interaction while retaining actual process launch/termination; explain the boundary and never mock the process mechanism under test.

**Tindakan berikutnya.** Select the used transport/OS matrix and run bounded real process lifecycle scenarios in isolated paths.

## Hubungan dengan OpenSpec dan standar repository

OpenSpec menyarankan satu unit kerja logis per change; hasil yang dapat diselesaikan/dirilis mandiri layak dipisahkan. Scope refinement karena temuan kode dapat memperbarui change existing. Ini mendukung pemisahan katalog dari release, sekaligus melanjutkan CI-003 untuk defect acceptance yang sama. [OpenSpec Workflows](https://github.com/Fission-AI/OpenSpec/blob/main/docs/workflows.md)

OpenSpec membedakan proposal (alasan/scope), requirement/scenario (perilaku), design (pilihan implementasi) dan tasks (langkah). Gunakan tingkat detail paling ringan yang tetap dapat diverifikasi. [OpenSpec Concepts](https://github.com/Fission-AI/OpenSpec/blob/main/docs/concepts.md)

Repo ini secara eksplisit memilih Markdown yang selaras OpenSpec tanpa mewajibkan CLI, pada [openspec README](../../openspec/README.md), [development](../development.md), dan [Issue #2](https://gitlab.tugasakhir.space/rizkyyanuark/personal-agentic/-/work_items/2). Tidak perlu memasang CLI atau membuat capability spec seolah sudah verified. Jika kelak memilih default schema CLI resmi, sesuaikan proposal/spec deltas/design/tasks dengan schema; jangan mengklaim paket tiga Markdown sekarang sudah lulus validasi schema resmi.

Sebelum mempublikasikan:
1. Ganti baseline hipotetis menjadi fakta, inference atau Not run yang eksplisit.
2. Terapkan empat keputusan pemilik; jangan menganggap seluruh ADR lama diterima.
3. Isi identity/issue/owner/dependency dan minimum files; perbaiki relative links.
4. Gunakan requirement perilaku; pindahkan command/algoritme pilihan ke design/tasks.
5. Pisahkan validation dokumen, test kode, smoke produk, CI, merge dan production proof.
6. Index menautkan sumber; evidence tersanitasi menjadi bukti, bukan salinan fase/status.

## Bukti review

- Commands: git status --short; git log -1; rg/Get-Content untuk kontrak dan source; GitLab GET projects/5/issues; pemeriksaan link Markdown dengan Python pathlib/re.
- Baseline: main ec70e328...; draft lokal belum committed; issue baru belum dipublish.
- Local links: 15 dokumen, 61 link lokal, 10 target belum ada (7 salah arah dan 3 placeholder bukti).
- Source outcomes: kontrol existing ditemukan; koreksi dan rencana di atas berstatus Inspected/Proposed.
- Mocks: tidak ada.
- Files changed by this review: dokumen review ini saja. Draft asal, source aplikasi, issue GitLab dan server tetap merupakan baseline yang direview.
- Batas: tidak ada proof provider runtime, restore, cleanup, capacity peak atau deployment baru. Nilai operasional aktual wajib diperiksa lagi saat implementasi terkait.
