# Design direction: AI Lab Cockpit

## Design read

Kantor operasional untuk pemilik AI/ML Lab, memakai bahasa visual warm studio
isometrik yang tenang dan dapat dipercaya. Dial: ENERGY 2, RHYTHM 2, MOTION 2.

Dokumen ini adalah sumber arah visual. Ia tidak mengubah batas data, permission,
atau arsitektur yang ditetapkan PRD dan dokumen architecture.

Penyelarasan 3 Oktober 2026 mengikuti hasil kolaborasi dalam `docs/WORK_LOG.md`
dan jawaban klarifikasi pemilik. Preferensi yang dikonfirmasi serta pekerjaan
yang masih perlu diterapkan dicatat terpisah pada kebutuhan v3.

## Identitas

Cockpit harus terasa seperti ruang kerja yang benar-benar ditempati: hangat,
teratur, teknis, dan sedikit personal. Ia bukan game, dashboard enterprise
generik, atau showroom futuristik. Detail ruangan mendukung konteks kerja AI/ML,
sedangkan data operasional tetap menjadi alasan utama setiap elemen.

### Keputusan utama dan alasannya

- Warm studio dipakai agar sesi monitoring panjang tidak terasa agresif.
- Perspektif tiga perempat dipakai agar seluruh zona terbaca dalam satu frame.
- Panel putih hangat dipakai untuk memisahkan data DOM dari scene tanpa membuat
  keduanya terasa seperti dua produk berbeda.
- Warna role dipakai untuk identitas lintas label, kartu, dan feed, bukan untuk
  memberi status.
- Gerak suasana dibatasi pada agent siaga dengan data segar agar tidak menyerupai
  aktivitas kerja yang diklaim oleh ledger.
- Detail kantor dipilih berdasarkan fungsi ruang atau karakter lab, bukan untuk
  mengisi area kosong.

## Hierarki layar

Urutan perhatian pada desktop:

1. Ruang kerja 3D dan kondisi karakter.
2. Status koneksi serta approval yang membutuhkan perhatian.
3. Kartu role dan tugas publik terakhir.
4. Linimasa serta agregat antrean.
5. Kontrol kamera dan panel.

Hanya satu elemen yang boleh menjadi focal point pada satu waktu. Status gagal
atau menunggu keputusan dapat mengambil prioritas dari scene melalui teks dan
kontras yang jelas, tanpa glow atau animasi yang berlebihan.

## Komposisi ruang 3D

### Zona wajib

- Empat workstation dalam dua baris masing-masing dua meja untuk Nova, Atlas,
  Lyra, dan Axiom; mug, nameplate, dan wallpaper mengikuti identitas role.
- Orion tanpa meja, kembali ke area papan saat bekerja atau menunggu keputusan,
  dan boleh berkeliling saat siaga.
- Meeting di sisi kiri, lounge dan TV di depan, pantry menempel dekat dinding
  kanan belakang dengan celah fisik aman, serta bookshelf di sisi ruang.
- Jendela dan papan tugas empat kolom terlihat pada dinding belakang: Rencana,
  Dikerjakan, Uji QA, Selesai. Uji QA diberi keterangan bahwa jumlahnya berasal
  dari antrean persetujuan pemilik, bukan hasil QA. Rencana bertanda Belum
  tersedia sampai ada sumber planning.
- Papan mempertahankan bingkai aluminium, tray spidol, tulisan tangan, dan
  warna sticky rujukan. Maksimal satu sticky agregat per kolom bersumber yang
  jumlahnya positif; kolom nol atau tanpa sumber tetap bersih. Sticky tidak
  memakai ID tiket atau judul tugas buatan.

Setiap zona harus mempunyai jalur pandang dan ruang negatif yang cukup. Furniture
tidak boleh menutupi karakter utama dari sudut kamera awal.

### Skala dan koordinat

- Gunakan meter sebagai skala konseptual scene.
- Lantai menjadi referensi `y = 0`.
- Semua workstation mengikuti konfigurasi posisi kanonis.
- Furniture, karakter, dan kamera memakai anchor pada
  src/client/scene/office-layout.js; empat workstation memakai role selain Orion.
- Pivot karakter ditempatkan di lantai agar animasi dan navigasi konsisten.
- Ukuran object tidak diubah untuk menyelesaikan masalah kamera. Perbaiki kamera,
  composition, atau bounding volume pada tempat yang tepat.

## Kamera dan interaksi

- Sudut awal desktop memperlihatkan zona penting tanpa objek dominan terpotong. Di ponsel, framing dekat mengikuti commit rujukan dan tepi ruang boleh keluar frame; orbit, fokus, dan panel DOM tetap memberi akses ke semua zona.
- Orbit dibatasi agar kamera tidak masuk lantai, dinding, atau belakang set.
- Zoom memiliki batas minimum dan maksimum yang dapat dipulihkan.
- Kartu Nova, Atlas, Lyra, dan Axiom memfokuskan meja asal meski karakter
  sedang berkeliling; kartu Orion menuju tengah ruang tanpa workstation semu.
  Klik meja tetap memfokuskan workstation dan pilihan kartu memperbarui
  `aria-pressed`.
- Klik tubuh atau name tag memfokuskan dan mengikuti karakter; input orbit
  atau pan manual melepaskan pelacakan. Ini tidak mengubah tujuan kartu agent.
- Reset mengembalikan position, target, dan state selection tanpa tombol
  terlihat, sesuai pilihan pemilik. Jalurnya ialah klik ulang pilihan aktif,
  double-click canvas, atau Escape. Escape pada panel ponsel yang terbuka
  terlebih dahulu menciutkan panel. Penemuan gestur dan kesetaraan sentuh
  tanpa tombol merupakan keterbatasan yang harus dicatat, bukan dianggap
  telah memenuhi seluruh kebutuhan aksesibilitas.
- Scene tidak mengandalkan hover sebagai satu-satunya akses informasi.
- Input touch dan mouse menghasilkan perilaku yang sepadan, dengan pengecualian
  keterbatasan reset tanpa tombol yang dicatat di atas.

## Lighting

Lighting menyampaikan suasana siang yang lembut dan memperjelas bentuk.

- Satu key light menentukan arah bayangan.
- Ambient atau environment light mengisi sisi gelap tanpa meratakan volume.
- Bayangan hanya dipakai pada object yang membantu persepsi kedalaman.
- Shadow map tidak dinaikkan sebelum profiling membuktikan kebutuhan.
- Material tidak boleh terlihat menyala kecuali object memang emissive.
- Perubahan lighting diuji pada furniture terang, karakter gelap, dan sudut ruang.

## Material dan warna

### Material dunia

- Kayu: hangat, roughness tinggi, pantulan lembut.
- Dinding: netral hangat, matte, tidak putih murni.
- Metal: digunakan terbatas pada kaki meja, perangkat, dan struktur.
- Kain: roughness tinggi dengan warna yang tidak bersaing dengan label role.
- Layar: cukup terang untuk terbaca sebagai monitor tanpa menjadi sumber cahaya
  terbesar pada scene.

Material yang memakai texture wajib menentukan color space, wrapping, filtering,
dan alasan resolusinya. Texture yang tidak terlihat pada ukuran render normal
harus diperkecil atau dihapus.

### Warna role

Warna lima role target berasal dari `src/shared/office-contract.js` setelah
migrasi. Warna itu konsisten pada kartu, label, feed, mug, nameplate, dan
wallpaper workstation. Vega/Echo tetap nama role historis pada data lama,
bukan karakter atau palet baru. Status selalu memiliki label teks. Warna role
tidak boleh ditafsirkan sebagai berhasil atau gagal.

### Palette UI

Gunakan netral hangat sebagai basis, hijau gelap sebagai accent operasional, dan
warna role hanya pada identitas yang terkait. Hindari gradient dekoratif, neon,
glow, dan glassmorphism yang tidak mempunyai fungsi hierarchy.

## Typography dan copy

- Font sistem dengan stack CSS yang sama seperti rujukan dipakai untuk
  navigasi dan status; papan memakai fallback tulisan tangan lokal.
- Monospace hanya dipakai untuk angka atau waktu yang membutuhkan alignment.
- Label state API ialah `siaga` menjadi Santai, `bekerja` menjadi Bekerja,
  `menunggu_persetujuan` berarti Menunggu keputusan, dan `gagal` menjadi Gagal.
  Atas konfirmasi pemilik, pill kartu memakai `Menunggu`; title pill dan nama
  aksesibilitas kartu tetap memuat Menunggu keputusan. Ini label ringkas,
  bukan pemotongan atau perubahan status API.
  Santai berarti tidak ada tugas aktif. Sesuai arahan pemilik 7 Oktober 2026,
  kartu menampilkan Selesai selama 60 detik setelah run berakhir, kemudian
  kembali Santai. Hasil run, termasuk gagal atau terhenti, tetap terpisah.
  State API tidak diganti.
- Subteks kartu berasal dari status runtime atau hasil run terakhir, mengikuti
  pola Kantor Agent. Kartu tidak memakai aktivitas dekoratif sebagai status.
  Label Suasana ilustratif tetap dipakai pada dialog lokal scene.
- Judul kantor memakai nama folder workdir project terpilih atau workdir unik
  agent yang terpetakan dalam scope; beberapa workdir diberi label eksplisit.
- Live memakai format WIB `HH:mm:ss`; Riwayat dan Aktivitas memakai `HH.mm`.
  Nama kartu tampil utuh; jabatan boleh disembunyikan pada ruang sempit tetapi
  tetap tersedia dalam DOM. Orion memakai jabatan Lab Director.
- Nama di kiri dan pill status di kanan satu baris bila semua header muat.
  Ketika satu header tidak cukup, seluruh strip memakai baris status kedua
  yang sejajar; titik awal baris tugas dan aktivitas juga seragam.
  Tinggi kartu menyesuaikan. Status tidak dipotong,
  disembunyikan, atau dikecilkan untuk menyamarkan overflow. Perubahan tinggi
  tetap menjaga akses carousel, dock, dan scene.
- Metrik memakai label Proporsi tugas selesai, Total tugas, dan Jam WIB sesuai
  sumbernya. Token bertanda Belum tersedia. Tidak ada persentase roadmap,
  jumlah aktif, durasi sesi, atau waktu sinkron contoh dari data yang berbeda.
- Hindari jargon pemasaran, klaim performa, dan angka tanpa sumber.
- Label harus menjelaskan perilaku tombol, bukan bentuk icon.
- Detail internal agent tidak boleh disamarkan menjadi percakapan karakter.

## Motion

MOTION 2 berarti gerak karakter dan kamera terasa hidup tanpa menggeser fokus
utama dari status operasional.

- Agent bekerja boleh mempunyai pose kerja halus, tanpa angka atau teks proses
  buatan pada monitor.
- Kelima agent yang siaga dengan data segar boleh berkeliling secara dekoratif.
  Obrolan dan kegiatan santai diberi label Suasana ilustratif, tidak masuk feed.
- Tahap pertama memprioritaskan berjalan, sofa/TV-balapan, kopi, membaca, dan
  interaksi area meeting. Game/gitar menyusul setelah gerak serta pose dasar
  stabil. Duduk di meeting tidak mengklaim rapat kerja berlangsung.
- Dialog lokal berlangsung bergantian antar-karakter yang berdekatan dan sesuai
  kegiatan visualnya. Perubahan status membatalkan dialog serta balasan tertunda.
- Revisi yang dikonfirmasi pemilik memakai ritme kantor-agent: jalan 1,6
  unit/detik, jadwal tujuan 38 sampai 72 detik, percobaan dialog tiap 7 sampai
  11,5 detik, dan balasan setelah 2,3 detik. Kecepatan, gait, dan pose dasar
  diselaraskan bersama tanpa mengganti rig, denah, atau rute aman lokal.
  Komentar singkat saat tiba mengikuti peluang 55% rujukan dan tidak diulang
  oleh polling/resume. Ritme ini mengganti pilihan cadence santai awal.
- Bubble mengambil permukaan putih, border krem, ukuran 220px desktop/150px
  mobile, padding, tail, dan shadow rujukan agar bahasa visualnya cocok dengan
  name tag. Font sistem memakai ukuran relatif; provenance tetap kecil dan
  terlihat, bukan hanya tooltip. Dialog selalu sesuai zona visual.
- Bubble kerja dipisahkan dari dialog fiksi. API saat ini hanya menyediakan
  kalimat tugas generik; fallback memakai Bekerja dan uraian role berlabel
  Deskripsi peran. Event lama tidak diubah menjadi pekerjaan aktif.
- Batas bersama untuk bubble dialog, kerja, dan event ialah dua pada desktop
  dan satu pada ponsel. Prioritas karakter terpilih atau status kerja menjaga
  keterbacaan; rincian tetap tersedia pada DOM. Name tag dan pill kartu bukan
  bagian dari kuota bubble. Bubble tidak menutup HUD, label lain, atau keluar
  area layar yang bisa dibaca.
- Pergantian status memakai transisi singkat tanpa bounce. Kartu tetap menuju
  meja asal atau tengah ruang, bukan mengikuti posisi karakter yang bergerak.
- Transisi fokus kamera memakai 1,2 detik dengan cubic ease-out; klik tubuh
  atau name tag boleh meneruskan pelacakan karakter setelah transisi.
- Tween kamera berhenti saat pengguna memberi input berikutnya.
- `prefers-reduced-motion` menghentikan roaming, obrolan berulang, dan animasi
  TV serta mempersingkat perpindahan kamera; polling status tetap berjalan.
- Data stale, error, atau offline menghentikan kegiatan dekoratif.

## Layout responsif

### Desktop

Scene menjadi panggung utama. Desain kartu, panel, label, dan wallpaper mendekati
hasil kantor-agent yang dipilih pemilik, dengan permukaan krem hangat dan aksen
role kanonis. Panel Aktivitas berada di kiri; panel kanan memiliki tab Riwayat
dan `Tugas <Nama>`. Strip kartu role berada di bawah. Toggle panel desktop tetap
tersedia; menyembunyikan panel tidak menghilangkan status penting atau jalan
untuk memulihkannya.

### Tablet

Scene tetap dominan. Lapisan panel boleh mengecil atau berpindah selama status
koneksi dan approval tetap terlihat tanpa scroll panjang.

### Ponsel

Scene memenuhi viewport di belakang HUD. Header ringkas dan carousel kartu role
berada di atas scene; panel rincian muncul dari bawah dengan tinggi awal mendekati
38vh rujukan untuk ditinjau, lalu dapat diciutkan menjadi dock dan dibuka kembali.
Panel memakai konten DOM yang sama pada kedua keadaan, menggulir di dalamnya,
dan tidak memblokir seluruh scene ketika diciutkan. Halaman tidak boleh overflow
horizontal; header, panel, dock, dan kontrol menghormati safe area perangkat.
Pembatasan gestur scene tidak boleh diterapkan ke panel atau seluruh halaman.
Panel terbuka saat awal atau masuk mode mobile sampai lebar 820px. Pemilihan
kartu, Escape, H, dan chevron menciutkan hanya isi gulir, bukan header/dock.
Tab atau chevron membuka kembali. Preferensi hidden/minimized desktop disimpan
terpisah dan dipulihkan ketika keluar dari mode mobile.

Header ponsel mempertahankan brand dan tiga metrik ringkas tanpa tombol toggle
utama. Tab bawah ialah Riwayat, `Tugas <Nama>`, dan Aktivitas; panel Aktivitas kiri
tersembunyi. Tombol chevron membuka atau menciutkan panel. Detail tugas role
terpilih tetap dibedakan dari jumlah papan dan antrean yang berlaku untuk lab.

## UI states

- Loading: menyebutkan apa yang sedang dimuat dan menawarkan tampilan ringan jika
  WebGL tidak siap.
- Empty: menyatakan ledger berhasil dibaca tetapi belum ada tugas.
- Error: membedakan kegagalan proyeksi server dari koneksi browser.
- Offline: mempertahankan layout dan menunjukkan waktu sinkron terakhir jika ada.
- Stale: menyebutkan sesi kerja kedaluwarsa tanpa menuduh agent masih bekerja.
- Fallback: mengganti scene dengan penjelasan singkat, kartu dan feed tetap aktif.

## Accessibility

- Informasi operasional penting berada di DOM dan dapat dibaca screen reader.
- Canvas dan label dekoratif disembunyikan dari accessibility tree jika informasi
  yang sama sudah tersedia pada kartu.
- Focus indicator harus terlihat pada setiap control.
- Urutan keyboard mengikuti urutan visual.
- Kontras minimum mengikuti WCAG AA.
- Touch target minimum 44 x 44 CSS pixel.
- Tidak ada status yang disampaikan oleh warna, posisi, atau motion saja.

## Performance dan kualitas render

- Render loop berhenti melakukan pekerjaan berat ketika document tersembunyi.
- Device pixel ratio dibatasi maksimum 2.
- Geometry berulang memakai instancing jika profiling menunjukkan draw-call cost.
- Material dan geometry dipakai ulang jika tampilannya sama.
- Canvas texture tidak dirender pada resolusi lebih tinggi dari kebutuhan nyata.
- Resource yang diganti atau dilepas harus di-dispose.
- Post-processing tidak ditambahkan tanpa manfaat visual yang dapat disebutkan dan
  pengukuran biaya pada reference device.
- Asset GLTF baru wajib mempunyai loading, error, cache, dan fallback behavior.

## Larangan visual

- Tidak ada angka demo, klaim aktivitas kerja palsu, testimonial, atau status
  buatan. Suasana fiksi harus berlabel dan terpisah dari status ledger.
- Tidak ada panel yang tampak dapat diklik tetapi tidak melakukan apa pun.
- Tidak ada dekorasi 3D yang menghalangi character atau informasi utama.
- Tidak ada perubahan palette role tanpa memperbarui kontrak kanonis.
- Tidak ada copied vendor asset tanpa lisensi dan attribution yang sesuai.
- Tidak ada model, texture, atau effect hanya karena terlihat menarik di screenshot.

## Definition of done visual

Perubahan visual selesai hanya jika design read masih terpenuhi, alasan keputusan
dicatat, build lulus, seluruh kontrol diuji, lima viewport lulus, console bersih,
fallback bekerja, dan screenshot telah dibandingkan dengan acceptance criteria.
