# -*- mode: python ; coding: utf-8 -*-
import os
import sys
from PyInstaller.utils.hooks import collect_data_files, collect_submodules

block_cipher = None

# Collect any data files needed by ultralytics or flask
extra_datas = [
    ('index.html', '.'),
    ('assets', 'assets'),
    ('python', 'python'),
    ('yolov8n.pt', '.'),
    ('traffic.mp4', '.'),
]

# Only include if they exist
for src, dst in list(extra_datas):
    if not os.path.exists(src):
        extra_datas.remove((src, dst))

if os.path.exists('best.pt'):
    extra_datas.append(('best.pt', '.'))

# Collect ultralytics data files (default.yaml, bytetrack.yaml, etc.)
try:
    extra_datas += collect_data_files('ultralytics')
except Exception:
    pass

hidden_imports = [
    'sqlite3',
    'flask',
    'flask_cors',
    'PIL',
    'cv2',
    'numpy',
    'requests',
    'urllib3',
    'config',
    'db_adapter',
    'server',
    'demo_data_generator',
    'rtsp_manager',
    'ai_engine',
    'ultralytics',
    'torch',
    'torchvision',
    'yaml',
    'multiprocessing',
]

a = Analysis(
    ['app_launcher.py'],
    pathex=['.', 'python'],
    binaries=[],
    datas=extra_datas,
    hiddenimports=hidden_imports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        'tkinter',
        'matplotlib',
        'tensorboard',
        'torch.utils.tensorboard',
        'torch.distributed',
        'torch.testing',
        'sympy',
        'ninja',
        'IPython',
        'jupyter',
        'notebook',
    ],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name='TollAI_Monitor',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,  # Set to True so user can see startup logs and stop the app, or False for silent
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=None,
)
