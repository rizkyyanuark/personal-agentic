# Spec Delta

## Purpose

Menjaga keterbacaan dan keselarasan visual karakter, properti, serta tata letak area pantry dalam Live Office tanpa mengubah eksekusi pekerjaan agen.

## ADDED Requirements

### Requirement: Guitar follows the character and hand contact
Live Office SHALL menjaga gitar mengikuti torso karakter dan menempatkan tangan penahan pada neck serta tangan pemetik pada area senar selama kegiatan bermain gitar. Sesuai refine-live-office-presentation, gitar SHALL tidak dicerminkan, neck naik ke kiri anatomis karakter (+X pada rig yang menghadap +Z), dan kontak telapak SHALL tetap mengikuti prop termasuk saat transisi pose.

#### Scenario: Character plays guitar
- **WHEN** karakter sudah tiba di spot gitar dan melakukan animasi petikan
- **THEN** gitar mengikuti torso, tangan penahan tetap pada neck, dan tangan pemetik bergerak di area senar
- **AND** render dari kamera utama, depan, serta samping tidak memperlihatkan gitar melayang atau penetrasi torso/lengan yang mencolok

#### Scenario: Character leaves guitar activity
- **WHEN** karakter mulai berjalan atau menerima pekerjaan
- **THEN** gitar disembunyikan dan pose tangan kembali mengikuti kegiatan barunya tanpa properti tertinggal

### Requirement: Workstations have no desk mat
Seluruh workstation SHALL menampilkan permukaan meja tanpa mousepad atau desk mat, dengan keyboard serta mouse bertumpu pada permukaan meja.

#### Scenario: Office is rendered
- **WHEN** empat workstation ditampilkan dari kamera utama dan close-up
- **THEN** tidak ada desk mat pada meja mana pun
- **AND** keyboard dan mouse tidak melayang, menembus permukaan, atau kehilangan interaksi fokus meja

### Requirement: Pantry and adjacent pot match reference positions
Live Office SHALL menempatkan pusat counter pantry pada X/Z (8.2, -6.45) dan pot samping pantry pada (6.6, -6.4), mengikuti kantor-agent commit ad92a7a473b3d0e769281d552cee74cbb4004a54, dengan prop dan karakter tetap berada dalam batas ruang lokal.

#### Scenario: Pantry layout is displayed
- **WHEN** pantry dan pot ditampilkan
- **THEN** posisi world counter dan pot sesuai target X/Z dengan toleransi 0.01 unit
- **AND** pot bertumpu pada lantai tanpa bertabrakan dengan kabinet atau menembus dinding
- **AND** penyesuaian batas dinding tidak diam-diam menggeser target counter

#### Scenario: Character uses relocated pantry
- **WHEN** karakter berjalan menuju kopi atau air, berinteraksi, lalu meninggalkan pantry
- **THEN** tujuan, arah hadap, dan jalur sesuai prop aktual
- **AND** karakter tidak menembus counter, pot, atau dinding dan tidak terjebak menunggu rute

#### Scenario: Relocation is viewed on a phone
- **WHEN** pengguna membuka Live Office pada viewport ponsel dan memfokuskan karakter di pantry
- **THEN** kamera dan kontrol tetap dapat dipakai untuk memeriksa karakter serta kegiatan pantry
