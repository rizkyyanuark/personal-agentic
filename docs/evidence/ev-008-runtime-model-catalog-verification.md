# ev-008 — Katalog model sesuai runtime

Tanggal: 14 Oktober 2026 (Asia/Jakarta). Change: [CAT-001](../../openspec/changes/CAT-001-runtime-model-catalog/proposal.md), [Issue #6](https://gitlab.tugasakhir.space/rizkyyanuark/personal-agentic/-/work_items/6). Acceptance kandidat ini bukan catatan deployment produksi.

## Source dan lingkungan

Frontend: `App.tsx`, `NewAgentDialog.tsx`, `ChatActivity.tsx`; dasar backend `ec70e3287682fdc3c6a86df03054a38fe6e92817`. Checkout implementasi terpisah pada branch `codex/runtime-model-catalog`; source primary yang dirty tidak disentuh. Image backend diperiksa melalui `docker inspect`:

`registry.tugasakhir.space/rizkyyanuark/personal-agentic/platform@sha256:84cae56460603822e5eee645c634fcc64f7c125ca108b6259f5f800aa2c4cf9e`.

Kandidat menggunakan organisasi/SQLite/tmpfs terpisah, user aplikasi sebenarnya, batas256MiB, loopback18769 dan frontend bind read-only. Tidak ada mount controller `.codex`/auth host. SSH owner/runtime key diizinkan pengguna untuk discovery read-only dalam kandidat; known_hosts memakai public key terpercaya existing. Network production dipakai sementara oleh kandidat dengan izin eksplisit agar source-CIDR authorized key berlaku; production container/config tidak diubah.

Index HTML hasil build dan file yang dilayani kandidat identik:

`c8a79c9afb62df77f381d2391c5deb90cf77464fcd282e22e07afd76096892cb`.

## Implementasi dan defect yang terbukti

Dashboard dahulu memuat `/codex/settings` untuk fallback badge melalui handler error global. Pemanggilan dan fallback itu dihapus. Badge sekarang memakai recorded display name, lalu recorded ID dan harness run. Dialog memakai `/harness/settings` sesuai harness/runtime/SSH context, dengan error lokal, Refresh, valid-model gating dan penolakan response lama. Profile membersihkan metadata lama saat reload dan mempertahankan saved unavailable model.

Regresi tambahan direproduksi terhadap bundle sebelum perbaikan terakhir (index SHA `338eabd29195f8bdcdc0788f03723c84294bf5be53a35b3725054a008a473aad`): update proyek Local→registered melalui API nyata sementara dialog terbuka menyisakan nilai runtime `""`. Playwright gagal `toHaveValue` runtime baru setelah30detik. Source kini memakai workdir proyek saat ini, bukan state runtime initial; Profile membiarkan `agent_id` resolver menentukan konteks proyek tanpa explicit runtime lama. Kasus yang sama lulus pada hash final, termasuk kembali registered→Local dan invalidasi katalog.

## Bukti eksekusi

Perintah lokal: `npm ci --no-audit --no-fund` dari `src`, `npm run lint --workspace frontend --prefix src`, `npm run build --workspace frontend --prefix src`, `node --check src/frontend/tests/runtime-catalog.mjs`, `git diff --check`. Lint/build lulus; Vite memberi warning ukuran chunk existing >500kB, bukan error. Build dilakukan di laptop; server hanya menjalankan binary/image immutable dan browser/API requests.

Smoke dijalankan dengan Edge headless/Playwright melalui tunnel SSH scoped ke loopback kandidat: `node src/frontend/tests/runtime-catalog.mjs` dengan env disposable, private owner-key file serta transport fixture yang dijelaskan di verification. HTTP login/auth, API, storage dan router adalah aplikasi sebenarnya; tidak ada fake service/auth/schema atau internal-module mock.

| Pemeriksaan | Output nyata |
|---|---|
| Dashboard tanpa controller cache | anonymous401, selected Codex400; katalog eager0; banner global0. |
| Local metadata parser dan Refresh | Codex native settings parser200; dropdown dua model sama dengan API. |
| Actual SSH discovery | `/harness/settings` Antigravity200, enam model native; dropdown sama dengan API. |
| Actual SSH create/profile/project | Harness/model/workdir persisted melalui real app, project SSH inherited; tanpa agent/provider turn. |
| Live project context | Project API update Local→registered dan revert terpantul dalam dialog; katalog lama invalid, Create disabled ketika worker tidak punya katalog. |
| Native registered worker | Binary `agentic-enterprise --worker` benar-benar enroll/poll dan online; fresh unsigned home menghasilkan katalog0/capability absent; catalog400 dan UI disabled. |
| Unconnected/revoked runtime | API400 untuk kedua keadaan; UI meminta koneksi atau memberi status revoked. |
| Late response | Body error asli hasil `route.fetch` ditunda kemudian `route.fulfill({response:actual})`; pilihan baru tetap benar, payload mocks0. |
| Profile preservation | Unsaved harness change tidak tersimpan; saved unavailable model dan reasoning `high` tetap sama setelah Refresh; session rows tidak bertambah. |
| Historical identity | Dua reply Codex/Antigravity dari actual SQLite menghasilkan recorded name/raw ID dan harness title masing-masing. |
| Auth/tenant | Anonymous401; tenant controller/cross-workspace runtime400; owner catalog200. |
| Final invariant | 12/12 Passed; browserErrors `[]`; runs unchanged; sessions unchanged; provider inference turns0. |

Raw JSON/screenshot lokal disimpan ignored pada `org/.state/verification/runtime-catalog`: `absence/runtime-catalog.json`, `project-final/runtime-catalog.json`, `ssh-project/runtime-catalog.json`, `project-stale-baseline/runtime-catalog-failure.json`, dan `worker-cleanup.json`. Screenshot final `runtime-catalog.png`, `ssh-catalog.png`, `registered-catalog.png`, `recorded-model-badges.png`. Credential, token enrollment, private host/model cache dan raw production run tidak masuk dokumen/commit. JSON lama `full` bukan proof final.

## Provenance fixture dan batas klaim

Local Codex binary tidak terpasang. Dua model synthetic (`cat-fixture-primary`, `cat-fixture-secondary`) ditulis sebagai external CLI metadata `model_catalog_json` yang dibaca parser production existing; config/model_cache host pribadi tidak disalin. Ini membuktikan API/parser/UI/persistence, bukan login atau inference Codex. File metadata fixture SHA256 `c7df1e9b99f8b3ba08722b7c67f2f492b602fc82546bbcec54db3170bca1f8d2`.

Historical replies adalah fixture display yang dimasukkan ke schema `runs`/`messages` SQLite kandidat setelah schema diperiksa. IDs berawalan `cat-history`; model ID yang sama sengaja dipakai lintas harness untuk mendeteksi fallback nama controller yang keliru. Tidak ada PID/native session dan tidak ada provider yang menjalankan fixture tersebut. Status row bukan receipt eksekusi provider.

Actual SSH Antigravity adalah signed-in native CLI pada workstation yang dipilih, hanya query model; jumlah enam model adalah hasil runtime nyata. Registered worker menggunakan home kosong terpisah dan actual native process. Online tidak disamakan dengan readiness CLI.

Belum diuji: positive signed-in registered catalog, native Local Codex/OpenCode catalog, inference/provider quota, OS lain, dan OpenCode discovery provider per folder pada Create (HarnessQuery existing belum menerima path/project). Profile tetap memakai `agent_id` untuk resolver workdir efektif. CI commit gabungan, merge dan acceptance produksi harus dicatat koordinator; tidak ditutup oleh lint/browser kandidat ini.

## Cleanup

Smoke menghapus profil miliknya, mengarsipkan project disposable, serta menghapus tenant dan merevoke runtime offline miliknya. Native worker acceptance PID804 dihentikan hanya setelah UID10001 dan command marker state milik test diverifikasi. API kemudian memastikan offline, catalog400 dan revoked; `worker-cleanup.json` juga mencatat nativeSessions0. Cleanup container dilakukan koordinator setelah semua agen selesai. Tunnel dimiliki process test dan diakhiri pada `finally`; tidak ada persistent tunnel tambahan. Kandidat berisi semua historical/catalog fixture dan temporary SSH key/network attachment, sehingga penghapusan container oleh koordinator menghapus state/credential sementara secara utuh. Source key runtime produksi tidak dihapus.
