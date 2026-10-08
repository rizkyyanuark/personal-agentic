# Visual acceptance checklist

Integration note (2026-10-06): run the package `test:e2e` command against the
real personal-agentic Rust service. The integrated suite checks nine viewport
sizes documented in `../../VERIFICATION.md`, including short portrait and
landscape. The integrated view preserves the original virtual-kantor design;
computed styles are compared against its untouched CSS. Camera controls retain their original behavior. Agent
identity uses Organization `position`, while `role` remains a description.
The original metrics include Token diproses, using stored usage with explicit
coverage and an em dash when no measurement is available. Ledger and systemd
assumptions in older reports describe the predecessor.

Gunakan checklist ini untuk setiap perubahan scene, layout, style, interaction,
motion, atau copy yang terlihat pengguna. Bukti harus berasal dari build, browser,
dan screenshot aktual. Jumlah lima karakter dan empat meja adalah target v3
setelah migrasi; pengujian slice sementara harus menyebut apa yang belum selesai.

## 1. Direction

- [ ] Perubahan sesuai `DESIGN.md` dan dial ENERGY 2, RHYTHM 2, MOTION 2.
- [ ] Alasan keputusan visual dapat ditulis dalam satu kalimat.
- [ ] Perubahan melayani hierarchy, identitas, readability, atau state yang nyata.
- [ ] Tidak ada angka atau aktivitas kerja buatan; obrolan dan kegiatan fiksi
      diberi label serta tidak disajikan sebagai event ledger.

## 2. Scene composition

- [ ] Sudut awal desktop memperlihatkan zona utama, termasuk lima karakter dan
      empat workstation dalam dua baris masing-masing dua; ponsel mengikuti framing dekat rujukan.
- [ ] Meeting di kiri, lounge di depan, pantry di kanan belakang, serta papan,
      jendela, dan bookshelf dapat dikenali tanpa menutup jalur jalan.
- [ ] Orion tidak memiliki meja; saat bekerja atau menunggu keputusan ia kembali
      ke area papan, dan saat siaga ia boleh berkeliling.
- [ ] Karakter dan workstation yang berubah tetap dapat dikenali.
- [ ] Tidak ada furniture atau label yang menutup focal point utama.
- [ ] Skala, pivot, dan posisi mengikuti koordinat scene yang kanonis.
- [ ] Kamera tidak menembus lantai, dinding, atau object besar.
- [ ] Sudut awal dapat dipulihkan setelah focus dan orbit.

## 3. Lighting dan material

- [ ] Arah cahaya, fill, dan shadow menghasilkan volume yang jelas.
- [ ] Tidak ada material yang overexposed atau tampak emissive tanpa alasan.
- [ ] Warna role sama pada scene, kartu, label, dan feed.
- [ ] Texture mempunyai color space dan filtering yang benar.
- [ ] Penambahan shadow, texture, atau effect mempunyai alasan dan hasil profiling.

## 4. Interaction

- [ ] Setiap tombol dan kartu yang terlihat mempunyai perilaku nyata.
- [ ] Empat kartu agent fokus ke meja asal walau karakter berkeliling; kartu
      Orion fokus ke tengah ruang; klik meja tetap menuju workstation.
- [ ] Klik tubuh atau name tag mengikuti karakter; orbit/pan melepas pelacakan.
      Transisi fokus normal memakai 1,2 detik cubic ease-out dan dipersingkat
      pada reduced motion.
- [ ] Reset camera mengembalikan position, target, dan selection state.
- [ ] Reset tanpa tombol terlihat bekerja lewat klik ulang pilihan aktif,
      double-click canvas, dan Escape; panel ponsel terbuka menangani Escape
      dahulu. Hasil sentuh dan keterbatasan penemuan gestur dicatat terpisah.
- [ ] Tab, Enter, Space, arrow key, dan Escape bekerja sesuai jenis control.
- [ ] Mouse dan touch menghasilkan hasil yang sepadan, dengan keterbatasan reset
      tanpa tombol dicatat sesuai pilihan pemilik.
- [ ] Tidak ada error atau failed request yang tidak dijelaskan di console.

## 5. States

- [ ] Loading dapat dipahami tanpa melihat canvas.
- [ ] Empty tidak terlihat seperti error.
- [ ] Error proyeksi berbeda dari offline browser.
- [ ] Stale worker tidak ditampilkan sebagai aktif.
- [ ] Waiting approval terlihat sebagai keadaan yang membutuhkan perhatian.
- [ ] Vega/Echo tidak muncul sebagai karakter atau kartu setelah migrasi, tetapi
      tugas historis tetap masuk agregat dan event publik yang lolos sanitasi.
- [ ] Suasana fiksi berlabel tidak menyaru sebagai event ledger, berhenti saat
      data tidak segar, dan reduced motion menghentikan gerak berulang.
- [ ] Fallback WebGL mempertahankan status dan navigasi utama.
- [ ] Papan memiliki Rencana, Dikerjakan, Uji QA, dan Selesai. Rencana
      bertanda Belum tersedia sampai ada sumber planning publik; queued bukan planning.
- [ ] Uji QA membaca waiting_approval dengan keterangan terlihat bahwa ini
      antrean persetujuan, bukan bukti QA lulus/gagal atau hasil validasi.
- [ ] Angka Dikerjakan, Uji QA, dan Selesai berasal dari snapshot publik yang segar;
      stale atau offline tidak mempertahankan angka lama sebagai status live.
- [ ] Kolom dengan jumlah positif hanya memiliki satu sticky ringkasan tanpa
      ID/judul tugas buatan; nol nyata dan Rencana tanpa sumber tetap bersih.
- [ ] Waktu pembaruan papan berasal dari sinkron nyata; tidak ada waktu contoh.
- [ ] State siaga ditampilkan sebagai Santai. Run yang baru berakhir menampilkan
      Selesai selama 60 detik; hasil sebenarnya tetap terbaca pada kartu/riwayat.
      Kartu memakai fakta runtime/run, bukan teks kegiatan dekoratif.
- [ ] Judul mengikuti workdir dalam scope, berubah saat filter project berubah,
      dan tidak memilih sembarang folder ketika beberapa workdir terpasang.
- [ ] Dialog lokal bergantian sesuai aktivitas/lokasi, tanpa panggilan model
      atau penambahan event ledger. Perubahan status membatalkan balasan tertunda.
- [ ] Bubble kerja memakai informasi publik segar atau fallback Bekerja dan
      uraian role berlabel Deskripsi peran; event lama bukan tugas aktif.
      Menunggu keputusan tidak ditampilkan seolah sedang bekerja.
- [ ] Error/offline/stale membersihkan bubble dan narasi aktif. Reduced motion
      menghentikan dialog berulang tetapi pembaruan status tetap berjalan.
- [ ] Kegiatan dasar berjalan, sofa/TV-balapan, kopi, membaca, dan interaksi
      meeting diperiksa sebelum game/gitar masuk tahap lanjutan.
- [ ] Metrik memakai label Proporsi tugas selesai (completed/tasks), Total tugas
      (totals.tasks), dan Jam WIB (jam perangkat). Token bertanda Belum tersedia.
      Loading/error/offline tidak menjadi nol; total nol tidak menjadi 0%.

## 6. Responsive dan accessibility

- [ ] 320 x 760 lulus tanpa page overflow horizontal; scene tetap di belakang HUD dan panel bawah dapat dibuka serta diciutkan.
- [ ] 390 x 844 lulus tanpa overflow halaman; tepi scene boleh keluar frame sesuai rujukan, dan zona tetap dapat dicapai lewat fokus dan panel DOM.
- [ ] 768 x 1024 mempertahankan hierarchy dan urutan konten.
- [ ] 1024 x 768 menjaga scene serta panel dapat digunakan.
- [ ] 1440 x 900 tidak menghasilkan ruang kosong atau scale yang berlebihan; header, panel sisi, dan strip kartu role tidak menutup objek penting.
- [ ] HUD memakai permukaan krem hangat dan aksen role kanonis; metrik, koneksi, perhatian, dan kontrol tetap terlihat atau mudah dicapai.
- [ ] Desktop memiliki panel Aktivitas kiri serta tab Riwayat dan `Tugas <Nama>`
      di kanan. Layar sempit menambahkan tab Aktivitas pada panel bawah dan
      menyembunyikan panel kiri; header ponsel tidak memiliki toggle utama.
- [ ] Nama kartu utuh; jabatan tetap tersedia dalam DOM ketika disembunyikan
      pada ruang sempit. Dot status mengikuti state API, bukan warna role.
- [ ] Bila satu header tidak muat, pill seluruh strip turun ke baris kedua
      yang sama; status, tugas, dan aktivitas sejajar pada semua kartu.
      Nama/label pill tetap
      utuh dan tinggi adaptif tidak memotong subteks. Periksa resize bertahap,
      zoom teks, dan status panjang, bukan hanya lima lebar screenshot.
- [ ] Pill Menunggu memakai font status sistem rujukan, bukan monospace; arti
      Menunggu keputusan tetap terbaca melalui title dan nama aksesibilitas
      kartu. Status API tidak diubah menjadi label status demo referensi.
- [ ] Maksimal dua bubble pada desktop dan satu pada ponsel, termasuk bubble
      kerja/dialog/event. Prioritas karakter terpilih atau status kerja berlaku;
      bubble tetap di area terbaca, tidak menutup HUD/name tag, dan rincian ada
      di DOM. Kuota tidak menghitung name tag atau pill kartu.
- [ ] Wallpaper memakai gradien diagonal warna role ke krem; sticky monitor
      hanya pada Atlas dan Lyra, sedangkan Nova dan Axiom tetap bersih.
- [ ] Pada ponsel, panel bawah dan dock menampilkan data yang sama; tombol buka/ciut, Escape, aria-expanded, serta pemulihan fokus bekerja.
- [ ] Panel awal/masuk mobile terbuka meski desktop sebelumnya tersembunyi;
      klik kartu/H/Escape meninggalkan dock dengan tiga tab dan tombol buka.
      Tab membuka panel kembali. Resize 1440 ke 820/507/390/320 dan kembali
      memulihkan preferensi desktop tanpa membuat panel mobile hilang.
- [ ] Carousel menggulir horizontal dan panel menggulir vertikal tanpa mengunci gestur seluruh halaman; safe area serta zoom teks tidak menutup kontrol.
- [ ] Semua control yang terlihat minimal 44 x 44 CSS pixel.
- [ ] Focus indicator terlihat dan urutan keyboard masuk akal.
- [ ] Text memenuhi kontras WCAG AA.
- [ ] Status tidak bergantung pada warna atau motion saja.
- [ ] Reduced motion menghilangkan gerak non-esensial.

Pilihan pemilik tentang reset tanpa tombol terlihat dicatat sebagai pengecualian
akses reset. Target 44 x 44, keberhasilan smoke test, atau pengecualian ini tidak
menjadi bukti kepatuhan WCAG penuh. Handoff menyebut dampak akses sentuh dan
penemuan gestur secara eksplisit.

## 7. Performance hygiene

- [ ] Tidak ada render loop kedua yang tidak diperlukan.
- [ ] Tidak ada geometry, material, atau texture yang dibuat ulang per frame.
- [ ] Resource baru mempunyai lifecycle dan disposal yang jelas.
- [ ] Device pixel ratio tetap dibatasi.
- [ ] Penambahan draw call atau asset besar telah diperiksa dampaknya.
- [ ] Tidak ada model call atau token usage untuk animasi browser.

## 8. Required evidence

Catat hasil berikut pada handoff:

```text
npm run check: PASS/FAIL
npm run test:e2e: PASS/FAIL
Console errors: none/list
Controls tested: list action and result
Viewports inspected: 320, 390, 768, 1024, 1440
Screenshots inspected: list paths
Known uncertainty: none/list
```

Perubahan dengan satu hasil FAIL belum siap dikirim atau di-deploy.
