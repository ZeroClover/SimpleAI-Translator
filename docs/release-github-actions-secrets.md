# GitHub Actions Release Setup

This document records the release automation baseline checked on 2026-05-21 and the human-owned GitHub Actions configuration required to publish desktop releases from `vX.Y.Z` tags.

## Release Contract

-   Release repository: `ZeroClover/SimpleAI-Translator`.
-   Tauri updater endpoint: `https://github.com/ZeroClover/SimpleAI-Translator/releases/latest/download/latest.json`.
-   Tauri updater public key: embedded in `src-tauri/tauri.conf.json` under `plugins.updater.pubkey`.
-   Release environment: `production-release`.
-   Windows installer format: signed NSIS `.exe` remains the default. MSI is not produced by default release builds.
-   Linux integrity file: `SHA256SUMS-linux.txt`, covering uploaded `.deb`, `.AppImage`, and `.AppImage.tar.gz` assets.

The updater private key in `TAURI_SIGNING_PRIVATE_KEY` must match the embedded updater public key. Rotating the public key without a migration release can prevent already installed clients from accepting future updates.

## Action Baseline

Checked through GitHub release metadata and action manifests on 2026-05-21.

| Action                             | Previous use               | Selected use    | Notes                                                                                                                                                                              |
| ---------------------------------- | -------------------------- | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `actions/checkout`                 | `v4`                       | `v6.0.2`        | Node 24 action runtime; GitHub-hosted runners are expected.                                                                                                                        |
| `actions/setup-node`               | `v3`                       | `v6.4.0`        | Keeps project Node target at `18`; cache remains `pnpm`.                                                                                                                           |
| `pnpm/action-setup`                | `v2` with `version: 8.6.0` | `v6.0.8`        | Reads `packageManager: pnpm@9.1.3` from `package.json`.                                                                                                                            |
| `actions/upload-artifact`          | `v4`                       | `v7.0.1`        | Workflow artifacts are used before final release assembly.                                                                                                                         |
| `actions/download-artifact`        | `v4`                       | `v8.0.1`        | Release assembly downloads `release-*` artifacts with `merge-multiple`.                                                                                                            |
| `tauri-apps/tauri-action`          | `v0`, `dev`                | `action-v0.6.2` | Platform jobs build artifacts only; final release upload and `latest.json` are assembled in one job. `updaterJsonPreferNsis` is kept true to document the NSIS updater preference. |
| `crate-ci/typos`                   | `v1.16.10`                 | `v1.46.2`       | Spell-check action only.                                                                                                                                                           |
| `azure/login`                      | not used                   | `v3.0.0`        | Windows signing job uses GitHub OIDC.                                                                                                                                              |

Removed instead of upgraded: `actions/upload-release-asset`, `actions/github-script`, `battila7/get-version-action`, `ncipollo/release-action`, `oNaiPs/secrets-to-env-action`, `giraffate/clippy-action`, and `LoliGothick/rustfmt-check`.

`azure/artifact-signing-action@v2.0.0` was checked but not used for release signing because Windows Authenticode signing must happen through Tauri's `bundle.windows.signCommand` before updater signatures and final updater metadata are generated. The workflow installs `Microsoft.ArtifactSigning.Client` and calls SignTool with `Azure.CodeSigning.Dlib.dll`.

## GitHub Environment

Create a GitHub Environment named `production-release` on `ZeroClover/SimpleAI-Translator`.

Store all release signing credentials as environment secrets on `production-release`. Jobs that create, sign, or publish release artifacts declare `environment: production-release` so they can read those secrets and issue the Azure OIDC token with subject `repo:ZeroClover/SimpleAI-Translator:environment:production-release`.

`GITHUB_TOKEN` is built in. Do not create a manual secret named `GITHUB_TOKEN`.

## Tauri Updater

| Name                                 | Type   | Scope                | Consumed by                                 |
| ------------------------------------ | ------ | -------------------- | ------------------------------------------- |
| `TAURI_SIGNING_PRIVATE_KEY`          | secret | `production-release` | Linux, macOS, and Windows Tauri build steps |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | secret | `production-release` | Linux, macOS, and Windows Tauri build steps |

Generate the key pair with Tauri's signer command for the version of Tauri used by this repository. Back up the private key outside GitHub in a password manager or secret vault before the first production release.

To verify key continuity, compare the public key generated from the private key with `plugins.updater.pubkey` in `src-tauri/tauri.conf.json`. If the private key is lost, existing installations cannot verify future updates signed by a new key unless a planned migration release has already shipped.

If compromise is suspected, revoke GitHub access to the secret, rotate the key pair, update `tauri.conf.json`, and plan for installed-client update impact before publishing another release.

## Apple Developer ID and Notarization

| Name                                      | Type   | Scope                | Consumed by                        |
| ----------------------------------------- | ------ | -------------------- | ---------------------------------- |
| `APPLE_DEVELOPER_ID_CERTIFICATE_BASE64`   | secret | `production-release` | macOS certificate import step      |
| `APPLE_DEVELOPER_ID_CERTIFICATE_PASSWORD` | secret | `production-release` | macOS certificate import step      |
| `APPLE_SIGNING_IDENTITY`                  | secret | `production-release` | macOS Tauri config generation      |
| `NOTARY_ASC_API_KEY_ID`                   | secret | `production-release` | App Store Connect API notarization |
| `ASC_API_ISSUER`                          | secret | `production-release` | App Store Connect API notarization |
| `NOTARY_ASC_API_KEY_BASE64`               | secret | `production-release` | App Store Connect API key file     |

Export a Developer ID Application certificate from Keychain Access as `.p12`, protect it with a strong export password, and base64-encode the `.p12` file for `APPLE_DEVELOPER_ID_CERTIFICATE_BASE64`. Set `APPLE_SIGNING_IDENTITY` to the exact Developer ID Application identity shown by `security find-identity -v -p codesigning`.

For notarization, create an App Store Connect API key with Developer access:

1. Open [App Store Connect Users and Access](https://appstoreconnect.apple.com/access/integrations/api), select the Integrations tab, and create a key with Developer access.
2. Set `ASC_API_ISSUER` to the Issuer ID shown above the keys table.
3. Set `NOTARY_ASC_API_KEY_ID` to the Key ID from the new key row.
4. Download the `.p8` private key immediately after creation. Apple only allows one download.
5. Base64-encode the `.p8` file for `NOTARY_ASC_API_KEY_BASE64`. The workflow writes it to `AuthKey_<NOTARY_ASC_API_KEY_ID>.p8` and maps the GitHub secrets to Tauri's `APPLE_API_KEY`, `APPLE_API_ISSUER`, and `APPLE_API_KEY_PATH` environment variables at build time.

Tauri authenticates with Apple's notary service through these API credentials during the macOS build. Rotating the API key requires creating a new key in App Store Connect, updating the three secrets, and revoking the old key after the next successful release.

The app currently keeps `bundle.macOS.entitlements` as `null`. The audit found no current custom entitlement requirement in the Tauri bundle config; do not add an entitlements file unless a concrete macOS capability starts requiring one.

## Azure Artifact Signing

| Name                                              | Type   | Scope                | Consumed by                    |
| ------------------------------------------------- | ------ | -------------------- | ------------------------------ |
| `AZURE_CLIENT_ID`                                 | secret | `production-release` | `azure/login` in Windows build |
| `AZURE_TENANT_ID`                                 | secret | `production-release` | `azure/login` in Windows build |
| `AZURE_SUBSCRIPTION_ID`                           | secret | `production-release` | `azure/login` in Windows build |
| `AZURE_ARTIFACT_SIGNING_ENDPOINT`                 | secret | `production-release` | Windows signing metadata       |
| `AZURE_ARTIFACT_SIGNING_ACCOUNT_NAME`             | secret | `production-release` | Windows signing metadata       |
| `AZURE_ARTIFACT_SIGNING_CERTIFICATE_PROFILE_NAME` | secret | `production-release` | Windows signing metadata       |

Register the `Microsoft.CodeSigning` resource provider, create an Artifact Signing account in a supported region, complete identity validation, and create a certificate profile. Public Trust availability has regional and entity-type limits; verify the account region and endpoint before wiring the workflow.

Assign the GitHub OIDC application identity the `Artifact Signing Certificate Profile Signer` role on the certificate profile or the narrowest parent scope that can sign. The federated credential should use audience `api://AzureADTokenExchange` and subject `repo:ZeroClover/SimpleAI-Translator:environment:production-release`.

The workflow uses `azure/login@v3.0.0`, downloads `Microsoft.ArtifactSigning.Client` from NuGet for the signing dlib only, generates a metadata JSON containing `Endpoint`, `CodeSigningAccountName`, and `CertificateProfileName`, and lets Tauri invoke `src-tauri/scripts/windows-azure-sign.ps1` through `bundle.windows.signCommand`. The Windows release job rewrites that path to an absolute file path before bundling so NSIS signing steps can find the script regardless of the current working directory.

## Non-Required Credentials

Do not configure telemetry, analytics, crash-reporting, browser store publishing, WinGet publishing, NuGet package publishing, or passive release-tracking credentials for this app. Those integrations are outside the current release automation and removed-feature scope.
