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

$signtool = Get-Command signtool.exe -ErrorAction SilentlyContinue

if (-not $signtool) {
    $windowsKits = Join-Path ${env:ProgramFiles(x86)} 'Windows Kits\10\bin'
    $signtool = Get-ChildItem -Path $windowsKits -Recurse -Filter signtool.exe |
        Sort-Object -Property FullName -Descending |
        Select-Object -First 1
}

if (-not $signtool) {
    throw 'signtool.exe was not found.'
}

& $signtool.Source sign `
    /fd SHA256 `
    /tr http://timestamp.acs.microsoft.com `
    /td SHA256 `
    /dlib $env:AZURE_CODESIGN_DLIB_PATH `
    /dmdf $env:AZURE_CODESIGN_METADATA_PATH `
    $FilePath

if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}
