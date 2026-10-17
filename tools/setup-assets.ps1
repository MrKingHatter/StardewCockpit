# Sets up predictor sprite assets: copies the object sheet, crops default sprites,
# and downloads the shop icons from the wiki. Run once from the repo root.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$oa = 'c:\PProj\stardew predictor\stardew-predictor oshawk\assets'
$dst = Join-Path $PSScriptRoot '..\assets'
New-Item -ItemType Directory -Force -Path $dst | Out-Null

# 1) Object sprite sheet (used via CSS background-position)
Copy-Item (Join-Path $oa 'springobjects.png') (Join-Path $dst 'springobjects.png') -Force

# 2) Crop default sprites for the non-object shop items.
function Crop($srcFile, $x, $y, $w, $h, $outFile) {
  $src = [System.Drawing.Image]::FromFile((Join-Path $oa $srcFile))
  $bmp = New-Object System.Drawing.Bitmap($w, $h)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.DrawImage($src, (New-Object System.Drawing.Rectangle(0, 0, $w, $h)), (New-Object System.Drawing.Rectangle($x, $y, $w, $h)), [System.Drawing.GraphicsUnit]::Pixel)
  $bmp.Save((Join-Path $dst $outFile), [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose(); $src.Dispose()
}
Crop 'shirts.png'          8   0   8  8  'default_shirt.png'
Crop 'walls_and_floors.png' 0   0  16 16 'default_wallpaper.png'
Crop 'walls_and_floors.png' 0 336  16 16 'default_flooring.png'
Crop 'furniture.png'        0   0  16 32 'default_furniture.png'

# 3) Download shop icons from the wiki.
$ua = 'Mozilla/5.0 (StardewCockpit asset fetch)'
$icons = @{
  'Traveling_Cart.png' = 'https://stardewvalleywiki.com/mediawiki/images/9/94/Traveling_Cart.png'
  'Pierres_shop.png'   = 'https://stardewvalleywiki.com/mediawiki/images/4/4a/Pierres_shop.png'
  'Jojamart.png'       = 'https://stardewvalleywiki.com/mediawiki/images/f/f9/Jojamart.png'
}
foreach ($name in $icons.Keys) {
  Invoke-WebRequest -Uri $icons[$name] -OutFile (Join-Path $dst $name) -UserAgent $ua
}

Get-ChildItem $dst | Select-Object Name, @{n='KB';e={[math]::Round($_.Length/1KB,1)}}
