$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$destination = Join-Path (Split-Path -Parent $projectRoot) 'X-Digest.zip'
$publicFiles = @('manifest.json', 'background.js', 'content.js', 'x-video.js', 'transcript.js', 'settings.js', 'sidepanel.html', 'sidepanel.js', 'sidepanel.css', 'options.html', 'options.js', 'options.css', 'icons', 'prompts', 'tests', 'scripts', 'docs', 'package.json', 'README.md', 'README.zh-CN.md', 'PRIVACY.md', 'SECURITY.md', 'NOTICE.md', 'LICENSE')
$sourcePaths = $publicFiles | ForEach-Object { Join-Path $projectRoot $_ }
Compress-Archive -LiteralPath $sourcePaths -DestinationPath $destination -Force
Write-Output ('Packaged: ' + $destination)
