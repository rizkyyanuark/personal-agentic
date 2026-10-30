# Audit Lengkap Percakapan AI & Dialog Karakter: humaedihume/kantor-agent

Dokumen ini merupakan hasil audit komprehensif terhadap seluruh bentuk percakapan, dialog antar-karakter, celetukan mandiri (*quips*), ucapan status kerja (*workflow lifecycle speech bubbles*), aksi langsung meja kerja (*live action speech bubbles*), serta pesan narasi alur aktivitas (*activity feed*) yang terdapat pada repositori [humaedihume/kantor-agent](https://github.com/humaedihume/kantor-agent).

Audit ini mencakup **100% teks dialog** tanpa ada yang terlewat, disertai kondisi logika pemicunya (*trigger conditions*), durasi tayang, dan peran masing-masing agen.

---

## 1. Arsitektur Komunikasi & Karakter AI

Pada Kantor Agent, seluruh percakapan dan pergerakan karakter digerakkan oleh kombinasi data nyata transkrip Claude Code (`~/.claude/projects`) serta simulasi status di browser (`kantor.js`).

### Entitas Karakter
1. **Ketua (Default: "Joko")**  
   - Representasi sesi utama Claude Code (file log utama).  
   - Memiliki meja kerja permanen (`A0`).
2. **Tim Inti (Default: 4 orang — "Budi", "Sari", "Agus", "Rina")**  
   - Representasi subagent pertama hingga keempat.  
   - Memiliki meja kerja masing-masing (`A1`–`A4`) dan santai di area *lounge* saat tidak bertugas.
3. **Freelancer (Pool: "Yoga", "Dewi", "Rudi", "Maya", "Eko", "Nina", "Fajar", "Wulan", "Dimas", "Lestari", "Hendra", "Tika")**  
   - Dipanggil ketika keempat anggota tim inti sedang sibuk.  
   - Datang melalui pintu masuk, bekerja di meja cadangan (`B0`–`B3`), dan pamit pulang lewat pintu ketika selesai.

### Komponen Visual Dialog
Setiap dialog ditampilkan dalam bentuk gelembung obrolan (*speech bubble*) CSS 2D HTML di atas kepala model 3D (`CSS2DObject`), dengan dua tipe tampilan:
- Gelembung biasa: latar putih (`.bubble`).
- Gelembung sorotan kerja (*highlight*): latar hijau muda berbingkai (`.bubble.hi`).

---

## 2. Obrolan Santai Dua Arah di Lounge (`CHAT`)

Terdapat **40 pasang dialog santai dua arah** antara dua karakter yang sedang tidak bekerja.

### Kondisi Pemicu (`chatter(now)` di `kantor.js:1509-1520`):
- **Status Karakter**: Tidak sedang bekerja (`!a.work`), tidak sedang berjalan (`!a.walking`), berada di spot santai *lounge* (`a.goal.startsWith('spot:')`), dan gelembung sebelumnya sudah selesai tayang (`now > a.bubble.until`).
- **Jumlah Minimum**: Harus ada minimal 2 karakter santai (`avail.length >= 2`).
- **Interval Waktu**: Dipicu setiap `7000ms + (Math.random() * 4500ms)` (~7,0 hingga 11,5 detik sekali).
- **Pemilihan Lawan Bicara**: Karakter penanya (`sp`) dipilih acak, karakter penjawab (`ls`) diprioritaskan karakter terdekat secara spasial 3D (probabilitas 70% terdekat, 30% acak).
- **Mekanisme Placeholder**: `{to}` digantikan otomatis dengan nama lawan bicara (`ls.name`).
- **Durasi Tayang**: Kalimat pertama tayang selama **4800 ms**; setelah jeda **2300 ms**, kalimat balasan tayang selama **4200 ms** (asalkan lawan bicara masih santai).
- **Tujuan Desain**: Percakapan statis, sengaja tidak membaca isi file atau kode proyek demi menjaga privasi penuh pengguna.

### Daftar Lengkap 40 Pasang Obrolan Santai:

| No | Pembicara A (Penanya: `sp`) | Pembicara B (Penjawab: `ls`) |
|:---|:---|:---|
| 1 | `"{to}, main bola di PS yuk! Yang kalah traktir bakso"` | `"Ogah, kemarin aku kalah 3–0 😅"` |
| 2 | `"Filmnya jangan di-spoiler ya, {to}!"` | `"Siap, mulutku terkunci 🤐"` |
| 3 | `"Kopinya kok pahit banget?"` | `"Itu espresso, bukan kopi sachet 😂"` |
| 4 | `"Galon siapa yang ngabisin?"` | `"Bukan aku, sumpah!"` |
| 5 | `"Gitarnya fals dikit tuh, {to}"` | `"Namanya juga gitar kantor"` |
| 6 | `"Besok hujan nggak ya?"` | `"Bawa payung aja biar aman ☔"` |
| 7 | `"Ada gorengan nggak di pantry?"` | `"Tadi ada, udah habis 🙃"` |
| 8 | `"Ngantuk banget habis makan siang"` | `"Sama, butuh kopi kedua"` |
| 9 | `"Kucingku tadi pagi nyolong ikan"` | `"Wkwk pasti kucing oranye"` |
| 10 | `"{to}, weekend mau ke mana?"` | `"Rebahan aja, paling mewah 😴"` |
| 11 | `"Lagu apa ini? Enak juga"` | `"Lagu lama, tapi masih enak"` |
| 12 | `"{to}, itu gelas kopi ketiga ya?"` | `"Biar fokus nanti 😆"` |
| 13 | `"Kemarin nemu warung mi ayam enak"` | `"Wah, bagi lokasinya dong!"` |
| 14 | `"{to}, kamu tim bubur diaduk?"` | `"Nggak diaduk dong, garis keras"` |
| 15 | `"AC-nya dingin banget ya"` | `"Pakai jaket, jangan kalah sama AC"` |
| 16 | `"{to}, headset-mu mana?"` | `"Lagi di-charge 🔋"` |
| 17 | `"Martabak manis atau telur?"` | `"Dua-duanya, biar adil"` |
| 18 | `"{to}, tanamannya udah disiram?"` | `"Udah, tadi pagi 🌱"` |
| 19 | `"Kok tiba-tiba pengin nasi padang"` | `"Rendangnya jangan lupa!"` |
| 20 | `"Siapa yang naruh kaus kaki di sofa?"` | `"Bukan punyaku… kayaknya 😬"` |
| 21 | `"{to}, tadi berangkat naik apa?"` | `"Ojek, lancar jaya"` |
| 22 | `"Hari ini kok cepat banget ya"` | `"Iya, tahu-tahu sore"` |
| 23 | `"Pengin liburan ke pantai"` | `"Ajak-ajak dong!"` |
| 24 | `"{to}, suka pedas nggak?"` | `"Level lima pun aman 🌶️"` |
| 25 | `"Kursi ini bunyi kalau diduduki"` | `"Sudah dari dulu, jadi ciri khas"` |
| 26 | `"Siapa yang pinjam spidol biru?"` | `"Ada di papan, tuh"` |
| 27 | `"{to}, sudah sarapan?"` | `"Sudah, roti bakar 🍞"` |
| 28 | `"Es teh atau es jeruk?"` | `"Es teh manis, selalu"` |
| 29 | `"Jam dinding itu telat nggak sih?"` | `"Tepat kok, kitanya yang telat"` |
| 30 | `"{to}, tim kucing atau tim anjing?"` | `"Tim kucing, jelas 🐈"` |
| 31 | `"Kemarin nonton bola?"` | `"Ketiduran di babak pertama"` |
| 32 | `"Hujan-hujan enaknya makan bakso"` | `"Setuju, kuahnya panas"` |
| 33 | `"{to}, kaosmu baru ya?"` | `"Iya, diskon kemarin 😄"` |
| 34 | `"Wah, bukunya ada yang baru"` | `"Siapa yang beli ya?"` |
| 35 | `"Mau pesan kopi susu, ada yang nitip?"` | `"Aku! Gula dikit ya"` |
| 36 | `"{to}, playlist-mu apa?"` | `"Campur aduk, dangdut sampai jazz"` |
| 37 | `"Parkiran tadi penuh banget"` | `"Aku sampai muter dua kali"` |
| 38 | `"Kayaknya perlu beli galon lagi"` | `"Nanti aku telepon depot"` |
| 39 | `"{to}, jangan lupa minum air"` | `"Siap, bos air 💧"` |
| 40 | `"Sore ini cerah ya"` | `"Enak buat jalan-jalan"` |

---

## 3. Celetukan Mandiri Karakter Berdasarkan Spot Santai (`QUIPS`)

Celetukan ini diucapkan oleh satu karakter secara mandiri ketika berpindah atau tiba di tempat santai tertentu.

### Kondisi Pemicu (`arrive(a)` di `kantor.js:1419-1421`):
- **Waktu Muncul**: Saat karakter baru saja menyelesaikan rute perjalanan dan tiba di titik tujuan (`arrive(a)`).
- **Bukan Initial Load**: `!instant` bernilai `true` (tidak dieksekusi saat halaman pertama kali dibuka).
- **Probabilitas Muncul**: `Math.random() < 0.55` (peluang kejadian 55%).
- **Kondisi Gelembung**: `performance.now() > a.bubble.until` (tidak sedang menampilkan balon obrolan lain).
- **Durasi Tayang**: Standar `4200 ms`.
- **Fallback Default**: Bila spot tidak ditemukan di kamus: `['Santai dulu']`.

### Daftar Lengkap 37 Celetukan Berdasarkan Spot:

| ID Spot | Lokasi / Objek di Kantor | Daftar Celetukan |
|:---|:---|:---|
| `tv` | Sofa depan TV | 1. `"Filmnya lagi seru nih 🍿"`<br>2. `"Eh, aktornya siapa ya?"`<br>3. `"Jangan di-skip dulu!"`<br>4. `"Episode ini bagus banget"` |
| `ps` | Sofa dengan stick PlayStation | 1. `"Gooool! ⚽"`<br>2. `"Satu match lagi ah 🎮"`<br>3. `"Stiknya agak nge-drift nih"`<br>4. `"Tunggu, aku belum siap!"` |
| `coffee` | Mesin kopi / pantry | 1. `"Ngopi dulu biar melek ☕"`<br>2. `"Espresso double, please"`<br>3. `"Wangi banget kopinya"`<br>4. `"Gulanya di mana ya?"` |
| `water` | Dispenser air minum | 1. `"Minum air putih dulu 💧"`<br>2. `"Galonnya tinggal dikit"`<br>3. `"Seger!"`<br>4. `"Airnya dingin, mantap"` |
| `guitar` | Pojok santai dengan gitar | 1. `"🎸 jreng… jreng…"`<br>2. `"Request lagu dong"`<br>3. `"Kuncinya G atau C ya?"`<br>4. `"Senarnya perlu diganti"` |
| `window` | Dekat jendela kantor | 1. `"Langitnya cerah ya ☀️"`<br>2. `"Peregangan dulu, pegal 🙆"`<br>3. `"Macet banget di bawah"`<br>4. `"Ada layangan tuh!"` |
| `meet1` | Kursi meja rapat 1 | 1. `"Rapat lima menit, janji!"`<br>2. `"Siapa yang pesan kopi?"`<br>3. `"Kursinya empuk juga"` |
| `meet2` | Kursi meja rapat 2 | 1. `"Diskusi ringan dulu ☕"`<br>2. `"Laptopnya siapa ini?"`<br>3. `"Duduk dulu ah"` |
| `meet3` | Kursi meja rapat 3 | 1. `"Meja ini paling adem"`<br>2. `"Ngobrol santai dulu"`<br>3. `"Kita bahas nanti aja"` |
| `bookshelf` | Rak buku & komik | 1. `"Buku ini seru juga 📚"`<br>2. `"Wah, ada komik!"`<br>3. `"Bukunya belum dikembalikan nih"` |
| *(fallback)* | Lokasi tak terdaftar | 1. `"Santai dulu"` |

---

## 4. Percakapan Langsung Siklus Hidup Alur Kerja (*Workflow Reactions*)

Percakapan ini dipicu oleh perubahan status riil subagent dan sesi utama Claude Code.

| Karakter | Teks Ucapan | Gaya Gelembung | Durasi | Kondisi Logika Pemicu (`kantor.js`) |
|:---|:---|:---:|:---:|:---|
| **Ketua (Joko)** | `"Beres, menunggu instruksi berikutnya"` | `.hi` (hijau) | 3800 ms | Terjadi saat sesi aktif ketua beralih dari `state === 'bekerja'` menjadi `state === 'selesai'`. (`kantor.js:1848`) |
| **Ketua (Joko)** | `"{a.name}, tolong: {task}"` *(task dipotong 40 karakter)* | Biasa | 4000 ms | Terjadi saat subagent baru didelegasikan ke anggota tim (`a`). Muncul bersamaan dengan respon anggota tim. (`kantor.js:1864`) |
| **Anggota Tim** (Budi/Sari/Agus/Rina) | `"Siap, saya kerjakan!"` | `.hi` (hijau) | 3600 ms | Terjadi saat anggota tim menerima tugas subagent baru dan beralih ke meja kerja (`working = true`). (`kantor.js:1863`) |
| **Anggota Tim** (Budi/Sari/Agus/Rina) | `"Beres!"` | `.hi` (hijau) | 3600 ms | Terjadi saat subagent selesai dikerjakan dan anggota tim beralih dari bekerja ke mode santai. (`kantor.js:1867`) |
| **Freelancer** | `"Permisi, saya bantu ya!"` | Biasa | 3000 ms | Terjadi saat keempat anggota tim inti sibuk, sehingga subagent dialokasikan ke freelancer baru yang masuk lewat pintu. (`kantor.js:1887`) |
| **Freelancer** | `"Siap, saya kerjakan!"` | `.hi` (hijau) | 3600 ms | Terjadi saat freelancer tiba di meja cadangan dan mulai memproses segmen tugas. (`kantor.js:1897, 1898`) |
| **Freelancer** | `"Beres! Pamit dulu ya 👋"` | `.hi` (hijau) | 3800 ms | Terjadi saat tugas freelancer selesai, karakter berdiri dari meja cadangan dan berjalan keluar menuju pintu. (`kantor.js:1902`) |

---

## 5. Balon Aksi Meja Kerja Langsung (*Live Action Speech Bubbles*)

Saat karakter sedang duduk bekerja di meja (`a.work && a.seated`) dan tidak ada dialog prioritas, gelembung di atas kepala menampilkan ringkasan aksi tool Claude Code yang sedang berjalan.

### Kondisi Pemicu (`kantor.js:1824-1830, 2205`):
- Karakter sedang duduk di meja kerja (`a.work && a.seated`).
- Resolusi layar desktop (`innerWidth > 820px`).
- Waktu aksi terbaru kurang dari 25 detik yang lalu (`Date.now() - event.t <= 25000`).
- Teks dipotong maksimal 48 karakter (`clip(e.text, 48)`).

### Format Teks Aksi Berdasarkan Tool (`transcripts.mjs:307-328` & `Transcripts.php`):

| Tool Claude Code | Format Teks yang Ditampilkan di Kepala Agen |
|:---|:---|
| `Read` | `"Membaca {nama_file_relatif}"` |
| `Write` | `"Menulis {nama_file_relatif}"` |
| `Edit` / `MultiEdit` / `NotebookEdit` | `"Mengubah {nama_file_relatif}"` |
| `Bash` | `"Menjalankan: {description}"` atau `"Menjalankan: {command_awal} …"` |
| `Grep` | `"Mencari '{pattern}'"` *(maks 50 char)* |
| `Glob` | `"Mencari file {pattern}"` *(maks 60 char)* |
| `Agent` / `Task` | `"Mendelegasikan: {description atau 'subagent'}"` |
| `SendMessage` | `"Mengirim pesan ke agent"` |
| `AskUserQuestion` | `"Bertanya ke user"` |
| `WebFetch` / `WebSearch` | `"Riset web"` |
| `Skill` | `"Memuat skill {nama_skill}"` |
| `TodoWrite` | `"Memperbarui daftar tugas"` |
| `TaskCreate` | `"Membuat tugas: {subject}"` |
| `TaskUpdate` | `"Memperbarui tugas → {status}"` |
| `TaskStop` | `"Menghentikan subagent"` |
| `SubagentHandback` | `"Menyerahkan laporan"` |
| `ToolSearch` | `"Mencari alat"` |
| *Tool lain* | Nama tool *(maks 60 char)* |
| *Teks Claude (Output)* | Baris pertama jawaban Claude yang telah disanitasi *(maks 180 char)* |

---

## 6. Pesan Narasi Alur Aktivitas Tim (*Feed Panel Events*)

Pesan-pesan ini dimuat ke dalam panel sisi kiri (*Aktivitas Langsung* / `#feed`) dan panel riwayat (`office.mjs:194-244` & `Office.php`).

| Tipe Aksi | Format Kalimat | Kondisi Pemicu |
|:---|:---|:---|
| `assign` | `"{Pengirim} meminta {Penerima}: {task}"` | Terjadi saat subagent baru pertama kali dibuat (segmen 0). `Pengirim` adalah Ketua atau agen induk (*parent agent*). |
| `resume` | `"{Penerima} melanjutkan: {task}"` | Terjadi saat subagent yang sudah pernah dibuat dibangunkan kembali untuk segmen tugas berikutnya (mis. via `SendMessage`). |
| `done` (Normal) | `"{Penerima} selesai: {task}"` | Terjadi saat subagent menyelesaikan tugasnya secara normal (`end_turn` atau `SubagentHandback`). |
| `done` (Limit) | `"{Penerima} jeda — limit pemakaian"` | Terjadi saat subagent berhenti karena mencapai batas penggunaan token/biaya Claude Code. |
| `done` (Dihentikan) | `"{Penerima} dihentikan: {task}"` | Terjadi saat subagent dihentikan secara eksplisit melalui perintah `TaskStop`. |
| `done` (Timeout) | `"{Penerima} berhenti — tidak ada aktivitas {N} menit"` | Terjadi jika subagent tidak ada respon/aktivitas baru melebihi batas toleransi `running_window` (default 15 menit). |

---

## 7. Status Teks Banner & Subtitel Kantor (*Office Phase Texts*)

Teks deskriptif yang tampil di baris atas UI di bawah judul kantor (`#phase` dan `#banner`) pada `kantor.js:1973-1986`:

1. **Belum Ada Transkrip Proyek**:
   - Subtitel: `"Belum ada transkrip Claude Code untuk folder ini — kantor terisi otomatis setelah Claude Code dipakai di sini."`
   - Banner: `"Menunggu aktivitas Claude Code di folder project ini."`
2. **Tim Sedang Bekerja**:
   - Subtitel: `"Sedang bekerja: {nama_anggota_tim/freelancer} [ · {Ketua} memantau]"`
3. **Hanya Ketua yang Bekerja**:
   - Subtitel: `"{Ketua} sedang bekerja di sesi utama — tim santai menunggu tugas"`
4. **Ketua Baru Selesai**:
   - Subtitel: `"{Ketua} baru selesai — menunggu instruksi berikutnya"`
5. **Kondisi Semua Santai**:
   - Subtitel: `"Semua santai ☕ — nonton, ngopi & ngobrol. Otomatis kembali kerja saat ada subagent."`

---

## 8. Ringkasan Statistik Audit

- **Total Percakapan Santai Dua Arah (`CHAT`)**: 40 pasang dialog (80 kalimat unik).
- **Total Celetukan Mandiri Spot Santai (`QUIPS`)**: 10 kategori spot (36 teks unik + 1 fallback = 37 variasi celetukan).
- **Total Reaksi Siklus Hidup Alur Kerja**: 7 varian ucapan reaktif (`hi`/bubble).
- **Total Format Aksi Meja Kerja**: 17 pemetaan nama alat & teks Claude Code.
- **Total Status Event Feed**: 6 variasi narasi penugasan & penyelesaian tugas.
- **Total Status Subtitel Kantor**: 5 kalimat kondisi fase kantor.

Seluruh dialog di atas diekstrak langsung dari kode sumber resmi repositori `humaedihume/kantor-agent` (file `kantor.js`, `transcripts.mjs`, `office.mjs`, dan `SKILL.md`).
