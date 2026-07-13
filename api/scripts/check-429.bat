@echo off
setlocal enabledelayedexpansion

set KEY=sk-3c-ac788b0e98e0115e0b45f4b101ef439256f91b6ab5c059dc
set URL=http://localhost:3000/v1/chat/completions
set OUTDIR=C:\Users\ZH\.openclaw\workspace\3cloud\api\scripts

echo === Step 1: Send 6 requests to trigger RPM limit ===
for /l %%i in (1,1,6) do (
  curl.exe -s -o "%OUTDIR%\check_%%i.json" -D "%OUTDIR%\check_%%i_headers.txt" -X POST "%URL%" -H "Content-Type: application/json" -H "Authorization: Bearer %KEY%" -d "{\"model\":\"deepseek-chat\",\"messages\":[{\"role\":\"user\",\"content\":\"hi\"}],\"max_tokens\":10}"
)

echo.
echo === Step 2: Show 429 response body ===
echo ---- Req 5 ----
if exist "%OUTDIR%\check_5.json" (
  type "%OUTDIR%\check_5.json"
) else (
  echo File not found
)
echo.
echo ---- Req 5 Headers ----
if exist "%OUTDIR%\check_5_headers.txt" (
  type "%OUTDIR%\check_5_headers.txt"
) else (
  echo File not found
)
echo.
echo ---- Req 6 ----
if exist "%OUTDIR%\check_6.json" (
  type "%OUTDIR%\check_6.json"
) else (
  echo File not found
)
echo.
echo ---- Req 6 Headers ----
if exist "%OUTDIR%\check_6_headers.txt" (
  type "%OUTDIR%\check_6_headers.txt"
) else (
  echo File not found
)
echo.
echo === Done ===
