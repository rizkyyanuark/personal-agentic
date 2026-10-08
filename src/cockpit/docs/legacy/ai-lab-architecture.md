# Archived AI Lab architecture

This document preserves the predecessor deployment and public ledger contract.
It is superseded by `../architecture.md` and is not a deployment guide for the
integrated personal-agentic application.

# Kantor AI Lab: arah desain dan kontrak tampilan

Kantor virtual ini adalah jendela baca-saja untuk AI Lab Suite. Target v3 adalah
lima role Hermes: Orion, Nova, Atlas, Lyra, dan Axiom. Kontrak cockpit sedang
bermigrasi, sedangkan definisi Hermes masih mencakup Vega dan Echo saat keputusan
ini dicatat. Keduanya belum boleh dianggap sinkron sebelum tes. Cockpit tidak
menjalankan agent, menyetujui tindakan, mengirim data, atau melakukan deployment.
Ruang 3D memvisualisasikan status yang sudah tercatat di ledger; animasi dihitung di
browser tanpa panggilan model.

## Arah visual

Referensi utama adalah screenshot kantor isometrik yang diberikan pemilik. Bahasa
visualnya warm studio: lantai kayu, empat meja dalam dua baris masing-masing
dua, meeting di kiri, lounge di depan, pantry di kanan belakang, pencahayaan
lembut, panel putih hangat, serta warna role yang konsisten.
Dials Antislop: ENERGY 2 (tenang, fokus), RHYTHM 2 (panggung dan panel jelas),
MOTION 2 (roaming dan obrolan berlabel saat siaga, plus fokus kamera yang halus).
Gerak dekoratif berhenti pada reduced motion atau data tidak segar. Tidak ada
angka demo atau aktivitas kerja palsu pada tampilan live.

Desktop menempatkan ruang 3D sebagai panggung dengan header ringkas, panel
Aktivitas di kiri, tab Riwayat dan `Tugas <Nama>` di kanan, dan strip kartu role.
Ponsel menampilkan scene layar penuh di
belakang HUD, carousel role, dan panel rincian bawah yang dapat diciutkan menjadi
dock. Tab Aktivitas masuk ke panel bawah pada layar sempit; toggle utama tidak
ditampilkan di header ponsel. Panel tetap DOM baca-saja dan memakai sumber state
yang sama pada semua ukuran.
Permukaan krem hangat memakai aksen role kanonis. Pada semua ukuran, kontrol
terlihat minimal 44px dan mode ringan tetap menyajikan status saat WebGL tidak
tersedia.

## Sumber kebenaran dan batas publik

Endpoint /api/state membaca snapshot read-only dari SQLite ledger AI Lab Suite.
Default hanya runtime scitldr-ingestion; runtime lain dapat ditambahkan secara
eksplisit melalui OFFICE_LAB_RUNTIME_DIRS oleh operator. UI memakai agregat
tugas, status role, dan jenis/timestamp event yang sudah dipetakan ke kalimat
umum. Goal, project, input, output, checkpoint, alasan approval, isi vault,
token worker, dan detail tool tidak dikirim ke browser. Endpoint POST /api/event
tidak tersedia.

Kontrak role dan bentuk minimum public state berada di
`src/shared/office-contract.js` dan digunakan bersama oleh server serta browser.
Perubahan kontrak wajib disertai pengujian kebocoran field privat. Keputusan
arsitektur yang bertahan lintas fitur dicatat sebagai ADR di `docs/decisions/`.

Migrasi v3 menyisakan lima karakter dan kartu, dengan empat workstation untuk
Nova, Atlas, Lyra, dan Axiom; Orion tidak memiliki meja. Vega dan Echo tidak
menjadi karakter. Catatan tugas lama tetap dihitung dalam agregat dan event
publik yang lolos sanitasi, tanpa dipetakan ulang sebagai pekerjaan role baru.
Tugas Vega/Echo yang masih aktif harus ditangani sebelum role lama dinonaktifkan,
agar status aktif tidak hilang dari proyeksi. QA independen dan gerbang rilis
milik host masih perlu didefinisikan serta diuji; keduanya belum boleh disebut
sebagai kemampuan umum yang sudah terpasang. Browser tidak memperoleh hak
approval atau deployment dari migrasi ini. Tidak ada integrasi baru dalam scope.

Status live berarti koneksi pembacaan ledger berhasil, bukan semua agent
sedang bekerja. Bila ledger kosong atau tidak dapat dibaca, layar menampilkan
kondisi kosong/gagal dengan jelas. State API `siaga` memakai label visual
Istirahat. Subteks kartu mengikuti aktivitas visual lokal karakter saat ini,
tetap berlabel Suasana ilustratif, dan tidak menjadi fakta ledger. Status
operasional dan aktivitas scene memiliki sumber berbeda: yang pertama dari
API, yang kedua dihitung lokal tanpa panggilan model atau penulisan event.

`agents[role].task` saat ini adalah kalimat status generik yang dibuat server,
bukan judul, tujuan, atau ringkasan isi tugas. `activity` bukan field publik.
Feed berisi riwayat event generik, bukan bukti pekerjaan aktif saat ini. Bubble
kerja menggunakan teks publik yang informatif bila tersedia; untuk kontrak
sekarang fallback-nya Bekerja dan uraian role statis berlabel Deskripsi peran.
Ringkasan tugas lebih spesifik kelak memerlukan sumber publik, redaksi, approval,
dan pengujian privasi tersendiri; fitur suasana ini tidak menambah field API.

Papan memakai empat kolom: Rencana tanpa sumber planning bertanda Belum tersedia;
Dikerjakan membaca `queue.running`; Uji QA membaca `queue.waiting_approval`;
Selesai membaca `totals.completed`. Uji QA adalah nama tampilan yang dipilih
pemilik dengan keterangan antrean persetujuan, bukan hasil pengujian model.
Papan dan panel DOM memakai satu pemetaan. Kolom positif memiliki satu sticky
ringkasan agregat tanpa ID atau judul tugas buatan. Waktu pembaruan hanya memakai
snapshot publik yang benar-benar tersinkron.

Slot metrik mempertahankan desain yang dipilih pemilik. Proporsi tugas selesai
adalah `totals.completed / totals.tasks` pada snapshot segar dengan total positif,
bukan progres roadmap. Total tugas membaca `totals.tasks`; Jam WIB memakai jam
perangkat pengguna dengan zona Asia/Jakarta. Total token belum memiliki sumber
publik dan bertanda Belum tersedia. Loading, error, offline, dan data usang tidak
menghasilkan angka nol atau persentase buatan. Nol hanya sah dari snapshot segar;
proporsi dengan total nol bertanda Belum tersedia.

Kartu empat agent memfokuskan meja asal dan kartu Orion memfokuskan tengah ruang.
Klik mesh atau name tag memulai pelacakan karakter yang dilepas oleh orbit/pan.
Reset tanpa tombol terlihat memakai klik ulang pilihan aktif, double-click
canvas, atau Escape sesuai keadaan panel. Pemilik mempertahankan pola ini;
keterbatasan penemuan gestur dan akses sentuh dicatat dalam kebutuhan v3.

Halaman berada pada domain publik. Agregat jumlah dan waktu aktivitas tetap
terlihat oleh pengunjung. Jika informasi ini harus privat, lindungi domain
dengan kontrol akses sebelum menambah rincian tugas.

## Pemeriksaan pengiriman

Pemeriksaan browser dilakukan pada lebar 320, 390, 768, 1024, dan 1440px:
tanpa overflow horizontal; kontrol yang terlihat setidaknya 44px; kartu, tab,
panel, mode ringan, dan feed aman dari HTML tak tepercaya. Klaim sertifikasi
WCAG tidak dibuat tanpa audit aksesibilitas penuh.
