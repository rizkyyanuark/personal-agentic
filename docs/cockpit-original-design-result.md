# Pemulihan desain cockpit asli

Acuan: source server `/home/ubuntu/infra-hub/ai-lab-cockpit`, disalin ke
`C:/Users/rizky/Documents/GitHub/personal-agentic/virtual-kantor` pada 6 Oktober 2026.
Arsip transfer dan seluruh 128 file diverifikasi dengan SHA256 sebelum integrasi.

## Implementasi

Live Preview memakai komposisi asli Ruang Kerja Tim: kartu, avatar, tipografi,
roadmap surface, panel samping, carousel dan dock ponsel. Aturan compact preview
dan opsi presentation dihapus. Susunan DOM kartu kembali ke empat elemen aslinya;
informasi runtime tetap tersedia melalui title/aria dan status tugas sebenarnya.

CSS tetap dibatasi pada host cockpit dan breakpoint mengikuti ukuran host di
bawah toolbar. Nilai radius 14 px, gap judul dan inline subtitle dilindungi dari
CSS aplikasi utama agar computed style sama dengan dokumen standalone asli.
Alignment dan margin subtitle juga mengikuti sumber asli. Optimisasi CSS Tailwind
dan minifikasi CSS Vite dinonaktifkan karena menghapus deklarasi backdrop-filter
standar dan menyisakan prefiks WebKit; efek kaca asli harus tersedia di Edge.
Tujuan isolasi ini ialah mempertahankan desain, bukan membuat desain baru.
Header Live Preview, filter, Refresh beranimasi, pengaturan dan tutup dipertahankan.

Koreksi overlay terakhir lulus pada container utama `localhost:18766`: 18
komponen dibandingkan dengan CSS sumber asli pada sembilan rasio dan mode sentuh.
WebGL nyata, fokus kamera melalui kartu dan resize canvas lulus; preview tidak
membuat run baru. Log: `scratch/cockpit-verification/overlay-correction-deployed.log`.
Pemeriksaan final `npm run check` lulus: 199 test, nol gagal. Semua 128 file
referensi tetap identik; hash header LivePreview.css juga tetap sama.

Sepuluh aset kanonis identik dengan source asli. Kamera, karakter, room layout,
warna dan gerakan memakai implementasi asli. Perbedaan pada furniture/workstation
adalah alamat aset, disposal serta identitas dinamis. Papan dan layar menerima
projection publik Rust: status/count/receipt nyata menggantikan ledger lama;
nilai tanpa sumber tidak diisi dengan data contoh. Progress roadmap belum tersedia
dari personal-agentic dan dinyatakan demikian. Koordinat caption dan sticky papan
mengikuti rujukan asli.

## Verifikasi

`npm run check` lulus: lint/type/build frontend, lint/format/build cockpit dan
199 tes tanpa gagal atau skip. Backend projection tidak berubah pada koreksi ini.
Image dibangun dengan `docker build --target platform` dari worktree.

Smoke kandidat menggunakan Rust/SQLite, Edge dan WebGL sebenarnya. Pada sembilan
viewport, 18 komponen dibandingkan dengan CSS asli yang dimuat dalam dokumen
referensi terisolasi, memakai DOM hidup dan dimensi host yang sama. Perbandingan
meliputi typography, padding, grid, surface dan radius; grid menoleransi pembulatan
subpiksel di bawah 0,5 px. Ini pemeriksaan desain terhadap source, bukan snapshot
mock atau perubahan ekspektasi untuk mempertahankan redesign compact.

Kamera, tracking, orbit, reset, panel, focus trap/return, Refresh normal/reduced
motion, resize tanpa mengganti canvas, serta sentuhan portrait/landscape ikut
diverifikasi. Receipt native tersimpan terbaca 30.124 token pada kandidat; preview
tidak membuat run baru atau memanggil provider.

Log dan screenshot berada di `scratch/cockpit-verification/`:

- `restored-original-source-parity.json`: SHA256 aset dan hash header.
- `restored-original-npm-check-final.log`: lint, tes dan build.
- `restored-original-build-final.log`: build image Docker.
- `restored-original-candidate/result.log`: parity dan interaksi kandidat.
- `restored-original-live.log`: alur setup/filter/auth/recovery terisolasi.
- `restored-original-deployed/result.log`: smoke layanan utama.
- `restored-original-rollout-proof.json`: state sebelum/sesudah rollout.

## Batas pemeriksaan

Nilai nama, jabatan dan pekerjaan berasal dari Organization dan run sebenarnya,
sehingga teks/data serta waktu dapat berbeda dari ledger server lama. Scene
tetap dirender dalam area preview di bawah header, bukan ukuran halaman standalone
yang mencakup seluruh viewport. Ponsel diuji lewat emulasi sentuh Edge, bukan
perangkat fisik. Screenshot perlu diperiksa pemilik untuk penilaian visual akhir.

Source integrasi berada di worktree `C:/Users/rizky/.codex/worktrees/d38a/personal-agentic`.
Compose dan volume preview existing tetap dipakai. Rollback lokal:
`agentic-enterprise-platform:pre-original-design-20261006`.
