# Runtime model catalog

## Purpose and baseline

Retrospective baseline recorded on 14 October 2026 for the implemented
[CAT-001 contract](../../changes/archive/2026-10-14-CAT-001-runtime-model-catalog/proposal.md).
Candidate application acceptance is recorded in
[CAT-001 verification](../../changes/archive/2026-10-14-CAT-001-runtime-model-catalog/verification.md).
This baseline describes accepted source behavior; a new production image requires
its own release proof.

## Requirements

### Requirement: Catalog discovery follows the selected context

Agent creation and Profile SHALL load the existing harness-settings endpoint for
the selected harness and effective Local, SSH or registered runtime. Project
profiles SHALL let the server resolve their current inherited workdir/runtime
rather than overriding it with a stale agent runtime. Dashboard loading SHALL not
request a global controller Codex catalog solely to label historical replies.

#### Scenario: A valid SSH harness is selected while controller Codex is unavailable

- **WHEN** the owner selects that SSH workstation and harness
- **THEN** model selection uses its catalog and a controller Codex-cache failure does not become a dashboard banner

#### Scenario: A project's inherited runtime changes

- **WHEN** its current workdir/runtime changes while agent creation or Profile is open
- **THEN** the form follows the current project runtime and discards the previous context's catalog

### Requirement: Availability and failures remain local to model selection

Model selection SHALL expose loading, discovery failure and explicit Refresh.
Creation SHALL require a model from the current successful catalog and an eligible
runtime. Offline, revoked or online-without-catalog registered runtimes SHALL
report their actual unavailable state. An earlier request SHALL not overwrite a
newer selected context.

#### Scenario: An old request completes after a workstation change

- **WHEN** its response arrives after the user selects another workstation
- **THEN** it does not replace the active catalog or error state

#### Scenario: The selected runtime has no usable catalog

- **WHEN** discovery fails or that runtime is offline, revoked or reports no harness catalog
- **THEN** the form explains the local failure and does not create an agent using stale models

### Requirement: Existing access and saved state remain authoritative

Discovery SHALL retain authenticated controller/SSH and workspace-owned registered
runtime access boundaries. Missing native configuration SHALL produce its real
error without mounting host credential directories. Discovery and unsaved form
changes SHALL not invoke provider work or alter native sessions. Refresh SHALL
preserve a saved unavailable model/reasoning rather than selecting a replacement.

#### Scenario: Saved model is absent from the refreshed catalog

- **WHEN** Profile opens or its refresh fails
- **THEN** the saved identifier remains visible as unavailable and is not silently substituted

### Requirement: Historical replies retain recorded model identity

Reply badges SHALL use the run's recorded display name or raw model identifier,
recorded reasoning and actual harness. Today's controller catalog SHALL not
rewrite labels from another runtime or an earlier reply.

#### Scenario: Catalog changes after a reply

- **WHEN** its catalog disappears or a profile changes harness/model
- **THEN** the historical badge continues to show the reply's recorded identity

## Verified boundary

Candidate proof covers browser/API wiring, actual SSH discovery, registered-runtime
availability, local catalog metadata and historical reply fixtures. Catalog and
historical metadata fixtures do not prove native provider execution or quota.
Creation uses the existing workstation-level endpoint, which has no project or
workdir input: project-local OpenCode configuration is not a verified creation
catalog capability. Profile resolves an existing agent's effective workdir through
the server. No backend catalog API or provider adapter is redesigned here.
