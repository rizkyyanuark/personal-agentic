# Strategi integrasi Live Preview kantor 3D

Tanggal: 6 Oktober 2026, Asia/Jakarta.

Status: implementasi V1 selesai dan preview Docker diperbarui pada 6 Oktober
2026. Lima profil dibuat pada workspace default. Detail perubahan, bukti uji,
lokasi source, dan batasan tersedia di [hasil integrasi](cockpit-integration-result.md).

## 1. Hasil produk yang dituju

Pemilik membuka **Organization → Live Preview**. Kantor 3D tampil hampir layar
penuh dalam overlay mengambang, dengan bayangan dan Organization yang diredupkan
di belakang. Login dan workspace aktif tetap memakai personal-agentic. Tombol X
atau latar menutup preview. Lima karakter mewakili lima agent nyata.
Pekerjaan tetap dimulai melalui chat/Actions yang sudah ada; status pekerjaan
diambil dari backend Rust dan mengubah karakter serta panel kantor.

Keputusan yang sudah dikonfirmasi pemilik:

- Arahan UI terbaru: preview mengambang hampir layar penuh di atas Organization.
- Semua interaksi asli cockpit dipertahankan: kartu fokus kamera ke meja,
  karakter/tag mengikuti karakter, Escape dan double-click mengembalikan kamera.
  Pemilihan karakter tidak membuka konfigurasi agent.
- Preview baca-saja, mengikuti workspace aktif, dan menyediakan filter tim.
- Nama, jabatan, warna, dan deskripsi lima role berasal dari cockpit yang ada.
- Hierarki: Workspace Owner → Orion → Nova, Atlas, Lyra, Axiom.
- Agent lain yang sudah ada dipertahankan.
- Desain warm studio dipertahankan; antislop diterapkan selama implementasi.

Workspace Owner tetap merupakan identitas manusia dan puncak Organization.
Owner tidak digantikan Orion dan tidak perlu menjadi karakter 3D tambahan.
Orion tetap memakai area papan; empat spesialis memakai empat meja yang ada.

## 2. Temuan kode yang menentukan pendekatan

Sumber utama yang diperiksa adalah
`C:\Users\rizky\Documents\GitHub\personal-agentic`, termasuk `virtual-kantor`.
Worktree implementasi berada di
`C:\Users\rizky\.codex\worktrees\d38a\personal-agentic`.
Keduanya berada pada commit `42fe706`, tetapi checkout utama memiliki perubahan
lokal, termasuk harness Antigravity dan seluruh folder cockpit yang belum
tracked. Perubahan lokal tersebut diimpor ke worktree sebelum implementasi;
checkout utama tetap menjadi sumber konfigurasi dan data preview existing.

| Temuan | Bukti sumber | Implikasi |
| --- | --- | --- |
| Docker membangun dengan context `src` | `src/compose.yaml`, `src/Dockerfile` | Folder cockpit di luar `src` belum ikut build. |
| Router frontend adalah router custom | `src/frontend/src/navigation.ts` | Tambahkan route melalui pola yang ada. |
| Rust sudah menyajikan UI dan API same-origin | `src/backend/src/api.rs`, `src/frontend/src/api.ts` | Gunakan sesi dan origin yang sama. |
| Workspace dipilih dan diotorisasi sebelum API | `src/backend/src/platform.rs` | Projection harus memakai Store tenant aktif. |
| Organization/global events memiliki akses administratif | `src/backend/src/platform.rs` | V1 mengikuti akses owner; perlu desain terpisah bila member ingin diberi akses. |
| `/api/state` membatasi daftar run terbaru menjadi 100 | `src/backend/src/api.rs` | Jangan menjadikannya satu-satunya sumber pekerjaan aktif. |
| Cockpit hanya menerima lima role tetap | `virtual-kantor/src/shared/office-contract.js` | Pertahankan slot visual, petakan ke ID agent nyata. |
| Cockpit membaca ledger AI Lab dengan default path Linux | `virtual-kantor/src/server/ledger.js` | Projection produksi berpindah ke Rust. |
| Entry scene memakai DOM global dan CSS fullscreen | `virtual-kantor/src/client/main.js`, `ui/hud.js`, `styles/main.css` | Perlu mount, scope DOM/CSS, dan lifecycle sebelum masuk shell React. |
| Cleanup lama hanya sebagian saat pagehide | `virtual-kantor/src/client/main.js` | Unmount route harus melepas timer, listener, observer, dan resource GPU. |
| HUD memiliki interpolasi data ke `innerHTML` | `virtual-kantor/src/client/ui/hud.js` | Render nama/data dinamis sebagai teks DOM. |

Uji baca-saja terhadap ledger/kontrak saat perencanaan menghasilkan:

```json
{
  "connection": "empty",
  "roles": ["hq_lab_director", "data_engineer", "data_scientist", "research_scientist", "ml_engineer"],
  "valid": true,
  "acceptsExtraAgent": false
}
```

Ini membuktikan perilaku kontrak saat ini, bukan integrasi atau status agent nyata.
Repo tidak memiliki SPEC.md yang ditemukan; PRD, README, AGENTS, konfigurasi,
dan implementasi menjadi bahan audit.

## 3. Arsitektur dan penataan codebase

Rekomendasi: satu aplikasi web, satu build frontend, dan package scene yang
bisa dipasang di React. Scene tetap Three.js; tidak perlu rewrite seluruh
scene menjadi React atau menambah React Three Fiber.

```text
src/
  Cargo.toml, Cargo.lock
  package.json                 npm workspaces: frontend + cockpit
  package-lock.json            satu lock untuk kedua package web
  backend/
    src/cockpit.rs             projection, mapping, setup role
  frontend/
    src/LivePreview.tsx         route, transport, auth, filter
    src/bindings/              tipe yang diekspor Rust
    public/cockpit-assets/     aset statis yang tidak diimport Vite
  cockpit/
    package.json, README.md
    src/                      scene, HUD, layout, mount API
    tests/                    pengujian scene yang tetap relevan
  migrations/                 migrasi mapping bila diperlukan
  scripts/
  Dockerfile, compose.yaml
docs/
  cockpit-integration-strategy.md
```

Folder `virtual-kantor` dipindahkan secara terkontrol ke package `src/cockpit`.
Pertahankan notices/lisensi dan dokumentasi desain, adaptasi dokumentasi lama
yang menyebut AI Lab/systemd, lalu hapus salinan lama setelah caller dan tests
berpindah. Jangan mempertahankan dua implementasi scene aktif.

Frontend mengelola fetch, sesi, filter, dan navigasi. Package cockpit mengelola
scene dan HUD di dalam container. Interface publik yang disarankan:

```ts
mountCockpit(container, options): {
  updateState(snapshot): void;
  dispose(): void;
}
```

Tipe options/snapshot harus eksplisit. Rust menjadi sumber kontrak projection
dengan mekanisme `ts-rs` yang sudah digunakan repo. Hindari menduplikasi bentuk
payload di beberapa tempat. Kode internal scene boleh tetap JavaScript dengan
interface bertipe.

Scope CSS ke root cockpit, ganti ukuran berbasis seluruh viewport menjadi
ukuran container, dan gunakan ResizeObserver. Lazy-load cockpit hanya saat
preview dibuka. Saat keluar, `dispose()` harus idempotent, termasuk untuk
mount/unmount React StrictMode, RAF, kontrol kamera, observer, listener,
texture/material/geometry, dan callback model yang selesai setelah unmount.

## 4. Lima agent dan pemetaan identitas

| Karakter | Position | Role awal dari cockpit | Reports to |
| --- | --- | --- | --- |
| Orion | Lab Director | Koordinasi lab dan keputusan operasional. | Workspace Owner |
| Nova | Data Engineer | Penyiapan dan validasi data. | Orion |
| Atlas | Data Scientist | Analisis data dan eksperimen model. | Orion |
| Lyra | Research Scientist | Penelaahan metode dan rancangan riset. | Orion |
| Axiom | ML Engineer | Pengembangan alur pelatihan dan inferensi model. | Orion |

Sumber nama/jabatan/warna: `office-contract.js`. Sumber deskripsi singkat:
`office-presentation.js`. Cockpit tidak menyediakan prompt operasional lengkap,
skills, credential, atau konfigurasi Hermes yang dapat langsung diimport.
`role` menggunakan deskripsi di atas; `position` menggunakan jabatan.
Instruksi kerja lengkap dapat dikembangkan kemudian melalui profil agent.

Persist mapping per workspace: `office_role → agent_id`. Jangan menghubungkan
berdasarkan nama, posisi array, atau label model. Rename tetap mempertahankan
mapping. Agent yang dihapus/dipause harus mendapat state eksplisit, bukan
diganti diam-diam dengan agent bernama sama.

Setup dijalankan sebagai tindakan administratif di Organization, terpisah dari
halaman preview yang baca-saja. Rekomendasi alurnya:

1. Setup menampilkan lima profil dan pilihan memakai agent yang sudah ada atau
   membuat profil yang belum tersedia.
2. Jika runtime belum dipilih, profil baru dapat disimpan nonaktif/tanpa workdir
   hanya apabila lolos aturan backend; UI menampilkan Belum dikonfigurasi.
   Jalur ini harus dibuktikan lewat API asli saat implementasi.
3. Runtime/harness/model/workdir dipilih melalui konfigurasi existing dan
   divalidasi pada mesin eksekusi. Jangan menganggap login Windows otomatis
   tersedia dalam Docker.
4. Pembuatan profil, revision/event, reporting line, dan mapping menggunakan
   logika domain yang sama dengan create/update agent existing. Ekstrak logika
   bersama bila diperlukan; jangan membuat jalur validasi yang lebih longgar.
5. Setup idempotent: klik ulang/retry/restart tidak menambah lima duplikat,
   mengganti profil existing, atau meluncurkan pekerjaan.

Persist konfigurasi lima slot dalam Store organisasi; gunakan transaksi dan
migrasi idempotent sesuai runner existing. Backup/export/restore harus membawa
mapping tersebut. Preview yang belum dipetakan menunjukkan setup state dan
tautan ke Organization.

## 5. Projection Rust dan kebenaran status

Route yang direkomendasikan: `GET /api/cockpit/state`.
Setup dapat memakai `POST /api/cockpit/setup` dan penyimpanan mapping melalui
interface administratif yang sama. Nama route ini adalah usulan implementasi.

Snapshot minimal:

- Versi kontrak, workspace ID, waktu snapshot, dan scope filter.
- Lima slot visual dengan ID/nama/position/warna agent yang sudah dipetakan.
- Ketersediaan konfigurasi/runtime, terpisah dari aktivitas pekerjaan.
- Semua run aktif untuk kelima agent, termasuk direct/delegate/summary/side chat.
- Jumlah aktivitas per phase dan hasil terakhir dengan run ID untuk navigasi.
- Ringkasan Action jika dibutuhkan papan tugas, dengan label scope yang jelas.

Default V1 mengirim status dan tautan detail yang berizin, tanpa raw prompt,
output/tool log, credential, path workdir, instruction, atau native session ID.
Tidak ada owner key dalam URL, local storage cockpit, bundle, atau environment
frontend. Gunakan cookie sesi same-origin dan otorisasi workspace yang ada.

| Bukti backend | Presentasi yang benar |
| --- | --- |
| Run queued | Antrean, belum bekerja |
| Run starting | Memulai |
| Run running tanpa pertanyaan tertunda | Bekerja |
| Run running dengan pertanyaan pemilik yang unresolved | Menunggu jawaban pemilik |
| Coordinator waiting | Menunggu agent bawahan |
| Succeeded | Hasil terakhir selesai; idle bila tidak ada run aktif |
| Delegated | Pekerjaan dialihkan ke fase lanjutan, bukan otomatis selesai |
| Failed/timed_out/interrupted/cancelled | Hasil berbeda dengan label yang sesuai |
| Runtime offline/checking | Ketersediaan runtime, bukan pengganti status historis |
| Request gagal/stale | Data tidak segar; jangan ubah semua agent menjadi idle |

Satu agent bisa memiliki beberapa run aktif. Tampilkan jumlah dan phase;
pekerjaan yang tetap berjalan tidak boleh tertutup oleh satu sesi yang menunggu.
Hasil gagal lama tidak boleh menjadikan agent selamanya tampak gagal saat ia
sedang menjalankan pekerjaan baru.

Projection mengambil semua run aktif dan riwayat terbatas per agent. Jangan
memotong seluruh riwayat sebelum mencari run aktif. Gunakan snapshot Store yang
konsisten; hindari nested locking ketika membaca fleet/runtime. Jangan memulai
CLI/probe jaringan/agent untuk menjawab request status.

Papan pekerjaan memakai Action untuk backlog/planned, Run untuk eksekusi, dan
hasil sesuai hubungan keduanya. Label Uji QA lama yang sebenarnya berarti
waiting approval harus disesuaikan. Pending pertanyaan manusia bukan bukti QA.
Setiap angka harus menyebut scope: lima agent cockpit dalam filter aktif,
bukan seluruh organisasi jika agent lain tidak dihitung.

Rekomendasi filter tim memakai Group/Project dan membership existing.
Karakter di luar filter tetap terlihat redup dengan label Di luar filter;
panel dan agregat hanya menghitung filter. Jangan menandai mereka idle ketika
sebenarnya hanya tidak termasuk filter.

## 6. Pengambilan data dan pengalaman pengguna

- Tambahkan tombol **Live Preview** di area actions header Organization.
- Route: `/organization/live-preview`, melalui parser/builder existing.
- Clear inspector agent/run yang tidak relevan saat membuka preview.
- Klik karakter membuka ringkasan/status serta link ke Profile/Run yang ada.
- Poll snapshot sekitar setiap 2 detik saat halaman terlihat; satu request
  pada satu waktu, timeout, dan backoff saat gagal. Ini interval target,
  bukan klaim latency yang sudah diukur.
- Saat kembali ke tab, lakukan refresh. Saat logout, pindah workspace/filter,
  atau unmount, batalkan request lama dan cegah respons lama masuk state baru.
- Jangan menambah broker/stream baru untuk V1. SSE existing dapat menjadi
  invalidation tambahan kelak; expiry heartbeat tetap perlu reconciliation.
- Loading, belum dipetakan, kosong, API error, unauthorized, runtime offline,
  dan data stale memiliki label yang berbeda.
- WebGL gagal tetap menyediakan panel status teks dan navigasi.
- Reduced motion menghentikan gerak dekoratif; animasi browser tidak memakai
  token model. Kegiatan suasana tetap berlabel ilustratif.
- Pertahankan warm studio, empat meja, Orion di papan, dan perilaku kamera yang
  relevan. Adaptasi responsive berdasarkan lebar container di samping sidebar.

Koreksi yang diperlukan saat migrasi HUD: jangan menandai semua event yang
tidak mengandung kata gagal sebagai Selesai; jangan tampilkan 0% untuk metrik
yang unavailable; gunakan label yang sesuai sumber angka. Ini ditemukan di
kode cockpit lama dan termasuk acceptance integrasi.

## 7. Build Docker dan operasional

Docker context tetap `src`. Stage Node menginstall kedua npm workspace dari
lockfile root, lalu membangun React beserta chunk/aset cockpit. Stage Rust
membangun backend projection. Image platform menyajikan satu `frontend/dist`
dengan API di origin yang sama, pada port lokal existing `18766`.

Express/ledger AI Lab keluar dari jalur produksi integrasi. Node tetap dipakai
untuk build/test; Matrix dan worker existing tetap mengikuti Compose sekarang.
Credential model berada di runtime eksekusi existing, bukan package scene.

Sesuaikan `.dockerignore`, scripts native `Build.ps1`, scripts npm, CI,
README/deployment/verification, dan asset paths. Pertahankan tests package yang
relevan dan notices aset. Periksa versi resolusi lock baru agar perpindahan ke
workspace tidak sekaligus menjadi upgrade dependensi yang tidak diminta.

Sebelum rollout: checkpoint perubahan utama, build/tag image kandidat,
gunakan Compose project/volume/port terpisah untuk bukti integrasi, lalu backup
volume org dalam kondisi service berhenti bila mengganti preview existing.
Jangan menggunakan `down -v`. Uji restore/mapping dan simpan image sebelumnya.
Rollback binary tidak boleh diasumsikan cocok dengan semua perubahan schema;
pilih migrasi additive dan verifikasi kompatibilitasnya.

Dockerfile utama juga memuat perubahan instalasi Antigravity yang belum
committed. Pertahankan pekerjaan itu dan catat bahwa installer tidak dipin;
jangan memasukkan rewrite harness ke cakupan cockpit.

## 8. Urutan implementasi dengan bukti per tahap

| Tahap | Pekerjaan utama | Bukti selesai |
| --- | --- | --- |
| 0. Baseline terbaru | Checkpoint kode utama dan import cockpit tanpa kehilangan edit lokal; dokumentasikan kondisi service/data | Diff hanya perubahan yang dimaksud; build dasar dapat direproduksi |
| 1. Lima profil dan mapping | Setup role, hierarki Owner→Orion→empat, mapping persisten dan idempotent | API asli menghasilkan lima agent/mapping; retry tidak duplikat; restart mempertahankan hierarki |
| 2. Status Rust | Projection typed, auth, semua run aktif, pertanyaan, runtime, filter | HTTP terautentikasi dan Store asli membuktikan statuses/scope; 401/403 dan workspace isolation |
| 3. Slice preview utuh | Mount/dispose package, lazy route, Live Preview button, snapshot ke satu karakter lalu kelimanya | Organization→preview; satu pekerjaan agent nyata mengubah scene hingga hasil; route tidak memulai pekerjaan |
| 4. UX dan regresi | Panel/filter/error/stale, koreksi label, responsive, keyboard, fallback, repeated mount | Browser flow dan screenshot asli; tidak ada canvas/timer/listener baru yang tertinggal tiap navigasi |
| 5. Docker kandidat | Workspace lock, multi-stage build, assets dan checks scripts | Fresh Docker build; web/API/aset 200; flow pekerjaan nyata; restart mempertahankan agent dan mapping |
| 6. Rollout preview | Backup state, ganti image, smoke login/Organization/chat/cockpit | URL preview berfungsi dan bukti tersimpan; data existing tetap ada |

Tahap 1-3 membentuk satu vertical slice yang benar-benar digunakan aplikasi.
Jangan menganggap projection atau screenshot scene saja sebagai integrasi selesai.
Tingkat pekerjaan diperkirakan sedang: lima slot membatasi perubahan layout,
tetapi refactor lifecycle dan projection status memerlukan implementasi nyata.
Belum ada estimasi hari atau klaim performa sebelum benchmark.

## 9. Verifikasi dan Definition of Done

Perintah target sesudah struktur workspace dibuat:

```text
cd src
cargo fmt --all --check
cargo test --workspace --locked
npm ci
npm run lint --workspace frontend
npm run build --workspace frontend
npm run check --workspace cockpit
```

Script check cockpit harus mempertahankan pemeriksaan yang relevan dari suite
existing dan memastikan modul dapat dibundle frontend. Perintah di atas adalah
target, belum tersedia semuanya pada checkout saat ini. Browser suite harus
diadaptasi ke route/backend asli; test gerak dengan snapshot terkontrol hanya
membuktikan visual, bukan eksekusi agent end-to-end.

Bukti wajib:

1. Owner login, Organization → Live Preview, kelima identitas/hierarki benar.
2. Pekerjaan aman melalui chat/Action existing memakai CLI/provider nyata;
   antrean, kerja, hasil di snapshot dan karakter sesuai run ID yang sama.
3. Pertanyaan pemilik dan delegasi menampilkan phase yang berbeda; parallel
   main/side run tidak hilang. Tidak perlu memaksa empat provider berjalan
   sekaligus hanya untuk membuktikan renderer.
4. Kegagalan/cancel/interrupted serta runtime offline ditampilkan jelas.
5. Run aktif lama tetap ada setelah lebih dari 100 run selesai yang lebih baru,
   melalui integration test dengan Store nyata.
6. Request tanpa sesi ditolak; scope owner/member mengikuti aturan existing;
   workspace lain tidak bocor; payload tidak memuat field privat.
7. Filter mengecilkan panel/agregat dengan benar; switch workspace/filter dan
   logout menolak respons lama. API loss tidak menjadi success/idle palsu.
8. Responsive 320/390/768/1024/1440, sidebar mobile, keyboard, reduced motion,
   dan fallback WebGL memakai status nyata.
9. Navigasi masuk/keluar berulang tidak menggandakan canvas, RAF, subscription,
   observer, atau resource yang dimiliki scene. Ukur FPS/CPU/memori bila
   mengklaim target performa; jangan menganggap semua cache renderer harus nol.
10. Fresh Docker build dan restart mempertahankan mapping/profil/data existing;
    login/chat/Organization lama tidak regresi.

Catat command, respons HTTP, run ID, screenshot/trace, restart evidence, dan
risiko tersisa. Tidak ada mock untuk bukti utama. Fixture terbatas boleh dipakai
untuk visual/edge case dengan label dan alasan jelas.

## 10. Input implementasi dan sumber

Runtime/harness/model/workdir lima agent dan ketersediaan credential masih perlu
diinspeksi saat setup. Ini tidak mengubah arah integrasi; profil nonaktif harus
terlihat Belum dikonfigurasi sampai benar-benar siap. Owner-only V1 merupakan
rekomendasi untuk mempertahankan izin Organization sekarang. Akses member dan
isi judul tugas privat memerlukan perluasan kebutuhan yang eksplisit.

Rujukan implementasi: README/PRD/AGENTS kedua project, `src/DEPLOYMENT.md`,
`virtual-kantor/DESIGN.md`, `docs/architecture.md`, dan
`docs/visual-acceptance.md` di cockpit. Rekonsiliasi kebutuhan AI Lab lama dengan
strategi ini saat modul dipindahkan; jangan menyatakan kontrak lama masih menjadi
sumber data produksi personal-agentic.

Rujukan primer eksternal:

- [npm Workspaces](https://docs.npmjs.com/cli/v11/using-npm/workspaces/): package
  lokal dan perintah workspace di bawah satu root.
- [Three.js cleanup](https://threejs.org/manual/pages/cleanup.html): pelepasan
  resource scene melalui dispose.
- [Three.js disposal](https://threejs.org/manual/pages/how-to-dispose-of-objects.html):
  pemilikan resource dan batas interpretasi statistik memori renderer.
