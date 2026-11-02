> Status kontrak: metadata native dan riwayat kerja tetap berlaku. `refine-live-office-presentation` menggantikan navigasi run/badge dan label kartu: feed sekarang pasif. Task/bukti navigasi di bawah merekam tahap sebelumnya, bukan acceptance aktif. Baca [aturan efektif](../../README.md).

# Design

## Context

Referensi memakai metadata tool_use Claude Code (Read/Write/Edit/Bash description/Glob) dan potongan jawaban yang ditujukan ke pengguna. Aplikasi ini hanya mengubah Antigravity step_update ke RunActivity kategori/status/path; Codex/OpenCode belum masuk normalisasi. Screenshot kedua juga memperlihatkan lifecycle duplikat dan waktu tanpa detik.

## Goals / Non-Goals

Detail berasal dari aksi native yang benar-benar diamati. Penjelasan perintah dibuat dari klasifikasi terbatas yang aman, bukan menyalin description/command bebas. Riwayat kerja tetap terlihat saat agen santai. Tidak menampilkan penalaran internal atau isi file/jawaban privat.

## Decisions

- Satu tracker aktivitas per run menangani native item/step identities, dedupe update dan beberapa target perubahan file. Protocol menyimpan hasil aman melalui event store yang sudah ada.
- Field operation opsional membedakan aksi file dan tujuan perintah umum. Payload lama tetap dapat dibaca. Unknown command tetap generik; tidak ditebak dari kata yang kebetulan ada di argumen.
- Cockpit memilih 100 langkah/event pekerjaan terbaru dalam workspace/filter, menggabungkan state update satu langkah dan menghilangkan responding serta run.changed generik dari feed. Current activity tetap bersumber langkah terakhir untuk run aktif.
- Feed menyimpan run/group/step identity, waktu HH:mm:ss dan link ke route Runs yang sudah diautentikasi. Bukan endpoint eksekusi baru.
- Hapus buffer transisi santai dari presentation dan merge-nya dari HUD. Kartu/detail tetap menggunakan scene activity.

## Risks / Trade-offs

Format command shell kompleks tidak selalu dapat diklasifikasi dengan aman: gunakan fallback jujur dan trace run. Nama/path sensitif atau di luar workdir tidak boleh muncul. Native event yang tidak disediakan provider tidak boleh direkayasa. Native run proof memakai kandidat lokal dan fixture terisolasi; ketersediaan harness lain dilaporkan.

## Migration Plan

Tidak ada perubahan tabel; metadata tambahan memakai serde default. Build, test dan regenerasi bindings mengikuti entrypoint repo. Verifikasi real API/browser/provider dan reconnect/reload dengan event lama. Tidak commit, push, deploy atau archive.


## Follow-up: concrete native formats

Owner requests correcting the remaining bare read and completed-command entries.
PowerShell Get-Content accepts a path array; expose safe relative_files optionally,
while retaining relative_file for older clients. Node --eval gets an explicit
JavaScript evaluation label, after decoding the recorded shell wrapper correctly.

Legacy metadata can be enriched read-only from the immediate next event for the
same run, only when it is a matching command_execution native output. Capture
persists activity before output. Never jump across another event to guess a
command. SQLite selects only command metadata, not output/text/prompts. Preserve
run/step/state/time and do not backfill or rewrite database events.
