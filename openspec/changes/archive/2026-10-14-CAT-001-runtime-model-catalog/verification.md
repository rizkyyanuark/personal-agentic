# Verification: CAT-001

Tanggal: 14 Oktober 2026. [Proposal](proposal.md) | [Tasks](tasks.md) | [Bukti ev-008](../../../../docs/evidence/ev-008-runtime-model-catalog-verification.md).

Status: acceptance kandidat nyata lulus; CI, merge dan rilis produksi dikelola koordinator. Backend immutable `ec70e3287682fdc3c6a86df03054a38fe6e92817`, frontend hasil perubahan ini. Hash bundle dan provenance fixture ada pada ev-008.

| Requirement | Jalur produk dan hasil | Status |
|---|---|---|
| REQ-1 | Dashboard tanpa controller cache: anonymous401, selected catalog400, nol request katalog eager dan nol banner global. Error tetap di dialog/Profile; Refresh serta harness berikutnya memulihkan pilihan. | Passed |
| REQ-2 | Local native parser menghasilkan dua model fixture, SSH Antigravity nyata menghasilkan enam model; pilihan UI sama dengan API. Create/Profile benar-benar menyimpan harness/model/workdir. | Passed |
| REQ-2 | Workdir proyek Local dan SSH diwarisi; perubahan runtime proyek saat dialog terbuka membuang katalog lama. | Passed |
| REQ-2 | Worker native benar-benar online tetapi tanpa katalog: catalog400, harness/model/Create disabled; runtime belum tersambung dan revoked juga400. | Passed |
| REQ-2 | Response error HTTP nyata dari harness lama sengaja ditunda, lalu dikirim setelah katalog pilihan baru; tidak menimpa pilihan baru. | Passed |
| REQ-3 | Login owner nyata; anonymous401; tenant tidak dapat membaca controller atau runtime workspace lain. | Passed |
| REQ-4 | Saved unavailable model/reasoning tidak diganti; form tanpa Save tidak mengubah profile; sessions dan runs tidak bertambah. | Passed |
| REQ-4 | Dua reply historical fixture di SQLite nyata memakai recorded name/ID dan title Codex/Antigravity yang benar. | Passed |
| Registered catalog positif | Worker yang dipakai tidak memiliki signed-in CLI; valid online-unavailable dipastikan, katalog positif tidak diklaim. | Not run |
| Native Local/OpenCode/provider execution | Local Codex memakai metadata fixture; native OpenCode tidak terpasang dan prompt provider tidak dijalankan. Konfigurasi katalog OpenCode per folder pada create belum termasuk scope endpoint existing. | Not run |
| CI/produksi | Pipeline target dan acceptance setelah release harus dicatat koordinator pada commit gabungan. | Not run |

Browser smoke final `src/frontend/tests/runtime-catalog.mjs`: 12/12 skenario Passed, browser errors0, HTTP payload mocks0, provider inference turns0. Kasus SSH primary tambahan membuktikan actual SSH Create/Profile dan project inheritance. Error metadata autentikasi tidak diubah menjadi readiness palsu.

Reproduksi pada organisasi disposable: build frontend, start image real dengan writable data/workdir terisolasi sesuai `docs/deployment.md` dan `src/VERIFICATION.md`; siapkan owner key privat, native catalog/config serta workstation milik test. Set `AE_TEST_URL`, `AE_TEST_OWNER_KEY_FILE`, `AE_TEST_DISPOSABLE=true`, dan `AE_TEST_PROOF_DIR`, lalu `node src/frontend/tests/runtime-catalog.mjs`. Flag transport/fixture opsional ada pada script. Jangan menjalankan smoke mutasi ini terhadap organisasi produksi atau memasukkan credential/token ke evidence. Screenshot dan state raw tetap di lokasi ignored.
