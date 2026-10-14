# Proposal: CAT-001 — Katalog model sesuai runtime

Issue: [GitLab #6](https://gitlab.tugasakhir.space/rizkyyanuark/personal-agentic/-/work_items/6).

Tanggal: 14 Oktober 2026 (Asia/Jakarta). Keputusan: [ADR 0001](../../../docs/decisions/0001-personal-agentic-architecture-contract.md). Dasar inspeksi: [ev-006](../../../docs/evidence/ev-006-current-contract-review.md).

## Masalah dan hasil

Dashboard sebelumnya memanggil `/codex/settings` setelah login melalui error handler global. Consumer tunggalnya adalah fallback nama pada badge reply. Kegagalan cache controller menjadi banner dashboard walaupun pengguna bekerja melalui harness atau workstation lain. Profile sudah memakai `/harness/settings`; dialog pembuatan agen hanya memiliki model dari capabilities registered worker, sehingga katalog lokal/SSH belum dimuat.

Pengguna tetap memilih beberapa harness per workstation. Katalog dan kegagalannya mengikuti konteks yang dipilih. Badge reply menggunakan identitas model yang direkam saat run, dengan ID tersimpan sebagai fallback; sebuah katalog controller hari ini tidak mengganti identitas riwayat lintas workstation.

## Scope dan batas

- Hapus pemanggilan controller Codex global yang tidak diperlukan.
- Gunakan `/harness/settings` untuk pembuatan agen lokal, SSH, dan registered worker, dengan konteks project efektif bila diwariskan.
- Pertahankan resolver/auth server existing. Controller/SSH tetap hanya untuk bootstrap owner; tenant memakai registered runtime miliknya sendiri. Tidak menambah mount kredensial.
- Tampilkan loading/error/Refresh pada pemilihan model; jangan memakai katalog konteks sebelumnya atau mengabaikan error konteks aktif.
- Pertahankan saved harness/model/reasoning, model unavailable, native session, dan recorded reply identity. Discovery tidak menjalankan prompt atau membuat session.

Tidak mengubah adapter/provider, memilih satu harness global, memindahkan kredensial, membuat fallback model otomatis, atau menjanjikan autentikasi/quota dari metadata katalog. Pemeriksaan koneksi tetap melalui alur existing. Endpoint pembuatan menerima runtime/host, belum path project; discovery provider OpenCode yang bergantung konfigurasi folder belum tercakup dan tidak diklaim terverifikasi. Profile yang sudah memiliki agen tetap memakai resolver `agent_id` untuk workdir efektif.

Minimum source: `src/frontend/src/App.tsx`, `src/frontend/src/NewAgentDialog.tsx`, `src/frontend/src/ChatActivity.tsx`. RuntimeSelect/HarnessSelect, backend resolver, auth dan catalog parser dipakai ulang. Bukti dan test berada bersama kontrak ini serta `src/frontend/tests/runtime-catalog.mjs`.

## Requirement dan skenario

### REQ-CAT-001-1 — Error mengikuti konteks pilihan

GIVEN controller tidak memiliki cache Codex, WHEN dashboard dibuka, THEN dashboard tidak mengambil katalog Codex global atau menampilkan error cache yang tidak terkait. WHEN pengguna memilih Codex pada controller tersebut, THEN dialog/Profile menampilkan kegagalan sebenarnya dan model lama tidak dapat dipakai untuk membuat agen. Refresh dan pemilihan harness/workstation lain memuat ulang katalog konteks itu.

### REQ-CAT-001-2 — Katalog mengikuti runtime efektif

GIVEN Local tanpa `ssh_host`, saved SSH workstation, registered worker online, atau workdir project, WHEN dialog/Profile dimuat, THEN `/harness/settings` menerima harness dan runtime/host efektif. Registered runtime offline/revoked tidak dapat membuat agen memakai capabilities yang tersimpan. Data yang datang terlambat dari pilihan lama tidak mengganti pilihan baru.

### REQ-CAT-001-3 — Akses dan kredensial tetap terbatas

GIVEN anonymous atau tenant, WHEN katalog diminta, THEN autentikasi dan batas controller/registered runtime existing tetap berlaku. Metadata diambil melalui adapter; seluruh `.codex` host tidak di-mount. Missing cache/config/CLI tetap error dari backend yang sebenarnya, bukan katalog buatan.

### REQ-CAT-001-4 — Identitas dan state tetap

GIVEN saved model tidak tersedia, WHEN Profile dibuka atau refresh gagal, THEN model/reasoning tetap tersimpan dan model unavailable terlihat tanpa substitusi otomatis. GIVEN reply beberapa harness/runtime, WHEN katalog saat ini berubah atau hilang, THEN badge memakai recorded name/ID dan harness run. Discovery atau perubahan form yang belum disimpan tidak membuat/mengubah native session atau saved profile.

## Penerimaan dan release

Lint dan TypeScript/build mendukung bukti browser/API pada service nyata dengan organization dan data terisolasi. Uji latency hanya menunda response HTTP sebenarnya, tidak membuat payload sukses. Catat tiap transport/auth case sebagai Passed, Inspected, Failed atau Not run; fixture historical/catalog metadata tidak membuktikan eksekusi provider. [Verification](verification.md) menyimpan hasil versi ini. Merge, image dan production proof dicatat terpisah oleh koordinator; tidak dianggap selesai hanya karena build lokal lulus.
