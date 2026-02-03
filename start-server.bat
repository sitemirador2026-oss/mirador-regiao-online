@echo off
echo ========================================
echo  Servidor Local - Mirador e Regiao Online
echo ========================================
echo.
echo Iniciando servidor...
echo.
echo Site publico: http://localhost:8000
echo Painel admin: http://localhost:8000/admin
echo.
echo Pressione Ctrl+C para parar o servidor
echo ========================================
echo.

cd public
python -m http.server 8000
