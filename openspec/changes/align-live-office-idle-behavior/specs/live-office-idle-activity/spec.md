# Spec Delta

## Purpose

Memberi pengguna keterangan kegiatan karakter yang sesuai dengan scene pada kartu dan detail selama Live Office terbuka, sambil mempertahankan makna state operasional agen.

## ADDED Requirements

### Requirement: Idle descriptions follow the visible activity
Kartu dan detail karakter SHALL menampilkan kegiatan santai aktual beserta lokasi atau tujuan yang relevan. Keterangan SHALL membedakan TV, PS, kopi, air, gitar, jendela, membaca, meeting, dan perpindahan.

#### Scenario: Character settles at an activity spot
- **WHEN** karakter tiba dan mulai melakukan salah satu kegiatan santai
- **THEN** kartu dan detail menampilkan keterangan yang sama maknanya dengan scene
- **AND** PS dibedakan dari sekadar duduk di sofa, air dari kopi, dan gitar dari menunggu tugas

#### Scenario: Character is walking to another spot
- **WHEN** karakter meninggalkan spot dan berjalan ke tujuan baru
- **THEN** keterangan menyebut sedang menuju tujuan tersebut
- **AND** UI belum mengklaim karakter melakukan kegiatan di tujuan sebelum tiba

#### Scenario: Character has no valid activity
- **WHEN** belum ada kegiatan scene yang valid untuk karakter
- **THEN** UI memakai keterangan netral yang jujur dan tidak menebak lokasi atau kegiatan

### Requirement: Leisure stays outside work history
Kegiatan santai SHALL hanya berada pada kartu/detail dan SHALL tidak menambahkan event pada panel aktivitas kerja. Riwayat pekerjaan nyata SHALL tetap tersedia setelah reload dalam workspace/filter yang benar. Ini mengikuti revisi pemilik pada describe-live-office-work-activity; buffer feed visual awal tidak lagi berlaku.

#### Scenario: Activity changes once
- **WHEN** karakter mulai berjalan atau tiba dan memulai kegiatan santai baru
- **THEN** kartu/detail menyesuaikan keterangan tanpa menambah baris feed kerja atau counter run/token

#### Scenario: Office initially opens or reloads
- **WHEN** pengguna membuka ulang atau mengganti workspace/filter grup
- **THEN** kartu/detail menjelaskan scene terkini dan feed memuat riwayat kerja dari konteks yang benar
- **AND** callback instance lama tidak menambahkan kegiatan ke konteks baru

### Requirement: Operational state takes precedence
Live Office SHALL membedakan kegiatan santai ilustratif dari pekerjaan agen. Kerja aktif, kegagalan, kebutuhan jawaban, dan ketidaktersediaan SHALL mempertahankan keterangan operasional yang benar dan tidak tertutup oleh kegiatan santai lama.

#### Scenario: Real work interrupts leisure
- **WHEN** snapshot nyata menyatakan agen mulai bekerja atau menunggu jawaban/delegasi
- **THEN** keterangan santai diganti sesuai state operasional pada pembaruan UI berikutnya
- **AND** animasi kembali mengikuti jalur kerja tanpa membuat pesan, run, atau angka tugas selesai dari kegiatan visual

#### Scenario: Connection is stale or lost
- **WHEN** data tidak lagi segar atau koneksi terputus
- **THEN** UI menunjukkan ketidaktersediaan/kedaluwarsaannya dan berhenti membuat transisi santai baru
- **AND** keterangan lama tidak diklaim sebagai kegiatan terkini yang terverifikasi

#### Scenario: Tab is hidden or reduced motion is requested
- **WHEN** tab disembunyikan atau reduced motion aktif
- **THEN** visual mengikuti gate aplikasi yang ada tanpa membuat transisi berjalan palsu atau backlog feed
- **AND** setelah tab kembali, status terkini disinkronkan sebelum kegiatan visual dilanjutkan
