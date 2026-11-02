import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CHAT,
  QUIPS_BY_SPOT,
  createAmbientDialogue
} from '../../src/client/ui/ambient-dialogue.js';

function idlePair() {
  const roles = [
    { key: 'data_engineer', name: 'Nova' },
    { key: 'data_scientist', name: 'Atlas' }
  ];
  const snapshot = {
    gates: { allowAmbient: true, dataFresh: true, visible: true, reducedMotion: false },
    agents: Object.fromEntries(
      roles.map(({ key }) => [key, { operational: { available: true, state: 'siaga' } }])
    )
  };
  const activities = Object.fromEntries(
    roles.map(({ key }, index) => [
      key,
      {
        phase: 'standing',
        kind: index ? 'window' : 'guitar',
        destinationId: index ? 'window' : 'guitar',
        arrivalId: 1,
        position: [index, 0, 0]
      }
    ])
  );
  return { roles, snapshot, activities };
}

test('guitar and window participate, while work and lifecycle cancel delayed replies', () => {
  for (const interruption of ['working', 'walking', 'hidden', 'stale', 'reduced', 'blocked']) {
    const { roles, snapshot, activities } = idlePair();
    const dialogue = createAmbientDialogue(roles, { random: () => 0 });
    dialogue.update(0, snapshot, activities);
    const opener = dialogue.update(4, snapshot, activities);
    assert.equal(opener.length, 1);
    assert.equal(opener[0].roleKey, 'data_engineer');
    if (interruption === 'working') snapshot.agents.data_scientist.operational.state = 'bekerja';
    if (interruption === 'walking') activities.data_scientist.phase = 'walking';
    if (interruption === 'hidden') snapshot.gates.visible = false;
    if (interruption === 'stale') snapshot.gates.dataFresh = false;
    if (interruption === 'reduced') snapshot.gates.reducedMotion = true;
    const blocked = interruption === 'blocked' ? new Set(['data_scientist']) : new Set();
    assert.equal(dialogue.update(2.3, snapshot, activities, blocked).length, 0, interruption);
    dialogue.dispose();
    assert.equal(dialogue.update(20, snapshot, activities).length, 0);
  }
});

test('dialogue uses the current local identity after role mapping updates', () => {
  const { roles, snapshot, activities } = idlePair();
  const dialogue = createAmbientDialogue(roles, { random: () => 0 });
  roles[1].name = '  Nama\nLokal  ';
  dialogue.update(0, snapshot, activities);
  assert.equal(
    dialogue.update(4, snapshot, activities)[0].text,
    'Nama Lokal, main bola di PS yuk! Yang kalah traktir bakso'
  );
});

test('stationary characters never repeat quips without a new arrival', () => {
  const { roles, snapshot, activities } = idlePair();
  delete snapshot.agents.data_scientist;
  delete activities.data_scientist;
  const dialogue = createAmbientDialogue(roles.slice(0, 1), { random: () => 0 });
  dialogue.update(0, snapshot, activities);
  assert.equal(dialogue.update(30, snapshot, activities).length, 0);
  activities.data_engineer.arrivalId++;
  const quip = dialogue.update(0.01, snapshot, activities);
  assert.equal(quip.length, 1);
  assert(QUIPS_BY_SPOT.guitar.includes(quip[0].text));
  assert.equal(dialogue.update(4.2, snapshot, activities).length, 0);
  assert.equal(dialogue.update(30, snapshot, activities).length, 0);
});

test('deadlines use active time, retry without eligible peers, and do not catch up after stalls', () => {
  const { roles, snapshot, activities } = idlePair();
  const dialogue = createAmbientDialogue(roles, { random: () => 0 });
  snapshot.agents.data_scientist.operational.available = false;
  dialogue.update(0, snapshot, activities);
  assert.equal(dialogue.update(4, snapshot, activities).length, 0);
  snapshot.agents.data_scientist.operational.available = true;
  assert.equal(dialogue.update(6.999, snapshot, activities).length, 0);
  assert.equal(dialogue.update(0.001, snapshot, activities)[0].turn, 'opener');
  assert.equal(dialogue.update(2.299, snapshot, activities).length, 1);
  assert.equal(dialogue.update(0.001, snapshot, activities).length, 2);
  assert.equal(dialogue.update(2.499, snapshot, activities).length, 2);
  assert.deepEqual(
    dialogue.update(0.001, snapshot, activities).map((c) => c.turn),
    ['reply']
  );
  assert.equal(dialogue.update(1.7, snapshot, activities).length, 0);
  assert.equal(dialogue.update(0.499, snapshot, activities).length, 0);
  assert.equal(dialogue.update(0.001, snapshot, activities)[0].turn, 'opener');
  const stalled = dialogue.update(50, snapshot, activities);
  assert.equal(stalled.length, 1);
  assert.equal(stalled[0].turn, 'opener');
  assert.equal(dialogue.update(0, snapshot, activities)[0].id, stalled[0].id);
});

test('the random peer branch includes the nearest peer and can select a farther one', () => {
  for (const [branch, peer, expected] of [
    [0.69, 0.99, 'data_scientist'],
    [0.7, 0, 'data_scientist'],
    [0.7, 0.99, 'third']
  ]) {
    const { roles, snapshot, activities } = idlePair();
    roles.push({ key: 'third', name: 'Lyra' });
    snapshot.agents.third = { operational: { available: true, state: 'siaga' } };
    activities.third = { ...activities.data_scientist, position: [9, 0, 0] };
    const values = [0, 0, branch, ...(branch >= 0.7 ? [peer] : []), 0];
    const dialogue = createAmbientDialogue(roles, { random: () => values.shift() ?? 0 });
    dialogue.update(0, snapshot, activities);
    dialogue.update(4, snapshot, activities);
    const reply = dialogue.update(2.3, snapshot, activities).find((c) => c.turn === 'reply');
    assert.equal(reply.roleKey, expected);
  }
});

test('CHAT table contains exactly 40 canonical Indonesian banter pairs', () => {
  assert.equal(CHAT.length, 40);
  for (const [opener, reply] of CHAT) {
    assert.ok(typeof opener === 'string' && opener.length > 0);
    assert.ok(typeof reply === 'string' && reply.length > 0);
  }
  // Sample checks from audit report
  assert.equal(CHAT[0][0], '{to}, main bola di PS yuk! Yang kalah traktir bakso');
  assert.equal(CHAT[0][1], 'Ogah, kemarin aku kalah 3–0 😅');
  assert.equal(CHAT[1][0], 'Filmnya jangan di-spoiler ya, {to}!');
  assert.equal(CHAT[1][1], 'Siap, mulutku terkunci 🤐');
  assert.equal(CHAT[39][0], 'Sore ini cerah ya');
  assert.equal(CHAT[39][1], 'Enak buat jalan-jalan');
});

test('QUIPS_BY_SPOT covers all 10 idle leisure spots with exactly 36 spot-specific quips', () => {
  const spotKeys = Object.keys(QUIPS_BY_SPOT);
  assert.deepEqual(spotKeys, [
    'tv',
    'ps',
    'coffee',
    'water',
    'guitar',
    'window',
    'meet1',
    'meet2',
    'meet3',
    'bookshelf'
  ]);
  const totalSpotQuips = spotKeys.reduce((acc, k) => acc + QUIPS_BY_SPOT[k].length, 0);
  assert.equal(totalSpotQuips, 36);

  assert.ok(QUIPS_BY_SPOT.tv.includes('Filmnya lagi seru nih 🍿'));
  assert.ok(QUIPS_BY_SPOT.ps.includes('Gooool! ⚽'));
  assert.ok(QUIPS_BY_SPOT.coffee.includes('Ngopi dulu biar melek ☕'));
  assert.ok(QUIPS_BY_SPOT.water.includes('Minum air putih dulu 💧'));
  assert.ok(QUIPS_BY_SPOT.guitar.includes('🎸 jreng… jreng…'));
  assert.ok(QUIPS_BY_SPOT.window.includes('Langitnya cerah ya ☀️'));
  assert.ok(QUIPS_BY_SPOT.meet1.includes('Rapat lima menit, janji!'));
  assert.ok(QUIPS_BY_SPOT.meet2.includes('Diskusi ringan dulu ☕'));
  assert.ok(QUIPS_BY_SPOT.meet3.includes('Meja ini paling adem'));
  assert.ok(QUIPS_BY_SPOT.bookshelf.includes('Buku ini seru juga 📚'));
});

test('ambient dialogue triggers two-way CHAT between idle agents with name substitution', () => {
  const roles = [
    { key: 'data_engineer', name: 'Nova' },
    { key: 'data_scientist', name: 'Atlas' }
  ];
  const dialogue = createAmbientDialogue(roles);
  const snapshot = {
    gates: {
      allowAmbient: true,
      dataFresh: true,
      visible: true,
      reducedMotion: false
    },
    agents: {
      data_engineer: { operational: { available: true, state: 'siaga' } },
      data_scientist: { operational: { available: true, state: 'siaga' } }
    }
  };
  const activities = {
    data_engineer: {
      phase: 'seated',
      kind: 'sofa',
      destinationId: 'sofa:left',
      arrivalId: 1,
      position: [4.3, 0.64, 1.25]
    },
    data_scientist: {
      phase: 'seated',
      kind: 'sofa',
      destinationId: 'sofa:right',
      arrivalId: 1,
      position: [5.5, 0.64, 1.25]
    }
  };

  dialogue.update(0, snapshot, activities);

  assert.equal(dialogue.update(3.999, snapshot, activities).length, 0);
  const candidates = dialogue.update(0.001, snapshot, activities);
  assert.ok(candidates.length > 0, 'Dialogue opener candidate emitted');

  const opener = candidates.find((c) => c.turn === 'opener');
  assert.ok(opener, 'Opener candidate found');
  assert.ok(!opener.text.includes('{to}'), 'Placeholder {to} must be replaced');
  assert.ok(
    opener.text.includes('Nova') ||
      opener.text.includes('Atlas') ||
      !CHAT.some((p) => p[0].includes('{to}') && p[0] === opener.text)
  );

  assert.equal(
    dialogue.update(2.299, snapshot, activities).some((c) => c.turn === 'reply'),
    false
  );
  const replyCandidates = dialogue.update(0.0011, snapshot, activities);
  const reply = replyCandidates.find((c) => c.turn === 'reply');
  assert.ok(reply, 'Reply candidate found after delay');
  assert.notEqual(reply.roleKey, opener.roleKey, 'Reply comes from partner');
  assert.equal(
    replyCandidates.some((c) => c.turn === 'opener'),
    true
  );
  const afterOpener = dialogue.update(2.5, snapshot, activities);
  assert.equal(
    afterOpener.some((c) => c.turn === 'opener'),
    false
  );
  assert.equal(
    afterOpener.some((c) => c.turn === 'reply'),
    true
  );
  assert.equal(dialogue.update(1.7, snapshot, activities).length, 0);
});

test('receiveArrivals triggers spot-specific quip upon new arrival with 55% probability and spot lookup', () => {
  const roles = [
    { key: 'data_engineer', name: 'Nova' },
    { key: 'data_scientist', name: 'Atlas' }
  ];
  let randomVal = 0.2;
  const dialogue = createAmbientDialogue(roles, { random: () => randomVal });

  const snapshot = {
    gates: { allowAmbient: true, dataFresh: true, visible: true, reducedMotion: false },
    agents: {
      data_engineer: { operational: { available: true, state: 'siaga' } },
      data_scientist: { operational: { available: true, state: 'bekerja' } }
    }
  };

  const activities = {
    data_engineer: {
      phase: 'standing',
      kind: 'coffee',
      destinationId: 'coffee:left',
      arrivalId: 0,
      position: [6.7, 0.012, -5.65]
    },
    data_scientist: {
      phase: 'seated',
      kind: 'sofa',
      destinationId: 'sofa:right',
      arrivalId: 0,
      position: [5.5, 0.64, 1.25]
    }
  };

  // Initial load (!instant): captures arrivalId 0 without emitting quip
  let candidates = dialogue.update(0, snapshot, activities);
  assert.equal(
    candidates.filter((c) => c.turn === 'comment').length,
    0,
    'No quips on initial load'
  );

  // Agent arrives at coffee machine: arrivalId increments to 1
  activities.data_engineer = {
    ...activities.data_engineer,
    arrivalId: 1
  };

  candidates = dialogue.update(0.1, snapshot, activities);
  const comment = candidates.find((c) => c.turn === 'comment' && c.roleKey === 'data_engineer');
  assert.ok(comment, 'Spot quip candidate emitted upon arrival at coffee');
  assert.ok(
    QUIPS_BY_SPOT.coffee.includes(comment.text),
    `Quip text "${comment.text}" must belong to QUIPS_BY_SPOT.coffee`
  );
  assert.equal(comment.kind, 'dialogue');

  // Test spot lookup for all spots
  const spotsToTest = [
    { destinationId: 'coffee:left', kind: 'coffee', expected: QUIPS_BY_SPOT.coffee },
    { destinationId: 'coffee:right', kind: 'coffee', expected: QUIPS_BY_SPOT.coffee },
    { destinationId: 'pantry:water', kind: 'water', expected: QUIPS_BY_SPOT.water },
    { destinationId: 'sofa:left', kind: 'sofa', expected: QUIPS_BY_SPOT.tv },
    { destinationId: 'sofa:right', kind: 'sofa', expected: QUIPS_BY_SPOT.ps },
    { destinationId: 'guitar', kind: 'guitar', expected: QUIPS_BY_SPOT.guitar },
    { destinationId: 'window', kind: 'window', expected: QUIPS_BY_SPOT.window },
    { destinationId: 'reading:left', kind: 'reading', expected: QUIPS_BY_SPOT.bookshelf },
    { destinationId: 'meeting:0', kind: 'meeting', expected: QUIPS_BY_SPOT.meet1 },
    { destinationId: 'meeting:1', kind: 'meeting', expected: QUIPS_BY_SPOT.meet2 },
    { destinationId: 'meeting:2', kind: 'meeting', expected: QUIPS_BY_SPOT.meet3 }
  ];

  let currentArrivalId = 2;
  for (const { destinationId, kind, expected } of spotsToTest) {
    // Advance time past COMMENT_SECONDS (4.2s) so previous comment expires
    dialogue.update(5.0, snapshot, activities);

    activities.data_engineer = {
      phase: ['sofa:left', 'sofa:right', 'meeting:0', 'meeting:1', 'meeting:2'].includes(
        destinationId
      )
        ? 'seated'
        : 'standing',
      kind,
      destinationId,
      arrivalId: currentArrivalId++,
      position: [0, 0, 0]
    };
    candidates = dialogue.update(0.1, snapshot, activities);
    const spotComment = candidates.find(
      (c) => c.turn === 'comment' && c.roleKey === 'data_engineer'
    );
    if (!spotComment) {
      console.log('FAIL for destinationId:', destinationId, 'candidates:', candidates);
    }
    assert.ok(spotComment, `Quip emitted for spot destination ${destinationId}`);
    assert.ok(
      expected.includes(spotComment.text),
      `Quip "${spotComment?.text}" matches expected spot list`
    );
  }

  // When random >= 0.55 (e.g. 0.6), arrival does NOT emit a quip
  randomVal = 0.6;
  dialogue.update(5.0, snapshot, activities);
  activities.data_engineer = {
    phase: 'standing',
    kind: 'guitar',
    destinationId: 'guitar',
    arrivalId: currentArrivalId + 1,
    position: [0, 0, 0]
  };
  candidates = dialogue.update(0.1, snapshot, activities);
  const noComment = candidates.find((c) => c.turn === 'comment' && c.roleKey === 'data_engineer');
  assert.equal(noComment, undefined, 'No quip emitted when random >= 0.55');
});
