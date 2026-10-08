import * as THREE from 'three';

const WIDTH = 768;
const HEIGHT = 432;
const RACE_FRAME_INTERVAL = 1 / 10;
const TITLES = ['Lintasan Sunyi', 'Ruang Antara', 'Orbit Senja'];

function polygon(ctx, color, points) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i += 1) ctx.lineTo(points[i][0], points[i][1]);
  ctx.closePath();
  ctx.fill();
}

function drawArtwork(ctx, x, y, width, height, variant) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, width, height);
  ctx.clip();
  ctx.translate(x, y);
  ctx.fillStyle = '#183f43';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#d5be8a';
  ctx.beginPath();
  ctx.arc(width * (0.7 - variant * 0.12), height * 0.3, height * 0.15, 0, Math.PI * 2);
  ctx.fill();
  polygon(ctx, '#365e5b', [
    [0, height * 0.65],
    [width * 0.23, height * (0.28 + variant * 0.08)],
    [width * 0.53, height * 0.62],
    [width * 0.78, height * 0.36],
    [width, height * 0.57],
    [width, height],
    [0, height]
  ]);
  polygon(ctx, '#14282b', [
    [0, height * 0.8],
    [width * 0.35, height * 0.53],
    [width * 0.7, height * 0.85],
    [width, height * 0.66],
    [width, height],
    [0, height]
  ]);
  if (variant === 1) {
    ctx.fillStyle = '#c3ac7a';
    ctx.fillRect(width * 0.57, height * 0.47, width * 0.045, height * 0.23);
    ctx.fillStyle = '#14282b';
    ctx.fillRect(width * 0.575, height * 0.5, width * 0.035, height * 0.2);
  }
  ctx.restore();
}

function drawCatalog(ctx) {
  ctx.fillStyle = '#141414';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.fillStyle = '#e50914';
  ctx.font = '700 31px Arial, sans-serif';
  ctx.fillText('NETFLIX', 25, 41);
  ctx.fillStyle = '#eeeae1';
  ctx.font = '18px Arial, sans-serif';
  ctx.fillText('Katalog dekoratif', 576, 37);

  drawArtwork(ctx, 25, 63, 718, 204, 2);
  ctx.fillStyle = '#111b1e';
  ctx.fillRect(25, 63, 335, 204);
  ctx.fillStyle = '#eeeae1';
  ctx.font = '700 40px Arial, sans-serif';
  ctx.fillText('Orbit Senja', 45, 137);
  ctx.font = '18px Arial, sans-serif';
  ctx.fillText('Cerita fiksi untuk layar lounge.', 46, 175);
  ctx.fillStyle = '#c6c3bd';
  ctx.fillText('Artwork lokal, tanpa streaming.', 46, 204);

  ctx.fillStyle = '#eeeae1';
  ctx.font = '700 18px Arial, sans-serif';
  ctx.fillText('Pilihan lounge', 25, 294);
  TITLES.forEach((title, index) => {
    const x = 25 + index * 243;
    drawArtwork(ctx, x, 307, 232, 91, index);
    ctx.fillStyle = '#111b1e';
    ctx.fillRect(x, 373, 232, 25);
    ctx.fillStyle = '#eeeae1';
    ctx.font = '16px Arial, sans-serif';
    ctx.fillText(title, x + 10, 391);
  });
  ctx.fillStyle = '#c6c3bd';
  ctx.font = '15px Arial, sans-serif';
  ctx.fillText('Judul dan artwork fiksi. TV hanya dekorasi.', 25, 420);
}

function roadPoint(depth, curve) {
  return {
    x: WIDTH / 2 + curve * (1 - depth) ** 2,
    y: 147 + depth ** 1.5 * 285,
    halfWidth: 23 + depth ** 1.15 * 332
  };
}

function drawCar(ctx, x, y, scale, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.fillStyle = '#111518';
  ctx.fillRect(-43, -12, 15, 44);
  ctx.fillRect(28, -12, 15, 44);
  polygon(ctx, color, [
    [-34, -22],
    [-23, -53],
    [23, -53],
    [34, -22],
    [38, 29],
    [-38, 29]
  ]);
  polygon(ctx, '#23343c', [
    [-19, -45],
    [19, -45],
    [26, -22],
    [-26, -22]
  ]);
  ctx.fillStyle = '#d4d2c6';
  ctx.fillRect(-4, -20, 8, 34);
  ctx.fillStyle = '#141b20';
  ctx.fillRect(-30, 15, 60, 8);
  ctx.fillStyle = '#e7bd91';
  ctx.fillRect(-28, 10, 14, 4);
  ctx.fillRect(14, 10, 14, 4);
  ctx.restore();
}

function drawRace(ctx, sky, raceTime) {
  const curve = Math.sin(raceTime * 0.45) * 65;
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.fillStyle = '#d5be8a';
  ctx.beginPath();
  ctx.arc(597, 99, 25, 0, Math.PI * 2);
  ctx.fill();
  polygon(ctx, '#365e5b', [
    [0, 144],
    [95, 87],
    [184, 147],
    [301, 105],
    [422, 152],
    [557, 123],
    [669, 147],
    [768, 104],
    [768, 183],
    [0, 183]
  ]);
  ctx.fillStyle = '#14282b';
  ctx.fillRect(0, 154, WIDTH, HEIGHT - 154);

  for (let segment = 0; segment < 24; segment += 1) {
    const far = roadPoint(segment / 24, curve);
    const near = roadPoint((segment + 1) / 24, curve);
    polygon(ctx, '#333b3f', [
      [far.x - far.halfWidth, far.y],
      [far.x + far.halfWidth, far.y],
      [near.x + near.halfWidth, near.y],
      [near.x - near.halfWidth, near.y]
    ]);
    for (const side of [-1, 1]) {
      polygon(ctx, '#c9c8bd', [
        [far.x + side * far.halfWidth, far.y],
        [far.x + side * far.halfWidth * 1.08, far.y],
        [near.x + side * near.halfWidth * 1.08, near.y],
        [near.x + side * near.halfWidth, near.y]
      ]);
    }
  }

  for (let stripe = 0; stripe < 12; stripe += 1) {
    const depth = (stripe / 12 + raceTime * 0.2) % 1;
    const far = roadPoint(depth, curve);
    const near = roadPoint(Math.min(1, depth + 0.033), curve);
    for (const side of [-1, 1]) {
      polygon(ctx, '#8f3931', [
        [far.x + side * far.halfWidth, far.y],
        [far.x + side * far.halfWidth * 1.08, far.y],
        [near.x + side * near.halfWidth * 1.08, near.y],
        [near.x + side * near.halfWidth, near.y]
      ]);
    }
    for (const lane of [-1, 1]) {
      polygon(ctx, '#d4d2c6', [
        [far.x + (lane * far.halfWidth) / 3 - far.halfWidth * 0.009, far.y],
        [far.x + (lane * far.halfWidth) / 3 + far.halfWidth * 0.009, far.y],
        [near.x + (lane * near.halfWidth) / 3 + near.halfWidth * 0.009, near.y],
        [near.x + (lane * near.halfWidth) / 3 - near.halfWidth * 0.009, near.y]
      ]);
    }
  }

  const rivalDepth = 0.56 + Math.sin(raceTime * 0.35) * 0.035;
  const rival = roadPoint(rivalDepth, curve);
  drawCar(ctx, rival.x + rival.halfWidth * 0.44, rival.y, 0.4, '#d5be8a');
  drawCar(ctx, WIDTH / 2 + Math.sin(raceTime * 0.7) * 9, 363, 1.07, '#8f3931');

  ctx.fillStyle = '#111b1e';
  ctx.fillRect(0, 0, WIDTH, 55);
  ctx.fillRect(0, 407, WIDTH, 25);
  ctx.fillStyle = '#eeeae1';
  ctx.font = '700 26px Arial, sans-serif';
  ctx.fillText('Sirkuit Senja', 25, 37);
  ctx.font = '18px Arial, sans-serif';
  ctx.fillText('Animasi dekoratif', 568, 35);
  ctx.font = '15px Arial, sans-serif';
  ctx.fillText('Layar lounge, tanpa kontrol permainan.', 25, 425);
}

export function createTVScreen({ anisotropy = 1 } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('TV screen requires a 2D canvas context');

  const sky = ctx.createLinearGradient(0, 55, 0, 170);
  sky.addColorStop(0, '#183f43');
  sky.addColorStop(1, '#587873');
  drawCatalog(ctx);

  // The screen owns one texture; its caller owns the TV mesh and material.
  const texture = new THREE.CanvasTexture(canvas);
  texture.name = 'lounge_tv_screen';
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.anisotropy = Math.max(1, Number.isFinite(anisotropy) ? anisotropy : 1);

  let mode = 'catalog';
  let raceTime = 0;
  let lastTimeSeconds = null;
  let lastPaintSeconds = null;

  function update({ occupied = false, reducedMotion = false, timeSeconds = 0 } = {}) {
    const now = Number.isFinite(timeSeconds) ? Math.max(0, timeSeconds) : 0;
    const nextMode = occupied ? 'racing' : 'catalog';
    if (nextMode !== mode) {
      mode = nextMode;
      raceTime = 0;
      lastTimeSeconds = now;
      lastPaintSeconds = now;
      if (mode === 'racing') drawRace(ctx, sky, raceTime);
      else drawCatalog(ctx);
      texture.needsUpdate = true;
      return true;
    }
    if (mode === 'catalog') return false;
    if (reducedMotion) {
      lastTimeSeconds = now;
      return false;
    }

    // Clamp resume gaps so a paused tab or reduced-motion interval cannot fast-forward.
    raceTime += Math.min(0.25, Math.max(0, now - (lastTimeSeconds ?? now)));
    lastTimeSeconds = now;
    if (
      lastPaintSeconds !== null &&
      now >= lastPaintSeconds &&
      now - lastPaintSeconds < RACE_FRAME_INTERVAL
    )
      return false;

    drawRace(ctx, sky, raceTime);
    lastPaintSeconds = now;
    texture.needsUpdate = true;
    return true;
  }

  return {
    texture,
    update,
    get mode() {
      return mode;
    },
    dispose() {
      texture.dispose();
    }
  };
}
