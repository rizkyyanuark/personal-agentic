import * as THREE from 'three';

export function createDeskPropAssets() {
  const assets = {
    box: new THREE.BoxGeometry(1, 1, 1),
    headband: new THREE.TorusGeometry(0.087, 0.012, 6, 18, Math.PI),
    paper: new THREE.MeshStandardMaterial({ color: 0xf3eee3, roughness: 0.96 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x242d34, roughness: 0.85 })
  };
  return {
    ...assets,
    dispose() {
      Object.values(assets).forEach((resource) => resource.dispose());
    }
  };
}

function box(parent, assets, material, size, position) {
  const mesh = new THREE.Mesh(assets.box, material);
  mesh.scale.set(...size);
  mesh.position.set(...position);
  parent.add(mesh);
  return mesh;
}

function notebook(parent, assets, accent, x = -0.77, z = 0.12) {
  const book = new THREE.Group();
  book.position.set(x, 0.783, z);
  book.rotation.y = -0.08;
  box(book, assets, accent, [0.245, 0.036, 0.275], [0, 0.018, 0]);
  box(book, assets, assets.paper, [0.225, 0.018, 0.255], [0.007, 0.018, 0]);
  box(book, assets, accent, [0.245, 0.008, 0.275], [0, 0.04, 0]);
  box(book, assets, assets.dark, [0.009, 0.003, 0.258], [0.084, 0.046, 0]);
  parent.add(book);
}

function paperTexture(kind) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 320;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#f3eee3';
  ctx.fillRect(0, 0, 256, 320);
  ctx.fillStyle = '#34443b';
  ctx.font = '600 24px system-ui, sans-serif';
  ctx.fillText(kind === 'clipboard' ? 'Checklist' : 'Sketsa', 22, 39);
  ctx.strokeStyle = '#59675e';
  ctx.lineWidth = 2;
  if (kind === 'clipboard') {
    ctx.font = '500 20px system-ui, sans-serif';
    ['Data', 'Metrik', 'Risiko', 'Replikasi'].forEach((label, index) => {
      const y = 88 + index * 56;
      ctx.strokeRect(24, y - 18, 20, 20);
      ctx.fillText(label, 58, y);
    });
  } else {
    for (const [x, y] of [
      [98, 80],
      [43, 182],
      [151, 182]
    ])
      ctx.strokeRect(x, y, 54, 44);
    ctx.beginPath();
    ctx.moveTo(125, 124);
    ctx.lineTo(125, 154);
    ctx.lineTo(70, 154);
    ctx.lineTo(70, 182);
    ctx.moveTo(125, 154);
    ctx.lineTo(178, 154);
    ctx.lineTo(178, 182);
    ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.name = `desk_${kind}_illustrative`;
  return texture;
}

export function createDeskProps(role, assets, accent) {
  const group = new THREE.Group();
  group.name = `desk_props_${role.key}`;
  const textures = [];
  const materials = [];
  const geometries = [];
  const kinds = [];
  const paperCard = (kind, x, z, width, depth, y) => {
    const texture = paperTexture(kind);
    const material = new THREE.MeshBasicMaterial({ map: texture, toneMapped: false });
    const geometry = new THREE.PlaneGeometry(width, depth);
    const card = new THREE.Mesh(geometry, material);
    card.position.set(x, y, z);
    card.rotation.x = -Math.PI / 2;
    textures.push(texture);
    materials.push(material);
    geometries.push(geometry);
    group.add(card);
  };
  switch (role.key) {
    case 'data_engineer':
      notebook(group, assets, accent);
      kinds.push('notebook');
      break;
    case 'data_scientist':
      notebook(group, assets, accent, -0.77, 0.1);
      paperCard('diagram', 0.78, -0.2, 0.22, 0.275, 0.787);
      kinds.push('book', 'diagram-card');
      break;
    case 'research_scientist':
      for (let index = 0; index < 3; index++) {
        const paper = box(
          group,
          assets,
          assets.paper,
          [0.24, 0.006, 0.28],
          [-0.77, 0.786 + index * 0.006, 0.12]
        );
        paper.rotation.y = index === 1 ? 0.07 : -0.04;
      }
      box(group, assets, accent, [0.017, 0.003, 0.21], [-0.72, 0.803, 0.16]);
      kinds.push('papers', 'bookmark');
      break;
    case 'ml_engineer': {
      const headphones = new THREE.Group();
      headphones.position.set(-0.76, 0.809, 0.16);
      const band = new THREE.Mesh(assets.headband, assets.dark);
      band.rotation.x = -Math.PI / 2;
      headphones.add(band);
      for (const side of [-1, 1])
        box(headphones, assets, accent, [0.044, 0.05, 0.07], [side * 0.086, 0, 0]);
      group.add(headphones);
      kinds.push('headphones');
      break;
    }
    default:
      throw new RangeError(`No approved desk props for ${role.key}`);
  }
  group.userData.propKinds = kinds;
  return {
    group,
    dispose() {
      textures.forEach((texture) => texture.dispose());
      materials.forEach((material) => material.dispose());
      geometries.forEach((geometry) => geometry.dispose());
    }
  };
}
