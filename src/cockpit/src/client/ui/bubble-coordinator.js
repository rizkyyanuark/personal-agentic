import {
  BUBBLE_LABELS,
  clearSpeechBubble,
  normalizeSpeechBubble,
  renderSpeechBubble
} from './labels.js';

const KIND_PRIORITY = Object.freeze({ work: 3, 'role-description': 3, event: 2, dialogue: 1 });
const DIALOGUE_TURNS = new Set(['opener', 'reply', 'comment']);

function priority(candidate, selectedRole) {
  return (candidate.roleKey === selectedRole ? 10 : 0) + (KIND_PRIORITY[candidate.kind] || 0);
}

export function createBubbleCoordinator({ labelMap }) {
  const records = Object.entries(labelMap).map(([roleKey, label]) => {
    clearSpeechBubble(labelMap, roleKey);
    return {
      roleKey,
      label,
      candidateId: null,
      shown: false
    };
  });
  const byRole = new Map(records.map((record) => [record.roleKey, record]));
  let details = [];
  let disposed = false;

  function hide(record) {
    record.label.bubble.className = 'speech-bubble bubble hide';
    record.label.bubble.hidden = true;
    record.label.bubble.style.display = 'none';
    record.shown = false;
  }

  function clear() {
    details = [];
    for (const record of records) {
      clearSpeechBubble(labelMap, record.roleKey);
      hide(record);
      record.candidateId = null;
    }
  }

  function update({ camera, width, height, selectedRole = null, gates, candidates = [] }) {
    if (disposed) return;
    if (!gates?.dataFresh || !gates?.visible || !camera || !(width > 0) || !(height > 0)) {
      clear();
      return;
    }
    const seen = new Set();
    details = candidates.flatMap((candidate) => {
      const bubble = normalizeSpeechBubble(candidate);
      if (
        !bubble ||
        typeof candidate.id !== 'string' ||
        seen.has(candidate.id) ||
        !byRole.has(candidate.roleKey) ||
        (bubble.kind === 'dialogue' && !gates.allowAmbient)
      ) {
        return [];
      }
      seen.add(candidate.id);
      return [
        {
          id: candidate.id,
          roleKey: candidate.roleKey,
          cls: candidate.cls || '',
          ...bubble,
          turn:
            bubble.kind === 'dialogue' && DIALOGUE_TURNS.has(candidate.turn)
              ? candidate.turn
              : null,
          label: BUBBLE_LABELS[bubble.kind]
        }
      ];
    });

    if (!details.length) {
      clear();
      return;
    }

    const ranked = [...details].sort(
      (a, b) =>
        priority(b, selectedRole) - priority(a, selectedRole) ||
        Number(b.turn === 'reply') - Number(a.turn === 'reply')
    );
    const chosen = new Map();
    for (const candidate of ranked) {
      if (!chosen.has(candidate.roleKey)) chosen.set(candidate.roleKey, candidate);
    }

    const limit = width <= 820 ? 1 : 2;
    const visibleRoles = new Set();

    for (const candidate of ranked) {
      if (visibleRoles.size >= limit || visibleRoles.has(candidate.roleKey)) continue;
      const record = byRole.get(candidate.roleKey);
      if (!record || chosen.get(candidate.roleKey) !== candidate) continue;

      const current = record.label.bubbleRecord;
      if (current?.kind !== candidate.kind || current?.text !== candidate.text) {
        renderSpeechBubble(labelMap, record.roleKey, candidate, { coordinated: true });
      }
      if (candidate.cls) {
        record.label.bubble.className = `speech-bubble bubble ${candidate.cls}`;
      } else {
        record.label.bubble.className = 'speech-bubble bubble';
      }
      record.label.bubble.hidden = false;
      record.label.bubble.style.display = 'block';
      record.candidateId = candidate.id;
      record.shown = true;
      visibleRoles.add(candidate.roleKey);
    }

    for (const record of records) {
      if (!visibleRoles.has(record.roleKey)) {
        if (record.label.bubbleRecord) clearSpeechBubble(labelMap, record.roleKey);
        record.candidateId = null;
        hide(record);
      }
    }
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    clear();
  }

  return { update, clear, getDetails: () => details.map((detail) => ({ ...detail })), dispose };
}
