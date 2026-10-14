# Review lanjutan kontrak dan revisi source — 14 Oktober 2026

Hasil review: **Changes Requested** untuk follow-up release dan kelengkapan kontrak. Pembagian pekerjaan terbaru sudah lebih sesuai; bukti implementasi dan beberapa acceptance masih perlu dikoreksi.

## Identitas dan batas bukti

- Checkout: C:/Users/rizky/Documents/GitHub/personal-agentic, branch main.
- SHA dasar: ec70e3287682fdc3c6a86df03054a38fe6e92817.
- Source release/client/tests serta sejumlah dokumentasi memiliki perubahan belum committed. Lima dokumen lama staged deleted. Review mempertahankan semua perubahan tersebut.
- Identitas source yang diuji:
  - infra/production/release.py: SHA256 1d9a49deefdb125657a95a050ba44812d5ed91376427b3e0b3d3d5eef6dae722
  - infra/ci/deploy.py: SHA256 0a3a498de8138b80483021e39f8a6dff08a4b30a80e984ed5d51ffc22ade0e51
  - infra/production/tests/release_test.py: SHA256 9d3ba74ab33c5fdb7c5c7fe3433a05f9d5b1e5b279604c1759c72dfc3cc989fa
- Source/kontrak: Inspected. Kompatibilitas legacy: regresi direproduksi dengan file, arsip gzip, hash dan SQLite terisolasi di WSL Ubuntu-24.04 sebagai root.
- Tidak menjalankan deploy/retry, cleanup, restore production, provider run atau update issue GitLab. Suite 38/10 test dalam laporan kolega tidak dijalankan ulang dalam review ini.
- Keputusan produk yang berlaku tetap empat pilihan pemilik dalam [review 13 Oktober](ev-004-architecture-proposal-review.md): multi-harness, paralel dengan worktree terpisah bila perlu, cleanup aman hanya cache/image, dan seluruh state platform dicadangkan dengan source eksternal terpisah.

## Pembagian issue yang disarankan

| Pekerjaan | Tracking | Batas deliverable |
| --- | --- | --- |
| Preflight dan diagnosis release | Lanjutkan CI-003 / [Issue #5](https://gitlab.tugasakhir.space/rizkyyanuark/personal-agentic/-/work_items/5) | Koreksi acceptance release yang belum tuntas; perubahan format backup harus memiliki delta kompatibilitas eksplisit |
| Katalog sesuai runtime/harness | CAT-001 | Discovery dan error isolation pada konteks yang tepat; saved identity dan auth tetap |
| Maintenance host aman | OPS-001 | Inventory → kandidat terarah → dry-run → proof cleanup dan kapasitas workload |
| Keselamatan eksekusi agen | AGT-001 sebagai backlog audit | Uji kontrol existing; implementasi baru hanya untuk defect yang direproduksi |

Ini tiga pekerjaan implementasi plus satu audit, bukan empat fitur besar yang wajib berurutan. CAT/OPS/AGT tidak perlu menunggu seluruh paket sebelumnya. Penulis file yang bersinggungan tetap diurutkan.

OpenSpec menyarankan satu unit kerja logis per change dan memperbolehkan memperbarui change existing ketika intent sama tetapi bukti memperbaiki scope. [OpenSpec Workflows](https://github.com/Fission-AI/OpenSpec/blob/main/docs/workflows.md). Repo memakai Markdown proporsional tanpa kewajiban CLI; tidak perlu menambah toolkit hanya untuk review ini.

## Temuan dan koreksi wajib

### R1 — P1: backup lama yang valid ditolak revisi recovery

[release.py](../../infra/production/release.py), baris 395, sekarang meminta tepat tiga archive. Backup format sebelumnya memiliki empat archive, termasuk runtime-workdirs.tar.gz. [release_test.py](../../infra/production/tests/release_test.py), baris 250 dan seterusnya, mengganti fixture empat menjadi tiga; coverage format lama hilang.

**Proof contract nyata:** fixture empat arsip yang sama dengan manifest/hash/schema valid diterima oleh helper pada HEAD, tetapi ditolak oleh source revisi. Output dicatat di bawah.

**Koreksi:** terima exact supported historical set secara eksplisit, verifikasi semua hash termasuk arsip runtime legacy, dan uji legacy/new serta unsupported/tampered sets. Jangan mengganti pemeriksaan exact set dengan menerima tambahan archive sembarang. Tentukan perubahan format/metadata jika memang diperlukan; jangan menghapus backup/journal lama sebagai cara membuat recovery lulus.

### R2 — P1: preflight membuat recovery membutuhkan kapasitas backup baru

[release.py](../../infra/production/release.py), baris 591–593, menjalankan preflight sebelum action recover. Pemeriksaan tersebut meminta free space sebesar semua volume ditambah 512 MiB. Recover memakai backup existing dan tidak membuat backup baru.

**Koreksi:** bedakan prerequisites per action. Promote/rollback yang membuat backup memerlukan capacity check; recover memerlukan backup/journal/image yang valid, ketenangan state dan ruang untuk operasi journal yang benar-benar dilakukan. Jangan menerapkan kebutuhan kapasitas satu backup baru pada operasi recovery yang tidak membuatnya.

### R3 — P1: cakupan runtime dihapus sebelum inventaris terbukti

[CI-003 tasks](../../openspec/changes/CI-003-simple-automatic-releases/tasks.md), baris 19–23, menyebut path dummy dan menggunakan grep nol hasil sebagai bukti inventaris. [ADR 0001](../decisions/0001-personal-agentic-architecture-contract.md), baris 20 dan 36, justru meminta inventaris serta kompatibilitas sebelum mengubah backup.

**Koreksi:** tandai inventaris Not run sampai ada mapping state/path/owner dan kebutuhan restore. Pastikan metadata attachment, native session/file state, volume internal, config/key yang dibutuhkan tetap tercakup. Mengecualikan source proyek eksternal sesuai pilihan pemilik tidak otomatis membuktikan seluruh isi path lama boleh diabaikan.

### R4 — P2: Completed/Passed/Approved melampaui proof

[CI-003 verification](../../openspec/changes/CI-003-simple-automatic-releases/verification.md), baris 19, menyatakan stop tidak dipanggil saat preflight gagal. Test baru hanya memanggil fungsi preflight secara langsung, tanpa menjalankan main atau mencatat urutan boundary Compose.

[Laporan awal yang sebelumnya bernama docs/report.md](ev-010-ci-003-initial-preflight-report.md) menggunakan SHA HEAD sebagai identitas patch yang diuji, menyatakan tidak ada bug dan Approved, sementara patch masih dirty dan legacy recovery kini gagal dalam reproduction.

**Koreksi:** bedakan suite pass dari penerimaan release. Catat base SHA plus diff/source hashes. Proof no-stop harus menjalankan real orchestration dengan boundary destructive Docker diganti secara terbatas dan dijustifikasi, atau melalui host uji terisolasi; jangan mock fungsi orchestration yang diuji. Catat legacy recovery failure dan operasi produk yang belum dilakukan sebagai Failed/Not run. Hasil unit suite tetap dapat dicatat sebagai hasil suite, tanpa menjadikannya approval menyeluruh.

### R5 — P2: runbook masih memuat perilaku yang tidak ada

[deployment.md](../deployment.md), baris 29–30, menjanjikan rolling update tanpa downtime dan rollback kandidat; source menghentikan platform/Matrix untuk backup dan memakai recovery/rollback eksplisit. Baris 85 menyebut backup database saja walaupun helper mengarsipkan tiga volume beserta config/key. Baris 86 mengklaim mount seluruh .codex host, yang tidak terdapat di [compose.yaml](../../infra/production/compose.yaml) dan ditolak ADR/pemilik.

**Koreksi:** jelaskan single-instance stop/backup/restart gap, source restart sebelum replacement vs recovery setelah candidate failure, backup seluruh state terkelola, serta katalog melalui adapter runtime. Konsolidasi runbook boleh dilakukan, tetapi perilaku dan bukti historis yang relevan harus tetap dapat ditelusuri.

### R6 — P2: diagnosis baru masih terlalu umum

[deploy.py](../../infra/ci/deploy.py), baris 43, menyatukan missing key, invalid volume dan insufficient disk sebagai satu pesan. Error command backup pasca-stop tetap kehilangan operasi/diagnosis; private journal untuk fase tersebut belum ada.

**Koreksi:** kategori aman yang berbeda, tahap kegagalan dan diagnostic reference yang berguna. Pertahankan batas redaksi; raw SSH/Docker config output tidak masuk CI. Kategori/reference tidak perlu menjadi subsystem logging baru.

### R7 — P1: OPS masih memilih prune global sebelum inventory

[OPS tasks](../../openspec/changes/OPS-001-host-hygiene-and-resource-governance/tasks.md), baris 18–19, menjalankan builder/image prune seluruh daemon. Belum ada kandidat/owner allowlist, perlindungan image current/previous/pending, atau check konflik build/deploy. Image tanpa tag atau tanpa referensi container bisa masih diperlukan sebagai release sebelumnya.

Cache CI juga tersebar: /cache/cargo dan target pada .gitlab-ci.yml, rootless BuildKit job, serta registry cache pada publish-image.sh. Host builder prune belum dibuktikan menargetkan store yang relevan.

**Koreksi:** inventaris store/owner dulu; rencana harus menyebut resource terpilih dan release yang dilindungi. Set kosong adalah hasil valid. Tunda cleanup yang konflik dengan operasi aktif; volume/chat tetap manual. Acceptance mencakup data/service/release identities sebelum/sesudah, reclaimed bytes dan workload kapasitas bernama dengan HTTP, swap-in/out, I/O, inodes serta OOM/restarts; exit zero atau docker volume ls saja tidak cukup.

### R8 — P2: CAT perlu membedakan consumer existing dan memperluas acceptance

[CAT proposal](../../openspec/changes/CAT-001-runtime-model-catalog/proposal.md) dan tasks menunjuk components/NewAgentDialog.tsx yang tidak ada. Path nyata adalah [NewAgentDialog.tsx](../../src/frontend/src/NewAgentDialog.tsx).

Global catalog pada [App.tsx](../../src/frontend/src/App.tsx), baris 292, hanya menjadi fallback MessageModelBadge (baris 883). Profile sudah memakai /harness/settings (baris 1666). Nama model reply tersimpan di run dan diprioritaskan oleh [ChatActivity.tsx](../../src/frontend/src/ChatActivity.tsx), baris 39–45. Satu katalog runtime aktif global tidak cocok untuk history berbagai runtime.

**Koreksi:**
- Pertahankan recorded model identity/fallback ID; isolasikan error katalog controller yang tidak relevan.
- Creation registered worker sudah memakai capabilities; identifikasi gap creation local/SSH secara terpisah dan reuse Profile existing.
- Tambahkan auth/authorization, local tanpa ssh_host, selected-context failure, missing cache/config/CLI, registered offline/revoked, project override, saved unavailable model, stale response dan session preservation.
- Jangan menghilangkan semua error banner: error konteks yang benar tetap harus tampil.
- npm run check tersedia dari src, bukan src/frontend; tulis cwd dengan benar. Requirement credential isolation harus memiliki task/proof yang sesuai tanpa melarang native credential reuse berotorisasi secara keliru.

### R9 — P2: AGT proof belum mengikuti ownership proses

[AGT tasks](../../openspec/changes/AGT-001-subagent-concurrency-and-process-guard/tasks.md), baris 21–22, memakai grep agy/global zombie count. Ini bisa melewatkan child bernama python/sleep/git dan mengenai run lain.

**Koreksi:** lacak run ID + PID/PGID/Job Object, descendants, waktu dan durable status; buktikan unrelated run tetap hidup. Bedakan zombie exited dari orphan hidup dan daemon sengaja detach. Uji stop, timeout, heartbeat EOF/stall, parent exit, waiting-for-owner, main/side parallel, summary/review/cross-chat serta action invocation sesuai transport yang digunakan. Watchdog heartbeat SSH sekitar 15 detik; jangan menjanjikan semua disconnect selesai dalam 10 detik.

AGT tetap audit backlog. Kebijakan depth3/universal writer lock tidak dibutuhkan. Worktree isolation untuk menulis dipilih eksplisit; kontrol antrean per queue tidak membuktikan isolation antarqueue.

## Koreksi acceptance sebelum implementasi/approval berikutnya

- CI-003: legacy exact format accepted; invalid formats refused; recover tidak mensyaratkan kapasitas backup baru; missing prerequisites menolak sebelum stop; full-state inventory tercatat; safe error categories/reference; actual installed-source/production proof terpisah.
- CAT-001: consumer trace yang tepat; corrected paths/cwd; failure/auth/persistence and mixed-history scenarios; proof setiap requirement.
- OPS-001: inventory → candidate/protection plan → dry-run → isolated proof → scoped operation; workload capacity baseline dan data/rollback protection.
- AGT-001: scoped transport/OS lifecycle matrix; ownership-specific proof; bug harus direproduksi sebelum implementation task.
- Semua paket: checkout/SHA+dirty identity, owner/file owner, predecessor, issue link bila sudah dibuat, minimum file set dan publication boundary. Status fase berada di issue; setiap verification entry punya hasil dan batas bukti sendiri.

## Reproduction yang dijalankan

Command Linux lokal:

    wsl -d Ubuntu-24.04 -u root -- python3 -B /mnt/c/Users/rizky/.codex/worktrees/cea5/personal-agentic/org/.state/reviews/20261014/legacy_recovery_probe.py

Helper baseline diambil lewat git show HEAD:infra/production/release.py. Probe menggunakan fixture release yang ada, menambahkan runtime-workdirs.tar.gz berizin 0600, memasukkan SHA256 ke manifest privat, lalu memanggil validator baseline dan revisi terhadap fixture yang sama. Seluruh temporary files dibersihkan. Source probe berada pada ignored org/.state review workspace, bukan source aplikasi.

Output setelah fixture memenuhi permission contract:

    {"baseline_legacy_validation": "accepted", "archives": 4}
    {"current_legacy_validation": "rejected", "error": "Recovery backup manifest does not match the transaction", "regression_reproduced": true}
    {"source_sha256": "1d9a49deefdb125657a95a050ba44812d5ed91376427b3e0b3d3d5eef6dae722", "mocks": 0, "production_contacted": false, "dependencies": ["real private files", "real tar.gz archives", "SHA256", "SQLite fixture"], "result": "contract regression reproduced"}

Result: **Failed** untuk kompatibilitas revisi dengan format backup historis; **Passed** untuk reproduction yang membedakan baseline/revisi. Ini contract execution, bukan restore production atau pengujian provider.

Pemeriksaan dokumen: 39 dokumen/193 local links, nol missing targets. Validitas link tidak menyatakan acceptance implementasi. Docker Desktop Linux lokal tidak berjalan; reproduction memakai WSL dan tidak memerlukan Docker.

## PROOF

- User path exercised: source/kontrak release→backup validation→recovery; penelusuran katalog dan draft OPS/AGT.
- Commands run: git status/log/diff/diff --cached --stat; rg/Get-Content; Markdown link check; WSL legacy_recovery_probe.
- Key outputs: legacy accepted oleh baseline, rejected oleh revisi; source hashes di atas; 193 link lokal valid.
- Files changed by this review: dokumen review lanjutan ini dan probe/staging ignored. Source aplikasi/draft kolega dipertahankan.
- Real dependencies used: Git, WSL Ubuntu-24.04, Python stdlib, private temporary files, tar.gz, SHA256, SQLite fixture.
- Mocks used, with justification: tidak ada dalam reproduction.
- Remaining risks: inventory state production, real backup/restore, peak capacity dan release/provider outcomes belum diuji; source presence bukan blanket runtime proof.

## NEXT

Prioritaskan kompatibilitas legacy recovery dan operation-specific preflight. Lengkapi acceptance/diagnosis serta koreksi status laporan/runbook sebelum menganggap CI-003 completed atau mempromosikan helper. CAT/OPS dapat dipersiapkan independen; AGT tetap backlog audit.

