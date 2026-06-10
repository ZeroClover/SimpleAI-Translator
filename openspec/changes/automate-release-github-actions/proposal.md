## Why

The current GitHub Actions release pipeline builds desktop artifacts but uses stale action versions, lacks production Windows code signing, and leaves required release secrets implicit. This makes automated desktop updates difficult to operate safely because Tauri updater signatures, macOS Developer ID signing/notarization, Windows Authenticode signing, and release publishing credentials are spread across workflow assumptions.

## What Changes

- Update GitHub Actions workflows to use current stable major versions and adjust usage where new versions changed runtime or input behavior.
- Add Windows desktop artifact signing with Azure Artifact Signing through the Tauri Windows signing path so executable and installer signing happen before updater signatures and manifests are finalized.
- Keep Tauri updater artifact signing enabled for release builds and document the private-key secret flow needed to publish update manifests.
- Ensure macOS release artifacts are Developer ID signed and notarized through documented Apple certificate and notarization credentials.
- Replace deprecated or unmaintained release-upload patterns with maintained release upload or GitHub CLI/API steps.
- Ensure the updater endpoint, GitHub Release target, Tauri updater public key, and private signing key are treated as one release-update contract.
- Add human-facing release setup documentation listing all required GitHub Actions secrets and variables, how to create or obtain them, and which workflow consumes each one.
- Preserve existing browser extension and userscript release outputs, but do not introduce browser store ownership or publishing identity changes.

## Capabilities

### New Capabilities
- `desktop-release-automation`: Defines the production release workflow requirements for desktop artifacts, update metadata, macOS notarization, Windows Azure Artifact Signing, release asset publication, and operator-owned secret setup documentation.

### Modified Capabilities
- None.

## Impact

- Affected workflows: `.github/workflows/release.yaml`, `.github/workflows/test-build.yaml`, `.github/workflows/lint.yaml`, `.github/workflows/unit-test.yaml`, `.github/workflows/playwright.yml`, and `.github/workflows/winget.yml`.
- Affected release configuration: `src-tauri/tauri.conf.json`, package scripts, and release helper scripts only where needed to support production signing and artifact publication.
- New documentation: a release setup document for GitHub Actions secrets, variables, Azure Artifact Signing resources, Apple Developer ID certificate/notarization credentials, Tauri updater signing keys, and WinGet publishing credentials.
- External systems: GitHub Actions, GitHub Releases, Azure Artifact Signing, Microsoft Entra workload identity/OIDC, Apple Developer/App Store Connect, and WinGet publishing.
