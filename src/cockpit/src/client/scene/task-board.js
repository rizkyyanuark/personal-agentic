import * as THREE from 'three';
import { projectTaskBoard } from '../../shared/task-board-contract.js';

const HAND = '"Patrick Hand", "Chalkboard SE", "Comic Sans MS", "Segoe Print", cursive';

const syncFormatter = new Intl.DateTimeFormat('id-ID', {
  timeZone: 'Asia/Jakarta',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23'
});

export function createTaskBoard({ anisotropy = 1 } = {}) {
  const group = new THREE.Group();
  group.name = 'task_board';

  const frameMaterial = new THREE.MeshStandardMaterial({
    color: 0xb9bec6,
    roughness: 0.45,
    metalness: 0.5
  });
  for (const [width, height, x, y] of [
    [5.16, 0.06, 0, 1.17],
    [5.16, 0.06, 0, -1.17],
    [0.06, 2.4, -2.55, 0],
    [0.06, 2.4, 2.55, 0]
  ]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(width, height, 0.06), frameMaterial);
    rail.position.set(x, y, 0.05);
    group.add(rail);
  }

  // Bottom aluminum marker pen tray
  const tray = new THREE.Mesh(
    new THREE.BoxGeometry(2.8, 0.04, 0.09),
    new THREE.MeshStandardMaterial({ color: 0xa8adb5, roughness: 0.4, metalness: 0.6 })
  );
  tray.position.set(0, -2.45 / 2 - 0.02, 0.06);
  group.add(tray);

  // 3 Colored whiteboard markers (Blue, Red, Green) resting on the tray
  const markerColors = [0x2f5bd3, 0xd64545, 0x23a55f];
  markerColors.forEach((color, i) => {
    const marker = new THREE.Mesh(
      new THREE.CylinderGeometry(0.014, 0.014, 0.13, 8),
      new THREE.MeshStandardMaterial({ color, roughness: 0.5 })
    );
    marker.rotation.z = Math.PI / 2;
    marker.position.set(-0.25 + i * 0.25, -2.45 / 2 + 0.02, 0.065);
    group.add(marker);
  });

  const canvas = document.createElement('canvas');
  canvas.width = 2048;
  canvas.height = 928;
  const ctx = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = anisotropy;

  const face = new THREE.Mesh(
    new THREE.PlaneGeometry(5.04, 2.29),
    new THREE.MeshBasicMaterial({ map: texture, toneMapped: false })
  );
  face.position.z = 0.042;
  group.add(face);

  let lastSignature = '';

  function fit(context, text, maxW) {
    let t = String(text || '');
    if (context.measureText(t).width <= maxW) return t;
    while (t.length && context.measureText(`${t}…`).width > maxW) t = t.slice(0, -1);
    return `${t}…`;
  }

  function wrap(context, text, x, y, maxW, lh, maxLines) {
    const words = String(text || '').split(/\s+/);
    let line = '';
    let n = 0;
    for (let i = 0; i < words.length; i++) {
      const test = line ? `${line} ${words[i]}` : words[i];
      if (context.measureText(test).width > maxW && line) {
        n++;
        if (n === maxLines) {
          context.fillText(fit(context, `${line} ${words.slice(i).join(' ')}`, maxW), x, y);
          return y + lh;
        }
        context.fillText(line, x, y);
        y += lh;
        line = words[i];
      } else line = test;
    }
    if (line) context.fillText(line, x, y);
    return y;
  }

  function setState(state) {
    const board = projectTaskBoard(state);
    const signature = JSON.stringify(board);
    if (signature === lastSignature) return false;
    lastSignature = signature;
    group.userData.board = board;

    const W = 2048;
    const H = 928;
    ctx.fillStyle = '#fbfbf9';
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = '#2b2a28';
    ctx.font = `76px ${HAND}`;
    ctx.fillText('Papan Tugas', 40, 84);

    const syncTime = board.updatedAt
      ? syncFormatter.format(new Date(board.updatedAt)).slice(0, 5)
      : 'Belum tersinkron';
    ctx.font = `36px ${HAND}`;
    ctx.fillStyle = '#6f6a62';
    ctx.fillText(`Snapshot · diperbarui ${syncTime}`, 440, 76);

    const noteColors = {
      planning: '#fff1a8',
      running: '#cfe0ff',
      qa: '#ffd8b5',
      completed: '#dff1e3'
    };
    const barColors = {
      planning: '#2b2a28',
      running: '#2f5bd3',
      qa: '#d9772f',
      completed: '#23a55f'
    };
    const cols = board.columns;
    const colW = (W - 80) / 4;

    cols.forEach((col, i) => {
      const x = 40 + i * colW;
      ctx.strokeStyle = '#d6cdc0';
      ctx.lineWidth = 3;
      if (i) {
        ctx.beginPath();
        ctx.moveTo(x - 6, 110);
        ctx.lineTo(x - 6, H - 30);
        ctx.stroke();
      }

      const count = typeof col.value === 'number' && col.value > 0 ? col.value : 0;
      ctx.fillStyle = '#2b2a28';
      ctx.font = `52px ${HAND}`;
      wrap(
        ctx,
        `${col.label} (${col.value === null ? '—' : count})`,
        x + 10,
        158,
        colW - 20,
        55,
        2
      );

      const nw = 222;
      const nh = 168;
      if (col.value === null) {
        ctx.font = `32px ${HAND}`;
        wrap(ctx, 'Belum tersedia', x + 10, 260, colW - 30, 38, 2);
      }
      const numVisible = count > 0 ? 1 : 0;
      for (let k = 0; k < numVisible; k++) {
        const nx = x + 10;
        const ny = 190;
        ctx.save();
        ctx.translate(nx + nw / 2, ny + nh / 2);
        ctx.rotate((((i * 31) % 11) - 5) * 0.012);
        ctx.fillStyle = 'rgba(0,0,0,.12)';
        ctx.fillRect(-nw / 2 + 4, -nh / 2 + 6, nw, nh);
        ctx.fillStyle = noteColors[col.key] || '#fff1a8';
        ctx.fillRect(-nw / 2, -nh / 2, nw, nh);
        ctx.fillStyle = '#2b2a28';
        ctx.font = `48px ${HAND}`;
        ctx.fillText(String(count), -nw / 2 + 14, -nh / 2 + 48);
        ctx.font = `30px ${HAND}`;
        wrap(ctx, col.detail, -nw / 2 + 14, -nh / 2 + 84, nw - 26, 30, 2);
        ctx.fillStyle = barColors[col.key] || '#2b2a28';
        ctx.fillRect(-nw / 2 + 12, nh / 2 - 16, nw - 24, 6);
        ctx.restore();
      }
    });

    texture.needsUpdate = true;
    return true;
  }

  setState(null);
  return { group, setState };
}
