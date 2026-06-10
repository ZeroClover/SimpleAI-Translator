## Context

The repository already has GitHub Actions workflows for release, test builds, lint, unit tests, Playwright, and WinGet publication. The release workflow creates a draft GitHub Release from a `vX.Y.Z` tag, builds a shared Tauri renderer, builds Linux/macOS/Windows Tauri bundles, uploads extension/userscript assets, and then publishes the release.

Several release-critical details are currently implicit or stale:

- CI uses older Node-based action majors such as `actions/setup-node@v3`, `pnpm/action-setup@v2`, and `actions/github-script@v6`.
- Test build uses `tauri-apps/tauri-action@dev`, and lint uses `LoliGothick/rustfmt-check@master`, which are moving references.
- Release asset upload still uses `actions/upload-release-asset@v1`, which has no maintained newer release path.
- Release tags are configured with a regex-looking pattern, but GitHub Actions tag filters use glob syntax.
- The git remote is `ZeroClover/SimpleAI-Translator`, while the configured Tauri updater endpoint still points at `nextai-translator/nextai-translator`.
- Windows bundle signing fields in `src-tauri/tauri.conf.json` are empty, so Windows release artifacts are not Authenticode-signed.
- The current WinGet workflow searches only for `.msi` installers, while the Tauri bundle targets currently include NSIS but not MSI.
- The release workflow exports all repository secrets into job environment variables through `oNaiPs/secrets-to-env-action`, which is broader than needed for a production release.
- The human-owned setup needed for Tauri updater signing, Apple Developer ID signing/notarization, Azure Artifact Signing, and WinGet is not documented in one operator-facing place.

Reference baseline checked on 2026-05-21:

| Action | Current use | Checked stable target |
| --- | --- | --- |
| `actions/checkout` | `v4` | `v6.0.2` / major `v6` |
| `actions/setup-node` | `v3` | `v6.4.0` / major `v6` |
| `pnpm/action-setup` | `v2` | `v6.0.8` / major `v6` |
| `actions/upload-artifact` | `v4` | `v7.0.1` / major `v7` |
| `actions/download-artifact` | `v4` | `v8.0.1` / major `v8` |
| `actions/github-script` | `v6` | remove for release publication; use GitHub CLI unless a script step remains necessary |
| `tauri-apps/tauri-action` | `v0`, `dev` | `action-v0.6.2` / tag `v0.6.2` |
| `ncipollo/release-action` | `v1` | remove for release publication; use GitHub CLI unless a release-action-specific feature is required |
| `battila7/get-version-action` | `v2` | `v2.2.1`, or replace with shell parsing of `github.ref_name` |
| `oNaiPs/secrets-to-env-action` | `v1` | remove rather than upgrade |
| `crate-ci/typos` | `v1.16.10` | `v1.46.2` |
| `dtolnay/rust-toolchain` | `nightly` | keep the action if needed, but audit whether the toolchain can move to stable or a pinned date |
| `vedantmgoyal2009/winget-releaser` | `v2` | `v2` |
| `azure/artifact-signing-action` | new | `v2.0.0` if a post-build signing action is still needed |
| `azure/login` | new | `v3.0.0` |

Implementation must re-check these versions before editing workflows because action releases can change between proposal and implementation.

## Goals / Non-Goals

**Goals:**

- Modernize workflow `uses:` references to maintained stable refs and remove moving `@dev` / `@master` refs.
- Update workflow syntax where newer action majors changed runtime, inputs, or defaults.
- Correct the release tag trigger to use GitHub Actions glob syntax for the project's version tags.
- Make the release target, updater endpoint, updater public key, and updater private key requirements explicit.
- Add Windows signing through Tauri's `bundle.windows.signCommand` path so Windows executable and installer Authenticode signatures are applied before Tauri updater signatures and final metadata are generated.
- Keep Tauri updater bundle signatures and final `latest.json` publication intact for desktop updates.
- Make macOS release artifacts Developer ID signed and notarized, with clear CI keychain setup.
- Document every required human-created GitHub secret or variable, including how to obtain the underlying external resource.
- Keep release workflow permissions scoped by job, especially for GitHub release writes and Azure OIDC.

**Non-Goals:**

- Do not change browser extension store ownership, Chrome/Firefox extension IDs, or signing identity.
- Do not add passive analytics, telemetry, crash reporting, or release tracking SDKs.
- Do not introduce a custom update server; GitHub Releases remain the updater artifact host.
- Do not replace Tauri with a separate packaging system.
- Do not add an alternative Windows signing provider unless the user explicitly decides not to proceed with Azure Artifact Signing.

## Decisions

### Use checked stable action refs, and remove avoidable helper actions

Use current stable refs during implementation, preferring exact release tags for third-party actions where practical. Replace `battila7/get-version-action` with a small shell step based on `github.ref_name`, and expose both the tag value and the `v`-stripped version for every downstream `VERSION`, artifact-name, and release-metadata consumer. Replace release creation, upload, and publication helper actions with GitHub CLI commands (`gh release create`, `gh release upload`, `gh release edit`) so release behavior is owned by one tool in the assembly path. Replace `LoliGothick/rustfmt-check@master` / `giraffate/clippy-action@v1` with direct `cargo fmt --check` and `cargo clippy` commands unless PR review annotations are intentionally preserved.

Alternatives considered:

- Keep broad major tags everywhere: simpler maintenance, but less deterministic for production release signing.
- Pin every action by full SHA: stronger supply-chain control, but higher maintenance overhead. This can be revisited for release-critical actions, but it is not required for this change unless the implementation owner wants that policy.

### Use package-managed pnpm and a reproducible install path

Use `pnpm/action-setup@v6` without a hard-coded pnpm version so it reads `packageManager: pnpm@9.1.3` from `package.json`. Keep `actions/setup-node@v6` with the repo's current Node target and explicit `cache: pnpm`. Release and representative test builds should use `pnpm install --frozen-lockfile` unless the implementation finds a concrete lockfile issue and documents the exception.

Alternatives considered:

- Keep `version: 8.6.0`: conflicts with the package manager version pinned in the repo.
- Move to `node-version: lts/*`: convenient, but can change major Node versions without a repo decision.

### Build platform artifacts first, then assemble one release

Platform build jobs should produce workflow artifacts. A single release assembly job should download the verified platform artifacts, upload all release assets with GitHub CLI, generate or upload the final `latest.json`, and publish the draft release. This avoids platform matrix jobs racing to mutate the same release metadata and makes it explicit that Windows artifacts enter the release only after Authenticode signing and updater signing are correct.

Alternatives considered:

- Let each `tauri-action` matrix job upload directly to the draft release: less workflow code, but hard to reason about `latest.json` ordering and Windows delayed signing.
- Keep direct uploads for non-Windows and only delay Windows: less disruptive, but still leaves final manifest completeness ambiguous.

### Use Azure Artifact Signing inside the Tauri Windows signing path

Windows signing must happen during the Tauri bundle process through `bundle.windows.signCommand` or an equivalent Tauri-supported signing hook. The Windows release job should authenticate with Azure through GitHub OIDC, install/configure the Azure Artifact Signing SignTool integration used by `signCommand`, and let Tauri invoke the signer for Windows executables and installers before updater signatures and final metadata are produced.

The implementation should generate the Artifact Signing metadata JSON at build time from GitHub environment variables, install the supported Artifact Signing client tools or NuGet package that provides `Azure.CodeSigning.Dlib.dll`, and call Windows SDK `signtool.exe sign` with `/fd SHA256`, `/tr http://timestamp.acs.microsoft.com`, `/td SHA256`, `/dlib <Azure.CodeSigning.Dlib.dll>`, `/dmdf <metadata.json>`, and Tauri's file placeholder. The exact paths should be discovered in the Windows runner rather than hard-coded.

Required workflow configuration:

- `AZURE_CLIENT_ID`
- `AZURE_TENANT_ID`
- `AZURE_SUBSCRIPTION_ID` as a non-secret variable when `azure/login` uses a subscription, or an explicitly verified `allow-no-subscriptions: true` path
- `AZURE_ARTIFACT_SIGNING_ENDPOINT`
- `AZURE_ARTIFACT_SIGNING_ACCOUNT_NAME`
- `AZURE_ARTIFACT_SIGNING_CERTIFICATE_PROFILE_NAME`

The identity must have the Artifact Signing Certificate Profile Signer role on the certificate profile or a narrow parent scope. The release setup documentation must also describe the GitHub OIDC federated credential subject/audience used by the release environment or release tag pattern.

Alternatives considered:

- Sign Windows installers in a later job with `azure/artifact-signing-action@v2`: simple, but it can invalidate updater signatures if updater metadata was generated before Authenticode signing, and it does not sign the installed `app.exe` unless the unpacked app contents are also signed.
- Store `AZURE_CLIENT_SECRET`: works with `DefaultAzureCredential`, but creates a long-lived credential in GitHub and should be fallback-only.
- Use a PFX or HSM-backed non-Azure certificate: outside this change because the user explicitly requested Azure Artifact Signing.

### Keep NSIS as the default Windows installer unless implementation proves MSI is required

The current Tauri targets include NSIS, not MSI. The conservative implementation path is to keep NSIS and update the WinGet installer matching pattern and release documentation to match the signed `.exe` installer. Adding MSI is allowed only if the implementation documents why WinGet or operator requirements need it.

### Keep updater key continuity explicit

The existing `plugins.updater.pubkey` in `src-tauri/tauri.conf.json` defines what installed clients trust. The release documentation must state whether the operator is reusing the matching private key or intentionally rotating keys. Reusing the existing public key requires `TAURI_SIGNING_PRIVATE_KEY` to match it. Rotating the public key can prevent already installed clients from verifying future updates unless a migration release is planned.

The updater endpoint must point to the repository that publishes `latest.json`, or the workflow must intentionally publish updater metadata to the endpoint repository with an appropriate token. For this repository, implementation should assume the release endpoint must be reconciled with the current `ZeroClover/SimpleAI-Translator` remote unless the user chooses a separate release host.

### Keep macOS signing and notarization in the macOS build jobs

Import the Developer ID Application certificate into a temporary keychain during macOS jobs, set the Tauri signing identity, and provide notarization credentials for Tauri. The temporary keychain password can be generated inside the workflow and does not need to be a human-managed GitHub secret. The workflow should set the temporary keychain as the default or include it in the keychain search list before invoking `codesign`.

The release setup documentation must cover both notarization credential families:

- Apple ID email, app-specific password, and Team ID.
- App Store Connect API issuer/key values if the implementation supports that path.

The implementation should audit whether this app needs a custom entitlements file because `bundle.macOS.entitlements` is currently `null` while the app enables macOS private API. Add entitlements only if the audit shows they are required.

Alternatives considered:

- Use ad-hoc signing: insufficient for production distribution outside the App Store.
- Require only App Store Connect API keys: good for teams, but the user explicitly asked to cover Apple ID notarization credentials.

### Use protected release environment for production signing secrets

Release signing and publication secrets should live in a protected GitHub Environment such as `production-release`, not only in repository-wide secrets. The environment should be documented with required reviewers or an equivalent release approval model, and Azure OIDC federated credentials should match that environment or the protected tag pattern.

### Document release setup as an operator artifact

Add a human-facing document such as `docs/release-github-actions-secrets.md`. It must group setup by GitHub, Tauri updater, Apple, Azure Artifact Signing, Windows installer/WinGet, and Linux integrity. For each user-managed value, the document should state:

- Name used by the workflow or config.
- GitHub scope, preferably release environment secret/variable.
- Whether it is secret or non-secret configuration.
- Which workflow/job consumes it.
- How to create or obtain the underlying resource.
- Rotation, revocation, or loss impact.

The document must explicitly state that `GITHUB_TOKEN` is built in and should not be manually created. It should also call out items that are not required for this app, such as telemetry/crash-reporting credentials.

## Risks / Trade-offs

- [Action releases advance between proposal and implementation] -> Re-check release notes and README usage during implementation, then record the version snapshot.
- [Node 24 based actions require newer self-hosted runners] -> The project uses GitHub-hosted runners by default; document the minimum runner concern for any future self-hosted runner.
- [Artifact Signing public trust availability is region/entity limited] -> Document supported regions and identity validation prerequisites; if the user cannot obtain Azure Artifact Signing, pause for a product decision instead of silently adding another signing provider.
- [Azure OIDC subject is too broad] -> Scope the federated credential to the release workflow and release environment or protected release tags.
- [Windows assets are signed in the wrong order] -> Use Tauri `signCommand` so Authenticode signing occurs before updater signature/manifest finalization.
- [Tauri updater key loss prevents future updates for installed clients] -> Document backup, public-key pairing, rotation impact, and recovery limits for `TAURI_SIGNING_PRIVATE_KEY`.
- [Apple notarization can pass signing but fail stapling] -> Verify signing and notarization with bounded retries; do not create unbounded waiting logic.
- [WinGet workflow looks for MSI while release produces NSIS] -> Keep NSIS and align WinGet to the signed `.exe` installer unless MSI is deliberately added.
- [Concurrent release runs mutate the same release] -> Add release workflow concurrency keyed by release tag.
