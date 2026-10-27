@echo off
setlocal
cd /d "%~dp0"

if not exist ".venv\Scripts\python.exe" (
    echo Creando el entorno virtual de DayBoard...
    py -3.12 -m venv .venv
    if errorlevel 1 goto :error
)

echo Comprobando dependencias...
".venv\Scripts\python.exe" -m pip install --prefer-binary -r requirements.txt
if errorlevel 1 goto :error

echo Abriendo DayBoard en el navegador...
start "" /min powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 2; Start-Process 'http://localhost:8000'"
echo Servidor disponible en http://localhost:8000  ^(Ctrl+C para detener^)
".venv\Scripts\python.exe" -m uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
goto :eof

:error
echo.
echo No se pudo iniciar DayBoard. Comprueba que Python 3.12 este instalado y vuelve a intentarlo.
pause
exit /b 1
