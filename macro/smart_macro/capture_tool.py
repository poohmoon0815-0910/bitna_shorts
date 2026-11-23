# -*- coding: utf-8 -*-
"""
호기심빛나 AI 회사 - 작업표시줄 아이콘 캡처 도우미
실행하면 5초 후 작업표시줄(하단) 영역을 전체 캡처하여 'taskbar_capture.png'로 저장해 줍니다.
"""

import sys
import time
from pathlib import Path

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

import pyautogui

BASE_DIR = Path(__file__).resolve().parent
TARGETS_DIR = BASE_DIR / "targets"

print("=" * 60)
print("  📸 작업표시줄 캡처 도우미")
print("=" * 60)
print("5초 후 작업표시줄 영역을 캡처합니다.")
print("작업표시줄이 잘 보이도록 화면을 정리해 주세요!")

for i in range(5, 0, -1):
    print(f"  {i}...")
    time.sleep(1)

screen_w, screen_h = pyautogui.size()
tb_h = 100
top = screen_h - tb_h

shot = pyautogui.screenshot(region=(0, top, screen_w, tb_h))
save_path = BASE_DIR / "taskbar_current_preview.png"
shot.save(save_path)

print("\n" + "=" * 60)
print(f"✅ 캡처 완료! 저장 위치: {save_path}")
print("이 이미지를 그림판이나 캡처 도구로 열어서")
print("원하는 아이콘만 잘라낸 뒤 targets/ 폴더에 넣으시면 됩니다.")
print("=" * 60)
input("\n엔터(Enter) 키를 누르면 종료합니다...")
