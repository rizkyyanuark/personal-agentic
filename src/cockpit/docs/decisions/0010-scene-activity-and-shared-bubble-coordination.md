# ADR 0010: controller aktivitas dan kuota bubble bersama

Tanggal: 3 Oktober 2026 (WIB).
Status: implementasi lokal atas konfirmasi pemilik; belum terverifikasi oleh kolega.
Cadence santai awal pada ADR ini diganti oleh [ADR 0011](0011-reference-motion-and-dialogue-cadence.md);
batas data, kepemilikan controller, dan kuota bubble tetap berlaku.

## Konteks

L2 memisahkan fakta API, pose, dan provenance bubble. Kelanjutan L3 sampai L5
membutuhkan kepemilikan transform karakter, kegiatan dasar, dialog lokal, dan
kuota bubble tanpa mengubah backend observasi. Pemilik memilih ritme santai
dan tidak ramai serta menyerahkan seluruh pengujian kepada kolega.

## Keputusan

Controller pada scene memiliki posisi, heading, fase, reservasi tujuan, dan
pose karakter. Allocator kursi hanya membantu bootstrap/kontrak pose lama;
loop aktif tidak memakainya untuk menimpa perjalanan. Navigasi menghindari
envelope furnitur dan batas ruang. Akses kursi dipisahkan dari rute bebas;
karakter lain mendapat ruang pribadi dan dapat menyebabkan yield/replan.

Kegiatan ilustratif meliputi berjalan, sofa, kopi, membaca, dan meeting.
Tujuan dipilih dengan seed role stabil dan jeda lokal. Paling banyak dua
perpindahan dekoratif aktif; perjalanan kembali bekerja tidak diperlakukan
sebagai suasana yang dapat ditunda. State/task DOM berubah segera pada poll;
pose kerja menunggu karakter mencapai anchor yang sesuai.

Gate L2 tetap mengendalikan suasana. Data tidak segar, tab tersembunyi, atau
reduced motion menghentikan perjalanan/dialog tanpa memalsukan status atau
memindahkan karakter seketika. Pose netral mempertahankan posisi saat ini;
akses kursi yang sedang berlangsung harus tetap mempunyai konteks egress.
Ini mengganti kebiasaan L2 yang selalu menempatkan ulang karakter ke desk/HQ
saat gate ditutup. Jalur pemulihan dan clearance perlu pemeriksaan visual.

Scheduler UI menyusun obrolan fiksi bergantian hanya dari kegiatan, lokasi,
dan peserta siaga. Tidak membaca payload, log, vault, atau hasil model, tidak
menghubungi model, dan tidak menulis feed. Perubahan peserta/freshness
membatalkan balasan yang belum diucapkan. Uraian kerja tetap Deskripsi peran
statis; informasi tugas lebih spesifik memerlukan kontrak publik tersendiri.

Satu coordinator mengatur seluruh kandidat work, role-description, event,
dan dialogue. Batasnya dua bubble pada desktop dan satu pada lebar sampai
820px. Prioritas ialah karakter terpilih lalu informasi kerja. Layer bubble
terpisah dari CSS2D name tag agar aturan label ponsel tidak menyembunyikan
bubble. Penghindaran menggunakan rectangle HUD, label, tubuh, dan bubble
lain secara konservatif; tidak ada posisi aman berarti bubble disembunyikan.
Panel Tugas tetap menyediakan rincian karakter terpilih tanpa live-region
obrolan berulang. Fokus kamera dan fokus detail DOM diselaraskan.

Controller, scheduler, dan coordinator memakai loop aplikasi yang sudah ada.
Tidak ada render loop kedua, dependency/font/aset besar baru, field API baru,
akses eksekusi, atau perubahan ledger. Teardown melepas reservasi, observer,
elemen overlay, serta kandidat; BFCache tetap menunggu polling valid baru.

## Konsekuensi dan batas bukti

Denah, identitas, kartu/pill L1, kamera, dan hasil desain kolega dipertahankan.
Game/gitar ditunda ke L7. Empat lokasi netral role selain HQ saat menunggu atau
gagal masih perlu review pemilik, bukan penambahan state workflow.

Codex tidak menjalankan check, unit test, e2e, atau browser untuk L3 sampai L5
atas mandat pemilik. Kompilasi preview tidak membuktikan ketepatan pose, rute,
okupansi, aksesibilitas, atau performa. Implementasi belum boleh diterima atau
di-deploy sebelum laporan kolega dan review pemilik. Handoff L2 dipertahankan
sebagai bukti historis terpisah.
