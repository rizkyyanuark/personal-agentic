# Product requirements: AI Lab Cockpit

Integration amendment (2026-10-06): this package now renders the private
personal-agentic Organization Live Preview through authenticated Rust
`/api/cockpit/state`. The root integration strategy and `docs/architecture.md`
supersede the predecessor's public ledger API, task-state vocabulary, standalone
deployment, and systemd assumptions below. Existing visual requirements remain
references where compatible with the integrated user flow.

Card amendment (2026-10-07): the owner's Kantor Agent reference supersedes the
older illustrative card text below. Idle cards say Santai, terminal runs show
Selesai for 60 seconds, and cards keep the actual run outcome/runtime status.
The office title follows the selected workdir. Scene dialogue remains decorative.

## 1. Ringkasan produk

AI Lab Cockpit adalah kantor virtual 3D untuk memantau AI/ML Lab dari browser.
Target v3-nya adalah lima role Hermes: Orion, Nova, Atlas, Lyra, dan Axiom.
Produk ini menerjemahkan status ledger yang aman untuk dipublikasikan menjadi
ruang kerja yang mudah dipahami, tanpa memberi browser kemampuan untuk
menjalankan agent, menyetujui tindakan, membaca vault, atau melihat payload tugas.
Migrasi Hermes, proyeksi publik, dan scene harus lulus uji bersama sebelum lima
role dinyatakan aktif pada deployment. Perubahan kode parsial belum cukup.

Produk ini dipakai oleh satu pemilik lab yang bekerja dari beberapa perangkat.
Pengunjung lain hanya boleh melihat proyeksi publik yang sama jika domain belum
dilindungi oleh kontrol akses.

## 2. Masalah yang diselesaikan

Pemilik lab membutuhkan satu pandangan untuk menjawab empat pertanyaan:

1. Apakah sistem dapat membaca ledger saat ini?
2. Role mana yang bekerja, siaga, gagal, atau menunggu keputusan?
3. Bagaimana keadaan antrean secara keseluruhan?
4. Aktivitas aman apa yang baru saja terjadi?

Log terminal tetap menjadi sumber diagnostik. Cockpit tidak menggantikan log,
MLflow, JupyterLab, Hermes, atau kanal approval.

## 3. Tujuan

- Menampilkan kondisi lima role target dengan bahasa visual dan teks yang konsisten.
- Menjaga ruang 3D sebagai fokus utama tanpa menyembunyikan status operasional.
- Tetap berguna ketika WebGL gagal, ledger kosong, atau API tidak dapat dijangkau.
- Mengambil seluruh angka dan status dari sumber nyata yang telah diproyeksikan.
- Mempertahankan batas read-only antara domain publik dan runtime agent.
- Mendukung desktop, tablet, dan ponsel tanpa membuat implementasi terpisah.

## 4. Bukan tujuan

- Menjalankan prompt, worker, notebook, pipeline, deployment, atau Git operation.
- Memberikan approval dari browser.
- Menampilkan isi vault, tujuan tugas, input, output, checkpoint, atau credential.
- Menggantikan MLflow untuk eksperimen dan monitoring model.
- Menampilkan kegiatan suasana fiksi seolah merupakan aktivitas kerja nyata.
- Menjadi project manager umum atau dashboard untuk setiap layanan server.

## 5. Pengguna dan pekerjaan utama

### Pemilik AI Lab

- Membuka kantor dari browser dan memahami keadaan lab dalam beberapa detik.
- Menemukan role yang membutuhkan perhatian tanpa membaca semua log.
- Membedakan masalah koneksi, antrean kosong, agent gagal, dan approval tertunda.
- Berpindah dari ringkasan ke alat privat yang tepat ketika tindakan diperlukan.

### Pengunjung terbatas

- Melihat visualisasi publik tanpa menerima informasi project yang sensitif.
- Memahami bahwa kantor adalah proyeksi aktivitas, bukan agent interaktif.

## 6. Prinsip produk

1. Kebenaran lebih penting daripada kepadatan informasi.
2. Status teks tidak boleh bergantung pada warna atau animasi saja.
3. Ruang 3D memperjelas keadaan, bukan menjadi dekorasi yang menutupi data.
4. Data yang belum tersedia ditampilkan sebagai tidak tersedia, bukan diperkirakan.
5. Kegagalan sebagian tidak boleh menghasilkan ringkasan yang menyesatkan.
6. Kontrol yang tampak interaktif harus memiliki perilaku nyata.

## 7. Cakupan target v3

Bagian ini menyatakan target setelah migrasi, bukan keadaan deployment saat ini.
Catatan migrasi dan sumber data berada di `docs/architecture.md`.

### Ringkasan global

- Status koneksi ledger dan waktu sinkronisasi terakhir.
- Total tugas, tugas selesai, dan tugas menunggu keputusan.
- Ringkasan keadaan antrean.
- Papan empat kolom: Rencana, Dikerjakan, Uji QA, Selesai. Nama Uji QA
  dipertahankan atas pilihan pemilik; nilainya adalah `queue.waiting_approval`
  dan diberi keterangan antrean persetujuan, bukan hasil pengujian QA.
- Rencana bertanda Belum tersedia sampai ada sumber planning publik. Kolom
  dengan jumlah positif memakai satu sticky ringkasan agregat tanpa ID atau
  judul tugas buatan; jumlah nyata nol membiarkan kolom bersih.
- Layout metrik tetap memakai label Proporsi tugas selesai, Total tugas, dan
  Jam WIB. Proporsi memakai `totals.completed / totals.tasks` ketika snapshot
  segar dan total positif. Token bertanda Belum tersedia. Keadaan gagal atau
  offline tidak menghasilkan nol atau waktu sinkron contoh.

### Visualisasi role

- Lima role tetap dengan identitas visual yang konsisten: Orion, Nova, Atlas,
  Lyra, dan Axiom. Masing-masing memiliki satu karakter, label, dan kartu.
- Empat workstation dalam dua baris masing-masing dua dipakai oleh Nova, Atlas,
  Lyra, dan Axiom. Orion tidak punya meja. Area papan adalah titik kembali Orion
  ketika bekerja atau menunggu keputusan; saat siaga ia boleh berkeliling.
- Status bekerja memengaruhi pose atau gerak tanpa panggilan model tambahan.
- State API `siaga` ditampilkan sebagai Istirahat; ini berarti tidak ada tugas
  aktif pada role, bukan jadwal istirahat nyata. Subteks kartu mengikuti
  aktivitas visual lokal karakter saat ini, dengan penanda Suasana ilustratif,
  terpisah dari status dan tugas publik. Ini mengganti pilihan teks generik lama.
- Percakapan karakter berupa dialog lokal bergantian, bukan komunikasi model
  atau event ledger. Bubble kerja memakai informasi publik yang tersedia;
  ketika teks tugas hanya generik, tampil Bekerja dan uraian statis berlabel
  Deskripsi peran. Tidak ada rincian tugas privat yang dibuka untuk fitur ini.
- Nama kartu tetap utuh. Pill Menunggu mempertahankan arti Menunggu keputusan
  pada DOM/title/label aksesibilitas, tanpa mengganti state API. Bila satu header tidak muat, seluruh strip
  memakai baris status kedua yang sejajar dan tinggi kartu menyesuaikan.
  Bubble dibatasi dua pada desktop dan satu pada
  ponsel, dengan prioritas karakter terpilih atau status kerja. Kegiatan dasar
  didahulukan; game/gitar menyusul setelah gerak dan pose stabil.
- Kartu Nova, Atlas, Lyra, dan Axiom memfokuskan kamera ke meja asal, walaupun
  karakter sedang berkeliling. Kartu Orion menuju tengah ruang. Klik meja tetap
  menuju workstation.
- Klik tubuh atau name tag mengikuti lokasi karakter. Orbit atau pan manual
  melepaskan pelacakan; fokus kartu dan fokus karakter adalah dua perilaku
  berbeda.
- Vega dan Echo tidak menjadi karakter atau kartu v3. Tugas historisnya tetap
  dihitung dalam agregat dan event publik yang lolos sanitasi, tanpa diubah
  namanya menjadi salah satu dari lima role.

### Linimasa

- Maksimal 30 event publik terbaru.
- Event dipetakan ke kalimat umum di server.
- Teks mentah, payload tool, project, dan hasil kerja tidak diteruskan.

### Kondisi sistem

- Loading saat bootstrap.
- Empty ketika ledger dapat dibaca tetapi belum berisi tugas.
- Error ketika proyeksi ledger gagal.
- Offline ketika browser gagal mengambil API.
- Tampilan ringan ketika WebGL tidak tersedia.

## 8. Kontrak dan privasi

`src/shared/office-contract.js` adalah kontrak minimum antara server dan browser.
Penambahan field publik harus memenuhi semua syarat berikut:

1. Ada sumber kebenaran yang dapat disebutkan.
2. Field dibutuhkan untuk keputusan pengguna yang jelas.
3. Field tidak mengungkap project, prompt, hasil, credential, atau identitas worker.
4. Redaction dan bentuk payload dibuktikan oleh integration test.
5. UI memiliki loading, empty, error, dan stale behavior untuk field tersebut.

Runtime baru hanya boleh dibaca setelah operator menambahkannya secara eksplisit.
Scanning seluruh workspace tidak diizinkan.

Penyederhanaan role tidak mengizinkan penghapusan diam-diam tugas atau event
Vega/Echo dari ringkasan. Tugas yang masih aktif pada role lama harus ditangani
sebelum keduanya dinonaktifkan. Validasi dan rilis memerlukan gerbang milik host
yang terpisah dari kerja pembuat model dan tidak memberi browser hak eksekusi.
Gerbang tersebut adalah kebutuhan migrasi, bukan kemampuan yang sudah tersedia.

## 9. Persyaratan pengalaman

Arah visual, layout, motion, dan aturan Three.js berada di `DESIGN.md`. Sebuah
perubahan visual hanya diterima jika lolos `docs/visual-acceptance.md`.

Persyaratan inti:

- Ruang 3D menjadi focal point utama pada desktop dan ponsel, tanpa menutupi status operasional penting.
- Informasi penting tetap tersedia sebagai DOM, bukan hanya tekstur canvas.
- Semua kontrol terlihat memiliki target minimal 44 x 44 CSS pixel.
- Tidak ada horizontal overflow pada lebar yang didukung.
- `prefers-reduced-motion` mengurangi gerak non-esensial.
- Kamera selalu mempunyai jalur kembali ke sudut awal.
- Pemilik memilih reset tanpa tombol terlihat: klik ulang pilihan aktif,
  double-click canvas, atau Escape sesuai keadaan panel. Keterbatasan
  penemuan gestur dan akses sentuh tanpa tombol dicatat pada kebutuhan v3;
  pilihan ini tidak menjadi klaim kepatuhan aksesibilitas penuh.
- UI tetap terbaca tanpa WebGL.

## 10. Persyaratan teknis

- Browser memakai hasil build Vite, bukan source mentah.
- Three.js berasal dari dependency npm dan tidak disalin sebagai vendor tree.
- SQLite hanya dibaca oleh modul server.
- API tidak menyediakan endpoint mutasi.
- Sourcemap produksi tidak dipublikasikan.
- Renderer dibatasi pada device pixel ratio maksimum 2.
- Resize memperbarui renderer, camera aspect, dan label renderer.
- Resource baru harus mempunyai ownership dan disposal strategy yang jelas.
- Perubahan visual tidak boleh menambah model call atau token usage.

## 11. Acceptance criteria produk

Sebuah slice dinyatakan selesai ketika:

- Data yang ditampilkan dapat ditelusuri ke kontrak publik.
- Tidak ada field privat pada response `/api/state`.
- Setelah migrasi, lima kartu dan karakter memakai key role yang sama; empat
  workstation cocok dengan role selain Orion. Agregat historis tetap benar.
- Loading, empty, error, offline, dan fallback tetap dapat digunakan.
- Build, lint, format, unit test, dan integration test lulus.
- Browser test lulus pada 320, 390, 768, 1024, dan 1440 pixel.
- Screenshot yang berubah telah diperiksa, bukan hanya berhasil dibuat.
- Setiap kontrol diuji perilakunya dan tidak menghasilkan console error.

## 12. Keputusan produk yang membutuhkan approval pemilik

- Menambah informasi baru ke endpoint publik.
- Mengaktifkan autentikasi atau mengubah audiens domain.
- Menambah runtime atau project yang dibaca cockpit.
- Mengganti identitas visual, model karakter, atau tata ruang utama yang belum
  disepakati. Keputusan v3 yang sudah dikonfirmasi adalah lima karakter dan
  empat workstation dalam dua baris; detail implementasi tetap perlu review
  sesuai `docs/requirements/office-experience-v3-kantor-agent.md`.
- Menambah dependency produksi.
- Menginstal unit systemd baru, restart layanan, atau deployment.
- Menambahkan kemampuan menulis atau approval dalam bentuk apa pun.

## 13. Urutan pengembangan

1. Migrasikan role Hermes dan kontrak publik tanpa menyembunyikan catatan
   historis Vega/Echo; definisikan dan uji gerbang host sebelum role lama pensiun.
2. Pastikan kontrak data dan failure state benar.
3. Pastikan hierarchy DOM dan layout responsif benar.
4. Bangun komposisi ruang, kamera, dan interaksi utama.
5. Tambahkan detail visual yang mempunyai fungsi atau identitas.
6. Optimalkan render setelah profiling, bukan berdasarkan dugaan.
7. Deploy hanya setelah quality gate dan review pemilik.

## 14. Pertanyaan terbuka

- Apakah domain akan tetap publik atau dilindungi Cloudflare Access?
- Apakah runtime registry perlu mendukung lebih dari satu lab sekaligus?
- Apakah riwayat agregat dibutuhkan, atau snapshot dan linimasa sudah cukup?
- Perangkat mana yang menjadi reference device untuk performance budget final?
