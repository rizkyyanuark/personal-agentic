export const CHAT = Object.freeze([
  ['{to}, main bola di PS yuk! Yang kalah traktir bakso', 'Ogah, kemarin aku kalah 3–0 😅'],
  ['Filmnya jangan di-spoiler ya, {to}!', 'Siap, mulutku terkunci 🤐'],
  ['Kopinya kok pahit banget?', 'Itu espresso, bukan kopi sachet 😂'],
  ['Galon siapa yang ngabisin?', 'Bukan aku, sumpah!'],
  ['Gitarnya fals dikit tuh, {to}', 'Namanya juga gitar kantor'],
  ['Besok hujan nggak ya?', 'Bawa payung aja biar aman ☔'],
  ['Ada gorengan nggak di pantry?', 'Tadi ada, udah habis 🙃'],
  ['Ngantuk banget habis makan siang', 'Sama, butuh kopi kedua'],
  ['Kucingku tadi pagi nyolong ikan', 'Wkwk pasti kucing oranye'],
  ['{to}, weekend mau ke mana?', 'Rebahan aja, paling mewah 😴'],
  ['Lagu apa ini? Enak juga', 'Lagu lama, tapi masih enak'],
  ['{to}, itu gelas kopi ketiga ya?', 'Biar fokus nanti 😆'],
  ['Kemarin nemu warung mi ayam enak', 'Wah, bagi lokasinya dong!'],
  ['{to}, kamu tim bubur diaduk?', 'Nggak diaduk dong, garis keras'],
  ['AC-nya dingin banget ya', 'Pakai jaket, jangan kalah sama AC'],
  ['{to}, headset-mu mana?', 'Lagi di-charge 🔋'],
  ['Martabak manis atau telur?', 'Dua-duanya, biar adil'],
  ['{to}, tanamannya udah disiram?', 'Udah, tadi pagi 🌱'],
  ['Kok tiba-tiba pengin nasi padang', 'Rendangnya jangan lupa!'],
  ['Siapa yang naruh kaus kaki di sofa?', 'Bukan punyaku… kayaknya 😬'],
  ['{to}, tadi berangkat naik apa?', 'Ojek, lancar jaya'],
  ['Hari ini kok cepat banget ya', 'Iya, tahu-tahu sore'],
  ['Pengin liburan ke pantai', 'Ajak-ajak dong!'],
  ['{to}, suka pedas nggak?', 'Level lima pun aman 🌶️'],
  ['Kursi ini bunyi kalau diduduki', 'Sudah dari dulu, jadi ciri khas'],
  ['Siapa yang pinjam spidol biru?', 'Ada di papan, tuh'],
  ['{to}, sudah sarapan?', 'Sudah, roti bakar 🍞'],
  ['Es teh atau es jeruk?', 'Es teh manis, selalu'],
  ['Jam dinding itu telat nggak sih?', 'Tepat kok, kitanya yang telat'],
  ['{to}, tim kucing atau tim anjing?', 'Tim kucing, jelas 🐈'],
  ['Kemarin nonton bola?', 'Ketiduran di babak pertama'],
  ['Hujan-hujan enaknya makan bakso', 'Setuju, kuahnya panas'],
  ['{to}, kaosmu baru ya?', 'Iya, diskon kemarin 😄'],
  ['Wah, bukunya ada yang baru', 'Siapa yang beli ya?'],
  ['Mau pesan kopi susu, ada yang nitip?', 'Aku! Gula dikit ya'],
  ['{to}, playlist-mu apa?', 'Campur aduk, dangdut sampai jazz'],
  ['Parkiran tadi penuh banget', 'Aku sampai muter dua kali'],
  ['Kayaknya perlu beli galon lagi', 'Nanti aku telepon depot'],
  ['{to}, jangan lupa minum air', 'Siap, bos air 💧'],
  ['Sore ini cerah ya', 'Enak buat jalan-jalan']
]);

export const DIALOGUE_BY_ZONE = Object.freeze({
  lounge: [
    ['{to}, tikungan berikutnya tajam tuh!', 'Rem dulu, jangan ikut belok di sofa.'],
    ['Mobil merahnya hampir keluar jalur.', 'Masih aman, cuma nyenggol garis sedikit.'],
    ['{to}, bisa lewat tikungan itu?', 'Kalau duduk di sofa, boleh ikut miring.'],
    ['Sofanya nyaman, susah bangun dari sini.', 'Apalagi balapannya belum selesai.'],
    ['Tunggu, jangan pindah dulu. Lagi salip!', 'Iya, aku juga mau lihat tikungan ini.']
  ],
  pantry: [
    ['Kopinya kok pahit banget?', 'Itu espresso, bukan kopi sachet 😂'],
    ['{to}, mugmu yang mana?', 'Yang warnanya cocok dengan mejaku.'],
    ['Aroma kopinya sampai ke sofa ya.', 'Pantas dari tadi pengin ngopi.'],
    ['Kopi hangat atau dingin, {to}?', 'Hangat dulu. Aku mau duduk sebentar.'],
    ['Tuang sedikit dulu, mugku kecil.', 'Pelan-pelan ya, masih panas.']
  ],
  bookshelf: [
    ['Wah, sampul buku ini menarik.', 'Coba buka halaman pertamanya.'],
    ['{to}, bukunya boleh dipinjam?', 'Boleh, asal pembatasnya jangan hilang.'],
    ['Aku baru lihat rak bagian ini.', 'Ada sampul menarik di sebelahnya.'],
    ['Pembatas bukunya nyaris ikut jatuh.', 'Simpan di sela halaman saja.'],
    ['Baca di sini atau bawa ke sofa?', 'Di sini dulu, cahayanya pas.']
  ],
  meeting: [
    ['{to}, duduk di sisi sini nyaman.', 'Iya, ruangnya lebih lega dari sini.'],
    ['Siapa yang mau kopi?', 'Aku ikut ke pantry setelah duduk sebentar.'],
    ['Kursinya empuk juga ya.', 'Jangan sampai ketiduran di sini.'],
    ['Tanamannya kelihatan bagus dari sini.', 'Iya, meja ini dapat sudut yang enak.'],
    ['Duduk sebentar sebelum ke lounge?', 'Boleh. Nanti lihat balapannya dari sofa.']
  ],
  workstations: [
    ['{to}, warna mugmu cocok sama layar.', 'Biar gampang dikenali dari jauh.'],
    ['Dari sini jendelanya kelihatan jelas.', 'Iya, ruangannya jadi terasa lega.'],
    ['Aku duduk sebentar di sini dulu.', 'Nanti aku tunggu di lounge.']
  ],
  board: [
    ['Spidolnya tersusun rapi ya.', 'Bingkai papannya juga sederhana.'],
    ['Dari sini hampir semua sudut kelihatan.', 'Enak buat melihat suasana ruangan.']
  ]
});

export const SPOT_BY_DESTINATION = Object.freeze({
  'sofa:left': 'tv',
  'sofa:right': 'ps',
  'coffee:left': 'coffee',
  'coffee:right': 'coffee',
  'pantry:water': 'water',
  'reading:left': 'bookshelf',
  'reading:right': 'bookshelf',
  'meeting:0': 'meet1',
  'meeting:1': 'meet2',
  'meeting:2': 'meet3',
  'standing:hq': 'board',
  guitar: 'guitar',
  window: 'window'
});

export const QUIPS_BY_SPOT = Object.freeze({
  tv: Object.freeze([
    'Filmnya lagi seru nih 🍿',
    'Eh, aktornya siapa ya?',
    'Jangan di-skip dulu!',
    'Episode ini bagus banget'
  ]),
  ps: Object.freeze([
    'Gooool! ⚽',
    'Satu match lagi ah 🎮',
    'Stiknya agak nge-drift nih',
    'Tunggu, aku belum siap!'
  ]),
  coffee: Object.freeze([
    'Ngopi dulu biar melek ☕',
    'Espresso double, please',
    'Wangi banget kopinya',
    'Gulanya di mana ya?'
  ]),
  water: Object.freeze([
    'Minum air putih dulu 💧',
    'Galonnya tinggal dikit',
    'Seger!',
    'Airnya dingin, mantap'
  ]),
  guitar: Object.freeze([
    '🎸 jreng… jreng…',
    'Request lagu dong',
    'Kuncinya G atau C ya?',
    'Senarnya perlu diganti'
  ]),
  window: Object.freeze([
    'Langitnya cerah ya ☀️',
    'Peregangan dulu, pegal 🙆',
    'Macet banget di bawah',
    'Ada layangan tuh!'
  ]),
  meet1: Object.freeze([
    'Rapat lima menit, janji!',
    'Siapa yang pesan kopi?',
    'Kursinya empuk juga'
  ]),
  meet2: Object.freeze(['Diskusi ringan dulu ☕', 'Laptopnya siapa ini?', 'Duduk dulu ah']),
  meet3: Object.freeze(['Meja ini paling adem', 'Ngobrol santai dulu', 'Kita bahas nanti aja']),
  bookshelf: Object.freeze([
    'Buku ini seru juga 📚',
    'Wah, ada komik!',
    'Bukunya belum dikembalikan nih'
  ])
});

export const QUIP_FALLBACK = Object.freeze(['Santai dulu']);

export const QUIPS_BY_KIND = Object.freeze({
  sofa: [...QUIPS_BY_SPOT.tv, ...QUIPS_BY_SPOT.ps],
  coffee: [...QUIPS_BY_SPOT.coffee],
  water: [...QUIPS_BY_SPOT.water],
  reading: [...QUIPS_BY_SPOT.bookshelf],
  meeting: [...QUIPS_BY_SPOT.meet1, ...QUIPS_BY_SPOT.meet2, ...QUIPS_BY_SPOT.meet3],
  guitar: [...QUIPS_BY_SPOT.guitar],
  window: [...QUIPS_BY_SPOT.window],
  desk: QUIP_FALLBACK,
  board: ['Siapa yang pinjam spidol biru?', 'Ada di papan, tuh']
});

const STATIONARY_PHASES = new Set(['standing', 'seated']);
const SOLO_DESTINATIONS = new Set(['guitar', 'window']);
const FIRST_WAIT_SECONDS = 1.5;
const OPENER_SECONDS = 4.8;
const REPLY_DELAY_SECONDS = 2.3;
const REPLY_SECONDS = 4.2;
const COMMENT_SECONDS = 4.2;
const SPOT_REPEAT_INTERVAL = 14;

function seededRandom(value) {
  let seed = 2166136261;
  for (const character of value) seed = Math.imul(seed ^ character.charCodeAt(0), 16777619);
  return () => {
    seed += 0x6d2b79f5;
    let mixed = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

function positionOf(activity) {
  const position = activity?.position;
  return Array.isArray(position) && position.length === 3 && position.every(Number.isFinite)
    ? position
    : null;
}

function arrivalIdOf(activity) {
  return Number.isSafeInteger(activity?.arrivalId) && activity.arrivalId >= 0
    ? activity.arrivalId
    : null;
}

function eligibleAgent(snapshot, activities, roleKey) {
  const facts = snapshot?.agents?.[roleKey]?.operational;
  const activity = activities?.[roleKey];
  if (
    !facts?.available ||
    facts.state !== 'siaga' ||
    !STATIONARY_PHASES.has(activity?.phase) ||
    !positionOf(activity)
  ) {
    return null;
  }
  return {
    roleKey,
    kind: activity.kind,
    zone: activity.zone || 'lounge',
    destinationId: activity.destinationId,
    position: activity.position,
    signature: JSON.stringify([
      facts.state,
      facts.task,
      activity.kind,
      activity.destinationId,
      activity.phase,
      arrivalIdOf(activity)
    ])
  };
}

function distance(first, second) {
  return Math.hypot(first.position[0] - second.position[0], first.position[2] - second.position[2]);
}

function compatiblePair(first, second) {
  return Boolean(first && second && first.roleKey !== second.roleKey);
}

export function createAmbientDialogue(roles, { random: customRandom = null } = {}) {
  const suppliedRoles = Array.isArray(roles) ? roles : [];
  const roleKeys = [
    ...new Set(
      suppliedRoles
        .map((role) => role?.key)
        .filter((key) => typeof key === 'string' && key.length > 0)
    )
  ];
  const names = new Map(
    suppliedRoles.map((role) => [
      role?.key,
      typeof role?.name === 'string'
        ? role.name
            .replace(/[\p{Cc}\s]+/gu, ' ')
            .trim()
            .slice(0, 32)
        : ''
    ])
  );
  const random =
    typeof customRandom === 'function'
      ? customRandom
      : seededRandom(`cockpit-dialogue:${roleKeys.join(':')}`);
  const previousScript = new Map();
  const seenArrivals = new Map();
  const lastSpotQuipAt = new Map();
  const comments = new Map();
  let clock = 0;
  let nextAt = FIRST_WAIT_SECONDS;
  let enabled = false;
  let disposed = false;
  let conversation = null;
  let sequence = 0;

  function clear() {
    conversation = null;
    comments.clear();
    seenArrivals.clear();
    lastSpotQuipAt.clear();
    nextAt = clock + FIRST_WAIT_SECONDS;
    enabled = false;
  }

  function captureArrivals(activities) {
    for (const roleKey of roleKeys) {
      const arrivalId = arrivalIdOf(activities?.[roleKey]);
      if (arrivalId !== null) seenArrivals.set(roleKey, arrivalId);
    }
  }

  function pickScript() {
    const poolKey = 'chat';
    const previous = previousScript.get(poolKey);
    let index = Math.floor(random() * CHAT.length);
    if (index === previous) index = (index + 1) % CHAT.length;
    previousScript.set(poolKey, index);
    return CHAT[index];
  }

  function begin(snapshot, activities) {
    const available = roleKeys
      .filter((roleKey) => !comments.has(roleKey))
      .map((roleKey) => eligibleAgent(snapshot, activities, roleKey))
      .filter(Boolean)
      .filter((agent) => !SOLO_DESTINATIONS.has(agent.destinationId));
    const speakers = available.filter((speaker) =>
      available.some((peer) => peer !== speaker && compatiblePair(speaker, peer))
    );
    if (!speakers.length) return;
    const speaker = speakers[Math.floor(random() * speakers.length)];
    const nearby = available
      .filter((peer) => peer !== speaker && compatiblePair(speaker, peer))
      .sort((first, second) => distance(speaker, first) - distance(speaker, second));
    if (!nearby.length) return;
    const alternatives = nearby.slice(1);
    const peer =
      random() < 0.7 || !alternatives.length
        ? nearby[0]
        : alternatives[Math.floor(random() * alternatives.length)];
    const script = pickScript();
    conversation = {
      id: `ambient-${++sequence}`,
      zone: speaker.zone,
      startedAt: clock,
      participants: [speaker, peer],
      script: [
        script[0].replaceAll('{to}', names.get(peer.roleKey) || 'kamu'),
        script[1].replaceAll('{to}', names.get(speaker.roleKey) || 'kamu')
      ]
    };
  }

  function updateComments(snapshot, activities) {
    for (const [roleKey, comment] of comments) {
      const current = eligibleAgent(snapshot, activities, roleKey);
      if (
        clock - comment.startedAt >= COMMENT_SECONDS ||
        current?.signature !== comment.participant.signature
      ) {
        comments.delete(roleKey);
      }
    }
  }

  function receiveArrivals(snapshot, activities) {
    for (const roleKey of roleKeys) {
      const arrivalId = arrivalIdOf(activities?.[roleKey]);
      if (arrivalId === null) continue;
      const previous = seenArrivals.get(roleKey);
      seenArrivals.set(roleKey, arrivalId);
      const isNewArrival = previous !== undefined && arrivalId > previous;
      const destinationId = activities?.[roleKey]?.destinationId;
      const spot = SPOT_BY_DESTINATION[destinationId] || activities?.[roleKey]?.kind;
      const hasSpotQuips = Boolean(QUIPS_BY_SPOT[spot]);

      if (comments.has(roleKey)) continue;

      let shouldQuip = false;
      if (isNewArrival) {
        if (random() < 0.55) {
          shouldQuip = true;
        }
      } else if (
        hasSpotQuips &&
        clock - (lastSpotQuipAt.get(roleKey) ?? 0) >= SPOT_REPEAT_INTERVAL &&
        !conversation?.participants.some((p) => p.roleKey === roleKey)
      ) {
        shouldQuip = true;
      }

      if (!shouldQuip) continue;
      const participant = eligibleAgent(snapshot, activities, roleKey);
      if (!participant) continue;
      if (conversation?.participants.some((p) => p.roleKey === roleKey)) {
        conversation = null;
      }
      const lines = QUIPS_BY_SPOT[spot] || QUIPS_BY_KIND[participant.kind] || QUIP_FALLBACK;
      lastSpotQuipAt.set(roleKey, clock);
      comments.set(roleKey, {
        id: `ambient-comment-${++sequence}`,
        participant,
        zone: participant.zone,
        startedAt: clock,
        text: lines[Math.floor(random() * lines.length)]
      });
    }
  }

  function getDetails() {
    if (conversation) {
      const replied = clock - conversation.startedAt >= REPLY_DELAY_SECONDS;
      const lines = [
        { roleKey: conversation.participants[0].roleKey, text: conversation.script[0] }
      ];
      if (replied) {
        lines.push({ roleKey: conversation.participants[1].roleKey, text: conversation.script[1] });
      }
      return {
        id: conversation.id,
        zone: conversation.zone,
        label: 'Suasana ilustratif',
        participants: conversation.participants.map(({ roleKey }) => roleKey),
        lines,
        activeRoleKey: conversation.participants[replied ? 1 : 0].roleKey
      };
    }
    const comment = [...comments.values()].sort(
      (first, second) => second.startedAt - first.startedAt
    )[0];
    if (!comment) return null;
    return {
      id: comment.id,
      zone: comment.zone,
      label: 'Suasana ilustratif',
      participants: [comment.participant.roleKey],
      lines: [{ roleKey: comment.participant.roleKey, text: comment.text }],
      activeRoleKey: comment.participant.roleKey
    };
  }

  function activeCandidates() {
    const candidates = [];
    if (conversation) {
      const age = clock - conversation.startedAt;
      if (age >= REPLY_DELAY_SECONDS && age < REPLY_DELAY_SECONDS + REPLY_SECONDS) {
        candidates.push({
          id: `${conversation.id}:1`,
          conversationId: conversation.id,
          roleKey: conversation.participants[1].roleKey,
          kind: 'dialogue',
          turn: 'reply',
          text: conversation.script[1]
        });
      }
      if (age < OPENER_SECONDS) {
        candidates.push({
          id: `${conversation.id}:0`,
          conversationId: conversation.id,
          roleKey: conversation.participants[0].roleKey,
          kind: 'dialogue',
          turn: 'opener',
          text: conversation.script[0]
        });
      }
    }
    for (const comment of comments.values()) {
      candidates.push({
        id: comment.id,
        conversationId: comment.id,
        roleKey: comment.participant.roleKey,
        kind: 'dialogue',
        turn: 'comment',
        text: comment.text
      });
    }
    return candidates;
  }

  return {
    update(deltaSeconds, snapshot, activities) {
      if (disposed) return [];
      const permitted =
        snapshot?.gates?.allowAmbient === true &&
        snapshot.gates.dataFresh === true &&
        snapshot.gates.visible === true &&
        snapshot.gates.reducedMotion === false;
      if (!permitted) {
        clear();
        return [];
      }
      clock += Number.isFinite(deltaSeconds) ? Math.max(0, deltaSeconds) : 0;
      if (!enabled) {
        enabled = true;
        nextAt = clock + FIRST_WAIT_SECONDS;
        captureArrivals(activities);
      } else {
        updateComments(snapshot, activities);
        if (conversation) {
          const current = conversation.participants.map(({ roleKey }) =>
            eligibleAgent(snapshot, activities, roleKey)
          );
          if (
            clock - conversation.startedAt >= REPLY_DELAY_SECONDS + REPLY_SECONDS ||
            !compatiblePair(current[0], current[1]) ||
            current.some(
              (participant, index) =>
                participant.signature !== conversation.participants[index].signature
            )
          ) {
            conversation = null;
          }
        }
        receiveArrivals(snapshot, activities);
      }
      if (!conversation && clock >= nextAt) {
        nextAt = clock + 7 + random() * 4.5;
        begin(snapshot, activities);
      }
      return activeCandidates();
    },
    getDetails,
    clear,
    dispose() {
      clear();
      disposed = true;
      previousScript.clear();
    }
  };
}
