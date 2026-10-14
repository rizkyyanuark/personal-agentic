# Verification: CAT-001 — Runtime-Aware Model Catalog & Multi-Harness

Status: Not run.  
Proposal: [proposal.md](proposal.md) | Tasks: [tasks.md](tasks.md).

---

## Matriks Skenario Penerimaan

### Skenario V1-1: Dashboard Bersih Tanpa Banner Error
**Requirement**: REQ-CAT-001-1  
**GIVEN** Controller lokal tidak memiliki cache model Codex.  
**WHEN** Pengguna membuka dashboard platform.  
**THEN** Dashboard tampil bersih tanpa banner merah `models_cache.json`.

| Pemeriksaan | Metode | Status |
|---|---|---|
| Dashboard dimuat | Buka Web UI browser | Not run |
| Tidak ada banner merah | Inspeksi tampilan UI | Not run |

---

### Skenario V1-2: Katalog Model Berfungsi pada Runtime SSH/Remote
**Requirement**: REQ-CAT-001-1  
**GIVEN** Workstation dikonfigurasi ke host SSH EC2.  
**WHEN** Daftar model dimuat.  
**THEN** Model yang didukung oleh runtime SSH ditampilkan dengan benar.

| Pemeriksaan | Metode | Status |
|---|---|---|
| Model list tampil | Verifikasi di dialog pembuatan agen | Not run |

---

## Log dan Bukti Nyata

Bukti pelaksanaan pengujian disimpan di `docs/evidence/` atau dilampirkan pada catatan MR terkait.
