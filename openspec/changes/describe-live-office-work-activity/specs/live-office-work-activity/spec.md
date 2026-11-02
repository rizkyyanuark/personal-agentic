## ADDED Requirements

### Requirement: Work feed excludes leisure
Panel Aktivitas agent SHALL berisi hanya event pekerjaan nyata; kegiatan santai SHALL hanya berada pada kartu/detail. Riwayat kerja SHALL tetap terlihat setelah run selesai.

#### Scenario: Idle character roams
- **WHEN** karakter berpindah antara pantry, lounge atau spot santai lain
- **THEN** deskripsi kartu/detail berubah tanpa menambah entri panel pekerjaan

### Requirement: Native work is described safely
Aktivitas native Antigravity, Codex dan OpenCode SHALL dinormalisasi melalui run nyata. Aksi file SHALL menyebut path relatif yang aman jika tersedia. Perintah yang dikenali SHALL menyebut tujuan yang aman seperti build, tes atau status git. Metadata yang tidak tersedia SHALL memakai fallback tanpa mengarang detail.

#### Scenario: Read and build occur
- **WHEN** runtime mengeluarkan aksi membaca file dan menjalankan build
- **THEN** feed menjelaskan file relatif dan tujuan build, dengan agent/run/step yang benar

#### Scenario: Sensitive or unsupported input
- **WHEN** argumen mengandung path sensitif, path luar workspace, shell kompleks, credential atau output privat
- **THEN** nilai privat tidak dipublikasikan dan fallback tetap menunjukkan jenis langkah yang diketahui

### Requirement: Work history is traceable and bounded
Feed SHALL menyediakan sampai 100 langkah/event pekerjaan terbaru dengan waktu sampai detik dan identitas run/step yang benar. Sesuai refine-live-office-presentation, baris feed SHALL pasif tanpa link run atau badge status/tool. Update status satu langkah SHALL tidak menghasilkan baris aktivitas ganda. Kegagalan SHALL tidak ditampilkan sebagai keberhasilan.

#### Scenario: Step finishes or fails
- **WHEN** langkah aktif menerima update selesai atau gagal
- **THEN** satu entri langkah menyatakan status aktual dan tetap terhubung ke run yang sama

#### Scenario: Reload or change context
- **WHEN** pengguna reload atau memilih workspace/filter lain
- **THEN** riwayat diproyeksikan kembali dari event store yang benar tanpa bocor antar konteks atau membuat run


### Requirement: Compound native arguments retain concrete metadata

The system SHALL describe all safe paths in a supported multi-file read and SHALL
recognize Node.js inline JavaScript evaluation inside supported shell wrappers.
Existing history SHALL use matching persisted native command metadata when
available without rewriting events or guessing across unrelated events.

#### Scenario: Multiple files and inline JavaScript
- **WHEN** native Get-Content reads src/cart.js and package.json and node --eval executes JavaScript
- **THEN** the read names both safe files and the command identifies JavaScript evaluation with Node.js

#### Scenario: Legacy source is unavailable or unrelated
- **WHEN** the immediately following same-run event is absent, unrelated, malformed or private stderr
- **THEN** the system preserves existing facts without exposing raw source or attributing another command
