# Verification: OPS-001 — Host Hygiene & Resource Governance Terarah

Status: Not run.  
Proposal: [proposal.md](proposal.md) | Tasks: [tasks.md](tasks.md).

---

## Matriks Skenario Penerimaan

### Skenario V2-1: Pembersihan Cache Tidak Menyentuh Volume
**Requirement**: REQ-OPS-001-1  
**GIVEN** Script `docker-prune.sh` dijalankan.  
**WHEN** Pembersihan selesai.  
**THEN** Dangling images dibersihkan, tetapi daftar volume Docker (`docker volume ls`) tidak mengalami pengurangan volume database platform.

| Pemeriksaan | Metode | Status |
|---|---|---|
| Script prune exit code 0 | Jalankan via SSH di host | Not run |
| Volume data tetap utuh | `docker volume ls` | Not run |

---

### Skenario V2-2: Diagnostik Kapasitas Terlapor Jelas
**Requirement**: REQ-OPS-001-2  
**GIVEN** Host beroperasi.  
**WHEN** `health-check.sh` dieksekusi.  
**THEN** Metrik disk, swap, dan memory terformat rapi.

| Pemeriksaan | Metode | Status |
|---|---|---|
| Output health-check tampil | `bash scripts/health-check.sh` | Not run |

---

## Log dan Bukti Nyata

Bukti pelaksanaan pengujian disimpan di `docs/evidence/` atau dilampirkan pada catatan issue terkait.
