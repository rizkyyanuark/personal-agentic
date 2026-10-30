import * as THREE from 'three';
import { CHARACTER_CONFIGS } from './office-layout.js';
import { CHARACTER_RIG } from './seating-contract.js';
import { allocateCharacterSeats } from './seat-registry.js';
import { applyCharacterPose } from './character-pose.js';

export const CHARACTER_LOOKS = {
  hq_lab_director: {
    pants: 0x30353e,
    skin: 0xb97d52,
    hair: 0x211913,
    style: 'side',
    prop: 'tablet'
  },
  data_engineer: {
    pants: 0x363d48,
    skin: 0x8d5a3b,
    hair: 0x17110e,
    style: 'glasses',
    prop: 'mug'
  },
  data_scientist: {
    pants: 0x3a4150,
    skin: 0xc68a5e,
    hair: 0x2a211c,
    style: 'glasses',
    prop: 'chart'
  },
  research_scientist: {
    pants: 0x303542,
    skin: 0xd6a07a,
    hair: 0x3b2a1f,
    style: 'bun',
    prop: 'book'
  },
  ml_engineer: {
    pants: 0x2e333d,
    skin: 0xa86e45,
    hair: 0x191310,
    style: 'headphones',
    prop: 'mug'
  }
};

function part(group, geometry, material, position, shadow = false) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...position);
  mesh.castShadow = shadow;
  group.add(mesh);
  return mesh;
}

export function createGuitarMesh() {
  const g = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0xb8743b, roughness: 0.5 });
  const darkWood = new THREE.MeshStandardMaterial({ color: 0x3b2314, roughness: 0.6 });
  const neckWood = new THREE.MeshStandardMaterial({ color: 0x633919, roughness: 0.5 });
  const fretWood = new THREE.MeshStandardMaterial({ color: 0x231710, roughness: 0.7 });
  const holeMat = new THREE.MeshBasicMaterial({ color: 0x18110b });
  const pegMat = new THREE.MeshStandardMaterial({
    color: 0xd8dce2,
    roughness: 0.3,
    metalness: 0.8
  });

  // 1. Lower bout (wide resonant body base)
  const lowerBout = new THREE.Mesh(new THREE.SphereGeometry(0.13, 20, 14), wood);
  lowerBout.scale.set(1.1, 1.22, 0.36);
  lowerBout.position.set(0.09, 0, 0);

  // 2. Upper bout (waist and upper curves)
  const upperBout = new THREE.Mesh(new THREE.SphereGeometry(0.1, 18, 12), wood);
  upperBout.scale.set(0.95, 1.02, 0.34);
  upperBout.position.set(-0.07, 0, 0);

  // 3. Soundhole (dark inlaid circular aperture)
  const soundhole = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.038, 0.005, 18), holeMat);
  soundhole.rotation.x = Math.PI / 2;
  soundhole.position.set(-0.02, 0, 0.065);

  // 4. Bridge & saddle on lower bout face
  const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.075, 0.012), darkWood);
  bridge.position.set(0.14, 0, 0.065);

  // 5. Neck (straight shaft centered on X axis, extends from -0.16 to -0.60)
  const neck = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.038, 0.024), neckWood);
  neck.position.set(-0.38, 0, 0.01);

  // 6. Fretboard (dark rosewood strip on top of neck)
  const fretboard = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.04, 0.006), fretWood);
  fretboard.position.set(-0.37, 0, 0.024);

  // 7. Headstock (seamless continuation of neck from -0.59 to -0.71)
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.055, 0.026), darkWood);
  head.position.set(-0.65, 0, 0.012);

  // 8. Tuning Pegs (4 metal knobs directly on the headstock)
  const pegGeo = new THREE.CylinderGeometry(0.006, 0.006, 0.016, 8);
  const p1 = new THREE.Mesh(pegGeo, pegMat);
  p1.position.set(-0.68, 0.032, 0.012);
  const p2 = new THREE.Mesh(pegGeo, pegMat);
  p2.position.set(-0.62, 0.032, 0.012);
  const p3 = new THREE.Mesh(pegGeo, pegMat);
  p3.position.set(-0.68, -0.032, 0.012);
  const p4 = new THREE.Mesh(pegGeo, pegMat);
  p4.position.set(-0.62, -0.032, 0.012);

  g.add(lowerBout, upperBout, soundhole, bridge, neck, fretboard, head, p1, p2, p3, p4);
  return g;
}

export function createCharactersScene() {
  const charactersGroup = new THREE.Group();
  const characterEntities = {};

  const headShape = new THREE.SphereGeometry(0.24, 12, 10);
  const eyeShape = new THREE.SphereGeometry(0.022, 6, 6);
  const torsoShape = new THREE.CapsuleGeometry(0.26, 0.36, 4, 10);
  const armUpperShape = new THREE.CapsuleGeometry(0.08, CHARACTER_RIG.armLength - 0.16, 3, 8);
  const armLowerShape = new THREE.CapsuleGeometry(0.075, CHARACTER_RIG.armLength - 0.15, 3, 8);
  const legThighShape = new THREE.CapsuleGeometry(0.1, CHARACTER_RIG.thighLength - 0.2, 3, 8);
  const legCalfShape = new THREE.CapsuleGeometry(0.09, CHARACTER_RIG.shinLength - 0.18, 3, 8);
  const shoeShape = new THREE.BoxGeometry(0.16, 0.1, 0.28);
  const darkShoe = new THREE.MeshBasicMaterial({ color: 0x222428 });
  const darkMetal = new THREE.MeshStandardMaterial({ color: 0x2b2e34, roughness: 0.5 });

  CHARACTER_CONFIGS.forEach((cfg) => {
    const look = CHARACTER_LOOKS[cfg.key];
    const shirtMat = new THREE.MeshStandardMaterial({ color: cfg.color, roughness: 0.85 });
    const pantsMat = new THREE.MeshStandardMaterial({ color: look.pants, roughness: 0.9 });
    const skinMat = new THREE.MeshStandardMaterial({ color: look.skin, roughness: 0.9 });
    const hairMat = new THREE.MeshStandardMaterial({ color: look.hair, roughness: 0.95 });

    const root = new THREE.Group();
    root.name = `character_${cfg.key}`;
    root.userData.roleKey = cfg.key;
    root.position.fromArray(cfg.home.position);
    root.rotation.y = cfg.home.heading;

    const hips = new THREE.Group();
    hips.position.y = 0;
    root.add(hips);

    // Torso & Pelvis
    const pelvis = part(hips, new THREE.BoxGeometry(0.42, 0.2, 0.32), pantsMat, [0, 0, 0]);
    part(hips, torsoShape, shirtMat, [0, 0.42, 0], true);

    // Neck & Head
    part(hips, new THREE.CylinderGeometry(0.09, 0.1, 0.14, 8), skinMat, [0, 0.72, 0]);
    const head = new THREE.Group();
    head.position.set(0, 0.94, 0.02);
    hips.add(head);
    part(head, headShape, skinMat, [0, 0, 0], true);

    // Hair
    const hair = new THREE.Mesh(headShape, hairMat);
    hair.scale.set(1.04, 1.04, 1.04);
    hair.position.set(0, 0.04, -0.02);
    head.add(hair);

    if (look.style === 'bun') {
      part(head, new THREE.SphereGeometry(0.12, 8, 8), hairMat, [0, 0.22, -0.16]);
    } else if (look.style === 'side') {
      const bang = part(head, new THREE.BoxGeometry(0.32, 0.1, 0.15), hairMat, [-0.05, 0.18, 0.16]);
      bang.rotation.z = -0.2;
    }

    // Eyes
    part(head, eyeShape, darkShoe, [-0.07, 0.02, 0.22]);
    part(head, eyeShape, darkShoe, [0.07, 0.02, 0.22]);

    // Accessories
    if (look.style === 'glasses') {
      const glassFrame = new THREE.Group();
      part(glassFrame, new THREE.TorusGeometry(0.042, 0.007, 4, 12), darkShoe, [-0.07, 0.02, 0.23]);
      part(glassFrame, new THREE.TorusGeometry(0.042, 0.007, 4, 12), darkShoe, [0.07, 0.02, 0.23]);
      part(glassFrame, new THREE.BoxGeometry(0.06, 0.008, 0.008), darkShoe, [0, 0.02, 0.23]);
      head.add(glassFrame);
    } else if (look.style === 'headphones') {
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.016, 6, 16), darkMetal);
      band.position.set(0, 0.04, 0);
      band.rotation.x = Math.PI / 2;
      head.add(band);
      part(
        head,
        new THREE.CylinderGeometry(0.08, 0.08, 0.05, 12),
        darkShoe,
        [-0.25, 0, 0]
      ).rotation.z = Math.PI / 2;
      part(
        head,
        new THREE.CylinderGeometry(0.08, 0.08, 0.05, 12),
        darkShoe,
        [0.25, 0, 0]
      ).rotation.z = Math.PI / 2;
    }

    // =======================================================================
    // Arms (Pivoted at shoulders)
    // =======================================================================
    const leftArm = new THREE.Group();
    leftArm.position.set(-0.28, 0.54, 0);
    hips.add(leftArm);
    part(leftArm, armUpperShape, shirtMat, [0, -CHARACTER_RIG.armLength / 2, 0]);
    const leftForearm = new THREE.Group();
    leftForearm.position.set(0, -CHARACTER_RIG.armLength, 0);
    leftArm.add(leftForearm);
    part(leftForearm, armLowerShape, shirtMat, [0, -CHARACTER_RIG.armLength / 2, 0]);
    const leftHand = part(leftForearm, new THREE.SphereGeometry(0.07, 6, 6), skinMat, [
      0,
      -CHARACTER_RIG.armLength,
      0
    ]);

    const rightArm = new THREE.Group();
    rightArm.position.set(0.28, 0.54, 0);
    hips.add(rightArm);
    part(rightArm, armUpperShape, shirtMat, [0, -CHARACTER_RIG.armLength / 2, 0]);
    const rightForearm = new THREE.Group();
    rightForearm.position.set(0, -CHARACTER_RIG.armLength, 0);
    rightArm.add(rightForearm);
    part(rightForearm, armLowerShape, shirtMat, [0, -CHARACTER_RIG.armLength / 2, 0]);
    const rightHand = part(rightForearm, new THREE.SphereGeometry(0.07, 6, 6), skinMat, [
      0,
      -CHARACTER_RIG.armLength,
      0
    ]);

    // Handheld Props
    // 1. Mug attached to right hand
    const handMug = new THREE.Group();
    const mugBody = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.035, 0.09, 12),
      new THREE.MeshStandardMaterial({ color: cfg.color, roughness: 0.4 })
    );
    mugBody.position.set(0, 0.04, 0);
    handMug.add(mugBody);
    handMug.position.set(0, -CHARACTER_RIG.armLength, 0.06);
    handMug.visible = false;
    rightForearm.add(handMug);

    // 2. Gamepad attached to hands
    const handPad = new THREE.Group();
    part(handPad, new THREE.BoxGeometry(0.18, 0.04, 0.1), darkShoe, [0, 0, 0]);
    handPad.position.set(0, 0.28, 0.28);
    handPad.rotation.x = -0.6;
    handPad.visible = false;
    hips.add(handPad);

    // 3. Book attached to hands
    const handBook = new THREE.Group();
    part(
      handBook,
      new THREE.BoxGeometry(0.2, 0.26, 0.03),
      new THREE.MeshStandardMaterial({ color: 0x3f6fd1, roughness: 0.7 }),
      [0, 0, 0]
    );
    handBook.position.set(0, 0.32, 0.26);
    handBook.rotation.x = -0.9;
    handBook.visible = false;
    hips.add(handBook);

    // 4. Tablet for Director
    const handTablet = new THREE.Group();
    part(handTablet, new THREE.BoxGeometry(0.28, 0.2, 0.015), darkShoe, [0, 0, 0]);
    part(
      handTablet,
      new THREE.PlaneGeometry(0.25, 0.17),
      new THREE.MeshBasicMaterial({ color: 0xdde8fa }),
      [0, 0, 0.009]
    );
    handTablet.position.set(0, 0.34, 0.28);
    handTablet.rotation.x = -0.85;
    handTablet.visible = cfg.key === 'hq_lab_director';
    hips.add(handTablet);

    // 5. Acoustic guitar attached to spine/torso
    const handGuitar = createGuitarMesh();
    handGuitar.position.set(0.04, 0.22, 0.22);
    handGuitar.rotation.set(-0.12, 0.18, -0.52);
    handGuitar.visible = false;
    hips.add(handGuitar);

    // =======================================================================
    // Legs (Pivoted at hips)
    // =======================================================================
    const leftLeg = new THREE.Group();
    leftLeg.position.set(-0.14, 0, 0);
    hips.add(leftLeg);
    const leftThigh = part(leftLeg, legThighShape, pantsMat, [
      0,
      -CHARACTER_RIG.thighLength / 2,
      0
    ]);
    const leftCalf = new THREE.Group();
    leftCalf.position.set(0, -CHARACTER_RIG.thighLength, 0);
    leftLeg.add(leftCalf);
    part(leftCalf, legCalfShape, pantsMat, [0, -CHARACTER_RIG.shinLength / 2, 0]);
    const leftShoe = part(leftCalf, shoeShape, darkShoe, [0, -CHARACTER_RIG.shinLength, 0.06]);

    const rightLeg = new THREE.Group();
    rightLeg.position.set(0.14, 0, 0);
    hips.add(rightLeg);
    const rightThigh = part(rightLeg, legThighShape, pantsMat, [
      0,
      -CHARACTER_RIG.thighLength / 2,
      0
    ]);
    const rightCalf = new THREE.Group();
    rightCalf.position.set(0, -CHARACTER_RIG.thighLength, 0);
    rightLeg.add(rightCalf);
    part(rightCalf, legCalfShape, pantsMat, [0, -CHARACTER_RIG.shinLength / 2, 0]);
    const rightShoe = part(rightCalf, shoeShape, darkShoe, [0, -CHARACTER_RIG.shinLength, 0.06]);

    root.traverse((o) => {
      if (o.isMesh) {
        o.userData.roleKey = cfg.key;
      }
    });

    charactersGroup.add(root);

    characterEntities[cfg.key] = {
      cfg,
      root,
      hips,
      pelvis,
      head,
      leftArm,
      rightArm,
      leftForearm,
      rightForearm,
      leftLeg,
      rightLeg,
      leftThigh,
      rightThigh,
      leftCalf,
      rightCalf,
      leftHand,
      rightHand,
      leftShoe,
      rightShoe,
      handMug,
      handPad,
      handBook,
      handTablet,
      handGuitar,
      state: 'offline',
      seat: null
    };
  });

  updateCharacterAnimations(characterEntities, 0, true);
  return { charactersGroup, characterEntities };
}

export function updateCharacterAnimations(
  entities,
  elapsedTime = 0,
  reduceMotion = false,
  { allowIdleSeating = true } = {}
) {
  const assignments = allocateCharacterSeats(entities, { allowIdleSeating });
  for (const [key, entity] of Object.entries(entities)) {
    const seat = assignments[key];
    entity.seat = seat;
    entity.root.position.fromArray(seat.position);
    entity.root.rotation.y = seat.heading;
    applyCharacterPose(entity, seat, elapsedTime, reduceMotion);
  }
}
