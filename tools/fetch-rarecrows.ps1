# Downloads all 8 rarecrow sprites (for the Deluxe Scarecrow tracking section).
$ErrorActionPreference = 'Stop'
$ua = 'Mozilla/5.0 (StardewCockpit asset fetch)'
$dst = Join-Path $PSScriptRoot '..\assets\pred'
New-Item -ItemType Directory -Force -Path $dst | Out-Null
$map = [ordered]@{
  'rarecrow_1.png' = 'https://stardewvalleywiki.com/mediawiki/images/6/62/Rarecrow_1.png'
  'rarecrow_2.png' = 'https://stardewvalleywiki.com/mediawiki/images/2/28/Rarecrow_2.png'
  'rarecrow_3.png' = 'https://stardewvalleywiki.com/mediawiki/images/e/ea/Rarecrow_3.png'
  'rarecrow_4.png' = 'https://stardewvalleywiki.com/mediawiki/images/e/ef/Rarecrow_4.png'
  'rarecrow_5.png' = 'https://stardewvalleywiki.com/mediawiki/images/9/9f/Rarecrow_5.png'
  'rarecrow_6.png' = 'https://stardewvalleywiki.com/mediawiki/images/2/29/Rarecrow_6.png'
  'rarecrow_7.png' = 'https://stardewvalleywiki.com/mediawiki/images/5/52/Rarecrow_7.png'
  'rarecrow_8.png' = 'https://stardewvalleywiki.com/mediawiki/images/b/bb/Rarecrow_8.png'
}
foreach ($name in $map.Keys) {
  Invoke-WebRequest -Uri $map[$name] -OutFile (Join-Path $dst $name) -UserAgent $ua -UseBasicParsing
}
Get-ChildItem $dst -Filter 'rarecrow_*.png' | Select-Object Name, Length
