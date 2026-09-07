@echo off
REM Builds irsdk-bridge.exe from both source files with the .NET Framework
REM compiler that ships with Windows (no Visual Studio needed).
REM Run from apps\steward\electron.
set CSC=%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\csc.exe
if not exist "%CSC%" set CSC=%WINDIR%\Microsoft.NET\Framework\v4.0.30319\csc.exe
"%CSC%" /nologo /target:exe /optimize+ /platform:x64 /out:irsdk-bridge.exe irsdk-bridge.cs irsdk-bridge-feed.cs
if errorlevel 1 (echo BUILD FAILED & exit /b 1)
echo built irsdk-bridge.exe
irsdk-bridge.exe status
