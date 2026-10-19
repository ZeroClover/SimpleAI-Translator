## MODIFIED Requirements

### Requirement: Workflow actions use maintained stable refs
All GitHub Actions workflow files under `.github/workflows/` SHALL use maintained stable action references that are verified during implementation. Workflows MUST NOT use moving development references, deprecated release upload actions, or stale action majors when a maintained stable replacement exists.

The implementation SHALL update action usage where current versions changed inputs, defaults, runner runtime, or output behavior. The implementation SHALL record the checked action-version baseline in a committed release setup document or implementation note.

#### Scenario: Workflow action baseline is documented
- **WHEN** workflow action refs are updated
- **THEN** the repository SHALL contain a checked action-version baseline that lists the old ref, selected ref, and any usage change for each updated action
- **AND** that baseline SHALL cover the workflows currently present in the repository, including release, test-build, lint, and Playwright workflows

#### Scenario: Moving and deprecated refs are removed
- **WHEN** `.github/workflows/` is inspected
- **THEN** workflow action refs SHALL NOT use moving development refs such as development branches
- **AND** release uploads SHALL NOT use deprecated `actions/upload-release-asset` steps
