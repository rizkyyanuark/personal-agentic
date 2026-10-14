# Proposal: OPS-001 — Host Hygiene & Resource Governance Terarah

Tanggal: 14 Oktober 2026 (Asia/Jakarta).  
ADR Rujukan: [0002-host-hygiene-and-resource-governance](../../../docs/decisions/0002-host-hygiene-and-resource-governance.md).  
Bukti Audit: [`docs/evidence/ev-004-architecture-proposal-review.md`](../../../docs/evidence/ev-004-architecture-proposal-review.md).

---

## 1. Identitas dan Kondisi Awal

- **Change ID**: `OPS-001-host-hygiene-and-resource-governance`
- **Tautan Arsitektur**: [architecture-plan.md](../../../docs/architecture-plan.md)
- **Komponen Terdampak**:
  - `scripts/docker-prune.sh`
  - `infra/production/compose.yaml`
  - `scripts/health-check.sh`

Kondisi host EC2 (`34.196.37.78`):
- RAM fisik 2GB, Swap 6GB, disk digunakan bersama oleh Docker platform, Matrix Synapse, dan GitLab Runner.
- Pemeriksaan kode menunjukkan bahwa limit memori kontainer platform **sudah ada** di `infra/production/compose.yaml` (0.5 CPU, 512MB RAM, 1GB RAM+swap per service).
- Dari total 10.8GB Docker image di host, sekitar 3.4GB merupakan resource yang tidak terpakai (reclaimable).
- Pembersihan Docker otomatis tidak boleh melakukan *unscoped prune* karena berisiko menghapus volume data persisten atau image versi sebelumnya yang masih dibutuhkan untuk proses rollback.

---

## 2. Masalah, Hasil, dan Scope

### Hasil Pengguna yang Ditargetkan
1. Pembersihan berkala hanya menargetkan builder-cache usang dan dangling/untagged images yang terbukti aman.
2. Volume database, volume workdir internal, dan riwayat obrolan Matrix **tetap terjaga** (tidak dihapus oleh cron otomatis).
3. Image rilis yang aktif (*current*), rilis sebelumnya (*previous*), atau yang berstatus *pending* terlindungi dari penghapusan.

### Scope
- Pembuatan script pembersihan aman `scripts/docker-prune.sh` dengan filter eksplisit (hanya menghapus build cache > 24 jam dan dangling images tanpa tag).
- Pengecualian mutlak terhadap volume dan riwayat chat Matrix Synapse (dikelola secara manual oleh operator).
- Pembuatan utility diagnostik `scripts/health-check.sh` untuk memeriksa kapasitas disk, swap, dan RAM host.

### Non-Goal
- Otomatisasi pembersihan riwayat chat Matrix Synapse (tetap manual sesuai arahan pemilik).
- Menghapus volume Docker secara otomatis.
- Mengubah spesifikasi hardware EC2.

---

## 3. Requirement dan Skenario Penerimaan

### REQ-OPS-001-1: Pembersihan Cache dan Dangling Image Aman
- **GIVEN** Cron script `docker-prune.sh` berjalan di host.
- **WHEN** Pembersihan dieksekusi.
- **THEN** Builder cache dan dangling images terhapus; volume dan image yang masih dirujuk kontainer/rollback tetap utuh.

### REQ-OPS-001-2: Diagnostik Kapasitas Terukur
- **GIVEN** Host beroperasi pada beban reguler.
- **WHEN** `health-check.sh` dijalankan.
- **THEN** Metrik kapasitas disk, penggunaan swap, dan alokasi memori kontainer tercetak jelas dengan status `OK` / `WARNING`.
