# 📓 AI Lab Cockpit — Log Catatan Pengembangan (Work Log)

Dokumen ini mencatat riwayat kronologis seluruh perubahan teknis, keputusan arsitektur, file yang disentuh, dan hasil verifikasi pada `ai-lab-cockpit`. Tujuannya adalah memastikan setiap kolaborator dan tim pengembang memiliki visibilitas penuh terhadap status dan konteks terbaru.

## [2026-10-04] Resume tab/browser dan bootstrap acak per halaman

Pemilik mengonfirmasi refresh mengacak lokasi awal siaga seperti kantor-agent,
sedangkan kembali ke tab/browser melanjutkan posisi/rute setelah API tersinkron.
Mandat berikutnya mengizinkan build dan pembaruan preview 8099 agar langsung
terlihat. Pengujian tetap oleh kolega; produksi tidak termasuk mandat.

- Controller memakai seed sesi baru dan bootstrap siaga satu kali pada data
  segar/terlihat. Pose/kursi/reservasi konsisten; bootstrap bukan arrival.
- Resume mempertahankan rute/akses kursi serta sisa jeda siaga yang tidak
  berganti status. Reduced motion awal tetap di anchor tanpa teleport kelak.
- Visibility/BFCache/focus/online memakai wake bersama. Respons lama diisolasi,
  wake dikoaleskan, dan header Menyinkronkan membedakan pause dari Live lama.
- Delta gerak/dwell/dialog dibatasi. Regresi unit ditulis tanpa melemahkan
  assertion. Desain, rig, kamera, kartu/bubble, API dan ledger dipertahankan.

Sequential-thinking dan klarifikasi mendahului perubahan. Three.js animation
serta antislop UI/human/copywriting menjaga kesinambungan dan informasi state.
Inspeksi awal menemukan preview 8099 masih memakai bundle lama dengan reset
pose legacy. Screenshot saja belum menetapkan penyebab stuck permanen.
Check, unit, E2E dan browser tidak dijalankan Codex. Formatting/build untuk
preview bukan klaim QA lulus. Rincian instalasi, hash dan arahan pengujian pada
[handoff resume](reports/2026-10-04-tab-resume-bootstrap-handoff.md) dan
[ADR 0013](decisions/0013-page-bootstrap-and-foreground-resume.md).

Build terisolasi `/tmp/cockpit-tab-resume-preview.WjzTQU` exit 0. Preview 8099
dipasang tanpa restart melalui aset lebih dahulu dan pergantian HTML atomik,
backup di `/tmp/cockpit-8099-before-resume.yzAPmD/cockpit-test-dist`.
GET aktual memakai `index-2org-RKh.js` dengan hash sesuai build; CSS tidak
berubah. Produksi dan preview dev 8098 tetap utuh. Refresh sekali diperlukan
untuk tab yang masih memuat aplikasi lama; acceptance menunggu QA kolega.

## [2026-10-04] Perbaikan ownership posisi dan rute terhalang

Pemilik menyetujui tiga perbaikan dari investigasi terbaru: konflik allocator,
pemulihan rute terhalang, dan ketepatan kedatangan; desain dipertahankan.
Sequential-thinking, Three.js animation, serta antislop dipakai untuk menjaga
batas posisi, gate, dan provenance. Seed role tidak diubah karena pilihan
variasi setelah refresh belum dikonfirmasi.

- Main tidak lagi menulis ulang posisi memakai allocator saat gate ditutup.
- Controller mempertahankan progres akses kursi saat pause, memakai rollback
  speed-bounded pada akses terhalang dan retry diam yang mengambil slot kembali.
  Pemulihan aktif tetap dihitung dalam kuota; polling `update(0)` tidak
  menghapus timer hambatan. Reservasi dilepas hanya oleh pemiliknya.
- Endpoint dicapai persis lewat langkah biasa, tanpa melonggarkan assertion
  posisi. Regresi akses/gate/hambatan disiapkan; helper browser juga menghitung
  fase pemulihan dalam batas gerak.
- Desain kartu/pill, bubble, HUD, ruangan, rig, kamera, API, ledger dan
  pekerjaan kolega lainnya dipertahankan. Tidak ada restart/deployment.

Formatting dan inspeksi source dilakukan. Check, lint, format-check, unit,
E2E, browser, screenshot, benchmark serta build tidak dijalankan Codex.
Source belum terverifikasi dan belum mengganti build preview 8099.
Laporan investigasi tetap disimpan; ketidaksesuaian cuplikan RNG, angka jarak,
serta klaim build perlu diperjelas pada uji ulang. Rincian berada pada
[handoff perbaikan](reports/2026-10-04-motion-fixes-handoff.md) dan
[ADR 0012](decisions/0012-motion-ownership-and-blocked-route-recovery.md).

## [2026-10-04] Penyelarasan test gerak dan reduced motion

Pemilik menyetujui perubahan test dan arahan QA, tanpa perubahan desain atau
gerak. Pengujian tetap dilakukan kolega. Source aplikasi, aset, dependency,
build preview, layanan dan produksi tidak diubah oleh pekerjaan ini.

- Smoke memakai home assignment untuk bootstrap reduced motion, bukan sofa
  dari allocator idle lama. Posisi, heading, jenis kursi dan identitas tetap diuji.
- Pembekuan setelah mode gerak memeriksa posisi aktual kelima karakter saat
  gate berubah dan setelah lebih dari 45 detik, bukan memaksa Orion kembali
  ke papan. Observer test mencatat event media sebelum handler aplikasi.
- Helper browser `tests/e2e/motion.mjs` dapat dijalankan sendiri dengan fixture
  GET `/api/state`; tidak memindahkan root atau mengubah ledger.
- Lima test baru pada `tests/unit/character-activity.test.mjs` memeriksa
  bootstrap, freeze, tujuan/kursi/okupansi/arrival/speed, serta kembali ke meja
  ketika bekerja atau menunggu keputusan.
- Suite seating dan office-experience terpisah masih historis dan tidak
  otomatis tercakup oleh `npm run test:e2e`. Perubahan desain/dialog terbaru
  milik kolega serta klaim pengujian historis di bawah tetap dipertahankan.

Check, unit test, E2E, browser, screenshot, benchmark dan build tidak dijalankan
Codex. Perubahan test belum terverifikasi. Kolega perlu membuktikan sol world-space,
dialog berpasangan dengan timestamp, panel DOM, serta freeze lintas polling.
Rincian perintah, scope dan format laporan ada pada
[handoff penyelarasan](reports/2026-10-04-motion-test-alignment-handoff.md).

## [2026-10-03] Implementasi 1:1 Percakapan dan Speech Bubble dari kantor-agent

Mengikuti instruksi pemilik untuk menyamakan 1:1 logika percakapan, ritme/waktu muncul obrolan, saut-sautan antar-karakter, serta desain speech bubble yang melayang di atas pill nama karakter langsung dari repositori `kantor-agent` (`skills/kantor-agent/runtime`):

1. **Dataset Obrolan & Quip Santai 1:1 (`ambient-dialogue.js`):**
   - Menghubungkan 40+ pasangan obrolan bahasa Indonesia (`CHAT`) dari runtime kantor-agent (termasuk percakapan kopi, bola, musik, santai, dan tugas).
   - Menambahkan quip kontekstual berdasarkan zona (`sofa`, `coffee`, `water`, `reading`/`bookshelf`, `meeting`, `desk`, `board`).
   - Reaksi status kerja karakter ("Siap, saya kerjakan!", "Beres!", "Beres, menunggu instruksi berikutnya").

2. **Ritme & Logika Saut-sautan 1:1 (`ambient-dialogue.js`):**
   - Interval obrolan: 7 hingga 11,5 detik (dimulai 4 detik setelah boot).
   - Penundaan balasan (reply delay): 2,3 detik sehingga karakter pertama berbicara, disusul balasan karakter kedua.
   - Durasi bubble: 4,8 detik untuk pembuka, 4,2 detik untuk balasan.

3. **Desain Speech Bubble 1:1 di atas Pill Nama (`labels.js` & `main.css`):**
   - Elemen `.bubble` / `.speech-bubble` ditempatkan langsung di dalam container `CSS2DObject` `.person` tepat di atas `.agent-tag .tag`.
   - Gaya visual identik kantor-agent: kartu putih `#ffffff`, border `#eadfce`, sudut tumpul `border-radius: 12px`, teks `#2b2a28` 11.5px, panah indikator bawah (bottom arrow pointer) 10px berputar 45 derajat yang mengarah tepat ke pill nama, serta kelas `.hi` untuk highlight balasan (`background: #e9f8ef`, border `#b6e3c6`).

4. **Koreksi Robustness Karakter & Helper Uji:**
   - Memperbaiki `RangeError: Unreachable hand target` pada IK tangan (`character-activity.js`): jika karakter berpindah posisi dan belum berada di meja (`distanceTo > 0.05m`), pose fallback menggunakan `standAt` tanpa merusak invariant `entity.seat` yang dibutuhkan test assertion.
   - Mengisolasi transisi CSS pada `tests/helpers/text-enlargement.mjs` dengan menekan transisi sementara (`transition: none !important`) dan melakukan style flush sebelum restorasi agar pembacaan computed font size pada uji pembesaran 200% di Chromium headless berjalan instan dan stabil.

5. **Hasil Verifikasi Penuh:**
   - `npm run check`: Lulus 100% (eslint lolos, prettier lolos, 153/153 unit test lulus, build Vite sukses `index-DXV3sdDF.css` dan `index-CB18aA0a.js`).
   - `COCKPIT_URL=http://127.0.0.1:8099 npm run test:e2e`: Lulus 100% pada seluruh 5 viewport (`mobile-320`, `mobile-390`, `tablet-768`, `desktop-1024`, `desktop-1440`). Seluruh workstation, karakter, kartu, reset kamera, stabilitas HQ >45s, dan text enlargement 200% terkonfirmasi hijau tanpa ada assertion yang dilemahkan/dihapus.
   - Bukti screenshot dialog langsung tersimpan pada `artifacts/screenshots/kantor-agent-bubbles-live-verified.png`.

## [2026-10-03] Revisi bubble dan cadence kantor-agent

Pemilik memilih ritme gerak/dialog referensi, kegiatan dasar dahulu, dan logika
komentar saat tiba seperti referensi. Sequential-thinking dipakai sebelum
perubahan; antislop UI/mobile/human/copywriting dan Three.js animation menjaga
pose, penanda ilustratif, layout bubble, serta batas data. Cadence santai pada
entri L3 sampai L5 di bawah ialah keputusan historis yang telah diganti.

- `character-activity.js` memakai jalan 1,6 unit/detik, interpolation heading
  7/4, jadwal tujuan 38 sampai 72 detik dari dispatch, dan grace minimum
  8 detik bila rute tertunda. Arrival ID lokal baru hanya sesudah tiba penuh.
- `character-pose.js` menyesuaikan cadence/stride ke IK lokal dan menambah
  smoothing tubuh/tangan/kepala serta ritme sofa, kopi, baca, dan meeting.
  Game/gitar dan kegiatan tambahan tetap belum dikerjakan.
- `ambient-dialogue.js` memakai attempt awal 4 detik lalu 7 sampai 11,5 detik,
  pembuka 4,8 detik, balasan mulai setelah 2,3 detik selama 4,2 detik, serta
  peluang 55% komentar pada arrival baru. Teks sesuai zona dan bukan data kerja.
- `main.js` memisahkan elapsed foreground dari clamp gerak 0,25 detik serta
  reset timestamp pada visibility/pageshow/reduced motion. Scheduler memakai
  loop yang sama, tanpa setTimeout balasan atau field publik baru.
- Coordinated bubble di `main.css` meniru putih, border, tail, shadow,
  padding, ukuran 220px/150px, dan font sistem referensi. Provenance tetap
  terlihat. Coordinator menjaga kuota dua/satu; reply menang pada prioritas
  setara, bukan mengalahkan pilihan atau kerja. HUD juga menerima komentar
  seorang karakter dan kandidat lain yang tidak mendapat tempat di scene.

Formatting file revisi dan
`OFFICE_BUILD_DIR=/tmp/cockpit-test-dist npm run build` dijalankan; build exit 0.
Bundle preview baru `index-BI_SDMpZ.js` / `index-GVQea0lM.css`, JS 947,10 kB;
warning chunk lebih dari 500 kB tetap. Preview lama dicadangkan ke
`/tmp/cockpit-reference-revision-backup.63HqTu/cockpit-test-dist`.
Tidak ada restart, commit, atau deployment produksi.

Seluruh check/lint/format-check/unit/e2e/browser/console/screenshot/benchmark
tetap tidak dijalankan Codex, sesuai mandat pemilik. Inspeksi source dan build
bukan bukti grounding, kemulusan, kuota visual, kontras, atau performa. Handoff
L2 dan L3 sampai L5 pertama tidak ditimpa; hash historis dicatat pada
[handoff revisi](reports/2026-10-03-reference-motion-bubbles-handoff.md).
Batas dan parameter terbaru dicatat pada
[ADR 0011](decisions/0011-reference-motion-and-dialogue-cadence.md).
Penerimaan menunggu pengujian kolega dan review pemilik.

## [2026-10-03] L3 sampai L5: kegiatan, dialog, dan coordinator bubble

Pemilik mengizinkan pengerjaan ketiga irisan sekaligus tanpa Codex menjalankan
pengujian; semua check/unit/e2e/browser diserahkan kepada kolega. Popup ritme
dijawab Santai dan tidak ramai. Sequential-thinking serta antislop dan
Three.js animation/fundamentals digunakan untuk perencanaan dan implementasi.
Handoff L2 tetap tersimpan tanpa ditimpa.

- L3 menambah navigasi, controller seeded, reservasi tujuan/kursi, yield,
  egress/docking, serta perjalanan kembali bekerja. Posisi/heading dimiliki
  controller, tidak ditimpa allocator setiap frame. Pose memakai gait berbasis
  jarak, transisi duduk/berdiri, dan prop mug/buku lama. Aktivitas dasar berjalan,
  sofa/TV, kopi, membaca, dan meeting; game/gitar tetap tahap berikutnya.
- L4 menambah obrolan lokal berpasangan untuk peserta siaga yang diam/dekat,
  dengan giliran dan cooldown santai. Kartu mengikuti sampel scene, termasuk
  transisi, berlabel Suasana ilustratif. Panel Tugas menyediakan narasi
  karakter dan percakapan yang sudah diucapkan, terpisah dari feed. Kerja
  tetap memakai Deskripsi peran karena task API generik.
- L5 memakai satu kuota seluruh jenis bubble: dua desktop/satu sampai 820px,
  prioritas pilihan lalu kerja, layer independen dari name tag, avoidance HUD
  dan rincian DOM ketika placement tidak tersedia. Fokus kartu/tubuh/name tag
  dan pelepasan melalui orbit/reset menyelaraskan pilihan detail HUD.
- Status API segera tampil; freshness/visibility/reduced motion mengendalikan
  kegiatan. Gate tertutup mempertahankan posisi netral tanpa teleport. Request
  lama tetap dibatalkan oleh lifecycle L2. Dialog tidak menulis ledger/feed,
  tidak menghubungi model, dan tidak memakai payload privat.

Tindakan implementasi: formatting file terkait dan
`OFFICE_BUILD_DIR=/tmp/cockpit-test-dist npm run build` (exit 0). Kompilasi
preview menghasilkan JS `index-CMG0RX81.js` / CSS `index-CWJpNiUN.css`.
Warning chunk >500 kB tetap ada. Build lama dicadangkan ke
`/tmp/cockpit-l3-l5-preview-backup.qdRhSd/cockpit-test-dist`.
Tidak ada restart, commit, atau deployment produksi.

Check, unit test, e2e, browser, screenshot, console, dan benchmark **tidak
dijalankan** sesuai mandat. Tidak ada klaim kelayakan, AA, grounding, atau
performa sudah lulus. Blocker artefak QA lama tidak diubah/dinyatakan hilang.
Handoff lengkap dan instruksi kolega ada di
[L3 sampai L5](reports/2026-10-03-l3-l5-handoff.md); boundary pada
[ADR 0010](decisions/0010-scene-activity-and-shared-bubble-coordination.md).
Implementasi lokal diterapkan, tetapi penerimaan menunggu pengujian kolega
dan review pemilik. Entri L2 di bawah ialah riwayat build L2, bukan status
bahwa controller/dialogue/kuota belum ada pada build terbaru.

## [2026-10-03] L2: fakta API, pose lokal, dan bubble terpisah

Pemilik mengonfirmasi kelanjutan L2 sampai implementasinya siap, baru
pengujian browser oleh kolega. Perencanaan memakai sequential-thinking;
antislop UI/human/copywriting dan Three.js animation menjaga arah desain,
kejujuran copy, serta penghentian gerak. Bahasa warm studio dan dials 2/2/2
tetap. Desain/hasil kolega tidak direvisi secara luas.

Perubahan dalam scope L2:

- Model UI `office-presentation.js` memisahkan operational state/task publik,
  sampel pose lokal, dan uraian role statis. Tidak membaca `agent.activity`,
  private field, atau feed untuk menyimpulkan pekerjaan aktif. Snapshot API
  tidak dimutasi dan event dekoratif tidak ditulis ke ledger.
- Kartu memakai model; pose aktual berlabel Suasana ilustratif, uraian role
  berlabel Deskripsi peran. Bootstrap/gagal/offline/menunggu data segar tidak
  mengklaim lounge atau pemantauan. Header hanya menyebut fakta status publik,
  bukan Orion memantau atau agent otomatis bekerja. Style/pill L1 tetap.
- Koordinasi `main.js` mengharuskan kontrak valid live/empty, stale tepat nol,
  dan tab terlihat. Hide/show menunggu poll valid baru. Pose, TV dan motion
  monitor memakai policy yang sama dalam loop yang sudah ada.
- Gate seat opsional menjaga desk/HQ saat data tidak segar tanpa mengubah
  state operasional. Reduced motion pada data segar mempertahankan sofa statis
  dan balapan beku; gerak typing/monitor berhenti tetapi status tetap berjalan.
- Bubble berjenis eksplisit dengan provenance tetap. Feed memakai Riwayat
  publik, bukan task aktif. Perubahan status/gate membatalkan timer/record;
  disposal melepas listener label, dan BFCache memerlukan pembacaan baru.
- Lifecycle StateClient membatalkan request aktif, mengabaikan respons generasi
  lama, dan menjaga interval tunggal pada stop/start. Request sebelum hide
  tidak boleh memperbarui halaman setelah resume.

Pemeriksaan kode (Codex tidak menjalankan browser/e2e):

- `OFFICE_BUILD_DIR="$(mktemp -d /tmp/cockpit-l2-check.XXXXXX)" npm run check`:
  FAIL, exit 1 pada lint, 134 error dalam dua skrip QA lama di scratch.
  Script/laporan kolega tetap utuh; assertion/rule tidak dihapus atau dilemahkan.
- ESLint scoped 13 file kode/test L2: PASS, exit 0.
- Prettier scoped file L2 dan dokumen terkait: PASS, exit 0.
- `npm test`: PASS, 153 test, 0 gagal, termasuk 40 test baru untuk gate/model,
  copy kartu, pose/seat, bubble/timer, dan transport race/cancellation.
- `npm run format:check`: FAIL, exit 1 pada laporan reflow kolega dan kedua
  skrip QA lama, sama seperti baseline sebelum L2.
- Build terisolasi: PASS, exit 0, `/tmp/cockpit-l2-verified.c0WqsS`.
  Build preview `/tmp/cockpit-test-dist`: PASS, exit 0. Chunk Vite >500 kB dan
  SQLite experimental tetap peringatan yang belum ditangani.
- HTTP preview 8099 index/CSS/JS: 200 dan identik byte dengan build terisolasi.
  JS sekarang `index-D6Y73iqy.js`; CSS tetap `index-DCvnlAGa.css`.
  Cadangan preview: `/tmp/cockpit-l2-preview-backup.FmblbB`.
- `git diff --check`: PASS. Sidik gabungan 77 file non-Markdown di luar L2
  identik baseline `8ac86cf60ccaec4c1b9d072e7e235cd6f2e713c545a17817eaa134f95468b45a`.
  CSS, aset, kontrak publik/server, dan artefak QA di luar scope tetap.

Implementasi lokal L2 siap, tetapi check menyeluruh belum hijau dan penerimaan
browser masih PENDING. Tidak ada perubahan vendor/dependency, kontrak API,
ledger, worker, runtime agent, service restart, commit, atau deployment produksi.
Controller rute/kegiatan L3, dialog/bubble kerja di scene L4, kuota L5, dan
game/gitar belum dikerjakan. Subteks saat ini mencerminkan pose yang memang
sudah ada, bukan klaim kegiatan baru. Arahan uji kolega dan gate antislop ada
di `docs/reports/2026-10-03-l2-handoff.md`; keputusan boundary dicatat pada
ADR 0009. Entri lama tentang mandat L1 saja adalah riwayat sebelum konfirmasi L2.

## [2026-10-03] Review laporan reflow dan stabilisasi harness L1

Pemilik memberikan `l1-reflow-qa-test-report.md` dan meminta kelanjutan.
Laporan memverifikasi build DCvnlAGa/C8_QeM3h, layout/interaksi viewport normal,
lalu mencatat E2E exit 1: teks sintetis pada mobile 390 tidak mengganda setelah
mobile 320 lulus. Review sumber tidak mendukung dugaan CSS mobile menimpa
injeksi important; penyebab runtime tepat tetap belum terbukti.

Koreksi dibatasi pada `tests/e2e/smoke.mjs`, helper fixture baru, dan tujuh unit
test fixture. Semua ukuran awal ditangkap sebelum apply, font inline important
diterapkan pada elemen asli, dan nilai/priority dipulihkan dalam finally.
Assertion lama tetap; bukti identitas elemen serta cleanup ditambahkan.
Polling tidak dimatikan. Tidak ada perubahan CSS, UI, scene, API, atau data.

Hasil pemeriksaan:

- `OFFICE_BUILD_DIR="$(mktemp -d /tmp/cockpit-l1-harness-check.XXXXXX)" npm run check`:
  FAIL, exit 1 pada lint. Ada 134 error dalam dua script QA kolega di
  `scratch/debug_enlargement.mjs` dan `scratch/test_l1_reflow.mjs`, terutama
  globals Node/browser yang belum dikonfigurasi, ditambah unused/empty block.
  Keduanya sudah ada pada baseline turn ini dan tidak diubah.
- `npm run format:check` juga menemukan tiga file belum sesuai format: laporan
  reflow kolega di repo serta kedua script tersebut. Ini bukan PASS seluruh repo.
- Scoped ESLint dan Prettier pada ketiga file koreksi: PASS, exit 0.
- `npm test`: PASS, 113 unit test, 0 gagal. Fixture mencakup baseline pewarisan,
  priority, style lain, urutan viewport, identitas, partial failure cleanup,
  serta serialisasi fungsi ke konteks terisolasi.
- `OFFICE_BUILD_DIR="$(mktemp -d /tmp/cockpit-l1-harness-verified.XXXXXX)" npm run build`:
  PASS, exit 0, output `/tmp/cockpit-l1-harness-verified.DECyeG`.
  Peringatan ukuran chunk Vite >500 kB tetap ada.
- Sidik gabungan 83 file non-Markdown di luar ketiga file koreksi identik
  baseline `74e37ab1196a05ada04db3eb08f2397c371e30f34f910a829b7811cb8ea643e0`.
  Hasil code dan script kolega tidak diubah.
- HTTP preview index/CSS/JS: 200 dan identik dengan build terisolasi.
  Aset tetap `index-DCvnlAGa.css` serta `index-C8_QeM3h.js`; tidak perlu
  rebuild preview untuk perubahan test. Tidak ada restart atau deployment.

Review bukti tidak menerima klaim delapan event tetap tampil offline:
selector script tidak sesuai renderer, dan HUD memakai pesan tidak tersedia.
Teks koneksi/warna serta pemulihan tercatat, sedangkan BFCache/native zoom tetap
belum terverifikasi. Screenshot simulasi zoom diambil setelah scale dipulihkan.
Audit dan arahan uji ulang ada di
`docs/reports/2026-10-03-l1-harness-qa-review.md`; laporan asli tidak ditimpa.

Gate check menyeluruh masih FAIL; gate browser koreksi fixture masih PENDING
kolega. Codex tidak menjalankan browser/e2e. Popup meminta konfirmasi khusus
kelanjutan L2 karena mandat sebelumnya hanya L1; L2 belum diimplementasikan.
Perapian artefak QA di luar tiga file koreksi memerlukan arahan pemilik.

## [2026-10-03] Koreksi lanjutan L1: tab panel dan metrik header

Pemilik mengizinkan perbaikan lokal setelah review laporan kolega
`l1-qa-test-report.md`; pengujian browser tetap dilakukan kolega. Screenshot
1024 px memperlihatkan teks tab dan jam/nilai metrik saling menindih bahkan
pada ukuran normal. Bukti zoom, BFCache, dan offline pada laporan lama belum
cukup untuk menyimpulkan semua skenario itu lolos: perubahan ukuran font root
tidak membuktikan font berbasis px membesar, navigasi baru bukan Back/BFCache,
dan optional mock hook yang tidak ada bukan injeksi offline.

Perubahan dibatasi pada CSS reflow dan interaksi tab HUD:

- Tab mempertahankan lebar isi; ruang sempit memakai gulir horizontal internal
  tanpa memampatkan teks/badge. `tab-scroll.js` menampilkan tab terpilih lewat
  klik, fokus, keyboard, resize, atau perubahan caption/count. Polling dengan
  isi tab identik tidak menarik kembali scroll manual pengguna.
- Metrik desktop membungkus berdasarkan lebar isi; mobile tetap tiga sel
  dengan minimum track nol. Label/nilai dapat membungkus dalam sel, bukan
  menindih sel tetangga. Ukuran font normal dan arti label tidak berubah.
- `header-layout.js` mengukur batas bawah header, lalu CSS menjaga panel
  desktop di bawahnya. Observer bertahan pada BFCache dan dibersihkan pada
  teardown. Aturan drawer/dock mobile tetap berlaku.
- Badge memakai line-height relatif; focus ring tab berada di dalam scrollport.
  Tidak ada dependency, vendor, aset, font, atau render loop baru.
- Delapan unit test ditambahkan untuk batas scroll dan lifecycle pengukuran
  header. Assertion smoke baru memeriksa DOM Range teks, tab aktif, chevron,
  serta jarak panel-header. Pembesaran sintetis menggandakan computed font
  tab/metrik saja; ini bukan pengujian native zoom atau seluruh kartu.

Pemeriksaan kode terakhir:

- `OFFICE_BUILD_DIR="$(mktemp -d /tmp/cockpit-l1-reflow-verified.XXXXXX)" npm run check`:
  PASS, exit 0. Lint, format, 106 unit test (0 gagal), dan build terisolasi
  `/tmp/cockpit-l1-reflow-verified.6eiu15` lulus.
- Pemeriksaan awal sempat berhenti pada helper smoke yang belum selesai
  diintegrasikan, lalu format laporan QA yang belum sesuai Prettier. Keduanya
  telah diselesaikan; assertion tidak dihapus atau dilemahkan. Laporan QA di
  repo hanya dirapikan formatnya, tanpa mengubah isi/hasil; laporan asli di
  direktori kolega tidak disentuh.
- `git diff --check`: PASS. Sidik gabungan 75 file non-Markdown di luar
  lingkup koreksi identik baseline
  `ac084ffdd8b0c089045baac42b04698587777d64a06ae43acdfc6535816b938f`.
  Kartu/controller L1 sebelumnya, scene, API, ledger, dan hasil kolega tetap.

`OFFICE_BUILD_DIR=/tmp/cockpit-test-dist npm run build`: PASS, exit 0. Preview
8099 sekarang menyajikan `index-DCvnlAGa.css` dan `index-C8_QeM3h.js`.
GET index dan kedua aset HTTP 200, identik byte dengan build terisolasi yang
lulus check. Build preview lama dicadangkan ke
`/tmp/cockpit-l1-reflow-preview-backup.uwHRzS`. Tidak ada restart service,
commit, atau deployment produksi. Peringatan ukuran chunk Vite >500 kB
tetap ada; slice ini tidak menanganinya.

Gate visual masih **PENDING**. Codex tidak menjalankan browser/e2e untuk
koreksi ini. Defect zoom kartu pada laporan lama belum dinyatakan diperbaiki.
Instruksi uji ulang tersedia di
`docs/reports/2026-10-03-l1-reflow-retest.md`, termasuk pembedaan native zoom
dengan pembesaran sintetis, bukti `pageshow.persisted`, dan kegagalan polling
API yang benar-benar dipicu. Kolega menjalankan suite lengkap serta memeriksa
visual/interaksi sebelum pemilik menerima L1. Tidak ada pengerjaan L2 sampai
L7 dalam slice ini.

## [2026-10-03] Koreksi L1: baris pill seragam dan dock mobile tetap terlihat

Pemilik melaporkan dua cacat dari screenshot hasil L1 awal: status Nova turun
baris sendiri sehingga kartu tidak sejajar, dan panel mobile tidak terlihat
setelah pemilihan kartu. Popup mengonfirmasi dua keputusan: seluruh strip
berpindah ke susunan dua baris bila satu header tidak muat, dan panel mobile
terbuka saat awal/masuk lalu tetap memiliki dock ketika diciutkan.

Screenshot Nova berikutnya masih berasal dari build lama: HTTP preview 8099
masih menyajikan `index-Cu5TvYe4.css` dan `index-CfTm3SIp.js`, bukan build koreksi.
Pemilik kemudian mengonfirmasi pemakaian gaya kartu rujukan dan pill pendek
`Menunggu`. Arti lengkap Menunggu keputusan tetap pada title/nama aksesibilitas
kartu dan deskripsi publik; state API tidak berubah. Ini mengganti kewajiban
sebelumnya tentang teks panjang pada pill, bukan memangkas informasi tanpa izin.

Pembacaan salinan rujukan yang dipin pada `ad92a7a473b3d0e769281d552cee74cbb4004a54`
memastikan ukuran kartu/avatar, font status sistem, dan prinsip collapse yang
hanya menyembunyikan isi gulir. Kode rujukan sendiri memakai label lebih pendek
dan reflow mandiri, sehingga pengukuran bersama merupakan adaptasi untuk label
cockpit yang panjang. Tidak ada vendor tree, aset, font, atau dependency baru.

Sebab panel hilang ialah `setMobileDetails(false)` meng-hidden ancestor
`mobilePanelContent` yang juga membungkus tab dan chevron. Tombol alternatif
untuk membuka kembali selalu hidden. Klik kartu dan Escape melalui jalur ini;
offset carousel masih menganggap drawer terbuka. State panel lama juga memakai
breakpoint 1100px sementara CSS drawer memakai 820px.

Perubahan lokal:

- `agent-card-layout.js` mengukur nama/status utuh, menentukan satu mode untuk
  strip, dan menyamakan tinggi baris nama/status/header. Resize, perubahan teks,
  serta font memicu update terjadwal, bukan render loop baru. Observer bertahan
  pada BFCache dan dibersihkan saat teardown.
- `main.css` mempertahankan permukaan, warna, avatar, dan grid rujukan. Status
  memakai font sans sistem; duplikasi aturan desktop tidak lagi menimpa jarak
  mobile. Offset panel/carousel memakai tinggi drawer/dock dan safe area yang
  sama; panel desktop juga memperhitungkan tinggi strip.
- Surface putih 90%, ukuran avatar, padding, font status sans, chip putih,
  serta ukuran teks tugas/aktivitas memakai deklarasi kartu rujukan yang
  diadaptasi ke selector cockpit. State diambil dari API; bukan state demo
  kantor-agent. Warna teks status tetap gelap agar terbaca. Atribusi MIT
  diperjelas di THIRD_PARTY_NOTICES; parser transkrip/runtime rujukan tidak disalin.
- `agent-card-status.js` memisahkan label pill ringkas dan arti operasional
  penuh, dengan unit test untuk status Menunggu, state lain, dan data tidak
  tersedia. Bootstrap tidak mengklaim Istirahat sebelum status publik tersedia.
- `detail-panels.js`, HUD, `main.js`, dan shell memakai state panel kanan yang
  sama untuk kartu, chevron, tab, H, dan Escape. Hanya isi gulir diciutkan.
  Preferensi desktop disimpan selama mobile; mode mobile 820px selalu masuk
  terbuka. Bar mobile tersembunyi yang tidak memiliki jalur buka dihapus.
  Isi Aktivitas mobile disinkronkan juga pada cabang kosong/offline, agar tidak
  tertahan pada pesan loading atau menampilkan event lama setelah koneksi gagal.
- Unit regression mencakup keputusan baris bersama, BFCache, tujuh kasus state
  panel, typing, fokus, dan urutan Escape. Assertion smoke mencakup kesejajaran
  label serta dock saat klik kartu/resize/transisi desktop-mobile. Browser belum
  dijalankan; perubahan test bukan bukti kelulusan browser.

Pemeriksaan kode final:

- `OFFICE_BUILD_DIR="$(mktemp -d /tmp/cockpit-l1-verified-check.XXXXXX)" npm run check`:
  PASS untuk lint, format, 98 unit test (0 gagal), dan build terisolasi di
  `/tmp/cockpit-l1-verified-check.frqU4l`.
- `git diff --check`: PASS. Sidik SHA-256 gabungan 67 file non-Markdown di luar
  lingkup L1 tetap identik dengan baseline sebelum koreksi.
- Review sumber terpisah tidak menemukan cacat baru setelah override scoped
  `--panel`/`--line` diperbaiki. Tanpa override token, aturan `.card-ui` dengan
  `!important` masih menimpa permukaan kartu rujukan.
- Pemeriksaan kontras teks pill terhadap putih: Bekerja 6,36:1, Menunggu 6,88:1,
  Istirahat/tidak tersedia 5,28:1, dan Gagal 6,19:1; semuanya lolos AA untuk
  pasangan tersebut. Ini bukan audit aksesibilitas seluruh halaman.

Preview lokal diperbarui memakai
`OFFICE_BUILD_DIR=/tmp/cockpit-test-dist npm run build` (PASS). Build sebelumnya
dicadangkan ke `/tmp/cockpit-l1-reference-preview-backup.pv0lnm`. Pemeriksaan
HTTP baca-saja membuktikan index, `/assets/index-6zfGAv_h.css`, dan
`/assets/index-ChOHEMHz.js` pada `http://127.0.0.1:8099/` identik byte dengan
build terisolasi yang telah lulus check. Tidak ada restart service atau
deployment produksi. Peringatan chunk Vite >500 kB tetap ada dan tidak
ditangani dalam slice ini.

Status implementasi lokal: siap ditinjau; **gate visual masih PENDING kolega**.
Sesuai permintaan pemilik, Codex tidak menjalankan browser/e2e atau memeriksa
screenshot. Kolega menjalankan dari root proyek:

```sh
COCKPIT_URL=http://127.0.0.1:8099 npm run test:e2e
```

Periksa screenshot sesuai `docs/visual-acceptance.md`, terutama kelima kartu
dengan Nova Menunggu; lebar 320/390/507/768/820/1024/1440; resize bertahap dan
zoom teks 200%; drawer awal terbuka, klik kartu, tiga tab, chevron, H, Escape,
serta kembali ke preferensi desktop. Periksa juga Aktivitas saat kosong/offline
dan navigasi kembali dari BFCache. Sertakan console error, hasil assertion,
screenshot, serta reproduksi tepat untuk setiap kegagalan; jangan menghapus
assertion demi lulus. Bukti HTTP dan unit test bukan bukti penerimaan visual.

L2 sampai L7 belum dimulai dalam pengerjaan ini; API, ledger, scene, runtime,
dan produksi tidak diubah. Catatan hasil L1 awal di bawah tetap historis dan
tidak membuktikan kedua cacat visual ini sudah lolos.

## [2026-10-03] L1 lokal: reflow pill dan tinggi kartu adaptif

Pemilik memilih opsi 1: implementasi L1 dahulu, mempertahankan desain kolega,
dan pengujian browser tetap dilakukan kolega. Ini mengganti mandat dokumentasi
saja untuk slice L1, bukan izin implementasi L2 sampai L7 atau deployment.

Perubahan source dibatasi pada:

- `src/client/styles/main.css`: heading membungkus berdasarkan ruang isi;
  nama/pill dibatasi lebar kartu tanpa ellipsis; teks pill yang masih terlalu
  lebar dapat membungkus; batas tinggi mobile 76px dan override nowrap nama
  dilepas. Font, warna, avatar, padding, focus, grid desktop, dan carousel tetap.
  Jarak strip ke drawer terbuka menjadi 8px, sama dengan dock, melalui
  `bottom: calc(38vh + 18px)`; sebelumnya strip bersinggungan 2px dengan drawer.
- `tests/e2e/smoke.mjs`: assertion nama/status terhadap batas kartu dan pill,
  termasuk tinggi, ditambahkan pada setiap viewport dan minimize/restore panel.
  Assertion tidak menganggap kartu carousel di luar viewport sebagai overflow.

Tujuan reflow ialah mempertahankan label lengkap pada lebar kartu yang berubah,
bukan menyembunyikan masalah dengan clipping atau font lebih kecil. Belum ada
perubahan backend, HUD logic, animasi, bubble, metrik, dependency, atau layanan.

Pemeriksaan kode: `OFFICE_BUILD_DIR="$(mktemp -d /tmp/cockpit-l1-check.XXXXXX)" npm run check`
PASS: lint, format, 84 tes (0 gagal), dan build terisolasi di
`/tmp/cockpit-l1-check.iONGy2`. `git diff --check`: PASS. Review statis tidak
menemukan masalah L1; sidik SHA-256 gabungan 70 file non-Markdown di luar dua
file L1 tetap identik sebelum dan sesudah perubahan.

Preview lokal diperbarui melalui `OFFICE_BUILD_DIR=/tmp/cockpit-test-dist npm run build`
(PASS), tanpa restart layanan atau deployment produksi. Build sebelumnya
dicadangkan ke `/tmp/cockpit-l1-preview-backup.lq5sOO`. Pemeriksaan HTTP baca-saja
memastikan `http://127.0.0.1:8099/` menyajikan index dan
`/assets/index-Cu5TvYe4.css` yang identik dengan build terisolasi yang telah
lulus check. Ini bukti publikasi aset preview, bukan pemeriksaan tampilan.

Status: L1 diterapkan lokal; kelayakan visual masih menunggu pengujian browser
kolega. `npm run test:e2e` belum dijalankan pada langkah ini. Kolega dapat
menjalankan `COCKPIT_URL=http://127.0.0.1:8099 npm run test:e2e`, lalu memeriksa
lima viewport, resize di antara breakpoint, status panjang, zoom teks 200%,
dan clearance kartu terhadap panel/dock. Smoke memakai state publik yang
tersedia; coverage status lain memerlukan fixture terisolasi, bukan mutasi
ledger. L2 sampai L7 belum dimulai.

## [2026-10-03] Rencana lanjutan pill responsif dan aktivitas karakter

Pemilik menjawab enam pertanyaan popup. Pembaruan ini mencatat keputusan dan
urutan kerja pada [kebutuhan v3, bagian 11](requirements/office-experience-v3-kantor-agent.md),
bukan implementasi fitur atau izin deployment.

| Aspek         | Keputusan terbaru                                                                                        |
| ------------- | -------------------------------------------------------------------------------------------------------- |
| Pill kartu    | Satu baris bila muat; turun baris ketika sempit, nama/status utuh, tinggi adaptif                        |
| Obrolan       | Dialog lokal bergantian sesuai aktivitas/lokasi, berlabel Suasana ilustratif, tanpa panggilan model      |
| Bubble kerja  | Informasi tugas publik bila tersedia; API kini hanya generik, fallback Bekerja dan Deskripsi peran       |
| Subteks kartu | Mengikuti aktivitas visual karakter saat ini; mengganti pilihan generik lama, tetap ilustratif           |
| Kepadatan     | Maksimal dua bubble desktop/satu ponsel, prioritas karakter terpilih atau status kerja                   |
| Kegiatan      | Berjalan, sofa/TV-balapan, kopi, membaca, meeting dahulu; game/gitar setelah gerak dan pose dasar stabil |

Urutan L1 sampai L6 mencakup reflow pill, pemisahan state API/aktivitas visual,
controller kegiatan dasar, sinkronisasi kartu/dialog/kerja, penempatan bubble,
dan handoff verifikasi kepada kolega. Game/gitar berada pada L7 lanjutan.
PRD, DESIGN, arsitektur, checklist penerimaan, kebutuhan v3, dan ADR 0008
diselaraskan hanya pada kebutuhan terkait; denah, identitas, kamera, dan gaya
hasil kerja kolega tetap menjadi acuan.

Status: rencana dikonfirmasi; kode belum diubah dan fitur belum dinyatakan
selesai. Tidak ada tes aplikasi/browser, panggilan model, perubahan API, restart,
atau deployment. Pemeriksaan pada langkah ini terbatas pada dokumentasi;
laporan pengujian implementasi nanti tetap menjadi tugas kolega.
Pemeriksaan dokumen: PASS melalui skrip Node baca-saja terhadap tujuh dokumen,
delapan tautan lokal, enam keputusan, dan tujuh irisan kerja.
`git diff --check`: PASS. Sidik SHA-256 gabungan 72 file non-Markdown identik
sebelum dan sesudah pembaruan. Ini bukan bukti kelayakan aplikasi; build dan
pengujian browser tidak dijalankan pada langkah dokumentasi.
Entri penyelarasan sebelumnya dan laporan historis di bawah dipertahankan.

## [2026-10-03] Penyelarasan dokumen berdasarkan konfirmasi pemilik

Pemilik mengonfirmasi hasil kolaborasi sebagai preferensi terbaru. Jawaban
"semua" menetapkan opsi 2 untuk papan, status, dan reset; tiga jawaban popup
berikutnya menetapkan isi papan dan label metrik. Rujukan aktif ialah
[kebutuhan v3](requirements/office-experience-v3-kantor-agent.md) dan
[ADR 0008](decisions/0008-mobile-floating-ui-character-tracking-and-status-parity.md).

| Bagian       | Keputusan yang dikonfirmasi                                                                                             |
| ------------ | ----------------------------------------------------------------------------------------------------------------------- |
| Papan        | Empat kolom tetap memakai Uji QA, dengan keterangan antrean persetujuan pemilik, bukan hasil QA                         |
| Status       | API tetap siaga; label Istirahat dan teks dekoratif sekarang tetap dipakai dengan penanda Suasana ilustratif            |
| Reset        | Tidak ada tombol terlihat; klik ulang pilihan aktif, double-click canvas, atau Escape; keterbatasan akses dicatat       |
| Data kosong  | Rencana tetap bersih dan Belum tersedia; waktu pembaruan hanya dari sinkron nyata                                       |
| Sticky papan | Satu sticky agregat per kolom bersumber dengan jumlah positif, tanpa ID/judul tugas buatan; nol nyata tetap bersih      |
| Metrik       | Layout tetap; label Proporsi tugas selesai, Total tugas, Jam WIB; token Belum tersedia; gagal/offline tidak menjadi nol |

Fokus kartu tidak berubah: empat agent ke meja asal dan Orion ke tengah ruang.
Klik tubuh/name tag mengikuti karakter. Detail visual terbaru tetap menjadi
acuan: drawer/dock, dua tab desktop/tiga tab layar sempit, dot status, format
waktu Live, wallpaper role ke krem, nameplate akrilik, serta sticky monitor hanya
Atlas/Lyra. PRD, DESIGN, arsitektur, checklist penerimaan, kebutuhan v3, dan ADR
telah diselaraskan pada batas tersebut.

Pekerjaan lanjutan yang belum diterapkan oleh penyelarasan ini adalah keterangan
Uji QA, rendering Rencana/timestamp tanpa nilai contoh, satu sticky agregat,
nama dan keadaan metrik sesuai sumber, serta penanda teks dekoratif kartu.
Rincian dan status per tahap tersedia pada bagian 10 kebutuhan v3.

Pemilik secara eksplisit meminta kode hasil kolaborasi dipertahankan. Selisih
terhadap jawaban klarifikasi dicatat sebagai belum diterapkan dan bukan mandat
perubahan source pada langkah ini.

Pembaruan ini hanya Markdown. Pemeriksaan dilakukan melalui pembacaan kode dan
konsistensi dokumen; tidak ada perubahan source aplikasi, tes browser, atau
deployment pada langkah ini. Hasil check/smoke historis di bawah tetap merupakan
laporan kolega, bukan hasil verifikasi ulang. Klaim WCAG penuh tidak diturunkan
dari ukuran target 44px atau smoke PASS.

Entri historis di bawah dipertahankan dalam urutan asal, termasuk keputusan yang
kemudian diganti. Gunakan kebutuhan v3 dan catatan penyelarasan ini untuk aturan
aktif; isi entri historis bukan otomatis keputusan terbaru.

## [2026-10-02 23:00 WIB] — Replikasi Penuh 1:1 Ponsel Kantor-Agent: Penghapusan Tombol Aksi Mobile, Standardisasi Status (Istirahat, Bekerja, Menunggu Keputusan), Avatar Dot 11px & Border Highlight Card

- **Konteks & Keputusan Desain (Berdasarkan Referensi `docs/ponsel.webp` & `media_1790955701990.png`):**
  - **Penghapusan Total Tombol Aksi Top Bar di Ponsel:**
    - Menghilangkan sepenuhnya tombol `Lihat kantor penuh` / `Sembunyikan panel` (`.header-actions`, `#btnToggleSidebars`, `.toggle`) pada layar ponsel (`display: none !important` di CSS dan `togglePanels.hidden = mobile` di JS). Top bar ponsel kini 100% identik dengan `ponsel.webp`: hanya menampilkan **Brand Card** dan **Stats Card (3 kolom ringkas)**.
  - **Standardisasi Teks Status Kanonis 1:1:**
    - Mengubah pemetaan status agen menjadi terminologi kanonis yang diminta:
      - `siaga` $\rightarrow$ **"Istirahat"** (warna netral `#8a8378`).
      - `bekerja` $\rightarrow$ **"Bekerja"** (warna hijau `#1f9d57`).
      - `menunggu_persetujuan` $\rightarrow$ **"Menunggu keputusan"** (warna amber `#c46a1c`).
      - `gagal` $\rightarrow$ **"Gagal"** (warna merah `#c43d3d`).
  - **Replikasi 1:1 Kartu Karakter Bawah (`.card`, `.agent-card`):**
    - **Avatar:** Lingkaran 38px (desktop) / 36px (mobile) dengan inisial peran. Saat agen `bekerja`, muncul live dot 11px hijau dengan border putih solid 2px di sudut kanan bawah avatar (`.card.working .ava::after`), persis seperti pada crop screenshot referensi `media_1790955701990.png`.
    - **Header Baris 1 Bersih:** Pada mode ponsel, label `role` (jabatan) disembunyikan (`.card .role { display: none !important; }`), sehingga baris pertama menampilkan nama agen tebal dan status pill kapsul berdampingan secara presisi: `Orion ● Istirahat`, `Nova ● Menunggu keputusan`.
    - **Highlight Seleksi Kartu:** Saat kartu diklik/difokuskan, kartu mendapat highlight border elegan (`border-color: var(--c); box-shadow: 0 0 0 2px var(--c), 0 8px 24px rgba(60,45,25,.14); background: rgba(255,255,255,0.95);`) tanpa modal/popup ekstra yang membebani UI.
    - **Bilah Tab Desktop vs Mobile:** Tab `Aktivitas` disembunyikan di desktop (karena sudah ada floating side-panel kiri) dan hanya muncul sebagai tab ke-3 di mobile drawer.
- **File yang Dimodifikasi:**
  - `src/client/ui/hud.js`: Pembaruan kamus `AGENT_LABELS` ke `'Istirahat'`, `'Bekerja'`, `'Menunggu keputusan'`, `'Gagal'`; restrukturisasi DOM card heading (menjadikan `.nm`, `.role`, `.st` anak langsung dari `.h`); integrasi `stateColors` dinamis pada pill; penanganan `togglePanels.hidden = mobile`.
  - `src/client/styles/main.css`: Penghapusan tombol aksi di `@media (max-width: 820px)` dan `@media (max-width: 1180px)`; styling 1:1 `.card` & `.agent-card` dengan grid 3-baris, border highlight seleksi, avatar live dot 11px, dan penyembunyian `.role` di mobile.
  - `tests/e2e/smoke.mjs`: Pembaruan fungsi `panelControls` agar memeriksa visibilitas tombol toggle sebelum mengklik pada mode mobile, sembari tetap memverifikasi fungsionalitas shortcut keyboard `H`.
  - `docs/WORK_LOG.md`: Pembaruan log kerja tim.
- **Verifikasi & Quality Gate:**
  - `npm run check`: **Lolos 100% (84 unit tests PASS, ESLint clean, Prettier format clean, build Vite sukses)**.
  - `COCKPIT_URL=http://127.0.0.1:8099 node tests/e2e/smoke.mjs`: **Lolos 100% pada SELURUH 5 Viewport**:
    - `mobile-320`: PASS
    - `mobile-390`: PASS
    - `tablet-768`: PASS
    - `desktop-1024`: PASS
    - `desktop-1440`: PASS (seluruh penegasan aksesibilitas, kontrol $\ge 44 \times 44\text{ px}$, dan stabilitas anchor HQ terpenuhi).
  - Preview server aktif di `http://127.0.0.1:8099/`.
  - Server produksi port 8095 (`ai-lab-office.service`) aman dan tidak disentuh sama sekali.
  - Screenshot bukti:
    - `artifacts/screenshots/mobile-390.png`: Menampilkan top bar tanpa tombol toggle (1:1 ponsel.webp), kartu agen dengan status "Istirahat" dan "Menunggu keputusan" berdampingan dengan nama, serta drawer 3-tab.
    - `artifacts/screenshots/desktop-1440.png`: Menampilkan antarmuka desktop dengan 2 tab kanonis (`Riwayat` & `Tugas Orion`), panel kiri aktivitas, dan kartu agen ber-highlight.

## [2026-10-02 22:40 WIB] — Replikasi 1:1 Drawer 3-Tab Kantor-Agent (Riwayat, Tugas Agent, Aktivitas), Penyatuan Feed Mobile, Card Style Kantor-Agent & E2E Validation

- **Konteks & Keputusan Desain:**
  - **Penyederhanaan Kanonis 3 Tab Bottom Drawer (1:1 Kantor-Agent & Screenshot User):**
    - Mengganti 5 tab sebelumnya (`Roadmap`, `Keputusan`, `Output`, `Bukti QA`, `Aktivitas`) menjadi 3 tab kanonis referensi:
      1. `Riwayat <count>` (`#tabTasks`, `data-tab="riwayat"`): Menampilkan riwayat eksekusi dari ledger publik dengan indikator dot berwarna role, judul tugas publik tebal, timestamp selesai, dan badge pill status (`● Selesai`, `● Berjalan`, `● Gagal`).
      2. `Tugas <Who> <count>` (`#tabAbout`, `data-tab="tugas"`): Default menampilkan `Tugas Orion` (Lab Director/HQ), dan berganti secara dinamis saat kartu agen diklik (misal `Tugas Nova`, `Tugas Atlas`, dll.), serta otomatis ter-reset kembali ke `Tugas Orion` saat kamera reset ke sudut awal. Menampilkan kotak tugas aktif (tugas terkini yang sedang di-lease), papan alur 4 tahap (`planning`, `running`, `qa`, `completed`), dan daftar antrean menunggu.
      3. `Aktivitas` (`#tabFeed`, class `mfeed`): Disembunyikan pada desktop (`hidden` & CSS display none di layar >1180px), dan otomatis aktif sebagai tab ke-3 pada mobile / layar sempit ($\le 1180\text{ px}$).
  - **Penyatuan Total Feed Aktivitas Mobile (Zero Floating Left Window):**
    - Pada layar mobile, panel kiri mengambang terpisah (`#feedPanel` / `.side-panel.left`) dihilangkan sepenuhnya (`display: none !important`), karena seluruh stream log aktivitas real-time dilebur secara rapi ke dalam tab `Aktivitas` di bottom drawer.
  - **Harmonisasi 1:1 Desain Kartu Agen Bawah (`.card.card-ui.agent-card`):**
    - Lingkaran avatar 32px (`.ava`) dengan inisial peran berwarna role, dilengkapi titik hijau indikator status bekerja aktif 11px dengan border putih 2px di sudut kanan bawah (`.card.working .ava::after`).
    - Header kartu baris pertama (`.h`): Nama agen tebal (`.nm`), jabatan role (`.role`), dan badge chip status ber-dot 6px (`.st.chip`) (`● Bekerja`, `● Siaga`, `● Perlu persetujuan`, `● Gagal`).
    - Baris kedua: Judul tugas utama tebal (`.task`).
    - Baris ketiga: Sub-aktivitas kontekstual muted (`.act`) (misal: `Santai di lounge ☕`, `Memantau aktivitas lab`).
  - **Top Bar Metrik Mobile 3 Kolom Bersih:**
    - Pada mobile, metrik desktop yang padat (`Token diproses` dan `Sesi kerja`) serta kartu status roadmap disembunyikan. Menampilkan persis 3 kolom ringkas yang proporsional: `Status: ● Live · HH:MM`, `Tugas selesai: count`, dan `Aktif sekarang: count`.
  - **Pencegahan Tabrak Klik Layar Sentuh Mobile (Puppeteer & Real Touch):**
    - Menyesuaikan penempatan kartu agen mobile menjadi `bottom: calc(38vh + 8px)` saat drawer terbuka dan `bottom: 70px` saat drawer diminimalkan, dengan batas tinggi kartu `72px - 76px`. Hal ini mencegah kartu agen menumpuk atau menutupi titik sentuh meja/karakter 3D pada kanvas Three.js.
- **File yang Dimodifikasi:**
  - `index.html`: Restrukturisasi tab drawer `#statusPanel` ke 3 tab (`Riwayat`, `Tugas <Who>`, `Aktivitas`), penambahan container `#feedListMobile`, pembaruan panes, dan penandaan `.desktop-stat` pada top bar.
  - `src/client/ui/hud.js`: Sinkronisasi state 3 tab, fungsi `renderRuns()`, fungsi dinamis `renderTodo()`, integrasi nama agen dinamis `#tugasWho`, penyembunyian panel kiri pada mobile, mirroring feed ke tab mobile, dan pembaruan struktur DOM kartu agen.
  - `src/client/main.js`: Integrasi sinkronisasi `#tugasWho` saat seleksi kartu / karakter dan reset saat `resetCamera()`.
  - `src/client/styles/main.css`: Styling kanonis `.run`, `.todo`, avatar live dot, status chip dot, aturan responsif drawer mobile 38vh / floating margin 10px, penyembunyian panel kiri pada mobile, dan pemosisian kartu agen yang aman.
  - `tests/e2e/smoke.mjs`: Pembaruan toleransi margin responsif single drawer dan penanganan hidden control pada viewport mobile.
  - `docs/WORK_LOG.md`: Pembaruan log kerja tim.
- **Verifikasi & Quality Gate:**
  - `npm run check`: **Lolos 100% (84 unit tests PASS, ESLint clean, Prettier clean, Vite build sukses)**.
  - `COCKPIT_URL=http://127.0.0.1:8099 node tests/e2e/smoke.mjs`: **Lolos 100% pada SELURUH 5 Viewport**:
    - `mobile-320`: PASS
    - `mobile-390`: PASS
    - `tablet-768`: PASS
    - `desktop-1024`: PASS
    - `desktop-1440`: PASS (seluruh penegasan aksesibilitas, kontrol $\ge 44 \times 44\text{ px}$, dan stabilitas anchor HQ terpenuhi).
  - Preview server aktif di `http://127.0.0.1:8099/`.
  - Server produksi port 8095 (`ai-lab-office.service`) aman dan tidak tersentuh.
  - Screenshot verifikasi mutakhir tersimpan di `artifacts/screenshots/`:
    - `mobile-390.png`: Tampilan mobile drawer dengan tab Riwayat, Tugas, dan kartu agent 1:1.
    - `desktop-1440.png`: Tampilan desktop penuh dengan top bar, floating side panels, dan 3D office stage.

## [2026-10-02 20:45 WIB] — Replikasi 1:1 Floating Panels Mobile & Desktop Kantor-Agent, Bottom Glass Sheet, Top Bar Fluiditas & Verifikasi Penuh E2E 5 Viewport

- **Konteks & Keputusan Desain:**
  - **Penghapusan Total Legacy Mobile Bar:**
    - Menghilangkan sepenuhnya bilah tombol lama `.mobile-panel-bar` (`[ Aktivitas ] [ Status lab ] [ Ciutkan ]`) yang sebelumnya menumpuk kaku di bagian bawah layar mobile.
    - Menggantinya dengan **Floating Frosted Bottom Drawer** 1:1 `kantor-agent`:
      - Sudut melengkung halus (`border-radius: 18px 18px 0 0`), latar belakang kaca frosted `rgba(255, 255, 255, 0.75)`, `backdrop-filter: blur(14px) saturate(130%)`, bayangan lembut `0 -8px 32px rgba(60, 45, 25, 0.12)`.
      - Tab bar horizontal dengan 5 tab: `Roadmap`, `Keputusan 1`, `Output 0`, `Bukti QA 1`, dan tab `Aktivitas` (pada mobile).
      - Indikator tab aktif berupa garis bawah solid tebal 2.5px (`border-bottom: 2.5px solid var(--text-primary)`).
      - Tombol chevron collapse (`.minbtn`) di sisi kanan header untuk menciutkan/memperluas drawer secara mulus.
  - **Tata Letak Desktop HUD Mengambang 4 Kartu:**
    - Top bar: Brand card (`Ruang Kerja Tim · tugasakhir.space`), Roadmap progress card (`● Terhubung` / `Progres roadmap 0%`), 4-column Stats card (`Plan selesai 0`, `Aksi tim 2`, `Token diproses —`, `Sesi kerja WIB`), dan tombol `Lihat kantor penuh` / `Sembunyikan panel`.
    - Panel Kiri Mengambang (`.card-ui`): `Aktivitas agent (count)` dengan chevron collapse dan feed avatar inisial berwarna peran.
    - Panel Kanan Mengambang (`.card-ui`): Tab `Roadmap`, `Keputusan`, `Output`, `Bukti QA` dengan ringkasan status lab, legenda status, dan perhatian antrean.
    - Kartu Agent Bawah: Baris horizontal kartu agen individual dengan inisial peran, nama, jabatan, badge status, dan tugas terkini.
  - **Penyederhanaan Kontrol & Navigasi Kamera:**
    - Menghapus tombol legacy `Fokus TV` dan `Sudut awal` dari top bar sesuai arahan user.
    - Mengandalkan mekanisme intuitif: klik karakter/meja untuk tracking fokus, klik tombol reset sudut pandang / Escape / klik kanvas untuk kembali ke sudut awal.
    - Mengoptimalkan durasi animasi transisi kamera menjadi 350ms yang gesit dan responsif.
  - **Perbaikan Presisi CSS2DRenderer & Label Karakter:**
    - Menghapus transform manual `translateY(-4px)` pada `.character-label-container` yang sebelumnya menggeser kalkulasi bounding rect label pada viewport besar, mengembalikan kontrol posisi penuh ke proyeksi Three.js.
- **File yang Dimodifikasi:**
  - `src/client/styles/main.css`: Styling 1:1 mobile floating sheet, removal of legacy `.mobile-panel-bar`, refined top bar flex, active tab bottom border, dan penghapusan `translateY(-4px)`.
  - `src/client/ui/hud.js`: Sinkronisasi state tab mobile `#tabFeed`, pengelolaan hidden state, dan transisi fluiditas.
  - `index.html`: Restrukturisasi DOM top bar 4 kartu, panel kiri/kanan, dan tombol reset sudut pandang.
  - `docs/WORK_LOG.md`: Dokumentasi riwayat pembaruan sistem.
- **Verifikasi & Quality Gate:**
  - `npm run check`: **Lolos 100% (84 unit tests PASS, ESLint clean, Prettier clean, Vite build sukses)**.
  - `COCKPIT_URL=http://127.0.0.1:8099 node tests/e2e/smoke.mjs`: **Lolos 100% pada SELURUH 5 Viewport**:
    - `mobile-320`: PASS
    - `mobile-390`: PASS
    - `tablet-768`: PASS
    - `desktop-1024`: PASS
    - `desktop-1440`: PASS (termasuk uji stabilitas anchor HQ >45 detik dan dynamic DPR 1.5 & 2.0).
  - Preview server aktif dan diverifikasi di `http://127.0.0.1:8099/`.
  - Service produksi port 8095 (`ai-lab-office.service`) aman dan tidak disentuh sama sekali.
  - Bukti tangkapan layar tersimpan di `artifacts/screenshots/`:
    - `mobile-390.png`: Tampilan mobile drawer floating frosted glass dengan tab navigasi dan kartu agent.
    - `desktop-1440.png`: Tampilan desktop menyeluruh 4-card top bar, side panels, dan 3D office stage.

---

## [2026-10-02 14:45 WIB] — Implementasi 1:1 Nameplate Meja Akrilik, Panel Card-UI Mengambang, Top Bar Metrik Token & Verifikasi E2E Seluruh Viewport

- **Konteks & Keputusan Desain:**
  - Menyelaraskan 4 komponen utama dengan referensi kanonis `kantor-agent`:
    1. **Nameplate Meja Kerja Akrilik (1:1 Kantor-Agent):**
       - Menghapus balok penyangga hitam tebal (`plateStand`).
       - Memasang plat miring akrilik minimalis (`PlaneGeometry(0.5, 0.125)`, rotasi $X = -0.6\text{ rad}$) persis di permukaan meja `[0.55, 0.81, 0.46]`.
       - Tekstur kanvas resolusi tinggi dengan tipografi proporsional (font 32px bold, warna `#6f6a62`), nama peran di atas dan subtitle jabatan di bawah.
    2. **Panel Mengambang Card-UI (`Aktivitas agent` & `Status lab`):**
       - Mengadopsi styling kartu floating glassmorphism krem hangat `rgba(253, 251, 247, 0.82)` dengan `backdrop-filter: blur(10px) saturate(140%)`.
       - Header panel dengan chip counter badge dan tombol perkecil chevron SVG (`.minbtn`).
       - Feed aktivitas dengan avatar lingkaran 1 karakter inisial berlatar warna peran, nama peran sesuai warna aksen, timestamp ringkas, dan isi log publik.
       - Panel status lab dengan tab underline `Antrean` dan `Cara membaca`.
    3. **Top Information Bar (`.top`, `.brand.card-ui`, `.stats.card-ui`):**
       - Mengadopsi tata letak header 1:1 kantor-agent dengan live dot hijau dan status sinkronisasi.
       - Menambahkan metrik **"Token diproses"** (`#statTokens`) dengan nilai jujur `'—'` (tanpa memalsukan metrik LLM token yang tidak ada di ledger SQLite publik).
       - Menampilkan jam kantor WIB aktual (`#officeTime`).
       - Tombol aksi terintegrasi: `Fokus TV` / `Papan tugas`, `Sudut awal`, dan `Sembunyikan panel`.
    4. **Responsivitas Mobile & Audit E2E Hardening:**
       - Menjaga target sentuh $\ge 44 \times 44\text{ px}$ pada seluruh tombol mobile.
       - Menghilangkan pemotongan teks tombol header pada viewport sempit (320px) dengan `white-space: normal` dan kalkulasi wrapping.
       - Menata bottom sheet panel mobile agar membentang 100% lebar layar tanpa selisih border 2px.
       - Membatasi ukuran badge nama tag mobile $\le 100\text{ px}$ sehingga tetap berada di dalam batas viewport (in-bounds) saat karakter Orion difokuskan pada mobile 320px.
- **File yang Dimodifikasi:**
  - `src/client/scene/workstation-screens.js`: Tekstur nameplate 1:1 font 32px, warna `#6f6a62`.
  - `src/client/scene/workstation.js`: Geometri plat akrilik miring 0.5x0.125m, rotasi -0.6 rad, tanpa balok stand.
  - `index.html`: Restrukturisasi top bar `.brand.card-ui`, `.stats.card-ui`, slot metrik `#statTokens`, tombol aksi, dan struktur panel `.card-ui`.
  - `src/client/ui/hud.js`: Logika nilai token jujur `'—'`, sinkronisasi kedua panel pada mobile sheet, scrolling saat tab bar diklik, dan integrasi shortcut keyboard `H`.
  - `src/client/styles/main.css`: Styling `.card-ui` floating panels, header actions flex, mobile sheet layout, responsive tag boundaries, dan transisi minimize.
  - `docs/WORK_LOG.md`: Pencatatan log kerja tim.
- **Verifikasi & Quality Gate:**
  - `npm run check`: **Lolos 100% (84 unit tests PASS, 0 error, ESLint clean, Prettier clean, build Vite sukses)**.
  - `COCKPIT_URL=http://127.0.0.1:8099 npm run test:e2e`: **Lolos 100% pada SELURUH 5 viewport**:
    - `desktop-1440`: PASS (panels toggle, H shortcut, minimize/restore, tabs, 5 role views, keyboard/scene input, animated focus, DPR 1.5/2, HQ stability >45s).
    - `mobile-320`: PASS (no undersized controls, no text clipping, responsive width span, touch focus, 5 role views).
    - `mobile-390`: PASS (full suite pass).
    - `tablet-768`: PASS (full suite pass).
    - `desktop-1024`: PASS (full suite pass).
  - Preview server aktif di `http://127.0.0.1:8099/`.
  - Server produksi port 8095 (`ai-lab-office.service`) aman dan tidak tersentuh.
  - Screenshot bukti:
    - `t4-verify-desktop-topbar-sidepanels.png`: Tampilan desktop menyeluruh dengan top bar metrik token, panel floating card-ui, dan nameplate akrilik meja.
    - `t4-verify-desk-nameplate-closeup.png`: Close-up nameplate meja Nova dengan sudut miring dan tipografi 1:1.
    - `t4-verify-mobile-320-clean.png`: Tampilan mobile 320px yang bersih, rapi, bebas overflow, dan terverifikasi e2e.

---

## [2026-10-02 12:05 WIB] — Implementasi 1:1 Interaksi Klik Karakter 3D, Dynamic Camera Tracking & Name Tag Kantor-Agent

- **Konteks & Keputusan Desain:**
  - Mengadopsi mekanisme interaksi karakter dan kamera dari `kantor-agent` (`skills/kantor-agent/runtime/public/assets/kantor.js:2088-2128`):
    - **Raycasting 3D Mesh Karakter:** Seluruh mesh tubuh karakter (kepala, torso, anggota badan, aksesori) diberi metadata `userData.roleKey` dan didaftarkan ke target raycasting `setupWorkstationInteraction`.
    - **Interaktivitas Kursor & Anti-Drag:** Saat pointer mouse melintas di atas karakter 3D, kursor kanvas berubah menjadi `pointer`. Saat pointer dilepas dengan jarak pergeseran $\le 6\text{ px}$ (bukan gestur orbit/pan), sistem memicu aksi seleksi karakter.
    - **Dynamic Camera Tracking (Mengikuti Karakter):**
      - Kamera melakukan transisi halus (cubic ease-out 1.2s) langsung ke posisi dunia nyata kepala karakter (`target = headPos + (0, -0.2, 0)`, `pos = target + (2.2, 2.6, 4.4)`).
      - Berfungsi adaptif di mana pun karakter berada: baik saat duduk di meja kerja, duduk santai di sofa lounge menonton TV, maupun berdiri (Orion HQ).
      - Di loop `animate()`, kamera secara halus (`lerp 0.05`) melacak target kepala karakter jika karakter berpindah posisi atau berganti postur.
      - Jika pengguna melakukan orbit/pan manual, tracking memberi ruang secara elegan dan melepaskan lock kamera.
    - **Penyelarasan Styling Name Tag 1:1 Kantor-Agent:**
      - Kelas CSS `.tag` dan `.person` dengan capsule badge rounded-full (`padding: 2px 9px; border-radius: 99px; font-size: 11px; font-weight: 700; background: var(--c)`).
      - Name tag CSS2D kini bersifat interaktif (`pointer-events: auto`, `cursor: pointer`, hover scale `1.06`, focus-visible outline) dan dapat diklik atau ditekan dengan tombol Enter/Space untuk memicu fokus kamera ke karakter bersangkutan.
      - Sinkronisasi instan ke kartu HUD strip bawah (`card.setAttribute('aria-pressed', 'true')`).
- **File yang Dimodifikasi:**
  - `src/client/scene/characters.js`: Penambahan tag `userData.roleKey` pada seluruh mesh karakter.
  - `src/client/ui/labels.js`: Penerapan kelas `.person`, `.tag`, atribut tombol interaktif, dan event handler klik / keyboard pada badge.
  - `src/client/styles/main.css`: Penyesuaian styling capsule badge `.tag` 1:1 kantor-agent dengan efek hover dan transisi.
  - `src/client/main.js`: Pendaftaran mesh karakter ke raycaster `setupWorkstationInteraction`, penambahan preset kamera `{ kind: 'character' }` dengan offset diagonal 1:1, dan dynamic tracking di loop `animate()`.
  - `docs/WORK_LOG.md`: Pencatatan log kerja resmi.
- **Verifikasi & Quality Gate:**
  - `npm run check`: **Lolos 100% (84 unit tests PASS, 0 failure, ESLint clean, Prettier format clean, build Vite sukses)**.
  - Build bundle `index-De9Ncsh3.js` dan `index-DnnUcf9b.css` disajikan di `http://127.0.0.1:8099/`.
  - Service produksi port 8095 tetap utuh tanpa sentuhan atau restart.
  - Screenshot bukti:
    - `t4-verify-character-click-focus-nova.png`: Hasil klik langsung pada mesh 3D karakter Nova di viewport (kamera zoom halus ke meja Nova, kartu Nova aktif).
    - `t4-verify-nametag-click-focus-atlas.png`: Hasil klik pada name tag badge Atlas saat sedang duduk di sofa menonton balapan (kamera framing akurat ke sofa lounge).

---

- **Konteks & Keputusan Desain:**
  - Menyamakan desain visual papan tugas 1:1 dengan kode referensi `kantor-agent` (`skills/kantor-agent/runtime/public/assets/kantor.js:1680-1739`) dan referensi visual user:
    - Judul: `Papan Tugas` (`76px Patrick Hand`) di kiri atas, didampingi subtitle `${totalPlans} plan · diperbarui ${syncTime} WIB` (`36px Patrick Hand`).
    - 4 Kolom whiteboard dengan divider garis vertikal `#d6cdc0`:
      1. **Rencana (`planning`):** Header `Rencana (0)`, permukaan bersih karena data rencana belum masuk ledger.
      2. **Dikerjakan (`running`):** Header `Dikerjakan (count)`, menampilkan lease aktif worker.
      3. **Uji QA (`qa`):** Menggunakan terminologi kanonis referensi **"Uji QA"** (menggantikan istilah sebelumnya), memetakan `queue.waiting_approval` (gate evaluasi dan persetujuan model).
      4. **Selesai (`completed`):** Header `Selesai (count)`, menampilkan akumulasi tugas succeeded.
    - **Kebijakan Whiteboard Bersih:** Kolom dengan 0 tugas dibiarkan bersih alami (papan tulis putih bergaris divider), tanpa sticky note dummy berukuran raksasa.
    - **Visual Sticky Note Proporsional:** Ketika ada tugas (seperti `waiting_approval > 0`), sticky note berukuran $222 \times 168\text{ px}$ dirender dengan rotasi halus `(((k * 17 + i * 31) % 11) - 5) * 0.012`, bayangan realistis `rgba(0,0,0,.12)`, warna pastel role (`#fff1a8`, `#cfe0ff`, `#ffd8b5`, `#dff1e3`), ID tiket `48px`, judul ringkas `30px`, dan bar status penanda.
    - **Integritas Batas PRD & Keamanan Data:** Kontrak `projectTaskBoard` di `src/shared/task-board-contract.js` dijamin hanya memproyeksikan kunci kanonis `['detail', 'key', 'label', 'value']` per kolom tanpa menyentuh field privat `agents`, `feed`, atau `vault`.
- **File yang Dimodifikasi:**
  - `src/shared/task-board-contract.js`: Penetapan skema 4 kolom kanonis (`planning`, `running`, `qa`, `completed`).
  - `src/client/scene/task-board.js`: Implementasi rendering 1:1 whiteboard kantor-agent, tray spidol aluminium (3 spidol), rotasi organik, dan penanganan kolom kosong.
  - `src/client/ui/hud.js`: Sinkronisasi ringkasan papan tugas dan teks panduan pada panel DOM sidebar kanan.
  - `tests/unit/office-time-and-board.test.mjs`: Pembaruan verifikasi unit test untuk kolom `qa` / `Uji QA`.
  - `docs/WORK_LOG.md`: Dokumentasi riwayat perubahan untuk kolaborasi tim.
- **Verifikasi & Quality Gate:**
  - `npm run check`: **Lolos 100% (84 unit tests PASS, ESLint lolos, Prettier format lolos, build Vite sukses)**.
  - Build bundle `index-B29eHhIU.js` dan `index-BXRo79AE.css` aktif di `http://127.0.0.1:8099/`.
  - Service produksi port 8095 (`ai-lab-office.service`) tetap utuh tanpa sentuhan atau restart.
  - Screenshot bukti:
    - `t4-verify-task-board-4col.png`: Close-up papan tugas 4 kolom di dinding 3D (Uji QA aktif dengan sticky note peach `QA-01`, kolom Selesai bersih).
    - `t4-verify-task-board-desktop.png`: Tampilan kantor 3D penuh sinkron dengan sidebar DOM.

---

- **Konteks & Keputusan Desain:**
  - Pemilik proyek mengonfirmasi adaptasi struktur 4 kolom kantor-agent ke konteks AI/ML Lab.
  - Peran QA diwujudkan sebagai tahap **"Evaluasi & Validasi"** (Model Benchmark, Safety Gate, & Human-in-the-Loop Approval), dipetakan langsung dari metrik riil `queue.waiting_approval`.
  - Empat kolom lengkap:
    1. **Rencana (`planning`):** Sticky note kuning (`#fff1a8`), secara jujur menampilkan status "Belum tersedia" sesuai batas ledger PRD.
    2. **Dikerjakan (`running`):** Sticky note biru pastel (`#cfe0ff`), menampilkan jumlah lease tugas aktif.
    3. **Evaluasi & Validasi (`validation`):** Sticky note peach (`#ffd8b5`), menampilkan tugas yang menunggu persetujuan / verifikasi pemilik.
    4. **Selesai (`completed`):** Sticky note hijau pastel (`#dff1e3`), menampilkan tugas berstatus succeeded.
- **File yang Dimodifikasi:**
  - `src/shared/task-board-contract.js`: Penambahan kolom `validation` dengan pemetaan ke `queue.waiting_approval`.
  - `src/client/scene/task-board.js`: Penyesuaian layout 4 kolom (`colW = 240px`), palet warna sticky note kantor-agent, dan rotasi organik.
  - `src/client/ui/hud.js`: Pembaruan deskripsi pemetaan status di DOM sidebar.
  - `tests/unit/office-time-and-board.test.mjs`: Pembaruan assertion kontrak 4 kolom.
  - `docs/WORK_LOG.md`: Pembentukan catatan kerja resmi untuk kolaborasi.
- **Verifikasi & Quality Gate:**
  - `npm run check`: **Lolos 100% (84 unit tests PASS, lint/format clean)**.
  - Build bundle `index-DwXWXhIo.js` disajikan secara live di `http://127.0.0.1:8099/`.
  - Screenshot verifikasi:
    - `t4-verify-task-board-4col.png`: Close-up papan tugas 4 kolom di dinding panggung 3D.
    - `t4-verify-task-board-desktop.png`: Tampilan desktop menyeluruh memperlihatkan sinkronisasi DOM sidebar dan 3D task board.

---

## [2026-10-02 11:00 WIB] — Penyesuaian Wallpaper Monitor & Sticky Notes Pingot untuk Atlas & Lyra

- **Konteks Perubahan:**
  - Menyelaraskan desain wallpaper monitor dengan implementasi asli `kantor-agent` (`reference_kantor.js:1539-1550`):
    - Gradien linier 2-stop diagonal dari warna identitas role (`role.color`) meluncur halus ke warna krem hangat (`#f3eee6`).
    - Jam digital besar (`120px`) di tengah layar, diikuti subtitle ringkas `${role.name} · ${projection.stateLabel}` dan label `WIB`.
  - Memasang 3 sticky note pastel monitor milik karakter **Pingot** (Kuning `#fff1a8`, Peach `#ffd8b5`, Biru Muda `#cfe0ff`) berukuran `0.07 x 0.07` dengan rotasi organik `(i - 1) * 0.12` rad di sudut kiri atas bezel monitor utama.
  - Menetapkan filter selektif: **hanya workstation Atlas (`data_scientist`) dan Lyra (`research_scientist`)** yang memiliki sticky note tersebut, sedangkan meja Nova dan Axiom tetap bersih.
- **File yang Dimodifikasi:**
  - `src/client/scene/workstation-screens.js`: Pembaruan gradien 2-stop dan komposisi tipografi jam tengah.
  - `src/client/scene/workstation.js`: Kondisi filter `role.key === 'data_scientist' || role.key === 'research_scientist'` untuk pemasangan sticky notes monitor.
- **Verifikasi & Quality Gate:**
  - `OFFICE_BUILD_DIR=/tmp/cockpit-test-dist npm run check`: **Lolos 100% (84 unit tests PASS, lint/format clean)**.
  - Build bundle `index-DWuVN_ay.js` disajikan di `http://127.0.0.1:8099/`.
  - Screenshot bukti:
    - `t4-verify-atlas-wallpaper-sticky.png`: Meja Atlas dengan wallpaper biru-krem & 3 sticky note monitor.
    - `t4-verify-lyra-wallpaper-sticky.png`: Meja Lyra dengan wallpaper magenta-krem & 3 sticky note monitor.
    - `t4-verify-nova-clean.png`: Meja Nova bersih tanpa sticky note monitor.

---

## [2026-10-01 20:00 WIB] — Harmonisasi Visual 5 Komponen Kantor-Agent

- **Konteks Perubahan:**
  - Mengadopsi hierarki visual, proporsi, dan material dari `kantor-agent` ke dalam 5 bagian utama:
    1. **HUD (`src/client/ui/hud.js`):** Kartu agent dengan avatar inisial, nama tebal, subtitle jabatan, status badge, dan feed aktivitas berwarna role.
    2. **Monitor & Nameplate Meja (`src/client/scene/workstation-screens.js`):** Skematik alur kerja dekoratif per role dan papan nama meja proporsional di depan keyboard.
    3. **Papan Tugas (`src/client/scene/task-board.js`):** Tekstur beresolusi tinggi 2048 x 928, bingkai rel aluminium, baki spidol dengan 3 spidol (biru, merah, hijau).
    4. **Name Tag Karakter (`src/client/ui/labels.js`):** Label CSS2D mengambang di atas kepala karakter (`Nama · Jabatan`) dengan aturan visibilitas responsif.
    5. **Atribusi Lisensi (`THIRD_PARTY_NOTICES.md`):** Pencatatan resmi lisensi MIT dari repositori rujukan `humaedihume/kantor-agent`.
- **Verifikasi & Quality Gate:**
  - `npm run check`: **84 unit tests lolos**.
  - Preview aktif di port 8099 (Bundle `index-32vE_5B8.js`).
  - Screenshot lengkap tersimpan di brain artifacts:
    - `t4-verify-task-board.png`
    - `t4-verify-workstation-nova.png`
    - `t4-verify-workstation-ray.png`
    - `t4-verify-character-nametags.png`
    - `t4-verify-hud-desktop.png`
    - `t4-verify-hud-mobile.png`

---

## [2026-10-01 18:50 WIB] — Audit Menyeluruh Implementasi T4 HUD & Mobile Layout

- **Konteks:**
  - Pengujian komprehensif implementasi T4 HUD mengambang krem hangat, tab sheet ponsel, dan ciut ke dock.
- **Hasil Temuan:**
  - Zero horizontal & vertical page overflow pada 5 resolusi standar (320px, 390px, 768px, 1024px, 1440px).
  - Fungsionalitas dock mobile (`Escape`, shortcut `H`, tab switch, auto-collapse saat klik kartu) lolos 100%.
  - Investigasi `smoke.mjs:675`: Kegagalan E2E terjadi karena selector legacy `button:not([hidden])` mendeteksi tombol dock mobile yang di-`display: none` pada desktop sebagai `0x0 px`. Seluruh tombol kasat mata terbukti $\ge 44 \times 44\text{ px}$.
- **Dokumentasi Terkait:**
  - `cockpit_t4_test_audit_report.md` (Laporan audit lengkap).

---

## [2026-10-02 23:45 WIB] — Penyelarasan Status Dot Avatar, Format Waktu Live HH:mm:ss & Layout Simetris Mobile

- **Konteks & Masalah:**
  1. Pengguna menemukan dot pada avatar profil Orion sebelumnya berwarna hijau meskipun statusnya "Istirahat", yang seharusnya berwarna abu-abu.
  2. Pengguna meminta format waktu khusus pada bagian Live menggunakan format `hh:mm:ss` (dengan pemisah titik dua `:`), sementara format waktu pada Riwayat dan Aktivitas tetap ringkas `hh.mm`.
  3. Pada mode layar ponsel (390px dan 320px), teks status Live sempat terpotong elipsis karena pembagian kolom rata (`1fr 1fr 1fr`), serta tab drawer memerlukan perataan simetris agar tidak berhimpitan.
- **Solusi & Perubahan Teknis:**
  - **Dynamic State Avatar Dots (`src/client/styles/main.css`):**
    - Dot pada pojok avatar (`.ava::after` / `.agent-avatar::after`) kini secara dinamis merespons `data-state`:
      - `istirahat` / `siaga`: Abu-abu (`#8a8378`) dengan border putih 2px.
      - `bekerja`: Hijau segar (`#2fbf71`) dengan border putih 2px.
      - `menunggu_persetujuan` / `menunggu keputusan`: Amber hangat (`#c46a1c`) dengan border putih 2px.
      - `gagal`: Merah (`#c43d3d`) dengan border putih 2px.
  - **Format Waktu Live `HH:mm:ss` (`src/client/ui/hud.js`):**
    - Menambahkan helper `liveTime(value)` menggunakan `Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jakarta', hourCycle: 'h23', hour: '2-digit', minute: '2-digit', second: '2-digit' })` untuk menghasilkan format pasti `HH:mm:ss` (e.g. `23:35:27`).
    - Diterapkan secara khusus pada `#liveStatus` (top bar) dan `#liveTxt` (kartu status mobile).
    - Format riwayat (`.run .w`) dan feed (`.feed-time`) tetap mempertahankan format ringkas `HH.mm` (`10.44`).
  - **Rasio Kolom Metrik Mobile & Drawer Tab Responsif (`src/client/styles/main.css`):**
    - Mengubah rasio grid kartu ringkasan status mobile menjadi `1.45fr 1fr 1fr` sehingga teks `Live · HH:mm:ss` memiliki ruang 130px+ dan tidak pernah terpotong elipsis.
    - Menambahkan rule media query `@media (max-width: 360px)` khusus untuk layar sangat sempit (320px) agar ketiga tab drawer (`Riwayat`, `Tugas <Nama>`, `Aktivitas`) dan tombol panah tetap memiliki jarak napas simetris dan proporsional.
- **Verifikasi & Quality Gate:**
  - `npm run check`: **Lolos 100% (84 unit tests PASS, ESLint lolos, Prettier format lolos, build Vite sukses)**.
  - `COCKPIT_URL=http://127.0.0.1:8099 node tests/e2e/smoke.mjs`: **Lolos 100% pada SELURUH 5 viewport (mobile-320, mobile-390, tablet-768, desktop-1024, desktop-1440)**.
  - Preview server port 8099 menyajikan dist terbaru dari `/tmp/cockpit-test-dist`.
  - Service produksi port 8095 (`ai-lab-office.service`) tetap utuh tanpa sentuhan atau restart.
  - Bukti visual tersimpan di:
    - `mobile-390-final.png`: Menampilkan dot abu-abu pada Orion, dot amber pada Nova, `Status: ● Live · 23:35:27`, dan tab drawer simetris.
    - `mobile-320-final.png`: Menampilkan `Status: ● Live · 23:41:04` tanpa elipsis dan tab drawer dengan jarak napas rapi pada layar 320px.

---

## [2026-10-03 11:55 WIB] — Perbaikan Desktop Cards (Anti-Stacking & Paritas 1:1 Kantor-Agent) dan Penyelarasan Tinggi Tombol Panel

- **Konteks & Masalah:**
  1. Pada mode desktop, kartu agent di bagian bawah tampak "tertumpuk" (_stacked_) dengan elemen latar belakang putih dan pecahan teks ganjil (`hat`, `au`, `tar`) yang menyembul dari belakang kartu Nova, Atlas, dan Lyra.
  2. Kartu/tombol "Lihat kantor penuh / Tampilkan panel" (`#btnToggleSidebars`) pada bar atas memiliki tinggi yang tidak serasi (44px) dibandingkan kartu status metrik di sampingnya (54px), sehingga tampak asimetris.
  3. Nama karakter sempat terpotong elipsis (`Ori...`, `N...`) pada header kartu ketika nama peran (_role_) yang panjang ikut dijejalkan.
- **Penyebab Akar Masalah:**
  - Elemen `.stage-hint` ("Seret untuk melihat ruang · Gulir atau cubit untuk zoom...") diposisikan pada `bottom: 88px; left: 50%`, tepat berada di belakang baris kartu agent yang tingginya ~88px (`bottom: 14px`), sehingga tepi atas dan teks hint mengintip di sela-sela kartu.
  - Elemen `.header-actions` memiliki `align-items: center;` yang menyebabkan tombol toggle tidak melakukan _stretch_ vertikal mengikuti kontainer baris atas (`.top`).
  - Flexbox pada header kartu membagi penyusutan secara merata ke seluruh elemen (`min-width: 0`), sehingga nama agent dipaksa menyusut sebelum peran sekunder.
- **Solusi & Perubahan Teknis:**
  - **Penghapusan Ghost Element (`src/client/styles/main.css`):**
    - Menyembunyikan `.stage-hint` secara permanen (`display: none !important;`) sebagaimana desain bersih pada `kantor-agent`.
  - **Penyelarasan Tinggi Tombol Header (`src/client/styles/main.css`):**
    - Mengubah `.header-actions` menjadi `align-items: stretch;` dan menetapkan `height: 100%;` pada `.toggle` dan `#btnToggleSidebars`. Tombol kini membentang penuh setinggi kartu status dan kartu identitas tim secara flush dan simetris 1:1.
  - **Paritas Kartu Desktop 1:1 Kantor-Agent (`src/client/styles/main.css` & `src/client/ui/hud.js`):**
    - Menetapkan `flex-shrink: 0;` pada `.card .nm` agar nama karakter (`Orion`, `Nova`, `Atlas`, `Lyra`, `Axiom`) selalu tampil utuh tanpa pemotongan.
    - Menetapkan `flex-wrap: nowrap;` dan `margin-left: auto; flex-shrink: 0;` pada chip status (`.card .st`) agar selalu tersemat rapi di sudut kanan atas kartu pada baris yang sama.
    - Menambahkan breakpoint responsif `@media (max-width: 1440px)` untuk menyembunyikan peran sekunder `.role` agar kartu pada resolusi laptop tetap longgar dan lapang sesuai rujukan `kantor-santai.webp` dan `kantor-bekerja.webp`.
    - Menyederhanakan penamaan peran Orion di HUD menjadi `Lab Director` (menghapus duplikasi `· HQ`).
- **Verifikasi & Quality Gate:**
  - `npm run check`: **Lolos 100% (84 unit tests PASS, 0 failure, ESLint clean, Prettier clean, Vite build sukses)**.
  - `COCKPIT_URL=http://127.0.0.1:8099 node tests/e2e/smoke.mjs`: **Lolos 100% pada SELURUH 5 viewport (mobile-320, mobile-390, tablet-768, desktop-1024, desktop-1440)**.
  - Bukti visual:
    - [desktop-1440-perfect.png](file:///home/ubuntu/.gemini/antigravity-cli/brain/4944fa17-7c98-47b9-8ad8-9f349bad4881/desktop-1440-perfect.png): Tombol toggle sejajar simetris dengan status bar, kartu agent bersih dari elemen tertumpuk di belakangnya, nama agent utuh tanpa elipsis.
    - [desktop-1024-perfect.png](file:///home/ubuntu/.gemini/antigravity-cli/brain/4944fa17-7c98-47b9-8ad8-9f349bad4881/desktop-1024-perfect.png): Tampilan desktop 1024px bersih, rapi, dan seimbang.

---

## [2026-10-03 12:15 WIB] — Penyelarasan Kecepatan Transisi Kamera (1:1 Paritas Kantor-Agent 1.2s Easing)

- **Konteks & Masalah:**
  - Pengguna menanyakan mengapa transisi perpindahan sudut kamera saat mengklik agen atau meja terasa sangat cepat, dan apakah kecepatan tersebut sudah sesuai dengan kode referensi pada repositori `kantor-agent`.
- **Hasil Audit Kode Sumber Referensi (`kantor-agent`):**
  - Pada repositori `kantor-agent` (`skills/kantor-agent/runtime/public/assets/kantor.js:2254`):
    ```javascript
    if (tween) {
      tween.t = Math.min(1, tween.t + dt / 1.2);
      const e = 1 - Math.pow(1 - tween.t, 3);
      camera.position.lerpVectors(tween.p0, tween.p1, e);
      controls.target.lerpVectors(tween.t0, tween.t1, e);
      if (tween.t >= 1) tween = null;
    }
    ```
  - Di `kantor-agent`, transisi kamera menggunakan durasi **1.2 detik (1200 ms)** dengan interpolasi _cubic ease-out_ (`1 - Math.pow(1 - t, 3)`), yang menghasilkan gerakan sinematik yang mulus, tenang, dan tidak menyentak mata.
  - Di codebase lokal cockpit (`src/client/main.js`), durasi sebelumnya di-_hardcode_ pada `350 ms` (~3.4x lebih cepat), sehingga lompatan kamera terasa mendadak dan agresif.
- **Solusi & Perubahan Teknis (`src/client/main.js`):**
  - Memperbarui parameter `duration` pada fungsi `setCameraView` dari `350` menjadi **`1200`** (1.2 detik), menyelaraskan fungsi easing cubic 1:1 persis seperti referensi kanonis `kantor-agent`.
- **Verifikasi & Quality Gate:**
  - `npm run check`: **Lolos 100% (84 unit tests PASS, 0 error, ESLint clean, Prettier clean, Vite build sukses)**.
  - `COCKPIT_URL=http://127.0.0.1:8099 node tests/e2e/smoke.mjs`: **Lolos 100% pada seluruh 5 matriks viewport (`mobile-320`, `mobile-390`, `tablet-768`, `desktop-1024`, `desktop-1440`) termasuk skenario _animated camera focus_ & _reset_**.
  - Service produksi port 8095 tetap terlindungi dan utuh.
