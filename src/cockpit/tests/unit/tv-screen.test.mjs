import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { createTVScreen } from '../../src/client/scene/tv-screen.js';

function installCanvasStub(t, { contextAvailable = true } = {}) {
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const canvases = [];
  const frames = [];
  const gradients = [];
  let currentFrame = null;
  const ctx = { fillStyle: '', font: '' };

  function record(method, args) {
    if (method === 'fillRect' && args.join(',') === '0,0,768,432') {
      currentFrame = [];
      frames.push(currentFrame);
    }
    if (!currentFrame) return;
    const fillStyle = typeof ctx.fillStyle === 'string' ? ctx.fillStyle : 'sky-gradient';
    currentFrame.push({ method, args: [...args], fillStyle, font: ctx.font });
  }

  for (const method of [
    'save',
    'restore',
    'beginPath',
    'closePath',
    'rect',
    'clip',
    'translate',
    'scale',
    'fillRect',
    'arc',
    'fill',
    'fillText',
    'moveTo',
    'lineTo'
  ]) {
    ctx[method] = (...args) => record(method, args);
  }
  ctx.createLinearGradient = (...args) => {
    const gradient = { args, stops: [] };
    gradient.addColorStop = (offset, color) => gradient.stops.push([offset, color]);
    gradients.push(gradient);
    return gradient;
  };

  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      createElement(tag) {
        assert.equal(tag, 'canvas');
        const canvas = {
          width: 0,
          height: 0,
          getContext(kind) {
            assert.equal(kind, '2d');
            return contextAvailable ? ctx : null;
          }
        };
        canvases.push(canvas);
        return canvas;
      }
    }
  });
  t.after(() => {
    if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument);
    else delete globalThis.document;
  });

  return { canvases, frames, gradients };
}

function labels(frame) {
  return frame.filter((operation) => operation.method === 'fillText').map(({ args }) => args[0]);
}

test('TV owns one persistent 768x432 sRGB texture with explicit sampling', (t) => {
  const stub = installCanvasStub(t);
  const screen = createTVScreen({ anisotropy: 4 });
  const texture = screen.texture;
  assert.equal(texture.isCanvasTexture, true);
  assert.equal(texture.image, stub.canvases[0]);
  assert.equal(texture.image.width, 768);
  assert.equal(texture.image.height, 432);
  assert.equal(texture.colorSpace, THREE.SRGBColorSpace);
  assert.equal(texture.wrapS, THREE.ClampToEdgeWrapping);
  assert.equal(texture.wrapT, THREE.ClampToEdgeWrapping);
  assert.equal(texture.minFilter, THREE.LinearFilter);
  assert.equal(texture.magFilter, THREE.LinearFilter);
  assert.equal(texture.generateMipmaps, false);
  assert.equal(texture.anisotropy, 4);

  for (const occupied of [true, false, true, false]) {
    assert.equal(screen.update({ occupied, timeSeconds: 1 }), true);
    assert.equal(screen.texture, texture);
    assert.equal(screen.texture.image, stub.canvases[0]);
  }
  assert.equal(stub.canvases.length, 1);
  assert.equal(stub.gradients.length, 1);
});

test('empty sofa catalog switches to racing and returns to a labeled catalog', (t) => {
  const { frames } = installCanvasStub(t);
  const screen = createTVScreen();
  assert.equal(screen.mode, 'catalog');
  assert(labels(frames.at(-1)).includes('Katalog dekoratif'));
  assert(labels(frames.at(-1)).includes('Judul dan artwork fiksi. TV hanya dekorasi.'));

  assert.equal(screen.update({ occupied: true, timeSeconds: 5 }), true);
  assert.equal(screen.mode, 'racing');
  assert(labels(frames.at(-1)).includes('Animasi dekoratif'));
  assert(labels(frames.at(-1)).includes('Layar lounge, tanpa kontrol permainan.'));

  assert.equal(screen.update({ occupied: false, timeSeconds: 5.01 }), true);
  assert.equal(screen.mode, 'catalog');
  assert.equal(frames.length, 3);
  assert(labels(frames.at(-1)).includes('Katalog dekoratif'));
});

test('unchanged empty occupancy never repaints the catalog or uploads its texture', (t) => {
  const { frames } = installCanvasStub(t);
  const screen = createTVScreen();
  const version = screen.texture.version;
  const initialFrame = structuredClone(frames[0]);
  for (const timeSeconds of [0, 0.1, 1, 3600]) {
    for (const reducedMotion of [false, true]) {
      assert.equal(screen.update({ occupied: false, timeSeconds, reducedMotion }), false);
    }
  }
  assert.equal(screen.texture.version, version);
  assert.equal(frames.length, 1);
  assert.deepEqual(frames[0], initialFrame);
});

test('racing paints no more than ten animation frames per second', (t) => {
  const { frames } = installCanvasStub(t);
  const screen = createTVScreen();
  assert.equal(screen.update({ occupied: true, timeSeconds: 0 }), true);
  const paintedAt = [0];

  for (let step = 1; step <= 120; step += 1) {
    const timeSeconds = step / 120;
    const version = screen.texture.version;
    const frameCount = frames.length;
    const changed = screen.update({ occupied: true, timeSeconds });
    assert.equal(screen.texture.version, version + Number(changed));
    assert.equal(frames.length, frameCount + Number(changed));
    if (changed) paintedAt.push(timeSeconds);
  }

  assert(paintedAt.length > 1, 'racing must actually repaint when motion is enabled');
  assert(paintedAt.length <= 11, 'mode entry plus at most ten subsequent animation paints');
  for (let index = 1; index < paintedAt.length; index += 1) {
    assert(paintedAt[index] - paintedAt[index - 1] >= 0.1 - 1e-12);
  }
});

test('reduced motion freezes the already painted racing frame exactly', (t) => {
  const { frames } = installCanvasStub(t);
  const screen = createTVScreen();
  screen.update({ occupied: true, timeSeconds: 0 });
  assert.equal(screen.update({ occupied: true, timeSeconds: 0.2 }), true);
  const version = screen.texture.version;
  const frameCount = frames.length;
  const frozenFrame = structuredClone(frames.at(-1));

  for (const timeSeconds of [1, 10, 100]) {
    assert.equal(screen.update({ occupied: true, reducedMotion: true, timeSeconds }), false);
    assert.equal(screen.mode, 'racing');
    assert.equal(screen.texture.version, version);
    assert.equal(frames.length, frameCount);
    assert.deepEqual(frames.at(-1), frozenFrame);
  }
});

test('reduced motion still paints occupancy transitions but no racing animation', (t) => {
  const { frames } = installCanvasStub(t);
  const screen = createTVScreen();
  assert.equal(screen.update({ occupied: true, reducedMotion: true, timeSeconds: 12 }), true);
  assert.equal(screen.mode, 'racing');
  const firstRaceFrame = structuredClone(frames.at(-1));
  assert.equal(screen.update({ occupied: true, reducedMotion: true, timeSeconds: 99 }), false);
  assert.deepEqual(frames.at(-1), firstRaceFrame);
  assert.equal(screen.update({ occupied: false, reducedMotion: true, timeSeconds: 100 }), true);
  assert.equal(screen.mode, 'catalog');
  assert(labels(frames.at(-1)).includes('Katalog dekoratif'));
  assert.equal(frames.length, 3);
});

test('a long resume gap advances only the same quarter-second as a short reference update', (t) => {
  const { frames } = installCanvasStub(t);
  const resumed = createTVScreen();
  resumed.update({ occupied: true, timeSeconds: 0 });
  assert.equal(resumed.update({ occupied: true, timeSeconds: 600 }), true);
  const resumedFrame = structuredClone(frames.at(-1));

  const reference = createTVScreen();
  reference.update({ occupied: true, timeSeconds: 0 });
  assert.equal(reference.update({ occupied: true, timeSeconds: 0.25 }), true);
  assert.deepEqual(frames.at(-1), resumedFrame);
});

test('screen disposal dispatches once for its only owned texture', (t) => {
  installCanvasStub(t);
  const screen = createTVScreen();
  let disposals = 0;
  screen.texture.addEventListener('dispose', () => disposals++);
  screen.dispose();
  assert.equal(disposals, 1);
});

test('missing canvas context fails explicitly rather than constructing a blank texture', (t) => {
  const { frames } = installCanvasStub(t, { contextAvailable: false });
  assert.throws(() => createTVScreen(), /TV screen requires a 2D canvas context/);
  assert.equal(frames.length, 0);
});
