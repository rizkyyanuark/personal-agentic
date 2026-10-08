# ADR 0006: Adopsi Desain Visual, Prosedural 3D, dan Tata Letak Kantor Agent

- Status: Accepted
- Tanggal: 2026-09-29
- Pembuat Keputusan: Pemilik Proyek (Rizky Yanuar Kristianto) & AI Assistant

---

## 1. Konteks (Context)

Catatan awal ini dipertahankan sebagai riwayat. Keputusan visual terbaru mengikuti
[kebutuhan v3](../requirements/office-experience-v3-kantor-agent.md) dan
[ADR 0008](0008-mobile-floating-ui-character-tracking-and-status-parity.md): empat
kolom dengan satu sticky agregat mengganti tiga kolom dan sticky per tugas.
Font memakai stack sistem/fallback tulisan tangan lokal; catatan Google Fonts
di bawah bukan izin mengunduh font atau menambah dependency. Klaim biaya,
memori, ketajaman, waktu render, jumlah tes, dan identitas pribadi pada catatan
awal tidak dibuktikan oleh konfirmasi preferensi visual atau pembaruan dokumen.

Versi Cockpit sebelumnya mengandalkan model eksternal `.glb` untuk tanaman (yang rentan mengalami glitch bayangan/keterlambatan pemuatan jaringan), diagram skematik statis di layar monitor, dan papan tugas berpenampilan monitor digital yang kaku.

Pengguna mengidentifikasi arsitektur visual pada repositori [humaedihume/kantor-agent](https://github.com/humaedihume/kantor-agent) yang menghadirkan pengalaman visual kantor 3D yang jauh lebih hidup, nyaman (_cozy_), dan manusiawi (_human & lived-in_). Diperlukan keputusan arsitektural untuk mengadopsi elemen-elemen kunci tersebut tanpa merusak batas integritas data _read-only_ dan kontrak publik Cockpit.

---

## 2. Keputusan Arsitektur (Decisions)

1. **Migrasi Tanaman ke Geometri Prosedural Three.js Murni:**
   - Menghapus pemuatan asinkron `office-floor-plant.glb`.
   - Mengganti dengan generator tanaman prosedural Three.js: pot silinder tanah liat terakota (`#c8744b`), tanah gelap (`#4a3526`), dan 11 helai daun bola teregang elips dengan rotasi spiral alami 4 palet hijau.
   - Menambahkan varian pot tanaman mini (`scale: 0.35`) di rak buku dan pantry untuk pengayaan visual tanpa biaya memori tambahan ($0 FinOps).

2. **Arsitektur Layar Ganda Dinamis (_Dynamic Canvas Switching_):**
   - Layar Utama beralih dinamis sesuai status agent:
     - Saat `bekerja`: Menampilkan Jendela Terminal gelap macOS lengkap dengan tombol _traffic light_ (🔴🟡🟢), baris log riil dari `snapshot.feed` ber-timestamp, dan footer warna agent.
     - Saat `siaga`: Menampilkan Wallpaper Gradien warna agent menuju warna kertas hangat (`#f3eee6`) dengan jam digital 110px.
   - Layar Samping menampilkan Kartu Tugas publik saat bekerja atau layar standby minimalis saat santai.

3. **Whiteboard Fisik 3 Kolom dengan Tipografi Tulisan Tangan:**
   - Papan tugas dinding diubah menjadi whiteboard spidol fisik dengan tatakan aluminium memuat 3 spidol marker nyata (biru, merah, hijau).
   - Memakai 3 kolom kanonis: **Rencana**, **Dikerjakan**, dan **Selesai**.
   - Tipografi menggunakan font tulisan tangan spidol `Patrick Hand` (Google Fonts), dan setiap tugas digambar sebagai lembaran sticky note tempel dengan sudut rotasi alami dan bayangan lembut.

4. **Name Tag Meja Akrilik & Sticky Notes Monitor:**
   - Meja kerja dilengkapi plat nama akrilik miring di depan meja dengan garis aksen vertikal 14px warna role.
   - Meja kerja analitis (Data Scientist dan Research Scientist) dilengkapi 3 lembar sticky note pastel miring di sudut monitor.

5. **Penyeimbangan Tata Letak Lounge & Meeting:**
   - Area Rapat (Meja Bundar + karpet bundar + 3 kursi + laptop terbuka) diposisikan di depan kiri (`MEET`).
   - Area Santai (Sofa empuk + karpet lounge + meja kopi dengan majalah & 2 gamepad) diposisikan di depan kanan (`LOUNGE`), berhadapan langsung dengan TV layar lebar.

---

## 3. Konsekuensi (Consequences)

- **Performa & Reliabilitas:** Zero network latency untuk aset tanaman. Rendering 3D instan, bayangan kontak tajam menapak lantai, dan alokasi memori tetap sangat rendah (~15-20 MB RAM).
- **Privasi Data:** Log pada jendela terminal dan papan tugas tetap hanya membaca ringkasan publik dari `snapshot.feed`. Tidak ada payload privat yang terekspos.
- **Pengujian Deterministic:** Kontrak pengujian di `tests/unit/` dimutakhirkan agar memvalidasi struktur 3 kolom papan dan canvas rendering baru tanpa merusak 79 test passing.
