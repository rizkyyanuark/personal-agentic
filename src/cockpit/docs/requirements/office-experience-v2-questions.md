# Klarifikasi: kantor 3D dan identitas agent

Status: keputusan versi pertama lengkap untuk
[PRD kantor 3D](office-experience-v2.md). Pemilik telah menjawab 47 pertanyaan;
Q15 tentang kartu individual tidak berlaku untuk papan agregat dan ditunda.
Rekomendasi yang diterima secara eksplisit dicatat sebagai keputusan.

Ada 48 pertanyaan yang dikelompokkan menurut dependensi. Daftar ini menyimpan
jejak keputusan sebelum implementasi. Jika ingin mengubah pilihan, sebut nomor
pertanyaan dan keputusan penggantinya, misalnya `Q20: ...`.

## A. Arah dan keputusan awal

### Q01. Seberapa dekat tata ruang mengikuti referensi?

Keputusan: susun ulang ruangan agar meja, sofa, jendela, papan, dan pantry sedekat
mungkin dengan komposisi referensi. Status: dijawab pemilik.

### Q02. Bagaimana tahap tugas yang belum tersedia ditampilkan?

Keputusan: tampilkan tahap yang tersedia; tahap tanpa sumber bertuliskan Belum
tersedia, lalu definisikan kebutuhan data tambahannya. Status: dijawab pemilik.

### Q03. Bagaimana perilaku karakter siaga?

Keputusan: gerak kecil sesuai status nyata; sofa sebagai pose siaga tanpa mengklaim
jadwal istirahat agent. Status: dijawab pemilik.

### Q04. Bagaimana workstation masuk ke komposisi referensi?

Keputusan: dua klaster masing-masing tiga workstation, HQ tidak diberi meja;
meeting kiri, lounge depan, pantry kanan belakang. Status: dijawab pemilik.
Enam workstation dan tujuh karakter/kartu role mengganti asumsi tujuh meja.

### Q05. Apakah nama usulan agent sesuai?

Keputusan: nama karakter fiksi Orion (HQ), Nova (DE), Atlas (DS), Lyra (RS),
Axiom (MLE), Vega (MV), Echo (OPS). Nama adalah identitas karakter agent.
Status: dijawab pemilik; set nama manusia Indonesia dan set Nexus tidak dipakai.

### Q06. Seberapa ilustratif monitor kedua boleh terlihat?

Keputusan: schematic berbeda per role dengan label Tampilan ilustratif;
status dan ringkasan live tetap berasal API. Status: dijawab pemilik.
Ada enam monitor kerja; HQ tanpa workstation memakai label/DOM.

### Q07. TV lounge menampilkan apa?

Keputusan: tampilan Netflix-style yang berubah menjadi balapan ketika ada karakter
duduk. Status: dijawab pemilik. Q47/Q48 menetapkan animasi dan trigger occupancy.

### Q08. Bagaimana pemandangan luar jendela?

Keputusan: luar jendela berubah siang/malam sesuai WIB, interior tetap nyaman dibaca.
Status: dijawab pemilik.

### Q09. Apa acuan lokasi tiga pot dan nasib pot tambahan?

Keputusan: kiri/kanan dari kamera home; satu kiri sofa, satu kanan bawah frame,
satu samping bookshelf; kurangi pot besar lain jika mengganggu.
Status: dijawab pemilik.

## B. Data dan interaksi papan tugas

| ID  | Pertanyaan                                          | Rekomendasi A dan alasannya                                                                                                 | Alternatif B                                                   | Status                                                      |
| --- | --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ----------------------------------------------------------- |
| Q10 | Bolehkah kolom Rencana memakai queued?              | Keputusan: tidak; Rencana khusus planning dan tampilkan Belum tersedia sampai sumber planning ada.                          | Queued tetap di footer/ringkasan antrean, bukan kolom Rencana. | Dijawab                                                     |
| Q11 | Papan berupa jumlah per kolom atau kartu per tugas? | Keputusan: agregat per kolom + footer perhatian, rincian di DOM.                                                            | Kartu individual tidak termasuk versi pertama.                 | Dijawab                                                     |
| Q12 | Di mana failed/waiting approval/stale ditampilkan?  | Keputusan: footer perhatian di papan untuk failed, waiting approval, stale, dan antrean; tidak dimasukkan ke QA/Selesai.    | Alternatif tidak dipilih untuk versi pertama.                  | Dijawab                                                     |
| Q13 | Papan mencakup tugas dari mana?                     | Keputusan: semua runtime yang sudah dikonfigurasi, sama dengan scope API saat ini; tidak menambah runtime.                  | Alternatif tidak dipilih untuk versi pertama.                  | Dijawab                                                     |
| Q14 | Apakah papan dapat diklik?                          | Keputusan: papan visual non-interaktif; rincian lewat panel antrean yang sudah ada. Data agregat tetap diperbarui dari API. | Alternatif tidak dipilih untuk versi pertama.                  | Dijawab                                                     |
| Q15 | Jika nanti ada kartu, berapa yang tampil di 3D?     | Maksimal tiga per kolom dan indikator sisa; daftar lengkap di DOM.                                                          | Hanya jumlah di 3D, seluruh kartu berada di DOM.               | Tidak berlaku untuk versi agregat; keputusan tahap lanjutan |

QA memerlukan definisi stage di sumber runtime. Waiting approval atau nama role
Model Validator tidak cukup untuk menyimpulkan suatu tugas sedang diuji.

## C. Waktu, wallpaper, layar kerja, dan TV

| ID  | Pertanyaan                                        | Rekomendasi A dan alasannya                                                                                                                                     | Alternatif B                                                             | Status  |
| --- | ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ------- |
| Q16 | Waktu berasal perangkat atau disinkronkan server? | Keputusan: jam perangkat pengguna saja, selalu Asia/Jakarta.                                                                                                    | Koreksi server tidak dipakai; waktu API tetap timestamp snapshot ledger. | Dijawab |
| Q17 | Bentuk jam dinding dan gerak detiknya?            | Keputusan: analog seperti referensi, jarum detik tick tiap detik, tulisan WIB.                                                                                  | Digital tidak dipilih.                                                   | Dijawab |
| Q18 | Apa isi lock screen monitor pertama selain HH:mm? | Keputusan: nama, status, tanggal kecil; HH:mm besar di tengah.                                                                                                  | Uptime/durasi sesi tidak ditambahkan.                                    | Dijawab |
| Q19 | Wallpaper warna role seperti apa?                 | Keputusan: gradient lembut sesuai warna role.                                                                                                                   | Warna solid tidak dipilih.                                               | Dijawab |
| Q20 | Di sisi mana monitor jam berada?                  | Keputusan: monitor jam kiri dari sudut pengguna yang duduk; monitor pekerjaan kanan.                                                                            | Alternatif tidak dipilih untuk versi pertama.                            | Dijawab |
| Q21 | Apakah enam schematic pekerjaan pada PRD cocok?   | Keputusan: Nova pipeline, Atlas notebook/statistik, Lyra bacaan riset, Axiom build/train/infer, Vega checklist, Echo layanan/pipeline; tema gelap matching job. | Seluruhnya berlabel ilustratif dengan status API.                        | Dijawab |
| Q22 | Apakah layar kerja bergerak saat agent bekerja?   | Keputusan: gerak ringan hanya saat bekerja.                                                                                                                     | Tidak memakai progress/hasil rekaan.                                     | Dijawab |
| Q23 | Judul/artwork katalog Netflix-style apa?          | Keputusan: artwork lokal dan judul fiksi yang jelas dekoratif, tampilan Netflix-style.                                                                          | Alternatif tidak dipilih untuk versi pertama.                            | Dijawab |
| Q24 | Apakah TV perlu kontrol focus tambahan?           | Keputusan: TV dapat difokuskan melalui klik/tombol DOM; mode layar tetap mengikuti occupancy, bukan kontrol game.                                               | Alternatif tidak dipilih untuk versi pertama.                            | Dijawab |

Jam adalah waktu WIB, bukan timer lama bekerja. Resolusi monitor 768×480 tetap
baseline; detail yang tidak terbaca diselesaikan dengan layout/ukuran huruf sebelum
menaikkan texture. Windows-style berarti komposisi lock screen, bukan kebutuhan
mengambil logo, wallpaper, font proprietary, atau asset OS.

## D. Karakter dan perilaku duduk

| ID  | Pertanyaan                                        | Rekomendasi A dan alasannya                                                                      | Alternatif B                                             | Status  |
| --- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------ | -------------------------------------------------------- | ------- |
| Q25 | Pertahankan bentuk karakter atau ganti model?     | Keputusan: pertahankan karakter stylized sekarang, perbaiki pose/rig.                            | Model baru tidak dipilih.                                | Dijawab |
| Q26 | Saat sofa penuh, agent siaga ditempatkan di mana? | Keputusan: sofa penuh → tetap duduk di workstation; seat reservation mencegah tumpukan.          | Alternatif tidak dipilih untuk versi pertama.            | Dijawab |
| Q27 | Bagaimana agent berpindah meja ke sofa?           | Keputusan: penempatan dan pose deterministik dahulu; jalur berjalan setelah denah/seat stabil.   | Tidak mengerjakan walking/navigation pada versi awal.    | Dijawab |
| Q28 | Apakah skin tone dan rambut diubah?               | Keputusan: variasi rambut/skin tone tetap.                                                       | Aksesori baru belum diminta.                             | Dijawab |
| Q29 | Warna pakaian mengikuti warna role persis?        | Keputusan: mengikuti keluarga warna role dengan tint material wajar.                             | Tidak harus nilai warna rendered identik antar-material. | Dijawab |
| Q30 | Bagaimana prop tangan saat duduk?                 | Keputusan: tangan bekerja dekat keyboard; mug tetap di meja, tidak berpindah otomatis ke tangan. | Alternatif tidak dipilih untuk versi pertama.            | Dijawab |

Pose failed dan waiting approval tetap mempunyai label status benar. Tidak ada
percakapan acak yang mengaku agent sedang minum, bermain, atau menjalankan task.
Reduced motion tidak boleh mengembalikan karakter ke pose berdiri di kursi/sofa.

## E. Pantry, tanaman, identitas, dan meja

| ID  | Pertanyaan                                           | Rekomendasi A dan alasannya                                                                               | Alternatif B                                  | Status  |
| --- | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | --------------------------------------------- | ------- |
| Q31 | Peralatan pantry mana yang wajib?                    | Keputusan: kabinet putih, counter kayu, mesin kopi, grinder kecil, rak mug, dispenser berdiri di samping. | Alternatif tidak dipilih untuk versi pertama. | Dijawab |
| Q32 | Seberapa dekat pantry ke dinding?                    | Keputusan: celah fisik kecil agar tidak menembus dinding; target 2–5 cm diuji terhadap ukuran asset.      | Alternatif tidak dipilih untuk versi pertama. | Dijawab |
| Q33 | Apakah mesin kopi/dispenser perlu animasi atau klik? | Keputusan: pantry statis; komposisi/proporsi diperbaiki tanpa animasi atau klik baru.                     | Alternatif tidak dipilih untuk versi pertama. | Dijawab |
| Q34 | Pot dan tanaman seperti apa?                         | Keputusan: pot terracotta dengan daun hijau lebar seperti referensi; share model/material.                | Alternatif tidak dipilih untuk versi pertama. | Dijawab |
| Q35 | Bagaimana HQ tanpa meja diberi identitas?            | Keputusan: Orion + Lab Director pada label/DOM, dengan badge HQ kecil.                                    | Alternatif tidak dipilih untuk versi pertama. | Dijawab |
| Q36 | Nama muncul di mana selain name tag?                 | Keputusan: nama konsisten di kartu, label karakter, wallpaper, dan panel detail; jabatan tetap terlihat.  | Alternatif tidak dipilih untuk versi pertama. | Dijawab |
| Q37 | Palette role sekarang dipertahankan?                 | Keputusan: pertahankan tujuh warna kanonis pada F08, konsisten pada scene dan DOM.                        | Alternatif tidak dipilih untuk versi pertama. | Dijawab |
| Q38 | Bahasa jabatan dan nama pada name tag?               | Keputusan: nama pendek dan jabatan Inggris kanonis sesuai role runtime.                                   | Alternatif tidak dipilih untuk versi pertama. | Dijawab |
| Q39 | Berapa banyak dekor khas per workstation?            | Keputusan: mug warna role wajib, ditambah satu–dua prop khas per meja sesuai F08.                         | Alternatif tidak dipilih untuk versi pertama. | Dijawab |
| Q40 | Tingkat detail enam meja dibanding prototype DE?     | Keputusan: kelengkapan dasar enam meja setara, variasi prop tanpa tambahan glow/cable animation.          | Alternatif tidak dipilih untuk versi pertama. | Dijawab |

Mug warna role dan name tag nama+jabatan sudah diminta eksplisit, sehingga tidak
ditanyakan ulang apakah keduanya perlu ada. Model minuman tidak otomatis berarti
agent benar-benar melakukan aktivitas minum di runtime.

## F. Review hasil dan delivery

| ID  | Pertanyaan                                               | Rekomendasi A dan alasannya                                                                                                            | Alternatif B                                  | Status  |
| --- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- | ------- |
| Q41 | Area mana yang paling penting terlihat dari kamera home? | Keputusan: home mengutamakan agent/papan; lounge, meeting, pantry tetap dikenali.                                                      | Alternatif tidak dipilih untuk versi pertama. | Dijawab |
| Q42 | Bagaimana detail papan/name tag dibaca di ponsel?        | Keputusan: scene mobile tetap utuh; tap focus dan baca teks lengkap pada DOM. Papan tetap non-interaktif, rincian lewat panel antrean. | Alternatif tidak dipilih untuk versi pertama. | Dijawab |
| Q43 | Perangkat dan viewport utama untuk benchmark?            | Keputusan: benchmark utama Chrome Windows scaling 150%, stage aktual dan desktop 1440; mobile/headless terpisah.                       | Alternatif tidak dipilih untuk versi pertama. | Dijawab |
| Q44 | Bagaimana asset/dependency baru dipilih?                 | Keputusan: asset lokal/geometri sendiri dahulu; asset baru hanya untuk kebutuhan nyata dan lisensi/attribution jelas.                  | Alternatif tidak dipilih untuk versi pertama. | Dijawab |
| Q45 | Bagaimana urutan review sebelum deployment?              | Keputusan: review denah → pose → satu meja → enam meja/HQ/papan → hasil utuh dan verifikasi sebelum deployment.                        | Alternatif tidak dipilih untuk versi pertama. | Dijawab |

## G. Klarifikasi setelah HQ tanpa meja dan TV balapan dipilih

| ID  | Pertanyaan                                | Keputusan pemilik                                                                       | Implikasi                                            | Status  |
| --- | ----------------------------------------- | --------------------------------------------------------------------------------------- | ---------------------------------------------------- | ------- |
| Q46 | Di mana lokasi utama HQ?                  | Berdiri dekat papan tugas sebagai koordinator.                                          | Focus kartu HQ menuju karakter; tidak menambah meja. | Dijawab |
| Q47 | Balapan animasi atau game interaktif?     | Animasi balapan dekoratif, aktif selama sofa ditempati; tanpa kontrol.                  | Tidak membutuhkan gameplay atau dependency baru.     | Dijawab |
| Q48 | Bagaimana trigger dan akhir mode balapan? | Sofa kosong → katalog; ada karakter duduk → balapan; reduced motion menghentikan gerak. | Uji occupancy dan reduced motion secara eksplisit.   | Dijawab |

## Status keputusan dan penggunaan saat implementasi

Keputusan tambahan, 29 September 2026:

- Kartu memfokuskan lokasi karakter saat ini; klik meja memfokuskan meja, termasuk saat karakter berada di sofa.
- Selesaikan kode T03 sampai T07 lebih dahulu, lalu uji kelayakan bersama. Urutan ini mengganti checkpoint review per-slice Q45, tanpa mengotorisasi deployment.

1. Q01 sampai Q14 serta Q16 sampai Q48 telah dijawab pemilik.
2. Q15 ditunda karena versi pertama hanya memakai agregat; kartu individual memerlukan scope dan kontrak baru.
3. Jawaban Q12/Q13/Q20/Q23/Q24/Q26/Q30/Q33/Q34/Q35/Q36/Q38/Q40/Q41/Q43/Q44 dikonfirmasi sebagai satu paket rekomendasi oleh pemilik.
4. Q14/Q31/Q32/Q37/Q39/Q42/Q45 telah dijawab tersendiri sebelum konfirmasi paket tersebut.
5. Review bertahap mengikuti Q45; dokumen ini tidak mengotorisasi implementasi, perubahan data privat, atau deployment dengan sendirinya.

Tidak ada pertanyaan versi pertama yang masih terbuka. Ukuran/posisi asset,
toleransi kontak pose, dan anggaran performa ditetapkan dari pengukuran serta review
slice, bukan dianggap angka terverifikasi hanya karena tercantum sebagai target.
