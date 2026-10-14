# Evidence personal-agentic

Direktori ini menyimpan hasil pemeriksaan source/config dan eksekusi nyata yang mendukung kontrak perubahan, review atau penerimaan. Bukti inspeksi dapat dibuat sebelum Issue dipublikasikan, dengan scope dan identitas source yang jelas.

Fase pekerjaan berada pada GitLab Issue. Keputusan desain berada pada [ADR](../decisions/README.md). Scope dan acceptance berada pada [kontrak OpenSpec](../../openspec/README.md). Evidence mencatat apa yang diamati pada versi dan environment tertentu.

## Penamaan

Gunakan ev-<NNN>-<issue-atau-change-slug>.md. NNN adalah nomor urut tiga digit; slug mengaitkan bukti ke Issue, change atau review. Buat file ketika pemeriksaan benar-benar dilakukan, tanpa link placeholder ke proof yang belum tersedia.

## Isi bukti

Catat tanggal/waktu dan pemeriksa; Issue/change terkait; checkout, branch, SHA dasar serta commit yang diuji atau identitas dirty patch/source hash; environment/OS/transport; perintah atau user flow; output tersanitasi; hasil setiap skenario; mocks jika ada; dan batas bukti.

| Hasil | Arti |
| --- | --- |
| Passed | Pemeriksaan yang disebutkan dijalankan dan hasilnya memenuhi skenario. |
| Failed | Pemeriksaan dijalankan dan kegagalan/regresi terbukti. |
| Inspected | Source/config diperiksa tanpa membuktikan perilaku runtime. |
| Not run | Pemeriksaan belum dijalankan; sebutkan alasannya. |
| Inferred | Kesimpulan tidak langsung dari bukti; sebutkan asumsi dan batasnya. |

Hasil suite, smoke produk, CI, merge dan deployment dicatat terpisah. Kelulusan suite tidak otomatis menerima seluruh change. Hasil yang dilaporkan pemeriksa lain mencantumkan sumber/provenance; jangan mengklaim telah menjalankannya ulang.

Simpan credentials, owner key, private databases, native sessions dan backup di luar Git. Tautkan bukti dari verification change agar output yang sama tidak disalin ke banyak laporan.

## Koreksi dan riwayat

Pertahankan output dan identitas pemeriksaan lama. Jika review atau eksekusi berikutnya mengubah kesimpulan, tambahkan catatan bertanggal dengan tautan bukti baru; jangan mengubah kegagalan lama menjadi keberhasilan. Hasil historis tidak menjadi fase pekerjaan yang berlaku sekarang.
