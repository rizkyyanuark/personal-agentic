# Spec Delta

## Purpose

Menghasilkan percakapan santai lokal yang mengikuti isi dan ritme kantor-agent pada revisi referensi, tetap dapat dihentikan oleh state aplikasi dan tidak menyamar sebagai respons model AI.

## ADDED Requirements

### Requirement: Reference conversation timing
Scheduler SHALL mencoba percakapan pertama setelah 4 detik waktu aktif sejak inisialisasi dan percobaan berikutnya setiap acak 7–11.5 detik dari percobaan sebelumnya. Pembuka SHALL tampil 4.8 detik; balasan SHALL mulai 2.3 detik sejak pembuka dan tampil 4.2 detik.

#### Scenario: Eligible pair is available
- **WHEN** dua karakter santai memenuhi syarat pada pemicu percakapan
- **THEN** pembuka muncul pada waktu pemicu dan balasan mulai 2.3 detik sesudahnya
- **AND** kedua bubble bertumpang tindih selama 2.5 detik, pembuka berakhir pada 4.8 detik dan balasan pada 6.5 detik sejak pembuka

#### Scenario: No eligible pair at an attempt
- **WHEN** waktu percobaan tiba tetapi peserta memenuhi syarat kurang dari dua
- **THEN** tidak ada percakapan dibuat dan percobaan berikutnya dijadwalkan dalam rentang 7–11.5 detik

#### Scenario: Timing is observed in the real application
- **WHEN** timestamp bubble diukur dalam tab terlihat dengan data segar dan rendering normal
- **THEN** waktu tampil/mulai/akhir mengikuti target dengan toleransi observasi 250 ms
- **AND** interval acak berada pada rentang target tanpa menumpuk penundaan setelah stall render

### Requirement: Eligible leisure participants and reference selection
Percakapan SHALL memilih karakter santai yang sudah tiba di spot, tidak berjalan, dan tidak memiliki bubble aktif. Spot gitar/jendela SHALL tetap memenuhi syarat. Pemilihan lawan bicara SHALL memakai 70 persen cabang terdekat dan 30 persen acak dari semua calon lain, termasuk calon terdekat.

#### Scenario: Guitar or window actor is available
- **WHEN** karakter di gitar/jendela dan satu karakter santai lain memenuhi syarat
- **THEN** keduanya dapat dipilih untuk percakapan tanpa pengecualian berdasarkan jenis spot

#### Scenario: Existing bubble reserves a participant
- **WHEN** karakter masih memiliki bubble aktif saat pemilihan peserta
- **THEN** karakter tersebut tidak dipilih untuk menimpa bubble yang sedang tampil

### Requirement: Reference text and arrival quips
Dialog pasangan dan celetukan per spot SHALL memakai katalog kantor-agent commit ad92a7a473b3d0e769281d552cee74cbb4004a54 dengan nama karakter lokal. Celetukan SHALL dicoba dengan probabilitas 55 persen setelah kedatangan bergerak yang memenuhi syarat, tanpa pengulangan berbasis timer selama menetap.

#### Scenario: Character arrives at a leisure spot
- **WHEN** karakter selesai berjalan ke spot, tidak memiliki bubble aktif, dan hasil pilihan probabilitas memenuhi 55 persen
- **THEN** satu celetukan dari katalog spot tampil selama 4.2 detik
- **AND** spot yang tidak memiliki katalog menggunakan fallback referensi

#### Scenario: Character remains at a spot
- **WHEN** karakter tetap berada di spot tanpa kedatangan baru
- **THEN** tidak ada celetukan baru yang dipicu hanya karena 14 detik telah berlalu
- **AND** percakapan pasangan tetap dapat terjadi sesuai scheduler

#### Scenario: Initial placement is instantaneous
- **WHEN** karakter ditempatkan langsung saat tampilan pertama dibuka
- **THEN** penempatan tersebut tidak dianggap kedatangan bergerak untuk memicu celetukan

### Requirement: Dialogue respects operational and lifecycle gates
Dialog SHALL berlabel suasana ilustratif dan hanya berjalan ketika data segar, tab terlihat, serta ambient motion diizinkan. Peserta yang mulai bekerja, berjalan, atau kehilangan kelayakan SHALL menghentikan percakapannya sebelum balasan tertunda terbit.

#### Scenario: Work interrupts a pending reply
- **WHEN** salah satu peserta menerima kerja sebelum balasan muncul
- **THEN** bubble santai dan balasan tertunda untuk percakapan itu dibatalkan
- **AND** tidak ada event pekerjaan, output AI, atau keberhasilan run yang dibuat dari dialog lokal

#### Scenario: Lifecycle invalidates pending conversation
- **WHEN** tab tersembunyi, reduced motion aktif, data kedaluwarsa, workspace/filter berubah, atau scene dibuang
- **THEN** percakapan dan callback tertunda dibersihkan tanpa mengejar percakapan yang terlewat
- **AND** scene baru tidak menerima bubble dari instance sebelumnya
