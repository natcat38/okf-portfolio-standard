# Validate every portfolio knowledge bundle from the standards repo.
# Usage:  ./run-all.ps1
$ErrorActionPreference = 'Stop'
$repos = @(
  '../rpg-build-optimizer',
  '../f1-race-tracker',
  '../trip-planner',
  '../invoicely'
)
node "$PSScriptRoot/bin/okf-validate.mjs" @repos
exit $LASTEXITCODE
