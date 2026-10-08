const integer = (value) => (Number.isSafeInteger(value) && value >= 0 ? value : null);

export function projectTaskBoard(state) {
  if (state?.source === 'personal-agentic') {
    const fresh = state.connection === 'live';
    const counts = fresh ? state.office?.counts : null;
    return {
      connection: state.connection,
      connectionLabel: fresh ? 'Terhubung' : 'Status belum tersedia',
      updatedAt: fresh ? state.now : null,
      columns: [
        {
          key: 'planning',
          label: 'Rencana',
          value: counts ? integer(counts.backlog + counts.scheduled) : null,
          detail: 'Action backlog & terjadwal'
        },
        {
          key: 'running',
          label: 'Dikerjakan',
          value: integer(counts?.working),
          detail: 'Run bekerja'
        },
        {
          key: 'qa',
          label: 'Menunggu jawaban',
          value: integer(counts?.awaiting_answer),
          detail: 'Jawaban pengguna diperlukan'
        },
        {
          key: 'completed',
          label: 'Selesai',
          value: integer(counts?.completed),
          detail: 'Run succeeded'
        }
      ],
      attention: [
        { key: 'queued', label: 'Antrean run', value: integer(counts?.queued) },
        { key: 'starting', label: 'Memulai', value: integer(counts?.starting) },
        {
          key: 'awaiting_delegates',
          label: 'Menunggu delegasi',
          value: integer(counts?.awaiting_delegates)
        },
        { key: 'failed', label: 'Run gagal', value: integer(counts?.failed) }
      ]
    };
  }
  const fresh = state?.connection === 'live' || state?.connection === 'empty';
  const queue = fresh ? state.queue : null;
  const completed = fresh ? state.totals?.completed : null;
  const connections = {
    live: 'Terhubung',
    empty: 'Belum ada tugas',
    offline: 'Koneksi terputus',
    error: 'Status gagal dimuat'
  };
  return {
    connection: state?.connection || 'loading',
    connectionLabel: connections[state?.connection] || 'Menghubungkan',
    updatedAt: fresh && Number.isFinite(Date.parse(state?.now)) ? state.now : null,
    columns: [
      {
        key: 'planning',
        label: 'Rencana',
        value: null,
        detail: 'Belum tersedia'
      },
      {
        key: 'running',
        label: 'Dikerjakan',
        value: integer(queue?.running),
        detail: 'Lease aktif'
      },
      {
        key: 'qa',
        label: 'Uji QA',
        value: integer(queue?.waiting_approval),
        detail: 'Perlu keputusan'
      },
      {
        key: 'completed',
        label: 'Selesai',
        value: integer(completed),
        detail: 'Status succeeded'
      }
    ],
    attention: [
      { key: 'queued', label: 'Antrean', value: integer(queue?.queued) },
      {
        key: 'waiting_approval',
        label: 'Perlu keputusan',
        value: integer(queue?.waiting_approval)
      },
      { key: 'failed', label: 'Gagal', value: integer(queue?.failed) },
      { key: 'stale', label: 'Sesi kedaluwarsa', value: integer(queue?.stale) }
    ]
  };
}
