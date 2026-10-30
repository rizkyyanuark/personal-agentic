# Audit Komprehensif: Sistem & Aktivitas Agen Saat Mode Idle (Santai)
## Analisis Arsitektur Repositori humaedihume/kantor-agent

Dokumen ini disusun sebagai laporan audit teknis mendalam untuk **Tim Pengembang (Dev Team)** mengenai seluruh mekanisme, logika mesin keadaan (*state machine*), navigasi spasial, animasi, properti 3D, serta sistem komunikasi agen saat berada dalam status **Idle (Santai / Tidak Ada Tugas)** pada repositori [humaedihume/kantor-agent](https://github.com/humaedihume/kantor-agent).

---

## 1. Ringkasan Eksekutif & Filosofi Desain Idle

Pada **Kantor Agent**, mode *idle* bukan sekadar status diam (*frozen state*), melainkan bagian inti dari pengalaman imersif (*ambient office simulation*). Arsitektur dirancang dengan prinsip utama:

1. **Zero-Fake Data, Pure Real-Log Driven**: Perubahan status kerja agen 100% dipicu oleh transkrip nyata Claude Code (`~/.claude/projects/`). Ketika tidak ada prompt pengguna atau subagent yang berjalan, sistem secara otomatis beralih ke simulasi santai.
2. **Ambient Office Immersion**: Agen yang sedang santai tidak menghilang atau mematung di meja kerja, melainkan bangkit, berjalan ke area *lounge*, memilih aktivitas santai (nonton TV, bermain game, minum kopi, bermain gitar, membaca buku, santai di jendela, atau duduk di meja rapat), serta saling bercakap-cakap.
3. **Privacy-by-Design**: Seluruh dialog santai dan celetukan idle menggunakan kamus teks statis khas perkantoran Indonesia. Sistem **secara tegas tidak membaca file kode, output terminal, atau transkrip prompt** untuk obrolan santai, sehingga aman dari kebocoran data privasi/kode sensitif perusahaan.
4. **Deterministik & Ringan**: Logika penugasan dan transisi status menghasilkan output yang identik di Node.js dan PHP (`parity.mjs`), bebas dependensi berat, serta berjalan di 60 FPS pada WebGL desktop maupun mobile.

```
                          ┌─────────────────────────┐
                          │  Claude Code Transcript │
                          │     (~/.claude/projects)│
                          └────────────┬────────────┘
                                       │ Polling (3 detik)
                                       ▼
                          ┌─────────────────────────┐
                          │    Backend State Engine │
                          │ (office.mjs / Office.php)│
                          └────────────┬────────────┘
                                       │ JSON State
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          Frontend Engine (kantor.js)                        │
│                                                                             │
│   ┌────────────────────┐   idle trigger   ┌─────────────────────────────┐   │
│   │ Working at Desk    │ ───────────────> │ Lounge Wandering & Sitting  │   │
│   │ (Ketua A0, Tim A1-4│ <─────────────── │ (10 Relaxing Spots)         │   │
│   └────────────────────┘   task assigned  └──────────────┬──────────────┘   │
│                                                          │                  │
│                        ┌─────────────────────────────────┴──────────────┐   │
│                        ▼                                                ▼   │
│         ┌─────────────────────────────┐                 ┌─────────────────┐ │
│         │ Spontaneous Quips (55%)     │                 │ 2-Way Chatter   │ │
│         │ (37 Spot-Specific Celetukan)│                 │ (40 Pasang Teks)│ │
│         └─────────────────────────────┘                 └─────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Mesin Keadaan (State Machine) & Ambang Batas Idle

Status idle agen dievaluasi setiap 3 detik oleh backend (`office.mjs` di Node.js atau `Office.php` di PHP).

### 2.1 Parameter Konfigurasi Waktu (`defaults.json`)

| Parameter | Nilai Default | Definisi Teknis |
|:---|:---:|:---|
| `cooldown` (`CD`) | **60 detik** | Durasi masa transisi status `selesai` ke `santai`. Mencegah agen langsung berpindah kerja mendadak. |
| `main_active` (`MA`) | **90 detik** | Batas toleransi aktivitas sesi utama Ketua sebelum dianggap idle/santai. |
| `running_window` (`RW`) | **900 detik** (15 menit) | Ambang batas timeout tanpa aktivitas sebelum subagent dianggap selesai/berhenti karena tidak aktif. |
| `spare_desks` | **4** | Jumlah meja cadangan untuk freelancer (`B0`–`B3`). |

### 2.2 Logika Penentuan Status Idle untuk Ketua (`office.mjs:167-173`)

Status Ketua dihitung melalui fungsi `mainState(m)` terhadap sesi utama Claude Code:

$$\text{age} = \text{now} - \text{timestamp}(\text{updated})$$

1. **Bekerja (`aktif`)**: Jika sesi belum final dan $\text{age} \le 90\text{ detik}$.
2. **Bekerja (`alat`)**: Jika aksi terakhir adalah pemanggilan tool dan $\text{age} \le 900\text{ detik}$.
3. **Bekerja (`menunggu-tim`)**: Jika ada subagent aktif yang sedang berjalan di bawah sesi Ketua ($k > 0$).
4. **Cooldown (`selesai`)**: Jika aksi terakhir adalah respon final (`final`) dan $\text{age} < 60\text{ detik}$.
5. **Santai (`santai` / IDLE)**: Jika seluruh kondisi di atas tidak terpenuhi ($\text{age} \ge 60\text{ detik}$ setelah respon final, atau tidak ada aktivitas).

### 2.3 Logika Penentuan Status Idle untuk Tim Inti (`office.mjs:125-151`)

Untuk setiap anggota Tim Inti (Budi, Sari, Agus, Rina):
- Jika tidak memiliki *job* subagent: `state = 'santai'`.
- Jika baru menyelesaikan tugas subagent:
  - $\text{now} - \text{job.end} < 60\text{ detik} \longrightarrow \text{state} = \text{'selesai'}$ (Fase Cooldown).
  - $\text{now} - \text{job.end} \ge 60\text{ detik} \longrightarrow \text{state} = \text{'santai'}$ (Fase Pure Idle).

---

## 3. Tipologi & Perilaku Karakter Saat Idle

Terdapat perbedaan perilaku mendasar antara **Ketua**, **Tim Inti**, dan **Freelancer** ketika menghadapi kondisi idle:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          SIFAT KARAKTER SAAT IDLE                           │
├─────────────────┬───────────────────────────────────────────────────────────┤
│ Ketua (Joko)    │ Tetap di meja A0 saat memantau subagent, namun IKUT       │
│                 │ bersantai ke area lounge saat sesi utama benar-benar      │
│                 │ idle dan tidak ada subagent yang ditunggu.                │
├─────────────────┼───────────────────────────────────────────────────────────┤
│ Tim Inti (4)    │ Wajib meninggalkan meja kerja A1–A4 menuju area lounge.   │
│                 │ Berkeliling dan menempati 10 spot santai secara dinamis.  │
├─────────────────┼───────────────────────────────────────────────────────────┤
│ Freelancer      │ TIDAK PERNAH bersantai di lounge. Begitu tugas selesai,   │
│                 │ mengucapkan pamit, berjalan ke pintu keluar, dan          │
│                 │ langsung di-despawn dari scene Three.js.                  │
└─────────────────┴───────────────────────────────────────────────────────────┘
```

### 3.1 Ketua (Joko)
- Diinisialisasi di meja kerja `A0`.
- Jika sesi utama idle (`d.ketua.state === 'santai'`), Ketua berdiri dari meja `A0` dan berpindah ke area lounge menggunakan fungsi `lounge(KETUA, now, firstLoad)` (`kantor.js:1845`).
- Monitor meja `A0` beralih menampilkan jam digital besar dan teks status:
  `"Joko · Santai"`, dengan subtitel `"aktif terakhir {N} menit lalu"` atau `"belum ada sesi"`.

### 3.2 Tim Inti (Budi, Sari, Agus, Rina)
- Ketika tugas selesai, karakter mengucapkan `"Beres!"` (balon hijau `.hi` selama 3.6 detik).
- Karakter berdiri dari kursinya (`a.seated = false`), berjalan melalui koridor menuju salah satu dari 10 spot santai di area lounge.
- Karakter menetap di spot tersebut selama **38 hingga 72 detik** (`38000 + Math.random() * 34000` ms) sebelum mencari spot santai baru (`kantor.js:1506`).
- Layar meja kerja utama menampilkan: `"{Nama} · Santai"` dengan informasi tugas terakhir (`"terakhir: {task}"`) atau `"menunggu tugas"`. Layar meja samping menampilkan `"Layar terkunci"`.

### 3.3 Freelancer (Yoga, Dewi, Rudi, Maya, dkk.)
- Freelancer adalah pekerja kontrak sementara (*on-demand worker*).
- Ketika tugas freelancer selesai:
  1. Status beralih dari `bekerja` ke `selesai`.
  2. Karakter **tidak pergi ke lounge**.
  3. Karakter mengucapkan: `"Beres! Pamit dulu ya 👋"` (balon hijau `.hi` selama 3.8 detik).
  4. Karakter berdiri dari meja cadangan (`B0`–`B3`) dan berjalan menuju pintu kantor (`goTo(a, 'door')`).
  5. Begitu melintasi pintu (`pl.kind === 'door'`, `a.gone = true`), scene Three.js mengeksekusi `removeActor(a)` (`kantor.js:1356-1367`): seluruh mesh dan geometri dibersihkan dari memori (*disposed*), elemen DOM label dihapus.
  6. Meja cadangan kembali ke status awal: layar utama menampilkan `"Meja cadangan N · untuk freelancer"`, layar samping menampilkan `"Kosong"`.

---

## 4. Arsitektur Spasial 10 Spot Santai (*Lounge Spots*)

Area lounge kantor memiliki 10 titik santai (`SPOTS`) dengan koordinat spasial 3D, orientasi hadap (*heading*), dan jalur navigasi (*spoke*) masing-masing (`kantor.js:1213-1224`):

| ID Spot | Nama Area & Posisi | Koordinat 3D $(X, Z)$ | Sudut Hadap | Jenis Tempat | Properti Interaktif / Mesh |
|:---:|:---|:---:|:---:|:---:|:---|
| `tv` | Sofa depan TV | $(4.3, 1.25)$ | $\pi$ ($180^\circ$) | `sofa` | Sofa empuk, layar TV streaming/game |
| `ps` | Sofa konsol PlayStation | $(5.5, 1.25)$ | $\pi$ ($180^\circ$) | `sofa` | Stik PS (`gamepad`), TV beralih ke mini-game balap |
| `coffee` | Mesin Kopi Pantry | $(7.7, -5.55)$ | $\pi$ ($180^\circ$) | Berdiri | Mesin kopi, cangkir kopi (`mug`) di tangan kanan |
| `water` | Dispenser Air Galon | $(8.75, -5.45)$ | $\pi/2$ ($90^\circ$) | Berdiri | Dispenser galon air, cangkir (`mug`) |
| `window` | Jendela Kaca Kantor | $(3.5, -6.15)$ | $\pi$ ($180^\circ$) | Berdiri | Pemandangan luar gedung, peregangan tangan |
| `guitar` | Pojok Gitar Akustik | $(-1.4, 2.6)$ | $0.35\text{ rad}$ | Berdiri | Gitar kayu akustik 3D (`guitarMesh`) |
| `meet1` | Kursi Meja Rapat 1 | $(\text{MEET}_x + 0.58, \text{MEET}_z - 1.22)$ | $-0.45\text{ rad}$ | `chair` | Kursi rapat kayu, meja rapat panjang |
| `meet2` | Kursi Meja Rapat 2 | $(\text{MEET}_x - 1.35, \text{MEET}_z + 0.10)$ | $1.65\text{ rad}$ | `chair` | Kursi rapat sisi kiri meja rapat |
| `meet3` | Kursi Meja Rapat 3 | $(\text{MEET}_x + 0.76, \text{MEET}_z + 1.11)$ | $-2.54\text{ rad}$ | `chair` | Kursi rapat ujung meja |
| `bookshelf`| Rak Buku & Komik | $(-8.9, 3.8)$ | $-\pi/2$ ($-90^\circ$)| Berdiri | Rak buku kayu, buku 3D (`book`) terbuka |

### 4.1 Mekanisme Klaim Spot Tanpa Tabrakan (`claimedSpots`)

Untuk memastikan tidak ada dua karakter yang duduk di sofa yang sama atau berdiri menumpuk di depan dispenser, `kantor.js` menggunakan fungsi `claimedSpots(except)` (`kantor.js:1492-1496`):

```javascript
function claimedSpots(except) {
  const s = new Set();
  for (const a of actors.values()) {
    if (a !== except && a.goal?.startsWith('spot:')) s.add(a.goal.slice(5));
  }
  return s;
}
```

Ketika seorang agen idle hendak berpindah tempat santai:
1. Sistem mengambil daftar seluruh spot yang sedang ditempati atau sedang dituju oleh agen lain (`taken`).
2. Agen hanya memilih spot dari kumpulan `SPOT_IDS` yang belum terdaftar di `taken`.
3. Jika seluruh spot penuh (misal 5 aktor idle memperebutkan 10 spot), hanya spot kosong yang tersisa yang dapat dipilih (`pickOne(options)`).

---

## 5. Algoritma Navigasi Spasial (*Corridor & Spoke Routing*)

Kantor Agent tidak menggunakan sistem *NavMesh* atau algoritma *A\** dinamis yang boros komputasi CPU browser. Sebaliknya, digunakan pendekatan **Spoke & Corridor Hierarchy** (`kantor.js:1204-1212`):

```
                       Area Meja Kerja (Z = -0.95 / +0.95)
                              ▲            ▲
                              │ Spoke      │ Spoke
                              ▼            ▼
======================== KORIDOR UTAMA (Z = -2.10) ========================
                              ▲            ▲            ▲
                              │ Spoke      │ Spoke      │ Spoke
                              ▼            ▼            ▼
                   Area Santai Pantry   Area TV/PS   Pintu Keluar
```

### Aturan Perjalanan Spasial:
1. Terdapat koridor utama bebas hambatan pada sumbu $Z = -2.10$ (`CORRIDOR_Z`).
2. Setiap titik (meja, spot santai, pintu) memiliki larik koordinat *spoke* unik yang menghubungkan titik akhir ke koridor.
3. Rute perpindahan dari Spot $A$ ke Spot $B$:
   $$\text{Rute} = \text{Mundur lewat Spoke } A \longrightarrow \text{Menyusuri Koridor Utama } Z \longrightarrow \text{Maju lewat Spoke } B$$
4. **Keuntungan Teknis**:
   - Dijamin 100% bebas tabrakan (*collision-free*) dengan perabot kantor (meja, sofa, partisi, dispenser).
   - Kompleksitas waktu komputasi $O(1)$.
   - Jika pengguna mengaktifkan mode aksesibilitas `prefers-reduced-motion` (`REDUCED = true`), animasi berjalan dilewati dan agen langsung dipindahkan secara instan via `placeAt(a, spotId)`.

---

## 6. Mesin Animasi Pose Tubuh & Properti Interaktif 3D

Saat berada di spot santai, fungsi `spotPose(a, spot, t)` (`kantor.js:1432-1473`) mengatur sudut rotasi sendi (*bone rotations*) tubuh agen secara prosedural berbasis waktu $t$:

### 6.1 Rincian Pose Unik Berdasarkan Spot

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       POSE DAN GESTURE DI SPOT IDLE                         │
├────────────┬────────────────────────────────────────────────────────────────┤
│ TV         │ Posisi duduk santai di sofa (hipsY = 0.64). Mengalami siklus   │
│            │ tertawa berkala: Math.sin(t * 0.7 + seed) > 0.93 memicu kepala │
│            │ mendongak dan punggung bergoyang ke belakang.                  │
├────────────┼────────────────────────────────────────────────────────────────┤
│ PS         │ Posisi duduk condong ke depan (spineX = 0.14). Menggenggam     │
│ (Game)     │ kontroler gamepad 3D. Jari dan lengan berosilasi cepat         │
│            │ (frekuensi 9 Hz & 11 Hz) menyimulasikan memencet tombol stick. │
├────────────┼────────────────────────────────────────────────────────────────┤
│ Kopi &     │ 2.5 detik pertama: Pose membungkuk mengambil cangkir. Setelah  │
│ Air        │ itu properti cangkir muncul (a.holding = 'mug'). Setiap siklus │
│            │ 6 detik (st % 6 < 1.8), tangan kanan mengangkat cangkir ke     │
│            │ mulut dan kepala sedikit mendongak (menyeruput minuman).       │
├────────────┼────────────────────────────────────────────────────────────────┤
│ Gitar      │ Pose berdiri rileks memegang gitar akustik 3D (guitarMesh).    │
│            │ Kepala mengangguk mengikuti irama (t * 4), tangan kanan        │
│            │ melakukan gerakan genjrengan senar cepat (t * 12).             │
├────────────┼────────────────────────────────────────────────────────────────┤
│ Jendela    │ Pose berdiri menghadap kaca gedung. Mengalami siklus peregangan│
│            │ tubuh (stretching) setiap 9 detik: kedua lengan diangkat tinggi│
│            │ ke atas kepala (lShZ: -2.8, rShZ: 2.8) selama 2.5 detik.       │
├────────────┼────────────────────────────────────────────────────────────────┤
│ Meja Rapat │ Posisi duduk tegak di kursi rapat. Kepala sesekali menoleh     │
│ (Meet 1-3) │ kiri-kanan dan mengangguk halus menyimulasikan diskusi santai. │
├────────────┼────────────────────────────────────────────────────────────────┤
│ Rak Buku   │ Pose berdiri membaca. Menggenggam buku biru 3D terbuka, kepala │
│            │ tertunduk menghadap buku dengan osilasi baca halus.             │
└────────────┴────────────────────────────────────────────────────────────────┘
```

### 6.2 Properti 3D yang Muncul Otomatis (*Dynamic Props*)
Properti ditambahkan pada simpul tulang karakter (`p.spine` atau `p.hand[1]`) dan diaktifkan visibilitasnya sesuai spot (`kantor.js:2191-2194`):
- `a.guitar.visible = (spot === 'guitar')`: Menampilkan gitar akustik.
- `a.pad.visible = (spot === 'ps')`: Menampilkan stik PlayStation hitam.
- `a.book.visible = (spot === 'bookshelf')`: Menampilkan buku biru.
- `a.mug.visible = (a.holding === 'mug')`: Menampilkan cangkir kopi/air minum sesuai warna khas agen.

### 6.3 Reaktivitas Lingkungan: TV Dinamis & Game Balap
Salah satu fitur teknis paling menarik di kantor-agent adalah layar TV:
- **Kondisi Normal (Tidak ada yang main PS)**: Layar TV memanggil `drawTv()`, merender antarmuka aplikasi streaming modern bernama `"TONTON"` dengan poster serial dokumenter `"Jejak Rempah"`.
- **Kondisi Ada Agen Main PS (`spot:ps`)**: Layar TV mendeteksi kehadiran pemain (`kantor.js:2243-2253`). TV secara seketika beralih memanggil `drawGame(t, player.name)`.
  - Fungsi ini merender **mini game balap retro 3D dinamis 60 FPS** pada elemen HTML Canvas: jalan raya berperspektif melengkung, garis marka jalan bergerak cepat, pegunungan di kejauhan, mobil musuh berwarna merah, mobil pemain berwarna biru, serta panel HUD di pojok atas bertuliskan:
    $$\mathbf{P1 \cdot \{NamaAgen\}}$$
- Stik PS di atas meja lounge otomatis disembunyikan saat ada agen yang memainkannya (`LOUNGE_PADS[1].visible = !player`).

---

## 7. Sistem Komunikasi Sosial Saat Idle (Dialogue & Quips)

Saat idle, agen mengeksekusi dua subsistem komunikasi: celetukan mandiri (*quips*) dan obrolan dua arah (*two-way chatter*).

### 7.1 Celetukan Mandiri Tiba di Spot (`QUIPS`)
Dipicu saat karakter menyelesaikan perjalanan dan tiba di spot santai (`arrive(a)` pada `kantor.js:1419-1421`):
- **Peluang Muncul**: $55\%$ (`Math.random() < 0.55`).
- **Durasi Balon**: $4200\text{ ms}$.
- **Total Teks**: **37 variasi celetukan** (36 variasi spesifik lokasi + 1 fallback `"Santai dulu"`).

#### Daftar Lengkap 37 Celetukan Spot:
1. **Sofa TV (`tv`)**:
   - *"Filmnya lagi seru nih 🍿"*
   - *"Eh, aktornya siapa ya?"*
   - *"Jangan di-skip dulu!"*
   - *"Episode ini bagus banget"*
2. **Sofa Game PS (`ps`)**:
   - *"Gooool! ⚽"*
   - *"Satu match lagi ah 🎮"*
   - *"Stiknya agak nge-drift nih"*
   - *"Tunggu, aku belum siap!"*
3. **Pantry Kopi (`coffee`)**:
   - *"Ngopi dulu biar melek ☕"*
   - *"Espresso double, please"*
   - *"Wangi banget kopinya"*
   - *"Gulanya di mana ya?"*
4. **Dispenser Air (`water`)**:
   - *"Minum air putih dulu 💧"*
   - *"Galonnya tinggal dikit"*
   - *"Seger!"*
   - *"Airnya dingin, mantap"*
5. **Gitar Akustik (`guitar`)**:
   - *"🎸 jreng… jreng…"*
   - *"Request lagu dong"*
   - *"Kuncinya G atau C ya?"*
   - *"Senarnya perlu diganti"*
6. **Jendela Kantor (`window`)**:
   - *"Langitnya cerah ya ☀️"*
   - *"Peregangan dulu, pegal 🙆"*
   - *"Macet banget di bawah"*
   - *"Ada layangan tuh!"*
7. **Kursi Rapat 1 (`meet1`)**:
   - *"Rapat lima menit, janji!"*
   - *"Siapa yang pesan kopi?"*
   - *"Kursinya empuk juga"*
8. **Kursi Rapat 2 (`meet2`)**:
   - *"Diskusi ringan dulu ☕"*
   - *"Laptopnya siapa ini?"*
   - *"Duduk dulu ah"*
9. **Kursi Rapat 3 (`meet3`)**:
   - *"Meja ini paling adem"*
   - *"Ngobrol santai dulu"*
   - *"Kita bahas nanti aja"*
10. **Rak Buku (`bookshelf`)**:
    - *"Buku ini seru juga 📚"*
    - *"Wah, ada komik!"*
    - *"Bukunya belum dikembalikan nih"*
11. **Fallback (Spot tak dikenal)**:
    - *"Santai dulu"*

---

### 7.2 Percakapan Dua Arah Antar-Agen di Lounge (`CHAT`)

Sistem obrolan dua arah dijalankan secara periodik dalam fungsi `chatter(now)` (`kantor.js:1509-1520`):

#### Mekanisme Pemicu & Pemilihan Lawan Bicara:
1. **Interval Eksekusi**: Terjadi setiap $7000\text{ ms} + \text{random}(4500\text{ ms})$ (antara $7.0$ sampai $11.5$ detik sekali).
2. **Syarat Kelayakan Partisipan**:
   - Agen tidak sedang bekerja (`!a.work`).
   - Agen tidak sedang berjalan (`!a.walking`).
   - Agen berada di salah satu spot lounge (`a.goal.startsWith('spot:')`).
   - Balon obrolan sebelumnya sudah hilang (`now > a.bubble.until`).
   - Minimal ada **2 agen** yang memenuhi syarat di area lounge (`avail.length >= 2`).
3. **Pemilihan Pembicara Pertama (`sp`)**: Dipilih secara acak dari agen yang memenuhi syarat.
4. **Algoritma Pemilihan Lawan Bicara (`ls`)**:
   - Menghitung jarak Euclidean 3D dari semua kandidat ke pembicara `sp`:
     $$d = \|\mathbf{P}_{\text{kandidat}} - \mathbf{P}_{\text{sp}}\|$$
   - Dengan probabilitas **70%**, sistem memilih agen yang berada paling dekat secara fisik.
   - Dengan probabilitas **30%**, sistem memilih agen secara acak dari kandidat lain.
5. **Placeholder Nama**: Karakter `{to}` pada kalimat pertanyaan digantikan otomatis dengan nama lawan bicara (`ls.name`).
6. **Pewaktuan & Keamanan Interupsi**:
   - Balon pertanyaan (`sp`) tayang selama $4800\text{ ms}$.
   - Setelah jeda $2300\text{ ms}$, balon jawaban (`ls`) tayang selama $4200\text{ ms}$.
   - **Safety Check**: Sebelum jawaban dimunculkan, sistem memeriksa kembali:
     `if (!ls.work && ls.goal?.startsWith('spot:'))`
     Jika selama jeda 2.3 detik lawan bicara tiba-tiba mendapat tugas subagent baru, balasan obrolan langsung dibatalkan secara senyap agar tidak merusak alur kerja nyata.

#### Matriks 40 Pasang Percakapan Santai Perkantoran:

| No | Kalimat Pertanyaan (Pembicara A: `sp`) | Kalimat Jawaban (Pembicara B: `ls`) |
|:---:|:---|:---|
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

## 8. Tampilan Layar Monitor & UI Saat Kondisi Idle

Saat agen meninggalkan meja kerjanya menuju area lounge, layar monitor meja kerja ikut menyesuaikan statusnya (`updateDeskScreens` di `kantor.js:1635-1670`):

```
┌─────────────────────────────────────────────────────────────┐
│                      TAMPILAN MONITOR IDLE                  │
├─────────────────┬───────────────────────────────────────────┤
│ Monitor Utama   │ Gradien warna sesuai aksen agen.          │
│ (d.main.scr)    │ Jam digital berukuran besar (110px).      │
│                 │ Baris judul: "{Nama Agen} · Santai".      │
│                 │ Subtitel: "menunggu tugas" atau info      │
│                 │ ringkasan job sebelumnya ("terakhir: ...")│
├─────────────────┼───────────────────────────────────────────┤
│ Monitor Samping │ Berubah menjadi gelap / redup (dimmed).   │
│ (d.side.scr)    │ Teks status: "Layar terkunci".            │
├─────────────────┼───────────────────────────────────────────┤
│ Meja Cadangan   │ Monitor Utama: "Meja cadangan N · untuk   │
│ (Freelancer B)  │ freelancer". Monitor Samping: "Kosong".   │
└─────────────────┴───────────────────────────────────────────┘
```

### Banner & Subtitel Header Kantor (`kantor.js:1973-1986`)
Ketika kondisi kantor sedang santai, header web menampilkan teks deskriptif:
- **Semua Agen Santai**:  
  `"Semua santai ☕ — nonton, ngopi & ngobrol. Otomatis kembali kerja saat ada subagent."`
- **Ketua Sedang Bekerja Sendirian di Sesi Utama**:  
  `"{Ketua} sedang bekerja di sesi utama — tim santai menunggu tugas"`
- **Ketua Baru Menyelesaikan Perintah**:  
  `"{Ketua} baru selesai — menunggu instruksi berikutnya"`
- **Proyek Belum Pernah Menjalankan Claude Code**:  
  `"Belum ada transkrip Claude Code untuk folder ini — kantor terisi otomatis setelah Claude Code dipakai di sini."`

---

## 9. Pembelajaran Teknis & Rekomendasi untuk Tim Pengembang

Berdasarkan audit teknis terhadap kode sumber `kantor-agent`, berikut rekomendasi dan pola desain yang sangat berharga untuk diadopsi pada platform agentic internal kita (`personal-agentic` / cockpit):

1. **Pemisahan Tegas Antara Mesin Keadaan (State Machine) dan Presentasi Tampilan Visual**:
   - Backend hanya menghasilkan status murni (`state: 'santai' | 'bekerja' | 'selesai'`, cooldown, riwayat aksi).
   - Frontend mengelola animasi, koordinat rute spoke, durasi stay di lounge, serta gelembung dialog.
   - Desain ini membuat backend sangat mudah diuji tanpa bergantung pada library grafis (*headless verification*).
2. **Navigasi Spoke & Koridor untuk Lingkungan Isometrik**:
   - Penggunaan satu garis koridor utama ($Z = -2.10$) yang disambungkan dengan percabangan *spoke* ke masing-masing titik adalah pola yang sangat brilian. Ini menghilangkan kebutuhan kalkulasi *NavMesh/A\** yang berat di sisi browser client, menjaga FPS tetap stabil di angka 60.
3. **Pembersihan Memori (Garbage Collection) Karakter Dinamis**:
   - Pola pembersihan freelancer (`removeActor` yang memanggil `dispose()` pada geometri dan material Three.js) sangat penting agar browser tidak mengalami *memory leak* ketika sesi berjalan berjam-jam dan banyak subagent freelancer keluar-masuk.
4. **Kebijakan Privasi Penuh pada Percakapan Ambient**:
   - Menggunakan daftar teks percakapan statis lokal untuk obrolan santai adalah pendekatan terbaik. Agen tetap terlihat hidup dan interaktif tanpa ada risiko teks prompt pengguna atau kode rahasia proyek terpapar pada visualisasi ambient.
5. **Dukungan Aksesibilitas (`prefers-reduced-motion`)**:
   - `kantor.js` menghormati preferensi pengguna dengan menonaktifkan animasi berjalan dan obrolan dua arah, serta langsung memposisikan karakter di tujuan. Ini adalah standar kualitas produk enterprise yang wajib dicontoh.

---

*Laporan audit ini diekstraksi dan diverifikasi secara langsung dari repositori resmi `humaedihume/kantor-agent` (file `kantor.js`, `office.mjs`, `transcripts.mjs`, `defaults.json`, dan `README.md`).*
