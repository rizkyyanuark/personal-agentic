# CI-003: managed-state backup dan release preflight

Pemeriksa: Codex, 14 Oktober 2026, Asia/Jakarta. Issue [5](https://gitlab.tugasakhir.space/rizkyyanuark/personal-agentic/-/work_items/5).
Checkout `C:/Users/rizky/.codex/worktrees/cea5/personal-agentic`, branch
`codex/release-preflight-recovery`, base `ec70e3287682fdc3c6a86df03054a38fe6e92817`.
Identitas patch sebelum commit:

| File | SHA-256 |
| --- | --- |
| release.py | 5854e16893487a764917ba8e47a807be03170027623024b80e056f08267ba96e |
| deploy.py | 9cd78f9f1b14c2f11f78495ed89a7190a5d6b18241d77b927b2c2762872d090f |
| release_test.py | 6ab8e30011ac4e8df36ae36a4b49e1c5bf99fd5dabd266fcd4c2c9c263a4a951 |
| deploy_test.py | 62d48d93cac5df35d327a32ef4c759b42f740ba839d09034626e71c4cfc6c78f |
| docker_backup_smoke.py | df5005ca3578794a85361e6a92cf38ae98fcc35a3db417f0467605d4aa2493be |

## Inventaris actual produksi

Read-only Docker inspect/diff dan SQLite query: platform mount `/data`, `/workdir`
dan runtime key read-only; Matrix mount `/data`. Volume platform-data mempunyai
21 file/5.89 MB, matrix-data 6 file/6.44 MB, workdir internal kosong pada snapshot.
Database workspace/identity serta Matrix teridentifikasi. Legacy host runtime
folder kosong; profile proyek SSH merupakan source eksternal sesuai ADR 0001.

Docker diff menemukan controller `.codex/config.toml` dan `models_cache.json`
di writable home. Ini membatalkan asumsi tiga volume mencakup semua managed
config. Format baru menambah home archive tanpa mounting direktori credentials
host. Runtime key actual berizin 0400 UID 10001; pemilihan source mengikuti
resolved Compose config, termasuk dotenv yang diberi quote.

Produksi tetap image digest
`sha256:84cae56460603822e5eee645c634fcc64f7c125ca108b6259f5f800aa2c4cf9e`,
SHA ec70e328, dua service running, OOM false, restart nol pada inventaris.
Provider authentication workstation eksternal dan source proyeknya tidak
dimasukkan sebagai state controller. Tidak ada arsip lama yang dihapus.

## Hasil pada source di atas

| Skenario | Hasil dan batas |
| --- | --- |
| Linux helper suite | Passed, 43 tests/15.571s pada final Compose-selector revision |
| Linux deploy-client suite | Passed, 11 tests/1.925s |
| Invalid key menolak main sebelum pull/stop | Passed; stdin, private files dan SQLite nyata; destructive Docker boundary diganti |
| Recovery existing tanpa disk/key untuk backup baru | Passed; real archives/hash/schema/journal; external Docker dan authenticated HTTP diganti |
| Legacy format | Passed, exact tiga volume + runtime legacy; corruption ditolak |
| Format 2 | Passed, exact tiga volume + controller home, private-file hashes; unknown format/extra archives/config corruption ditolak |
| Dual failure | Passed reviewer orchestration probe: docker-run/17 dan compose-up/23 tersimpan privat; public secret false |
| Guard context | Passed, stage dan diagnostic reference bertahan tanpa menginterpolasi raw error |
| Actual Docker stopped backup | Passed, health/state 200 pada aplikasi image ARM64 nyata; empat archives verified; home config dan internal workdir sentinel ditemukan; mode0600; schema app SQLite unchanged |
| Actual quoted selected key | Passed melalui Docker Compose config pada isolated fixture |
| Cleanup Docker fixture | Passed, exact created container/three volumes dihapus; pre-existing container/volume IDs unchanged |

Perintah Linux:

```sh
python3 -B infra/production/tests/release_test.py
python3 -B infra/ci/tests/deploy_test.py
sudo python3 -B infra/production/tests/docker_backup_smoke.py --allow-isolated-docker --image <already-present immutable ARM64 digest>
```

Environment suite: WSL Ubuntu 24.04, root, Python 3.12; Docker proof: actual Linux
ARM64 host Docker 29.7.2, capped candidate 0.25 CPU/256 MiB RAM/512 MiB combined
RAM+swap, actual platform image, disposable named volumes and private root.
Tidak ada build, pull, provider turn, produksi shutdown, atau penghapusan
production volume. Matrix backup fixture adalah SQLite nyata plus media sentinel;
proof ini tidak mengklaim menjalankan Synapse end-to-end.

Percobaan Docker pertama gagal menemukan home config karena fixture memakai
tmpfs home yang hilang saat stop. Fixture dikoreksi menjadi writable home seperti
Compose produksi; source helper tidak diubah untuk melemahkan pemeriksaan.
Percobaan awal dan akhir sama-sama membersihkan fixture serta mempertahankan
existing IDs. Readiness drip test sebelumnya memakai 0.2s budget sementara body
fixture selesai ~0.16s; delay fixture menjadi0.03s per byte agar benar-benar
melampaui deadline, bukan mengubah ekspektasi kegagalan menjadi sukses.

## Batas penerimaan

Home archive menyediakan salinan untuk restore administrator; helper tidak
melakukan automatic home/database restore. Home saat ini belum menjadi volume
persistent. Kapasitas memakai logical source size +512 MiB; state dapat bertambah
setelah pengukuran dan error backup tetap harus ditangani. Main/drain race serta
jeda stop/backup/restart tetap merupakan keputusan CI-003.

## Installed-source proof — 14 Oktober 2026

Source yang diuji pada commit `d31ed47` dipasang atomik di bawah release lock:
root:root0755, SHA-256 5854e16893487a764917ba8e47a807be03170027623024b80e056f08267ba96e.
Source lama 8b4d9b... disimpan root-private sebelum penggantian. Actual installed
status menghasilkan health200, anonymous401, invalid-login401, owner-login200,
state200, cockpit200, UI200 dan logout-revocation401; SVG hash tetap sama.
Active operations0, pending null, current SHA ec70e328. Container IDs/start times,
restart counts dan current/previous/pending journal bytes tetap sama.

Actual installed CLI `recover` dengan digest/SHA/SVG current mengembalikan
`unchanged: true`; auth/state/cockpit/UI smoke tetap Passed. Tidak ada promotion
atau automatic restore dalam jalur ini.

Validator exact installed text menerima keempat arsip backup produksi legacy
yang direferensikan current record. Selected Compose key serta kapasitas backup
actual Passed. Tidak ada arsip produksi yang dibuat/dihapus, image yang diganti,
DB restore atau restart service dalam pemasangan ini.

Main image source follow-up masih memerlukan MR/main CI terpisah. Installed
helper adalah hasil operasional yang terbukti, bukan proof bahwa frontend baru
telah deployed.

## Final bootstrap alignment — 14 Oktober 2026

Review menemukan perbedaan nyata dengan bootstrap: selector helper hanya menerima
key langsung di `runtime-ssh`, sementara bootstrap mengizinkan subfolder; preflight
juga belum mewajibkan UID10001 dan mode0400/0600. Helper kini menerima descendant
canonical tanpa symlink/redirect serta memeriksa owner/mode yang sama dengan bootstrap.
Linux helper final lulus **46 tests/12.008s**. Regresi filesystem dan entrypoint
menolak owner root, mode000 dan mode lain yang tidak didukung sebelum pull/stop
atau penggantian journal. Client tetap source yang sudah lulus 11 tes.

| Final file | SHA-256 |
| --- | --- |
| release.py | d80be0d44bd75537ecf6d713308260d061f61f369db3468099d7a71b718b230b |
| release_test.py | e921a95ef06d3d279a4ba20600706b44c657da4b734771402b715a7b3724c1df |
| docker_backup_smoke.py | 77e4a3bb1d320ce636ed2e9c0d657271bb1981ee75c267e86e670d3109b2d161 |

Actual Docker smoke diulang pada hash ini: health/state200, empat archive verified,
home config/internal workdir ditemukan, quoted nested selected key cocok dengan
salinan backup, UID10001/mode0400 dan archive0600. Actual application SQLite schema
tetap sama; fixture container/tiga volume dibersihkan, existing IDs unchanged.
Tidak ada build/pull/provider turn atau shutdown produksi.

Exact helper final dipasang atomik root:root0755 setelah backup source5854e168 ke
`/opt/personal-agentic/helper-backups/personal-agentic-release-20261014T074216Z-5854e1689348`.
Actual installed status: health/UI/authenticated state/cockpit200, anonymous,
invalid login dan revoked logout401; active0/pending null. Empat archive produksi
legacy serta actual selected-key/capacity lolos. Container IDs/start times,
restart counts dan journal bytes tetap sama. Hasil43-test/hash5854 di atas
adalah bukti revisi terdahulu; hash final ini merupakan sumber MR.
