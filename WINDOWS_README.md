# 🖥️ TollAI Monitor — Windows 1-Click Executable (.exe)

This setup allows **any Windows computer** to run the TollAI Monitor dashboard with **a single double-click**, without requiring Python or MySQL to be installed.

---

## ⚡ How it Works
1. **Double Click `TollAI_Monitor.exe`**:
   - Automatically initializes the local **SQLite database** (`toll_monitoring.db`).
   - Starts the local **Flask API & Web Server** on `http://localhost:5001`.
   - Seeds starting demo data if the database is newly created.
   - **Automatically opens the user's default web browser** (Chrome / Edge / Firefox) directly to the dashboard.
2. **Persistent Storage**:
   - The SQLite database file `toll_monitoring.db` is stored directly next to the `.exe`, ensuring all vehicle logs and toll records are saved across computer restarts.

---

## 🛠️ How to Build the `.exe` File

Because Windows `.exe` files must be compiled in a Windows environment, you have **two easy ways** to build it:

### Option 1: Build Locally on Any Windows PC (1-Click)
1. Copy this project folder to your Windows PC.
2. Ensure Python 3.10+ is installed (with *"Add Python to PATH"* checked during install).
3. Double-click:
   ```cmd
   build_windows_exe.bat
   ```
4. Once completed, your final standalone file will be inside the `dist\` folder:
   ```
   dist\TollAI_Monitor.exe
   ```

### Option 2: Automatic Free Cloud Build (GitHub Actions)
If you don't have a Windows PC setup right now:
1. Push this project to GitHub.
2. Go to the **Actions** tab on your GitHub repository.
3. Select the **Build Windows Executable** workflow and click **Run workflow**.
4. Once finished (~3 minutes), download the ready-to-run `TollAI_Monitor_Windows_EXE.zip` artifact containing your `.exe`!

---

## 📁 Key Files Created
- [start_windows.bat](file:///Users/rsmmonaem/Desktop/Nibiz%20TEMP/tole/start_windows.bat): 1-click Windows runner that auto-detects TollAI_Monitor.exe or auto-installs dependencies and runs on http://localhost:5001.
- [app_launcher.py](file:///Users/rsmmonaem/Desktop/Nibiz%20TEMP/tole/app_launcher.py): Unified launcher handling server start, SQLite persistence, and auto-browser popup.
- [TollAI.spec](file:///Users/rsmmonaem/Desktop/Nibiz%20TEMP/tole/TollAI.spec): PyInstaller bundle configuration for bundling assets, HTML, models, and Python modules.
- [build_windows_exe.bat](file:///Users/rsmmonaem/Desktop/Nibiz%20TEMP/tole/build_windows_exe.bat): 1-click Windows batch builder script.
- [.github/workflows/build-windows-exe.yml](file:///Users/rsmmonaem/Desktop/Nibiz%20TEMP/tole/.github/workflows/build-windows-exe.yml): GitHub Actions CI workflow to build `.exe` in the cloud.
