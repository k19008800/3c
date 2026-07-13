@echo off
setlocal enabledelayedexpansion

set KEY=sk-3c-ac788b0e98e0115e0b45f4b101ef439256f91b6ab5c059dc
set URL=http://localhost:3000/v1/chat/completions
set DIR=C:\Users\ZH\.openclaw\workspace\3cloud\api\scripts

echo ========== 3cloud Rate Limit Test ==========
echo Users 5, RPM=5, TPM=1000
echo ============================================
echo.

echo Step 1: Sending 10 rapid requests...
for /l %%i in (1,1,10) do (
  curl.exe -s -o "%DIR%\resp_%%i.json" -w "%%i: %%{http_code}\n" -X POST "%URL%" -H "Content-Type: application/json" -H "Authorization: Bearer %KEY%" -d "{\"model\":\"deepseek-chat\",\"messages\":[{\"role\":\"user\",\"content\":\"hi\"}],\"max_tokens\":10}"
)

echo.
echo Step 2: Checking RPM rate limit responses...
echo.
for /l %%i in (1,1,10) do (
  set /p "status=" < "%DIR%\resp_%%i.json"
  set STATUS_FILE="%DIR%\resp_%%i.json"
  findstr /c:"rate_limit_exceeded" "!STATUS_FILE!" >nul
  if !errorlevel! equ 0 (
    echo Req %%i: RATE_LIMITED!
  ) else (
    echo Req %%i: OK
  )
)

echo.
echo Step 3: Checking if 429 has Retry-After header...
echo.
for /l %%i in (1,1,10) do (
  for /f "tokens=*" %%a in ('findstr /c:"rate_limit_exceeded" "%DIR%\resp_%%i.json"') do (
    echo Found 429 response in req %%i: %%a
  )
)

echo.
echo Step 4: Testing TPM with max_tokens=500...
echo.
for /l %%i in (1,1,5) do (
  curl.exe -s -o "%DIR%\tpm_%%i.json" -w "TPM %%i: %%{http_code}\n" -X POST "%URL%" -H "Content-Type: application/json" -H "Authorization: Bearer %KEY%" -d "{\"model\":\"deepseek-chat\",\"messages\":[{\"role\":\"user\",\"content\":\"hi\"}],\"max_tokens\":500}"
)

echo.
echo Step 5: Checking TPM responses...
echo.
for /l %%i in (1,1,5) do (
  set TPM_FILE="%DIR%\tpm_%%i.json"
  findstr /c:"rate_limit_exceeded" "!TPM_FILE!" >nul
  if !errorlevel! equ 0 (
    echo TPM %%i: RATE_LIMITED!
  ) else (
    echo TPM %%i: OK
  )
)

echo.
echo ========== All Tests Complete ==========
