from __future__ import annotations

from pathlib import Path
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator

from app.references.files import write_reference_analysis_files


class AnalysisSection(BaseModel):
    model_config = ConfigDict(extra="ignore")

    section: str = Field(min_length=1)
    script_excerpt: str = Field(min_length=1)
    viewer_reaction: str = Field(min_length=1)
    purpose: str = Field(min_length=1)


class SentenceAnalysis(BaseModel):
    model_config = ConfigDict(extra="ignore")

    sentence_range: str = ""
    script_text: str = ""
    viewer_mindset: str = ""
    technique: str = ""
    role: str = ""


class RecommendedTopic(BaseModel):
    model_config = ConfigDict(extra="ignore")

    topic_number: int = 1
    title: str = ""
    category: str = ""
    formula: str = ""
    hook: str = ""
    core_question: str = ""
    production_strategy: str = ""


class ReferenceAnalysis(BaseModel):
    model_config = ConfigDict(extra="ignore")

    primary_structure: str = Field(min_length=1)
    supporting_structures: list[str] = Field(default_factory=list)
    winning_formula: str = ""
    viral_reasons: list[str] = Field(default_factory=list)
    thinking_vs_payoff: str = ""
    hook_analysis: str = Field(min_length=1)
    curiosity_gap: str = Field(min_length=1)
    retention_analysis: str = Field(min_length=1)
    payoff_analysis: str = Field(min_length=1)
    risk_notes: list[str] = Field(default_factory=list)
    reusable_structure_notes: str = Field(min_length=1)
    section_breakdown: list[AnalysisSection] = Field(default_factory=list)
    sentence_analyses: list[SentenceAnalysis] = Field(default_factory=list)
    recommended_topics: list[RecommendedTopic] = Field(default_factory=list)

    @field_validator("supporting_structures", "risk_notes", "viral_reasons", mode="before")
    @classmethod
    def coerce_list(cls, value: Any) -> list[str]:
        if isinstance(value, str):
            stripped = value.strip()
            return [stripped] if stripped else []
        if isinstance(value, list):
            return [str(item) for item in value]
        raise ValueError(f"Expected a string or list of strings, got {type(value).__name__}")


def validate_reference_analysis(analysis: dict) -> dict:
    try:
        return ReferenceAnalysis.model_validate(analysis).model_dump()
    except ValidationError as exc:
        raise ValueError(str(exc)) from exc


def build_analysis_prompt(reference_script: str) -> str:
    return f"""
당신은 대한민국 최고의 유튜브 쇼츠 바이럴 컨설턴트이자 **'호기심빛나' 채널 전담 수석 기획자**입니다.
제공된 레퍼런스 쇼츠 대본을 심층 분석하여, 왜 이 영상이 높은 조회수를 기록했는지(알고리즘 떡상 요인)를 해부하고, 이 떡상 구조를 **'호기심빛나' 채널에 100% 최적화된 새로운 쇼츠 5편**으로 재구성하는 전략 리포트를 작성하세요.
반드시 모든 내용은 실전 크리에이터가 즉시 활용할 수 있도록 생생하고 날카로운 **한국어**로 작성해야 합니다.

### [타겟 채널 정체성: '호기심빛나' (필수 준수)]
- **핵심 주제 영역**: 우주·천문 / 인체·뇌과학 / 물리·화학·자연 / 시간·스케일 착시 / 진화·생명 미스터리 등 **누구나 1분 안에 빠져드는 경이로운 과학·호기심 지식**
- **시각화 컨셉**: 아기자기하고 귀여운 **오리지널 클레이(점토) 3D 캐릭터**가 거대한 우주, 몸속 혈관·뇌, 과학 실험실, 미시 세계를 직접 탐험하며 원리를 보여주는 연출
- **후킹 무기**: 상식을 뒤엎는 구체적 숫자·비율·체감 비유 (예: "달이 매년 3.8cm씩 멀어지면", "뇌 속 청소 트럭 수천 대")
- **절대 금지 영역**:
  - 단순 일상·생활 꿀팁, 연애·대화법·처세술·직장 심리, 일반 연예·정치 이슈는 추천 주제에 절대 넣지 마세요.
  - Google Flow 이미지 정책 위반을 막기 위해, **실존 유명인(예: 일론 머스크, 아인슈타인 등)의 얼굴 묘사에 의존하는 기획을 피하고** 모든 인물은 오리지널 클레이 캐릭터(탐험가·과학자·세포 요원 등)로 연출하세요.

### [분석 프레임워크 참고 기준]
1. 떡상하는 쇼츠의 12대 흥행 공식:
   - ① 상식 충돌형 ("당연히 이래야 하는데, 왜 반대지?")
   - ② 실험·검증형 ("진짜 그런지 직접 확인해보자")
   - ③ 미스터리·정체 공개형 ("지금 보는 게 대체 뭐지?")
   - ④ 도전·제약형 ("저 조건으로 성공할 수 있나?")
   - ⑤ 전후 변화형 ("이게 저렇게 바뀐다고?")
   - ⑥ 문제 해결형 ("내가 겪던 불편을 해결해준다")
   - ⑦ 비교·선택형 ("둘 중 뭘 골라야 하지?")
   - ⑧ 단계 상승형 ("다음 단계는 얼마나 더 대단할까?")
   - ⑨ 공감·상황극형 ("이거 완전히 나잖아")
   - ⑩ 감정 반전형 ("처음엔 그렇게 봤는데, 알고 보니...")
   - ⑪ 감각 만족형 ("그냥 보는 과정 자체가 좋다")
   - ⑫ 참여·정답 확인형 ("내가 맞혔는지 확인하고 싶다")

2. 떡상 쇼츠의 핵심 요소:
   - 익숙한 것을 낯설게 만들기 (친숙한 대상에 낯선 조건 붙이기)
   - 설명보다 '사건'과 '현상'이 먼저 등장
   - 시청자가 스스로 결과를 예측하게 만듦 (예측이 있어야 결과를 확인할 이유가 생김)
   - 중간에 상태/국면의 극적 변화
   - "시청자가 해야 하는 생각의 양"에 비해 "확인하고 싶은 결과의 선명함"이 압도적인가?

### [응답 JSON 스키마 (반드시 JSON만 출력)]
{{
  "primary_structure": "가장 핵심이 되는 구조 및 공식 요약 (한국어)",
  "supporting_structures": ["결합된 보조 공식이나 보조 장치 (한국어 배열)"],
  "winning_formula": "12대 공식 중 주요 공식 명칭 (예: 상식 충돌형)",
  "viral_reasons": [
    "떡상 요인 1: 소재와 낯선 조건의 결합 방식",
    "떡상 요인 2: 사건 우선 배치와 시청자 호기심 자극",
    "떡상 요인 3: 중반 이탈을 막은 상태 변화 장치",
    "떡상 요인 4: 결말의 선명한 보상과 만족감"
  ],
  "thinking_vs_payoff": "시청자가 감당해야 할 인지적 부담과 대비하여 제공되는 보상의 선명함 분석",
  "hook_analysis": "첫 3초 후킹의 작동 원리 (왜 스크롤을 멈추게 만드는가?)",
  "curiosity_gap": "시청자가 끝까지 머물게 만드는 핵심 궁금증(호기심 갭)",
  "retention_analysis": "중반 시청 지속을 견인한 전개 장치 및 리듬 분석",
  "payoff_analysis": "결말에서 제공하는 지적/감정적 보상과 공유 유발 포인트",
  "risk_notes": [
    "레퍼런스 대본 속 팩트체크(수치·단위·과장 표현 검증)가 필요한 부분과 제작·정책 리스크 (한국어 배열)"
  ],
  "reusable_structure_notes": "호기심빛나 과학·호기심 쇼츠로 확장할 때 반드시 복제해야 할 핵심 구조 템플릿",
  "section_breakdown": [],
  "sentence_analyses": [
    {{
      "sentence_range": "1~2문장",
      "script_text": "실제 대본 문장",
      "viewer_mindset": "시청자의 속마음 (예: 어? 저게 왜 저기 있지?)",
      "technique": "적용된 연출/심리 기법 (예: 익숙함 속 낯선 조건 제시)",
      "role": "소재 이해 / 후킹 / 의문 심화 / 반전 / 결말 보상 중 택1"
    }}
  ],
  "recommended_topics": [
    {{
      "topic_number": 1,
      "title": "앞 번호 없는 깔끔하고 클릭을 부르는 호기심빛나 맞춤 제목",
      "category": "우주·천문 / 인체·뇌과학 / 물리·자연 / 시간·스케일 착시 / 진화·생명 미스터리 중 택1",
      "formula": "적용할 흥행 공식 (예: 상식 충돌형 + 단계 상승형)",
      "hook": "숫자나 체감 비유로 시청자가 3초 안에 무조건 멈출 첫 문장",
      "core_question": "시청자가 결과를 확인하려고 끝까지 볼 핵심 질문",
      "production_strategy": "중반 상태 변화, 결말 보상, 그리고 귀여운 오리지널 클레이 3D 캐릭터 핵심 씬 연출 아이디어(실존 인물 얼굴 미사용)를 포함한 구체적 전략"
    }}
  ]
}}

# System instruction: Analyze why viewers stop, why they keep watching, and how they feel payoff. Keep section_breakdown as an empty list [] when sentence_analyses covers the full script to avoid duplicate tokens.
* 주의사항:
- sentence_analyses는 대본 전체를 1~3문장 단위로 쪼개어 시청자의 속마음을 입체적으로 분석해야 합니다.
- risk_notes에는 레퍼런스 대본에 등장하는 수치·단위·과학적 단정 중 **대본 확정 전 팩트체크가 필요한 항목**을 최소 1개 이상 명시하세요.
- recommended_topics는 반드시 **5개 모두 '호기심빛나' 메인 채널 적합 주제(과학·인체·우주·자연·시간/생명 호기심)** 로만 제안해야 합니다.
  - 1번 주제: 레퍼런스 자체가 과학·인체·우주·호기심 주제라면 '원본 소재의 팩트 강화형 리메이크'로, 레퍼런스가 다른 분야(일상·심리·대화법 등)라면 '원본의 떡상 구조만 100% 이식한 호기심빛나 대표 킬러 주제'로 제안하세요.
  - 2~5번 주제: 우주·천문, 인체·뇌과학, 물리·자연, 시간·스케일 착시, 진화·생명 미스터리 영역이 골고루 섞이도록 겹치지 않게 변주하세요.
  - 모든 추천 제목(title) 앞에는 번호(`1.`, `01_` 등)를 넣지 마세요.
- JSON 외의 다른 텍스트는 출력하지 마세요.

대본:
{reference_script}
""".strip()


def render_analysis_markdown(analysis: dict) -> str:
    analysis = validate_reference_analysis(analysis)

    lines: list[str] = [
        "# Reference Analysis: 📈 레퍼런스 쇼츠 떡상 심층 분석 리포트",
        "",
        "## 1. 떡상 핵심 공식 및 알고리즘 흥행 요인",
        f"- **주요 흥행 공식:** {analysis.get('winning_formula') or analysis.get('primary_structure', '상식 충돌형')}",
    ]

    supporting = analysis.get("supporting_structures", [])
    if supporting:
        lines.append(f"- **결합 보조 공식:** {', '.join(supporting)}")

    thinking = analysis.get("thinking_vs_payoff")
    if thinking:
        lines.append(f"- **인지적 부담 vs 보상의 선명도:** {thinking}")

    lines.extend([
        "",
        "### 💡 왜 이 쇼츠가 터졌을까? (핵심 성공 비결)",
    ])
    for reason in analysis.get("viral_reasons", []):
        lines.append(f"- {reason}")

    lines.extend([
        "",
        f"- **🎣 후킹 (멈춘 이유):** {analysis.get('hook_analysis', '')}",
        f"- **❓ 호기심 갭 (계속 본 이유):** {analysis.get('curiosity_gap', '')}",
        f"- **🔄 시청 지속 장치 (상태 변화):** {analysis.get('retention_analysis', '')}",
        f"- **🎁 보상 (결말 만족감):** {analysis.get('payoff_analysis', '')}",
        "",
        f"### 뼈대 구조 복제 가이드",
        str(analysis.get("reusable_structure_notes", "")),
    ])

    risks = analysis.get("risk_notes", [])
    if risks:
        lines.extend(["", "### ⚠️ 주의할 리스크"])
        for risk in risks:
            lines.append(f"- {risk}")

    # 1~3문장 단위 상세 분석
    sentences = analysis.get("sentence_analyses", [])
    if sentences:
        lines.extend([
            "",
            "---",
            "",
            "## 2. 🔍 1~3문장 단위 문맥 및 시청자 심리 변화 분석",
            "",
            "| 구간 | 역할 | 대본 발췌 | 시청자의 속마음 | 적용된 연출/심리 기법 |",
            "|---|---|---|---|---|",
        ])
        for item in sentences:
            s_range = item.get("sentence_range", "").replace("|", "/")
            s_role = item.get("role", "").replace("|", "/")
            s_text = item.get("script_text", "").replace("|", "/").replace("\n", " ")
            s_mind = item.get("viewer_mindset", "").replace("|", "/").replace("\n", " ")
            s_tech = item.get("technique", "").replace("|", "/").replace("\n", " ")
            lines.append(f"| {s_range} | **{s_role}** | {s_text} | *\"{s_mind}\"* | {s_tech} |")

    # 기존 섹션 브레이크다운 호환
    sections = analysis.get("section_breakdown", [])
    if sections and not sentences:
        lines.extend(["", "---", "", "## 2. 섹션별 상세 분석"])
        for section in sections:
            lines.extend([
                f"### {section.get('section', '')}",
                f"- **대본 발췌:** {section.get('script_excerpt', '')}",
                f"- **시청자 반응:** {section.get('viewer_reaction', '')}",
                f"- **연출 목적:** {section.get('purpose', '')}",
                "",
            ])

    # 5가지 추천 주제 및 제작 전략
    topics = analysis.get("recommended_topics", [])
    if topics:
        lines.extend([
            "",
            "---",
            "",
            "## 3. 🎯 떡상 공식 기반 추천 재구성 주제 5선 & 제작 전략",
            "> 💡 **안내:** 아래 5가지 추천 주제 중 마음에 드는 주제를 선택하거나, 원하는 방향을 아래 피드백 입력창에 적어주세요. 이를 바탕으로 대본 초안 2개 버전을 생성합니다.",
            "",
        ])
        for topic in topics:
            num = topic.get("topic_number", 1)
            t_title = topic.get("title", "")
            t_cat = topic.get("category", "")
            t_formula = topic.get("formula", "")
            t_hook = topic.get("hook", "")
            t_question = topic.get("core_question", "")
            t_strategy = topic.get("production_strategy", "")

            lines.extend([
                f"### #{num}. {t_title} `[{t_cat}]`",
                f"- **적용 공식:** {t_formula}",
                f"- **추천 훅 (첫 문장):** \"{t_hook}\"",
                f"- **핵심 호기심 질문:** {t_question}",
                f"- **실전 제작 전략:** {t_strategy}",
                "",
            ])

    return "\n".join(lines).strip() + "\n"


def write_reference_analysis(project_dir: Path, analysis: dict) -> str:
    analysis = validate_reference_analysis(analysis)
    markdown = render_analysis_markdown(analysis)
    write_reference_analysis_files(project_dir, analysis, markdown)
    return markdown

