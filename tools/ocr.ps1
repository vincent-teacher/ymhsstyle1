# Windows 內建 OCR（zh-Hant-TW）批次辨識
# 用法：powershell -ExecutionPolicy Bypass -File ocr.ps1 -ListFile list.txt
# list.txt 每行：輸入圖片路徑<TAB>輸出 JSON 路徑
param([Parameter(Mandatory=$true)][string]$ListFile)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime]
$null = [Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType = WindowsRuntime]
$null = [Windows.Graphics.Imaging.BitmapDecoder, Windows.Foundation, ContentType = WindowsRuntime]
$null = [Windows.Globalization.Language, Windows.Foundation, ContentType = WindowsRuntime]

$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and
    $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]
function Await($op, [Type]$type) {
    $t = $asTaskGeneric.MakeGenericMethod($type).Invoke($null, @($op))
    $t.Wait(-1) | Out-Null
    $t.Result
}

$lang = [Windows.Globalization.Language]::new('zh-Hant-TW')
$engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage($lang)
if ($null -eq $engine) { throw 'zh-Hant-TW OCR 引擎不可用' }

foreach ($row in [System.IO.File]::ReadAllLines($ListFile, [System.Text.Encoding]::UTF8)) {
    if (-not $row.Trim()) { continue }
    $parts = $row -split "`t"
    $src = $parts[0]; $dst = $parts[1]
    try {
        $file = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync($src)) ([Windows.Storage.StorageFile])
        $stream = Await ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
        $decoder = Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
        $bmp = Await ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
        $res = Await ($engine.RecognizeAsync($bmp)) ([Windows.Media.Ocr.OcrResult])
        $lines = @()
        foreach ($ln in $res.Lines) {
            $hs = @(); $x0 = 1e9; $y0 = 1e9; $x1 = 0; $y1 = 0
            foreach ($w in $ln.Words) {
                $r = $w.BoundingRect
                $hs += [math]::Max($r.Height, $r.Width / [math]::Max(1, $w.Text.Length))
                $x0 = [math]::Min($x0, $r.X); $y0 = [math]::Min($y0, $r.Y)
                $x1 = [math]::Max($x1, $r.X + $r.Width); $y1 = [math]::Max($y1, $r.Y + $r.Height)
            }
            $sorted = $hs | Sort-Object
            $med = if ($sorted.Count) { $sorted[[int][math]::Floor($sorted.Count / 2)] } else { 0 }
            $lines += [pscustomobject]@{ t = $ln.Text; h = [math]::Round($med, 1); b = @([int]$x0, [int]$y0, [int]$x1, [int]$y1) }
        }
        $obj = [pscustomobject]@{ w = $bmp.PixelWidth; hgt = $bmp.PixelHeight; lines = $lines }
        [System.IO.File]::WriteAllText($dst, ($obj | ConvertTo-Json -Depth 5 -Compress), (New-Object System.Text.UTF8Encoding $false))
        $stream.Dispose()
        Write-Output "OK`t$src"
    } catch {
        Write-Output "ERR`t$src`t$($_.Exception.Message)"
    }
}
