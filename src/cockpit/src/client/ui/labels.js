import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { Vector3 } from 'three';
import { OFFICE_ROLES } from '../../shared/office-contract.js';

export function roleIdentity(role) {
  return [role?.name, role?.role, role?.role && role.slug === 'hq' ? 'HQ' : '']
    .filter(Boolean)
    .join(' · ');
}

export const BUBBLE_LABELS = Object.freeze({
  event: 'Riwayat publik',
  work: 'Tugas publik',
  'role-description': 'Deskripsi peran',
  dialogue: 'Suasana ilustratif'
});

export function normalizeSpeechBubble(bubble) {
  const text =
    typeof bubble?.text === 'string'
      ? bubble.text
          .replace(/[\p{Cc}\s]+/gu, ' ')
          .trim()
          .slice(0, 160)
      : '';
  if (!text || !Object.hasOwn(BUBBLE_LABELS, bubble?.kind)) return null;
  return Object.freeze({ kind: bubble.kind, text });
}

export function setupCharacterLabels(characterEntities, onAgentClick, roles = OFFICE_ROLES) {
  const labelMap = {};

  Object.entries(characterEntities).forEach(([key, char]) => {
    const role = roles.find((item) => item.key === key);
    const container = document.createElement('div');
    container.className = 'character-label-container person';
    container.setAttribute('aria-hidden', 'false');
    container.style.display = 'flex';
    container.style.flexDirection = 'column';
    container.style.alignItems = 'center';
    container.style.gap = '4px';
    container.style.pointerEvents = 'none';
    container.style.setProperty('--c', role?.color || '#3f615c');

    // Speech Bubble (hidden by default, shown during activity)
    const bubble = document.createElement('div');
    bubble.className = 'speech-bubble bubble hide';
    bubble.id = `bubble-${key}`;
    bubble.textContent = '';
    bubble.setAttribute('aria-hidden', 'true');
    bubble.hidden = true;
    bubble.style.display = 'none';
    container.appendChild(bubble);

    // Identity Tag Badge (1:1 kantor-agent)
    const tag = document.createElement('div');
    tag.className = 'agent-tag tag';
    tag.id = `tag-${key}`;
    tag.setAttribute('role', 'button');
    tag.setAttribute('tabindex', '0');
    tag.setAttribute('aria-label', roleIdentity(role) || key);
    tag.style.setProperty('--tag-color', role?.color || '#3f615c');
    tag.style.pointerEvents = 'auto';
    tag.style.cursor = 'pointer';
    tag.textContent = role?.name || key.replace(/_/g, ' ');
    container.appendChild(tag);

    const handleClick = (e) => {
      e.stopPropagation();
      if (typeof onAgentClick === 'function') {
        onAgentClick(key);
      }
    };
    const handleKeydown = (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        e.stopPropagation();
        if (typeof onAgentClick === 'function') {
          onAgentClick(key);
        }
      }
    };
    tag.addEventListener('click', handleClick);
    tag.addEventListener('keydown', handleKeydown);

    const labelObject = new CSS2DObject(container);
    labelObject.position.set(0, char.hips.position.y + 1.32, 0);
    char.root.add(labelObject);

    labelMap[key] = {
      container,
      role,
      bubble,
      tag,
      labelObject,
      requestedVisible: true,
      projected: new Vector3(),
      bubbleTimer: null,
      bubbleRecord: null,
      dispose() {
        tag.removeEventListener('click', handleClick);
        tag.removeEventListener('keydown', handleKeydown);
        labelObject.removeFromParent();
        container.remove();
      }
    };
  });

  return labelMap;
}

export function updateCharacterLabelView(labelMap, { focusedRole = null, width = 0 } = {}) {
  Object.entries(labelMap).forEach(([key, label]) => {
    const role = label.role || OFFICE_ROLES.find((item) => item.key === key);
    const isUnmapped = role?.agentId === null;
    label.requestedVisible = !isUnmapped && (focusedRole ? focusedRole === key : width >= 600);
    label.labelObject.visible = label.requestedVisible;
    label.tag.title = roleIdentity(role);
    label.tag.textContent = focusedRole ? roleIdentity(role) : role?.name || key.replace(/_/g, ' ');
  });
}

export function updateCharacterLabelPositions(labelMap, entities, camera) {
  camera.updateMatrixWorld(true);
  for (const [key, label] of Object.entries(labelMap)) {
    const parentVisible = entities[key]?.root?.visible !== false;
    label.labelObject.position.y = entities[key].hips.position.y + 1.32;
    label.labelObject.getWorldPosition(label.projected).project(camera);
    label.labelObject.visible =
      parentVisible &&
      label.requestedVisible &&
      Math.abs(label.projected.x) <= 1 &&
      Math.abs(label.projected.y) <= 1 &&
      Math.abs(label.projected.z) <= 1;
    label.container.style.display = label.labelObject.visible ? 'flex' : 'none';
  }
}

export function clearSpeechBubble(labelMap, roleKey) {
  const label = labelMap[roleKey];
  if (!label) return;
  if (label.bubbleTimer !== null) {
    clearTimeout(label.bubbleTimer);
  }
  label.bubbleTimer = null;
  label.bubbleRecord = null;
  label.bubble.textContent = '';
  label.bubble.className = 'speech-bubble bubble hide';
  delete label.bubble.dataset.kind;
  label.bubble.hidden = true;
  label.bubble.style.display = 'none';
}

export function clearSpeechBubbles(labelMap) {
  for (const roleKey of Object.keys(labelMap)) clearSpeechBubble(labelMap, roleKey);
}

export function renderSpeechBubble(labelMap, roleKey, bubble, { coordinated = false } = {}) {
  const label = labelMap[roleKey];
  if (!label) return false;
  clearSpeechBubble(labelMap, roleKey);
  const record = normalizeSpeechBubble(bubble);
  if (!record) return false;
  label.bubbleRecord = record;
  label.bubble.dataset.kind = record.kind;
  const cls = bubble.cls ? `speech-bubble bubble ${bubble.cls}` : 'speech-bubble bubble';
  label.bubble.className = cls;
  if (coordinated) {
    label.bubble.textContent = record.text;
  } else {
    label.bubble.textContent = `${BUBBLE_LABELS[record.kind]}: ${record.text}`;
  }
  label.bubble.hidden = false;
  label.bubble.style.display = 'block';
  return true;
}

export function updateSpeechBubble(labelMap, roleKey, bubble, durationMs = 6000) {
  if (!renderSpeechBubble(labelMap, roleKey, bubble)) return false;
  const label = labelMap[roleKey];
  const record = label.bubbleRecord;

  const delay = Number.isFinite(durationMs) ? Math.max(100, Math.min(20000, durationMs)) : 6000;
  label.bubbleTimer = setTimeout(() => {
    if (label.bubbleRecord === record) clearSpeechBubble(labelMap, roleKey);
  }, delay);
  return true;
}

export function disposeCharacterLabels(labelMap) {
  clearSpeechBubbles(labelMap);
  for (const label of Object.values(labelMap)) label.dispose?.();
}
