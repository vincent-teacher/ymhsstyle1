@echo off
chcp 65001 >nul
cd /d "%~dp0"
set PYTHONIOENCODING=utf-8
echo ==== 楊梅高中梅岡風：更新網站資料 ====
echo 讀取「梅岡風」資料夾中的版面圖片...
python tools/build.py %*
if errorlevel 1 (
  echo.
  echo 更新失敗，請確認已安裝 Python 3 與 Pillow（pip install pillow）。
) else (
  echo.
  echo 更新完成！請重新整理網頁。
)
pause