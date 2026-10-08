# Handoff: resume tab/browser dan bootstrap acak

Tanggal: 4 Oktober 2026 (WIB).
Status: source diperbarui; pengujian oleh kolega, acceptance belum diberikan.
Target: preview lokal `http://127.0.0.1:8099/`, bukan produksi.

Pemilik menyetujui posisi/rute dilanjutkan setelah API tersinkron ketika
kembali ke tab/browser, serta lokasi awal siaga diacak saat refresh.
Mandat berikutnya mengizinkan build dan pembaruan preview 8099 supaya hasil
dapat dilihat langsung. Batas pada [ADR 0013](../decisions/0013-page-bootstrap-and-foreground-resume.md).

## Yang berubah

- Seed baru per halaman, stabil selama halaman hidup. Bootstrap satu kali
  hanya untuk karakter siaga pada snapshot pertama yang segar/terlihat,
  memakai lokasi santai unik, pose/kursi/reservasi konsisten dan jeda awal
  38 sampai 72 detik. Bootstrap tidak menambah arrival ID.
- Bekerja/menunggu tetap di anchor operasional. Data loading/error/offline/
  stale tidak memulai bootstrap. Reduced motion awal tetap di anchor dan
  tidak memicu teleport setelah preferensi berubah.
- Visibility, BFCache, focus dan online memakai wake bersama: snapshot baru
  diminta, respons lama diisolasi, event bertumpuk dikoaleskan. Tidak ada
  scene/controller baru. Posisi, fase/rute dan sisa jeda siaga yang tidak
  berganti status dipertahankan. Kehilangan fakta operasional akibat offline
  tetap diperlakukan sebagai perubahan status, bukan janji dwell persisten.
- Header Menyinkronkan dan waktu sinkron terakhir yang nyata membedakan wake
  dari Live. Error/offline/sesi kedaluwarsa tetap menutup gate secara jelas.
- Delta gerak, jadwal aktivitas dan dialog dibatasi 0,25 detik per frame;
  suspensi browser tidak mempercepat gerak. Jam WIB tetap waktu perangkat.

Source aplikasi: `main.js`, `state-client.js`, `character-activity.js`,
`office-presentation.js`, dan `hud.js`. Regresi unit baru ditulis untuk
bootstrap/seed/gate, semua fase gerak, sisa dwell, wake/timer/response ownership,
serta status sinkronisasi. Fixture rute historis memakai seed/home bootstrap
eksplisit; assertion posisi, speed, floor dan reduced motion tidak dilonggarkan.

Tidak ada perubahan desain kartu/pill, HUD layout, style bubble, ruangan,
rig, kamera, wallpaper, role, API publik, ledger, dependency atau worker.
Tidak ada persistence browser atau simulasi kantor bersama di server.

## Arahan pengujian kolega

Jangan mengubah kode/assertion untuk mendapat hasil hijau, menulis ledger,
menjalankan model/worker, membaca vault, atau restart/deploy produksi.

1. Pastikan browser benar-benar memuat aset build baru di 8099. Simpan URL,
   nama JS/CSS, SHA-256, browser, viewport, DPR dan waktu run. Bundle lama
   `index-DNTBnLCO.js` dari preview sebelumnya masih mengandung reset pose
   legacy; hasilnya bukan bukti untuk source baru.
2. Jalankan check dengan build terisolasi, supaya QA tidak menimpa preview:

   ```bash
   cd /home/ubuntu/infra-hub/ai-lab-cockpit
   TAB_RESUME_QA_BUILD_DIR="$(mktemp -d /tmp/cockpit-tab-resume-qa.XXXXXX)"
   OFFICE_BUILD_DIR="$TAB_RESUME_QA_BUILD_DIR" npm run check
   COCKPIT_URL=http://127.0.0.1:8099 node tests/e2e/motion.mjs
   COCKPIT_URL=http://127.0.0.1:8099 npm run test:e2e
   ```

   Simpan output mentah/exit code masing-masing. Check memakai `&&`; bila
   berhenti sebelum build, jangan menyebut build QA lulus. Assertion reduced
   motion tetap lima home anchor. Suite seating/office-experience historis
   tidak otomatis dijalankan smoke; sebut coverage aktual.

3. Mode gerak biasa: reload beberapa kali dengan API segar. Siaga mengambil
   lokasi terdaftar yang unik; bekerja/menunggu tetap di anchor. Acak dapat
   kebetulan sama pada dua reload, jadi jangan mensyaratkan setiap pasangan
   berbeda. Seed tetap dapat direproduksi melalui unit fixture baru.
4. Pindah tab dan alt-tab ke browser lain secara native selama 5/30/120 detik.
   Catat blur/focus/visibilitychange/pagehide/pageshow, timestamp dan
   visibilityState. Hidden membekukan root/heading; alt-tab dapat tetap
   visible dan gerak boleh berlanjut. Fokus kembali mengambil snapshot baru
   tanpa reset. Synthetic event saja bukan bukti perilaku browser native.
5. Ulangi saat undocking, walking, arriving, sitting dan recovery. Rekam
   root/heading/phase/destinationId/arrivalId dan timestamp request/response.
   Menyinkronkan terlihat sebelum response baru; setelah sah rute lanjut
   tanpa teleport, kedatangan ganda atau pengacakan ulang. Uji BFCache bila
   tersedia; laporkan bila browser tidak memakainya.
6. Hide/show berulang pada karakter diam tidak selalu memulai dwell dari
   awal. Waktu hidden tidak dihitung. Bedakan jeda normal 38 sampai 72 detik
   dari stuck dengan trace fase dan beberapa polling, bukan screenshot saja.
7. Request tertunda, offline/error, queue.stale positif, reduced motion dan
   online: status/gate harus cocok. Tidak ada suasana baru saat gate tertutup;
   reconnect/resume tidak melakukan bootstrap lagi. Fixture API hanya GET
   publik terintersep, bukan perubahan ledger atau pemindahan root live.
8. Dialog berlabel tetap bergantian dengan balasan sekitar 2,3 detik, batas
   dua bubble desktop/satu mobile dan detail DOM. Hidden/stale/reduced motion
   membatalkan balasan lama; bootstrap/resume bukan arrival atau quip baru.
9. Lengkapi bukti retry/dialog yang kurang pada laporan sebelumnya. Bedakan
   blocker fixture unit dari reproduksi browser, serta buktikan karakter
   ketiga maju saat satu waiting-route sebelum mengklaim bebas starvation.
10. Periksa lima viewport dan screenshot sesuai `docs/visual-acceptance.md`:
    kartu/pill, panel/dock, nama, fokus/reset, wallpaper/papan, sol world-space,
    serta console. Perubahan behavior tidak mengizinkan perubahan desain.

Simpan hasil di `docs/reports/2026-10-04-tab-resume-bootstrap-qa.md`, tanpa
menimpa laporan historis. Isi PASS / FAIL / BELUM TERBUKTI per skenario,
expected/actual, log/exit code, build/hash aktual, trace lifecycle/API/posisi,
screenshot/video dan kasus yang tidak mencapai eksekusi.

## Status verifikasi dan instalasi

Codex tidak menjalankan `npm run check`, lint, format-check, unit, E2E,
browser, screenshot atau benchmark sesuai mandat pemilik. Formatting dan
build frontend dilakukan untuk memasang preview; bukan bukti runtime gerak
lulus. Gate visual/antislop belum terverifikasi runtime. Acceptance tetap
menunggu QA kolega dan review pemilik; produksi tidak termasuk mandat ini.

### Preview 8099 sudah diperbarui

Build terisolasi:

```bash
OFFICE_BUILD_DIR=/tmp/cockpit-tab-resume-preview.WjzTQU npm run build
```

Exit code 0, 44 module ditransformasi, 4,48 detik. Vite masih memberi warning
chunk lebih besar dari 500 kB; JS 953,05 kB sebelum gzip. Ini bukan hasil check
atau pengukuran frame rate.

- JS baru: `/assets/index-2org-RKh.js`, SHA-256
  `64de6fea82d1b15d074d95873b0a04133b7ad297abc15a6e32635a6f717d7259`.
- CSS tetap `/assets/index-BSYsN6zk.css`, SHA-256
  `af1e3bd228738e7ed4a83c996c482c8996df566544dea92759589d862c4c7409`.
- HTML baru SHA-256
  `97d2c4327ff8a60beed8a1d580b07ea1af0466994bb03332d12933decddf400c`.
- Direktori serving: `/tmp/cockpit-test-dist`.
- Backup sebelum pemasangan:
  `/tmp/cockpit-8099-before-resume.yzAPmD/cockpit-test-dist`.

Aset build disalin terlebih dahulu tanpa menghapus hashed asset lama. HTML
baru di-rename atomik terakhir. GET `/` pada 8099 mengiklankan JS baru; hash
GET aset cocok dengan build terisolasi. Listener masih PID 560838, tanpa
restart. Tab yang sudah terbuka perlu refresh sekali untuk memuat bundle baru;
setelah itu pindah tab/browser tidak perlu refresh agar gerak lanjut.

Preview 8099 adalah proses manual milik Agy, bukan unit dev cockpit. Unit dev
terpisah memakai port 8098; template checked-in identik dengan unit terpasang
saat inspeksi, tanpa drift. Unit itu, code-server, Agy dan produksi 8095 tidak
direstart atau diubah. Tidak ada konfigurasi layanan yang diedit.

Rollback preview bila pemilik meminta cukup memulihkan HTML backup karena
aset lama tetap tersedia. Jangan menghapus direktori aset atau hasil kerja
lain. Backup terletak di `/tmp`, jadi bukan penyimpanan permanen lintas reboot.

Serving identity PASS berdasarkan build exit 0 dan GET/hash yang cocok.
Check, unit, E2E, browser/console, kontrol, lima viewport, screenshot serta
gate visual/antislop: BELUM DIUJI; milik kolega. Tidak ada klaim bahwa stuck
permanen sudah direproduksi atau semua kemungkinan penyebab telah diperbaiki.
