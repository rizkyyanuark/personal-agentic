import * as THREE from 'three';
import { FURNITURE_LAYOUT, ROOM_LAYOUT } from './office-layout.js';
import { CHARACTER_RIG, DESK_CHAIR_OFFSET } from './seating-contract.js';

const down = new THREE.Vector3(0, -1, 0);
const across = new THREE.Vector3(1, 0, 0);

function poseScratch(entity) {
  return (entity.poseScratch ??= {
    target: new THREE.Vector3(),
    direction: new THREE.Vector3(),
    bend: new THREE.Vector3(),
    elbow: new THREE.Vector3(),
    lowerDirection: new THREE.Vector3(),
    upperRotation: new THREE.Quaternion(),
    lowerRotation: new THREE.Quaternion(),
    gaze: new THREE.Vector3(),
    propRotation: new THREE.Quaternion(),
    rootRotation: new THREE.Quaternion(),
    headRotation: new THREE.Quaternion(),
    headTarget: new THREE.Quaternion(),
    headOffset: new THREE.Quaternion(),
    headEuler: new THREE.Euler(),
    bodyRotation: new THREE.Quaternion(),
    bodyLean: 0,
    headPosition: entity.head.position.clone(),
    leftShoulder: entity.leftArm.position.clone(),
    rightShoulder: entity.rightArm.position.clone(),
    bodyParts: entity.hips.children
      .filter(
        (child) =>
          child.geometry?.type === 'CapsuleGeometry' ||
          (child.geometry?.type === 'CylinderGeometry' && child.position.y > 0.6)
      )
      .map((mesh) => ({ mesh, position: mesh.position.clone(), rotation: mesh.quaternion.clone() }))
  });
}

function placeHand(entity, arm, forearm, worldTarget, blend = 1) {
  const scratch = poseScratch(entity);
  const target = scratch.target.fromArray(worldTarget);
  entity.hips.worldToLocal(target);
  const direction = scratch.direction.copy(target).sub(arm.position);
  const distance = direction.length();
  const reach = CHARACTER_RIG.armLength * 2;
  if (distance < 0.001 || distance > reach) {
    throw new RangeError(`Unreachable hand target for ${entity.cfg.key}: ${distance}`);
  }
  direction.divideScalar(distance);
  const bend = scratch.bend.set(Math.sign(arm.position.x), -0.4, 0);
  bend.addScaledVector(direction, -bend.dot(direction));
  if (bend.lengthSq() < 0.001) bend.set(0, 0, 1);
  bend.normalize();
  const elbow = scratch.elbow
    .copy(arm.position)
    .addScaledVector(direction, distance / 2)
    .addScaledVector(bend, Math.sqrt(CHARACTER_RIG.armLength ** 2 - (distance / 2) ** 2));
  scratch.upperRotation.setFromUnitVectors(
    down,
    scratch.lowerDirection.copy(elbow).sub(arm.position).normalize()
  );
  scratch.lowerRotation.setFromUnitVectors(
    down,
    scratch.lowerDirection.copy(target).sub(elbow).normalize()
  );
  arm.quaternion.slerp(scratch.upperRotation, blend);
  scratch.lowerRotation.premultiply(scratch.upperRotation.invert());
  forearm.quaternion.slerp(scratch.lowerRotation, blend);
}

function leanUpperBody(entity, lean, blend) {
  const scratch = poseScratch(entity);
  scratch.bodyLean = THREE.MathUtils.lerp(scratch.bodyLean, lean, blend);
  scratch.bodyRotation.setFromAxisAngle(across, scratch.bodyLean);
  entity.head.position.copy(scratch.headPosition).applyQuaternion(scratch.bodyRotation);
  entity.leftArm.position.copy(scratch.leftShoulder).applyQuaternion(scratch.bodyRotation);
  entity.rightArm.position.copy(scratch.rightShoulder).applyQuaternion(scratch.bodyRotation);
  for (const { mesh, position, rotation } of scratch.bodyParts) {
    mesh.position.copy(position).applyQuaternion(scratch.bodyRotation);
    mesh.quaternion.copy(rotation).premultiply(scratch.bodyRotation);
  }
}

function relativeHandTarget(entity, x, y, z) {
  const target = new THREE.Vector3(x, y, z);
  entity.hips.localToWorld(target);
  return target.toArray();
}

function handTargets(entity, seat, elapsedTime, reducedMotion) {
  if (seat.kind === 'desk') {
    const active = entity.state === 'bekerja' && !reducedMotion;
    const typing = active ? Math.sin(elapsedTime * 7) * 0.002 : 0;
    const deskZ = seat.fixture.z - DESK_CHAIR_OFFSET;
    return [
      [seat.fixture.x - 0.032, ROOM_LAYOUT.floorY + 0.9 + typing, deskZ + 0.212],
      [seat.fixture.x - 0.218, ROOM_LAYOUT.floorY + 0.9 - typing, deskZ + 0.212]
    ];
  }
  if (seat.kind === 'meeting') {
    const center = FURNITURE_LAYOUT.meeting;
    const forward = new THREE.Vector3(center.x - seat.position[0], 0, center.z - seat.position[2]);
    forward.normalize();
    const across = new THREE.Vector3(forward.z, 0, -forward.x);
    const edge = new THREE.Vector3(center.x, ROOM_LAYOUT.floorY + 0.85, center.z).addScaledVector(
      forward,
      -0.88
    );
    return [-0.16, 0.16].map((side) => edge.clone().addScaledVector(across, side).toArray());
  }
  if (seat.kind === 'standing') {
    return [
      relativeHandTarget(entity, -0.15, 0.34, 0.27),
      relativeHandTarget(entity, 0.15, 0.34, 0.27)
    ];
  }
  return [
    relativeHandTarget(entity, -0.16, 0.17, 0.2),
    relativeHandTarget(entity, 0.16, 0.17, 0.2)
  ];
}

function placeWalkingFoot(leg, calf, shoe, hipHeight, phase, cycleDistance) {
  const fraction = ((phase % 1) + 1) % 1;
  const stance = fraction < 0.5;
  const swing = stance ? 0 : (fraction - 0.5) / 0.5;
  const eased = swing * swing * (3 - 2 * swing);
  const halfStride = cycleDistance / 4;
  const forward = stance
    ? halfStride - fraction * cycleDistance
    : -halfStride + eased * halfStride * 2;
  const lift = stance ? 0 : Math.sin(swing * Math.PI) * 0.08;
  const vertical = hipHeight - CHARACTER_RIG.shoeHalfHeight - lift;
  const distance = Math.hypot(vertical, forward);
  const thigh = CHARACTER_RIG.thighLength;
  const shin = CHARACTER_RIG.shinLength;
  const knee = Math.acos(
    THREE.MathUtils.clamp(
      (distance * distance - thigh * thigh - shin * shin) / (2 * thigh * shin),
      -1,
      1
    )
  );
  const hip =
    Math.atan2(-forward, vertical) -
    Math.atan2(shin * Math.sin(knee), thigh + shin * Math.cos(knee));
  leg.rotation.set(hip, 0, 0);
  calf.rotation.set(knee, 0, 0);
  shoe.position.z = 0;
  shoe.rotation.x = -hip - knee;
}

function activityPose(activity, elapsedTime, arrivalTime, seed) {
  if (activity === 'coffee') {
    const reaching = arrivalTime < 2.5;
    const sipTime = arrivalTime % 6;
    const sip =
      !reaching && sipTime < 1.8
        ? THREE.MathUtils.smoothstep(sipTime, 0, 0.25) *
          (1 - THREE.MathUtils.smoothstep(sipTime, 1.55, 1.8))
        : 0;
    return {
      lean: reaching ? 0.1 : -0.03,
      headX: reaching ? 0.25 : THREE.MathUtils.lerp(0.05, -0.15, sip),
      headY: reaching ? 0 : 0.5 * (1 - sip),
      sip,
      reaching
    };
  }
  if (activity === 'sofa') {
    const laugh = Math.sin(elapsedTime * 0.7 + seed) > 0.93;
    return { lean: laugh ? -0.25 : -0.12, headX: laugh ? -0.25 : -0.02, headY: 0 };
  }
  if (activity === 'meeting')
    return {
      lean: 0.1,
      headX: 0.05 + Math.sin(elapsedTime * 1.7 + seed) * 0.06,
      headY: Math.sin(elapsedTime * 0.6 + seed) * 0.25,
      gesture: Math.max(0, Math.sin(elapsedTime * 3 + seed)) * 0.07
    };
  if (activity === 'reading')
    return { lean: 0.08, headX: Math.sin(elapsedTime * 0.8) * 0.04, headY: 0 };
  return { lean: 0, headX: 0, headY: 0 };
}

function localActivityHands(entity, activity, pose) {
  if (activity === 'coffee') {
    return [
      relativeHandTarget(entity, -0.27, -0.06, 0.05),
      pose.reaching
        ? relativeHandTarget(entity, 0.17, 0.12, 0.43)
        : relativeHandTarget(entity, 0.17, 0.46 + pose.sip * 0.32, 0.29)
    ];
  }
  if (activity === 'reading')
    return [
      relativeHandTarget(entity, -0.13, 0.31, 0.26),
      relativeHandTarget(entity, 0.13, 0.31, 0.26)
    ];
  return null;
}

export function applyCharacterPose(
  entity,
  seat,
  elapsedTime = 0,
  reducedMotion = false,
  motion = {}
) {
  const walking = motion.walking === true && !reducedMotion;
  const activity = !walking && !reducedMotion && motion.neutral !== true ? motion.activity : null;
  const pose = activityPose(
    activity,
    elapsedTime,
    Math.max(0, motion.elapsedSinceArrival ?? elapsedTime),
    motion.seed ?? 0
  );
  const poseBlend =
    !reducedMotion && Number.isFinite(motion.deltaSeconds)
      ? THREE.MathUtils.clamp(motion.deltaSeconds * 7, 0, 1)
      : 1;
  const cycleDistance = motion.walkCycleDistance ?? 0.64;
  const walkPhase = motion.walkPhase ?? ((motion.distance ?? 0) / cycleDistance) * Math.PI * 2;
  const standing = seat.kind === 'standing';
  const blend = standing ? 0 : THREE.MathUtils.clamp(motion.seatBlend ?? 1, 0, 1);
  const standingHeight =
    CHARACTER_RIG.thighLength + CHARACTER_RIG.shinLength + CHARACTER_RIG.shoeHalfHeight;
  const seatedHeight = standing
    ? standingHeight
    : seat.surfaceY - seat.position[1] + CHARACTER_RIG.thighRadius;
  const maximumWalkHeight =
    Math.sqrt(
      Math.max(
        0,
        (CHARACTER_RIG.thighLength + CHARACTER_RIG.shinLength - 0.005) ** 2 -
          (cycleDistance / 4) ** 2
      )
    ) + CHARACTER_RIG.shoeHalfHeight;
  const hipHeight = walking
    ? Math.min(standingHeight - 0.1 + Math.abs(Math.cos(walkPhase)) * 0.03, maximumWalkHeight)
    : THREE.MathUtils.lerp(standingHeight, seatedHeight, blend);
  entity.hips.position.y = hipHeight;
  const thighAngle =
    blend === 0
      ? 0
      : -Math.acos(
          THREE.MathUtils.clamp(
            (hipHeight - CHARACTER_RIG.shinLength - CHARACTER_RIG.shoeHalfHeight) /
              CHARACTER_RIG.thighLength,
            -1,
            1
          )
        );
  entity.leftLeg.rotation.set(thighAngle, 0, 0);
  entity.rightLeg.rotation.set(thighAngle, 0, 0);
  entity.leftCalf.rotation.set(blend === 0 ? 0 : -thighAngle, 0, 0);
  entity.rightCalf.rotation.set(blend === 0 ? 0 : -thighAngle, 0, 0);
  entity.leftShoe.rotation.x = 0;
  entity.rightShoe.rotation.x = 0;
  entity.leftShoe.position.z = 0.06;
  entity.rightShoe.position.z = 0.06;
  if (walking) {
    const phase = walkPhase / (Math.PI * 2);
    placeWalkingFoot(
      entity.leftLeg,
      entity.leftCalf,
      entity.leftShoe,
      hipHeight,
      phase,
      cycleDistance
    );
    placeWalkingFoot(
      entity.rightLeg,
      entity.rightCalf,
      entity.rightShoe,
      hipHeight,
      phase + 0.5,
      cycleDistance
    );
  }
  leanUpperBody(entity, walking ? 0.04 : pose.lean, poseBlend);
  entity.root.updateWorldMatrix(true, true);

  let targets;
  if (walking) {
    const swing = Math.sin(walkPhase) * 0.2;
    targets = [
      relativeHandTarget(entity, -0.28, -0.04, swing),
      relativeHandTarget(entity, 0.28, -0.04, -swing)
    ];
  } else if (motion.neutral === true || (!standing && blend < 0.001)) {
    targets = [
      relativeHandTarget(entity, -0.27, -0.06, 0.05),
      relativeHandTarget(entity, 0.27, -0.06, 0.05)
    ];
  } else {
    targets =
      localActivityHands(entity, activity, pose) ??
      handTargets(entity, seat, elapsedTime, reducedMotion);
    if (activity === 'meeting') targets[1][1] += pose.gesture;
    if (!standing && blend < 1) {
      const resting = [
        relativeHandTarget(entity, -0.27, -0.06, 0.05),
        relativeHandTarget(entity, 0.27, -0.06, 0.05)
      ];
      targets = targets.map((target, index) =>
        target.map((value, axis) => THREE.MathUtils.lerp(resting[index][axis], value, blend))
      );
    }
  }
  const [leftTarget, rightTarget] = targets;
  placeHand(entity, entity.leftArm, entity.leftForearm, leftTarget, poseBlend);
  placeHand(entity, entity.rightArm, entity.rightForearm, rightTarget, poseBlend);
  entity.head.updateWorldMatrix(true, false);
  const gaze = activity === 'reading' ? relativeHandTarget(entity, 0, 0.32, 0.28) : seat.lookTarget;
  const scratch = poseScratch(entity);
  scratch.headRotation.copy(entity.head.quaternion);
  entity.head.lookAt(scratch.gaze.fromArray(gaze));
  scratch.headOffset.setFromEuler(scratch.headEuler.set(pose.headX, pose.headY, 0));
  scratch.headTarget.copy(entity.head.quaternion).multiply(scratch.headOffset);
  entity.head.quaternion
    .copy(scratch.headRotation)
    .slerp(scratch.headTarget, Math.min(1, poseBlend * 1.4));
  entity.handMug.visible = false;
  entity.handPad.visible = false;
  entity.handBook.visible = false;
  entity.handTablet.visible =
    standing &&
    entity.cfg.key === 'hq_lab_director' &&
    motion.neutral !== true &&
    !walking &&
    !['coffee', 'reading'].includes(activity);
  if (!walking && motion.neutral !== true) {
    entity.handMug.visible = activity === 'coffee' && !pose.reaching;
    entity.handBook.visible = activity === 'reading';
    if (entity.handMug.visible) {
      const scratch = poseScratch(entity);
      entity.rightForearm.getWorldQuaternion(scratch.propRotation);
      entity.root.getWorldQuaternion(scratch.rootRotation);
      entity.handMug.quaternion.copy(scratch.propRotation).invert().multiply(scratch.rootRotation);
      entity.handMug.rotateX(-pose.sip * 0.4);
    }
  }
}
