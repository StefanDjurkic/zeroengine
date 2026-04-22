$body = '{"source":"function tick(t) { clear(10,14,24); drawCircle(320.0, 260.0, 40.0 + Math.sin(t) * 20.0, 120, 220, 255); }","options":{"opt_level":"O2"}}'
$headers = @{ "Origin" = "https://stefandjurkic.github.io"; "Content-Type" = "application/json" }
try {
    $r = Invoke-RestMethod -Uri "http://127.0.0.1:17849/compile" -Method POST -Body $body -Headers $headers -TimeoutSec 30
    "ALLOWED ok=$($r.ok) jspp_ms=$($r.jspp_ms) cxx_ms=$($r.cxx_ms) run_ms=$($r.run_ms) stdout_len=$($r.stdout.Length)"
} catch { "ERR: $_" }

$headers2 = @{ "Origin" = "https://evil.com"; "Content-Type" = "application/json" }
try {
    $r2 = Invoke-RestMethod -Uri "http://127.0.0.1:17849/compile" -Method POST -Body $body -Headers $headers2 -TimeoutSec 10
    "UNEXPECTED OK: $r2"
} catch {
    "BLOCKED (good): $($_.Exception.Response.StatusCode.value__)"
}
