# ADR 0013: pengacakan awal halaman dan resume foreground

Tanggal: 4 Oktober 2026 (WIB).
Status: disetujui pemilik untuk implementasi lokal; menunggu QA kolega.

## Konteks

Pemilik melaporkan tampilan berhenti setelah berpindah browser lalu kembali,
serta karakter kembali ke meja setelah refresh. Inspeksi baca-saja menemukan
preview 8099 masih menyajikan bundle lama yang memanggil penulis pose legacy
saat gate ditutup. Source terbaru tidak lagi memiliki pemanggilan itu.
Screenshot diam sendiri tidak membuktikan penyebab stuck permanen.

Kode kantor-agent pada commit `ad92a7a473b3d0e769281d552cee74cbb4004a54`
mempertahankan instance karakter saat tab tersembunyi, melewati pekerjaan frame
hidden, membatasi langkah gerak ke 0,25 detik, dan memilih lokasi santai acak
dengan jeda 38 sampai 72 detik pada halaman baru. Posisi tidak dipersistenkan.
Polling hidden dan bootstrap sebelum API pada rujukan tidak memenuhi batas
freshness cockpit, sehingga tidak disalin secara utuh.

Pemilik mengonfirmasi pilihan sementara: pengacakan ulang saat refresh,
bukan dunia bersama berbasis server atau pemulihan dari storage browser.
Konfirmasi berikutnya menetapkan kembali ke tab/browser melanjutkan posisi
dan rute setelah API tersinkron, bukan mengacak ulang. Sequential-thinking
dipakai sebelum perubahan dan klarifikasi telah dijawab sebelum implementasi.

## Keputusan

- Satu controller aktivitas dipakai selama umur halaman, termasuk kembali
  dari BFCache. Visibility, focus, atau online tidak membuat ulang karakter.
- Halaman baru memakai seed sesi lokal baru. Seed stabil selama halaman hidup;
  QA dapat menginjeksi seed tetap tanpa mengubah field API atau menyimpan seed.
- Bootstrap penempatan dikonsumsi satu kali pada snapshot pertama yang segar
  dan terlihat. Hanya karakter `siaga` yang mengambil lokasi santai unik dan
  aman; bekerja/menunggu tetap di anchor operasional. Bootstrap bukan arrival.
- Reduced motion pada bootstrap mempertahankan anchor awal dan mengonsumsi
  kesempatan pengacakan. Menonaktifkannya kemudian tidak memindahkan root
  seketika. Data loading/error/offline/stale tidak memicu bootstrap.
- Kembali ke halaman meminta pembacaan publik baru melalui jalur wake bersama.
  Request/timer ganda dari event lifecycle yang berdekatan dikoaleskan, respons
  generasi lama diabaikan, dan gate hanya terbuka setelah response baru sah.
- Pause menyimpan root, heading, fase, akses fixture, dan rute. Resume siaga
  yang tidak berganti status/lokasi mempertahankan sisa jeda, bukan memulainya
  ulang. Recovery terhalang serta reservasi pada ADR 0012 tetap berlaku.
- Frame yang tertunda tidak mempercepat jadwal aktivitas/dialog: waktu
  foreground untuk gerak, dwell, dan dialog menggunakan delta maksimal
  0,25 detik. Jam WIB tetap memakai waktu perangkat, bukan clock animasi.
- Header menyatakan Menyinkronkan saat wake menunggu response, dengan waktu
  sinkron terakhir yang nyata. Hidden, error/offline, dan sesi kedaluwarsa
  dibedakan dari Live; penghentian gerak tidak disamarkan sebagai data segar.

## Batas dan penerimaan

Tidak ada perubahan layout, palette, kamera, rig, furnitur, wallpaper, style
bubble/name tag, identitas role, API publik, ledger, dependency, atau worker.
Tidak ada aktivitas persistensi, panggilan model, timer simulasi server,
restart layanan, maupun deployment produksi. Kantor tidak berjalan ketika
halaman tertutup; ini berbeda dari pilihan dunia bersama yang ditunda.

Pengujian, browser dan screenshot diserahkan kepada kolega atas instruksi
pemilik. Mandat berikutnya mengizinkan build dan pemasangan ke preview 8099
agar perubahan langsung terlihat. Build frontend exit 0, lalu aset dan HTML
preview diperbarui tanpa restart, dengan backup recoverable dan hashed asset
lama tetap tersedia. Serving identity dibuktikan lewat GET/hash, bukan QA
perilaku karakter. Acceptance dan deployment produksi tetap menunggu QA
serta persetujuan pemilik. Arahan dan identitas build ada pada
[handoff resume](../reports/2026-10-04-tab-resume-bootstrap-handoff.md).
