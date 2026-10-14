# Tasks: AGT-001 — Sub-Agent Concurrency & Process Ownership Audit

Proposal: [proposal.md](proposal.md) | Verifikasi: [verification.md](verification.md).

---

## Daftar Tugas

### T3-1: Audit Jalur Spawning dan Sinyal di `remote_bridge.py`
**Requirement**: REQ-AGT-001-1  
**Komponen**: `remote_bridge.py`, `runtime.rs`  
**Aktivitas**: Periksa implementasi pengiriman sinyal `os.killpg(pgid, signal.SIGTERM)` dan verifikasi grace period sebelum `SIGKILL`.  
**Bukti selesai**: Laporan alur sinyal terpetakan dengan status *Inspected*.

---

### T3-2: Uji Regresi Pembatalan Agen (Stop Simulation)
**Requirement**: REQ-AGT-001-1  
**Komponen**: Host Runtime EC2  
**Aktivitas**: Jalankan proses pengujian dengan child subprocess panjang, picu stop, lalu periksa apakah ada proses `<defunct>` atau zombie via `ps aux`.  
**Bukti selesai**: `ps aux | grep agy` menunjukkan 0 proses aktif dalam 10 detik setelah stop.

---

### T3-3: Verifikasi Paralelisme Main/Side Chat
**Requirement**: REQ-AGT-001-2  
**Komponen**: `runtime.rs`, `coordination.rs`  
**Aktivitas**: Pastikan antrean hanya menyerialkan sesi yang identik, dan tidak menghambat eksekusi sesi chat yang independen.  
**Bukti selesai**: Verifikasi log queueing backend menunjukkan pemisahan antrean yang benar.
