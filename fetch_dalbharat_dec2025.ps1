# ============================================================
#  DALBHARAT - Fetch & Prepend December 2025 (5-min candles)
#  Run this in YOUR VS Code terminal: .\fetch_dalbharat_dec2025.ps1
# ============================================================

$JWT = "eyJhbGciOiJIUzUxMiJ9.eyJ1c2VybmFtZSI6IkFBQVA0MjM5NjkiLCJyb2xlcyI6MCwidXNlcnR5cGUiOiJVU0VSIiwidG9rZW4iOiJleUpoYkdjaU9pSlNVekkxTmlJc0luUjVjQ0k2SWtwWFZDSjkuZXlKMWMyVnlYM1I1Y0dVaU9pSmpiR2xsYm5RaUxDSjBiMnRsYmw5MGVYQmxJam9pZEhKaFpHVmZZV05qWlhOelgzUnZhMlZ1SWl3aVoyMWZhV1FpT2pFd01pd2ljMjkxY21ObElqb2lNeUlzSW1SbGRtbGpaVjlwWkNJNkltUTBZV0V6WXpRekxUazJZMll0TTJWbVppMDVNRFprTFROalkyWmlPV1l5WWpkaVl5SXNJbXRwWkNJNkluUnlZV1JsWDJ0bGVWOTJNaUlzSW05dGJtVnRZVzVoWjJWeWFXUWlPakV3TWl3aWNISnZaSFZqZEhNaU9uc2laR1Z0WVhRaU9uc2ljM1JoZEhWeklqb2lZV04wYVhabEluMHNJbTFtSWpwN0luTjBZWFIxY3lJNkltRmpkR2wyWlNKOWZTd2lhWE56SWpvaWRISmhaR1ZmYkc5bmFXNWZjMlZ5ZG1salpTSXNJbk4xWWlJNklrRkJRVkEwTWpNNU5qa2lMQ0psZUhBaU9qRTNPREV3TnpBNE1EY3NJbTVpWmlJNk1UYzRNRGs0TkRJeU55d2lhV0YwSWpveE56Z3dPVGcwTWpJM0xDSnFkR2tpT2lKbVpURmpORFJqTmkxa09HVTJMVFEwTUdJdE9EWmpaQzA0TkRCaVlqRmpaVEUyTURraUxDSlViMnRsYmlJNklpSjkudU5Lcjl0c0xZVzI4d05jSHlFakJTamhTQWg1eWVxdmhwY2VYclpPLWNidklocnRaNGphZEFkS1ptMzVjNUNZcl8yd0RSZkdJdVNlLXVwRFowdlM0aS1BZlBBOWpqT2oxWnVncTJmbEdhcXlRMUFuMFN6U1M2QnFmWExGTnJ1MEJYOG01QTZIRmI3YVRtRS0xNU03ZVZhT2lwQUdMTzN1SXZ5NzlsN2ZwU05VIiwiQVBJLUtFWSI6IkFzWnNzUTlpIiwiaWF0IjoxNzgwOTg0NDA3LCJleHAiOjE3ODEwMjk4MDB9.Ipgtt2eJM_MZ1mfkucBXeoNSJ8H3pBm4rypkFYMxea4hriQL0vcY2HdOc2cYZHp40mxBvE6NOSzEgFsX51jctA"
$API_KEY  = "AsZssQ9i"
$CSV_FILE = Join-Path $PSScriptRoot "historical_csv\DALBHARAT.csv"

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  DALBHARAT - Prepend December 2025 Data  " -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# --- Step 1: Get DALBHARAT token ---
Write-Host "🔍 Fetching DALBHARAT NSE token..." -ForegroundColor Yellow
$master = Invoke-RestMethod -Uri "https://margincalculator.angelbroking.com/OpenAPI_File/files/OpenAPIScripMaster.json" -TimeoutSec 120
$dalb   = $master | Where-Object { $_.exch_seg -eq "NSE" -and $_.symbol -eq "DALBHARAT-EQ" } | Select-Object -First 1
if (-not $dalb) { Write-Host "❌ DALBHARAT-EQ not found in master scrip!" -ForegroundColor Red; exit 1 }
$TOKEN = $dalb.token
Write-Host "✅ Token found: $TOKEN" -ForegroundColor Green

# --- Step 2: Read existing CSV ---
if (-not (Test-Path $CSV_FILE)) { Write-Host "❌ CSV not found: $CSV_FILE" -ForegroundColor Red; exit 1 }
$existing   = Get-Content $CSV_FILE
$header     = $existing[0]
$dataLines  = $existing[1..($existing.Length - 1)] | Where-Object { $_ -ne "" }
$firstEntry = ($dataLines[0] -split ",")[0]
Write-Host "📄 Existing CSV starts at: $firstEntry" -ForegroundColor Cyan
Write-Host "📄 Existing rows: $($dataLines.Count)" -ForegroundColor Cyan

# --- Step 3: API headers ---
$headers = @{
    "Authorization"    = "Bearer $JWT"
    "X-PrivateKey"     = $API_KEY
    "X-UserType"       = "USER"
    "X-SourceID"       = "WEB"
    "X-ClientLocalIP"  = "127.0.0.1"
    "X-ClientPublicIP" = "127.0.0.1"
    "X-MACAddress"     = "00:00:00:00:00:00"
    "Content-Type"     = "application/json"
    "Accept"           = "application/json"
}

# --- Step 4: Fetch December 2025 in 2 chunks ---
$chunks = @(
    @{ from = "2025-12-01 09:15"; to = "2025-12-15 15:30" },
    @{ from = "2025-12-16 09:15"; to = "2025-12-31 15:30" }
)

$allCandles = [System.Collections.Generic.List[object]]::new()
Write-Host ""
foreach ($i in 0..1) {
    $ch = $chunks[$i]
    Write-Host "⏳ [$($i+1)/2] $($ch.from) → $($ch.to) ..." -NoNewline
    $body = @{
        exchange    = "NSE"
        symboltoken = $TOKEN
        interval    = "FIVE_MINUTE"
        fromdate    = $ch.from
        todate      = $ch.to
    } | ConvertTo-Json
    try {
        $resp = Invoke-RestMethod `
            -Uri "https://apiconnect.angelone.in/rest/secure/angelbroking/historical/v1/getCandleData" `
            -Method POST -Headers $headers -Body $body -TimeoutSec 30
        if ($resp.status -and $resp.data) {
            Write-Host " ✅ $($resp.data.Count) candles" -ForegroundColor Green
            foreach ($c in $resp.data) { $allCandles.Add($c) }
        } else {
            Write-Host " ⚠️  $($resp.message)" -ForegroundColor Yellow
        }
    } catch {
        Write-Host " ❌ $($_.Exception.Message)" -ForegroundColor Red
    }
    Start-Sleep -Milliseconds 800
}

if ($allCandles.Count -eq 0) {
    Write-Host ""
    Write-Host "❌ No candles fetched. JWT may be expired — get a fresh token and update this script." -ForegroundColor Red
    exit 1
}

# --- Step 5: Filter, sort, format ---
$firstDt  = [datetime]::Parse($firstEntry)
$seen     = @{}
$newRows  = [System.Collections.Generic.List[string]]::new()

$sorted = $allCandles | Sort-Object { [datetime]::Parse($_[0]) }
foreach ($c in $sorted) {
    $dt = [datetime]::Parse($c[0])
    if ($dt -ge $firstDt) { continue }               # skip overlap
    $key = $c[0]
    if ($seen.ContainsKey($key)) { continue }         # skip duplicate
    $seen[$key] = 1
    $dtStr = $dt.ToString("yyyy-MM-dd HH:mm:ss")
    $newRows.Add("$dtStr,$($c[1]),$($c[2]),$($c[3]),$($c[4]),$($c[5])")
}

if ($newRows.Count -eq 0) {
    Write-Host "❌ No new December 2025 rows to prepend (all overlap or empty)." -ForegroundColor Yellow
    exit 1
}

# --- Step 6: Write new CSV (header + dec rows + existing) ---
$newContent = @($header) + $newRows + $dataLines
[System.IO.File]::WriteAllLines($CSV_FILE, $newContent, [System.Text.Encoding]::UTF8)

$sizeKB = [math]::Round((Get-Item $CSV_FILE).Length / 1024, 1)

Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host "  ✅ December 2025 Data Prepended!         " -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host "📊 New Candles Added : $($newRows.Count)"       -ForegroundColor White
Write-Host "📅 First (new)       : $($newRows[0].Split(',')[0])"  -ForegroundColor White
Write-Host "📅 Last (new)        : $($newRows[$newRows.Count-1].Split(',')[0])" -ForegroundColor White
Write-Host "📁 File              : $CSV_FILE"               -ForegroundColor White
Write-Host "📏 File Size         : $sizeKB KB"              -ForegroundColor White
Write-Host ""
