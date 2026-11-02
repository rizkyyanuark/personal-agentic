> Status kontrak: metadata native dan riwayat kerja tetap berlaku. `refine-live-office-presentation` menggantikan navigasi run/badge dan label kartu: feed sekarang pasif. Task/bukti navigasi di bawah merekam tahap sebelumnya, bukan acceptance aktif. Baca [aturan efektif](../../README.md).

# Proposal

## Why

Pemilik mengoreksi scope: kegiatan santai hanya berada pada kartu/detail, bukan panel Aktivitas agent. Panel pekerjaan saat ini kehilangan target tool, mengulang lifecycle generik, dan tidak menyediakan jejak ke run.

## What Changes

- Hapus buffer/feed santai tanpa mengubah pose, layout, timing dialog atau kartu santai.
- Normalisasi event native Antigravity, Codex dan OpenCode melalui jalur run yang sudah ada.
- Deskripsikan aksi dan path relatif yang aman serta jenis perintah yang dikenali; jangan mempublikasikan argumen mentah, output, prompt, reasoning atau credential.
- Pertahankan riwayat pekerjaan setelah selesai, satukan perubahan status langkah yang sama, tampilkan waktu sampai detik dan tautan run yang sebenarnya.

## Capabilities

### New Capabilities

- `live-office-work-activity`: deskripsi, privasi, atribusi dan keterlacakan feed pekerjaan.

### Modified Capabilities

Belum ada main spec yang disinkronkan. Keputusan pemilik ini menggantikan requirement feed visual pada change lokal `align-live-office-idle-behavior`; bukti historis change tersebut dipertahankan.

## Impact

`activity.rs`, `runtime.rs`, `cockpit.rs`, bindings TypeScript, adapter snapshot, proyeksi presentasi dan HUD, dokumentasi dan regresi. Penambahan field metadata opsional; tidak ada migrasi DB, dependency baru, perubahan auth/queue atau deployment. Implementasi diminta langsung oleh pemilik bersama audit ini; bukan permintaan planning-only.
