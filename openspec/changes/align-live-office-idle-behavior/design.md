> Status kontrak: implementasi awal dan bukti historis. `describe-live-office-work-activity` menggantikan feed santai dengan riwayat kerja nyata. `refine-live-office-presentation` menggantikan pilihan label kartu, status selesai sementara, bubble dan pose gitar. Baca [aturan efektif](../../README.md) sebelum memakai task/spec awal sebagai acceptance saat ini.

# Design

## Context

Lihat `proposal.md` untuk motivasi dan tiga delta spec untuk kontrak perilaku. Baseline kode yang dibaca adalah `6f6947c`; tidak ada baseline capability OpenSpec di root yang baru diinisialisasi ini.

Temuan source:
- `characters.js:277` memasang gitar ke hips tanpa pencerminan, sedangkan referensi memasangnya ke spine dengan pencerminan X. `character-pose.js` menghitung target tangan terpisah dari geometri gitar; rig keduanya berbeda.
- `character-activity.js` sudah memiliki sample kegiatan dan data tujuan/zone/fase/arrival. `office-presentation.js` belum memetakan air, gitar, dan jendela; `hud.js` memakai task/resultHint operasional untuk kartu dan detail.
- `workstation.js:245` membuat desk mat bersama untuk setiap meja. Ketinggian input perlu disesuaikan jika alas dihilangkan.
- Pantry lokal di (7.2, -6.76) mendapat koreksi posisi world terhadap dinding setelah dibuat. Pot samping pantry lokal ada di (8.85, -5.0). Navigasi mempunyai obstacle dan tujuan kopi/air sendiri.
- Scheduler lokal memiliki interval dan durasi balasan yang cocok, tetapi waktu awal 1.5 detik, pengecualian gitar/jendela, serta celetukan setiap 14 detik berbeda. `mount.js` membatasi delta animasi hingga 0.25 detik.
- `src/cockpit/docs/architecture.md`, `DESIGN.md`, dan visual acceptance memisahkan suasana lokal dari fakta operasional. Beberapa deskripsi historis entrypoint masih menyebut overlay; source sekarang juga memiliki `/office` melalui React `StandaloneOffice`.

## Goals / Non-Goals

**Goals:** satu sumber kegiatan visual yang dipakai konsisten oleh scene dan UI; posisi world pantry/pot dapat diperiksa; pose gitar memiliki titik kontak yang jelas; ritme dialog diukur berdasarkan waktu aktif tanpa backlog.

**Non-Goals:** database/feed backend baru, perubahan kontrak cockpit publik, perubahan identitas/role agen, ekspansi seluruh ruangan, penggantian rig atau dependensi 3D, serta klaim seluruh perilaku upstream identik. Pelaporan per-spot adalah enhancement; koordinat pantry/pot dan aturan dialog adalah kesetaraan referensi yang diminta.

## Decisions

### 1. Pisahkan fakta operasional dan deskripsi visual

Pertahankan snapshot Rust sebagai sumber operational state. Gunakan data aktivitas dari controller scene: `kind`, `zone`, `phase`, `destinationId`, dan `arrivalId`. Bentuk satu proyeksi presentasi yang menghasilkan teks kartu/detail dan transisi feed; jangan mengubah `operational.task` agar terlihat seperti pekerjaan model.

Pemetaan membedakan tujuan sofa TV dan PS meskipun posture keduanya duduk; coffee/water serta guitar/window harus dikenali. Fase walking menjelaskan tujuan, bukan kegiatan yang belum dilakukan. State bekerja/menunggu/koneksi gagal mempunyai prioritas lebih tinggi. Kegiatan unknown memakai fallback netral.

Alternatif menambahkan kegiatan dekoratif ke SQLite/API ditolak karena scene adalah pemilik kegiatan tersebut dan pengguna memilih tanpa persistensi. Alternatif menyusun teks terpisah pada setiap panel ditolak karena mudah berbeda makna.

### 2. Feed transisi lokal dengan lifecycle yang sama

Simpan buffer memory maksimum 100 entri visual pada instance cockpit; angka ini adalah default perencanaan untuk membatasi penggunaan memori, bukan batas upstream yang harus diwarisi. Gunakan identitas karakter, arrival/fase/tujuan untuk mendeteksi transisi. Jangan menghasilkan histori dari penempatan pertama atau mengulangnya setiap polling/frame.

Render sebagai aliran berlabel kegiatan visual, terpisah secara semantik dari event run dalam panel aktivitas yang ada. Jangan menaikkan counter run/tugas/token dari entri visual. Bersihkan buffer, dedupe state, dan callback pada disposal serta pergantian workspace/filter; jangan menyimpannya ke localStorage/sessionStorage atau backend. Scene yang hidden/stale berhenti menambah entri dan disinkronkan saat kembali.

Alternatif menggabungkan entri visual ke feed snapshot server ditolak karena akan mencampur sumber bukti. Tidak perlu panel navigasi baru.

### 3. Gitar mengikuti rig dan kontak geometrinya

Pertahankan mesh dan rig lokal. Buat attachment torso yang mengikuti gerak tubuh; orientasikan neck ke tangan penahan sesuai referensi. Nyatakan titik kontak neck dan area petikan dalam koordinat lokal gitar, transformasikan ke koordinat solver tangan, dan gerakkan tangan pemetik di sekitar kontak tersebut. Gunakan pendekatan IK yang sudah ada, tanpa dependency baru.

Menyalin sudut sendi atau transform upstream secara mentah ditolak: ukuran torso, pivot, geometri gitar, dan hand solver berbeda. Bukti harus mencakup beberapa fase petikan dan semua profil visual karakter yang dapat mengunjungi spot, bukan satu gambar Nova saja. Gitar hanya terlihat ketika sudah berada dalam kegiatan gitar.

### 4. Posisi pantry/pot memakai world anchor referensi

Referensi menetapkan `ROOM.z0=-7`, pusat counter X/Z (8.2, -6.45), top Y 0.97, serta pot X/Z (6.6, -6.4). X/Z tersebut menjadi target kanonis; pot mengikuti lantai lokal. Jangan mempertahankan koreksi otomatis `pantry.position.z` yang menggeser counter dari target setelah pembuatan mesh.

Selaraskan kabinet, countertop, rak, dan mesin kopi sebagai area pantry yang kohesif. Hitung bounds aktual; adaptasikan peletakan prop dispenser dalam batas ruang lokal serta target kopi/air dan obstacle-nya. Posisi dispenser upstream X=9.55 tidak boleh disalin ke ruang lokal yang max X-nya 9.5 dan memiliki ketebalan dinding. Penyesuaian prop fungsional dan target interaksi termasuk adaptasi lokal, sementara counter/pot tetap pada koordinat yang disetujui. Tidak memperluas ruangan atau memindahkan zona lain.

Gunakan anchor yang sama untuk tampilan, collision, dan interaksi. Dua tujuan kopi lokal tetap diperbolehkan bila tidak membuat dua karakter bertabrakan. Uji approach/leave dan perpindahan kegiatan setelah pantry dipindahkan.

### 5. Hilangkan desk mat pada sumber bersama

Hapus mesh alas dalam `addDeskSurface` dan material `deskMat` bila tidak dipakai lagi. Ukur bounds keyboard/mouse untuk menempatkan dasar model pada meja aktual. Pertahankan model mouse, keyboard, mug, nameplate, dan aksi kamera meja. Jangan menghapus asset mouse GLB dengan mengira itu mousepad.

### 6. Ikuti scheduler referensi tanpa mengorbankan lifecycle

Gunakan waktu aktif monotonic untuk scheduler, terpisah dari delta pose yang dibatasi. Empat detik dihitung setelah instance menerima data segar dan ambient diizinkan; hidden/stale/disposal membatalkan dialog, kemudian sesi ambient dimulai kembali tanpa catch-up. Pada stall render, jalankan paling banyak satu percobaan saat kembali, bukan seluruh percobaan terlewat.

Ikuti interval, durasi, overlap, 70/30 pemilihan lawan bicara, katalog CHAT/QUIPS, dan peluang kedatangan pada spec. Cabang acak 30 persen memilih dari semua peer, termasuk yang terdekat. Hilangkan pengecualian gitar/jendela, repeat 14 detik, serta aturan anti-repeat teks yang tidak ada di referensi. Pertahankan substitusi nama lokal dan pembatasan teks aman. Cek kelayakan sebelum mengeluarkan bubble; cegah overwrite bubble aktif, termasuk bubble kerja dalam arbitrasi `mount.js`.

Timer berbasis frame saja ditolak karena render lambat memperpanjang waktu. `setTimeout` global tanpa pembatalan ditolak karena reply dapat bocor ke scene/workspace baru. Random dan clock yang dikendalikan hanya digunakan pada unit regression untuk waktu/acak; bukti aplikasi memakai scheduler production dan respons Rust nyata.

## Risks / Trade-offs

- Perbedaan rig dan orientasi bisa membuat tangan salah sisi -> ukur kontak world dan inspeksi screenshot depan/samping pada beberapa fase.
- Pantry bergeser dari koreksi dinding lama -> inspeksi Box3 terhadap dinding, pot, dispenser, dan jalur; counter/pot world anchor tidak berubah diam-diam.
- Teks santai dapat menutupi failure atau menyesatkan sumber -> prioritaskan operational state dan gunakan label kegiatan visual.
- Feed dapat berulang karena polling atau remount -> dedupe transisi dan reset per instance/konteks; batas 100 entri.
- Presisi waktu browser dipengaruhi render -> unit batas waktu deterministik, real browser timestamp dengan toleransi 250 ms pada tab terlihat; jangan mengklaim semua mesin telah terukur.
- Test lama mengharapkan visual diabaikan atau jadwal lama -> perbarui hanya assertion yang kontraknya berubah; pertahankan guard auth, lifecycle, dan sumber fakta.
- Folder `openspec/` di-ignore Git -> artefak saat ini lokal; publikasi/versioning perlu tindakan terpisah, jangan mengubah ignore atau memaksa add sebagai efek samping.

## Migration Plan

Tidak ada migrasi data atau API. Implementasi dilakukan dalam slice pada modul yang ada, kemudian build frontend melalui aplikasi induk agar `/office` dan alias `/organization/live-preview` memakai paket yang sama melalui StandaloneOffice. Pemilik menyetujui penggantian acceptance overlay lama dengan halaman mandiri pada 2026-11-02; suite overlay tetap tersedia sebagai `test:e2e:legacy` dan kegagalannya dicatat. Sebelum release, jalankan check cockpit, lint/build frontend dan smoke browser melalui kandidat terisolasi sesuai `src/VERIFICATION.md`.

Bukti minimum: screenshot fase gitar tiga sudut, world position pantry/pot dan lintasan kopi/air, empat meja tanpa alas, kartu/detail/feed setiap jenis kegiatan, timestamp sedikitnya lima percakapan selesai, serta interupsi oleh run nyata. Data API tidak di-intercept untuk klaim integrasi; tidak ada provider mock sebagai bukti run. Jika runtime nyata belum tersedia, catat interupsi run sebagai belum terverifikasi.

Rollback memakai revisi source/image frontend terdahulu melalui alur release yang ada; tidak menghapus volume atau merestore DB. Proposal ini tidak mengotorisasi build/deploy produksi. Semua task tetap belum dikerjakan pada akhir fase planning.
