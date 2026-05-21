## ADDED Requirements

### Requirement: Workflow actions use maintained stable refs
All GitHub Actions workflow files under `.github/workflows/` SHALL use maintained stable action references that are verified during implementation. Workflows MUST NOT use moving development references, deprecated release upload actions, or stale action majors when a maintained stable replacement exists.

The implementation SHALL update action usage where current versions changed inputs, defaults, runner runtime, or output behavior. The implementation SHALL record the checked action-version baseline in a committed release setup document or implementation note.

#### Scenario: Workflow action baseline is documented
- **WHEN** workflow action refs are updated
- **THEN** the repository SHALL contain a checked action-version baseline that lists the old ref, selected ref, and any usage change for each updated action
- **AND** that baseline SHALL include release, test-build, lint, unit-test, Playwright, and WinGet workflows

#### Scenario: Moving and deprecated refs are removed
- **WHEN** `.github/workflows/` is inspected
- **THEN** workflow action refs SHALL NOT use moving development refs such as development branches
- **AND** release uploads SHALL NOT use deprecated `actions/upload-release-asset` steps

### Requirement: Release workflow triggers from valid version tag globs
The release workflow SHALL trigger from project version tags using GitHub Actions glob syntax, not regular-expression syntax. The selected tag filter SHALL match the existing `vX.Y.Z` release convention or intentionally documented successor convention.

#### Scenario: Version tag trigger matches release tags
- **WHEN** `.github/workflows/release.yaml` is inspected
- **THEN** the `push.tags` filter SHALL use a valid GitHub Actions glob pattern
- **AND** the pattern SHALL match tags such as `v1.2.3`

### Requirement: Release workflow assembles one verified desktop release
The production release workflow SHALL create a draft GitHub Release, build desktop artifacts for supported platforms, verify signing/integrity, upload all release assets, upload the final updater metadata, and publish the draft only after all required artifacts are complete.

Platform build jobs SHALL NOT race to publish conflicting updater metadata. A single release assembly path SHALL be responsible for the final `latest.json` uploaded to the release endpoint.

#### Scenario: Draft release is published only after assembly
- **WHEN** a production release tag build runs
- **THEN** the GitHub Release SHALL remain a draft while platform build, signing, notarization, integrity, and upload jobs run
- **AND** the final publish step SHALL depend on the release assembly path that has uploaded the final updater metadata and release assets

#### Scenario: Final updater metadata is complete
- **WHEN** a production release completes
- **THEN** the release endpoint SHALL provide one final `latest.json`
- **AND** `latest.json` SHALL reference the signed and published desktop artifacts for supported update platforms

### Requirement: Tauri updater endpoint and key continuity are explicit
The release automation SHALL treat the Tauri updater endpoint, GitHub Release target, updater public key, and updater private key as one update contract. The configured updater endpoint SHALL point to the release location that publishes `latest.json`, or the release workflow SHALL explicitly publish updater metadata to the configured endpoint location.

The release setup documentation SHALL explain that the private updater signing key must match the public key embedded in `tauri.conf.json` unless the operator intentionally plans a key rotation with known installed-client impact.

#### Scenario: Updater endpoint matches release target
- **WHEN** release automation is implemented
- **THEN** the configured updater endpoint SHALL match the repository or host where the release workflow publishes final updater metadata
- **AND** any intentional cross-repository updater publication SHALL document the required token and permissions

#### Scenario: Updater key pairing is documented
- **WHEN** a human reads the release setup document
- **THEN** the document SHALL explain how to verify that the updater private key matches the embedded updater public key
- **AND** it SHALL explain the update breakage risk of rotating the updater public key for already installed clients

### Requirement: Tauri updater artifacts are signed after platform code signing
Production desktop release builds SHALL generate Tauri updater artifacts with updater signing enabled. Platform code signing that changes artifact bytes MUST happen before Tauri updater signatures and final updater metadata are generated for those artifacts.

The workflow SHALL provide updater signing credentials only to the jobs or steps that need to generate updater signatures or final updater metadata.

#### Scenario: Windows updater signature is generated after Authenticode signing
- **WHEN** Windows release artifacts are produced
- **THEN** Authenticode signing SHALL complete before the updater signature and final updater metadata for the Windows artifact are published
- **AND** the published Windows updater signature SHALL verify against the published signed Windows artifact

#### Scenario: Updater signing credentials are scoped
- **WHEN** workflow jobs are inspected
- **THEN** updater signing credentials SHALL be provided only to updater artifact signing or metadata generation steps

### Requirement: Windows artifacts are signed with Azure Artifact Signing through Tauri signing
The Windows release path SHALL use Azure Artifact Signing to Authenticode-sign Windows release executables and installers through Tauri's Windows signing path, such as `bundle.windows.signCommand`, before release publication. Authentication SHALL use GitHub OpenID Connect by default, with `id-token: write` granted only to the signing job or workflow scope that needs Azure authentication.

The signing path SHALL use the configured Artifact Signing endpoint, signing account name, certificate profile name, digest, and timestamp settings. The workflow SHALL verify signed Windows files before release assembly.

#### Scenario: Tauri invokes the Windows signer during bundling
- **WHEN** the Windows production build runs
- **THEN** Tauri SHALL invoke a configured Windows signing command or equivalent Tauri-supported signing hook
- **AND** the signing command SHALL use Azure Artifact Signing credentials and profile configuration from the release environment

#### Scenario: Azure OIDC is used for signing
- **WHEN** the Windows signing path authenticates to Azure
- **THEN** it SHALL use OIDC client and tenant configuration by default
- **AND** it SHALL NOT require a long-lived Azure client secret for the default production path

#### Scenario: Signed Windows files verify successfully
- **WHEN** Windows installer files are produced
- **THEN** the workflow SHALL verify their Authenticode signatures before release assembly uploads them
- **AND** failed or missing signature verification SHALL block release publication

### Requirement: macOS artifacts are Developer ID signed and notarized
macOS release jobs SHALL import an Apple Developer ID Application certificate into a temporary keychain and use it for Tauri macOS signing. The temporary keychain SHALL be usable by `codesign`, either as the default keychain or through the current user's keychain search list. The workflow SHALL provide notarization credentials through a documented Apple ID app-specific password path, an App Store Connect API path, or both.

The implementation SHALL audit whether a custom entitlements file is required for the app's current macOS features and add one only when required.

#### Scenario: Certificate is imported only for macOS release jobs
- **WHEN** a macOS release job runs
- **THEN** it SHALL import the base64 `.p12` certificate into a temporary keychain
- **AND** it SHALL set the signing identity used by the Tauri build
- **AND** non-macOS jobs SHALL NOT receive Apple certificate secrets

#### Scenario: macOS release output is notarized
- **WHEN** macOS `.app` or `.dmg` artifacts are produced for a production release
- **THEN** the workflow SHALL complete signing and notarization verification before release assembly publishes the final release

### Requirement: Release setup documentation covers all human-owned release configuration
The repository SHALL include a human-facing release setup document for GitHub Actions secrets and variables. The document SHALL explain what each value is, where to configure it in GitHub, which workflow consumes it, how a human creates or obtains the underlying external resource, and the rotation, revocation, or loss impact.

The document SHALL cover all release configuration needed for:

- Built-in GitHub release publication token.
- Protected GitHub release environment and tag/reviewer policy.
- Tauri updater signing key pair and updater endpoint.
- Apple Developer account, Developer ID certificate export, signing identity, and notarization credentials.
- Azure Artifact Signing account, identity validation, certificate profile, OIDC federated credential, RBAC role assignment, endpoint, and account/profile names.
- Windows installer publication and WinGet token.
- Linux artifact integrity, including checksum publication.
- Explicitly non-required credentials for removed or disabled features, such as telemetry/crash reporting.

#### Scenario: Documentation includes resource creation guidance
- **WHEN** a human reads the release setup document
- **THEN** they SHALL find steps to create or obtain the Tauri updater key pair, Apple Developer ID certificate and notarization credentials, Azure Artifact Signing resources and OIDC identity, WinGet token, and Linux checksum outputs
- **AND** the document SHALL distinguish GitHub Actions secrets from non-secret variables

#### Scenario: Documentation maps values to workflows
- **WHEN** a required release secret or variable appears in a workflow
- **THEN** the release setup document SHALL list that value
- **AND** the document SHALL name the workflow or job that consumes it

### Requirement: Workflow permissions and secret exposure are scoped
Release workflows SHALL use least-privilege job permissions. Release creation and asset upload jobs SHALL receive `contents: write`; Azure signing jobs SHALL receive `id-token: write`; jobs that only read code SHALL receive read-only permissions. Workflows MUST NOT export all repository secrets into the job environment.

Each signing, notarization, and upload step SHALL explicitly list only the secrets needed by that step.

#### Scenario: Release jobs use explicit permissions
- **WHEN** the release workflow is inspected
- **THEN** jobs that publish releases or upload release assets SHALL explicitly request `contents: write`
- **AND** Azure signing jobs SHALL explicitly request `id-token: write`
- **AND** jobs SHALL NOT request unused write permissions such as package publication permissions without a corresponding package publication step

#### Scenario: Secret use is explicit
- **WHEN** workflow jobs are inspected
- **THEN** release, signing, notarization, and upload steps SHALL map their required secrets explicitly
- **AND** workflow-level or job-level blanket export of repository secrets SHALL NOT be used

### Requirement: WinGet publication uses the selected signed Windows installer
The WinGet publication workflow SHALL consume only signed Windows installers from a published release. Its installer matching pattern SHALL match the actual signed Windows installer format generated by the release workflow. The WinGet package identifier SHALL be intentionally chosen and documented; it MUST NOT remain a stale historical identifier by accident.

#### Scenario: WinGet pattern matches release assets
- **WHEN** a production release publishes signed Windows installer assets
- **THEN** the WinGet workflow SHALL match those signed installer assets
- **AND** it SHALL NOT look only for an installer extension that the release workflow does not produce

#### Scenario: WinGet identity decision is documented
- **WHEN** the WinGet workflow is updated
- **THEN** the release setup document or implementation notes SHALL explain whether the workflow continues an existing WinGet package identifier or publishes under a new rebranded identifier

### Requirement: Linux release artifacts include checksums
Linux release artifacts SHALL include SHA-256 checksum metadata so users can verify downloaded `.deb` and AppImage artifacts.

#### Scenario: Linux checksums are published
- **WHEN** Linux release artifacts are uploaded
- **THEN** the release SHALL include checksum metadata covering the uploaded Linux desktop artifacts

### Requirement: Test and validation workflows use the same release assumptions
Manual test-build and validation workflows SHALL use the same current action versions, package manager setup strategy, Rust toolchain strategy, Linux dependency set, and Tauri build command shape as the production release workflow where practical. Test workflows MUST NOT publish production releases.

#### Scenario: Test build does not publish a production release
- **WHEN** `workflow_dispatch` test build runs
- **THEN** it SHALL build representative Tauri desktop artifacts
- **AND** it SHALL upload workflow artifacts or otherwise expose build outputs for inspection
- **AND** it SHALL NOT publish or mutate a production GitHub Release

#### Scenario: Validation covers workflow syntax and release invariants
- **WHEN** workflow files are changed for this capability
- **THEN** the implementation SHALL run a local workflow/static validation command where available, or otherwise document why validation was limited
- **AND** validation SHALL include checks for tag trigger syntax, action refs, permission scope, updater endpoint consistency, and release asset assembly dependencies
