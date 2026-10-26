param([string]$Fixture, [string]$Program, [string]$Action = 'firewall-status')
# Run the real helper with in-memory NetSecurity responses. No system rule,
# elevation, router or network operation is permitted in this fixture.
$data = Get-Content -LiteralPath $Fixture -Raw | ConvertFrom-Json
function Get-NetIPConfiguration { [pscustomobject]@{ IPv4Address=@{IPAddress='100.64.0.5'}; InterfaceAlias='Tailscale'; InterfaceIndex=7 } }
function Get-NetConnectionProfile { param($InterfaceIndex, $ErrorAction); [pscustomobject]@{NetworkCategory='Private'} }
function Get-NetFirewallRule {
  [CmdletBinding()] param([string]$PolicyStore, [string]$Name)
  if ($data.error) { throw 'Access is denied' }
  if ($PolicyStore -ne 'ActiveStore') { throw 'Expected the effective rule store' }
  $data.rule
}
function Get-NetFirewallApplicationFilter { [CmdletBinding()] param([Parameter(ValueFromPipeline=$true)]$Rule); process { $data.application } }
function Get-NetFirewallPortFilter { [CmdletBinding()] param([Parameter(ValueFromPipeline=$true)]$Rule); process { $data.ports } }
function Get-NetFirewallAddressFilter { [CmdletBinding()] param([Parameter(ValueFromPipeline=$true)]$Rule); process { $data.addresses } }
function Get-NetFirewallInterfaceFilter { [CmdletBinding()] param([Parameter(ValueFromPipeline=$true)]$Rule); process { $data.adapter } }
function Start-Process { throw 'Unexpected elevation' }
function Remove-NetFirewallRule { throw 'Unexpected rule removal' }
function New-NetFirewallRule { throw 'Unexpected rule creation' }
& (Join-Path $PSScriptRoot '../../electron/mobile-network.ps1') -Action $Action -LocalAddress '100.64.0.5' -Port 47831 -ExternalPort 47831 -Owner '00000000-0000-4000-8000-000000000000' -Program $Program -Mode tailscale
