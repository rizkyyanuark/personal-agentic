# PRD: Kantor 3D, identitas agent, dan papan tugas

Status: T01 sampai T07 sudah dikodekan di workspace; verifikasi terpadu T08 berjalan. Belum di-deploy.
Tanggal penyusunan: 28 September 2026 (UTC).
Pemilik keputusan: pemilik AI Lab Cockpit.

Dokumen ini melengkapi `PRD.md`, `DESIGN.md`, dan kontrak publik yang ada.
Dokumen ini tidak mengganti batas read-only cockpit. Seluruh keputusan versi pertama
sudah dijawab pemilik; Q15 tentang kartu individual berada di luar versi pertama.
Penyusunan requirement tidak mengotorisasi deployment. Daftar keputusan berada di
[office-experience-v2-questions.md](office-experience-v2-questions.md).

## 1. Hasil yang ingin dicapai

Kantor 3D mengikuti komposisi referensi pemilik: meja kayu dengan dua monitor,
meeting di kiri, sofa menghadap TV, pantry di kanan belakang yang menempel dinding,
jendela berbingkai putih, papan tugas empat tahap, jam WIB, serta pot yang terletak
pada lokasi yang disengaja. Tujuh agent mempunyai nama. Enam workstation mempunyai
mug sesuai warna role, name tag nama dan jabatan, serta detail meja yang berbeda.
HQ tetap menjadi karakter dan role publik, tanpa workstation sendiri.

Karakter duduk dengan arah, tinggi, dan lipatan kaki yang sesuai kursi atau sofa.
Status publik tetap benar ketika agent bekerja, siaga, menunggu keputusan,
gagal, atau kehilangan koneksi. Detail dekoratif memberi identitas tanpa
menyerupai laporan pekerjaan nyata yang tidak tersedia.

## 2. Referensi dan cara memakainya

- Referensi workstation: `/home/ubuntu/.codex/attachments/c76719ad-375f-4db6-a932-ceee71bb2c1c/Screenshot 2026-09-28 150145.png`.
- Referensi ruangan: `/home/ubuntu/.codex/attachments/dc5db893-e0ab-476d-b06b-9dd635d7ed3f/Screenshot 2026-09-29 002446.png`.
- Gambar dipakai sebagai referensi bentuk, warna, komposisi, dan hierarki.
- Angka, nama, progress, percakapan, nama project, dan isi tugas di gambar tidak
  diambil menjadi data cockpit.
- Role referensi berjumlah tiga ditambah orchestrator. Produk tetap memiliki
  tujuh role AI/ML yang sudah ada, dengan enam workstation sesuai jawaban pemilik.

## 3. Keputusan yang sudah diberikan pemilik

| ID              | Keputusan                                                                                                                     | Implikasi                                                                                        |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Q01             | Susun ulang ruangan sedekat mungkin dengan komposisi referensi.                                                               | Membutuhkan denah dan kamera baru, bukan hanya menambah objek.                                   |
| Q02             | Tahap papan tanpa sumber ditandai Belum tersedia.                                                                             | Tidak menganggap menunggu persetujuan sebagai QA atau mengisi kartu palsu.                       |
| Q03             | Gerak kecil sesuai status nyata; sofa sebagai pose siaga.                                                                     | Tidak ada klaim jadwal istirahat, ngobrol, bermain, atau minum yang benar-benar dilakukan agent. |
| Q04             | Dua klaster masing-masing tiga workstation; HQ tidak diberi meja. Meeting kiri, lounge depan, pantry kanan belakang.          | Enam meja, tujuh karakter/kartu role; focus HQ memakai lokasi karakter dekat papan.              |
| Q05             | Nama karakter fiksi: Orion, Nova, Atlas, Lyra, Axiom, Vega, Echo.                                                             | Identitas role dimigrasikan serentak di name tag, layar, label, dan DOM.                         |
| Q06             | Schematic per role, berlabel Tampilan ilustratif, status live dari API.                                                       | Enam monitor kerja berbeda; tidak menampilkan output privat.                                     |
| Q07             | TV bergaya Netflix, berubah menjadi balapan ketika ada karakter duduk.                                                        | Pergantian mode mengikuti occupancy sofa.                                                        |
| Q08             | Luar jendela mengikuti siang/malam WIB; interior tetap nyaman dibaca.                                                         | Jam dan scene luar berbagi sumber waktu.                                                         |
| Q09             | Tiga pot berdasarkan kamera home: kiri sofa, kanan bawah frame, samping bookshelf. Pot tambahan dikurangi bila mengganggu.    | Tata pot memiliki acuan yang jelas.                                                              |
| Q10             | Rencana hanya tahap planning; tanpa sumber tampilkan Belum tersedia.                                                          | Queued tidak dimasukkan ke Rencana; tetap tersedia pada ringkasan antrean/footer.                |
| Q11             | Versi pertama papan memakai agregat per kolom dan footer perhatian, rincian di DOM.                                           | Tidak perlu menambah daftar kartu tugas pada public contract untuk versi ini.                    |
| Q16             | Waktu dari perangkat pengguna, diformat Asia/Jakarta.                                                                         | Tidak mengoreksi jam dari server; jam mengikuti keakuratan perangkat pengguna.                   |
| Q17             | Jam dinding analog, jarum detik tick tiap detik, label WIB.                                                                   | Pose jarum dan display monitor memakai layanan waktu yang sama.                                  |
| Q18/Q19         | Monitor utama memakai HH:mm besar, nama/status/tanggal kecil, gradient warna role.                                            | Komposisi lock screen mengikuti referensi dan identitas role.                                    |
| Q21/Q22         | Enam konsep pekerjaan pada F10, tema gelap matching job, gerak ringan hanya saat bekerja.                                     | Schematic statis pada siaga/failed/waiting/offline; status tetap nyata.                          |
| Q25/Q28/Q29     | Karakter stylized sekarang dipertahankan, pose/rig diperbaiki, warna pakaian mengikuti keluarga role; rambut/skin tone tetap. | Tidak mengganti model manusia baru.                                                              |
| Q27             | Pose dan penempatan deterministik dahulu; jalur berjalan setelah denah/seat stabil.                                           | Versi awal tidak memerlukan navigasi berjalan atau timer keliling acak.                          |
| Q46             | HQ berdiri dekat papan tugas sebagai koordinator.                                                                             | Tidak menambah meja atau kursi workstation HQ.                                                   |
| Q47             | Balapan berupa animasi dekoratif, tanpa kontrol permainan.                                                                    | Tidak memerlukan gameplay, physics engine, ataupun dependency game.                              |
| Q48             | Sofa kosong: katalog; ada karakter duduk: balapan. Reduced motion menghentikan geraknya.                                      | Occupancy dan mode layar diuji bersama.                                                          |
| Q12/Q13/Q14     | Footer perhatian dan semua runtime terkonfigurasi; papan visual non-interaktif, rincian di panel antrean yang ada.            | Data papan tetap diperbarui dari API; tidak menambah kontrol klik pada papan.                    |
| Q20             | Jam di monitor kiri dari perspektif pengguna yang duduk; pekerjaan di kanan.                                                  | Orientasi konsisten pada dua klaster.                                                            |
| Q23/Q24         | Judul/artwork TV lokal dekoratif; TV dapat difokuskan lewat klik dan kontrol DOM.                                             | Tidak ada streaming, login, atau kontrol permainan.                                              |
| Q26/Q30         | Sofa penuh: agent siaga tetap di meja; tangan kerja dekat keyboard dan mug di meja.                                           | Tidak ada tumpukan seat atau prop tangan tanpa pose teruji.                                      |
| Q31/Q32/Q33     | Kabinet putih, counter kayu, mesin kopi, grinder kecil, rak mug, dispenser; celah kecil ke dinding; pantry statis.            | Susunan lengkap, tidak menembus dinding atau memerlukan aksi runtime.                            |
| Q34/Q37/Q39/Q40 | Pot terracotta; palette kanonis; mug wajib dan satu–dua prop khas; dasar enam meja setara.                                    | Variasi identitas tanpa kepadatan dekor berlebihan.                                              |
| Q35/Q36/Q38     | Orion + Lab Director + HQ; nama konsisten di kartu/label/wallpaper/detail; jabatan Inggris kanonis.                           | Nama tampilan tidak mengubah key atau identitas ledger.                                          |
| Q41/Q42         | Home mengutamakan agent/papan; scene mobile utuh, tap focus dan teks lengkap pada DOM.                                        | Papan tetap non-interaktif; rincian melalui panel antrean, bukan teks tiny overview.             |
| Q43/Q44/Q45     | Benchmark Chrome Windows scaling 150%; asset lokal dahulu; review denah → pose → satu meja → enam meja/HQ/papan → hasil utuh. | Verifikasi sebelum deployment, tanpa dependency baru yang tidak diperlukan.                      |

Jawaban versi pertama lengkap: 47 pertanyaan diputuskan; Q15 tentang kartu tugas
individual ditunda karena tidak berlaku untuk papan agregat. Rekomendasi tambahan
di luar keputusan ini tidak otomatis menjadi scope implementasi.

Keputusan lanjutan 29 September 2026: kartu agent mengikuti lokasi karakter saat ini;
klik meja tetap memfokuskan workstation. Pemilik kemudian mengubah urutan delivery:
selesaikan implementasi T03 sampai T07 terlebih dahulu, lalu uji kelayakan hasil terpadu.
Review per-slice dan pengujian browser ditunda, bukan dianggap telah lulus.
Persetujuan deployment dan batas read-only tetap berlaku.

Q04 mengganti asumsi sebelumnya bahwa tujuh role berarti tujuh workstation.
Saat implementasi, PRD utama dan assertion jumlah workstation dimigrasikan menjadi
enam dengan alasan keputusan ini; jumlah kartu/karakter tetap tujuh. PRD utama,
DESIGN.md, dan assertion jumlah workstation dimigrasikan pada T01.

## 4. Kondisi saat audit

Audit read-only dilakukan pada source workspace dan `http://127.0.0.1:8095/api/state`.
Temuan ini adalah baseline, bukan klaim hasil implementasi fitur baru.

| Area            | Kondisi saat ini                                                                                  | Kebutuhan                                                                                 |
| --------------- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Ruangan         | Dua jendela sudah ada di kiri dinding belakang.                                                   | Atur ulang posisi dan tampilan agar terbaca seperti referensi.                            |
| Papan           | Papan belakang berisi tiga kolom dekoratif tanpa data tugas.                                      | Empat kolom berlabel dan proyeksi data yang benar.                                        |
| Jam             | Monitor prototype memakai waktu snapshot dan zona browser. Jam dinding belum ada.                 | Satu sumber jam WIB untuk dinding dan semua layar.                                        |
| Meja            | Tujuh meja berjajar di `z = -4.3`. Detail lengkap hanya di Data Engineer.                         | Tata ruang baru dan identitas lengkap semua workstation.                                  |
| Pantry          | Pusat pantry berada di `z = -5.85`, dinding belakang di `z = -7.5`.                               | Hitung posisi dari batas kabinet dan sisi dalam dinding.                                  |
| Pot             | Enam pot lantai dengan koordinat tetap.                                                           | Komposisi tiga pot utama sesuai maksud pemilik.                                           |
| Karakter        | Kursi/model dan karakter mempunyai heading sendiri; posisi karakter memakai `-3.35` tetap.        | Anchor duduk dan arah hadap bersama dengan furniture.                                     |
| Sofa            | Tinggi pinggul dikurangi, tetapi kaki masih menggunakan pose berdiri.                             | Pose sofa tersendiri dengan titik duduk pada sofa.                                        |
| Status karakter | Status selain bekerja dipadatkan menjadi siaga. Siaga masih memakai gerak mengetik.               | Pertahankan makna semua status publik dan pose yang sesuai.                               |
| Aktivitas idle  | Ada timer keliling acak dan percakapan dekoratif yang tampak faktual.                             | Sesuaikan dengan Q03; pose siaga tidak menyatakan aktivitas nyata.                        |
| Monitor         | Data Engineer mempunyai dua layar 768×480; meja lain memakai layar standby bersama.               | Jam, wallpaper role, dan layar kerja berbeda di enam meja.                                |
| TV              | Texture katalog gelap bertema AI Lab, dengan angka/layout dekoratif dan tombol visual.            | Sesuaikan arah konten TV; kontrol visual tidak boleh menjanjikan aksi yang tidak ada.     |
| Grafik          | DPR adaptif maksimum 2, PCFShadowMap; shadow 2048 normal dan 1024 pada kondisi fallback saat ini. | Pertahankan baseline dan ukur regresi setelah tambahan objek.                             |
| Loop render     | Source memakai ambang 34 ms sebelum render scene; cadence callback rAF bukan jumlah frame render. | Benchmark menghitung render aktual, bukan menganggap callback 60 Hz sebagai 60 FPS scene. |

API saat audit menyediakan `connection`, `now`, `totals`, `queue`, `agents`, dan
`feed`. API tidak menyediakan daftar kartu tugas, judul tugas privat, tahap QA,
kode agent, hasil eksperimen, token usage, atau roadmap. Field `agents.*.task`
adalah ringkasan umum yang sudah disanitasi, bukan judul tugas asli.

## 5. Batas cakupan

Target tahap ini meliputi komposisi kantor, jendela, papan tugas, jam WIB, pose
duduk, pantry, pot, personalisasi enam meja, dua monitor per meja, TV, dan tujuh nama agent.
Tidak ada model call tambahan untuk menghasilkan animasi atau konten layar.

Kemampuan menjalankan agent, approval browser, akses vault, payload tugas, editor
workflow, streaming akun pihak ketiga, dan metrik tanpa sumber tetap di luar
scope. Perubahan data publik untuk kartu tugas hanya dapat menjadi slice tersendiri
setelah bentuk field dan pengujiannya dipilih.

## 6. Requirement fungsional

### F01. Denah dan komposisi kantor

- Tata ulang mengikuti Q01/Q04: dua klaster masing-masing tiga workstation,
  tanpa meja HQ; meeting kiri, lounge depan, pantry kanan belakang.
- Buat denah berlabel tujuh role sebelum detail asset diperbanyak.
- Orion/HQ berdiri dekat papan tugas. Kartu HQ memfokuskan anchor karakter tersebut,
  bukan mencari workstation yang sudah dihapus.
- Denah harus mempunyai ruang pandang dan jalur masuk ke kursi, sofa, serta pantry.
- Sofa menghadap sisi layar TV. Meja meeting dan TV tidak menutup workstation utama.
- Kamera home, focus per role, titik orbit, dan batas zoom memakai denah yang sama.
- Home memprioritaskan enam workstation, tujuh karakter, dan papan; meeting, lounge,
  serta pantry tetap dikenali. Pada mobile scene tetap utuh, tap meja/kartu untuk focus
  dan baca nama/jabatan/status lengkap pada DOM; papan dibaca lewat panel antrean.
- Menyembunyikan panel DOM memperluas stage tanpa merusak aspect ratio atau DPR.
- Kiri/kanan pada lokasi pot mengikuti kamera home sesuai Q09.

Acceptance: tujuh role dan zona penting dapat ditemukan dari kamera home; focus
seluruh role dan Sudut awal bekerja; tidak ada furniture dominan terpotong atau
karakter tertutup label pada desktop dan mobile.

### F02. Jendela dan dinding

- Dua jendela dengan frame putih, kisi silang, ambang, dan pemandangan luar sederhana.
- Penempatan usulan di kanan papan pada dinding belakang, mengikuti komposisi gambar.
- Papan, jam, jendela, dan rak pantry mempunyai ruang terpisah tanpa tumpang tindih.
- Suasana luar mengikuti WIB sesuai Q08. Perubahan dilakukan halus dan pencahayaan
  interior tetap menjaga keterbacaan, termasuk ketika luar jendela gelap.
- Kaca/pemandangan tidak memerlukan refleksi realtime atau render pass tambahan.

Acceptance: frame tidak berkedip karena z-fighting; jendela terlihat dari home;
papan dan pantry tidak tertutup; pengujian siang/malam menggunakan waktu deterministik.

### F03. Jam WIB bersama

- Semua jam menggunakan zona `Asia/Jakarta`, dengan penanda WIB.
- Monitor pertama menampilkan waktu besar 24 jam `HH:mm` dan nama agent.
- Jam dinding analog dengan label WIB dan jarum detik tick setiap satu detik.
- Sumber waktu sesuai Q16: jam perangkat pengguna, diformat Asia/Jakarta.
  Tidak dikoreksi dari `now` server. Nilai `now` API tetap untuk waktu snapshot ledger.
- Waktu berjalan di antara polling API; bukan selalu menyalin waktu snapshot terakhir.
- Jam tetap berjalan saat API offline; status koneksi/ledger tetap ditandai terpisah.
- Jam dinding, enam monitor utama, dan tanggal memakai satu layanan waktu.
- Texture digital diperbarui ketika menit/status berubah; jarum mengikuti tick detik.
  Tidak membuat canvas atau material baru setiap frame.

Acceptance: uji browser pada timezone UTC dan zona lain tetap menampilkan WIB yang
sama; uji pergantian tanggal tengah malam, resume tab, resize, dan koneksi offline;
seluruh jam menampilkan menit yang konsisten.

### F04. Papan tugas empat kolom

Label tetap: Rencana, Dikerjakan, Uji QA, Selesai. Subjudul menerangkan pemetaan
ledger jika makna kolom berbeda dari workflow aslinya.

| Kolom/area               | Sumber tersedia                                                         | Pemetaan versi pertama                                 | Batas                                                                     |
| ------------------------ | ----------------------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------- |
| Rencana                  | Belum ada tahap planning.                                               | Belum tersedia, sesuai Q10.                            | `queue.queued` tidak dianggap planning.                                   |
| Dikerjakan               | `queue.running`                                                         | Tugas running dengan lease aktif.                      | Running stale tidak ikut dinyatakan aktif.                                |
| Uji QA                   | Belum ada.                                                              | Belum tersedia.                                        | Model Validator bekerja tidak otomatis berarti suatu tugas masuk QA.      |
| Selesai                  | `totals.completed`                                                      | Tugas berstatus succeeded.                             | Tidak menganggap event akhir sebagai sukses tanpa status tugas.           |
| Footer perhatian/antrean | `queue.queued`, `queue.waiting_approval`, `queue.failed`, `queue.stale` | Antrean, Perlu keputusan, Gagal, dan Sesi kedaluwarsa. | Queued tidak dimasukkan ke planning; pengecualian tidak masuk QA/Selesai. |

- Versi pertama menggunakan agregat yang tersedia sesuai Q11, bukan daftar kartu tugas.
- Scope mencakup seluruh runtime yang sudah dikonfigurasi seperti API saat ini;
  tidak menambah runtime baru atau filter sumber.
- Papan visual non-interaktif: tidak dapat diklik, tidak memiliki focus/action baru.
  Angka/label tetap diperbarui dari API; statis berarti tanpa interaksi, bukan membekukan data.
  Rincian dibaca melalui panel antrean DOM yang sudah ada.
- Nol hanya ditampilkan jika field yang bersangkutan benar-benar tersedia dan bernilai nol.
  Tidak tersedianya field dibedakan dari antrean kosong.
- Papan memperlihatkan status sinkronisasi dan waktu pembaruan WIB.
- Loading, empty, error, offline, dan stale mempertahankan semantik yang benar.
- Informasi papan juga tersedia di DOM. Membaca tekstur 3D bukan satu-satunya akses.
- Jika kartu per tugas dipilih pada tahap lanjutan, server hanya boleh mengirim proyeksi yang disetujui:
  identifier publik yang aman, role, tahap yang benar, waktu, dan ringkasan umum.
  Tidak mengirim tujuan, input/output, path, prompt, project, atau raw event.
- Pemetaan QA yang baru membutuhkan sumber workflow nyata; tidak dibuat dari heuristik
  nama role, teks tugas, ataupun waiting approval.

Acceptance: setiap angka dapat ditelusuri ke field; tahap tanpa sumber bertuliskan
Belum tersedia; failed/waiting/stale tidak hilang; kegagalan API tidak terlihat sebagai
semua tugas selesai; jika kontrak berubah, uji field publik dan field terlarang wajib ada.

### F05. Pose karakter, kursi, dan sofa

- Setiap tempat duduk mempunyai anchor posisi, tinggi permukaan, arah depan, target
  pandang, batas dudukan, serta identitas seat. Furniture dan karakter memakai anchor sama.
- Heading asset GLTF dinormalisasi sekali agar model dan fallback procedural mempunyai
  depan yang sama. Jangan mengandalkan `rotation.y = Math.PI` untuk semua model.
- Duduk meja: pinggul berada di dudukan, paha mengarah ke depan, lutut tertekuk, kaki
  mendekati lantai, kepala menghadap monitor, tangan berada di area keyboard.
- Duduk sofa: punggung dekat sandaran, pinggul di cushion, lutut tertekuk, kaki di depan
  sofa, pandangan mengarah TV. Pose berbeda dari berdiri dengan pinggul diturunkan.
- Duduk meeting menghadap pusat meja dan memakai anchor kursi meeting.
- Usulan toleransi arah pandang adalah 10 derajat dari target. Toleransi kontak duduk
  ditetapkan setelah ukuran asset diukur; tidak memaksakan angka tanpa geometri.
- Seat tidak boleh ditempati dua karakter; saat lounge penuh, karakter siaga tetap di meja.
- Orion/HQ tetap berdiri dekat papan dan tidak ikut alokasi sofa/workstation.
  Tangan kerja dekat keyboard; mug tetap di meja, tidak berpindah ke tangan otomatis.
- Status bekerja memakai mengetik halus; siaga memakai pose istirahat kecil; menunggu
  keputusan/gagal tetap dijelaskan sebagai status itu, bukan diubah menjadi bekerja/siaga.
- Saat offline/stale, pose tidak memberi kesan pekerjaan baru sedang berlangsung.
- Q03 menghapus klaim percakapan dan jadwal istirahat acak. Penempatan ke sofa untuk
  siaga adalah visualisasi, bukan bukti perilaku runtime.
- Sesuai Q27, versi awal memakai penempatan/pose deterministik. Jalur berjalan ditunda
  sampai denah dan seat registry stabil. Lokasi siaga dipilih dari anchor yang tersedia
  dengan urutan role yang stabil; tidak ada timer acak yang mengubah klaim status.
- Reduced motion mempertahankan pose duduk yang benar walaupun animasi dimatikan.

Acceptance: periksa enam kursi workstation, pose berdiri HQ, seat sofa, meeting, dan fallback model dari home serta
samping; tidak duduk terbalik, berdiri di sofa, melayang, atau menembus sandaran;
uji pergantian status, seat penuh, reduced motion, dan asset gagal dimuat.

### F06. Pantry yang menempel dinding

- Kabinet putih, counter kayu, mesin kopi, grinder kecil, rak mug, dan dispenser
  menjadi satu zona yang proporsional sesuai Q31.
- Sisi belakang kabinet ditempatkan relatif sisi dalam dinding, bukan koordinat center
  yang ditebak. Celah fisik kecil, dengan target 2 sampai 5 cm yang diverifikasi pada ukuran asset, tanpa celah besar yang terlihat.
- Rak mug dan backsplash terpasang di dinding; mesin/grinder berada di atas counter;
  dispenser berada di lantai di sisi kabinet, tidak bertabrakan dengan counter.
- Arah mesin, dispenser, dan karakter pantry menghadap area pengguna yang sama.
- Peralatan tidak menutupi jendela, jam, workstation, atau jalur sofa.
- Pantry statis terlebih dahulu; interaksi minum bukan aksi runtime AI.

Acceptance: dari home dan samping terlihat menempel dinding; counter/peralatan
tidak melayang atau saling menembus; kabinet dan dispenser tidak keluar lantai.

### F07. Pot dan tanaman

- Tiga pot utama yang diminta: di kiri sofa, pojok kanan bawah, dan samping bookshelf.
- Sesuai Q09, posisi mengikuti kamera home; pot besar tambahan dikurangi bila mengganggu.
- Dasar pot menyentuh lantai dan bayangan kontak tidak membuat pot tampak mengambang.
- Pot tidak memotong jalur jalan, seat, kartu/label, ataupun pandangan ke monitor.
- Pot terracotta dengan daun hijau lebar mengikuti gambar, dengan ukuran berbeda seperlunya.
- Gerak pot tidak wajib; jika ada gerak daun, dasar pot tetap diam dan reduced motion berlaku.

Acceptance: ketiga lokasi dapat ditunjuk pada screenshot home; asset dan fallback
tetap berada pada posisi yang sama; siluet daun tidak menutup nama agent.

### F08. Nama, jabatan, warna, dan name tag

Nama berikut dipilih pemilik sebagai identitas karakter agent. Nama ini bukan
klaim identitas pegawai nyata. Key, slug, dan mapping ledger tetap kanonis.

| Key                       | Nama dipilih | Jabatan            | Warna kanonis | Identitas detail meja dipilih                       |
| ------------------------- | ------------ | ------------------ | ------------- | --------------------------------------------------- |
| `hq_lab_director`         | Orion        | Lab Director       | `#7756a7`     | Tanpa meja; berdiri dekat papan, tablet opsional.   |
| `data_engineer`           | Nova         | Data Engineer      | `#176e78`     | Notebook pipeline dan mini server.                  |
| `data_scientist`          | Atlas        | Data Scientist     | `#3465b4`     | Buku statistik dan kartu diagram tanpa angka hasil. |
| `research_scientist`      | Lyra         | Research Scientist | `#a83c6a`     | Tumpukan paper dan bookmark.                        |
| `ml_engineer`             | Axiom        | ML Engineer        | `#247c5b`     | Mini perangkat komputasi dan headphone.             |
| `model_validator`         | Vega         | Model Validator    | `#a7581d`     | Clipboard checklist tanpa tanda lulus palsu.        |
| `mlops_platform_engineer` | Echo         | MLOps & Platform   | `#a6402d`     | Mini rack dan notebook operasional.                 |

- Name tag mempunyai dua baris: nama lebih besar, jabatan lebih kecil.
- Semua enam meja wajib mempunyai mug sesuai warna kanonis, keyboard, mouse,
  dua monitor, kursi, dan name tag. Dekor khas satu sampai dua prop mengikuti tabel F08;
  kelengkapan dasar keenam meja setara, tanpa glow/cable animation tambahan demi detail.
- Warna wallpaper, mug, kartu DOM, dan label role mengacu sumber role yang sama.
- Warna identitas tidak ditafsirkan sebagai keberhasilan tugas atau status error.
- Nama muncul di kartu DOM, label karakter, wallpaper, dan panel detail, dengan jabatan
  Inggris kanonis tetap terlihat. Nama tampilan tidak mengganti key ledger.
- HQ tidak mempunyai dua monitor/name tag meja. Nama/jabatan tetap tersedia di label
  karakter dan DOM, dengan nama Orion, jabatan Lab Director, dan badge HQ sesuai Q35.
- Nama yang panjang mempunyai wrap/fit yang teruji, bukan terpotong tanpa informasi.

Acceptance: enam mug/name tag terlihat; tujuh nama dan jabatan konsisten di semua lokasi;
tidak ada role yang hilang setelah rename; palette dan contrast dapat diverifikasi.

### F09. Monitor pertama: wallpaper dan jam

- Bentuk mengikuti referensi lock screen: jam besar di tengah, nama/status kecil,
  wallpaper dengan gradient lembut warna role ke tint terang.
- Gradient berfungsi sebagai identitas workstation, bukan dekor UI umum.
- Monitor jam di kiri dan monitor pekerjaan di kanan dari sisi pengguna yang duduk.
- Jam WIB berjalan sesuai F03; status live tetap berasal API.
- Tanggal Indonesia kecil sesuai Q18. Tidak membuat uptime atau durasi sesi dari jam tersebut.
- Pertahankan texture 768×480 dahulu; perubahan resolusi hanya bila teks kurang terbaca
  dari sudut focus normal setelah DPR benar.
- Tingkat terang layar menjaga keterbacaan tanpa menjadikan semua monitor sumber cahaya.
- Q18/Q19 menyetujui jam HH:mm di tengah, nama/status/tanggal kecil, dan gradient role.

Acceptance: enam wallpaper berbeda sesuai role; jam/status terbaca pada focus;
clock bukan `--:--` hanya karena API offline; teks memiliki kontras yang memadai.

### F10. Monitor kedua: karakter pekerjaan tiap role

Keputusan Q06: schematic per role, dengan label Tampilan ilustratif yang terlihat,
ditambah status/ringkasan publik nyata. Konten ini tidak mengaku sebagai kode atau
hasil pekerjaan yang sedang dijalankan.

| Role               | Tampilan pekerjaan dipilih                                           | Data live yang boleh ditempel       |
| ------------------ | -------------------------------------------------------------------- | ----------------------------------- |
| Lab Director       | Tanpa monitor meja; overview koordinasi ada di DOM, tablet opsional. | Agregat antrean dan status koneksi. |
| Data Engineer      | Diagram alur ingest, transform, validasi.                            | Status role dan ringkasan publik.   |
| Data Scientist     | Layout notebook dan area plot tanpa nilai evaluasi palsu.            | Status role dan ringkasan publik.   |
| Research Scientist | Panel bacaan/outline riset dan catatan ilustratif.                   | Status role dan ringkasan publik.   |
| ML Engineer        | Diagram tahap build/train/infer tanpa progress training palsu.       | Status role dan ringkasan publik.   |
| Model Validator    | Layout checklist evaluasi tanpa hasil lulus/gagal rekaan.            | Status role dan ringkasan publik.   |
| MLOps & Platform   | Diagram layanan/pipeline tanpa log perintah atau health palsu.       | Status role dan ringkasan publik.   |

- Schematic diberi label ilustratif. Tidak menampilkan skeleton seperti data yang sudah selesai.
- Animasi aktif hanya ketika status bekerja dan koneksi fresh; tidak ada progress bar
  rekaan. Status waiting/gagal/siaga mempunyai tampilan tenang yang sesuai.
- Enam konsep pada tabel sudah dipilih melalui Q21/Q22; tema gelap tetap memperlihatkan
  perbedaan job lewat struktur schematic, bukan sekadar mengubah nama window.
- Semua informasi penting ada padanan DOM agar screen reader dan fallback tetap berguna.
- Texture masing-masing role berbeda; resource bersama hanya digunakan untuk bagian statis.

Acceptance: enam layar kerja dapat dibedakan; ilustrasi jelas bukan output agent; perubahan
status tercermin; tidak ada data privat di texture, DOM, source public, atau API.

### F11. TV lounge

- Keputusan Q07/Q47/Q48: tampilan Netflix-style ketika sofa kosong, animasi balapan
  dekoratif ketika ada karakter duduk, lalu kembali katalog ketika sofa kosong.
- Katalog mengikuti header, hero banner, dan thumbnail referensi. Judul/artwork
  dekoratif dibuat lokal; tidak membutuhkan akun, login, atau streaming Netflix.
- Brand style mengikuti pilihan pemilik; judul/artwork lokal fiksi jelas dekoratif sesuai Q23.
- Balapan berupa perspektif trek, mobil, dan gerak jalur pada texture TV. Tidak
  memerlukan kontrol permainan, physics engine, atau multiplayer.
- Mode TV mengikuti seat occupancy aktual F05, bukan timer acak atau status bekerja.
  Duduk sofa tetap pose siaga sesuai Q03.
- Reduced motion menghentikan gerak balapan pada frame statis tanpa mengubah mode
  atau merusak occupancy. Ketika tab tersembunyi, pekerjaan animasi berat berhenti.
- Logo, banner, thumbnail, dan bezel proporsional; layar menghadap sofa.
- Elemen tombol yang digambar di texture tidak menjanjikan aksi playback jika hanya dekor.
- Resolusi TV ditentukan dari ukuran tampilan nyata; tidak menaikkan texture karena label HD.

Acceptance: sofa kosong/terisi mengubah mode dan kembali katalog saat kosong, tanpa
flicker perpindahan seat; reduced motion mempertahankan frame statis; komposisi cocok
dengan referensi dan arah sofa; tidak ada false live claim;
tidak ada media/autoplay tak diminta; texture terbaca tanpa mendominasi pencahayaan.

### F12. Interaksi dan fallback

- Klik meja atau kartu memilih role yang sama, benar-benar mengubah kamera, dan
  mempertahankan jalur kembali ke Sudut awal.
- TV dapat difokuskan melalui klik serta kontrol DOM bernama jelas, lalu kembali ke Sudut awal.
  Ini hanya kontrol kamera, bukan kontrol game atau playback.
- Papan tetap non-interaktif; rincian tugas melalui panel antrean DOM yang sudah ada.
- Semua tindakan baru memiliki keyboard/touch equivalent dan target minimal 44×44 CSS px.
- Mode WebGL gagal tetap menyajikan jam, status role, dan informasi papan yang tersedia.
- Loading model menggunakan fallback yang terlihat; error model tidak membuat seat hilang.
- Semua panel/label mempertahankan loading, empty, error, offline, dan stale behavior.

Acceptance: uji tindakan sebenarnya dan posisi/target kamera, bukan dataset seleksi saja;
Tab/Enter/Space/Escape, touch, reset, serta fallback tetap dapat digunakan.

## 7. Ketentuan teknis dan kualitas

- Pertahankan DPR asli maksimum 2 termasuk setelah resize; jangan mengunci seluruh
  browser ke DPR 1 demi screenshot headless.
- Pertahankan PCFShadowMap sesuai Three.js r186 dan konfigurasi shadow baseline.
- `navigator.webdriver` hanya menandakan otomasi; hasil headless 1024 tidak membuktikan
  mode normal 2048. Keduanya diperiksa secara eksplisit pada delivery implementasi.
- Reduced motion mengatur animasi. Versi ini mempertahankan mode kualitas yang ada;
  toggle/parameter URL hemat daya baru berada di luar scope dan tidak dianggap sudah tersedia.
- Gunakan satu render loop. Clock/board/screen diperbarui saat berubah, tidak semuanya
  diraster ulang setiap frame.
- Share geometry/material yang sama; dispose resource yang dimiliki saat diganti/dilepas.
- Asset lokal yang ada digunakan dahulu. GLTF mempunyai fallback, error, cache, serta
  attribution/lisensi yang dapat ditelusuri sebelum asset baru ditambahkan.
- Post-processing dan shader custom bukan syarat mencapai referensi. Bloom, DOF,
  film grain, scanline, dan refleksi realtime hanya dipertimbangkan jika manfaatnya
  terbukti dan pengguna memilihnya; tidak ditambahkan karena skill tersedia.
- Perangkat benchmark utama: Chrome Windows display scaling 150%, stage aktual dan
  desktop 1440. Catat versi browser, ukuran stage, GPU/renderer, dan DPR yang terukur.
  Mobile/headless diuji terpisah, bukan pengganti benchmark perangkat tersebut.
- Benchmark membandingkan viewport, kamera, DPR, mode kualitas, dan keadaan scene
  yang sama. Pisahkan cold start, warm orbit, dan pengambilan screenshot.
- FPS/interval requestAnimationFrame tidak diklaim sebagai waktu GPU murni. Anggaran
  performa ditentukan dari baseline terukur, bukan klaim 60 FPS universal.
- Benchmark membedakan callback rAF, panggilan renderer.render, dan frame yang benar-benar
  dipresentasikan. Ambang render yang ada dicatat sebelum menetapkan target performa.

## 8. Urutan kerja dan dependensi

| Task | Hasil yang dapat direview                                                | Dependensi                                                       | Pemilik modul                                             |
| ---- | ------------------------------------------------------------------------ | ---------------------------------------------------------------- | --------------------------------------------------------- |
| T00  | Finalkan jawaban prioritas, nama, dan pemetaan data.                     | Dokumen ini; keputusan versi pertama lengkap, Q15 di luar scope. | Dokumentasi dan kontrak.                                  |
| T01  | Denah enam meja, HQ dekat papan, kamera home, anchor furniture dan seat. | T00, Q04/Q09/Q46.                                                | Scene layout; `furniture.js`, `main.js`.                  |
| T02  | Pose meja/sofa/meeting dan status karakter yang benar.                   | T01, Q03 dan Q25 sampai Q30.                                     | `characters.js`, seat anchors.                            |
| T03  | Jendela, pantry menempel dinding, bookshelf, dan tiga pot.               | T01, Q08/Q09/Q31/Q34.                                            | `room.js`, `furniture.js`.                                |
| T04  | Tujuh nama kanonis; mug, name tag, dan aksen enam workstation.           | T01, Q05/Q35 sampai Q40.                                         | `office-contract.js`, `workstation.js`, DOM labels/cards. |
| T05  | Satu jam WIB serta enam wallpaper monitor pertama.                       | T04 dan Q16 sampai Q20.                                          | Shared client clock, scene clock/screen.                  |
| T06  | Enam monitor kedua dan TV Netflix/balapan berdasarkan occupancy.         | T02/T04/T05, Q06/Q07/Q21 sampai Q24/Q47/Q48.                     | `workstation.js`, furniture TV, DOM equivalent.           |
| T07  | Pemetaan papan tugas, texture + DOM, dan failure states.                 | T00; keputusan Q10 sampai Q14; T03 untuk posisi papan.           | Shared contract, server bila perlu, scene board, UI.      |
| T08  | Verifikasi tiap slice, pembandingan referensi, dan review hasil utuh.    | T01 sampai T07.                                                  | Check, unit/privacy tests, e2e, screenshot.               |
| T09  | Build terverifikasi dan handoff deployment.                              | T08; otorisasi deployment yang sesuai.                           | Build dan service template review.                        |

T07 dimulai dari data contract sebelum menggambar angka. T03/T04/T07 dapat
dikerjakan terpisah setelah layout disetujui, tetapi dokumen ini tidak meminta
eksekusi multi-agent. Setiap slice tetap kecil dan punya bukti sendiri.

Checkpoint review pemilik: denah → pose → satu workstation Nova → enam workstation,
HQ, dan papan → hasil kantor utuh beserta verifikasi → handoff deployment.
Jangan memperbanyak enam meja sebelum prototype satu meja diterima; deployment
menunggu otorisasi pemilik setelah bukti dan review hasil utuh.

## 9. Bukti penerimaan implementasi

- `npm run check` setelah setiap slice kode/konfigurasi.
- `npm run test:e2e` terhadap layanan build yang dinyatakan eksplisit untuk perubahan
  UI/scene/transport. Jangan melonggarkan assertion untuk memperoleh PASS.
- Lima viewport: 320×760, 390×844, 768×1024, 1024×768, 1440×900.
- Screenshot home dan focus tiap role; close-up kursi/sofa, papan, pantry, pot,
  monitor, TV, serta jam. File dengan kamera/time deterministik agar dapat dibandingkan.
- Screenshot lima viewport sesuai `docs/visual-acceptance.md` harus diperiksa.
- Uji kamera membaca position/target aktual; atribut seleksi saja tidak cukup.
- Jumlah workstation enam, jumlah kartu/karakter tujuh; focus HQ diuji tanpa meja.
- Uji sofa dengan nol, satu, beberapa karakter, serta pergantian penghuni; mode TV
  tidak kehilangan seat reservation dan reduced motion tidak merusak occupancy.
- Uji waktu WIB, pergantian tanggal, offline, resize, dan tab resume.
- Uji seat occupied, fallback asset, reduced motion, dan perubahan status.
- Jika public state berubah, test membuktikan field yang boleh keluar dan field privat
  yang tetap tidak boleh keluar, termasuk teks yang dikirim menjadi texture.
- Catat console error, request gagal yang tidak dijelaskan, draw calls/triangles,
  startup, dan interval frame pada mode normal serta fallback.
- Sebelum deployment, bandingkan template service dan unit terpasang. Restart mengikuti
  otorisasi pemilik; penyusunan PRD ini bukan instruksi restart layanan.

## 10. Routing skills dan alasan keputusan

| Skill                  | Pengaruh pada requirement                                                         |
| ---------------------- | --------------------------------------------------------------------------------- |
| threejs-fundamentals   | Satu koordinat layout, hierarchy parent-child, kamera/resize/DPR konsisten.       |
| threejs-geometry       | Frame, jam, mug, dan dekor dengan geometri proporsional dan resource reuse.       |
| threejs-animation      | Pose duduk berdasar anchor, blending status, dan reduced motion.                  |
| threejs-interaction    | Focus/reset nyata, input touch, raycast, dan akses DOM.                           |
| threejs-lighting       | Pertahankan key/fill dan shadow; uji furniture terang/karakter gelap.             |
| threejs-materials      | Kayu hangat, kain matte, metal terbatas, dan layar cukup terang.                  |
| threejs-textures       | Clock/screen/board memakai color space, filtering, resolusi, dan lifecycle jelas. |
| threejs-loaders        | Cache model lokal, arah depan GLTF, fallback, error, dan disposal ownership.      |
| threejs-shaders        | Evaluasi LED/cable yang ada; custom effect tidak wajib untuk fitur ini.           |
| threejs-postprocessing | Hindari render pass tambahan sampai manfaat/performa dapat ditunjukkan.           |
| antislop + antislop-ui | Setiap detail mengikuti referensi dan tujuan identitas/readability.               |
| antislop-human         | Kontras, status teks, fokus keyboard, dan padanan DOM untuk data 3D.              |
| antislop-layoutmobile  | Denah/kamera dan kontrol tetap berguna di seluruh viewport.                       |
| antislop-copywriting   | Status jelas; nama karakter dan konten ilustratif tidak disajikan sebagai fakta.  |
| antislop-code          | Catatan implementasi menjelaskan batas yang penting, bukan narasi kode generik.   |

Design read: kantor monitoring AI/ML untuk pemilik lab, warm-studio isometrik,
ENERGY 2 / RHYTHM 2 / MOTION 1. Mode Antislop during tetap berlaku sesuai pilihan
pemilik sebelumnya. Warna role pada mug/wallpaper berfungsi sebagai identitas.
Pot memberi batas zona; jendela memberi skala; jam memberi orientasi waktu;
papan memperjelas antrean; pose duduk membuat status dapat dibaca tanpa gerak berlebihan.

Tool sequential-thinking tidak tersedia pada sesi penyusunan ini. Urutan keputusan,
dependensi, dan task di atas ditulis langsung agar dapat direview; tidak ada klaim
pemanggilan tool tersebut.

## 11. Status penyerahan dokumen

Requirement versi pertama yang telah diklarifikasi, bukan UI baru atau sertifikasi kualitas implementasi.

| Pemeriksaan dokumen         | Status               | Bukti                                                                                                     |
| --------------------------- | -------------------- | --------------------------------------------------------------------------------------------------------- |
| Cakupan raw notes           | PASS                 | F01 sampai F12 mencakup seluruh objek, pose, nama, dan layar yang diminta.                                |
| Keputusan vs usulan         | PASS                 | 47 pertanyaan diputuskan; Q15 ditunda di luar versi agregat; pilihan pemilik tercatat pada questionnaire. |
| Angka dan status bersumber  | PASS                 | Matriks F04 memakai field API yang dibaca; QA ditandai belum tersedia.                                    |
| Konten dekoratif jujur      | PASS                 | Nama adalah karakter agent; monitor dan balapan ilustratif, artwork/judul katalog lokal dekoratif.        |
| Alasan visual dan direction | PASS                 | Referensi pemilik, DESIGN.md, dan bagian 10.                                                              |
| Interaksi/accessibility     | Requirement tercatat | F12 dan acceptance; belum diimplementasikan/diklik pada scope dokumen.                                    |
| Visual/mobile/performance   | Requirement tercatat | Bagian 7 dan 9; belum menjadi bukti hasil UI baru.                                                        |

Pemeriksaan format: `prettier --check` pada kedua dokumen requirement. Tidak ada
perubahan aplikasi, build production, atau restart service pada tahap ini;
`npm run check` dan `npm run test:e2e` menjadi bukti wajib saat implementasi kode/UI.
