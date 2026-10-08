# ADR 0009: pemisahan fakta publik dan suasana client

Tanggal: 3 Oktober 2026 (WIB).
Status: implementasi lokal L2 atas konfirmasi pemilik; penerimaan browser menunggu kolega.

## Konteks

Kartu membaca `agent.activity` meskipun field itu tidak ada pada kontrak publik.
Narasi lounge dan pemantauan juga muncul tanpa bukti pose atau pekerjaan yang
sesuai. Bubble dari feed tidak membedakan riwayat event dengan aktivitas saat
ini. Gate seat dan TV belum mempertimbangkan `queue.stale` atau lifecycle tab.

Pemilik mengizinkan L2 pada kebutuhan v3, mempertahankan desain yang sudah
dipilih, dan menyerahkan pengujian browser kepada kolega setelah implementasi.

## Keputusan

Satu model presentasi pada UI client memiliki tiga sumber yang terpisah:

- `operational`: hanya state dan kalimat status generik dari snapshot publik
  yang tervalidasi. Tidak ada goal, payload, `activity`, atau pekerjaan dari feed.
- `visual`: jenis pose lokal yang benar-benar dilaporkan scene melalui daftar
  terbatas. Copy tetap berlabel Suasana ilustratif dan tidak ditulis ke ledger.
- Bubble bertipe: event berlabel Riwayat publik, uraian role berlabel Deskripsi
  peran, serta jalur terpisah untuk tugas publik dan dialog ilustratif. L2 tidak
  menambah sumber ringkasan tugas atau scheduler dialog.

Suasana membutuhkan pembacaan sukses `live` atau `empty`, `queue.stale` tepat
nol, dan tab terlihat. Error, offline, data usang, atau tab tersembunyi menutup
gate dan membuang narasi lokal serta bubble yang sudah tidak sesuai. Tab yang
kembali terlihat menunggu pembacaan valid berikutnya, bukan memakai freshness
lama. Stop polling membatalkan request berjalan; respons generasi lama tidak
boleh memperbarui halaman yang sudah dihentikan atau dipulihkan.

Reduced motion menutup gate gerak berulang, bukan mengubah status API. Sofa
yang ditempati pada data segar tetap dapat mempertahankan pose statis dan
balapan beku. Status DOM serta polling tetap diperbarui. Data yang tidak segar
menggunakan anchor netral desk/HQ tanpa mengganti state snapshot.

Pose, TV, dan monitor memakai policy yang sama dalam render loop yang sudah
ada. Tidak ada loop, layanan, dependency, aset, atau field publik baru. Timer
bubble dibatalkan saat perubahan status/gate dan dilepas pada teardown; BFCache
menjaga label dapat digunakan kembali tetapi membutuhkan polling baru.

## Konsekuensi

Desain kartu, CSS, denah, kamera, identitas, dan pemetaan server dipertahankan.
Copy kartu membedakan fakta status, uraian role statis, dan pose ilustratif.
Feed tidak pernah menjadi tugas aktif atau menerima event dekoratif.

Controller jalur/kegiatan dasar L3, dialog dan bubble kerja L4, serta kuota dan
penempatan L5 tetap pekerjaan berikutnya. Uraian role sudah tersedia pada model
dan DOM; kemunculan bubble kerja terkoordinasi di scene belum diklaim selesai.
Gate kode yang terhalang artefak QA lama dan semua pemeriksaan browser harus
dilaporkan jujur. Keputusan ini tidak mengizinkan deployment produksi.
