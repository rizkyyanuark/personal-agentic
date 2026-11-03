# Deployment: rilis protected main

Runbook ini menjelaskan pipeline dan batas operasi berdasarkan source repository.
Ini bukan bukti server sedang sehat atau semua pengaturan GitLab sudah sesuai.
Periksa state live ketika rilis yang diizinkan membutuhkan pemeriksaan.
Alur kontribusi ada di [development](development.md) dan
[CONTRIBUTING](../CONTRIBUTING.md).

## Persetujuan dan pipeline

Merge ke protected main memicu rilis otomatis setelah pemeriksaan sukses.
Persetujuan merge sekaligus mengizinkan rangkaian tersebut; CI saat ini tidak
memiliki gate deploy manual. Jika pemilik melarang deploy, jangan merge sampai
konflik instruksi selesai. Ready, review approval dan CI hijau sendiri bukan izin
agen melakukan merge.

Sumber aturan: [CI](../.gitlab-ci.yml),
[backend build](../infra/ci/build-backend.sh),
[image publication](../infra/ci/publish-image.sh),
[image smoke](../infra/ci/smoke-image.sh),
[deploy orchestrator](../infra/ci/deploy.py) dan
[release helper](../infra/production/release.py).

| Pemicu | Jalur | Makna |
| --- | --- | --- |
| MR | frontend, backend, ssh_bridge, production_config pada stage verify | Memeriksa perubahan, tanpa publikasi image/deploy produksi |
| Protected main | verify → image_publish → image_smoke → deploy_production | Membuat image ARM64, menguji image, lalu mempromosikan digest yang diuji |
| Protected main dengan AE_WORKER_RELEASE=1 | Package Windows/Linux dan worker_publish sesuai rules/needs CI | Distribusi paket tambahan, bukan upgrade otomatis semua worker |

Pipeline MR dan main memeriksa konteks berbeda. Keduanya bukan duplikasi
deployment. Pipeline main tetap dapat gagal setelah MR hijau; pantau sesudah
merge. Perubahan dokumentasi juga mengikuti pipeline main ini; belum ada aturan
docs-only yang melewati build/deploy. Tidak semua browser acceptance lokal
otomatis berjalan di CI; gunakan
[VERIFICATION](../src/VERIFICATION.md) untuk fitur yang terdampak. Artifact CI
punya masa simpan terbatas; catat ringkasan dan identitas rilis pada issue/MR.

Image publication menghasilkan metadata dan TESTED_IMAGE berbasis digest.
Image smoke memakai image itu. Deploy memeriksa protected main, commit, digest,
hash asset dan apakah pipeline masih menunjuk HEAD main. Pipeline lama yang
main-nya sudah maju ditolak, bukan dipaksakan untuk dirilis.

Deploy diserialisasi oleh resource_group production dan memakai restricted SSH.
Jangan menggantinya dengan build source di server, mutable image tag atau shell
bebas sebagai jalan pintas. GitHub adalah mirror downstream, bukan jalur rilis.

## Sebelum merge

1. Periksa izin merge yang mencakup rilis, review selesai, pipeline MR SHA terbaru
   sukses, serta opsi squash dan hapus source branch.
2. Baca dampak MR: UI/API, migrasi/kompatibilitas data, env/config, dependency,
   worker dan pekerjaan aktif.
3. Tentukan smoke fitur non-destruktif. Task agen, indexing/upload, panggilan
   provider berbayar dan uji yang mengubah state produksi memerlukan izin khusus.
4. Tentukan pilihan pemulihan yang sesuai: revert via MR, rollback image
   kompatibel, atau restore data dengan persetujuan khusus. Periksa kompatibilitas
   sebelum menjanjikan rollback.

Dev/test dan produksi harus memakai state, volume dan credential terpisah.
Jangan menyalin DB produksi sebagai fixture atau memublikasikan key, cookie,
token, log privat dan backup sebagai bukti MR.

## Apa yang dilakukan release helper

Helper memeriksa journal, operasi aktif, volume backup, disk dan runtime key.
Run/terminal/indexing aktif dapat menolak rilis sebelum shutdown. Deploy tidak
membatalkan task tersebut dan tidak menggunakan deployment drain. State diperiksa
lagi selama persiapan dan setelah service dihentikan. Jika busy, laporkan alasan
dan retry setelah aman; jangan mengubah status run atau menghentikan task
pengguna agar deploy lulus.

Helper menarik image tertentu, memeriksa identitas, membuat backup state pada
volume yang diperiksa, lalu mengaktifkan candidate tanpa build ulang.
Readiness, identitas image/commit dan authenticated smoke diperiksa sebelum
journal difinalisasi. Ini tidak menjamin migrasi selalu reversibel; image berbeda
dari database, artifact dan session state.

## Bukti sesudah merge

Agen memantau main sampai terminal dan membaca artifact production-release.json
serta production-health.json bila tersedia. Catat commit, digest, pipeline/job/
deployment, timestamp dan hasil pemeriksaan. Health HTTP 200 saja bukan bukti
versi yang benar terpasang.

Orchestrator memeriksa identitas commit/digest dan baseline smoke: health 200,
anonymous state 401, invalid login 401, owner login 200, authenticated state 200,
UI/cockpit 200 dan logout revocation 401. Itu bukan bukti seluruh fitur bekerja.
Lengkapi smoke fitur pada jalur nyata sesuai scope/izin; periksa data lama tanpa
mengubahnya. Gunakan autentikasi aman; jangan menaruh credential di URL/chat atau
artifact publik.

Jika pipeline hijau tetapi identitas/fitur belum terbukti, laporkan "deployed,
feature verification pending". Catat error dan batas akses. Sesudah diterima,
ringkas bukti rilis dan finalisasi kontrak lokal sesuai [development](development.md).

## Jika rilis gagal

| Kegagalan | Tindakan berikutnya |
| --- | --- |
| Verify/publish/image smoke gagal | Jangan paksa deploy. Audit dan perbaiki lewat branch/MR yang diizinkan. |
| Busy atau backup/disk/key/preflight gagal | Baca diagnosis yang disanitasi; periksa kondisi sebelum retry. Jangan melewati guard atau menghapus state. |
| Main sudah maju | Verifikasi pipeline terbaru, jangan retry pipeline lama untuk menimpa rilis baru. |
| Gagal sebelum penggantian image | Helper dapat memulihkan source yang sama; cek journal/readiness, jangan menganggap source pasti hidup kembali. |
| Candidate gagal atau journal pending | Simpan diagnosis/backup; jangan promote berulang. Tidak ada restore database atau rollback image otomatis. |

Diagnosis boleh dilanjutkan sesuai izin rilis. Rollback image, restore database,
perubahan server dan tindakan destruktif membutuhkan otorisasi yang sesuai;
izin merge bukan izin umum seluruh pemulihan.
Koreksi source pasca-merge harus melalui branch/MR baru dengan izin yang sesuai,
bukan direct push ke main atau membuka kembali kewenangan MR yang sudah merged.

### Pilihan pemulihan

- **Revert source via MR:** setelah review/izin merge, pipeline membuat rilis baru.
  Ini tidak membalik data yang ditulis atau migrasi otomatis.
- **Rollback image:** helper menyediakan aksi ke previous release yang verified,
  dengan pemeriksaan operasi aktif, schema dan pengakuan risiko database.
  Restricted CI deploy mengirim promote, bukan memberi akses rollback otomatis.
  Maintainer harus memastikan akses yang diizinkan, target digest dan
  kompatibilitas sebelum tindakan dijalankan.
- **Recover journal:** memverifikasi candidate yang sudah berjalan dan
  menyelesaikan pending journal. Bukan rollback, restart service atau DB restore.
- **Restore state:** hanya jika diperlukan dan disetujui. Verifikasi backup,
  identitas rilis, data yang akan hilang dan konsistensi seluruh volume. Hentikan
  penulisan secara terkontrol; satu DB tidak otomatis mewakili artifact/session.

Jangan menjalankan perintah pemulihan dari snapshot chat lama. Periksa source,
journal private, state dan akses live dahulu. Catat hasil; rilis gagal tidak
dilaporkan sebagai sukses.

## Perubahan worker

Deploy controller tidak memperbarui binary worker terpasang. Jika binary/protokol
worker berubah, masukkan versi kompatibel, paket OS/arsitektur, publikasi,
upgrade worker yang dituju dan rollback worker ke scope. Sesudah upgrade, cek
identitas versi dan Online; uji eksekusi hanya jika diizinkan. Online saja tidak
membuktikan semua perilaku worker. Jangan mengaktifkan AE_WORKER_RELEASE atau
mengubah target worker sebagai efek samping rilis controller.
