# Tasks: OPS-001 — Host Hygiene & Resource Governance Terarah

Proposal: [proposal.md](proposal.md) | Verifikasi: [verification.md](verification.md).

---

## Daftar Tugas

### T2-1: Buat Script Pembersihan Aman `scripts/docker-prune.sh`
**Requirement**: REQ-OPS-001-1  
**File**: `scripts/docker-prune.sh`  
**Perubahan**: Buat script yang hanya membersihkan build cache dan dangling images:
```bash
#!/bin/bash
set -e
echo "[$(date)] Memulai pembersihan cache Docker..."
docker builder prune -f --filter "until=24h"
docker image prune -f  # hanya menghapus untagged/dangling images
echo "[$(date)] Pembersihan selesai."
df -h /var/lib/docker
```
**Bukti selesai**: Eksekusi manual pertama sukses dengan exit code 0 dan tidak menyentuh volume data atau image bertag.

---

### T2-2: Buat Utility Diagnostik `scripts/health-check.sh`
**Requirement**: REQ-OPS-001-2  
**File**: `scripts/health-check.sh`  
**Perubahan**: Script pemantau kapasitas disk, swap, dan RAM host:
```bash
#!/bin/bash
echo "=== Host Resource Diagnostics ==="
df -h /
free -h
docker stats --no-stream --format "table {{.Name}}\t{{.MemUsage}}\t{{.CPUPerc}}"
```
**Bukti selesai**: Script dieksekusi di host dan menghasilkan laporan lengkap.
