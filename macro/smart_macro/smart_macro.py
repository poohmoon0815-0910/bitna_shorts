# -*- coding: utf-8 -*-
"""
호기심빛나 AI 회사 - 스마트 이미지 인식 작업표시줄 매크로 (Smart Icon Macro v2)
- 다중 해상도 / DPI 스케일 자동 보정 (OpenCV 멀티스케일 매칭)
- 상세 실행 로그 파일(macro_run.log) 자동 기록
- 아이콘 발견 시 비프음(Beep) 안내 및 마우스 이동/클릭
"""

import sys
import os
import time
import json
import traceback
from datetime import datetime
from pathlib import Path

# UTF-8 콘솔 출력
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

import pyautogui
import numpy as np
import cv2
from PIL import ImageGrab

try:
    import winsound
except ImportError:
    winsound = None

pyautogui.FAILSAFE = True
pyautogui.PAUSE = 0.05

BASE_DIR = Path(__file__).resolve().parent
TARGETS_DIR = BASE_DIR / "targets"
CONFIG_FILE = BASE_DIR / "config.json"
LOG_FILE = BASE_DIR / "macro_run.log"

def log(msg):
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{ts}] {msg}"
    print(line)
    try:
        with open(LOG_FILE, "a", encoding="utf-8") as f:
            f.write(line + "\n")
    except Exception:
        pass

def load_config():
    default_cfg = {
        "confidence_threshold": 0.70,   # 최소 유사도 (70% 이상이면 클릭)
        "delay_after_click": 1.5,       # 클릭 후 대기시간(초)
        "wait_timeout_seconds": 8,      # 검색 제한시간(초)
        "click_type": "left",           # "left" 또는 "double"
        "scales": [1.0, 0.8, 1.25, 0.9, 1.1] # DPI 배율 자동 보정
    }
    if CONFIG_FILE.exists():
        try:
            with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                cfg = json.load(f)
                return {**default_cfg, **cfg}
        except Exception as e:
            log(f"[경고] config 로드 실패: {e}")
    return default_cfg

def get_target_images():
    extensions = ("*.png", "*.jpg", "*.jpeg", "*.bmp")
    files = []
    for ext in extensions:
        files.extend(TARGETS_DIR.glob(ext))
    # 오름차순 정렬
    files.sort(key=lambda p: p.name.lower())
    return files

def capture_screen_cv():
    """화면 캡처 후 OpenCV BGR 이미지로 변환"""
    try:
        pil_img = ImageGrab.grab(all_screens=True)
        img_np = np.array(pil_img)
        # RGB to BGR for OpenCV
        if img_np.ndim == 3 and img_np.shape[2] >= 3:
            return cv2.cvtColor(img_np[:, :, :3], cv2.COLOR_RGB2BGR)
        return img_np
    except Exception as e:
        log(f"[에러] 화면 캡처 실패: {e}")
        return None

def match_icon_on_screen(template_bgr, screen_bgr, threshold=0.70, scales=(1.0, 0.8, 1.25, 0.9, 1.1)):
    """OpenCV 멀티스케일 템플릿 매칭으로 최적의 중심 좌표 찾기"""
    th, tw = template_bgr.shape[:2]
    sh, sw = screen_bgr.shape[:2]

    best_val = -1.0
    best_loc = None
    best_scale = 1.0

    # 컬러 + 그레이스케일 매칭
    screen_gray = cv2.cvtColor(screen_bgr, cv2.COLOR_BGR2GRAY)
    tmpl_gray = cv2.cvtColor(template_bgr, cv2.COLOR_BGR2GRAY)

    for scale in scales:
        if scale == 1.0:
            resized_tmpl = tmpl_gray
        else:
            nw = int(tw * scale)
            nh = int(th * scale)
            if nw <= 5 or nh <= 5 or nw >= sw or nh >= sh:
                continue
            resized_tmpl = cv2.resize(tmpl_gray, (nw, nh), interpolation=cv2.INTER_AREA)

        rw, rh = resized_tmpl.shape[1], resized_tmpl.shape[0]
        res = cv2.matchTemplate(screen_gray, resized_tmpl, cv2.TM_CCOEFF_NORMED)
        min_val, max_val, min_loc, max_loc = cv2.minMaxLoc(res)

        if max_val > best_val:
            best_val = max_val
            best_loc = (max_loc[0] + rw // 2, max_loc[1] + rh // 2)
            best_scale = scale

    return best_val, best_loc, best_scale

def execute_step(img_path: Path, config: dict, step_idx: int, total_steps: int):
    log(f"[{step_idx}/{total_steps}] 🔍 타겟 검색 시작: '{img_path.name}'")

    tmpl = cv2.imread(str(img_path))
    if tmpl is None:
        log(f"  ❌ 이미지 파일을 읽을 수 없습니다: {img_path}")
        return False

    threshold = config.get("confidence_threshold", 0.70)
    timeout = config.get("wait_timeout_seconds", 8)
    delay = config.get("delay_after_click", 1.5)
    click_type = config.get("click_type", "left")
    scales = config.get("scales", [1.0, 0.8, 1.25, 0.9, 1.1])

    start_t = time.time()
    last_best_val = 0.0
    target_pos = None

    while time.time() - start_t < timeout:
        screen = capture_screen_cv()
        if screen is not None:
            val, loc, scale = match_icon_on_screen(tmpl, screen, threshold, scales)
            last_best_val = val
            if val >= threshold:
                target_pos = loc
                log(f"  🎯 아이콘 발견! 유사도: {val * 100:.1f}% (배율: {scale:.2f}x, 화면 좌표: {loc})")
                break
        time.sleep(0.4)

    if not target_pos:
        log(f"  ❌ [{timeout}초 초과] '{img_path.name}' 아이콘을 찾지 못했습니다. (화면 최고 유사도: {last_best_val * 100:.1f}% / 필요치: {threshold * 100:.1f}%)")
        return False

    cx, cy = target_pos

    # 띵 소리로 사용자에게 안내
    if winsound:
        try:
            winsound.Beep(1200, 150)
        except Exception:
            pass

    log(f"  🖱️ 마우스 이동 중 -> ({cx}, {cy}) 클릭 실행...")
    pyautogui.moveTo(cx, cy, duration=0.35, tween=pyautogui.easeInOutQuad)

    if click_type == "double":
        pyautogui.doubleClick(cx, cy)
    else:
        pyautogui.click(cx, cy)

    log(f"  ✅ 클릭 완료! (다음 동작까지 {delay}초 대기)")
    time.sleep(delay)
    return True

def main():
    log("=" * 60)
    log("🚀 [호기심빛나] 스마트 이미지 인식 작업표시줄 매크로 가동")
    log("=" * 60)

    config = load_config()
    targets = get_target_images()

    if not targets:
        log(f"[안내] '{TARGETS_DIR}' 폴더에 클릭할 아이콘 이미지(.png)가 없습니다.")
        log("작업표시줄 아이콘을 캡처해서 폴더에 넣어주세요.")
        input("\n엔터(Enter) 키를 누르면 종료합니다...")
        return

    log(f"등록된 아이콘 총 {len(targets)}개:")
    for i, t in enumerate(targets, 1):
        log(f"  {i}. {t.name}")

    print("\n▶ 3초 후 매크로를 시작합니다... 마우스에서 손을 떼어 주세요!")
    for i in range(3, 0, -1):
        print(f"  {i}...")
        time.sleep(1)

    success_cnt = 0
    total = len(targets)

    for idx, target_file in enumerate(targets, 1):
        ok = execute_step(target_file, config, idx, total)
        if ok:
            success_cnt += 1

    log("=" * 60)
    log(f"🎉 모든 작업 완료! (성공: {success_cnt}/{total})")
    log("=" * 60)
    time.sleep(1.5)

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        log("\n[알림] 사용자에 의해 중단되었습니다.")
    except pyautogui.FailSafeException:
        log("\n[비상 탈출] 마우스 모서리 이동으로 즉시 강제 중단되었습니다.")
    except Exception as e:
        log(f"\n[오류 발생] {traceback.format_exc()}")
        input("\n오류가 발생했습니다. 확인 후 엔터를 누르세요...")
