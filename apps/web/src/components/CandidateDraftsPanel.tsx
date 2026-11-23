import { useState } from "react";
import type { DraftReviewResult, ScriptCandidate } from "../types";

interface CandidateDraftsPanelProps {
  readonly candidates: readonly ScriptCandidate[];
  readonly candidateReviews?: Readonly<Record<string, DraftReviewResult>>;
  readonly isBusy: boolean;
  readonly reviewingCandidateId?: string | null;
  readonly onGenerate: (feedback: string) => void;
  readonly onReview?: (candidateId: string) => void | Promise<void>;
  readonly onSelect: (candidateId: string) => void;
  readonly onUpdateCandidate?: (candidateId: string, draftScript: string) => void | Promise<void>;
  readonly selectedCandidateId: string | null;
  readonly videoTitle?: string;
  readonly onTitleChange?: (title: string) => void;
}

function formatCandidateType(value: ScriptCandidate["candidate_type"]): string {
  switch (value) {
    case "draft_a":
      return "Draft A (상식 충돌 / 텐션형)";
    case "draft_b":
      return "Draft B (스토리텔링 / 몰입형)";
    case "same_topic":
      return "Same Topic (동일 주제 리메이크)";
    case "different_topic":
      return "Different Topic (새로운 주제 변주)";
    default:
      return value;
  }
}

export function CandidateDraftsPanel({
  candidates,
  candidateReviews,
  isBusy,
  reviewingCandidateId,
  onGenerate,
  onReview,
  onSelect,
  onUpdateCandidate,
  selectedCandidateId,
  videoTitle,
  onTitleChange
}: CandidateDraftsPanelProps) {
  const [feedback, setFeedback] = useState("");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [editingCandidateId, setEditingCandidateId] = useState<string | null>(null);
  const [editingScript, setEditingScript] = useState("");

  function startEditing(candidateId: string, initialScript: string) {
    setEditingCandidateId(candidateId);
    setEditingScript(initialScript);
  }

  function cancelEditing() {
    setEditingCandidateId(null);
    setEditingScript("");
  }

  async function saveEditing(candidateId: string) {
    const trimmed = editingScript.trim();
    if (!trimmed || !onUpdateCandidate) return;
    await onUpdateCandidate(candidateId, trimmed);
    setEditingCandidateId(null);
    setEditingScript("");
  }

  function copyText(key: string, text: string) {
    if (!text) return;
    void navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => {
      setCopiedKey((curr) => (curr === key ? null : curr));
    }, 1500);
  }

  return (
    <section className="panel candidate-panel" aria-labelledby="candidates-title">
      <div className="section-header">
        <div>
          <p className="eyebrow">Step 05 · Candidates &amp; Drafts</p>
          <h2 id="candidates-title">AI 대본 초안 2종 생성 · 팩트체크</h2>
        </div>
        <button
          className="primary-button"
          disabled={isBusy}
          onClick={() => onGenerate(feedback)}
          type="button"
          aria-label="Generate candidates"
        >
          {isBusy ? (
            <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
              <span className="spinner-icon">⏳</span> 5. 대본 초안 생성 진행 중...
            </span>
          ) : (
            "5. 대본 초안 2개 생성"
          )}
        </button>
      </div>

      <div className="feedback-block">
        <label className="field-label" htmlFor="draft-generation-feedback">
          <strong>기획 방향 및 피드백 (선택 또는 자유 입력)</strong>
        </label>
        <p className="muted" style={{ margin: "2px 0 6px" }}>
          💡 분석 리포트의 5가지 추천 주제 중 원하는 번호를 고르거나,{" "}
          <strong style={{ color: "var(--ink)" }}>팩트체크할 주제, 강조할 구체적 숫자, 체감 비유(올림픽 수영장 N개 등)</strong>를
          자유롭게 적어주세요.
        </p>
        <div className="preset-chip-row">
          {[
            {
              label: "🌌 우주 호기심 (달 3.8cm)",
              value:
                "우주 호기심 주제: 달이 지구에서 1년에 3.8cm씩 멀어지면 생기는 끔찍한 일. \"만약 오늘 밤 달이 하늘에서 사라진다면, 지구는 몇 시간 만에 멸망할까요?\" 후킹과 정확한 천문 수치, 클레이 우주인 캐릭터 시너지를 살려 작성해줘."
            },
            {
              label: "🧬 인체 미스터리 (뇌 청소)",
              value:
                "인체 미스터리 주제: 우리가 밤에 잠잘 때 뇌가 쓰레기를 청소하는 글림프 시스템 과정. \"매일 밤 당신이 잠들면, 뇌 속에서는 물청소 트럭 수천 대가 출동합니다!\" 후킹과 구체적 수치·체감 비유로 작성해줘."
            },
            {
              label: "⏱️ 시간·스케일 착시 (공룡 vs 아이폰)",
              value:
                "시간/스케일 착시 주제: 티라노사우루스는 스테고사우루스보다 아이폰을 든 우리와 더 가까운 시대에 살았다는 반전 상식. 백만 년 단위 수치 비교와 댓글 토론 유도 엔딩으로 작성해줘."
            },
            {
              label: "🔬 호기심빛나 기본 톤",
              value:
                "호기심빛나 채널 페르소나(과학·인체·우주·호기심 지식 탐구, 첫 3초 숫자/질문 후킹, 클레이 3D 시각화하기 좋은 체감 비유)에 맞춰 작성해줘."
            }
          ].map((preset) => (
            <button
              key={preset.label}
              type="button"
              className="secondary-button"
              disabled={isBusy}
              onClick={() => setFeedback(preset.value)}
              style={{ fontSize: "12px", padding: "5px 10px" }}
            >
              {preset.label}
            </button>
          ))}
        </div>
        <textarea
          id="draft-generation-feedback"
          className="feedback-input"
          disabled={isBusy}
          onChange={(event) => setFeedback(event.target.value)}
          placeholder="예: 1번 추천 주제(개미가 하루 동안 옮기는 무게)로 해줘. 실제 과학 팩트와 충격적인 환산 수치(63빌딩 무게 등)를 넣어서 도파민 터지게 써줘."
          rows={3}
          value={feedback}
        />
      </div>

      {/* 🎬 쇼츠 오프닝 제목 입력란 */}
      <div className="feedback-block feedback-block--highlight" style={{ marginTop: "14px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
          <label className="field-label" htmlFor="draft-video-title">
            <strong>🎬 쇼츠 오프닝 제목 (0~2초 화면 상단 타이틀로 자동 렌더링)</strong>
          </label>
          <span className="current-step" style={{ fontSize: "11px", minHeight: "22px", padding: "2px 8px" }}>
            줄바꿈(Enter) 지원
          </span>
        </div>
        <p className="muted" style={{ margin: "2px 0 6px" }}>
          💡 여기서 정한 제목은 <strong style={{ color: "var(--gold-bright)" }}>[전체 씬 영상 일괄 생성 &amp; 렌더링]</strong> 및 최종
          렌더링 시 영상 시작 <strong style={{ color: "var(--ink)" }}>0~2초 동안 화면 상단에 노출되는 오프닝 타이틀</strong>로 자동
          반영됩니다.
        </p>
        <textarea
          id="draft-video-title"
          className="feedback-input title-input-accent"
          disabled={isBusy}
          onChange={(event) => onTitleChange?.(event.target.value)}
          placeholder={`예:\n빨대는 10m가 한계인데,\n나무는 어떻게 100m까지?`}
          rows={2}
          value={videoTitle ?? ""}
          style={{ minHeight: "64px" }}
        />
      </div>

      {candidates.length === 0 ? (
        <p className="empty-state" style={{ marginTop: "14px" }}>
          분석 리포트의 5가지 추천 주제를 확인한 뒤, 위 피드백란을 작성하고 [5. 대본 초안 2개 생성] 버튼을 눌러주세요.
        </p>
      ) : (
        <div className="candidate-list">
          {candidates.map((candidate) => {
            const isSelected = selectedCandidateId === candidate.candidate_id;
            const isReviewing = reviewingCandidateId === candidate.candidate_id;
            const review = candidateReviews?.[candidate.candidate_id];
            const isEditing = editingCandidateId === candidate.candidate_id;
            return (
              <article
                className={`candidate-card ${isSelected ? "candidate-card--selected" : ""}`}
                key={candidate.candidate_id}
              >
                <div className="candidate-card-header">
                  <span className="state-pill state-pill--running">{formatCandidateType(candidate.candidate_type)}</span>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                    <button
                      className="secondary-button"
                      disabled={isBusy || isReviewing}
                      onClick={() => onReview?.(candidate.candidate_id)}
                      type="button"
                      aria-label={`Review ${candidate.title}`}
                    >
                      {isReviewing ? "⏳ 초안 검토 중..." : "🔍 초안 검토"}
                    </button>
                    <button
                      className={isSelected ? "btn-emerald" : "primary-button"}
                      disabled={isBusy || isSelected}
                      onClick={() => onSelect(candidate.candidate_id)}
                      type="button"
                      aria-label={`Select ${candidate.title}`}
                      style={{ padding: "7px 12px", fontSize: "12px" }}
                    >
                      {isSelected ? "✓ 선택됨" : `이 초안 선택하기 (${candidate.candidate_id.toUpperCase()})`}
                    </button>
                  </div>
                </div>

                <h3>{candidate.title}</h3>

                {/* 🎯 후킹 제목 추천 3선 */}
                {candidate.title_options && candidate.title_options.length > 0 && (
                  <div className="candidate-subbox">
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <strong style={{ fontSize: "12.5px", color: "var(--gold-bright)" }}>🎯 후킹형 제목 3선</strong>
                      <span style={{ fontSize: "11px", color: "var(--muted)" }}>상황에 맞게 골라보세요</span>
                    </div>
                    <ul style={{ margin: 0, paddingLeft: "18px", fontSize: "12.5px", color: "var(--ink-secondary)", display: "flex", flexDirection: "column", gap: "6px" }}>
                      {candidate.title_options.map((titleOpt, idx) => (
                        <li key={idx} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px" }}>
                          <span style={{ fontWeight: idx === 0 ? 700 : 400, color: idx === 0 ? "var(--ink)" : "var(--ink-secondary)" }}>{titleOpt}</span>
                          <button
                            type="button"
                            className="quiet-button"
                            onClick={() => copyText(`${candidate.candidate_id}-title-${idx}`, titleOpt)}
                            style={{ fontSize: "11px", padding: "2px 8px" }}
                          >
                            {copiedKey === `${candidate.candidate_id}-title-${idx}` ? "✓ 복사됨" : "복사"}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <p className="candidate-hook">
                  <strong style={{ color: "var(--gold-bright)" }}>🎣 후킹:</strong> {candidate.hook}
                </p>

                <dl className="candidate-meta">
                  <div>
                    <dt>타겟 시청자</dt>
                    <dd style={{ fontFamily: "inherit" }}>{candidate.target_viewer}</dd>
                  </div>
                  <div>
                    <dt>핵심 호기심 질문</dt>
                    <dd style={{ fontFamily: "inherit" }}>{candidate.main_curiosity_question}</dd>
                  </div>
                </dl>

                <div className="candidate-insight-list">
                  <p><strong style={{ color: "var(--ink)" }}>💡 왜 터질 수밖에 없는가:</strong> {candidate.why_it_can_work}</p>
                  <p><strong style={{ color: "var(--ink)" }}>🔄 구성 흐름:</strong> {candidate.structure_summary}</p>
                  <p><strong style={{ color: "var(--ink)" }}>📐 차용한 공식/구조:</strong> {candidate.borrowed_reference_structure}</p>
                </div>

                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px", gap: "8px", flexWrap: "wrap" }}>
                    <p style={{ fontWeight: 700, margin: 0, fontSize: "13px", color: "var(--ink)" }}>📜 대본 초안 (Draft Script)</p>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span className="count-pill" style={{ fontSize: "11px", minHeight: "22px", padding: "2px 8px" }}>
                        📊 {(isEditing ? editingScript : candidate.draft_script).length}자 (약{" "}
                        {Math.round((isEditing ? editingScript : candidate.draft_script).length / 9.5)}초)
                      </span>
                      {!isEditing && (
                        <button
                          type="button"
                          className="quiet-button"
                          disabled={isBusy}
                          onClick={() => startEditing(candidate.candidate_id, candidate.draft_script)}
                          aria-label={`Edit ${candidate.title}`}
                          style={{ fontSize: "11.5px", padding: "3px 9px" }}
                        >
                          ✏️ 대본 초안 수정
                        </button>
                      )}
                    </div>
                  </div>
                  {isEditing ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                      <textarea
                        aria-label={`Edit script for ${candidate.title}`}
                        className="feedback-input"
                        disabled={isBusy}
                        onChange={(event) => setEditingScript(event.target.value)}
                        rows={7}
                        value={editingScript}
                      />
                      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
                        <button
                          type="button"
                          className="primary-button"
                          disabled={isBusy || !editingScript.trim()}
                          onClick={() => void saveEditing(candidate.candidate_id)}
                          style={{ padding: "6px 12px", fontSize: "12px" }}
                        >
                          💾 수정 저장
                        </button>
                        {review?.suggested_script && (
                          <button
                            type="button"
                            className="secondary-button"
                            disabled={isBusy || editingScript === review.suggested_script}
                            onClick={() => setEditingScript(review.suggested_script!)}
                            style={{ padding: "6px 12px", fontSize: "12px" }}
                          >
                            {editingScript === review.suggested_script
                              ? "✓ AI 수정안 적용됨"
                              : "✨ AI 수정안 불러오기"}
                          </button>
                        )}
                        <button
                          type="button"
                          className="quiet-button"
                          disabled={isBusy}
                          onClick={cancelEditing}
                        >
                          취소
                        </button>
                      </div>
                    </div>
                  ) : (
                    <pre className="script-preview">{candidate.draft_script}</pre>
                  )}
                </div>

                {/* 🔍 초안 정보/팩트 검토 결과 */}
                {review && (
                  <div
                    role="status"
                    className={`candidate-review-box ${
                      review.is_accurate && review.issues.length === 0
                        ? "candidate-review-box--ok"
                        : "candidate-review-box--warn"
                    }`}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                      <strong
                        style={{
                          fontSize: "12.5px",
                          color: review.is_accurate && review.issues.length === 0 ? "var(--emerald-bright)" : "var(--gold-bright)"
                        }}
                      >
                        {review.is_accurate && review.issues.length === 0
                          ? "✓ 초안 검토 완료: 잘못된 정보가 발견되지 않았습니다."
                          : "⚠️ 초안 검토 결과: 잘못된 정보 또는 확인이 필요한 내용이 있습니다."}
                      </strong>
                      {(!review.is_accurate || review.issues.length > 0) && !isEditing && (
                        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                          <button
                            type="button"
                            className="secondary-button"
                            disabled={isBusy}
                            onClick={() => startEditing(candidate.candidate_id, candidate.draft_script)}
                            style={{ fontSize: "11.5px", padding: "4px 10px" }}
                          >
                            ✏️ 직접 수정하기
                          </button>
                          {review.suggested_script && (
                            <button
                              type="button"
                              className="primary-button"
                              disabled={isBusy}
                              onClick={() => startEditing(candidate.candidate_id, review.suggested_script!)}
                              style={{ fontSize: "11.5px", padding: "4px 10px" }}
                            >
                              ✨ AI 수정안으로 편집
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                    <p style={{ margin: 0, fontSize: "12.5px", color: "var(--ink-secondary)", lineHeight: 1.5 }}>
                      {review.summary}
                    </p>
                    {review.issues.length > 0 && (
                      <ul style={{ margin: 0, paddingLeft: "18px", display: "flex", flexDirection: "column", gap: "8px" }}>
                        {review.issues.map((issue, idx) => (
                          <li key={idx} style={{ fontSize: "12px", color: "var(--ink)", lineHeight: 1.45 }}>
                            <span
                              style={{
                                display: "inline-block",
                                marginRight: "6px",
                                padding: "1px 6px",
                                borderRadius: "4px",
                                fontSize: "10.5px",
                                fontWeight: 800,
                                background: issue.severity === "error" ? "var(--coral-soft)" : "var(--gold-soft)",
                                color: issue.severity === "error" ? "var(--coral-bright)" : "var(--gold-bright)"
                              }}
                            >
                              {issue.severity === "error" ? "오류" : "확인 필요"}
                            </span>
                            <strong>“{issue.claim}”</strong>
                            <div style={{ color: "var(--muted)", marginTop: "2px" }}>• 사유: {issue.reason}</div>
                            <div style={{ color: "var(--sky)", marginTop: "2px" }}>• 제안: {issue.suggestion}</div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}

                {/* 📝 유튜브 설명란 문구, 해시태그, 키워드 */}
                {(candidate.description || candidate.tags || candidate.keywords) && (
                  <div className="candidate-subbox">
                    {candidate.description && (
                      <div>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                          <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--ink)" }}>📝 설명란 문구</span>
                          <button
                            type="button"
                            className="quiet-button"
                            onClick={() => copyText(`${candidate.candidate_id}-desc`, candidate.description!)}
                            style={{ fontSize: "11px", padding: "2px 8px" }}
                          >
                            {copiedKey === `${candidate.candidate_id}-desc` ? "✓ 복사됨" : "📋 설명란 복사"}
                          </button>
                        </div>
                        <p className="candidate-meta-pre">{candidate.description}</p>
                      </div>
                    )}

                    {candidate.tags && (
                      <div>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                          <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--ink)" }}>🏷️ 해시태그</span>
                          <button
                            type="button"
                            className="quiet-button"
                            onClick={() => copyText(`${candidate.candidate_id}-tags`, candidate.tags!)}
                            style={{ fontSize: "11px", padding: "2px 8px" }}
                          >
                            {copiedKey === `${candidate.candidate_id}-tags` ? "✓ 복사됨" : "📋 태그 복사"}
                          </button>
                        </div>
                        <p className="candidate-meta-pre" style={{ color: "var(--sky)", fontWeight: 600 }}>
                          {candidate.tags}
                        </p>
                      </div>
                    )}

                    {candidate.keywords && (
                      <div>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                          <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--ink)" }}>🔑 키워드</span>
                          <button
                            type="button"
                            className="quiet-button"
                            onClick={() => copyText(`${candidate.candidate_id}-keywords`, candidate.keywords!)}
                            style={{ fontSize: "11px", padding: "2px 8px" }}
                          >
                            {copiedKey === `${candidate.candidate_id}-keywords` ? "✓ 복사됨" : "📋 키워드 복사"}
                          </button>
                        </div>
                        <p className="candidate-meta-pre">{candidate.keywords}</p>
                      </div>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
