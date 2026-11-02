# Turns a screen recording into a small, silent, web-ready MP4 for the portfolio.
#
# Usage (from the portfolio folder):
#   powershell -ExecutionPolicy Bypass -File tools\compress-video.ps1 -In "C:\path\to\recording.mp4" -Out "images\crash-attack\math-gates.mp4"
#
# Optional:
#   -Width 720        maximum width in pixels (height keeps its proportions)
#   -Fps 30           frames per second
#   -Quality 28       lower = sharper and larger (23 is high quality, 30 is small)
#   -Start 2 -Seconds 6   keep only 6 seconds starting at second 2 (good for short loops)
param(
  [Parameter(Mandatory = $true)][string]$In,
  [Parameter(Mandatory = $true)][string]$Out,
  [int]$Width = 720,
  [int]$Fps = 30,
  [int]$Quality = 28,
  [double]$Start = 0,
  [double]$Seconds = 0
)

# Pick up ffmpeg even if this window was opened before it was installed
$env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User")
if (-not (Get-Command ffmpeg -ErrorAction SilentlyContinue)) { throw "ffmpeg was not found. Install it with: winget install Gyan.FFmpeg" }
if (-not (Test-Path -LiteralPath $In)) { throw "Input file not found: $In" }

$outDir = Split-Path -Parent $Out
if ($outDir -and -not (Test-Path -LiteralPath $outDir)) { New-Item -ItemType Directory -Force $outDir | Out-Null }

$args = @("-y", "-hide_banner", "-loglevel", "error")
if ($Start -gt 0) { $args += @("-ss", $Start) }
$args += @("-i", $In)
if ($Seconds -gt 0) { $args += @("-t", $Seconds) }
# -an drops audio, scale keeps width <= $Width (never upscales), faststart lets it play before fully downloaded
$args += @("-vf", "scale='min($Width,iw)':-2,fps=$Fps", "-an", "-c:v", "libx264", "-crf", $Quality, "-preset", "slow", "-pix_fmt", "yuv420p", "-movflags", "+faststart", $Out)
& ffmpeg @args
if ($LASTEXITCODE -ne 0) { throw "ffmpeg failed (exit code $LASTEXITCODE)" }

$before = (Get-Item -LiteralPath $In).Length
$after = (Get-Item -LiteralPath $Out).Length
"{0}: {1:N0} KB -> {2:N0} KB" -f (Split-Path -Leaf $Out), ($before / 1KB), ($after / 1KB)
if ($after -gt 1MB) { "Heads up: over 1 MB. Try -Seconds 5, -Width 600 or -Quality 31 for a lighter clip." }
