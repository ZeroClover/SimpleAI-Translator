param(
    [Parameter(Mandatory = $true)]
    [string]$FilePath
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path -LiteralPath $FilePath)) {
    throw "Signing target does not exist: $FilePath"
}

if ([string]::IsNullOrWhiteSpace($env:AZURE_CODESIGN_DLIB_PATH)) {
    throw 'AZURE_CODESIGN_DLIB_PATH is not set.'
}

if ([string]::IsNullOrWhiteSpace($env:AZURE_CODESIGN_METADATA_PATH)) {
    throw 'AZURE_CODESIGN_METADATA_PATH is not set.'
}

if (-not (Test-Path -LiteralPath $env:AZURE_CODESIGN_DLIB_PATH)) {
    throw "Azure Code Signing dlib was not found: $env:AZURE_CODESIGN_DLIB_PATH"
}

if (-not (Test-Path -LiteralPath $env:AZURE_CODESIGN_METADATA_PATH)) {
    throw "Azure Code Signing metadata was not found: $env:AZURE_CODESIGN_METADATA_PATH"
}

# Azure.CodeSigning.Dlib.dll is 64-bit, so SignTool must be the x64 build.
$windowsKits = Join-Path ${env:ProgramFiles(x86)} 'Windows Kits\10\bin'
$signtool = Get-ChildItem -Path $windowsKits -Recurse -Filter signtool.exe |
    Where-Object { $_.Directory.Name -eq 'x64' -and $_.Directory.Parent.Name -match '^\d+(\.\d+)+$' } |
    Sort-Object { [version]$_.Directory.Parent.Name } -Descending |
    Select-Object -First 1

if (-not $signtool) {
    throw 'x64 signtool.exe was not found.'
}

& $signtool.FullName sign `
    /fd SHA256 `
    /tr http://timestamp.acs.microsoft.com `
    /td SHA256 `
    /dlib $env:AZURE_CODESIGN_DLIB_PATH `
    /dmdf $env:AZURE_CODESIGN_METADATA_PATH `
    $FilePath

if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}
