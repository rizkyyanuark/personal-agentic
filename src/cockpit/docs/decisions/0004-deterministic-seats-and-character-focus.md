# 0004: Seat terukur dan fokus lokasi karakter

Tanggal: 29 September 2026 (UTC).
Status: keputusan implementasi T02; deployment tetap memerlukan persetujuan pemilik.

## Status terhadap v3

Catatan tahap T02 ini dipertahankan sebagai riwayat. Jumlah role/workstation dan
fokus kartu diganti oleh [ADR 0007](0007-five-role-hermes-and-office-migration.md).
Roaming, kegiatan dekoratif, klik tubuh/name tag, serta akses reset mengikuti
[kebutuhan v3](../requirements/office-experience-v3-kantor-agent.md) dan
[ADR 0008](0008-mobile-floating-ui-character-tracking-and-status-parity.md).
Aturan lama tentang enam meja, HQ tidak memakai sofa, jalan ditunda, dan kartu
mengikuti karakter tidak menjadi kebutuhan aktif. Kontrak ukuran seat, arah
local +Z, okupansi unik, kontak permukaan, dan disposal tetap berlaku.

## Konteks

Pemilik memilih pose deterministik dahulu, sofa untuk siaga, dan HQ berdiri dekat
papan tanpa workstation. Jawaban lanjutan menetapkan kartu mengikuti lokasi
karakter aktual, sedangkan klik meja tetap memfokuskan workstation.

Audit GLB lokal menemukan cushion kursi pada tinggi 0.472405 m dan sofa pada
0.54 m di atas parquet. Pose lama menekuk paha ke belakang dan membuat sole
duduk melayang sekitar 0.19 m. Keyboard juga mempunyai front berbeda dari
asumsi rotasi sebelumnya.

## Keputusan

- `seating-contract.js` menyimpan ukuran yang telah diukur. `seat-registry.js`
  menyediakan enam seat meja, dua seat sofa, tiga seat meeting, serta anchor HQ.
  Furniture dan karakter memakai registry yang sama; tidak ada tinggi loader
  atau heading karakter alternatif yang dipertahankan sebagai compatibility alias.
- Depan furniture dan karakter adalah local +Z. Body sofa mengikuti backrest;
  kepala mengarah ke TV, bukan memutar seluruh body keluar dari cushion.
- Cushion luar sofa dipakai pada x lokal -0.58 dan +0.58, z 0.12. Sambungan
  cushion sekitar x +/-0.30 tidak digunakan sebagai titik duduk.
- Hanya status publik `siaga` dapat memperoleh seat sofa, menurut urutan role
  kanonis. Maksimum dua penghuni unik; overflow tetap di meja sendiri. HQ tidak
  menghabiskan kapasitas sofa. Status offline/bootstrap tidak dibuat siaga.
- Meeting mempunyai anchor dan pose yang dapat diuji, tetapi tidak mendapat
  penghuni otomatis atau jadwal meeting buatan. Jalur berjalan ditunda.
- Pelvis dan panjang limb diselaraskan dengan surface. Two-link arm solver
  menempatkan tangan pada keycap atau lap/tablet. Keyboard dinormalkan ke yaw 0;
  titik tangan diverifikasi pada mesh keycap GLB asli, bukan screenshot saja.
- Kartu memakai preset `character`, klik meja memakai `workstation`, reset
  memakai `home`, dan orbit manual menghapus preset. Resize mempertahankan mode.
  Perubahan seat meretarget kamera hanya pada mode karakter dan sekali per
  perubahan anchor. Orbit manual tidak direbut oleh polling status.
- Label berada pada root karakter, di atas kepala tanpa mengikuti tilt kepala.
  Visibility mengikuti identitas terpilih, lebar stage, serta frustum XYZ.
  Label karakter yang berada di sofa tidak dipindahkan ke meja kosong.
- Fallback chair dan sofa mempunyai surface/front yang sama dengan GLB. Resource
  fallback yang diganti di-dispose sekali; resource model clone bersama tidak
  ikut di-dispose.
- Reduced motion mempertahankan pose. Render merespons input/state/resize
  langsung; saat tidak berubah dibatasi satu redraw per detik pada loop yang
  sudah ada, agar asset yang terlambat dimuat tetap terlihat. Tidak ada render
  loop, dependency, atau model call tambahan.

## Batas data dan bukti

Tidak ada field publik baru atau write ledger. Status tetap berasal dari kontrak
`connection/now/totals/queue/agents/feed`. Pengujian transisi memakai interception
respons publik di browser dan screenshot berlabel fixture, bukan aktivitas live.

Build ditulis ke direktori verifikasi `/tmp`, bukan dist production. Unit test
memeriksa mesh nyata, keycap GLB, surface/floor contact, gaze, allocator, dan
disposal. Hasil browser dan ketidakpastian dicatat pada laporan review T02.
