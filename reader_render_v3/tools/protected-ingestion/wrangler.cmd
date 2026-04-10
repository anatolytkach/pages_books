@echo off
set SCRIPT_DIR=%~dp0
node "%SCRIPT_DIR%..\..\node_modules\wrangler\bin\wrangler.js" %*
