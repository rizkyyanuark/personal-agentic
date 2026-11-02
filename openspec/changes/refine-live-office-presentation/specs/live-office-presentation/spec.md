## ADDED Requirements

### Requirement: Office activity is passive
The feed SHALL show name, time and actual action without completion/tool badges or links into personal-agentic. Work history and true failure descriptions SHALL remain.

#### Scenario: Finished work remains visible
- **WHEN** a real step finishes
- **THEN** its text remains without a Selesai badge or Lihat run link

### Requirement: Cards describe activity without decorative labels
Idle cards SHALL show Santai and their current scene action with waiting context, without Kegiatan visual. Finished runs SHALL return directly to Santai. Failure/offline/waiting facts SHALL remain explicit.

#### Scenario: Agent finishes and plays guitar
- **WHEN** a successful run ends and the character plays guitar
- **THEN** the card shows Santai, Bermain gitar and waiting context, without transient Selesai

### Requirement: Bubbles remain readable and consistent
All bubble surfaces/tails SHALL use the same white palette. Work previews SHALL be limited to 48 graphemes, visible text to three desktop/two mobile lines, with full details preserved outside bubbles. Mobile SHALL show work details on cards rather than floating work bubbles.

#### Scenario: Long work description
- **WHEN** an actual work description contains multiple long paths
- **THEN** desktop shows a short ellipsized preview, mobile relies on the card, and full details remain available

### Requirement: Guitar playing is anatomically right-handed
The unreflected guitar SHALL face forward with its neck raised toward the character's anatomical left, the left hand fretting and the right hand strumming. The body SHALL clear the torso and hand contacts SHALL follow actual geometry in all poses.

#### Scenario: Guitar animation and reduced motion
- **WHEN** any of the five characters plays guitar with animation enabled or reduced
- **THEN** orientation, surfaces, hand contacts and clearances remain coherent without reflection or penetration

### Requirement: Completion speech requires observed success
Beres speech SHALL require a fresh visible transition from one observed working run to idle, with no remaining active runs and an explicit succeeded latest result matching that observed run. Missing or ambiguous provenance SHALL suppress success speech.

#### Scenario: Actual run succeeds
- **WHEN** a single observed working run ends with succeeded and its ID matches the latest result
- **THEN** one completion bubble may appear

#### Scenario: Run fails or is cancelled
- **WHEN** a run ends failed, cancelled, timed_out or interrupted
- **THEN** no Beres or other completion-success bubble is emitted and factual history remains

#### Scenario: Old success or ambiguous work
- **WHEN** the result belongs to another run, metadata is absent, data was stale, or multiple observed runs remain ambiguous
- **THEN** idle does not imply successful completion speech
