# ADR 0007: Lima role Hermes dan empat workstation v3

- Status: keputusan scope diterima; implementasi dan deployment belum terverifikasi
- Tanggal: 1 Oktober 2026 (WIB)

## Konteks

Pemilik memilih menyederhanakan AI/ML Lab dari tujuh role menjadi lima role
kerja nyata, dengan lima karakter kantor. Tujuannya ialah alur kerja dan denah
yang lebih sederhana. Hermes menjalankan worker per tugas; tujuh role lama
bukan tujuh proses yang selalu hidup. Tidak ada bukti untuk menjanjikan
penghematan token atau peningkatan frame rate tertentu dari perampingan ini.

Cockpit hanya membaca proyeksi ledger. Perubahan jumlah karakter tidak boleh
menghapus tugas atau event lama dari agregat dan tidak memberi browser hak
menjalankan worker atau menyetujui rilis.

## Keputusan

1. Target role aktif adalah Orion (HQ/Lab Director), Nova (Data Engineer),
   Atlas (Data Scientist), Lyra (Research Scientist), dan Axiom (ML Engineer).
   Agy personal-assistant pilot tetap terpisah dari Hermes AI Lab Suite.
2. Kantor v3 memiliki empat meja dalam dua baris masing-masing dua. Orion tidak
   mendapat meja. Meeting berada di kiri, lounge di depan, pantry di kanan
   belakang. Empat kartu agent menuju meja asal; kartu Orion menuju tengah
   ruang. Klik meja tetap menuju meja, terlepas dari posisi karakter.
3. Vega (Model Validator) dan Echo (MLOps & Platform) tidak menjadi karakter,
   kartu, atau workstation v3. Catatan ledger historis mereka tetap masuk
   agregat dan event publik yang lolos sanitasi dengan atribusi arsip yang
   benar; catatan itu tidak dipetakan ulang sebagai kerja salah satu role baru.
4. Tugas lama yang masih aktif harus diselesaikan atau dimigrasikan secara
   eksplisit sebelum role Hermes tersebut dinonaktifkan. Kontrak publik dan
   pengujian harus membuktikan bahwa ringkasan tidak kehilangan tugas dan
   tidak membocorkan payload privat.
5. Pemeriksaan QA dan rilis menjadi gerbang milik host yang terpisah dari
   pekerjaan pembuat artefak. Input, bukti, pemilik keputusan, dan tes kedua
   gerbang harus ditentukan sebelum pensiun role lama. Gerbang umum ini belum
   dinyatakan sudah terimplementasi; keputusan ini juga tidak mengizinkan
   deployment otomatis atau approval dari browser.
6. Telegram, R2, AWS Spot/Vast, FastAPI, MLflow baru, dan target latensi baru
   tidak masuk migrasi v3. Integrasi tersebut perlu keputusan scope terpisah.

## Konsekuensi dan pemeriksaan

Perubahan Hermes, proyeksi server, kontrak browser, dan scene harus dinilai
sebagai satu migrasi. Uji fixture historis dan aktif Vega/Echo, total agregat,
atribusi event, lima role live, empat meja, serta field privat yang dilarang
melintasi `/api/state`. Jangan menyebut v3 selesai bila salah satu lapisan
belum sinkron. Penghematan biaya atau performa baru dapat diklaim setelah
pengukuran. Preview, uji otomatis, dan review visual mendahului izin deployment
produksi yang terpisah.

ADR ini mencatat keputusan lima role, empat meja, dan batas migrasinya.
Rincian visual dan semantik lanjutan yang dikonfirmasi pemilik pada 3 Oktober
2026 tercatat dalam [kebutuhan v3](../requirements/office-experience-v3-kantor-agent.md)
dan [ADR 0008](0008-mobile-floating-ui-character-tracking-and-status-parity.md).
Klik tubuh/name tag dapat mengikuti karakter tanpa mengubah tujuan fokus kartu.
Penyelarasan dokumen ini tidak membuktikan migrasi runtime, kesiapan gerbang
host, penerimaan implementasi v3 penuh, atau izin deployment.
