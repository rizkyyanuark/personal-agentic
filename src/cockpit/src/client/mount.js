import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

import { createRoomScene } from './scene/room.js';
import { createFurnitureScene } from './scene/furniture.js';
import {
  CAMERA_DISTANCE_LIMITS,
  getHomeCameraView,
  getCameraTargetBounds,
  getResponsiveFov,
  getRoomCenterCameraView,
  getTVCameraView,
  getWorkstationCameraView
} from './scene/camera-views.js';
import { getAdaptivePixelRatio, observeDevicePixelRatio } from './scene/pixel-ratio.js';
import { createCharactersScene } from './scene/characters.js';
import { createCharacterActivityController } from './scene/character-activity.js';
import { setupWorkstationInteraction } from './scene/workstation.js';
import {
  setupCharacterLabels,
  updateCharacterLabelView,
  updateCharacterLabelPositions,
  disposeCharacterLabels
} from './ui/labels.js';
import { setupHUD } from './ui/hud.js';
import { createOfficePresentation } from './ui/office-presentation.js';
import { createAmbientDialogue } from './ui/ambient-dialogue.js';
import { createBubbleCoordinator } from './ui/bubble-coordinator.js';
import { OFFICE_CONFIG } from '../shared/office-contract.js';
import { COCKPIT_SHELL } from './shell.js';
import { projectCockpitSnapshot, createDisconnectedState } from './snapshot.js';
import { createDomScope, createScopedView, disposeObjectTree } from './lifecycle.js';
import { getOfficeTime } from './scene/office-clock.js';

export function mountCockpit(container, options = {}) {
  if (!container?.ownerDocument) throw new TypeError('Cockpit requires an HTMLElement');
  container.classList.add('cockpit-root');
  container.innerHTML = COCKPIT_SHELL;
  const config = { roles: OFFICE_CONFIG.roles.map((role) => ({ ...role })) };
  const document = createDomScope(container);
  const window = createScopedView(container);
  const cleanup = [];
  function listen(target, type, handler, options) {
    target?.addEventListener(type, handler, options);
    cleanup.push(() => target?.removeEventListener(type, handler, options));
  }
  let animationFrame = null;
  let staleTimer = null;
  let furnitureScene;
  let environmentTarget;
  let ready = false;
  let disposed = false;
  function setWorkspace(context) {
    if (disposed) return;
    const title = document.getElementById('workspaceTitle');
    const text = `· ${context.title}`;
    if (title.textContent !== text) title.textContent = text;
    title.parentElement.title = context.detail;
  }
  setWorkspace(options.workspace || { title: 'Workspace', detail: 'Workspace' });
  const sceneHost = document.getElementById('scene');
  const labelsHost = document.getElementById('labels');
  const loading = document.getElementById('loading');
  const loadingSub = document.getElementById('loadingSub');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const workspace = document.querySelector('.workspace');
  const cameraTargetBounds = getCameraTargetBounds();

  let renderer;
  let labelsRenderer;
  let scene;
  let camera;
  let controls;
  let entities = {};
  let workstations = {};
  let roomScene;
  let tvScreen;
  let workstationInteraction;
  let cameraTransition = null;
  let viewPreset = { kind: 'home' };
  let selectedRole = null;
  let sceneDirty = true;

  let scenePixelRatio = getAdaptivePixelRatio();
  let labels = {};
  let firstFrame = true;
  let firstStateSeen = false;

  function finishLoadingIfReady() {
    if (firstFrame || !firstStateSeen) return;
    container.dataset.ready = 'true';
    if (!ready) {
      ready = true;
      options.onReady?.();
    }
    loading?.classList.add('gone');
  }
  let lastFeedSignature = null;

  function viewportSize() {
    return {
      width: Math.max(1, sceneHost.clientWidth),
      height: Math.max(1, sceneHost.clientHeight)
    };
  }

  function resizeScene() {
    if (!renderer || !camera || !labelsRenderer || !controls) return;
    const { width, height } = viewportSize();
    const nextPixelRatio = getAdaptivePixelRatio();
    const nextFov = getResponsiveFov(
      container.clientWidth,
      workspace?.classList.contains('panels-hidden')
    );
    const canvas = renderer.domElement;
    if (
      nextPixelRatio === scenePixelRatio &&
      canvas.width === Math.floor(width * nextPixelRatio) &&
      canvas.height === Math.floor(height * nextPixelRatio) &&
      camera.aspect === width / height &&
      camera.fov === nextFov
    )
      return;
    camera.aspect = width / height;
    camera.fov = nextFov;
    camera.updateProjectionMatrix();
    scenePixelRatio = nextPixelRatio;
    renderer.setDrawingBufferSize(width, height, scenePixelRatio);
    canvas.dataset.pixelRatio = String(scenePixelRatio);
    labelsRenderer.setSize(width, height);
    updateCharacterLabelView(labels, { focusedRole: selectedRole, width });
    sceneDirty = true;
    const view = resolveCameraPreset();
    if (view) {
      cameraTransition = null;
      camera.position.copy(view.position);
      controls.target.copy(view.target);
      controls.update();
    }
  }

  function resetCamera() {
    if (!camera || !controls) return;
    viewPreset = { kind: 'home' };
    const view = getHomeCameraView(camera.aspect, camera.fov);
    setCameraView(view.position, view.target);
    workstationInteraction?.clearSelection();
    markSelectedCard(null);
    hud?.resetFocus?.();
  }

  function resolveCameraPreset() {
    if (!viewPreset || !camera) return null;
    if (viewPreset.kind === 'home') return getHomeCameraView(camera.aspect, camera.fov);
    if (viewPreset.kind === 'tv') return getTVCameraView(camera.aspect, camera.fov);
    if (viewPreset.kind === 'room-center')
      return getRoomCenterCameraView(camera.aspect, camera.fov);
    if (viewPreset.kind === 'workstation') {
      return getWorkstationCameraView(viewPreset.roleKey, camera.aspect, camera.fov);
    }
    if (viewPreset.kind === 'character') {
      const char = entities?.[viewPreset.roleKey];
      if (char?.head) {
        const headPos = new THREE.Vector3();
        char.head.getWorldPosition(headPos);
        const target = headPos.clone().add(new THREE.Vector3(0, -0.2, 0));
        const position = target.clone().add(new THREE.Vector3(2.2, 2.6, 4.4));
        return { position, target };
      }
      return getWorkstationCameraView(viewPreset.roleKey, camera.aspect, camera.fov);
    }
    return null;
  }

  function focusRole(
    roleKey,
    kind = roleKey === 'hq_lab_director' ? 'room-center' : 'workstation'
  ) {
    if (!camera || !controls) return;
    if (!entities[roleKey]) return;
    if (selectedRole === roleKey) {
      resetCamera();
      return;
    }
    viewPreset = { kind, roleKey };
    const view = resolveCameraPreset();
    if (!view) return;
    setCameraView(view.position, view.target);
    if (workstations[roleKey]) workstationInteraction?.select(roleKey);
    else workstationInteraction?.clearSelection();
    markSelectedCard(roleKey);
    updateCharacterLabelView(labels, { focusedRole: roleKey, width: container.clientWidth });
  }

  listen(document.getElementById('btnResetCamera'), 'click', resetCamera);

  try {
    const size = viewportSize();
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setDrawingBufferSize(size.width, size.height, scenePixelRatio);
    renderer.domElement.dataset.pixelRatio = String(scenePixelRatio);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    const isPowerSaving =
      reducedMotion.matches || (typeof navigator !== 'undefined' && Boolean(navigator.webdriver));
    renderer.shadowMap.enabled = !reducedMotion.matches;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    sceneHost.appendChild(renderer.domElement);

    labelsRenderer = new CSS2DRenderer();
    labelsRenderer.setSize(size.width, size.height);
    labelsRenderer.domElement.style.position = 'absolute';
    labelsRenderer.domElement.style.inset = '0';
    labelsRenderer.domElement.style.pointerEvents = 'none';
    labelsHost.appendChild(labelsRenderer.domElement);

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xe9e3da);

    if (!reducedMotion.matches && (typeof navigator === 'undefined' || !navigator.webdriver)) {
      try {
        const pmrem = new THREE.PMREMGenerator(renderer);
        environmentTarget = pmrem.fromScene(new RoomEnvironment(), 0.04);
        scene.environment = environmentTarget.texture;
        scene.environmentIntensity = 0.5;
        pmrem.dispose();
      } catch (error) {
        console.warn('Room environment unavailable:', error);
      }
    }

    camera = new THREE.PerspectiveCamera(
      getResponsiveFov(container.clientWidth, workspace?.classList.contains('panels-hidden')),
      size.width / size.height,
      0.1,
      140
    );
    const homeView = getHomeCameraView(camera.aspect, camera.fov);
    camera.position.copy(homeView.position);
    controls = new OrbitControls(camera, renderer.domElement);
    controls.target.copy(homeView.target);
    controls.enableDamping = !reducedMotion.matches;
    controls.dampingFactor = 0.07;
    controls.minDistance = CAMERA_DISTANCE_LIMITS.min;
    controls.maxDistance = CAMERA_DISTANCE_LIMITS.max;
    controls.enablePan = true;
    controls.minAzimuthAngle = -0.8;
    controls.maxAzimuthAngle = 1.25;
    controls.minPolarAngle = 0.3;
    controls.maxPolarAngle = 1.36;
    controls.update();
    listen(controls, 'change', () => {
      sceneDirty = true;
    });
    listen(controls, 'start', () => {
      cameraTransition = null;
      viewPreset = null;
      workstationInteraction?.clearSelection();
      markSelectedCard(null);
    });

    listen(renderer.domElement, 'dblclick', resetCamera);
    listen(renderer.domElement, 'pointerdown', () => {
      cameraTransition = null;
    });
    for (const eventName of ['pointermove', 'pointerleave', 'pointerup']) {
      listen(renderer.domElement, eventName, () => {
        sceneDirty = true;
      });
    }
    listen(reducedMotion, 'change', () => {
      controls.enableDamping = !reducedMotion.matches;
      sceneDirty = true;
    });

    const shadowResolution = isPowerSaving ? 1024 : 2048;
    roomScene = createRoomScene({
      shadowResolution,
      shadowRadius: isPowerSaving ? 1 : 2,
      anisotropy: renderer.capabilities.getMaxAnisotropy()
    });
    scene.add(roomScene);
    furnitureScene = createFurnitureScene({
      assetBase: options.assetBase || '/cockpit-assets/',
      anisotropy: renderer.capabilities.getMaxAnisotropy()
    });
    workstations = furnitureScene.workstations;
    tvScreen = furnitureScene.tvScreen;
    scene.add(furnitureScene.group);
    renderer.domElement.dataset.workstationCount = String(Object.keys(workstations).length);
    renderer.domElement.dataset.prototypeWorkstation = 'data_engineer';
    const characterScene = createCharactersScene();
    entities = characterScene.characterEntities;
    scene.add(characterScene.charactersGroup);

    const characterTargets = [];
    for (const [key, char] of Object.entries(entities)) {
      char.root.traverse((obj) => {
        if (obj.isMesh) {
          obj.userData.roleKey = key;
          obj.userData.isCharacter = true;
          characterTargets.push(obj);
        }
      });
    }

    workstationInteraction = setupWorkstationInteraction({
      camera,
      canvas: renderer.domElement,
      workstations,
      extraTargets: characterTargets,
      onSelect: (roleKey, isCharacter) =>
        focusRole(roleKey, isCharacter ? 'character' : 'workstation')
    });
    labels = setupCharacterLabels(entities, (key) => focusRole(key, 'character'), config.roles);
    updateCharacterLabelView(labels, { width: size.width });

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(resizeScene);
      observer.observe(sceneHost);
      cleanup.push(() => observer.disconnect());
    }
    listen(window, 'resize', resizeScene);
    cleanup.push(observeDevicePixelRatio(resizeScene));
  } catch (error) {
    console.warn('WebGL tidak tersedia:', error);
    showFallback();
  }

  const hud = setupHUD(config, focusRole, { documentRef: document, windowRef: window });
  listen(container, 'keydown', (event) => {
    if (event.key !== 'Escape' || event.defaultPrevented) return;
    if (!hud.isMobilePanelOpen()) resetCamera();
  });
  if (workspace && typeof MutationObserver !== 'undefined') {
    const observer = new MutationObserver(resizeScene);
    observer.observe(workspace, { attributes: true, attributeFilter: ['class'] });
    cleanup.push(() => observer.disconnect());
  }
  let clockSecond = -1;
  let clockSnapshot;
  function sampleOfficeTime() {
    const second = Math.floor(Date.now() / 1000);
    if (second !== clockSecond) {
      clockSecond = second;
      clockSnapshot = getOfficeTime(new Date(second * 1000));
    }
    return clockSnapshot;
  }
  hud.updateTime(sampleOfficeTime());
  const fallbackClockTimer = !renderer
    ? setInterval(() => hud.updateTime(sampleOfficeTime()), 1000)
    : null;
  const presentation = createOfficePresentation(config.roles, {
    visible: !document.hidden,
    reducedMotion: reducedMotion.matches
  });
  let presentationSnapshot = presentation.getSnapshot();
  let presentationActive = true;
  const activityController = createCharacterActivityController(entities);
  const dialogue = createAmbientDialogue(config.roles);
  const bubbleCoordinator = createBubbleCoordinator({
    labelMap: labels,
    entities,
    host: labelsHost
  });
  const eventBubbles = new Map();
  let lastTick = performance.now();

  function publishVisualActivities(renderHUD = true) {
    presentation.setVisualActivities(activityController.getSamples());
    presentationSnapshot = presentation.getSnapshot();
    for (const [key, entity] of Object.entries(entities)) {
      entity.visualActivity = presentationSnapshot.agents[key]?.visual || null;
    }
    if (renderHUD) hud.updatePresentation(presentationSnapshot);
  }

  function updateBubblePresentation(delta = 0) {
    const { gates, agents } = presentationSnapshot;
    const candidates = dialogue.update(
      delta,
      presentationSnapshot,
      activityController.getActivities()
    );
    const now = performance.now();
    for (const [key, event] of eventBubbles) {
      if (event.expiresAt <= now || !gates.dataFresh || !gates.visible) eventBubbles.delete(key);
      else candidates.push(event);
    }
    for (const [roleKey, agent] of Object.entries(agents)) {
      if (agent.workingBubble) {
        candidates.push({
          ...agent.workingBubble,
          id: `working:${roleKey}:${agent.operational.task}`,
          roleKey
        });
      }
    }
    if (camera) {
      const { width, height } = viewportSize();
      bubbleCoordinator.update({ camera, width, height, selectedRole, gates, candidates });
    }
    hud.updateNarrative({ dialogue: dialogue.getDetails(), bubbles: candidates });
  }

  function reconcilePresentation(renderHUD = true) {
    const previous = presentationSnapshot;
    const next = presentation.getSnapshot();
    if (!next.gates.dataFresh || !next.gates.visible) {
      bubbleCoordinator.clear();
      dialogue.clear();
      eventBubbles.clear();
      lastFeedSignature = null;
    }
    for (const [key, entity] of Object.entries(entities)) {
      const operational = next.agents[key]?.operational;
      const prevOperational = previous.agents[key]?.operational;
      if (
        prevOperational?.state !== operational?.state ||
        prevOperational?.task !== operational?.task
      ) {
        eventBubbles.delete(key);
        if (
          prevOperational?.state &&
          operational?.state &&
          next.gates?.dataFresh &&
          next.gates?.visible
        ) {
          if (prevOperational.state !== 'bekerja' && operational.state === 'bekerja') {
            eventBubbles.set(key, {
              id: `lifecycle:${key}:start:${performance.now()}`,
              roleKey: key,
              kind: 'work',
              cls: 'hi',
              text: 'Siap, saya kerjakan!',
              expiresAt: performance.now() + 3600
            });
            if (key !== 'hq_lab_director' && entities.hq_lab_director) {
              const assigneeName = entities[key]?.cfg?.name || 'Tim';
              const taskText = (operational.task || 'tugas baru').slice(0, 40);
              eventBubbles.set('hq_lab_director', {
                id: `lifecycle:hq:delegate:${performance.now()}`,
                roleKey: 'hq_lab_director',
                kind: 'work',
                text: `${assigneeName}, tolong: ${taskText}`,
                expiresAt: performance.now() + 4000
              });
            }
          } else if (
            prevOperational.state === 'bekerja' &&
            ['siaga', 'selesai'].includes(operational.state)
          ) {
            const isDirector = key === 'hq_lab_director';
            eventBubbles.set(key, {
              id: `lifecycle:${key}:done:${performance.now()}`,
              roleKey: key,
              kind: 'work',
              cls: 'hi',
              text: isDirector ? 'Beres, menunggu instruksi berikutnya' : 'Beres!',
              expiresAt: performance.now() + (isDirector ? 3800 : 3600)
            });
          }
        }
      }
      entity.operational = operational;
      entity.state = operational?.state || 'offline';
      const isUnmapped =
        operational?.state === 'unmapped' ||
        config.roles.find((role) => role.key === key)?.agentId === null;
      entity.root.visible = !isUnmapped;
      if (labels[key]) {
        labels[key].requestedVisible = !isUnmapped;
        labels[key].labelObject.visible = !isUnmapped;
      }
    }
    presentationSnapshot = next;
    activityController.receive(next);
    activityController.update(0);
    publishVisualActivities(renderHUD);
    updateBubblePresentation();
    updateTVPresentation(performance.now());
    sceneDirty = true;
    return presentationSnapshot;
  }

  function updateTVPresentation(now) {
    if (!tvScreen) return;
    const { gates } = presentationSnapshot;
    const player = Object.values(entities).find(
      (entity) => entity.seat?.id === 'sofa:right' || entity.seat?.kind === 'sofa'
    );
    const occupied = gates.dataFresh && gates.visible && Boolean(player);
    const playerName = player
      ? presentationSnapshot?.agents?.[player.cfg.key]?.role?.name || player.cfg.name || ''
      : '';
    tvScreen.update({
      occupied,
      playerName,
      reducedMotion: !gates.allowAmbient,
      timeSeconds: now / 1000
    });
    if (renderer) renderer.domElement.dataset.tvMode = tvScreen.mode;
    hud.updateTVMode(tvScreen.mode);
  }

  function receiveState(state) {
    if (!presentationActive) return;
    sceneDirty = true;
    presentation.receive(state);
    hud.updateState(state, reconcilePresentation(false));
    firstStateSeen = true;
    if (loadingSub && firstFrame) {
      loadingSub.textContent =
        state.connection === 'live' || state.connection === 'empty'
          ? 'Status publik diterima. Menyiapkan ruang 3D.'
          : 'Status publik belum tersedia. Menyiapkan ruang 3D.';
    }
    finishLoadingIfReady();
    roomScene?.userData.setBoardState?.(state);
    Object.entries(workstations).forEach(([key, workstation]) => {
      workstation.setState(state.agents?.[key], state);
    });

    const latest =
      presentationSnapshot.gates.dataFresh && presentationSnapshot.gates.visible
        ? state.feed?.[0]
        : null;
    const signature = latest
      ? String(latest.id || [latest.role, latest.time, latest.text].join('|'))
      : null;
    if (
      lastFeedSignature !== null &&
      signature &&
      signature !== lastFeedSignature &&
      labels[latest.role] &&
      Number.isFinite(Date.parse(latest.time)) &&
      Date.parse(state.now) - Date.parse(latest.time) >= 0 &&
      Date.parse(state.now) - Date.parse(latest.time) <= 15000
    ) {
      eventBubbles.set(latest.role, {
        id: `event:${signature}`,
        roleKey: latest.role,
        kind: 'event',
        cls: latest.tool ? 'hi' : '',
        text: latest.text,
        expiresAt: performance.now() + 4800
      });
    }
    lastFeedSignature = signature;

    updateBubblePresentation();
  }

  function reconcileEnvironment() {
    if (!presentationActive) return;
    lastTick = performance.now();
    presentation.setEnvironment({
      visible: !document.hidden,
      reducedMotion: reducedMotion.matches
    });
    reconcilePresentation();
  }

  function handleVisibilityChange() {
    presentation.setEnvironment({
      visible: !document.hidden,
      reducedMotion: reducedMotion.matches
    });
    reconcilePresentation();
  }
  listen(document, 'visibilitychange', handleVisibilityChange);
  listen(reducedMotion, 'change', reconcileEnvironment);
  reconcilePresentation();

  let lastRender = 0;
  function animate(now = performance.now()) {
    if (!presentationActive || !renderer || !camera || !scene) return;
    animationFrame = requestAnimationFrame(animate);
    if (document.hidden) return;
    const currentSize = viewportSize();
    const nextPixelRatio = getAdaptivePixelRatio();
    if (
      scenePixelRatio !== nextPixelRatio ||
      renderer.domElement.width !== Math.floor(currentSize.width * nextPixelRatio) ||
      renderer.domElement.height !== Math.floor(currentSize.height * nextPixelRatio)
    ) {
      resizeScene();
    }
    const elapsed = Math.max(0, (now - lastTick) / 1000);
    const delta = Math.min(elapsed, 0.25);
    lastTick = now;
    if (activityController.update(delta, delta)) {
      publishVisualActivities();
      sceneDirty = true;
    }
    if (controls) {
      updateCameraTransition(now);
      if (!cameraTransition && viewPreset?.kind === 'character') {
        const char = entities?.[viewPreset.roleKey];
        if (char?.head) {
          const headPos = new THREE.Vector3();
          char.head.getWorldPosition(headPos);
          const target = headPos.clone().add(new THREE.Vector3(0, -0.2, 0));
          controls.target.lerp(target, 0.05);
        }
      }
      controls.target.x = THREE.MathUtils.clamp(
        controls.target.x,
        cameraTargetBounds.min[0],
        cameraTargetBounds.max[0]
      );
      controls.target.y = THREE.MathUtils.clamp(
        controls.target.y,
        cameraTargetBounds.min[1],
        cameraTargetBounds.max[1]
      );
      controls.target.z = THREE.MathUtils.clamp(
        controls.target.z,
        cameraTargetBounds.min[2],
        cameraTargetBounds.max[2]
      );
      controls.update();
    }
    if (reducedMotion.matches && !sceneDirty && now - lastRender < 1000) return;
    const time = sampleOfficeTime();
    hud.updateTime(time);
    roomScene?.userData.updateTime?.(time);
    Object.values(workstations).forEach((workstation) => {
      workstation.update(delta, !presentationSnapshot.gates.allowWorkMotion, time);
    });
    updateTVPresentation(now);
    updateCharacterLabelPositions(labels, entities, camera);
    renderer.render(scene, camera);
    labelsRenderer.render(scene, camera);
    updateBubblePresentation(delta);
    sceneDirty = false;
    lastRender = performance.now();

    if (firstFrame) {
      firstFrame = false;
      container.dataset.sceneReady = 'true';
      document.getElementById('btnLightMode').hidden = true;
      if (loadingSub && !firstStateSeen) {
        loadingSub.textContent = 'Ruang 3D siap. Menunggu status publik.';
      }
      finishLoadingIfReady();
    }
  }

  if (renderer && scene) {
    animate();
  } else {
    container.dataset.ready = 'true';
    if (!ready) {
      ready = true;
      options.onReady?.();
    }
    loading?.classList.add('gone');
  }
  function setCameraView(position, target) {
    if (!camera || !controls) return;
    sceneDirty = true;
    if (reducedMotion.matches) {
      cameraTransition = null;
      camera.position.copy(position);
      controls.target.copy(target);
      controls.update();
      return;
    }
    cameraTransition = {
      startedAt: performance.now(),
      duration: 1200,
      fromPosition: camera.position.clone(),
      fromTarget: controls.target.clone(),
      toPosition: position.clone(),
      toTarget: target.clone()
    };
  }

  function updateCameraTransition(now) {
    if (!cameraTransition || !camera || !controls) return false;
    const progress = Math.min((now - cameraTransition.startedAt) / cameraTransition.duration, 1);
    const eased = 1 - (1 - progress) ** 3;
    camera.position.lerpVectors(cameraTransition.fromPosition, cameraTransition.toPosition, eased);
    controls.target.lerpVectors(cameraTransition.fromTarget, cameraTransition.toTarget, eased);
    if (progress >= 1) {
      camera.position.copy(cameraTransition.toPosition);
      controls.target.copy(cameraTransition.toTarget);
      cameraTransition = null;
      controls.update();
    }
    return true;
  }

  function markSelectedCard(roleKey) {
    selectedRole = roleKey;
    updateCharacterLabelView(labels, { focusedRole: roleKey, width: sceneHost.clientWidth });
    hud.setFocusedRole(roleKey);
  }

  function showFallback() {
    document.querySelector('.office-stage')?.classList.add('is-fallback');
    document.getElementById('sceneFallback').hidden = false;
    firstFrame = false;
    loading?.classList.add('gone');
  }
  function applyIdentities(state) {
    for (const role of config.roles) {
      const identity = state.identities?.[role.key];
      if (!identity) continue;
      role.agentId = identity.agentId;
      role.name = identity.name;
      role.role = identity.role;
      workstations[role.key]?.setIdentity(identity);
    }
    hud.updateRoles(config.roles);
    for (const [key, label] of Object.entries(labels)) {
      label.role = config.roles.find((role) => role.key === key);
      label.tag.setAttribute(
        'aria-label',
        [label.role.name, label.role.role].filter(Boolean).join(' · ')
      );
    }
    updateCharacterLabelView(labels, { focusedRole: selectedRole, width: container.clientWidth });
  }
  listen(document.getElementById('btnLightMode'), 'click', showFallback);
  const loadingTimer = setTimeout(() => {
    if (!disposed && firstFrame) document.getElementById('btnLightMode').hidden = false;
  }, 6500);
  cleanup.push(() => clearTimeout(loadingTimer));
  return {
    setWorkspace,
    updateState(snapshot) {
      if (disposed) return;
      const state = projectCockpitSnapshot(snapshot);
      applyIdentities(state);
      receiveState(state);
      if (staleTimer !== null) clearTimeout(staleTimer);
      staleTimer = setTimeout(() => {
        if (!disposed)
          this.setConnection('offline', 'Status workspace kedaluwarsa. Menghubungkan kembali.');
      }, 20000);
    },
    setConnection(connection, message) {
      if (disposed) return;
      if (!['loading', 'offline', 'error'].includes(connection))
        throw new TypeError('Unknown connection state');
      if (staleTimer !== null) clearTimeout(staleTimer);
      staleTimer = null;
      if (connection === 'loading') {
        presentation.beginSync();
        reconcilePresentation();
      } else receiveState(createDisconnectedState(connection));
      if (message) document.getElementById('systemPhase').textContent = message;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      presentationActive = false;
      if (animationFrame !== null) cancelAnimationFrame(animationFrame);
      if (staleTimer !== null) clearTimeout(staleTimer);
      if (fallbackClockTimer !== null) clearInterval(fallbackClockTimer);
      cleanup
        .splice(0)
        .reverse()
        .forEach((remove) => remove());
      hud.dispose();
      workstationInteraction?.dispose();
      activityController.dispose();
      dialogue.dispose();
      bubbleCoordinator.dispose();
      eventBubbles.clear();
      presentation.dispose();
      disposeCharacterLabels(labels);
      const disposedResources = new Set();
      furnitureScene?.dispose(disposedResources);
      controls?.dispose();
      if (scene) disposeObjectTree(scene, disposedResources);
      environmentTarget?.dispose();
      renderer?.dispose();
      renderer?.forceContextLoss();
      window.dispose();
      entities = {};
      workstations = {};
      labels = {};
      renderer =
        scene =
        camera =
        controls =
        roomScene =
        tvScreen =
        furnitureScene =
        environmentTarget =
          null;
      container.replaceChildren();
      container.classList.remove('cockpit-root');
      delete container.dataset.ready;
      delete container.dataset.sceneReady;
    }
  };
}
