import * as THREE from 'three';

export const WORK_SCHEMATICS = Object.freeze({
  data_engineer: Object.freeze({
    kind: 'pipeline',
    title: 'Alur data',
    description: 'Diagram ingest, transform, dan validasi; bukan pipeline yang sedang dijalankan.'
  }),
  data_scientist: Object.freeze({
    kind: 'notebook',
    title: 'Notebook analisis',
    description: 'Sketsa notebook dan distribusi tanpa nilai hasil eksperimen.'
  }),
  research_scientist: Object.freeze({
    kind: 'research',
    title: 'Kerangka riset',
    description: 'Outline bacaan, metode, dan catatan; bukan dokumen riset agent.'
  }),
  ml_engineer: Object.freeze({
    kind: 'model',
    title: 'Tahap model',
    description: 'Diagram build, train, dan infer tanpa progress training.'
  })
});

const STATE_LABELS = Object.freeze({
  bekerja: 'Bekerja',
  menunggu_persetujuan: 'Perlu keputusan',
  siaga: 'Siaga',
  gagal: 'Gagal'
});

export function projectWorkstationState(agent, snapshot) {
  const connection = snapshot?.connection || 'loading';
  const fresh = connection === 'live' || connection === 'empty';
  const state = fresh && Object.hasOwn(STATE_LABELS, agent?.state) ? agent.state : null;
  const stateLabel = state
    ? STATE_LABELS[state]
    : connection === 'offline'
      ? 'Offline'
      : connection === 'error'
        ? 'Status tidak tersedia'
        : 'Menunggu status';
  const task =
    fresh && typeof agent?.task === 'string'
      ? agent.task
          .replace(/[\p{Cc}\s]+/gu, ' ')
          .trim()
          .slice(0, 180)
      : connection === 'offline'
        ? 'Koneksi status terputus.'
        : connection === 'error'
          ? 'Ledger belum dapat dibaca.'
          : 'Menunggu status ledger.';
  return { connection, fresh, state, stateLabel, task: task || 'Belum ada ringkasan publik.' };
}

function tint(color, amount) {
  return new THREE.Color(color).lerp(new THREE.Color('#ffffff'), amount).getStyle();
}

function canvasTexture(width, height, anisotropy, name, dynamic = false) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const texture = new THREE.CanvasTexture(canvas);
  texture.name = name;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = dynamic ? THREE.LinearFilter : THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = !dynamic;
  texture.anisotropy = anisotropy;
  return { canvas, ctx: canvas.getContext('2d'), texture };
}

function lineText(ctx, text, x, y, width, size = 24, weight = 500) {
  let fontSize = size;
  do {
    ctx.font = `${weight} ${fontSize}px system-ui, sans-serif`;
    if (ctx.measureText(text).width <= width) break;
    fontSize--;
  } while (fontSize > 16);
  ctx.fillText(text, x, y, width);
}

function summaryLines(ctx, text, width) {
  const words = text.split(/\s+/);
  const lines = [''];
  for (const word of words) {
    const last = lines.length - 1;
    const next = lines[last] ? `${lines[last]} ${word}` : word;
    if (ctx.measureText(next).width <= width) lines[last] = next;
    else if (lines.length === 1) lines.push(word);
    else {
      while (ctx.measureText(`${lines[1]}…`).width > width) lines[1] = lines[1].slice(0, -1);
      lines[1] += '…';
      break;
    }
  }
  return lines;
}

function box(ctx, x, y, width, height, text, color, selected = false) {
  ctx.fillStyle = '#243140';
  ctx.fillRect(x, y, width, height);
  ctx.strokeStyle = selected ? color : '#657687';
  ctx.lineWidth = selected ? 3 : 1.5;
  ctx.strokeRect(x, y, width, height);
  ctx.fillStyle = '#e5edf4';
  ctx.textAlign = 'center';
  lineText(ctx, text, x + width / 2, y + height / 2 + 8, width - 18, 23);
  ctx.textAlign = 'left';
}

function connector(ctx, from, to, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(...from);
  ctx.lineTo(...to);
  ctx.stroke();
}

function schematic(ctx, kind, color, phase, active) {
  if (kind === 'pipeline' || kind === 'model') {
    const labels =
      kind === 'pipeline' ? ['Ingest', 'Transform', 'Validasi'] : ['Build', 'Train', 'Infer'];
    labels.forEach((label, index) =>
      box(ctx, 40 + index * 248, 183, 190, 63, label, color, active && phase === index)
    );
    for (const x of [230, 478]) connector(ctx, [x, 214], [x + 58, 214], color);
    ctx.fillStyle = '#b7c6d4';
    lineText(
      ctx,
      kind === 'pipeline'
        ? 'Sumber → proses → struktur data'
        : 'Artefak → pembelajaran → pemakaian',
      40,
      281,
      688,
      20
    );
  } else if (kind === 'notebook') {
    box(ctx, 40, 159, 270, 126, 'Notebook', color, active && phase === 0);
    ctx.fillStyle = '#b7c6d4';
    lineText(ctx, 'Data / hipotesis / catatan', 57, 256, 235, 18);
    connector(ctx, [368, 264], [368, 167], '#aebdcb');
    connector(ctx, [368, 264], [715, 264], '#aebdcb');
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(385, 251);
    ctx.bezierCurveTo(456, 257, 452, 174, 520, 178);
    ctx.bezierCurveTo(582, 180, 589, 250, 699, 253);
    ctx.stroke();
    ctx.fillStyle = '#b7c6d4';
    lineText(ctx, 'Sketsa distribusi (tanpa nilai)', 367, 290, 355, 18);
  } else if (kind === 'research') {
    box(ctx, 40, 159, 206, 126, 'Bacaan', color, active && phase === 0);
    ctx.fillStyle = '#b7c6d4';
    lineText(ctx, 'Referensi / sumber', 55, 258, 180, 18);
    ['Pertanyaan', 'Metode', 'Catatan'].forEach((label, index) => {
      box(ctx, 288, 153 + index * 47, 434, 38, label, color, active && phase === index);
    });
    connector(ctx, [246, 219], [288, 219], color);
  }
}

export function createNameplateTexture(role, anisotropy = 1) {
  const { ctx, texture } = canvasTexture(512, 128, anisotropy, `nameplate_${role.key}`);
  if (role.agentId === null || role.agentId === '') {
    ctx.fillStyle = '#1e242b';
    ctx.fillRect(0, 0, 512, 128);
    texture.userData = { roleKey: role.key, name: '', job: '' };
    return texture;
  }
  ctx.fillStyle = '#fbfaf7';
  ctx.fillRect(0, 0, 512, 128);
  ctx.fillStyle = role.color;
  ctx.fillRect(0, 0, 14, 128);
  ctx.fillStyle = '#2b2a28';
  lineText(ctx, role.name, 40, 52, 450, 44, 700);
  ctx.fillStyle = '#6f6a62';
  lineText(ctx, role.role, 40, 92, 450, 26, 500);
  texture.userData = { roleKey: role.key, name: role.name, job: role.role };
  return texture;
}

export function createWorkstationScreens(role, anisotropy = 1) {
  const clock = canvasTexture(768, 480, anisotropy, `screen_clock_${role.key}`);
  const work = canvasTexture(768, 480, anisotropy, `screen_work_${role.key}`, true);
  const concept = WORK_SCHEMATICS[role.key];
  const lightAccent = tint(role.color, 0.62);
  let projection = projectWorkstationState(null, null);
  let statusKey = JSON.stringify(projection);
  let lastClockKey = null;
  let lastWorkKey = null;
  let clockTime = null;
  let elapsed = 0;
  let unmapped = false;

  function drawClock(time) {
    const key = `${time?.minuteKey || 'loading'}|${projection.connection}|${projection.stateLabel}|${unmapped ? 'standby' : projection.state === 'bekerja' ? 'app' : 'wall'}`;
    if (key === lastClockKey) return false;
    lastClockKey = key;
    const { ctx, texture } = clock;

    if (unmapped) {
      ctx.fillStyle = '#0a0c10';
      ctx.fillRect(0, 0, 768, 480);
      texture.userData = {
        roleKey: role.key,
        kind: 'clock',
        standby: true,
        stateLabel: 'Standby',
        connection: projection.connection
      };
      texture.needsUpdate = true;
      return true;
    }

    if (projection.fresh && projection.state === 'bekerja') {
      // Dark application window with role-specific illustration, not a process log.
      ctx.fillStyle = '#181b22';
      ctx.fillRect(0, 0, 768, 480);

      // Application header bar
      ctx.fillStyle = '#222733';
      ctx.fillRect(0, 0, 768, 52);

      // Window controls
      const lights = [
        ['#ff5f57', 26],
        ['#febc2e', 50],
        ['#28c840', 74]
      ];
      for (const [col, cx] of lights) {
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.arc(cx, 26, 7, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.textAlign = 'center';
      ctx.fillStyle = '#94a3b8';
      ctx.font = '600 18px ui-monospace, monospace';
      ctx.fillText(role.name, 384, 33);

      ctx.textAlign = 'left';
      ctx.fillStyle = '#a5b5c8';
      ctx.font = '600 20px system-ui, sans-serif';
      ctx.fillText('Tampilan ilustratif', 32, 102);
      ctx.fillStyle = lightAccent;
      ctx.font = '700 29px system-ui, sans-serif';
      ctx.fillText(concept.title, 32, 143, 704);
      schematic(ctx, concept.kind, lightAccent, 0, false);
      ctx.fillStyle = '#d2d9e0';
      ctx.font = '600 21px system-ui, sans-serif';
      ctx.fillText(projection.stateLabel, 32, 372);
      ctx.fillStyle = '#a5b5c8';
      ctx.font = '500 18px system-ui, sans-serif';
      ctx.fillText(time?.timeText || '--:--', 635, 372);

      // Role accent footer bar
      ctx.fillStyle = role.color;
      ctx.fillRect(0, 432, 768, 48);
      ctx.fillStyle = '#ffffff';
      ctx.font = '600 20px system-ui, sans-serif';
      ctx.fillText(`${role.role}`, 32, 463);
      ctx.textAlign = 'right';
      ctx.fillText('WIB', 736, 463);
      ctx.textAlign = 'left';
    } else {
      // Linear gradient from role color to warm cream matching kantor-agent reference
      ctx.textAlign = 'center';
      const gradient = ctx.createLinearGradient(0, 0, 768, 480);
      gradient.addColorStop(0, role.color);
      gradient.addColorStop(1, '#f3eee6');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 768, 480);

      // Large centered clock and concise subtitle matching kantor-agent layout
      ctx.fillStyle = '#ffffff';
      ctx.font = '600 120px system-ui, sans-serif';
      ctx.fillText(time?.timeText || '--:--', 384, 235);

      ctx.font = '500 34px system-ui, sans-serif';
      ctx.fillText(`${role.name} · ${projection.stateLabel}`, 384, 295);

      ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.font = '600 18px system-ui, sans-serif';
      ctx.fillText('WIB', 384, 340);
    }

    texture.userData = {
      roleKey: role.key,
      kind: 'clock',
      timeText: time?.timeText || '--:--',
      dateText: time?.dateText || '',
      stateLabel: projection.stateLabel,
      connection: projection.connection
    };
    texture.needsUpdate = true;
    return true;
  }

  function drawWork(phase, active) {
    const key = `${statusKey}|${unmapped ? 'standby' : active ? phase : 'static'}`;
    if (key === lastWorkKey) return false;
    lastWorkKey = key;
    const { ctx, texture } = work;
    if (unmapped) {
      ctx.fillStyle = '#0a0c10';
      ctx.fillRect(0, 0, 768, 480);
      texture.userData = {
        roleKey: role.key,
        kind: 'work',
        standby: true,
        stateLabel: 'Standby',
        connection: projection.connection
      };
      texture.needsUpdate = true;
      return true;
    }
    ctx.fillStyle = '#18212c';
    ctx.fillRect(0, 0, 768, 480);
    ctx.fillStyle = '#23303e';
    ctx.fillRect(0, 0, 768, 87);
    ctx.fillStyle = '#edf3f8';
    lineText(ctx, role.name, 38, 39, 250, 29, 700);
    lineText(ctx, role.role, 38, 70, 684, 21);
    ctx.fillStyle = lightAccent;
    lineText(ctx, concept.title, 40, 128, 688, 24, 600);
    schematic(ctx, concept.kind, lightAccent, phase, active);
    ctx.fillStyle = '#314153';
    ctx.fillRect(38, 309, 692, 1);
    ctx.fillStyle = '#bfcbd7';
    lineText(ctx, 'Tampilan ilustratif', 38, 339, 688, 22, 600);
    ctx.fillStyle = '#edf3f8';
    lineText(ctx, projection.stateLabel, 38, 378, 688, 27, 700);
    ctx.fillStyle = '#cbd5df';
    ctx.font = '500 22px system-ui, sans-serif';
    summaryLines(ctx, projection.task, 692).forEach((line, index) =>
      ctx.fillText(line, 38, 421 + index * 32, 692)
    );
    texture.userData = {
      roleKey: role.key,
      kind: 'work',
      concept: concept.title,
      illustrative: true,
      stateLabel: projection.stateLabel,
      connection: projection.connection,
      summary: projection.task,
      animated: active
    };
    texture.needsUpdate = true;
    return true;
  }

  drawClock(null);
  drawWork(0, false);
  return {
    clock: clock.texture,
    work: work.texture,
    concept,
    invalidateIdentity() {
      lastClockKey = null;
      lastWorkKey = null;
      drawClock(clockTime);
      drawWork(0, false);
    },
    setState(agent, snapshot) {
      unmapped = agent?.state === 'unmapped';
      const nextProjection = projectWorkstationState(agent, snapshot);
      const nextStatusKey = `${JSON.stringify(nextProjection)}|${unmapped}`;
      if (statusKey === nextStatusKey) return false;
      projection = nextProjection;
      statusKey = nextStatusKey;
      const clockChanged = drawClock(clockTime);
      const workChanged = drawWork(0, false);
      return clockChanged || workChanged;
    },
    update(delta, reducedMotion, timeSnapshot) {
      if (timeSnapshot) clockTime = timeSnapshot;
      elapsed += Math.max(0, delta);
      const active = projection.fresh && projection.state === 'bekerja' && !reducedMotion;
      const phase = active ? Math.floor(elapsed * 4) % 3 : 0;
      const clockChanged = drawClock(clockTime);
      const workChanged = drawWork(phase, active);
      return clockChanged || workChanged;
    },
    dispose() {
      clock.texture.dispose();
      work.texture.dispose();
    }
  };
}
