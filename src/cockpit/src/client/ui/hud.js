import { projectTaskBoard } from '../../shared/task-board-contract.js';
import { OFFICE_ARCHIVED_FEED_ROLES } from '../../shared/office-contract.js';
import { WORK_SCHEMATICS } from '../scene/workstation-screens.js';
import { bindAgentCardLayout } from './agent-card-layout.js';
import { getAgentCardStatus } from './agent-card-status.js';
import { setupDetailPanels } from './detail-panels.js';
import { bindHeaderLayout } from './header-layout.js';
import { revealTab } from './tab-scroll.js';

const CONNECTION_LABELS = {
  live: 'Terhubung',
  empty: 'Belum ada tugas',
  error: 'Status gagal dimuat',
  offline: 'Koneksi terputus'
};

const QUEUE_ROWS = [
  ['running', 'Sedang dikerjakan'],
  ['queued', 'Dalam antrean'],
  ['waiting_approval', 'Perlu keputusan'],
  ['failed', 'Gagal'],
  ['stale', 'Sesi kedaluwarsa']
];

const NARRATIVE_LABELS = Object.freeze({
  dialogue: 'Suasana ilustratif',
  'role-description': 'Deskripsi peran',
  work: 'Tugas publik',
  event: 'Riwayat publik'
});

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function boundedText(value, limit = 240) {
  return typeof value === 'string' ? value.trim().slice(0, limit) : '';
}

function roleIdentity(role) {
  return [boundedText(role?.name, 64), boundedText(role?.role, 100)].filter(Boolean).join(' · ');
}

function metric(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value.toLocaleString('id-ID') : '-';
}

export function projectTokenMetric(tokens, available = true) {
  if (!available || !tokens)
    return { value: '—', description: 'Usage token belum tersedia pada status ini.' };
  const coverage = `Usage tersimpan: ${tokens.reportedRuns} dari ${tokens.totalRuns} run; dapat parsial.`;
  if (tokens.processed === null && tokens.reportedRuns > 0)
    return {
      value: '—',
      description: `Jumlah token melampaui batas angka aman. ${coverage}`
    };
  if (tokens.processed === null)
    return { value: '—', description: 'Belum ada usage token tersimpan.' };
  return {
    value: metric(tokens.processed),
    description: coverage
  };
}

function parseDate(value) {
  if (value === null || value === undefined || value === '') return null;
  const source = typeof value === 'number' && value < 1e12 ? value * 1000 : value;
  const parsed = new Date(source);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function clockTime(value) {
  const parsed = parseDate(value);
  if (!parsed) return null;
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    hourCycle: 'h23',
    hour: '2-digit',
    minute: '2-digit'
  })
    .format(parsed)
    .replace(/:/g, '.');
}

function liveTime(value) {
  const parsed = parseDate(value);
  if (!parsed) return null;
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jakarta',
    hourCycle: 'h23',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).format(parsed);
}

export function projectConnectionPresentation(state, presentation, previousSyncTime = null) {
  const connection = Object.hasOwn(CONNECTION_LABELS, state?.connection)
    ? state.connection
    : presentation?.connection === 'loading'
      ? 'loading'
      : 'offline';
  const available = connection === 'live' || connection === 'empty';
  const syncing = presentation?.syncing === true;
  const visible = presentation?.gates?.visible !== false;
  const receivedTime = available && !syncing && visible ? liveTime(state?.now) : null;
  const lastSyncTime = receivedTime || previousSyncTime;
  const previousTimeText = lastSyncTime ? `Terakhir ${lastSyncTime} WIB` : 'Belum tersinkron';
  let status = connection;
  let label = CONNECTION_LABELS[connection] || 'Memuat status publik…';
  let syncText = previousTimeText;

  if (!visible) {
    status = 'hidden';
    label = 'Tab tidak aktif';
  } else if (syncing) {
    status = 'syncing';
    label = 'Menyinkronkan…';
  } else if (available && state?.queue?.stale > 0) {
    status = 'stale';
    label = 'Sesi kedaluwarsa';
    if (receivedTime) syncText = `Sinkron ${receivedTime} WIB`;
  } else if (available) {
    label = receivedTime ? `Live · ${receivedTime}` : CONNECTION_LABELS[connection];
    if (receivedTime) syncText = `Sinkron ${receivedTime} WIB`;
  }

  return { connection, status, label, syncText, lastSyncTime };
}

function roleColor(role) {
  return /^#[0-9a-f]{6}$/i.test(role?.color || '') ? role.color : '#3f615c';
}

function cardSubtext(agent, presentation) {
  const { connection, gates } = presentation;
  if (connection === 'loading') return 'Memuat status agent.';
  if (connection === 'error') {
    return 'Status belum dapat dibaca.';
  }
  if (connection === 'offline') {
    return 'Koneksi terputus; menunggu status terbaru.';
  }
  if (gates?.visible === false) return 'Pembaruan dijeda saat tab tersembunyi.';
  if (!gates?.dataFresh) return 'Menunggu status terbaru.';
  if (!agent?.operational?.available) {
    return 'Status agent belum tersedia.';
  }
  if (agent.operational.state === 'menunggu_persetujuan') {
    return 'Menunggu persetujuan pemilik';
  }
  if (agent.operational.state === 'gagal') return 'Percobaan tugas gagal';
  if (
    [
      'queued',
      'starting',
      'awaiting_answer',
      'awaiting_delegates',
      'unavailable',
      'unmapped',
      'paused',
      'unattached',
      'offline_runtime',
      'checking',
      'filtered'
    ].includes(agent.operational.state)
  ) {
    return boundedText(agent.operational.task, 180);
  }
  if (agent.operational.state === 'bekerja') {
    return boundedText(agent.operational.runtimeHint, 180) || 'Run sedang berjalan.';
  }
  if (agent.operational.state !== 'siaga') {
    return 'Status agent belum tersedia.';
  }
  if (gates.allowAmbient && agent.visual?.text && !agent.operational.latestFailure) {
    return 'Menunggu tugas baru.';
  }
  return agent.operational.latestFailure
    ? boundedText(agent.operational.resultHint, 180) || 'Percobaan terakhir gagal'
    : 'Menunggu tugas baru.';
}

export function projectAgentCardPresentation(agent, presentation) {
  const operational = agent?.operational;
  const visual =
    presentation.gates?.allowAmbient && operational?.state === 'siaga' && !operational.latestFailure
      ? boundedText(agent.visual?.text, 180)
      : '';
  const description = visual || (operational?.available ? boundedText(operational.task, 180) : '');
  return {
    status: getAgentCardStatus(
      operational?.available ? operational.state : null,
      presentation.connection
    ),
    task: description || 'Status tugas belum tersedia.',
    taskTitle: description,
    subtext: cardSubtext(agent, presentation)
  };
}

export function setupHUD(
  config,
  onAgentClick,
  { documentRef = document, windowRef = window } = {}
) {
  const document = documentRef;
  const window = windowRef;
  const removers = [];
  function listen(target, type, listener) {
    target.addEventListener(type, listener);
    removers.push(() => target.removeEventListener(type, listener));
  }
  const roles = Array.isArray(config?.roles) ? config.roles : [];
  const roleByKey = new Map(roles.map((role) => [role.key, role]));
  const archivedFeedRoleByKey = new Map(
    OFFICE_ARCHIVED_FEED_ROLES.map(({ key, label }) => [key, label])
  );
  const cardByKey = new Map();
  const feedList = document.getElementById('feedList');
  const feedCount = document.getElementById('feedCount');
  const agentGrid = document.getElementById('agentGrid');
  const paneTasks = document.getElementById('paneTasks');
  const paneAbout = document.getElementById('paneAbout');
  const liveStatus = document.getElementById('liveStatus');
  const liveDot = document.getElementById('liveDot');
  const syncTime = document.getElementById('syncTime');
  const systemPhase = document.getElementById('systemPhase');
  const statTasks = document.getElementById('statTasks');
  const statDone = document.getElementById('statDone');
  const statApproval = document.getElementById('statApproval');
  const statTokens = document.getElementById('statTokens');
  for (const [id, label] of [
    ['statDone', 'Tugas selesai'],
    ['statTasks', 'Aktif sekarang'],
    ['statTokens', 'Token diproses'],
    ['officeTime', 'Sesi kerja']
  ]) {
    const caption = document.getElementById(id)?.closest('.metric')?.querySelector('small');
    if (caption) caption.textContent = label;
  }
  let lastSyncTime = null;

  const detailPanels = setupDetailPanels({ documentRef: document, windowRef: window });
  const headerLayout = bindHeaderLayout(document.querySelector('.top-bar'), window);

  const allTabs = [
    document.getElementById('tabTasks'),
    document.getElementById('tabAbout'),
    document.getElementById('tabFeed')
  ].filter(Boolean);

  function revealSelectedTab() {
    revealTab(allTabs.find((tab) => tab.getAttribute('aria-selected') === 'true'));
  }

  function updateTabVisibility() {
    const mfeed = document.getElementById('tabFeed');
    if (mfeed) {
      mfeed.hidden = window.innerWidth > 1180;
      if (window.innerWidth > 1180 && mfeed.getAttribute('aria-selected') === 'true') {
        document.getElementById('tabTasks')?.click();
      }
    }
    revealSelectedTab();
  }
  listen(window, 'resize', updateTabVisibility);
  updateTabVisibility();

  function selectTab(tab, focus = false) {
    detailPanels.expandMobile();
    for (const item of allTabs) {
      const active = item === tab;
      item.setAttribute('aria-selected', String(active));
      item.tabIndex = active ? 0 : -1;
      const pane = document.getElementById(item.getAttribute('aria-controls'));
      if (pane) {
        pane.classList.toggle('active', active);
        pane.classList.toggle('on', active);
        pane.hidden = !active;
      }
    }
    if (focus) tab?.focus();
    revealTab(tab);
  }

  allTabs.forEach((tab) => {
    listen(tab, 'click', () => selectTab(tab));
    listen(tab, 'focus', () => revealTab(tab));
  });

  allTabs.forEach((tab) => {
    listen(tab, 'keydown', (event) => {
      const visibleTabs = allTabs.filter((item) => !item.hidden);
      const index = visibleTabs.indexOf(tab);
      let next;
      if (event.key === 'ArrowRight') next = (index + 1) % visibleTabs.length;
      else if (event.key === 'ArrowLeft')
        next = (index - 1 + visibleTabs.length) % visibleTabs.length;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = visibleTabs.length - 1;
      else return;
      event.preventDefault();
      selectTab(visibleTabs[next], true);
    });
  });

  if (allTabs.length) selectTab(allTabs[0]);

  let currentFocusedRole = null;
  let lastState = null;
  let lastConnection = 'offline';
  let lastPresentation = null;
  let latestNarrative = { dialogue: null, bubbles: [] };
  let narrativeSection = null;
  let narrativeSignature = '';

  if (agentGrid) {
    agentGrid.replaceChildren();
    for (const role of roles) {
      const card = element('button', 'agent-card card card-ui');
      card.type = 'button';
      card.style.setProperty('--role-accent', roleColor(role));
      card.style.setProperty('--c', roleColor(role));
      card.id = 'card-' + role.key;
      card.dataset.role = role.key;
      card.dataset.focus = role.key;
      card.setAttribute('aria-pressed', 'false');

      const avatar = element('span', 'agent-avatar ava', boundedText(role.name, 1));
      avatar.style.backgroundColor = roleColor(role);
      avatar.setAttribute('aria-hidden', 'true');

      const heading = element('div', 'agent-card-heading h');
      const identity = element('div', 'agent-name');
      const nameEl = element('span', 'agent-character-name nm', boundedText(role.name, 32));
      const roleEl = element('span', 'agent-role role', boundedText(role.role, 64));
      const status = element('span', 'agent-status chip st');
      const initialStatus = getAgentCardStatus(null, 'loading');
      status.append(element('i'), document.createTextNode(initialStatus.label));
      status.style.color = initialStatus.color;
      status.title = initialStatus.description;
      identity.append(nameEl, roleEl);
      heading.append(identity, status);

      card.title = roleIdentity(role);
      const task = element('div', 'agent-task task', 'Status tugas belum tersedia.');
      const activity = element('div', 'agent-activity act', 'Memuat status agent.');
      card.append(avatar, heading, task, activity);
      card.setAttribute(
        'aria-label',
        `${roleIdentity(role)}: ${initialStatus.description}. ${task.textContent} ${activity.textContent}`
      );

      listen(card, 'click', () => {
        setFocusedRole(role.key);
        if (typeof onAgentClick === 'function') onAgentClick(role.key);
        detailPanels.collapseMobile();
        revealSelectedTab();
      });
      agentGrid.append(card);
      cardByKey.set(role.key, {
        card,
        task,
        activity,
        status,
        role,
        nameEl,
        roleEl,
        avatar
      });
    }
  }

  const cardLayout = bindAgentCardLayout(agentGrid, window);

  function renderConnection(state, presentation) {
    const view = projectConnectionPresentation(state, presentation, lastSyncTime);
    const { connection, status } = view;
    lastSyncTime = view.lastSyncTime;
    liveDot.dataset.connection = status;
    const dotColors = {
      live: '#247c5b',
      empty: '#66756c',
      error: '#a6402d',
      offline: '#a7581d',
      loading: '#66756c',
      syncing: '#66756c',
      hidden: '#66756c',
      stale: '#a7581d'
    };
    liveDot.style.backgroundColor = dotColors[status];
    liveStatus.textContent = view.label;
    const liveTxt = document.getElementById('liveTxt');
    if (liveTxt) liveTxt.textContent = view.label;
    syncTime.textContent = view.syncText;

    if (status === 'syncing' || status === 'loading' || status === 'hidden' || status === 'stale') {
      systemPhase.textContent =
        status === 'syncing'
          ? 'Memperbarui status publik sebelum melanjutkan gerak.'
          : status === 'loading'
            ? 'Memuat status publik lab.'
            : status === 'hidden'
              ? 'Gerak dijeda selama tab tidak aktif.'
              : 'Sesi kerja kedaluwarsa; suasana ilustratif dijeda.';
      return connection;
    }

    if (connection === 'error' || connection === 'offline') {
      systemPhase.textContent =
        connection === 'error'
          ? 'Status tugas belum dapat dibaca.'
          : 'Menunggu koneksi ke ledger agent.';
      return connection;
    }

    const workingTeam = [];
    for (const [key, role] of roleByKey) {
      const ag = state?.agents?.[key];
      if (ag?.state === 'bekerja') workingTeam.push(role.name);
    }
    const queue = state?.queue || {};
    if (workingTeam.length) {
      systemPhase.textContent = `Sedang bekerja: ${workingTeam.join(', ')}`;
    } else if (queue.waiting_approval > 0) {
      systemPhase.textContent = `${metric(queue.waiting_approval)} tugas menunggu keputusan pemilik`;
    } else {
      systemPhase.textContent =
        'Semua santai ☕ - nonton, ngopi & ngobrol. Otomatis kembali kerja saat ada tugas.';
    }
    return connection;
  }

  function renderMetrics(state, connection) {
    const available = connection === 'live' || connection === 'empty';
    const totals = available ? state.totals || {} : {};
    statTasks.textContent = metric(totals.tasks);
    statDone.textContent = metric(totals.completed);
    statApproval.textContent = metric(available ? state.queue?.waiting_approval : null);
    if (statTokens) {
      const tokenMetric = projectTokenMetric(state.office?.tokens, available);
      statTokens.textContent = tokenMetric.value;
      statTokens.title = tokenMetric.description;
      statTokens.setAttribute(
        'aria-label',
        `Token diproses: ${tokenMetric.value}. ${tokenMetric.description}`
      );
    }

    const sToday = document.getElementById('sToday');
    if (sToday) sToday.textContent = metric(totals.completed || 0);

    const sActive = document.getElementById('sActive');
    if (sActive) {
      let activeCount = 0;
      if (state.agents) {
        for (const ag of Object.values(state.agents)) {
          if (ag?.state === 'bekerja' || ag?.state === 'menunggu_persetujuan') activeCount++;
        }
      }
      sActive.textContent = metric(activeCount);
    }

    const percentEl = document.getElementById('statRoadmapPercent');
    const fillEl = document.getElementById('statRoadmapFill');
    const pct =
      state.source !== 'personal-agentic' && available && totals.tasks > 0
        ? Math.min(100, Math.round(((totals.completed || 0) / totals.tasks) * 100))
        : null;
    if (percentEl) percentEl.textContent = pct === null ? 'Belum tersedia' : pct + '%';
    if (fillEl) fillEl.style.width = (pct || 0) + '%';

    const nRuns = document.getElementById('nRuns');
    if (nRuns) nRuns.textContent = metric((totals.completed || 0) + (totals.failed || 0));

    const nTodo = document.getElementById('nTodo');
    if (nTodo) {
      const q = state.queue || {};
      const activeTodos = (q.running || 0) + (q.queued || 0) + (q.waiting_approval || 0);
      nTodo.textContent = metric(activeTodos);
    }
  }

  function renderRuns(state, connection) {
    if (!paneTasks) return;
    paneTasks.replaceChildren();
    const src = element('div', 'src');
    src.append(
      element(
        'b',
        '',
        state.source === 'personal-agentic' ? 'Hasil terakhir per agent' : 'Ledger publik'
      ),
      document.createTextNode(' · terbaru di atas')
    );
    paneTasks.append(src);

    if (connection === 'error' || connection === 'offline') {
      paneTasks.append(
        element('div', 'empty', 'Riwayat belum tersedia. Menghubungkan ke server...')
      );
      return;
    }

    const terminal =
      state.source === 'personal-agentic'
        ? state.office?.history || []
        : (state.feed || []).filter((item) =>
            ['succeeded', 'failed', 'cancelled'].includes(item.kind)
          );
    const runs = terminal.map((item) => {
      const role = roleByKey.get(item.role);
      return {
        text: item.text,
        roleName: role?.name || 'Agent',
        roleColor: roleColor(role),
        time: item.time,
        status: item.status || item.kind
      };
    });

    const nRuns = document.getElementById('nRuns');
    const totalDone = state.totals?.completed || 0;
    const totalFailed = state.totals?.failed || 0;
    if (nRuns) nRuns.textContent = metric(totalDone + totalFailed || runs.length);

    if (!runs.length) {
      paneTasks.append(element('div', 'empty', 'Belum ada riwayat tugas selesai.'));
      return;
    }

    const list = element('div', 'runs-list');
    for (const r of runs.slice(0, 30)) {
      const row = element('div', 'run');
      const dot = element('span', 'c');
      dot.style.backgroundColor = r.roleColor;
      const title = element('span', 't', boundedText(r.text, 80));
      title.title = r.text;
      const chip = element('span', 'chip');
      const isDone = r.status === 'succeeded';
      chip.style.color = isDone ? '#23874f' : '#c43d3d';
      chip.innerHTML = `<i></i>${isDone ? 'Selesai' : r.status === 'cancelled' ? 'Dibatalkan' : 'Gagal'}`;
      const timeStr = clockTime(r.time) || '--.--';
      const meta = element('span', 'w', `${r.roleName} · ${timeStr}`);
      row.append(dot, title, chip, meta);
      list.append(row);
    }
    paneTasks.append(list);
  }

  function renderTodo(state, connection) {
    if (!paneAbout) return;
    paneAbout.replaceChildren();
    narrativeSection = null;
    narrativeSignature = '';

    const activeRoleKey = currentFocusedRole || 'hq_lab_director';
    const activeRole = roleByKey.get(activeRoleKey);
    const activeAgent = state.agents?.[activeRoleKey];

    const src = element('div', 'src');
    src.append(
      document.createTextNode('Sumber: '),
      element(
        'b',
        '',
        state.source === 'personal-agentic' ? 'run & action workspace' : 'papan tugas & antrean lab'
      ),
      document.createTextNode(` · Fokus: ${activeRole ? activeRole.name : 'Orion'}`)
    );
    paneAbout.append(src);

    if (activeAgent?.task) {
      const activeBox = element('div', 'todo-active-box card-ui');
      activeBox.style.padding = '8px 10px';
      activeBox.style.marginBottom = '10px';
      activeBox.style.background = '#fff';
      activeBox.append(
        element('strong', '', 'Status run: '),
        element('span', '', boundedText(activeAgent.task, 120))
      );
      paneAbout.append(activeBox);
    }

    renderNarrative();

    const board = projectTaskBoard(state);
    const boardHeading = element('h3', 'queue-heading', 'Papan tugas');
    const boardList = element('dl', 'board-summary');
    for (const column of board.columns) {
      const row = element('div', 'board-summary-row');
      row.dataset.stage = column.key;
      row.append(
        element('dt', '', column.label),
        element('dd', '', column.value === null ? 'Belum tersedia' : metric(column.value))
      );
      boardList.append(row);
    }
    paneAbout.append(boardHeading, boardList);
    paneAbout.append(
      element(
        'p',
        'board-mapping',
        'Rencana bukan antrean dan belum tersedia dalam ledger. Dikerjakan memakai lease aktif; Uji QA memakai antrean persetujuan; Selesai memakai status succeeded.'
      )
    );

    if (connection === 'error' || connection === 'offline') {
      paneAbout.append(
        element('p', 'empty-state', 'Antrean belum tersedia. Halaman mencoba tersambung kembali.')
      );
      return;
    }
    if (!state.queue || typeof state.queue !== 'object') {
      paneAbout.append(element('p', 'empty-state', 'Data antrean belum tersedia.'));
      return;
    }

    const approval = state.queue.waiting_approval;
    if (approval > 0) {
      paneAbout.append(
        element(
          'p',
          'queue-note',
          metric(approval) + ' tugas menunggu keputusan pemilik melalui kanal agent.'
        )
      );
    }
    const list = element('div', 'queue-list');
    for (const [key, label] of QUEUE_ROWS) {
      const row = element('div', 'queue-row');
      row.append(element('span', '', label), element('strong', '', metric(state.queue[key])));
      list.append(row);
    }
    paneAbout.append(list);

    const nTodo = document.getElementById('nTodo');
    const q = state.queue || {};
    const activeTodos = (q.running || 0) + (q.queued || 0) + (q.waiting_approval || 0);
    if (nTodo) nTodo.textContent = metric(activeTodos);
  }

  function renderNarrative() {
    if (!paneAbout || !lastPresentation) return;
    const activeRoleKey = currentFocusedRole || 'hq_lab_director';
    const role = roleByKey.get(activeRoleKey);
    if (!role) return;
    const agent = lastPresentation.agents?.[activeRoleKey];
    const gates = lastPresentation.gates;
    const fresh = gates?.dataFresh === true && gates.visible === true;
    const activityText =
      agent?.operational?.state === 'siaga' &&
      gates.allowAmbient &&
      agent.visual?.text &&
      !agent.operational.latestFailure
        ? boundedText(agent.visual.text, 180)
        : cardSubtext(agent, lastPresentation);
    const paragraphs = [
      fresh && agent?.operational?.state === 'bekerja' ? `Bekerja · ${activityText}` : activityText
    ];
    const ambient = fresh && gates.allowAmbient === true && agent?.operational?.state === 'siaga';
    const dialogue = latestNarrative.dialogue;
    const hasDialogue = ambient && dialogue?.participants.includes(activeRoleKey);
    if (hasDialogue) {
      const format = dialogue.participants.length === 1 ? 'Komentar lokal' : 'Obrolan lokal';
      paragraphs.push(`${format}, Suasana ilustratif. Bukan percakapan agent AI.`);
      for (const line of dialogue.lines) {
        const speaker = roleByKey.get(line.roleKey);
        if (speaker) paragraphs.push(`${speaker.name}: ${line.text}`);
      }
    }
    if (fresh) {
      for (const bubble of latestNarrative.bubbles) {
        if (bubble.roleKey !== activeRoleKey) continue;
        if (bubble.kind === 'dialogue' && (!ambient || hasDialogue)) continue;
        if (
          (bubble.kind === 'work' || bubble.kind === 'role-description') &&
          agent?.operational?.state !== 'bekerja'
        ) {
          continue;
        }
        if (bubble.kind === 'role-description' && bubble.text === agent?.workingBubble?.text) {
          continue;
        }
        paragraphs.push(`${NARRATIVE_LABELS[bubble.kind]}: ${bubble.text}`);
      }
    }
    const uniqueParagraphs = [...new Set(paragraphs)];
    const signature = JSON.stringify([activeRoleKey, uniqueParagraphs]);
    if (signature === narrativeSignature && narrativeSection?.parentNode === paneAbout) return;
    if (!narrativeSection || narrativeSection.parentNode !== paneAbout) {
      narrativeSection = element('section', 'about-note character-narrative');
      narrativeSection.dataset.role = activeRoleKey;
      narrativeSection.setAttribute('aria-live', 'off');
      const boardHeading = paneAbout.querySelector('.queue-heading');
      paneAbout.insertBefore(narrativeSection, boardHeading);
    }
    narrativeSection.dataset.role = activeRoleKey;
    narrativeSection.setAttribute('aria-label', `Karakter ${role.name}`);
    narrativeSection.replaceChildren(
      element('h3', '', `Karakter ${role.name}`),
      ...uniqueParagraphs.map((text) => element('p', '', text))
    );
    narrativeSignature = signature;
  }

  function receiveNarrative(narrative) {
    const dialogue = narrative?.dialogue;
    const participants = Array.isArray(dialogue?.participants)
      ? dialogue.participants.filter((key) => roleByKey.has(key)).slice(0, 2)
      : [];
    const lines = Array.isArray(dialogue?.lines)
      ? dialogue.lines
          .filter((line) => participants.includes(line?.roleKey))
          .map((line) => ({ roleKey: line.roleKey, text: boundedText(line.text, 180) }))
          .filter((line) => line.text)
          .slice(0, 2)
      : [];
    latestNarrative = {
      dialogue: participants.length > 0 && lines.length ? { participants, lines } : null,
      bubbles: (Array.isArray(narrative?.bubbles) ? narrative.bubbles : [])
        .filter(
          (bubble) =>
            roleByKey.has(bubble?.roleKey) && Object.hasOwn(NARRATIVE_LABELS, bubble?.kind || '')
        )
        .map((bubble) => ({
          roleKey: bubble.roleKey,
          kind: bubble.kind,
          text: boundedText(bubble.text, 180)
        }))
        .filter((bubble) => bubble.text)
        .slice(0, roles.length * 3)
    };
    renderNarrative();
  }

  function setFocusedRole(roleKey) {
    const nextRole = roleByKey.has(roleKey) ? roleKey : null;
    const changed = currentFocusedRole !== nextRole;
    currentFocusedRole = nextRole;
    const tugasWho = document.getElementById('tugasWho');
    if (tugasWho) tugasWho.textContent = roleByKey.get(nextRole)?.name || 'Orion';
    for (const [key, { card }] of cardByKey) {
      card.setAttribute('aria-pressed', String(key === nextRole));
    }
    if (changed && lastState) renderTodo(lastState, lastConnection);
    else renderNarrative();
  }

  function renderAgents(presentation) {
    if (!presentation || typeof presentation !== 'object') return;
    for (const [key, { card, task, activity, status, role }] of cardByKey) {
      const agent = presentation.agents?.[key];
      const projected = projectAgentCardPresentation(agent, presentation);
      const presentedStatus = projected.status;
      const agentState = presentedStatus.state;

      task.textContent = projected.task;
      task.title = projected.taskTitle;

      const subText = projected.subtext;
      activity.textContent = subText;
      activity.title = subText;

      status.style.color = presentedStatus.color;
      const runtimeHint = [
        boundedText(agent?.operational?.runtimeHint, 180),
        agent?.operational?.latestFailure ? 'Run terakhir gagal' : ''
      ]
        .filter(Boolean)
        .join(' · ');
      card.title = [roleIdentity(role), runtimeHint].filter(Boolean).join('. ');
      status.replaceChildren(element('i'), document.createTextNode(presentedStatus.label));
      status.title = presentedStatus.description;
      status.dataset.state = agentState || 'unknown';

      card.dataset.state = agentState || 'unknown';
      card.classList.toggle('working', agentState === 'bekerja');
      card.classList.toggle('waiting', agentState === 'menunggu_persetujuan');
      card.classList.toggle('failed', agentState === 'gagal');
      card.setAttribute(
        'aria-label',
        roleIdentity(role) +
          ': ' +
          presentedStatus.description +
          '. ' +
          task.textContent +
          ' ' +
          subText +
          (runtimeHint ? ` ${runtimeHint}` : '')
      );
    }
  }

  function syncMobileFeed() {
    const feedListMobile = document.getElementById('feedListMobile');
    if (feedListMobile && feedList) {
      feedListMobile.replaceChildren(
        ...Array.from(feedList.children).map((el) => el.cloneNode(true))
      );
    }
  }

  let feedSignature = null;
  function renderFeed(state, connection) {
    if (!feedList) return;
    const fresh = connection === 'live' || connection === 'empty';
    const feed = fresh && Array.isArray(state.feed) ? state.feed : [];
    const signature = JSON.stringify([
      fresh,
      feed,
      [...roleByKey.values()].map(({ key, name, role, color }) => [key, name, role, color])
    ]);
    if (signature === feedSignature) return;
    feedSignature = signature;
    feedList.replaceChildren();
    if (feedCount) feedCount.textContent = fresh ? metric(feed.length) : '-';
    if (!fresh) {
      feedList.append(
        element(
          'li',
          'empty-state',
          'Aktivitas belum tersedia. Halaman mencoba tersambung kembali.'
        )
      );
      syncMobileFeed();
      return;
    }
    if (!feed.length) {
      feedList.append(element('li', 'empty-state', 'Belum ada aktivitas agent yang tercatat.'));
      syncMobileFeed();
      return;
    }

    for (const item of feed) {
      const role = roleByKey.get(item?.role);
      const archivedLabel = archivedFeedRoleByKey.get(item?.role);
      const row = element('li');
      row.dataset.source = 'operational';
      if (item.runId) row.dataset.runId = item.runId;
      if (item.stepIndex !== null && item.stepIndex !== undefined)
        row.dataset.stepIndex = String(item.stepIndex);
      const avatar = element(
        'span',
        'feed-avatar',
        role ? boundedText(role.name, 1) : archivedLabel ? 'A' : '?'
      );
      avatar.style.backgroundColor = archivedLabel ? '#66756c' : roleColor(role);
      avatar.setAttribute('aria-hidden', 'true');
      const content = element('div', 'feed-content');
      const meta = element('div', 'feed-meta');
      const who = element(
        'span',
        'feed-who',
        role ? roleIdentity(role) : archivedLabel || 'Peran belum dikenal'
      );
      who.style.color = archivedLabel ? '#57524b' : roleColor(role);
      meta.append(who);
      const time = element('time', 'feed-time');
      const parsed = parseDate(item?.time);
      if (parsed) {
        time.dateTime = parsed.toISOString();
        time.textContent = liveTime(parsed);
      } else {
        time.textContent = boundedText(item?.time, 32);
      }
      meta.append(time);
      content.append(meta);
      const description = boundedText(item?.text, 600) || 'Aktivitas tanpa rincian.';
      content.append(
        element(
          'div',
          'feed-text',
          item.stepState === 'failed' && !/gagal/i.test(description)
            ? `Gagal: ${description}`
            : description
        )
      );
      row.append(avatar, content);
      feedList.append(row);
    }
    syncMobileFeed();
  }

  const schematicList = document.getElementById('schematicList');
  if (schematicList) {
    for (const role of roles) {
      const schematic = WORK_SCHEMATICS[role.key];
      if (!schematic) continue;
      const item = element('li');
      item.append(element('strong', '', `${roleIdentity(role)}: `));
      item.append(document.createTextNode(schematic.description));
      schematicList.append(item);
    }
  }

  return {
    dispose() {
      removers.splice(0).forEach((remove) => remove());
      detailPanels.dispose();
      cardLayout?.destroy();
      headerLayout?.destroy();
    },
    updateRoles(nextRoles) {
      for (const role of nextRoles) {
        const entry = cardByKey.get(role.key);
        if (!entry) continue;
        entry.role = role;
        roleByKey.set(role.key, role);
        entry.nameEl.textContent = boundedText(role.name, 64);
        entry.roleEl.textContent = boundedText(role.role, 100);
        entry.roleEl.title = boundedText(role.role, 100);
        entry.avatar.textContent = boundedText(role.name, 1);
        entry.card.title = roleIdentity(role);
        entry.card.dataset.agentId = role.agentId || '';
      }
    },
    isMobilePanelOpen: detailPanels.isMobileOpen,
    updateTime(time) {
      const node = document.getElementById('officeTime');
      if (!node || node.dataset.minuteKey === time.minuteKey) return;
      node.dataset.minuteKey = time.minuteKey;
      node.textContent = `${time.timeText} WIB`;
      node.dateTime = `${time.minuteKey}:00+07:00`;
      node.title = time.dateText;
    },
    updateTVMode(mode) {
      const node = document.getElementById('tvMode');
      if (!node || node.dataset.mode === mode) return;
      node.dataset.mode = mode;
      node.textContent =
        mode === 'racing'
          ? 'TV: animasi balapan dekoratif (sofa ditempati).'
          : 'TV: katalog dekoratif (sofa kosong).';
    },
    resetFocus() {
      setFocusedRole(null);
      revealSelectedTab();
    },
    setFocusedRole,
    updatePresentation(presentation) {
      lastPresentation = presentation;
      renderConnection(lastState, presentation);
      renderAgents(presentation);
      renderNarrative();
      if (lastState) renderFeed(lastState, lastConnection);
    },
    updateNarrative(narrative) {
      receiveNarrative(narrative);
    },
    updateState(state, presentation) {
      if (!state || typeof state !== 'object') return;
      const selectedTab = allTabs.find((tab) => tab.getAttribute('aria-selected') === 'true');
      const tabText = selectedTab?.textContent;
      lastState = state;
      lastPresentation = presentation;
      const connection = renderConnection(state, presentation);
      lastConnection = connection;
      renderMetrics(state, connection);
      renderRuns(state, connection);
      renderTodo(state, connection);
      renderAgents(presentation);
      renderFeed(state, connection);
      if (selectedTab?.textContent !== tabText) revealTab(selectedTab);
    }
  };
}
