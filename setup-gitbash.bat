@echo off
echo Setting up Node.js for Git Bash...

REM Find Git Bash installation
set "GIT_BASH_PATH=C:\Program Files\Git\etc\profile.d"

REM Create a script to add Node.js to Git Bash PATH
echo export PATH="/c/Program Files/nodejs:$PATH" > "%GIT_BASH_PATH%\nodejs.sh"
echo export PATH="/c/Users/%USERNAME%/AppData/Roaming/npm:$PATH" >> "%GIT_BASH_PATH%\nodejs.sh"

echo.
echo Node.js has been added to Git Bash PATH!
echo Please restart Git Bash for changes to take effect.
echo.
pause
