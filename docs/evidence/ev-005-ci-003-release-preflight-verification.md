# Evidence EV-005: CI-003 Release Preflight & Diagnostics Verification

**Issue**: [GitLab #5](https://gitlab.tugasakhir.space/rizkyyanuark/personal-agentic/-/work_items/5)  
**Dokumen Terkait**: [openspec/changes/CI-003-simple-automatic-releases/proposal.md](../../openspec/changes/CI-003-simple-automatic-releases/proposal.md), [verification.md](../../openspec/changes/CI-003-simple-automatic-releases/verification.md), [tasks.md](../../openspec/changes/CI-003-simple-automatic-releases/tasks.md)  
**Tanggal Eksekusi**: 2026-10-14 02:57:08 UTC+7  
**Penguji**: Antigravity Assistant & Developer  

---

## Ringkasan Eksekusi

Verifikasi pembaruan rilis CI-003 mencakup:
1. Validasi preflight disk buffer (+512MB) dan SSH runtime key sebelum container shutdown (`compose("stop")`).
2. Pembersihan dummy path `/home/ubuntu/workspace/production` dari `release.py` dan `release_test.py`.
3. Sanitasi log diagnosa kegagalan pada `deploy.py` dari raw secrets/private paths.
4. Pengujian komprehensif pada kernel Linux (WSL Ubuntu 24.04 as root).

---

## Log Eksekusi Nyata

### 1. Production Release Test Suite (`release_test.py`)

Command:
```bash
wsl -u root python3 -B infra/production/tests/release_test.py
```

Output:
```text
test_archive_manifest_and_private_config_symlinks_are_refused (__main__.BackupAndDatabaseTests.test_archive_manifest_and_private_config_symlinks_are_refused) ... ok
test_backup_outside_fixed_directory_and_symlink_are_refused (__main__.BackupAndDatabaseTests.test_backup_outside_fixed_directory_and_symlink_are_refused) ... ok
test_exact_three_real_archives_and_sqlite_schema_are_verified (__main__.BackupAndDatabaseTests.test_exact_three_real_archives_and_sqlite_schema_are_verified) ... ok
test_invalid_manifest_hash_is_refused (__main__.BackupAndDatabaseTests.test_invalid_manifest_hash_is_refused) ... ok
test_manifest_wrong_image_schema_or_archive_set_is_refused (__main__.BackupAndDatabaseTests.test_manifest_wrong_image_schema_or_archive_set_is_refused) ... ok
test_modified_or_missing_archive_is_refused (__main__.BackupAndDatabaseTests.test_modified_or_missing_archive_is_refused) ... ok
test_nonprivate_directory_archive_or_config_is_refused (__main__.BackupAndDatabaseTests.test_nonprivate_directory_archive_or_config_is_refused) ... ok
test_nonroot_archive_ownership_is_refused (__main__.BackupAndDatabaseTests.test_nonroot_archive_ownership_is_refused) ... ok
test_preflight_refuses_insufficient_disk_space_or_missing_key (__main__.BackupAndDatabaseTests.test_preflight_refuses_insufficient_disk_space_or_missing_key) ... ok
test_real_sqlite_operations_are_counted_without_changing_schema (__main__.BackupAndDatabaseTests.test_real_sqlite_operations_are_counted_without_changing_schema) ... ok
test_real_sqlite_schema_drift_changes_fingerprint (__main__.BackupAndDatabaseTests.test_real_sqlite_schema_drift_changes_fingerprint) ... ok
test_real_busy_state_refuses_before_pull_stop_or_image_replacement (__main__.BusyReleaseTests.test_real_busy_state_refuses_before_pull_stop_or_image_replacement) ... ok
test_conflicting_failed_evidence_refuses_without_rewriting_records (__main__.FinalizationTests.test_conflicting_failed_evidence_refuses_without_rewriting_records) ... ok
test_evidence_symlink_refuses_without_touching_target_or_current (__main__.FinalizationTests.test_evidence_symlink_refuses_without_touching_target_or_current) ... ok
test_failed_evidence_retained_and_actual_journal_finalized_privately (__main__.FinalizationTests.test_failed_evidence_retained_and_actual_journal_finalized_privately) ... ok
test_real_current_write_failure_retains_replayable_verified_pending (__main__.FinalizationTests.test_real_current_write_failure_retains_replayable_verified_pending) ... ok
test_replay_verified_pending_after_partial_current_write (__main__.FinalizationTests.test_replay_verified_pending_after_partial_current_write) ... ok
test_actual_tcp_reset_then_healthy_service (__main__.ReadinessTests.test_actual_tcp_reset_then_healthy_service) ... ok
test_auth_request_transport_failure_is_not_replayed (__main__.ReadinessTests.test_auth_request_transport_failure_is_not_replayed) ... ok
test_deadline_clears_timer_and_restores_previous_handler (__main__.ReadinessTests.test_deadline_clears_timer_and_restores_previous_handler) ... ok
test_disconnect_and_truncated_health_then_healthy_service (__main__.ReadinessTests.test_disconnect_and_truncated_health_then_healthy_service) ... ok
test_existing_alarm_is_preserved_and_refused_before_network (__main__.ReadinessTests.test_existing_alarm_is_preserved_and_refused_before_network) ... ok
test_healthy_response_uses_only_anonymous_health_get (__main__.ReadinessTests.test_healthy_response_uses_only_anonymous_health_get) ... ok
test_invalid_timing_is_rejected_before_network (__main__.ReadinessTests.test_invalid_timing_is_rejected_before_network) ... ok
test_persistent_failure_and_invalid_payload_have_sanitized_deadline (__main__.ReadinessTests.test_persistent_failure_and_invalid_payload_have_sanitized_deadline) ... ok
test_slow_drip_healthy_body_cannot_outlive_total_budget (__main__.ReadinessTests.test_slow_drip_healthy_body_cannot_outlive_total_budget) ... ok
test_slow_http_request_is_bounded_by_remaining_budget (__main__.ReadinessTests.test_slow_http_request_is_bounded_by_remaining_budget) ... ok
test_already_verified_candidate_without_pending_is_unchanged (__main__.RequestAndIdentityTests.test_already_verified_candidate_without_pending_is_unchanged) ... ok
test_failed_promotion_matches_verified_predecessor (__main__.RequestAndIdentityTests.test_failed_promotion_matches_verified_predecessor) ... ok
test_first_promotion_predecessor_does_not_require_older_previous_record (__main__.RequestAndIdentityTests.test_first_promotion_predecessor_does_not_require_older_previous_record) ... ok
test_partial_current_write_requires_exact_verified_transaction (__main__.RequestAndIdentityTests.test_partial_current_write_requires_exact_verified_transaction) ... ok
test_partial_previous_write_can_be_replayed (__main__.RequestAndIdentityTests.test_partial_previous_write_can_be_replayed) ... ok
test_recover_parser_rejects_unknown_duplicate_fields_and_rollback_ack (__main__.RequestAndIdentityTests.test_recover_parser_rejects_unknown_duplicate_fields_and_rollback_ack) ... ok
test_recover_parser_requires_digest_full_commit_and_svg (__main__.RequestAndIdentityTests.test_recover_parser_requires_digest_full_commit_and_svg) ... ok
test_request_identity_mismatch_does_not_mutate_ledger (__main__.RequestAndIdentityTests.test_request_identity_mismatch_does_not_mutate_ledger) ... ok
test_rollback_missing_or_failed_predecessor_and_stale_current_are_refused (__main__.RequestAndIdentityTests.test_rollback_missing_or_failed_predecessor_and_stale_current_are_refused) ... ok
test_source_restart_guard_uses_real_schema_and_unchanged_private_journal (__main__.SourceRestartTests.test_source_restart_guard_uses_real_schema_and_unchanged_private_journal) ... ok
test_source_restart_refuses_candidate_journal_or_changed_predecessor (__main__.SourceRestartTests.test_source_restart_refuses_candidate_journal_or_changed_predecessor) ... ok

----------------------------------------------------------------------
Ran 38 tests in 33.783s

OK
```

### 2. CI Deploy Client Test Suite (`deploy_test.py`)

Command:
```bash
wsl python3 -B infra/ci/tests/deploy_test.py
```

Output:
```text
..........
----------------------------------------------------------------------
Ran 10 tests in 1.875s

OK
```

### 3. Inventory Hygiene Check

Command:
```bash
wsl grep -rn "workspace/production" infra/production/release.py
```

Output:
```text
(0 matches, exit code 1)
```
