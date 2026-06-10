## 1. Audit Release Inputs

- [x] 1.1 Re-check current stable versions and usage notes for every action used by `.github/workflows/`, including `tauri-action` inputs such as `updaterJsonPreferNsis`, then record the selected action baseline in a committed release setup document or implementation note.
- [x] 1.2 Audit current release outputs, Tauri bundle targets, updater endpoint, updater public key, release repository, WinGet identifier, and workflow secret/variable references.
- [x] 1.3 Decide and document the Windows installer format: keep signed NSIS `.exe` as the default unless MSI is intentionally added for a concrete release or WinGet requirement.

## 2. Modernize CI and Release Workflow Foundations

- [x] 2.1 Update workflow action refs and usage, removing moving refs, deprecated release upload actions, and avoidable helper actions.
- [x] 2.2 Align Node, pnpm, Rust toolchain, lockfile install mode, and Ubuntu dependency setup across production release and representative test-build workflows.
- [x] 2.3 Replace version helper action usage with shell outputs for both the full tag and `v`-stripped version, then update all downstream version consumers.
- [x] 2.4 Fix the release tag trigger to use GitHub Actions glob syntax for `vX.Y.Z` release tags and add release workflow concurrency keyed by tag.
- [x] 2.5 Replace blanket secret export and unused write permissions with explicit per-job permissions and per-step secret mappings.

## 3. Restructure Release Assembly and Updater Metadata

- [x] 3.1 Change platform build jobs to produce workflow artifacts, with one release assembly path responsible for release asset upload, final `latest.json`, checksums, and draft publication.
- [x] 3.2 Reconcile the Tauri updater endpoint with the actual release target, or document and implement intentional cross-repository updater publication.
- [x] 3.3 Ensure updater signing credentials are scoped only to steps that generate updater signatures or final updater metadata.
- [x] 3.4 Publish SHA-256 checksum metadata for Linux release artifacts.

## 4. Implement Windows Azure Artifact Signing

- [x] 4.1 Add the Windows Azure Artifact Signing setup needed by Tauri's `bundle.windows.signCommand` or equivalent Tauri-supported signing hook.
- [x] 4.2 Configure Azure OIDC authentication, including release-environment subject/audience guidance and Artifact Signing Certificate Profile Signer role requirements.
- [x] 4.3 Ensure Windows Authenticode signing happens before updater signatures and final updater metadata are generated.
- [x] 4.4 Verify Authenticode signatures and the published Windows updater signature before release assembly uploads Windows assets.

## 5. Implement macOS Signing and Notarization

- [x] 5.1 Import the base64 Developer ID Application `.p12` certificate into a temporary keychain, make that keychain discoverable to `codesign`, and set the Tauri signing identity.
- [x] 5.2 Configure Apple notarization using the documented Apple ID app-specific password path, App Store Connect API path, or both.
- [x] 5.3 Audit whether the current app needs custom macOS entitlements and add an entitlements file only if required.
- [x] 5.4 Verify macOS signing and notarization evidence with bounded retry behavior before release publication.

## 6. Document Human Setup Requirements

- [x] 6.1 Create `docs/release-github-actions-secrets.md` with required GitHub Actions secrets and variables grouped by GitHub release environment, Tauri updater, Apple, Azure Artifact Signing, WinGet, and Linux integrity.
- [x] 6.2 Document how to generate, back up, verify, rotate, and recover from loss or compromise of the Tauri updater signing key pair, including the embedded public key relationship.
- [x] 6.3 Document how to obtain/export the Apple Developer ID Application certificate, identify the signing identity, configure notarization credentials, and avoid confusing app-specific passwords with Apple ID login passwords.
- [x] 6.4 Document how to create Azure Artifact Signing resources, complete identity validation, create a certificate profile, assign RBAC, configure GitHub OIDC federated credentials, and record supported-region/prerequisite limits.
- [x] 6.5 Document how to create the WinGet publishing token, which account/scope it should use, which installer format it consumes, and whether the package identifier is retained or changed.
- [x] 6.6 Mark `GITHUB_TOKEN` as built in and list explicitly non-required credentials such as telemetry or crash-reporting secrets.

## 7. Validate

- [x] 7.1 Run `openspec validate automate-release-github-actions --strict`.
- [x] 7.2 Run a workflow syntax/static validation tool such as `actionlint` if available, or document why local workflow validation is limited.
- [x] 7.3 Confirm workflow checks cover tag trigger syntax, action refs, permission scope, absence of blanket secret export, updater endpoint consistency, and release assembly dependencies.
- [x] 7.4 Run relevant local checks for workflow/docs-only changes.
