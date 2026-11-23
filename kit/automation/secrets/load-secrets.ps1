# Windows: load secrets, then run the command you pass.
#   powershell -ExecutionPolicy Bypass -File automation\secrets\load-secrets.ps1 node automation/ctl.mjs worker windows
# Uses the 1Password CLI if $env:AUTOMATION_OP_ENV is set, otherwise automation\secrets\.env (gitignored).
param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Cmd)
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
if ($env:AUTOMATION_OP_ENV -and (Get-Command op -ErrorAction SilentlyContinue)) {
  & op run --env-file="$env:AUTOMATION_OP_ENV" -- @Cmd; exit $LASTEXITCODE
}
$envFile = Join-Path $here ".env"
if (Test-Path $envFile) {
  Get-Content $envFile | ForEach-Object {
    if ($_ -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$' -and -not $_.TrimStart().StartsWith('#')) {
      [Environment]::SetEnvironmentVariable($Matches[1], $Matches[2].Trim('"'), 'Process')
    }
  }
}
& $Cmd[0] $Cmd[1..($Cmd.Length - 1)]; exit $LASTEXITCODE
