import json
from pathlib import Path

from fastapi.testclient import TestClient

from app.main import create_app


from app.projects.service import create_project


def test_production_state_and_assets(tmp_path: Path):
    app = create_app(repo_root=tmp_path)
    client = TestClient(app)

    outputs_dir = tmp_path / "outputs"
    project = create_project(outputs_dir, project_title="테스트 쇼츠", now="261016_1200")
    project_id = project.project_id

    # 2. production 초기 상태 조회
    resp = client.get(f"/api/projects/{project_id}/production")
    assert resp.status_code == 200
    data = resp.json()
    assert data["has_audio"] is False
    assert data["has_video_scenes"] is False

    # 3. video_scenes.json 및 scene 파일 준비
    proj_dir = outputs_dir / project_id
    scenes_dir = proj_dir / "scenes"
    scenes_dir.mkdir(parents=True, exist_ok=True)

    dummy_video_scenes = [
        {
            "scene_id": 1,
            "target_duration": 5.0,
            "start": 0.0,
            "end": 5.0,
            "duration_frames": 150,
            "narration": "첫 번째 씬 나레이션",
            "start_image_prompt": "Prompt 1",
            "video_prompt": "Motion 1",
            "continuity": {
                "camera": "Eye-level",
                "subject_state": "Hero",
                "lighting": "Studio",
                "handoff_description": "Smooth tilt up",
            },
            "is_locked": False,
        },
        {
            "scene_id": 2,
            "target_duration": 5.0,
            "start": 5.0,
            "end": 10.0,
            "duration_frames": 150,
            "narration": "두 번째 씬 나레이션",
            "start_image_prompt": "Prompt 2",
            "video_prompt": "Motion 2",
            "continuity": {
                "camera": "Top-down",
                "subject_state": "Tree",
                "lighting": "Sunlight",
                "handoff_description": "Pan to ground",
            },
            "is_locked": False,
        },
    ]
    (proj_dir / "video_scenes.json").write_text(json.dumps(dummy_video_scenes), encoding="utf-8")

    # 더미 mp4 파일 및 final png 생성
    mp4_path = scenes_dir / "scene_01_video.mp4"
    mp4_path.write_bytes(b"\x00\x00\x00\x20ftypisom")
    final_png = scenes_dir / "scene_01_final.png"
    final_png.write_bytes(b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR")

    # 4. mp4 서빙 테스트
    resp = client.get(f"/api/projects/{project_id}/production/scenes/scene_01_video.mp4")
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "video/mp4"

    # 5. 다음 씬으로 프레임 인계 테스트 (POST /scenes/1/pass-next)
    resp = client.post(f"/api/projects/{project_id}/production/scenes/1/pass-next")
    assert resp.status_code == 200
    # scene_02_start.png가 생성되었는지 확인
    next_start = scenes_dir / "scene_02_start.png"
    assert next_start.exists()
    assert next_start.read_bytes() == final_png.read_bytes()

    # 6. state 조회 시 URL 바인딩 확인
    resp = client.get(f"/api/projects/{project_id}/production")
    assert resp.status_code == 200
    state = resp.json()
    assert state["video_scene_count"] == 2
    sc1 = state["video_scenes"][0]
    sc2 = state["video_scenes"][1]
    assert sc1["generated_video_url"] == f"/api/projects/{project_id}/production/scenes/scene_01_video.mp4"
    assert sc1["final_frame_url"] == f"/api/projects/{project_id}/production/scenes/scene_01_final.png"
    assert sc2["start_image_url"] == f"/api/projects/{project_id}/production/scenes/scene_02_start.png"
    assert sc2["continuity"]["prev_final_frame_url"] == sc1["final_frame_url"]


def test_mask_youtube_sensitive_words():
    from app.production.renderer import mask_youtube_sensitive_words

    assert mask_youtube_sensitive_words("마약과 도박은 위험합니다.") == "ㅁ약과 ㄷ박은 위험합니다."
    assert mask_youtube_sensitive_words("자살 예방과 살인 사건") == "ㅈ살 예방과 ㅅ인 사건"
    assert mask_youtube_sensitive_words("정상적인 과학 팩트 대본") == "정상적인 과학 팩트 대본"


def test_guard_refined_stt_segment():
    from app.production.service import _guard_refined_stt_segment

    # 1. 정상 미세 교정 통과
    assert _guard_refined_stt_segment("지구는 태양을 공전함니다", "지구는 태양을 공전합니다") == "지구는 태양을 공전합니다"

    # 2. 숫자·영문 치환 예외 통과 (중복률이 낮아도 허용)
    assert _guard_refined_stt_segment("칠십 퍼센트", "70%") == "70%"
    assert _guard_refined_stt_segment("에이아이", "AI") == "AI"
    assert _guard_refined_stt_segment("전 세계 인구의 칠십 퍼센트가", "전 세계 인구의 70%가") == "전 세계 인구의 70%가"

    # 3. 문장 병합(1.85배 초과) 및 누락(0.55배 미만) 차단 -> 원본 STT 유지
    merged = _guard_refined_stt_segment(
        "지구는 태양을 공전합니다",
        "지구는 태양을 공전합니다 그리고 달도 지구 주위를 돕니다",
    )
    assert merged == "지구는 태양을 공전합니다"
    assert _guard_refined_stt_segment("지구는 태양을 공전합니다", "지구는") == "지구는 태양을 공전합니다"
    assert _guard_refined_stt_segment("지구는 태양을 공전합니다", "") == "지구는 태양을 공전합니다"

    # 4. 환각(원본 중복률 40% 미만) 차단 -> 원본 STT 유지
    hallucinated = _guard_refined_stt_segment("우주는 끝없이 팽창하고 있어요", "바다는 깊고 푸른 빛을 띱니다")
    assert hallucinated == "우주는 끝없이 팽창하고 있어요"

    # 5. 긴 문장에서 숫자만 끼워 넣은 환각도 차단 (중복률 25% 미만)
    long_hallucinated = _guard_refined_stt_segment("전 세계 인구의 칠십 퍼센트가", "완전히 다른 문장 100%")
    assert long_hallucinated == "전 세계 인구의 칠십 퍼센트가"
