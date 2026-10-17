# Downloads real wiki sprites for the named cart specials into assets/pred/.
$ErrorActionPreference = 'Stop'
$ua = 'Mozilla/5.0 (StardewCockpit asset fetch)'
$dst = Join-Path $PSScriptRoot '..\assets\pred'
New-Item -ItemType Directory -Force -Path $dst | Out-Null

$map = [ordered]@{
  'red_fez.png'           = 'https://stardewvalleywiki.com/mediawiki/images/2/26/Red_Fez.png'
  'tea_set.png'           = 'https://stardewvalleywiki.com/mediawiki/images/9/9b/Tea_Set.png'
  'retro_catalogue.png'   = 'https://stardewvalleywiki.com/mediawiki/images/4/41/Retro_Catalogue.png'
  'junimo_catalogue.png'  = 'https://stardewvalleywiki.com/mediawiki/images/7/7f/Junimo_Catalogue.png'
  'joja_catalogue.png'    = 'https://stardewvalleywiki.com/mediawiki/images/7/76/Joja_Furniture_Catalogue.png'
  'almanac.png'           = 'https://stardewvalleywiki.com/mediawiki/images/2/28/Stardew_Valley_Almanac.png'
  'bait_and_bobber.png'   = 'https://stardewvalleywiki.com/mediawiki/images/1/18/Bait_And_Bobber.png'
  'woodcutters_weekly.png'= 'https://stardewvalleywiki.com/mediawiki/images/4/46/Woodcutter%27s_Weekly.png'
  'mining_monthly.png'    = 'https://stardewvalleywiki.com/mediawiki/images/6/6d/Mining_Monthly.png'
  'combat_quarterly.png'  = 'https://stardewvalleywiki.com/mediawiki/images/8/85/Combat_Quarterly.png'
  'rarecrow.png'          = 'https://stardewvalleywiki.com/mediawiki/images/e/ef/Rarecrow_4.png'
}
foreach ($name in $map.Keys) {
  Invoke-WebRequest -Uri $map[$name] -OutFile (Join-Path $dst $name) -UserAgent $ua -UseBasicParsing
}
Get-ChildItem $dst | Select-Object Name, @{n='B';e={$_.Length}}
