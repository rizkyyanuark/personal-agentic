# Kebutuhan v3: kantor virtual dengan rujukan kantor-agent

Status: Preferensi visual dan keputusan penyelarasan pada bagian 2, 7, 8, dan 11 dikonfirmasi pemilik. Penerimaan implementasi v3 penuh tetap menunggu pemeriksaan dan review preview. Dokumen ini tidak mengizinkan deployment produksi.
Tanggal penyusunan: 30 September 2026 (WIB).
Pembaruan penyelarasan: 3 Oktober 2026, berdasarkan WORK_LOG kolega dan jawaban klarifikasi pemilik.

Mandat penyelarasan awal hanya memperbarui Markdown dan mempertahankan kode
hasil kolaborasi. Setelah memilih opsi 1 pada popup pengerjaan, pemilik memberi
mandat implementasi L1 lokal: pill responsif dan tinggi kartu adaptif.
Pada 3 Oktober 2026 pemilik mengonfirmasi kelanjutan L2 sampai implementasinya
siap, baru pengujian browser oleh kolega. L2 memisahkan fakta API, pose lokal,
dan jenis bubble serta lifecycle suasana. Desain kolega tetap dipertahankan;
controller jalur, dialog bergantian, dan kuota bubble pada L3 sampai L5 belum
termasuk mandat L2. Deployment produksi tetap membutuhkan izin terpisah.
Konfirmasi berikutnya mengizinkan L3, L4, dan L5 lokal sekaligus, dengan ritme
"Santai dan tidak ramai". Seluruh pengujian tahap ini diserahkan kepada kolega
setelah implementasi; Codex tidak menjalankan check, unit test, atau browser.
Handoff L2 tetap disimpan tanpa ditimpa. Mandat ini tidak menghapus gate
penerimaan maupun memberi izin deployment.
Konfirmasi revisi berikutnya mengganti cadence santai awal dengan parameter
gerak/dialog rujukan. Pemilik memilih kegiatan dasar dahulu dan logika komentar
saat tiba seperti referensi. Batas bubble, status nyata, dan gate keselamatan
tetap; game/gitar serta aktivitas tambahan belum masuk revisi ini.
Rujukan dikunci: [kantor-agent commit ad92a7a](https://github.com/humaedihume/kantor-agent/tree/ad92a7a473b3d0e769281d552cee74cbb4004a54).
Dokumen terkait: [PRD](../../PRD.md), [arsitektur](../architecture.md), [DESIGN](../../DESIGN.md), [v2](office-experience-v2.md), [penerimaan visual](../visual-acceptance.md).

## 1. Tujuan dan batas

Pemilik ingin komposisi ruang, kamera, monitor, papan, tanaman, label, panel melayang, loading, dan gerak karakter sedekat mungkin dengan rujukan. Rujukan dipakai untuk desain dan pola interaksi, bukan sebagai sumber data atau runtime cockpit. Target baru adalah lima role kerja nyata dan lima karakter: Orion tanpa meja serta empat workstation untuk Nova, Atlas, Lyra, dan Axiom. Alasan perampingan adalah alur dan ruang yang lebih sederhana, bukan janji penghematan token atau proses yang belum terukur.

Batas produk yang tidak berubah:

- Browser hanya membaca /api/state yang tersanitasi. Browser tidak membaca vault atau payload tugas, menjalankan worker, atau memberikan approval.
- Angka, status, dan event yang tampak operasional harus berasal dari kontrak publik. Tidak ada metrik, judul tugas, log perintah, proses, token, durasi, atau hasil model buatan.
- Obrolan dan kegiatan santai boleh fiksi hanya sebagai suasana berlabel. Keduanya bukan event ledger atau klaim agent nyata sedang bekerja.
- Kode atau aset referensi disalin hanya bila perlu, setelah lisensi MIT dan atribusi diperiksa. Perubahan upstream setelah commit terkunci dinilai terpisah.
- Ketidaksesuaian dengan PRD, DESIGN, atau checklist penerimaan harus diselaraskan secara terbuka sebelum irisan kerja dinyatakan selesai. Batas privasi tidak dilonggarkan.

Draf lama memuat klaim persetujuan dan identitas pemilik yang belum terkonfirmasi. Konfirmasi terbaru berlaku untuk keputusan yang dicatat di bawah; klaim identitas pribadi, kepatuhan, performa, atau keberhasilan migrasi tidak memperoleh persetujuan otomatis.

## 2. Keputusan terbaru yang mengganti v2 atau draf lama

Pemilik menyatakan hasil kolaborasi dalam WORK_LOG sesuai preferensinya. Jawaban
teks "semua" mengonfirmasi opsi 2 untuk papan, status, dan reset; tiga jawaban
popup berikutnya menetapkan data kosong, isi sticky, dan nama metrik. Keputusan
ini mengganti baseline tiga kolom, label Siaga pada UI, tombol reset terlihat,
dan kebutuhan sticky pada semua meja. State dan batas API tetap sama.

Enam jawaban popup lanjutan menetapkan reflow pill, dialog lokal, bubble kerja,
subteks sesuai aktivitas visual, batas bubble, dan urutan kegiatan. Keputusan
subteks terbaru mengganti pilihan mempertahankan narasi generik kartu. Denah,
identitas, gaya hasil kolega, sumber data, dan fokus kamera tetap dipertahankan.

| Aspek        | Keputusan untuk v3                                                                                                                                   |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Denah        | Lima karakter; empat meja dalam dua baris masing-masing dua. Orion tanpa meja.                                                                       |
| Papan        | Empat kolom: Rencana, Dikerjakan, Uji QA, Selesai. Uji QA memakai antrean persetujuan dengan keterangan bahwa ini bukan hasil QA.                    |
| Rencana      | Belum tersedia sampai ada sumber planning publik; queued bukan planning. Waktu pembaruan hanya dari sinkron nyata.                                   |
| Sticky papan | Satu sticky ringkasan pada kolom bersumber dengan jumlah positif; tidak ada ID/judul tugas buatan. Nol nyata atau tanpa sumber tetap bersih.         |
| Status       | API tetap siaga; UI memakai Istirahat. Subteks mengikuti aktivitas visual lokal saat ini dengan penanda Suasana ilustratif.                          |
| Pill kartu   | Satu baris bila muat; turun baris ketika sempit. Nama/status utuh dan tinggi kartu adaptif.                                                          |
| Bubble       | Dialog lokal bergantian; kerja dari informasi publik atau fallback Deskripsi peran. Maksimal dua desktop/satu ponsel, prioritas terpilih atau kerja. |
| Fokus        | Kartu empat agent ke meja asal, Orion ke tengah; klik meja ke workstation; klik tubuh/name tag mengikuti karakter.                                   |
| Reset        | Tanpa tombol terlihat; klik ulang pilihan aktif, double-click canvas, atau Escape sesuai keadaan panel. Keterbatasan akses dicatat.                  |
| Roaming      | Kelima karakter boleh berkeliling saat siaga dan data segar; status operasional segera menghentikan suasana sesuai bagian 7.                         |
| Monitor      | Wallpaper diagonal warna role ke krem, konten operasional hanya dari API; sticky monitor hanya Atlas/Lyra.                                           |
| HUD          | Pertahankan hasil kolega: krem/aksen role, panel dan kartu rujukan, dua tab desktop, tiga tab layar sempit, drawer/dock.                             |
| Metrik       | Layout tetap; Proporsi tugas selesai, Total tugas, Jam WIB; token Belum tersedia. Loading/gagal/offline tidak menjadi nol.                           |
| Performa     | DPR adaptif diturunkan dahulu ketika melambat, maksimum 2; fokus 1,2 detik cubic ease-out.                                                           |
| Loading      | Garis animasi tanpa persentase palsu; memuat/gagal mencerminkan keadaan sebenarnya.                                                                  |

Lima identitas target adalah Orion (Lab Director), Nova (Data Engineer), Atlas (Data Scientist), Lyra (Research Scientist), dan Axiom (ML Engineer). Warna kanonis mereka dari src/shared/office-contract.js tetap konsisten di meja, mug, wallpaper, nameplate, label, kartu, dan HUD. Kontrak cockpit pada worktree kini memuat lima role aktif serta atribusi arsip Vega (Model Validator) dan Echo (MLOps & Platform) untuk event publik yang lolos sanitasi. Ini belum membuktikan definisi Hermes, API, dan scene produksi sudah sinkron; semua lapisan harus diverifikasi sebagai satu migrasi.

Pekerjaan validasi yang sebelumnya dikaitkan dengan Vega menjadi gerbang pemeriksaan milik host, terpisah dari pekerjaan pembuatan model Axiom. Pemeriksaan tidak boleh disahkan hanya oleh agent yang menghasilkan artefak yang diperiksa. Tanggung jawab rilis/platform yang sebelumnya dikaitkan dengan Echo menjadi alur dan gerbang rilis milik host; ini bukan izin untuk menjalankan deployment otomatis atau memindahkan approval ke browser. Definisi input, bukti, pemilik keputusan, dan tes kedua gerbang harus ditetapkan sebelum role lama dinonaktifkan. Lima role bukan klaim bahwa validasi sudah sepenuhnya independen atau bahwa biaya token turun dengan persentase tertentu.

## 3. Denah dan properti

REQ-01. Home desktop menampilkan empat meja dalam dua baris masing-masing dua, meeting di kiri depan, lounge/TV di depan, pantry mepet dinding kanan belakang dengan celah fisik aman, jendela dan papan di dinding belakang, serta bookshelf di sisi ruang. Proporsi dan ruang negatif mendekati screenshot commit rujukan. Koordinat mentahnya tidak harus sama karena susunan empat meja berbeda. Jalur jalan tidak boleh tertutup.

REQ-02. Orion tidak mendapat meja semu. Saat bekerja atau menunggu keputusan, karakter kembali ke area papan; saat siaga ia boleh mengunjungi semua area aman. Sudut awal tetap memudahkan orang menemukan HQ dan empat workstation.

REQ-03. Hapus prop mini-server fisik Nova dan mini-komputasi/GPU fisik Axiom. Monitor kerja tetap ada. Keempat meja tetap memiliki mug dengan warna role dan aksen kerja lain dari v2 yang tidak menutup layar atau jalur.

REQ-04. Gaya tanaman mengikuti rujukan: pot terakota, tanah gelap, daun hijau memanjang. Target komposisi adalah lima pot lantai seperti rujukan, dengan posisi disesuaikan agar tidak menutup sofa, meja, papan, label, atau jalur. Tanaman kecil pada meja HQ referensi tidak dapat disalin secara literal karena Orion tidak punya meja; penambahan tanaman kecil lain menunggu review visual.

REQ-05. Sofa, TV, pantry, meja meeting, rak buku, dan jendela tetap memiliki fungsi ruang yang disepakati di v2. Kegiatan gitar atau game boleh menambah aset bila adegannya membutuhkan, tetapi masuk tahap lanjutan setelah gerak dan pose dasar stabil. Prop dekoratif tidak boleh terlihat seperti kontrol yang tidak berfungsi.

Ketentuan v2 yang tidak diganti tetap berlaku: jam dinding analog dengan jarum detik dan label WIB, tampilan luar jendela siang/malam menurut WIB, pantry lengkap dengan kabinet, mesin kopi, grinder, rak mug, dan dispenser, serta okupansi kursi deterministik. Posisi dan skin boleh disesuaikan dengan komposisi baru.

## 4. Papan dan kontrak data

REQ-06. Papan meniru whiteboard, bingkai, tray spidol, sticky, proporsi, dan tipografi tulisan tangan referensi. Seluruh teks papan memakai stack tulisan tangan lokal. Papan tidak menjadi kontrol 3D. Ia hanya ringkasan visual; rincian tugas dan status tetap tersedia pada panel DOM.

Papan memiliki empat kolom: Rencana, Dikerjakan, Uji QA, Selesai. Pemilik memilih
mempertahankan judul Uji QA dengan keterangan terlihat "Antrean persetujuan
pemilik; bukan hasil QA". Jumlah tersebut tidak membuktikan tugas sedang diuji,
lulus validasi, atau memiliki hasil benchmark. Nama kolom bukan perubahan
workflow Hermes atau sumber tahap QA baru.

| Bagian           | Sumber sah                                    | Keadaan tanpa sumber atau data segar                                          |
| ---------------- | --------------------------------------------- | ----------------------------------------------------------------------------- |
| Rencana          | Belum ada field planning                      | Tulis Belum tersedia, bukan 0 atau queue.queued                               |
| Dikerjakan       | queue.running                                 | Jangan tampilkan angka lama sebagai live                                      |
| Uji QA           | queue.waiting_approval                        | Antrean persetujuan pemilik; bukan hasil QA. Tanpa data segar: Belum tersedia |
| Selesai          | totals.completed                              | Jangan tampilkan angka lama sebagai live                                      |
| Footer perhatian | queue.queued, waiting_approval, failed, stale | Hanya nilai valid dari snapshot segar                                         |

REQ-07. Sticky papan meniru bentuk fisik referensi dengan satu sticky ringkasan per kolom bersumber yang jumlahnya positif. Isinya hanya jumlah/status publik, tanpa ID seperti QA-01/RUN-01, judul tugas buatan, teks tugas rujukan, atau payload privat. Sticky bukan tiket individual. Kolom dengan jumlah nyata nol tetap bersih; Rencana tanpa sumber tetap bersih dan bertanda Belum tersedia. Kartu tugas individual di masa depan memerlukan sumber publik baru, redaksi, tes kebocoran, dan persetujuan terpisah.

REQ-08. Loading, error, offline, dan stale tidak boleh jatuh ke angka 0 seolah snapshot masih live. Empty dengan snapshot segar boleh menampilkan nol yang benar-benar berasal dari sumber; Rencana tetap Belum tersedia. Waktu pembaruan hanya ditampilkan setelah sinkron nyata dari timestamp snapshot; tidak memakai waktu contoh. Subtitle papan tidak menyebut jumlah agregat sebagai plan jika sumber planning tidak ada. Detail dan keterangan Uji QA yang sama tersedia pada panel DOM.

## 5. Monitor, wallpaper, dan identitas agent

REQ-09. Dua monitor tiap meja mengikuti grammar visual rujukan. Monitor utama menampilkan wallpaper gradien diagonal dua warna dari warna role ke krem hangat (#f3eee6), jam WIB besar, nama, dan status saat siaga. Saat bekerja, tampil jendela aplikasi gelap bergaya rujukan. Monitor kedua menampilkan kartu status kerja bergaya referensi saat bekerja, memakai state dan teks publik agents[role].task, atau layar standby saat siaga. Field task saat ini berupa kalimat status generik, bukan ringkasan isi tugas. Empat konsep peran menjadi ilustrasi di dalam grammar jendela tersebut, bukan data tugas baru. Jam menggunakan waktu perangkat pengguna yang diformat Asia/Jakarta.

REQ-10. Empat konsep kerja tetap berbeda: alur data Nova, notebook Atlas, kerangka riset Lyra, dan tahap model Axiom. Checklist validasi dan peta layanan tidak lagi menjadi monitor milik agent tersendiri. Bingkai jendela, baris, dan hierarki boleh mengikuti rujukan. Isi nyata dibatasi pada agents[role].state, teks status publik agents[role].task, serta event generik publik yang benar-benar terpetakan ke role dan segar. Tidak ada perintah terminal, PID, progres training, token, tool, dataset, durasi, atau hasil yang tidak ada di kontrak. Hasil gerbang validasi atau rilis baru boleh tampil jika kemudian tersedia dalam kontrak publik yang diuji dan disetujui.

REQ-11. Jika event publik tidak tersedia, layar memakai bentuk visual non-numerik atau Belum tersedia. Saat data stale, error, atau offline, monitor tidak boleh tampak masih bekerja live. Tekstur cukup tajam pada jarak fokus normal; teks kecil tidak diwajibkan terbaca dari overview ponsel.

REQ-12. Keempat meja mendapat nameplate akrilik miring berisi nama dan jabatan tanpa balok penyangga hitam. Kelima karakter mendapat label kapsul mengambang yang mengikuti posisi, bisa dipilih lewat klik atau keyboard, dan tidak menutup monitor atau karakter lain. Sticky monitor mengikuti hasil terbaru kolega: tiga lembar pastel kosong hanya pada Atlas dan Lyra; Nova dan Axiom tetap bersih. Sticky monitor dekoratif berbeda dari sticky ringkasan pada papan tugas.

## 6. Kamera dan performa

REQ-13. Parameter OrbitControls mengikuti commit referensi persis: dampingFactor 0,07; jarak minimum/maksimum 5/34; sudut polar 0,3 sampai 1,36 radian; azimut -0,8 sampai 1,25 radian. Transisi fokus 1,2 detik dengan cubic ease-out, orbit, zoom, pan, serta pembatalan tween oleh input pengguna mengikuti rujukan. Damping dimatikan dalam reduced motion. Batas target rujukan adalah x -9 sampai 9, z -6 sampai 5, dan y 0,3 sampai 3,5. FOV responsif rujukan ialah 38 derajat desktop, 34 derajat ketika ruang diperluas, 44 derajat di bawah 1180 px, serta 62 derajat di bawah 820 px. Pemilik memilih reset tanpa tombol terlihat, mengikuti REQ-15a.

REQ-14. Home desktop dan ponsel memakai position/target aplikasi pada commit rujukan: desktop (-1,2; 12,5; 16,8) menuju (-1; 0,6; -1,2), ponsel di bawah 820 px (-2,2; 14,5; 19,5) menuju (-1,9; 0,4; -1,4). Pemilik memilih mengikuti home ponsel rujukan persis; tepi ruang boleh keluar frame. Fokus dan panel DOM menyediakan akses detail. Kamera tetap tidak boleh menembus lantai, dinding, atau objek besar; laporkan masalah tersebut tanpa diam-diam mengubah parameter rujukan.

REQ-15. Kartu empat agent menuju meja asal, kartu Orion menuju tengah ruang, klik meja menuju workstation. Klik tubuh atau name tag menuju lokasi karakter dan meneruskan pelacakan; orbit atau pan manual melepas pelacakan. Fokus memperbarui selection dan aria-pressed. Pelacakan karakter tidak mengubah tujuan kartu agent.

REQ-15a. Reset memulihkan kamera, selection, dan tab Tugas Orion lewat klik ulang pilihan aktif, double-click canvas, atau Escape. Tidak ada tombol Sudut awal yang terlihat. Pada panel ponsel terbuka, Escape lebih dahulu menciutkan panel; setelah tertutup, Escape dapat mengembalikan kamera. Pemilik secara eksplisit memilih mempertahankan pola ini. Keterbatasannya adalah gestur sulit ditemukan dan double-click belum menjamin perilaku sentuh yang setara. Hasil pengujian sentuh/keyboard dicatat apa adanya; jangan mengklaim jalan DOM setara atau kepatuhan WCAG penuh hanya dari shortcut dan target 44px.

REQ-16. Audit gerbang render 34 ms saat implementasi agar navigasi tidak tersendat oleh pembatas frame buatan. Pertahankan penghematan saat tab tersembunyi. Mulai dari DPR asli yang dijepit pada rentang 1 sampai 2; ketika beban render tinggi, turunkan DPR lebih dahulu dan pulihkan dengan histeresis. Tidak ada target FPS universal tanpa pengukuran. Pemilik menilai rasa smooth secara visual, tetapi bukti teknis tetap dicatat.

## 7. Gerak dan suasana ilustratif

REQ-17. Semua karakter dengan status siaga dan data segar, termasuk Orion, boleh berjalan ke seluruh zona aman. Untuk versi ini, syarat konservatif data segar ialah polling terakhir berhasil dengan connection live atau empty, queue.stale bernilai 0, dan tab terlihat. Kegagalan poll, connection error/offline, queue.stale lebih dari 0, atau tab tersembunyi menghentikan suasana sampai pembacaan valid berikutnya. Jangan menyimpulkan freshness dari teks agents[role].task atau menambah field API semu. Tujuan dipilih dengan seed stabil selama umur halaman dan jeda alami. Rute menghindari furnitur, tepi ruang, karakter lain, serta kursi yang ditempati. Kaki menapak lantai, arah badan sesuai tujuan/kursi, dan transisi berjalan, berdiri, serta duduk tidak meluncur atau menembus aset.

REQ-17a. Konfirmasi pemilik pada 4 Oktober 2026: halaman baru/refresh memakai
seed sesi baru dan menempatkan karakter siaga di lokasi santai aman yang unik
pada snapshot pertama yang segar dan terlihat, seperti bootstrap rujukan.
Karakter bekerja/menunggu tetap di anchor operasional. Reduced motion pada
bootstrap mempertahankan anchor awal tanpa teleport ketika kemudian diaktifkan
geraknya. Kembali dari tab/browser/BFCache tidak mengacak ulang: root, heading,
fase/rute, dan sisa jeda dipertahankan; gerak dilanjutkan setelah pembacaan API
baru. Header memperlihatkan sinkronisasi yang sedang berlangsung, bukan Live
lama. Tidak ada persistence browser atau simulasi kantor bersama di server.
Ini mengganti seed role yang selalu berulang setiap refresh; pengujian tetap
oleh kolega. Rincian batas pada [ADR 0013](../decisions/0013-page-bootstrap-and-foreground-resume.md).

REQ-18. Saat API mengubah status menjadi bekerja, menunggu keputusan, atau gagal, DOM segera menunjukkan status baru. Untuk bekerja, Nova, Atlas, Lyra, dan Axiom kembali melalui rute aman ke workstation masing-masing; Orion kembali ke papan sebelum mengambil pose kerja. Saat menunggu keputusan, Orion kembali ke area papan sesuai REQ-02; lokasi empat agent lainnya masih ditinjau pada preview. Kegiatan dekoratif berhenti dan pose aman/netral pada keadaan menunggu atau gagal; anchor keadaan gagal belum dipastikan. Animasi tidak menunda data.

REQ-19. Tahap kegiatan dasar mencakup berjalan, sofa/TV-balapan, kopi, membaca, dan interaksi area meeting. Game/gitar menyusul setelah gerak dan pose dasar stabil. Adegan di meeting tidak menyatakan rapat kerja nyata. Obrolan ringan tidak memakai nama tugas, kutipan log, angka, atau klaim pekerjaan. Gelembung mengikuti gaya rujukan dengan label kecil Suasana ilustratif yang konsisten, terpisah dari feed.

REQ-19a. State API siaga tetap dipakai oleh polling dan logika gerak, tetapi label
UI-nya Istirahat. Label lain ialah Bekerja, Menunggu keputusan, dan Gagal.
Istirahat berarti role tanpa tugas aktif, bukan jadwal istirahat yang dibuktikan.
Subteks kartu mengikuti aktivitas visual lokal karakter saat ini, misalnya
Menikmati kopi atau Membaca, dengan penanda terlihat Suasana ilustratif. Ini
mengganti keputusan lama mempertahankan teks generik Santai di lounge dan
Memantau aktivitas lab. Aktivitas scene tidak membuktikan pekerjaan agent nyata
dan tidak masuk feed ledger. Tanpa aktivitas visual aktif, jangan mengklaim
karakter sedang melakukan kegiatan tertentu.
Saat data belum tersedia atau tidak segar, narasi tidak disajikan sebagai status
live. Ini tidak mengubah aturan penghentian suasana pada REQ-17 dan REQ-20.

REQ-19b. Percakapan berupa pasangan kalimat lokal bergantian antar-karakter yang
berdekatan, sesuai kegiatan dan lokasi visual, bukan percakapan agent AI yang
benar-benar berlangsung. Tidak ada panggilan model, biaya token, atau event
ledger baru. Scheduler membatasi pengulangan dan membatalkan dialog/balasan
tertunda bila salah satu peserta tidak lagi siaga atau suasana dihentikan.

Konfirmasi awal ritme L3 sampai L5: santai dan tidak ramai. Revisi terbaru
memakai kecepatan jalan 1,6 unit/detik, heading interpolation 7 saat berjalan
dan 4 saat menuju arah akhir, serta jadwal tujuan 38 sampai 72 detik dari
keberangkatan, mengikuti rujukan. Langkah disesuaikan ke rig lokal agar parameter
kecepatan tidak menghasilkan gait terlalu cepat atau menembus lantai. Ini
bukan janji kemulusan sebelum pemeriksaan kolega. Perpindahan ilustratif
dibatasi paling banyak dua karakter bersamaan; pekerjaan yang harus kembali
ke anchor tidak ditunda hanya untuk kuota suasana. Kegiatan memiliki jeda
lokal yang deterministik, bukan jadwal istirahat operasional. Dialog hanya
dimulai ketika ada pasangan diam di zona yang sama dan cukup dekat. Scheduler
mencoba dialog setelah 4 detik, lalu tiap 7 sampai 11,5 detik; ucapan pembuka
bertahan 4,8 detik, balasan dimulai 2,3 detik kemudian dan bertahan 4,2 detik.
Teks dibuat sesuai lokasi/kegiatan dengan gaya obrolan rujukan, bukan menyalin
dialog global yang tidak cocok dengan zona. Komentar tunggal punya peluang 55%
saat kedatangan baru dan lifetime 4,2 detik, tidak dipicu ulang oleh bootstrap
atau polling. Informasi kerja statis mendapat prioritas di atas suasana.

REQ-19c. Bubble kerja menggunakan ringkasan tugas publik yang informatif bila
tersedia dan segar. Kontrak sekarang hanya memberikan teks status generik pada
agents[role].task; untuk kondisi ini tampil Bekerja dan uraian role statis yang
diberi label Deskripsi peran, bukan rincian pekerjaan aktual. Tidak mengambil
goal, project, payload, log mentah, hasil, atau vault. Ringkasan lebih spesifik
memerlukan sumber publik dan persetujuan tersendiri. Menunggu keputusan memakai
status publiknya, bukan kalimat seolah bekerja. Bubble event tetap riwayat
generik; event lama tidak dianggap bukti tugas aktif. Perubahan status/koneksi
membersihkan bubble dan timer yang sudah tidak sesuai.

REQ-19d. Kuota bersama bubble dialog, kerja, dan event ialah maksimal dua pada
desktop dan satu pada ponsel, dengan prioritas karakter terpilih atau status
kerja. Name tag karakter dan pill kartu tidak dihitung sebagai bubble. Bubble
tetap berada pada area layar yang terbaca, tidak menutup HUD, name tag, atau
karakter lain. Rincian status dan deskripsi tersedia lewat DOM; obrolan dekoratif
tidak dimasukkan ke Riwayat/Aktivitas ledger. Reduced motion menghentikan dialog
berulang; informasi kerja tetap dapat dibaca sebagai teks statis dan polling
tetap berjalan.

REQ-20. Tidak ada toggle suasana khusus. prefers-reduced-motion menghentikan roaming, obrolan berulang, dan animasi balapan, serta mempersingkat transisi kamera; polling API tetap berjalan. Data stale, error, atau offline menghentikan suasana dan menampilkan pose netral beserta status DOM yang jelas.

REQ-21. TV tetap menampilkan katalog bergaya Netflix ketika sofa kosong dan animasi balapan dekoratif ketika sofa ditempati. Balapan bukan game interaktif. Klik/tap TV memfokuskan scene. Kebutuhan jalur fokus TV lewat DOM dari v2 tetap dicatat, tetapi belum dibuktikan tersedia setelah tombol Fokus TV di top bar dihapus. Penghapusan tombol top bar dipertahankan; kesenjangan akses ini tidak menjadi instruksi mengubah kode pada langkah dokumentasi. Arah pose sofa/meja dan okupansi kursi tetap deterministik.

## 8. HUD, loading, font, dan mobile

REQ-22. HUD desktop dan ponsel mempertahankan hasil terbaru kolega yang dipilih pemilik: kartu agent, panel aktivitas, drawer, label, dan header mendekati desain kantor-agent. Identitas cockpit tetap memakai permukaan krem hangat dan aksen warna role kanonis. Informasi wajib tetap metrik nyata, koneksi, perhatian, kartu agent, dan akses panel; reset mengikuti pengecualian REQ-15a. Tidak ada metrik baru hanya karena muncul di rujukan. Ruang 3D tetap focal point. Efek tembus pandang atau blur hanya dipakai bila keterbacaan dan kontras tetap baik.

- Desktop: panel Aktivitas di kiri, tab Riwayat dan `Tugas <Nama>` di kanan, serta strip kartu role di bawah. Toggle panel atas dapat menyembunyikan atau memulihkan panel. Nama kartu utuh; jabatan boleh disembunyikan ketika ruang sempit dan tetap tersedia dalam DOM. Orion memakai jabatan Lab Director.
- Tablet/laptop sempit: panel Aktivitas kiri tersembunyi dan isinya masuk tab Aktivitas pada drawer. Layout mengikuti ruang yang tersedia, bukan menganggap semua layar sempit sebagai ponsel.
- Ponsel: header hanya brand dan tiga metrik ringkas tanpa toggle utama. Panel bawah memakai tab Riwayat, `Tugas <Nama>`, Aktivitas, dengan tinggi awal sekitar 38vh dan tombol chevron buka/ciut. Kartu role horizontal berada di atas panel dan tidak menutup titik sentuh scene. Panel dapat diciutkan menjadi dock; panning dan fokus scene tetap mungkin.

Nama pada tab Tugas mengikuti role yang dipilih dan kembali ke Orion saat reset.
Bagian tugas aktif memakai teks status publik role; papan dan antrean diberi konteks
lab karena jumlahnya global, bukan jumlah tugas milik role terpilih. Dot avatar
berwarna abu-abu/hijau/amber/merah menurut state API. Live memakai waktu snapshot
tersinkron dalam format WIB HH:mm:ss; Riwayat dan Aktivitas memakai HH.mm.

REQ-22a. Panel bawah dan dock adalah dua keadaan dari konten DOM yang sama, bukan dua salinan data. Tombol buka/ciut memiliki nama yang jelas, aria-expanded yang benar, target sentuh memadai, dan dapat dioperasikan dengan keyboard maupun sentuhan. Fokus kembali ke pemicu saat panel ditutup; Escape menutup panel bila sedang terbuka. Konten panjang menggulir di dalam panel, tidak memaksa halaman melebar atau mengunci jalan keluar.

Konfirmasi koreksi L1: saat awal atau masuk mode mobile, panel bawah terbuka,
termasuk jika panel desktop sebelumnya disembunyikan. Klik kartu, H, Escape,
atau chevron hanya menciutkan isi gulir; header dengan tiga tab dan chevron
tetap terlihat sebagai dock. Tab atau chevron dapat membukanya kembali.
Preferensi panel desktop dipulihkan saat kembali ke desktop. Breakpoint drawer
dan state panel mobile sama, yaitu 820px seperti rujukan; tab Aktivitas tetap
tersedia saat panel kiri tersembunyi pada lebar sampai 1180px.

REQ-22b. Pertahankan layout metrik dengan pemetaan berikut. Seluruh angka,
persentase, badge tab, dan sticky mengikuti ketersediaan sumber; kegagalan
tidak diubah menjadi nol. Jam perangkat tidak dipakai untuk mengklaim API segar.

| Label                  | Sumber dan arti                                                      | Tanpa sumber atau snapshot segar                          |
| ---------------------- | -------------------------------------------------------------------- | --------------------------------------------------------- |
| Tugas selesai          | totals.completed, cakupan ledger yang dikonfigurasi                  | Belum tersedia                                            |
| Total tugas            | totals.tasks, bukan jumlah tugas aktif                               | Belum tersedia                                            |
| Proporsi tugas selesai | 100 × totals.completed / totals.tasks, dibulatkan bila total positif | Belum tersedia; total nol tidak menjadi 0%                |
| Jam WIB                | Jam perangkat, diformat Asia/Jakarta                                 | Tetap jam perangkat; bukan durasi sesi atau waktu sinkron |
| Token diproses         | Belum ada field token publik                                         | Belum tersedia, tanpa angka contoh                        |

Persentase ini bukan roadmap proyek, progres training, atau ukuran produktivitas
agent. Nilai nol untuk hitungan hanya sah jika sumber segar benar-benar nol.

REQ-22c. Nama di kiri dan pill status di kanan berada pada satu baris bila
seluruh header kartu muat. Jika satu nama/status tidak muat, seluruh strip
memakai baris status kedua yang sejajar, bukan reflow mandiri per kartu.
Baris status, tugas, dan aktivitas memiliki titik awal vertikal yang seragam.
Nama dan label pill tidak dipotong; tinggi
kartu menyesuaikan isi, tanpa batas tinggi yang memotong baris atau subteks.
Jangan menyamarkan overflow dengan clipping, ellipsis status, atau font kecil.
Adaptasi mengikuti lebar kartu, bukan hanya ukuran viewport. Pertahankan
permukaan, avatar, warna, fokus, dan layout hasil kolega; pertumbuhan kartu tidak
boleh menutup dock, panel, atau target sentuh scene.

Konfirmasi berikutnya mengizinkan pill ringkas `Menunggu`, bukan
`Menunggu keputusan`, untuk mendekati kartu rujukan dan menjaga baris inline.
Arti penuh tetap pada title pill serta nama aksesibilitas kartu; deskripsi tugas
tetap dari API. State `menunggu_persetujuan` tidak berubah. Ini mengganti pilihan
sebelumnya yang mewajibkan teks panjang utuh di pill. Jika label lain atau zoom
tetap membutuhkan dua baris, reflow bersama dan tinggi adaptif masih berlaku.

REQ-23. Loading memakai permukaan hangat dan garis animasi tanpa angka persen. Teks memuat, gagal, offline, dan fallback mencerminkan kondisi API/WebGL sebenarnya; overlay tidak hilang hanya karena timer tetap. Fallback WebGL mempertahankan status serta navigasi DOM.

REQ-24. Font utama memakai CSS font stack sistem yang sama persis dengan rujukan, bukan mengunduh file font atau Google Fonts baru. Font papan memakai fallback tulisan tangan lokal. Perbedaan glyph antar-OS diperiksa saat review.

REQ-25. Home ponsel mengikuti framing dekat rujukan, sehingga tepi ruang boleh berada di luar frame; semua zona tetap dapat dicapai lewat orbit/fokus dan panel DOM. Carousel boleh menggulir horizontal dan panel boleh menggulir vertikal, tetapi halaman tidak overflow horizontal. Area aman layar diperhitungkan untuk header, dock, panel, dan kontrol kamera. Pembatasan gestur scene tidak diterapkan pada seluruh halaman atau panel. Target sentuh sekurang-kurangnya 44 x 44 CSS pixel walau tombol visual rujukan lebih kecil. Keyboard, focus indicator, kontras, status non-warna, zoom teks, dan reduced motion tetap berlaku.

## 9. Urutan implementasi dan review

| Tahap | Irisan kerja                                                  | Bukti review pemilik                                                                                              |
| ----- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| M0    | Selaraskan lima role Hermes, kontrak publik, dan gerbang host | Tidak ada role lama yang disamarkan sebagai aktif; agregat tetap utuh; gerbang tidak memberi browser hak eksekusi |
| T1    | Denah, jalur, home view, kamera                               | Home desktop/ponsel sesuai rujukan; tepi ponsel boleh terpotong, zona tetap terjangkau lewat orbit/fokus          |
| T2    | Papan empat kolom, tanaman, prop, pantry, lounge              | Rencana Belum tersedia; Uji QA diberi konteks persetujuan; satu sticky agregat; prop tidak menghalangi            |
| T3    | Monitor, wallpaper, nameplate, label, sticky                  | Warna role konsisten; tidak ada perintah/angka buatan; jarak fokus terbaca                                        |
| T4    | HUD desktop/ponsel, font, loading, responsivitas, fallback    | Identitas krem/role konsisten; panel ponsel buka/ciut; metrik/kontrol ada; loading jujur; tidak overflow          |
| T5    | Roaming, pose, kegiatan, obrolan, TV                          | Status API selalu menang; suasana berlabel; jalur/kursi stabil                                                    |
| T6    | Pengujian gabungan dan review                                 | Pemilik mencoba preview sebelum izin produksi terpisah                                                            |

M0 adalah prasyarat integritas data, bukan perubahan urutan review visual T1 sampai T6. Migrasi Hermes dan cockpit harus mengatur task historis maupun aktif milik slug Vega/Echo agar agregat tidak diam-diam hilang dari ringkasan atau ditampilkan sebagai status agent yang tidak lagi ada. Atribusi arsip pada feed cockpit tidak boleh memetakan ulang tugas lama sebagai pekerjaan lima role baru. Tugas lama yang masih aktif memerlukan penanganan eksplisit sebelum role Hermes lama dinonaktifkan.

Modul scene tetap memiliki objek 3D, modul UI tetap memiliki DOM, dan sanitasi ledger tetap di server. Dokumen ini tidak mengizinkan endpoint mutasi, runtime baru, dependency produksi baru, Telegram, R2, GPU Spot/Vast, FastAPI, MLflow, atau target latensi baru.

## 10. Penerimaan dan status pekerjaan lokal

Gate penerimaan tetap memerlukan npm run check. Perubahan UI,
layout, interaksi, aksesibilitas, atau transport menjalankan npm run test:e2e pada
layanan yang relevan. Screenshot diperiksa pada 320, 390, 768, 1024, dan 1440 px.
Handoff menyebut perintah, hasil, console, kontrol, screenshot, build/tanggal, dan
ketidakpastian. Laporan kolega tidak disebut sebagai verifikasi independen.
Penilaian visual pemilik tidak menggantikan pemeriksaan teknis.

Pengecualian pelaksana pada mandat L3 sampai L5: pemilik meminta Codex hanya
mengimplementasikan, sedangkan kolega menjalankan seluruh pemeriksaan setelah
ketiga irisan siap. Kompilasi preview bukan pengujian kelayakan. Sebelum laporan
tersebut tersedia, perubahan berstatus belum terverifikasi dan belum siap
deployment, walaupun kode implementasinya sudah diterapkan.

Tes implementasi berikutnya mencakup lima role/empat meja; empat kolom dengan
Rencana Belum tersedia walau queued positif; Uji QA hanya jumlah persetujuan;
satu sticky agregat tanpa ID/judul buatan; label metrik sesuai sumber; ketersediaan
angka dan badge saat loading/error/offline; serta timestamp sinkron nyata.
Fokus kartu ke meja/Orion tengah dibedakan dari pelacakan tubuh/name tag. Periksa
jalur/kursi, reduced motion, dan berhenti ketika data usang. Reset tanpa tombol
diuji melalui gestur dan keyboard dengan keterbatasan akses dicatat.

Perubahan kontrak publik memerlukan tes field yang boleh tampil dan field privat
yang tidak boleh bocor. Migrasi role diuji terhadap tugas historis dan aktif
Vega/Echo, ketepatan agregat, dan larangan kebocoran payload. Label Istirahat dan
teks dekoratif memakai penanda yang disepakati tanpa berubah menjadi event
operasional. Kebutuhan pengujian ini belum dinyatakan lulus oleh pembaruan dokumen.

Status penyelarasan awal pada 3 Oktober 2026, sebelum pengerjaan L2 sampai L5,
berdasarkan pembacaan kode dan WORK_LOG, bukan hasil penerimaan v3 penuh.
Status irisan terbaru dicatat pada akhir bagian 11:

| Bagian | Yang sudah tercatat atau terlihat di kode lokal                                                                                                            | Yang belum dibuktikan atau perlu dikerjakan                                                                                                                                                             |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M0     | Kontrak cockpit memakai lima role; arsip Vega/Echo tetap dikenal                                                                                           | Sinkronisasi runtime Hermes, agregat lintas runtime, dan gerbang validasi/rilis host belum dibuktikan ulang                                                                                             |
| T1     | Empat workstation, kartu ke meja/Orion tengah, klik karakter/name tag dengan pelacakan, transisi 1,2 detik                                                 | Uji ulang gestur/sentuh, keterbatasan reset tanpa tombol, serta jalur DOM fokus TV yang belum dibuktikan                                                                                                |
| T2     | Papan empat kolom dengan bentuk whiteboard rujukan                                                                                                         | Keterangan Uji QA, Rencana Belum tersedia, timestamp sinkron nyata, satu sticky agregat tanpa ID/judul buatan                                                                                           |
| T3     | Wallpaper role ke krem, nameplate akrilik, label kapsul, sticky monitor hanya Atlas/Lyra                                                                   | Keterbacaan dan kesesuaian snapshot pada monitor dalam semua keadaan                                                                                                                                    |
| T4     | Dua tab desktop/tiga tab layar sempit, drawer/dock, dot status, Live HH:mm:ss; CSS reflow pill/tinggi adaptif dan assertion batas teks L1 diterapkan lokal | L1 belum diverifikasi browser oleh kolega. Nama/sumber metrik sesuai REQ-22b, token Belum tersedia, tidak ada nol saat gagal/offline, subteks aktivitas berlabel                                        |
| T5     | Pose/seat dan pemicu bubble dari event publik sudah ada; kebutuhan suasana pada bagian 7 disepakati                                                        | Controller roaming/kegiatan dasar, subteks visual, dialog bergantian, fallback bubble kerja, kuota/penempatan bubble belum diterapkan. Jalur, pose, okupansi dan penghentian suasana perlu diverifikasi |
| T6     | Kolega melaporkan npm run check dengan 84 unit test dan smoke pada lima viewport di WORK_LOG                                                               | Laporan terikat build/tanggal; koreksi isi baru di atas belum diimplementasikan atau diuji oleh pembaruan dokumen                                                                                       |

PRD, DESIGN, arsitektur, checklist, dan ADR 0008 kini memakai keputusan terbaru.
WORK_LOG tetap menyimpan riwayat perubahan; entri lama bukan aturan aktif ketika
telah diganti oleh konfirmasi ini. Pilihan reset tanpa tombol adalah keterbatasan
akses yang diterima pemilik, bukan bukti kepatuhan WCAG. Klaim biaya, memori,
identitas pribadi, atau keberhasilan tes dalam catatan historis tidak dibuktikan
oleh pembaruan dokumen ini.

Penyelarasan awal hanya mengubah Markdown. Konfirmasi pengerjaan berikutnya
mengizinkan L1 lalu L2 lokal; perubahan lain tetap dicatat sebagai belum
diterapkan. Pengujian browser ditangani kolega, bukan dinyatakan lulus dari
pembacaan CSS atau keberhasilan build. Hasil kode L2, identitas build, dan
batas pemeriksaannya dicatat pada entri terbaru WORK_LOG.
Tidak ada restart atau deployment produksi sebelum preview, tes, review visual,
dan izin eksplisit pemilik.

## 11. Rencana lanjutan: pill, aktivitas, dan bubble karakter

Pemilik mengonfirmasi enam pilihan melalui dua popup. Bagian ini mengorganisasi
perbaikan berikutnya pada T4/T5/T6. Setelah konfirmasi opsi 1, implementasi L1
lokal dimulai; CSS dan assertion smoke sudah ditambahkan, tetapi penerimaan
browser masih menunggu kolega. Konfirmasi berikutnya mengizinkan implementasi
L2 lokal; L3 sampai L7 belum dimulai pada slice L2.
Desain hasil kolega, lima identitas, denah, kamera, dan kontrak API dipertahankan.

Pemilik menolak hasil L1 awal berdasarkan dua screenshot: Nova turun baris
sendiri dan panel mobile hilang setelah pemilihan kartu. Dua jawaban popup
berikutnya menetapkan reflow seragam seluruh strip dan drawer/dock yang selalu
terjangkau. Koreksi lokal mencakup pengukuran header bersama, font status sistem
rujukan, state panel tunggal, dan regresi resize/klik kartu/Escape. Ini belum
merupakan penerimaan visual; hasil check dan identitas build dicatat di WORK_LOG.
Screenshot Nova berikutnya masih berasal dari build preview lama. Pemilik lalu
mengonfirmasi gaya kartu rujukan dan pill `Menunggu` dengan arti penuh pada DOM.

| Urutan           | Irisan kerja                                                  | Hasil yang perlu dibuktikan                                                                                                                          |
| ---------------- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| L1 / T4          | Reflow pill dan tinggi kartu menurut REQ-22c                  | Nama/status utuh saat resize, termasuk Menunggu keputusan dan Status belum tersedia; carousel/dock tidak bertabrakan                                 |
| L2 / T5          | Pisahkan status API, aktivitas visual lokal, dan jenis bubble | Aktivitas dekoratif tidak menimpa state/task/feed; koneksi/freshness dan reduced motion tetap mengendalikan suasana                                  |
| L3 / T5          | Controller jalur, tujuan, okupansi, pose, dan kegiatan dasar  | Berjalan, sofa/TV-balapan, kopi, baca, meeting; kaki menapak, badan menghadap benar, kursi tidak ganda; DOM status berubah segera saat kembali kerja |
| L4 / T5          | Sinkronkan subteks kartu, dialog bergantian, dan bubble kerja | Aktivitas visual cocok dengan kartu; Suasana ilustratif dan Deskripsi peran dibedakan; status berubah membatalkan dialog/timer lama                  |
| L5 / T4/T5       | Prioritas, kuota, dan penempatan bubble responsif             | Maksimal dua desktop/satu ponsel; prioritas terpilih atau kerja; tidak menutupi HUD/name tag dan detail tetap dapat dibaca di DOM                    |
| L6 / T6          | Handoff verifikasi ke kolega lalu review pemilik              | Check, browser/e2e, resize/zoom teks, transisi status, offline/stale/reduced motion, console dan screenshot dilaporkan terhadap build yang sama      |
| L7 / T5 lanjutan | Game/gitar setelah gerak dan pose dasar stabil                | Aset/pose punya kebutuhan jelas; tetap dekoratif dan memakai penghentian suasana yang sama                                                           |

Urutan ini mendahulukan keluhan overflow yang berdiri sendiri sebelum memperluas
gerak. Status operasional terpisah mencegah kegiatan santai dibaca sebagai kerja
nyata. Kuota dan prioritas bubble menjaga scene terbaca ketika beberapa karakter
berdekatan. Game/gitar ditunda agar gerak dan pose dasar dapat ditinjau lebih dulu.

Ownership implementasi berikutnya tetap mengikuti module boundaries: objek,
rute, seat, dan pose pada scene; kartu serta bubble DOM pada UI; koordinasi dalam
loop aplikasi yang sudah ada; proyeksi publik tetap di server. Tidak membuat
render loop kedua atau field agent.activity semu. Scheduler dan bubble punya
timer/lifecycle yang dibersihkan saat status berubah, tab tersembunyi, atau
scene dilepas. Rute/posisi dari controller tidak boleh ditimpa allocator seat
setiap frame.

Pengujian browser dijalankan kolega sesuai pilihan pemilik. Laporan harus
menyebut perintah/outcome, commit atau identitas build, viewport, keadaan API,
console, screenshot, serta temuan reproduktif. Status panjang dan resize di
antara breakpoint diperiksa, bukan hanya gambar pada lima lebar tetap. Jangan
memodifikasi ledger atau menjalankan worker untuk memunculkan keadaan uji.
Tanpa laporan tersebut, implementasi tetap belum terverifikasi; deployment
memerlukan review preview dan izin terpisah.

Status L2 lokal pada 3 Oktober 2026: pemisahan operational/visual, jenis bubble,
gate freshness/visibility/reduced motion, cancellation polling, dan lifecycle
label sudah diterapkan. Subteks hanya menyebut pose yang benar-benar ada atau
uraian role statis; ini bukan implementasi kegiatan/dialog baru L3/L4.
Scoped lint/format, 153 unit test, dan build terisolasi lulus. Check seluruh repo
masih terhenti pada artefak QA lama, dan browser belum dijalankan Codex.
Preview 8099 memakai JS `index-D6Y73iqy.js` dengan CSS lama tetap.
Hasil lengkap dan arahan kolega ada di
[handoff L2](../reports/2026-10-03-l2-handoff.md) serta WORK_LOG; keputusan batas
dicatat pada [ADR 0009](../decisions/0009-client-presentation-and-ambience-gates.md).
Penerimaan L2 tetap menunggu laporan browser dan review pemilik.

### Kelanjutan L3 sampai L5

Mandat lokal meliputi controller rute dan reservasi, gerak serta kegiatan dasar,
dialog lokal bergantian, narasi kartu/panel, dan satu coordinator bubble. Desain
kartu L1, empat meja, identitas, kamera, monitor, papan, serta sumber API tetap.
Game/gitar tetap L7. Bekerja memakai Deskripsi peran karena API belum memiliki
ringkasan tugas yang lebih spesifik.

Controller scene memiliki posisi/heading karakter; allocator bootstrap tidak
lagi dipanggil dalam loop aktif. Jalur menggunakan clearance furnitur dan
reservasi tujuan; akses kursi menjadi segmen khusus untuk docking/egress.
Keadaan tidak segar atau reduced motion membekukan perpindahan pada posisi
aman saat ini tanpa teleport ke anchor. Kembali bekerja menggunakan rute ke
workstation atau papan. Lokasi netral empat role saat menunggu/gagal tetap
memerlukan review preview, bukan keputusan workflow baru.

Parameter awal dialog (warmup 12 detik, giliran 6,5 detik, jeda 1,5 detik,
cooldown 35 sampai 65 detik) diganti oleh revisi cadence pada REQ-19b.
Peserta tetap siaga, diam, di zona sama, dan dalam jarak 2,5 unit. Komentar
lokal mengikuti kedatangan fisik baru, bukan respons API. Ini parameter suasana,
bukan durasi kerja nyata. Balasan dibatalkan saat keadaan peserta atau gate
berubah; dialog tidak masuk feed.

Desain bubble terbaru mengikuti rujukan: putih, border krem, padding 6px 10px,
radius 12px, tail kecil, font sistem setara 11,5px pada desktop dan 10,5px
pada mobile. Lebar maksimum 220px/150px, mengikuti viewport dan zoom teks.
Label kecil Suasana ilustratif atau provenance kerja/event tetap terlihat.
Balasan diprioritaskan atas pembuka saat prioritas setara; pilihan karakter dan
informasi kerja tetap lebih tinggi. Kuota atau occlusion dapat menyembunyikan
salah satu ucapan, tetapi kalimat yang sudah diucapkan tetap tersedia di DOM.

Bubble kerja, event publik baru, dan dialog memiliki kuota bersama. Event
bootstrap/lama tidak diputar sebagai aktivitas baru; kandidat event bertahan
4,8 detik hanya bila timestamp-nya berada dalam 15 detik dari snapshot publik.
Bubble yang tidak memperoleh tempat aman disembunyikan di scene, bukan
menutupi HUD. Narasi karakter terpilih tetap dapat dibaca di panel Tugas.
Pemilihan kartu, tubuh, name tag, dan pelepasan fokus memakai state DOM yang
sama sehingga judul tab, rincian, dan prioritas bubble tidak berbeda role.

Status penerimaan: seluruh pengujian ditunda kepada kolega atas instruksi
pemilik. Kemulusan, grounding kaki, clearance docking, occupancy, penempatan
bubble, kontras, zoom, serta recovery lifecycle belum dinyatakan lulus.
Detail implementasi/build dan arahan uji dicatat pada
[handoff L3 sampai L5](../reports/2026-10-03-l3-l5-handoff.md). Handoff L2 tetap
menjadi bukti untuk build L2, bukan bukti kelayakan build baru.

Revisi cadence/bubble rujukan telah diterapkan lokal sesuai jawaban popup
terbaru. Detail build, parameter, dan pengujian yang masih menunggu berada di
[handoff revisi](../reports/2026-10-03-reference-motion-bubbles-handoff.md).
Handoff L3 sampai L5 pertama dipertahankan sebagai bukti historis sebelum
revisi, bukan target tempo atau bukti runtime untuk bundle terbaru.
