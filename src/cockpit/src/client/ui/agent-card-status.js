const STATUS = {
  bekerja: { label: 'Bekerja', description: 'Bekerja', color: '#176d42' },
  menunggu_persetujuan: { label: 'Menunggu', description: 'Menunggu keputusan', color: '#795300' },
  siaga: { label: 'Santai', description: 'Tidak ada tugas aktif', color: '#706b64' },
  gagal: { label: 'Gagal', description: 'Gagal', color: '#a6402d' },
  queued: { label: 'Antrean', description: 'Run menunggu giliran', color: '#706b64' },
  starting: { label: 'Memulai', description: 'Runtime memulai run', color: '#176d42' },
  awaiting_answer: { label: 'Jawaban', description: 'Menunggu jawaban pengguna', color: '#795300' },
  awaiting_delegates: {
    label: 'Delegasi',
    description: 'Menunggu hasil agent delegasi',
    color: '#795300'
  },
  unavailable: {
    label: 'Belum pasti',
    description: 'Status eksekusi belum dapat dipastikan',
    color: '#706b64'
  },
  unmapped: {
    label: 'Belum dipetakan',
    description: 'Slot belum dipetakan ke agent',
    color: '#706b64'
  },
  paused: { label: 'Dijeda', description: 'Agent sedang dijeda', color: '#706b64' },
  unattached: {
    label: 'Tanpa runtime',
    description: 'Agent belum memiliki runtime atau workdir',
    color: '#706b64'
  },
  offline_runtime: {
    label: 'Offline',
    description: 'Runtime agent tidak terhubung',
    color: '#a6402d'
  },
  checking: {
    label: 'Memeriksa',
    description: 'Koneksi runtime sedang diperiksa',
    color: '#706b64'
  },
  filtered: {
    label: 'Di luar tim',
    description: 'Agent berada di luar filter tim',
    color: '#706b64'
  }
};

export function getAgentCardStatus(state, connection) {
  if ((connection === 'live' || connection === 'empty') && Object.hasOwn(STATUS, state)) {
    return { state, ...STATUS[state] };
  }
  return {
    state: null,
    label: 'Status belum tersedia',
    description: 'Status belum tersedia',
    color: '#706b64'
  };
}
