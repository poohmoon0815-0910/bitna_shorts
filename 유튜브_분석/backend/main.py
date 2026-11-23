"""FastAPI backend for YouTube Transcript Extraction & Deep AI Script Analysis.

Runs on port 8001 (http://127.0.0.1:8001) independently of the main shorts-v2 dashboard (5173/8000).
"""

from __future__ import annotations

import html
import json
import re
import subprocess
from datetime import datetime
from pathlib import Path
from typing import Any, Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel

ROOT_DIR = Path("c:/shorts-v2")
ENV_PATH = ROOT_DIR / ".env"
APP_DIR = ROOT_DIR / "유튜브_분석"
OUTPUTS_DIR = APP_DIR / "outputs"
STATIC_DIR = APP_DIR / "frontend"

OUTPUTS_DIR.mkdir(parents=True, exist_ok=True)
STATIC_DIR.mkdir(parents=True, exist_ok=True)

app = FastAPI(title="YouTube Transcript & Deep Analysis API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def load_env() -> dict[str, str]:
    env: dict[str, str] = {}
    if ENV_PATH.exists():
        for raw in ENV_PATH.read_text(encoding="utf-8").splitlines():
            line = raw.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip().strip('"').strip("'")
    return env


class AnalyzeRequest(BaseModel):
    url: str
    custom_instruction: Optional[str] = ""


class CustomAskRequest(BaseModel):
    video_id: str
    question: str


def format_mmss(seconds: float) -> str:
    total = max(0, int(seconds))
    mins, secs = divmod(total, 60)
    hrs, mins = divmod(mins, 60)
    if hrs > 0:
        return f"{hrs:02d}:{mins:02d}:{secs:02d}"
    return f"{mins:02d}:{secs:02d}"


def parse_timestamp_to_seconds(ts: str) -> float:
    ts = ts.strip().replace(",", ".")
    parts = ts.split(":")
    try:
        if len(parts) == 3:
            return int(parts[0]) * 3600 + int(parts[1]) * 60 + float(parts[2])
        if len(parts) == 2:
            return int(parts[0]) * 60 + float(parts[1])
    except ValueError:
        pass
    return 0.0


def parse_vtt_or_srt(raw_text: str) -> tuple[str, list[dict[str, Any]]]:
    """Parse VTT/SRT into deduplicated full text and timestamped segments."""
    lines = raw_text.splitlines()
    segments: list[dict[str, Any]] = []
    seen_lines: list[str] = []

    current_start = 0.0
    ts_pattern = re.compile(
        r"((?:\d{1,2}:)?\d{2}:\d{2}[\.,]\d{3})\s*-->\s*((?:\d{1,2}:)?\d{2}:\d{2}[\.,]\d{3})"
    )

    buffer_lines: list[str] = []

    def flush_segment(start_sec: float, buf: list[str]) -> None:
        if not buf:
            return
        new_parts: list[str] = []
        for b in buf:
            if not seen_lines or (b != seen_lines[-1] and b not in seen_lines[-2:]):
                seen_lines.append(b)
                new_parts.append(b)
        if new_parts:
            text_joined = " ".join(new_parts).strip()
            if text_joined:
                segments.append(
                    {
                        "start": round(start_sec, 1),
                        "time_str": format_mmss(start_sec),
                        "text": text_joined,
                    }
                )

    for raw_line in lines:
        line = raw_line.strip()
        if not line:
            flush_segment(current_start, buffer_lines)
            buffer_lines = []
            continue
        if (
            line.startswith("WEBVTT")
            or line.startswith("Kind:")
            or line.startswith("Language:")
            or line.startswith("NOTE")
            or line.isdigit()
        ):
            continue

        m = ts_pattern.search(line)
        if m:
            flush_segment(current_start, buffer_lines)
            buffer_lines = []
            current_start = parse_timestamp_to_seconds(m.group(1))
            continue

        clean = re.sub(r"<[^>]+>", "", line)
        clean = html.unescape(clean).strip()
        if clean and clean not in buffer_lines:
            buffer_lines.append(clean)

    flush_segment(current_start, buffer_lines)
    full_text = " ".join(s["text"] for s in segments).strip()
    return full_text, segments


def extract_video_info_and_subtitles(
    url: str,
) -> tuple[dict[str, Any], Optional[str], list[dict[str, Any]]]:
    """Extract metadata and attempt subtitle download via yt-dlp."""
    info_cmd = ["yt-dlp", "--dump-json", "--no-playlist", url]
    res = subprocess.run(
        info_cmd, capture_output=True, text=True, encoding="utf-8", errors="replace"
    )
    if res.returncode != 0:
        raise RuntimeError(f"유튜브 영상 정보를 가져오지 못했습니다: {res.stderr[:250]}")

    info = json.loads(res.stdout)
    video_id = info.get("id", "video")
    meta = {
        "video_id": video_id,
        "title": info.get("title", "제목 없음"),
        "channel": info.get("channel") or info.get("uploader") or "알 수 없음",
        "duration": info.get("duration", 0),
        "duration_str": format_mmss(float(info.get("duration") or 0)),
        "view_count": info.get("view_count", 0),
        "upload_date": info.get("upload_date", ""),
        "thumbnail": info.get("thumbnail", ""),
        "webpage_url": info.get("webpage_url", url),
    }

    # Cleanup previous temp sub files for this video_id
    for old in OUTPUTS_DIR.glob(f"{video_id}_sub*"):
        try:
            old.unlink()
        except Exception:
            pass

    sub_base = OUTPUTS_DIR / f"{video_id}_sub"
    sub_cmd = [
        "yt-dlp",
        "--skip-download",
        "--write-sub",
        "--write-auto-sub",
        "--sub-lang",
        "ko,en",
        "--sub-format",
        "vtt/srt/best",
        "-o",
        str(sub_base),
        "--no-playlist",
        url,
    ]
    subprocess.run(
        sub_cmd, capture_output=True, text=True, encoding="utf-8", errors="replace"
    )

    sub_files = sorted(
        OUTPUTS_DIR.glob(f"{video_id}_sub*"),
        key=lambda p: (0 if ".ko." in p.name else 1),
    )
    for sf in sub_files:
        if sf.suffix.lower() in [".vtt", ".srt"]:
            raw_text = sf.read_text(encoding="utf-8", errors="replace")
            full_text, segments = parse_vtt_or_srt(raw_text)
            try:
                sf.unlink()
            except Exception:
                pass
            if len(full_text) >= 20:
                return meta, full_text, segments

    return meta, None, []


def transcribe_audio_whisper(
    url: str, video_id: str, api_key: str
) -> tuple[str, list[dict[str, Any]]]:
    """Download native audio stream (m4a/webm) and transcribe with Whisper verbose_json."""
    for old in OUTPUTS_DIR.glob(f"{video_id}_audio.*"):
        try:
            old.unlink()
        except Exception:
            pass

    out_tmpl = str(OUTPUTS_DIR / f"{video_id}_audio.%(ext)s")
    dl_cmd = [
        "yt-dlp",
        "-f",
        "ba[ext=m4a]/ba[ext=webm]/ba/best",
        "-o",
        out_tmpl,
        "--no-playlist",
        url,
    ]
    res = subprocess.run(
        dl_cmd, capture_output=True, text=True, encoding="utf-8", errors="replace"
    )
    downloaded = list(OUTPUTS_DIR.glob(f"{video_id}_audio.*"))
    if res.returncode != 0 or not downloaded:
        raise RuntimeError("오디오 스트림 다운로드에 실패했습니다.")

    audio_path = downloaded[0]
    try:
        from openai import OpenAI

        client = OpenAI(api_key=api_key)
        with open(audio_path, "rb") as audio_file:
            tr = client.audio.transcriptions.create(
                model="whisper-1",
                file=audio_file,
                response_format="verbose_json",
            )

        full_text = (getattr(tr, "text", "") or "").strip()
        raw_segments = getattr(tr, "segments", None) or []
        segments: list[dict[str, Any]] = []
        for seg in raw_segments:
            start_val = (
                seg.get("start", 0.0)
                if isinstance(seg, dict)
                else getattr(seg, "start", 0.0)
            )
            txt_val = (
                seg.get("text", "")
                if isinstance(seg, dict)
                else getattr(seg, "text", "")
            ).strip()
            if txt_val:
                segments.append(
                    {
                        "start": round(float(start_val), 1),
                        "time_str": format_mmss(float(start_val)),
                        "text": txt_val,
                    }
                )
        return full_text, segments
    finally:
        try:
            audio_path.unlink()
        except Exception:
            pass


def analyze_transcript_with_ai(
    meta: dict[str, Any],
    full_text: str,
    segments: list[dict[str, Any]],
    api_key: str,
    model_name: str,
    custom_instruction: str = "",
) -> dict[str, Any]:
    """Perform deep content, hook, structure, and Shorts remake analysis."""
    from openai import OpenAI

    client = OpenAI(api_key=api_key)

    timeline_preview = "\n".join(
        f"[{s['time_str']}] {s['text']}" for s in segments[:80]
    )
    extra_note = (
        f"\n[사용자 추가 분석 요청사항]\n{custom_instruction}\n"
        if custom_instruction.strip()
        else ""
    )

    prompt = f"""다음은 유튜브 영상에서 추출한 실제 음성 대본(스크립트)과 타임라인입니다.

[영상 기본 정보]
- 제목: {meta.get('title')}
- 채널: {meta.get('channel')}
- 길이: {meta.get('duration_str')}
- 조회수: {meta.get('view_count')}
{extra_note}
[타임라인별 대사 (앞부분)]
{timeline_preview}

[추출된 전체 대본 원문]
{full_text[:12000]}

당신은 대한민국 최고의 유튜브 콘텐츠 분석가이자 '호기심빛나' 쇼츠 채널 총괄 프로듀서입니다.
위 대본의 내용을 깊이 있게 해부하여 아래 JSON 구조로만 응답하세요 (코드블록 ```json 없이 순수 JSON만 출력):

{{
  "channel_fit": {{
    "fit_score": 88,
    "fit_verdict": "적합 | 조건부 적합 | 부적합 중 하나",
    "category": "우주/천문 | 인체/생명 | 과학/물리 | 시간/스케일 | 일상/심리(비주력) | 기타 중 하나",
    "reason": "호기심빛나 핵심 방향성(과학·인체·우주·호기심 지식 탐구, 숫자 기반 3초 후킹, 클레이 3D 캐릭터 시너지)과의 적합도 평가 이유",
    "pivot_or_usage_tip": "적합하면 클레이 3D 및 숫자 후킹 강화 포인트, 부적합하면 과학/호기심 각도로 리프레이밍하거나 서브/실험 채널로 활용하는 방법"
  }},
  "summary": "영상 전체 핵심 내용과 주제를 3~4문장으로 명쾌하게 요약",
  "core_claims": [
    "영상에서 말하는 핵심 팩트/주장/정보 1",
    "영상에서 말하는 핵심 팩트/주장/정보 2",
    "영상에서 말하는 핵심 팩트/주장/정보 3",
    "영상에서 말하는 핵심 팩트/주장/정보 4"
  ],
  "tone_and_style": "화자의 말투, 호흡, 감정선, 설득 방식(예: 숫자 비유, 공포 소구, 상식 파괴 등) 분석",
  "hooking_analysis": {{
    "opening_line": "영상의 실제 첫 1~2문장",
    "why_it_worked": "초반 3~5초에 시청자의 스크롤을 멈추게 만든 심리적 장치와 설득 구조 분석",
    "hook_score": 92
  }},
  "structure": [
    {{"phase": "1단계: 도입/후킹", "description": "어떤 질문이나 충격적 사실로 시작했는지"}},
    {{"phase": "2단계: 문제 제기/배경", "description": "시청자의 호기심을 어떻게 증폭시켰는지"}},
    {{"phase": "3단계: 핵심 근거/반전", "description": "가장 흥미로운 숫자·사례·과학적 원리 제시 구간"}},
    {{"phase": "4단계: 결론/여운", "description": "마지막 여운이나 댓글 유도 방식"}}
  ],
  "retention_secrets": [
    "시청자가 중간에 나가지 않고 끝까지 보게 만든 대본 장치 1",
    "시청자가 중간에 나가지 않고 끝까지 보게 만든 대본 장치 2",
    "시청자가 중간에 나가지 않고 끝까지 보게 만든 대본 장치 3"
  ],
  "shorts_remake_guide": {{
    "recommended_titles": [
      "호기심빛나 스타일 추천 제목 1 (호기심/숫자 강조)",
      "호기심빛나 스타일 추천 제목 2 (상식 반전 강조)",
      "호기심빛나 스타일 추천 제목 3 (질문형)"
    ],
    "hooking_script": "초반 3초 시청자를 사로잡을 강렬한 첫 문장",
    "ready_to_use_script": "원본 영상의 핵심 소재를 '호기심빛나' 채널 스타일(45~55초 분량, 친근하면서도 놀라운 과학/호기심 스토리텔링)로 완전히 새롭게 재작성한 실전 쇼츠 대본 전문 (6~8문장)",
    "visual_scene_idea": "Google Flow 나노바나나 클레이(점토) 3D 오리지널 캐릭터로 연출할 핵심 장면 2~3개 아이디어"
  }}
}}"""

    resp = client.chat.completions.create(
        model=model_name or "gpt-4.1-mini",
        messages=[
            {
                "role": "system",
                "content": "You are an expert Korean YouTube content strategist. Always output valid JSON only.",
            },
            {"role": "user", "content": prompt},
        ],
        temperature=0.35,
    )
    raw = (resp.choices[0].message.content or "").strip()
    raw = re.sub(r"^```json\s*|\s*```$", "", raw, flags=re.IGNORECASE)
    return json.loads(raw)


@app.post("/api/extract-and-analyze")
def handle_extract_and_analyze(req: AnalyzeRequest) -> dict[str, Any]:
    url = req.url.strip()
    if not url:
        raise HTTPException(status_code=400, detail="유튜브 URL을 입력해 주세요.")

    env = load_env()
    api_key = env.get("OPENAI_API_KEY", "")
    model_name = env.get("OPENAI_ANALYSIS_MODEL", "gpt-4.1-mini")
    if not api_key:
        raise HTTPException(
            status_code=500, detail=".env 파일에 OPENAI_API_KEY가 설정되어 있지 않습니다."
        )

    try:
        meta, full_text, segments = extract_video_info_and_subtitles(url)
        source_type = "유튜브 자막 추출"
        if not full_text:
            source_type = "OpenAI Whisper 음성인식(STT)"
            full_text, segments = transcribe_audio_whisper(
                url, meta["video_id"], api_key
            )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if not full_text or len(full_text.strip()) < 10:
        raise HTTPException(
            status_code=400, detail="영상에서 음성 또는 자막 텍스트를 추출하지 못했습니다."
        )

    try:
        analysis = analyze_transcript_with_ai(
            meta,
            full_text,
            segments,
            api_key,
            model_name,
            req.custom_instruction or "",
        )
    except Exception as exc:
        raise HTTPException(
            status_code=500, detail=f"AI 대본 분석 중 오류가 발생했습니다: {exc}"
        ) from exc

    save_data = {
        "analyzed_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "meta": meta,
        "source_type": source_type,
        "transcript": full_text,
        "segments": segments,
        "analysis": analysis,
    }
    save_path = OUTPUTS_DIR / f"{meta['video_id']}_analysis.json"
    save_path.write_text(
        json.dumps(save_data, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    txt_path = OUTPUTS_DIR / f"{meta['video_id']}_transcript.txt"
    timeline_txt = "\n".join(f"[{s['time_str']}] {s['text']}" for s in segments)
    txt_path.write_text(
        f"제목: {meta['title']}\n채널: {meta['channel']}\nURL: {meta['webpage_url']}\n"
        f"추출방식: {source_type}\n\n=== 전체 텍스트 ===\n{full_text}\n\n"
        f"=== 타임라인별 대사 ===\n{timeline_txt}\n",
        encoding="utf-8",
    )

    return save_data


@app.post("/api/ask-transcript")
def ask_about_transcript(req: CustomAskRequest) -> dict[str, str]:
    """Allow the user to ask follow-up questions or request custom analysis on an extracted transcript."""
    p = OUTPUTS_DIR / f"{req.video_id}_analysis.json"
    if not p.exists():
        raise HTTPException(status_code=404, detail=" 먼저 영상을 추출해 주세요.")

    data = json.loads(p.read_text(encoding="utf-8"))
    env = load_env()
    api_key = env.get("OPENAI_API_KEY", "")
    model_name = env.get("OPENAI_ANALYSIS_MODEL", "gpt-4.1-mini")

    from openai import OpenAI

    client = OpenAI(api_key=api_key)
    prompt = f"""[영상 제목]: {data['meta']['title']}
[추출된 전체 대본]:
{data['transcript'][:12000]}

[사용자 질문/요청]:
{req.question}

위 대본 내용을 바탕으로 사용자의 질문이나 요청에 명확하고 실용적으로 답변해 주세요."""

    resp = client.chat.completions.create(
        model=model_name,
        messages=[
            {
                "role": "system",
                "content": "당신은 유튜브 대본 분석 및 쇼츠 기획 전문가입니다.",
            },
            {"role": "user", "content": prompt},
        ],
        temperature=0.4,
    )
    return {"answer": (resp.choices[0].message.content or "").strip()}


@app.get("/api/history")
def get_history() -> list[dict[str, Any]]:
    history: list[dict[str, Any]] = []
    files = sorted(
        OUTPUTS_DIR.glob("*_analysis.json"),
        key=lambda x: x.stat().st_mtime,
        reverse=True,
    )[:30]
    for f in files:
        try:
            d = json.loads(f.read_text(encoding="utf-8"))
            history.append(
                {
                    "video_id": d["meta"]["video_id"],
                    "title": d["meta"]["title"],
                    "channel": d["meta"]["channel"],
                    "duration_str": d["meta"].get("duration_str", ""),
                    "thumbnail": d["meta"].get("thumbnail", ""),
                    "source_type": d.get("source_type", ""),
                    "analyzed_at": d.get("analyzed_at", ""),
                }
            )
        except Exception:
            pass
    return history


@app.get("/api/result/{video_id}")
def get_result(video_id: str) -> dict[str, Any]:
    p = OUTPUTS_DIR / f"{video_id}_analysis.json"
    if not p.exists():
        raise HTTPException(status_code=404, detail="저장된 분석 결과를 찾을 수 없습니다.")
    return json.loads(p.read_text(encoding="utf-8"))


@app.get("/")
def serve_index() -> FileResponse:
    return FileResponse(STATIC_DIR / "index.html")
