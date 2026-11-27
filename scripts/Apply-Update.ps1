#requires -Version 5.1
[CmdletBinding()]
param(
    [string]$InstallRoot = 'C:\Program Files\Swarm',
    [switch]$VerifyOnly
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Assert-UiFiles {
    param([string]$Folder, [object[]]$Files)
    $base = [IO.Path]::GetFullPath($Folder).TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
    foreach ($entry in $Files) {
        $relative = [string]$entry.path
        if ([IO.Path]::IsPathRooted($relative) -or $relative -match '(^|[\\/])\.\.([\\/]|$)') {
            throw "Invalid release path: $relative"
        }
        $path = [IO.Path]::GetFullPath((Join-Path $Folder $relative))
        if (-not $path.StartsWith($base, [StringComparison]::OrdinalIgnoreCase)) { throw "Path outside release: $relative" }
        if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Missing release file: $relative" }
        if ((Get-Item -LiteralPath $path).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw "Linked release file: $relative" }
        $actual = (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash
        if ($actual -ne [string]$entry.sha256) { throw "Checksum mismatch: $relative" }
    }
    $all = @(Get-ChildItem -LiteralPath $Folder -Recurse -Force)
    if (@($all | Where-Object { $_.Attributes -band [IO.FileAttributes]::ReparsePoint }).Count) { throw 'Linked release directories are not supported.' }
    if (@($all | Where-Object { -not $_.PSIsContainer }).Count -ne $Files.Count) { throw 'The UI contains unexpected files. Extract the release into a fresh folder.' }
}

$release = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'release.json') -Raw | ConvertFrom-Json
if ($release.app -ne 'swarm-standalone' -or $release.version -notmatch '^\d+\.\d+\.\d+$') { throw 'This is not the expected Swarm standalone release.' }
[object[]]$manifest = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'WEBUI-SHA256.json') -Raw | ConvertFrom-Json
if ($manifest.Count -lt 4) { throw 'Release manifest is incomplete.' }
$source = Join-Path $PSScriptRoot 'webui'
Assert-UiFiles -Folder $source -Files $manifest
if (-not (Test-Path -LiteralPath (Join-Path $source 'public\index.html') -PathType Leaf)) { throw 'No WebUI entry point found.' }
if ($VerifyOnly) { Write-Host "Swarm $($release.version): all $($manifest.Count) UI files verified." -ForegroundColor Green; return }

$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'Open PowerShell as Administrator and run the update again.' }
if (-not (Test-Path -LiteralPath $InstallRoot -PathType Container)) { New-Item -ItemType Directory -Path $InstallRoot -Force | Out-Null }
$InstallRoot = (Get-Item -LiteralPath $InstallRoot).FullName
$active = Join-Path $InstallRoot 'webui'
if ((Test-Path -LiteralPath $active) -and ((Get-Item -LiteralPath $active).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'The existing WebUI is a linked folder; update its actual location instead.' }
$token = [Guid]::NewGuid().ToString('N')
$stage = Join-Path $InstallRoot ('webui.staging.' + $token)
$backup = Join-Path $InstallRoot ('webui.before-swarm.' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.' + $token.Substring(0, 8))
$previousMoved = $false
$newMoved = $false
try {
    New-Item -ItemType Directory -Path $stage | Out-Null
    Get-ChildItem -LiteralPath $source -Force | ForEach-Object {
        Copy-Item -LiteralPath $_.FullName -Destination $stage -Recurse -Force
    }
    Assert-UiFiles -Folder $stage -Files $manifest
    if (Test-Path -LiteralPath $active) {
        Move-Item -LiteralPath $active -Destination $backup
        $previousMoved = $true
    }
    Move-Item -LiteralPath $stage -Destination $active
    $newMoved = $true
    Assert-UiFiles -Folder $active -Files $manifest
    Write-Host ''
    Write-Host "Swarm $($release.version) installed." -ForegroundColor Green
    if ($previousMoved) { Write-Host "Previous Swarm UI: $backup" }
    Write-Host "Active UI:   $active"
    Write-Host 'Swarm UI files verified and installed.'
    Write-Host "Open http://localhost:8080/?swarm=$($release.version) and press Ctrl+F5." -ForegroundColor Cyan
    Write-Host 'Source code: webui\Swarm-source.zip'
}
catch {
    $message = $_.Exception.Message
    if ($previousMoved) {
        try {
            if ($newMoved -and (Test-Path -LiteralPath $active)) {
                Move-Item -LiteralPath $active -Destination (Join-Path $InstallRoot ('webui.failed.' + $token))
            }
            if (-not (Test-Path -LiteralPath $active)) { Move-Item -LiteralPath $backup -Destination $active }
            Write-Warning 'The update failed; the previous WebUI was restored.'
        }
        catch { Write-Warning "Automatic rollback could not finish. Your previous UI is at $backup. $($_.Exception.Message)" }
    }
    throw "Swarm update failed: $message"
}
finally {
    if (Test-Path -LiteralPath $stage) { Remove-Item -LiteralPath $stage -Recurse -Force }
}
