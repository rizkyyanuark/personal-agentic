[CmdletBinding()]
param([string]$Controller = $env:AE_CONTROLLER_URL,
      [string]$Workdir = $env:AE_WORKDIR,
      [string]$InstallDir = $(if ($env:AE_INSTALL_DIR) { $env:AE_INSTALL_DIR } else { Join-Path $env:LOCALAPPDATA 'AgenticWorker' }),
      [switch]$ReplaceRegistration)
$ErrorActionPreference = 'Stop'
Set-PSDebug -Off
if (-not $IsWindows -or [Runtime.InteropServices.RuntimeInformation]::OSArchitecture -ne 'X64') {
    throw 'Prebuilt setup supports Windows x64. Use explicit source installation on other platforms.'
}
Import-Module ScheduledTasks -ErrorAction Stop
if (-not $Controller) { $Controller = Read-Host 'Reachable controller URL' }
$Controller = $Controller.TrimEnd('/')
$uri = $null
if (-not [Uri]::TryCreate($Controller, [UriKind]::Absolute, [ref]$uri) -or $uri.Scheme -notin @('http','https') -or $uri.UserInfo -or $uri.AbsolutePath -ne '/' -or $uri.Query -or $uri.Fragment) { throw 'Use an HTTP(S) origin without path, credentials or query.' }
if ($uri.Scheme -eq 'http' -and -not $uri.IsLoopback) { throw 'Remote controllers require HTTPS.' }
try { Invoke-RestMethod "$Controller/api/health" -TimeoutSec 15 | Out-Null } catch { throw 'Controller health failed. Check DNS, TLS, host allowlist and network access.' }
if (-not $Workdir) { $Workdir = Read-Host 'Absolute project folder' }
if (-not [IO.Path]::IsPathFullyQualified($Workdir)) { throw 'Project folder must be absolute.' }
if (-not (Test-Path -LiteralPath $Workdir -PathType Container)) {
    if ((Read-Host 'Folder does not exist. Create it? [y/N]') -ne 'y') { throw 'Folder creation declined.' }
    New-Item -ItemType Directory -Path $Workdir | Out-Null
}
$Workdir = (Get-Item -LiteralPath $Workdir).FullName
if ($Workdir.TrimEnd('\') -eq [IO.Path]::GetPathRoot($Workdir).TrimEnd('\')) { throw 'Choose a project directory, not a drive root.' }
$probe = Join-Path $Workdir ('.ae-write-probe-' + [Guid]::NewGuid().ToString('N'))
try {
    [IO.Directory]::EnumerateFileSystemEntries($Workdir).GetEnumerator().MoveNext() | Out-Null
    $handle = [IO.File]::Open($probe,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
    $handle.Dispose()
} finally { if (Test-Path -LiteralPath $probe) { Remove-Item -LiteralPath $probe } }
New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
$InstallDir = (Get-Item -LiteralPath $InstallDir).FullName
if ($InstallDir.TrimEnd('\') -eq [IO.Path]::GetPathRoot($InstallDir).TrimEnd('\')) { throw 'Choose a dedicated worker installation directory, not a drive root.' }
if ((Test-Path (Join-Path $InstallDir 'registration.json')) -and -not (Test-Path (Join-Path $InstallDir 'installation.json'))) { throw 'Legacy worker state found. Preserve its service/state and choose a separate install directory or migrate explicitly.' }
$identity = [Security.Principal.WindowsIdentity]::GetCurrent().Name
& icacls.exe $InstallDir /inheritance:r /grant:r "${identity}:(OI)(CI)F" 'SYSTEM:(OI)(CI)F' | Out-Null
if ($LASTEXITCODE) { throw 'Cannot protect worker installation/state.' }
$key = [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData([Text.Encoding]::UTF8.GetBytes($InstallDir.ToUpperInvariant()))).Substring(0,12).ToLowerInvariant()
$metaPath = Join-Path $InstallDir 'installation.json'
$previous = if (Test-Path $metaPath) { Get-Content -Raw $metaPath | ConvertFrom-Json } else { $null }
$taskName = "Agentic Worker $key"
if ($previous) {
    if ($previous.task -cnotmatch '^Agentic Worker [0-9a-f]{12}$') { throw 'Invalid saved installer task identity. Preserve state and review installation metadata.' }
    $taskName = $previous.task
}
$existing = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
function TaskHash([string]$Xml) { [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData([Text.Encoding]::UTF8.GetBytes($Xml))).ToLowerInvariant() }
function WorkerRoot([string]$Path) {
    if ($Path.StartsWith('\\?\UNC\')) { return '\\' + $Path.Substring(8) }
    if ($Path.StartsWith('\\?\')) { return $Path.Substring(4) }
    return $Path
}
if ($existing -and (-not $previous -or $existing.Actions.Execute -ne $previous.binary -or $existing.Actions.Arguments -ne $previous.arguments -or (TaskHash (Export-ScheduledTask -TaskName $taskName)) -ne $previous.task_sha256)) { throw 'Task was customized or is not installer-owned. Preserve it and choose a separate install directory.' }
$state = if ($previous) { $previous.state } else { Join-Path $InstallDir 'state' }
if (-not [IO.Path]::GetFullPath($state).StartsWith($InstallDir + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Saved state is outside installation.' }
$registration = $null
$headers = @{}
$provisionalTask = $false
$configuredTask = $false
try {
    if (Test-Path (Join-Path $state 'registration.json')) {
        $registration = Get-Content -Raw (Join-Path $state 'registration.json') | ConvertFrom-Json
        $headers.Authorization = 'Bearer ' + $registration.token
        $compatible = $false
        if ($registration.url -eq $Controller) {
            try {
                $savedStatus = Invoke-RestMethod "$Controller/api/runtime/status" -Headers $headers -TimeoutSec 15
                $compatible = if ($previous) { $previous.root -eq $Workdir } else { -not $savedStatus.root -or (WorkerRoot $savedStatus.root) -eq $Workdir }
            } catch { $compatible = $false }
        }
        if (-not $compatible -or $ReplaceRegistration) {
            if (-not $ReplaceRegistration -and (Read-Host 'Registration incompatible/revoked/unreachable. Preserve it and replace? [y/N]') -ne 'y') { throw 'Existing registration retained.' }
            $state = Join-Path $InstallDir ('state-' + [Guid]::NewGuid().ToString('N'))
            $registration = $null
        }
    }
    if (-not $registration) {
        $token = $env:AE_ENROLLMENT_TOKEN
        if (-not $token) {
            $secret = Read-Host 'Enrollment token (hidden)' -AsSecureString
            $token = [Net.NetworkCredential]::new('', $secret).Password
        }
        if ($token -notmatch '^[A-Za-z0-9-]+$') { throw 'Invalid enrollment token format.' }
        $headers.Authorization = 'Bearer ' + $token
    }
    Remove-Item Env:AE_ENROLLMENT_TOKEN -ErrorAction SilentlyContinue
    try { $manifest = Invoke-RestMethod "$Controller/api/runtime/packages/windows-x64/manifest" -Headers $headers -TimeoutSec 30 } catch { throw 'Verified package unavailable or token rejected. Check controller release configuration or obtain a fresh token.' }
    if ($manifest.schema -ne 1 -or $manifest.protocol -ne 1 -or $manifest.platform -ne 'windows-x64' -or $manifest.release -cnotmatch '^[0-9a-f]{40}$' -or $manifest.package.file -ne 'worker-windows-x64.zip' -or $manifest.package.sha256 -cnotmatch '^[0-9a-f]{64}$' -or $manifest.package.size -le 0 -or $manifest.package.size -gt 134217728) { throw 'Incompatible worker manifest.' }
    $cacheDir = Join-Path $InstallDir 'cache'; New-Item -ItemType Directory -Force $cacheDir | Out-Null
    Write-Output "Selected verified release $($manifest.release) for Windows x64. Preparing binary package..."
    $cache = Join-Path $cacheDir ($manifest.package.sha256 + '.zip')
    if (-not (Test-Path $cache) -or (Get-FileHash $cache -Algorithm SHA256).Hash.ToLowerInvariant() -ne $manifest.package.sha256) {
        $partial = "$cache.partial"
        try {
            Invoke-WebRequest "$Controller/api/runtime/packages/windows-x64/archive" -Headers $headers -OutFile $partial -TimeoutSec 120 | Out-Null
            if ((Get-Item $partial).Length -ne $manifest.package.size -or (Get-FileHash $partial).Hash.ToLowerInvariant() -ne $manifest.package.sha256) { throw 'Worker package checksum/size mismatch.' }
            Move-Item -LiteralPath $partial -Destination $cache -Force
        } finally { if (Test-Path $partial) { Remove-Item -LiteralPath $partial } }
    }
    $stage = Join-Path $InstallDir ('stage-' + [Guid]::NewGuid().ToString('N')); New-Item -ItemType Directory $stage | Out-Null
    try {
        $files = @($manifest.package.files)
        if ($files.Count -lt 1 -or $files.Count -gt 32 -or ($files | Measure-Object -Property size -Sum).Sum -gt 805306368) { throw 'Invalid package expansion size.' }
        $names = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
        foreach ($f in $files) {
            if ($f.name -notmatch '^[A-Za-z0-9_.-]+$' -or $f.name.Contains('..') -or ($f.name -ne 'agentic-enterprise.exe' -and -not $f.name.EndsWith('.dll')) -or $f.sha256 -cnotmatch '^[0-9a-f]{64}$' -or -not $names.Add($f.name)) { throw 'Unsafe/duplicate archive member.' }
        }
        if (-not $names.Contains('agentic-enterprise.exe')) { throw 'Package executable missing.' }
        $zip = [IO.Compression.ZipFile]::OpenRead($cache)
        try {
            if ($zip.Entries.Count -ne $files.Count) { throw 'Archive member list mismatch.' }
            $seen = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
            foreach ($entry in $zip.Entries) {
                if (-not $names.Contains($entry.FullName) -or -not $seen.Add($entry.FullName) -or (($entry.ExternalAttributes -shr 16) -band 0xF000) -eq 0xA000) { throw 'Archive traversal, duplicate or symlink rejected.' }
                $f = $files | Where-Object name -CEQ $entry.FullName
                if ($entry.Length -ne $f.size) { throw 'Archive file size mismatch.' }
                $dest = Join-Path $stage $entry.FullName
                [IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $dest, $false)
                if ((Get-FileHash $dest).Hash.ToLowerInvariant() -ne $f.sha256) { throw 'Extracted file checksum mismatch.' }
            }
        } finally { $zip.Dispose() }
        $exe = Join-Path $stage 'agentic-enterprise.exe'
        $stream = [IO.File]::OpenRead($exe); $reader = [IO.BinaryReader]::new($stream)
        try {
            if ($reader.ReadUInt16() -ne 0x5A4D) { throw 'Invalid executable.' }
            $stream.Position = 60; $offset = $reader.ReadUInt32(); $stream.Position = $offset
            if ($reader.ReadUInt32() -ne 0x4550 -or $reader.ReadUInt16() -ne 0x8664) { throw 'Worker is not Windows x64.' }
        } finally { $reader.Dispose() }
        & $exe --version | Out-Null
        if ($LASTEXITCODE) { throw 'Worker runtime dependencies missing; no build fallback was attempted.' }
        $versions = Join-Path $InstallDir 'versions'; New-Item -ItemType Directory -Force $versions | Out-Null
        $version = Join-Path $versions ($manifest.release + '-' + $manifest.package.sha256)
        if (-not (Test-Path $version)) { Move-Item -LiteralPath $stage -Destination $version }
    } finally {
        if (Test-Path $stage) {
            $resolvedStage = (Resolve-Path -LiteralPath $stage).Path
            if (-not $resolvedStage.StartsWith($InstallDir + [IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)) { throw 'Unsafe staging cleanup path.' }
            Remove-Item -LiteralPath $resolvedStage -Recurse
        }
    }
    $binary = Join-Path $version 'agentic-enterprise.exe'
    foreach ($f in $files) {
        if ((Get-FileHash (Join-Path $version $f.name)).Hash.ToLowerInvariant() -ne $f.sha256) { throw 'Installed release was modified. Preserve it and restore the verified package.' }
    }
    New-Item -ItemType Directory -Force $state | Out-Null
    if (-not $existing) {
        # Check task registration permission before consuming the one-use enrollment token.
        $preflight = New-ScheduledTaskAction -Execute $binary -Argument '--version'
        $preflightTrigger = New-ScheduledTaskTrigger -AtLogOn -User $identity
        Register-ScheduledTask -TaskName $taskName -Action $preflight -Trigger $preflightTrigger -User $identity | Out-Null
        $provisionalTask = $true
    }
    if ($existing) {
        Stop-ScheduledTask -TaskName $taskName
        $stopDeadline = [DateTime]::UtcNow.AddSeconds(15)
        while ((Get-ScheduledTask -TaskName $taskName).State -eq 'Running' -and [DateTime]::UtcNow -lt $stopDeadline) { Start-Sleep -Milliseconds 200 }
        if ((Get-ScheduledTask -TaskName $taskName).State -eq 'Running') { throw 'Existing worker task has not stopped. Registration and previous installation are retained; retry after it stops.' }
        $oldLock = Join-Path $previous.state 'worker.lock'
        $released = -not (Test-Path -LiteralPath $oldLock)
        while (-not $released -and [DateTime]::UtcNow -lt $stopDeadline) {
            try { $handle=[IO.File]::Open($oldLock,[IO.FileMode]::Open,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None); $handle.Dispose(); $released=$true }
            catch [IO.IOException] { Start-Sleep -Milliseconds 200 }
        }
        if (-not $released) { throw 'Previous worker still owns its state lock. Existing registration is retained; wait for the worker to exit before retrying.' }
    }
    if (-not $registration) {
        $env:AE_CONTROLLER_URL = $Controller; $env:AE_ENROLLMENT_TOKEN = $token
        try { & $binary --worker --worker-state $state --worker-root $Workdir --enroll-only; if ($LASTEXITCODE) { throw 'Enrollment rejected. Obtain a fresh UI token if expired/used; existing state is preserved.' } }
        finally { Remove-Item Env:AE_ENROLLMENT_TOKEN -ErrorAction SilentlyContinue; $token = $null; $secret = $null }
    }
    $registration = Get-Content -Raw (Join-Path $state 'registration.json') | ConvertFrom-Json
    $headers.Authorization = 'Bearer ' + $registration.token
    $baseline = (Invoke-RestMethod "$Controller/api/runtime/status" -Headers $headers -TimeoutSec 15).heartbeat
    $arguments = "--worker --worker-state `"$state`" --worker-root `"$Workdir`""
    if ($previous) { Copy-Item $metaPath (Join-Path $InstallDir 'installation.previous.json') -Force }
    if ($existing) { Export-ScheduledTask -TaskName $taskName | Set-Content (Join-Path $InstallDir 'task.previous.xml') }
    $action = New-ScheduledTaskAction -Execute $binary -Argument $arguments
    $trigger = New-ScheduledTaskTrigger -AtLogOn -User $identity
    # The worker reconnects internally; Scheduler restarts unexpected process failures.
    $settings = New-ScheduledTaskSettingsSet -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
    Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -User $identity -Force | Out-Null
    @{controller=$Controller;root=$Workdir;state=$state;binary=$binary;arguments=$arguments;task=$taskName;release=$manifest.release;task_sha256=(TaskHash (Export-ScheduledTask -TaskName $taskName))} | ConvertTo-Json | Set-Content $metaPath
    $configuredTask = $true
    Start-ScheduledTask -TaskName $taskName
    Write-Output "Installed $($manifest.release); enrolled; task started. Waiting for controller-confirmed Online..."
    $deadline = [DateTime]::UtcNow.AddSeconds(60)
    do {
        try {
            $status = Invoke-RestMethod "$Controller/api/runtime/status" -Headers $headers -TimeoutSec 5
            if ($status.id -eq $registration.id -and $status.workspace -eq $registration.workspace -and $status.online -and $status.heartbeat -gt $baseline -and (WorkerRoot $status.root) -eq $Workdir) {
                Write-Output "Online: runtime $($status.id), workspace $($status.workspace). Harness login is separate. Task starts at user logon."
                return
            }
        } catch { Write-Verbose 'Connection not confirmed yet.' }
        Start-Sleep -Seconds 2
    } while ([DateTime]::UtcNow -lt $deadline)
    throw "Enrolled and task started; Online not confirmed within 60 seconds. Inspect Get-ScheduledTaskInfo -TaskName '$taskName'; rerun setup to reconnect without a duplicate runtime."
} finally {
    if ($provisionalTask -and -not $configuredTask) { Unregister-ScheduledTask -TaskName $taskName -Confirm:$false }
    $headers.Clear(); $token=$null; $secret=$null; $registration=$null
    Remove-Item Env:AE_ENROLLMENT_TOKEN -ErrorAction SilentlyContinue
}
