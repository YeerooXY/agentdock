param(
  [ValidateSet('inspect','map','unmap','firewall','firewall-remove')][string]$Action = 'inspect',
  [string]$LocalAddress,
  [ValidateRange(1024,65535)][int]$Port = 47831,
  [ValidateRange(1024,65535)][int]$ExternalPort = 47831,
  [string]$Owner,
  [string]$Program,
  [ValidateSet('local','internet')][string]$Mode = 'local',
  [switch]$Elevated
)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
function Parse-Xml([string]$Text) {
  $settings = [Xml.XmlReaderSettings]::new()
  $settings.DtdProcessing = [Xml.DtdProcessing]::Prohibit
  $settings.XmlResolver = $null
  $settings.MaxCharactersInDocument = 262144
  $reader = [Xml.XmlReader]::Create([IO.StringReader]::new($Text), $settings)
  try { $document = [Xml.XmlDocument]::new(); $document.XmlResolver = $null; $document.Load($reader); return ,$document } finally { $reader.Dispose() }
}
function Text-At($Doc, [string]$Name) {
  $node = $Doc.SelectSingleNode(".//*[local-name()='$Name']")
  if ($null -ne $node) { return [string]$node.InnerText }; return ''
}
function Router-Uri([string]$Value, [uri]$Base) {
  $uri = [uri]::new($Base, $Value)
  if ($uri.Scheme -ne 'http' -or $uri.Host -ne $script:gateway -or $uri.UserInfo -or $uri.Fragment) { throw 'The router returned an unexpected address.' }
  return $uri
}
function Soap([string]$Name, [hashtable]$Values = @{}) {
  $elements = ($Values.GetEnumerator() | ForEach-Object { '<'+$_.Key+'>'+[Security.SecurityElement]::Escape([string]$_.Value)+'</'+$_.Key+'>' }) -join ''
  $body = '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/"><s:Body><u:'+$Name+' xmlns:u="'+$script:serviceType+'">'+$elements+'</u:'+$Name+'></s:Body></s:Envelope>'
  try { $response = Invoke-WebRequest -Uri $script:control -Method POST -UseBasicParsing -MaximumRedirection 0 -TimeoutSec 5 -ContentType 'text/xml; charset="utf-8"' -Headers @{ SOAPACTION='"'+$script:serviceType+'#'+$Name+'"' } -Body $body; return Parse-Xml $response.Content }
  catch {
    $soapFailure = $_
    $fault = ''
    try { $streamReader = [IO.StreamReader]::new($_.Exception.Response.GetResponseStream()); try { $fault = Text-At (Parse-Xml ($streamReader.ReadToEnd())) 'errorCode' } finally { $streamReader.Dispose() } } catch {}
    if ($fault -eq '714' -or $soapFailure.ErrorDetails.Message -match 'UPnPError714NoSuchEntryInArray|<errorCode>714</errorCode>') { return $null }
    throw 'The router did not accept this request. Use manual port forwarding in its settings.'
  }
}
try {
  if ($Action -ne 'inspect' -and $Owner -notmatch '^[a-f0-9-]{36}$') { throw 'Invalid Dock rule identifier.' }
  $network = @(Get-NetIPConfiguration | Where-Object { $_.IPv4Address.IPAddress -contains $LocalAddress -and $_.IPv4DefaultGateway }) | Select-Object -First 1
  if (-not $network -and $Action -ne 'firewall-remove') { throw 'Choose a connected Wi-Fi or Ethernet address.' }
  $script:gateway = [string]$network.IPv4DefaultGateway.NextHop
  $result = @{ ok=$true; gateway=$script:gateway; localAddress=$LocalAddress; routerName='Router'; upnp=$false; wanAddress=''; mapped=$false }
  $profile = if ($network) { Get-NetConnectionProfile -InterfaceIndex $network.InterfaceIndex -ErrorAction SilentlyContinue | Select-Object -First 1 } else { $null }
  $result.networkProfile = if ($profile) { [string]$profile.NetworkCategory } else { 'Unknown' }
  if ($Action -like 'firewall*') {
    if (-not [IO.Path]::IsPathRooted($Program) -or -not (Test-Path -LiteralPath $Program -PathType Leaf)) { throw 'The Dock executable could not be found.' }
    $isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
    if (-not $isAdmin) {
      if ($Elevated) { throw 'Windows administrator approval is required for this rule.' }
      $arguments = '-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "'+$PSCommandPath+'" -Action '+$Action+' -LocalAddress '+$LocalAddress+' -Port '+$Port+' -ExternalPort '+$ExternalPort+' -Owner '+$Owner+' -Program "'+$Program+'" -Mode '+$Mode+' -Elevated'
      try { $child = Start-Process -FilePath 'powershell.exe' -Verb RunAs -WindowStyle Hidden -ArgumentList $arguments -PassThru -Wait; if ($child.ExitCode -ne 0) { throw 'Firewall setup did not finish.' } } catch { throw 'Windows Firewall was not changed. Approve the Windows prompt, or add the rule manually.' }
    } else {
      $ruleName = 'AgentDock-Mobile-'+$Owner
      Get-NetFirewallRule -Name $ruleName -ErrorAction SilentlyContinue | Remove-NetFirewallRule
      if ($Action -eq 'firewall') {
        $remote = if ($Mode -eq 'internet') { 'Any' } else { 'LocalSubnet' }
        New-NetFirewallRule -Name $ruleName -DisplayName 'Agent Dock phone connection' -Direction Inbound -Action Allow -Protocol TCP -LocalPort $Port -LocalAddress $LocalAddress -InterfaceAlias $network.InterfaceAlias -Program $Program -RemoteAddress $remote -Profile Any | Out-Null
      }
    }
    $result.firewall = $Action -eq 'firewall'; $result | ConvertTo-Json -Compress; exit 0
  }
  $udp = [Net.Sockets.UdpClient]::new()
  try {
    $udp.Client.Bind([Net.IPEndPoint]::new([Net.IPAddress]::Parse($LocalAddress),0))
    $udp.Client.ReceiveTimeout = 1500
    $packet = [Text.Encoding]::ASCII.GetBytes("M-SEARCH * HTTP/1.1`r`nHOST: 239.255.255.250:1900`r`nMAN: `"ssdp:discover`"`r`nMX: 1`r`nST: urn:schemas-upnp-org:device:InternetGatewayDevice:1`r`n`r`n")
    [void]$udp.Send($packet,$packet.Length,'239.255.255.250',1900)
    $until = [DateTime]::UtcNow.AddSeconds(4); $location = ''
    while ([DateTime]::UtcNow -lt $until) {
      $peer = [Net.IPEndPoint]::new([Net.IPAddress]::Any,0)
      try { $reply = [Text.Encoding]::ASCII.GetString($udp.Receive([ref]$peer)) } catch { continue }
      if ($peer.Address.ToString() -eq $script:gateway -and $reply -match '(?im)^LOCATION:\s*([^\r\n]+)') { $location = $Matches[1].Trim(); break }
    }
  } finally { $udp.Close() }
  if (-not $location) {
    if ($Action -ne 'inspect') { throw 'Automatic port forwarding is unavailable. Open your router settings and add the rule shown in Dock.' }
    $result | ConvertTo-Json -Compress; exit 0
  }
  $descriptionUri = Router-Uri $location ([uri]('http://'+$script:gateway+'/'))
  $description = Parse-Xml (Invoke-WebRequest -Uri $descriptionUri -UseBasicParsing -MaximumRedirection 0 -TimeoutSec 5).Content
  $service = @($description.SelectNodes("//*[local-name()='service']") | Where-Object { (Text-At $_ 'serviceType') -match '^urn:schemas-upnp-org:service:WAN(IP|PPP)Connection:[12]$' }) | Select-Object -First 1
  if (-not $service) { throw 'This router does not expose a supported port-forwarding service.' }
  $script:serviceType = $service.SelectSingleNode("*[local-name()='serviceType']").InnerText
  $script:control = Router-Uri $service.SelectSingleNode("*[local-name()='controlURL']").InnerText $descriptionUri
  $result.routerName = (Text-At $description 'friendlyName').Substring(0,[Math]::Min(100,(Text-At $description 'friendlyName').Length))
  $result.upnp = $true
  $result.wanAddress = Text-At (Soap 'GetExternalIPAddress') 'NewExternalIPAddress'
  if ($Action -ne 'inspect') {
    $lookup = @{ NewRemoteHost=''; NewExternalPort=$ExternalPort; NewProtocol='TCP' }
    $entry = Soap 'GetSpecificPortMappingEntry' $lookup
    $owned = $entry -and (Text-At $entry 'NewPortMappingDescription') -eq ('Agent Dock '+$Owner) -and (Text-At $entry 'NewInternalClient') -eq $LocalAddress -and (Text-At $entry 'NewInternalPort') -eq [string]$Port
    if ($Action -eq 'unmap') {
      if ($owned) {
        [void](Soap 'DeletePortMapping' $lookup)
        if (Soap 'GetSpecificPortMappingEntry' $lookup) { throw 'The router did not remove the forwarding rule. Remove it in router settings.' }
      }
    } else {
      if ($entry -and -not $owned) { throw 'That outside port already belongs to another rule. Choose a different port.' }
      [void](Soap 'AddPortMapping' @{ NewRemoteHost=''; NewExternalPort=$ExternalPort; NewProtocol='TCP'; NewInternalPort=$Port; NewInternalClient=$LocalAddress; NewEnabled=1; NewPortMappingDescription=('Agent Dock '+$Owner); NewLeaseDuration=3600 })
      $verify = Soap 'GetSpecificPortMappingEntry' $lookup
      if (-not $verify -or (Text-At $verify 'NewInternalClient') -ne $LocalAddress -or (Text-At $verify 'NewInternalPort') -ne [string]$Port -or (Text-At $verify 'NewPortMappingDescription') -ne ('Agent Dock '+$Owner)) { throw 'The router did not confirm the forwarding rule.' }
      $result.mapped = $true
    }
  }
  $result | ConvertTo-Json -Compress
} catch {
  @{ ok=$false; error=$_.Exception.Message } | ConvertTo-Json -Compress
  exit 1
}
