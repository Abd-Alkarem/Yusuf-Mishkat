Add-Type -AssemblyName System.IO.Compression.FileSystem
$templatePath = "C:\Users\aaleo\Downloads\Nehad Application\يوسف الموسوي\ithraa_template_v3.dotx"
$extractDir = "C:\Users\aaleo\Downloads\Nehad Application\يوسف الموسوي\mosawy-cms\template_extracted"
if (Test-Path $extractDir) { Remove-Item $extractDir -Recurse -Force }
[System.IO.Compression.ZipFile]::ExtractToDirectory($templatePath, $extractDir)
Get-ChildItem -Recurse $extractDir | ForEach-Object { $_.FullName }
