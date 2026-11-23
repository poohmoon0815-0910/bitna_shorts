import json
from pathlib import Path
from app.production.renderer import render_final_shorts
from app.core.settings import load_settings

settings = load_settings()
outputs_dir = Path("c:/shorts-v2/outputs")

mapping = {
    "261120_0905": "내 몸속 1,000억 백혈구 전투!",
    "261120_0934": "혀 맛지도는 100년 된 거짓말?",
    "261120_1002": "우주에서 울면 생기는 끔찍한 일!",
    "261120_1028": "토성 고리가 곧 사라진다고?",
    "261120_1053": "기린 목이 1cm만 더 길었다면?"
}

dest_dir = outputs_dir / "완성된_쇼츠_5편_261120"
dest_dir.mkdir(parents=True, exist_ok=True)

for dir_name, short_title in mapping.items():
    p_dir = outputs_dir / dir_name
    print(f"\n==========================================")
    print(f"🎬 [재렌더링 시작] {dir_name}: {short_title}")
    print(f"==========================================")
    try:
        final_mp4 = render_final_shorts(p_dir, settings, title=short_title)
        print(f"✅ 렌더링 완료: {final_mp4}")
        
        # 새 제목으로 복사
        target_copy = dest_dir / f"{short_title}.mp4"
        import shutil
        shutil.copy2(final_mp4, target_copy)
        print(f"📦 배포 사본 저장 완료: {target_copy}")
    except Exception as e:
        print(f"❌ 렌더링 실패 ({dir_name}): {e}")

print("\n🎉 모든 5편 재렌더링 및 사본 갱신 완료!")
