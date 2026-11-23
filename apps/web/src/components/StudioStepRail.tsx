import type { ProductionState, Project, ReferenceState, ScriptsState } from "../types";

export type ShortsDepartmentId = "dept1" | "dept2" | "dept3" | "dept4";

export interface ShortsDepartmentMeta {
  readonly id: ShortsDepartmentId;
  readonly shortLabel: string;
  readonly label: string;
  readonly caption: string;
  readonly statusText: string;
  readonly progress: number;
  readonly state: "idle" | "progress" | "done";
  readonly clickable: boolean;
}

export interface ShortsProgressContext {
  readonly project: Project | null;
  readonly referenceState: ReferenceState | null;
  readonly scriptsState: ScriptsState | null;
  readonly productionState: ProductionState | null;
  readonly isReferenceBusy?: boolean;
  readonly isAudioBusy?: boolean;
  readonly isSttBusy?: boolean;
  readonly isAnalysisBusy?: boolean;
  readonly isScriptBusy?: boolean;
  readonly isProductionBusy?: boolean;
}

export function inferDefaultShortsDept(
  project: Project | null,
  productionState?: ProductionState | null
): ShortsDepartmentId {
  if (!project) return "dept1";
  if (productionState?.has_final_video || project.current_step === "Render") {
    return "dept4";
  }
  switch (project.current_step) {
    case "Reference":
    case "STT":
    case "Analysis":
      return "dept1";
    case "Candidates":
    case "Script":
      return "dept2";
    case "Production":
      return "dept3";
    default:
      return "dept1";
  }
}

export function getShortsDepartmentMetaList(ctx: ShortsProgressContext): ShortsDepartmentMeta[] {
  const {
    project,
    referenceState,
    scriptsState,
    productionState,
    isReferenceBusy,
    isAudioBusy,
    isSttBusy,
    isAnalysisBusy,
    isScriptBusy,
    isProductionBusy
  } = ctx;

  const hasProject = Boolean(project);
  const statuses = new Map((project?.step_statuses ?? []).map((s) => [s.name, s]));

  // 1부서: 레퍼런스 검색·오디오 추출·STT·분석 (4단계)
  const hasRef = Boolean(
    project?.selected_reference_path ||
      referenceState?.selected_reference ||
      statuses.get("Reference")?.state === "succeeded"
  );
  const hasRefAudio = Boolean(project?.generated_files?.reference_audio);
  const hasStt = Boolean(
    referenceState?.reference_script || statuses.get("STT")?.state === "succeeded"
  );
  const hasAnalysis = Boolean(
    referenceState?.analysis ||
      referenceState?.analysis_markdown ||
      project?.generated_files?.reference_analysis ||
      statuses.get("Analysis")?.state === "succeeded"
  );

  const d1StepsDone = [hasRef, hasRefAudio, hasStt, hasAnalysis].filter(Boolean).length;
  const d1Pct = Math.round((d1StepsDone / 4) * 100);
  const d1Done = d1StepsDone === 4;
  const d1Running = Boolean(isReferenceBusy || isAudioBusy || isSttBusy || isAnalysisBusy);

  // 2부서: 대본 초안 2종·선택·최종 TTS 대본 확정 (3단계)
  const candidatesCount = scriptsState?.candidates.length ?? 0;
  const hasCandidates = candidatesCount > 0 || statuses.get("Candidates")?.state === "succeeded";
  const hasSelectedCandidate = Boolean(
    scriptsState?.selected_candidate || project?.selected_candidate_id
  );
  const hasFinalScript = Boolean(
    scriptsState?.final_script ||
      project?.generated_files?.final_script ||
      statuses.get("Script")?.state === "succeeded"
  );

  const d2StepsDone = [hasCandidates, hasSelectedCandidate, hasFinalScript].filter(Boolean).length;
  const d2Pct = hasFinalScript ? 100 : Math.round((d2StepsDone / 3) * 100);
  const d2Done = hasFinalScript;

  // 3부서: 1.2x TTS 음성·씬 분할·AI 이미지/비디오 소스 제작
  const hasTtsAudio = Boolean(productionState?.has_audio);
  const videoScenes = productionState?.video_scenes ?? [];
  const totalScenes = videoScenes.length;
  const readyImages = videoScenes.filter((s) => Boolean(s.start_image_url)).length;
  const readyVideos = videoScenes.filter((s) => Boolean(s.generated_video_url)).length;

  let d3Pct = 0;
  if (totalScenes > 0) {
    const audioWeight = hasTtsAudio ? 20 : 0;
    const imgWeight = Math.round((readyImages / totalScenes) * 40);
    const vidWeight = Math.round((readyVideos / totalScenes) * 40);
    d3Pct = Math.min(100, audioWeight + imgWeight + vidWeight);
  } else if (hasTtsAudio) {
    d3Pct = 30;
  }
  const d3Done = hasTtsAudio && totalScenes > 0 && readyVideos === totalScenes;

  // 4부서: 9:16 Remotion 최종 렌더링·주제 적합도 검수·로그/산출물
  const hasFinalVideo = Boolean(
    productionState?.has_final_video || statuses.get("Render")?.state === "succeeded"
  );
  const hasTopicAudit = Boolean(productionState?.topic_audit);
  const d4Pct = hasFinalVideo ? (hasTopicAudit ? 100 : 80) : 0;
  const d4Done = hasFinalVideo;

  return [
    {
      id: "dept1",
      shortLabel: "1부서: 레퍼런스·분석",
      label: "1부서 · 레퍼런스·분석",
      caption: "검색 · 오디오 · STT · 구조 분석",
      statusText: d1Running
        ? "분석 파이프라인 실행 중..."
        : d1Done
        ? "레퍼런스 분석 완료 (4/4)"
        : hasProject
        ? `진행 ${d1StepsDone}/4단계 (${d1Pct}%)`
        : "프로젝트 대기",
      progress: d1Pct,
      state: d1Done ? "done" : d1StepsDone > 0 || d1Running ? "progress" : "idle",
      clickable: hasProject
    },
    {
      id: "dept2",
      shortLabel: "2부서: 기획·대본",
      label: "2부서 · 기획·대본",
      caption: "초안 2선 · 팩트체크 · TTS 대본",
      statusText: isScriptBusy
        ? "AI 대본 집필·검토 중..."
        : d2Done
        ? "최종 TTS 대본 확정 완료"
        : hasCandidates
        ? `초안 ${candidatesCount}종 · ${hasSelectedCandidate ? "확정 대기" : "선택 대기"}`
        : "초안 생성 대기",
      progress: d2Pct,
      state: d2Done ? "done" : hasCandidates || isScriptBusy ? "progress" : "idle",
      clickable: hasProject
    },
    {
      id: "dept3",
      shortLabel: "3부서: 음성·비주얼",
      label: "3부서 · 음성·비주얼",
      caption: "1.2x TTS · 씬 이미지 · AI 비디오",
      statusText: isProductionBusy
        ? "음성/비주얼 생성 실행 중..."
        : d3Done
        ? `씬 ${totalScenes}개 영상 완료 (100%)`
        : totalScenes > 0
        ? `이미지 ${readyImages}/${totalScenes} · 영상 ${readyVideos}/${totalScenes}`
        : hasTtsAudio
        ? "TTS 완료 · 씬 구성 대기"
        : "TTS & 비주얼 대기",
      progress: d3Pct,
      state: d3Done ? "done" : d3Pct > 0 || isProductionBusy ? "progress" : "idle",
      clickable: hasProject
    },
    {
      id: "dept4",
      shortLabel: "4부서: 렌더·검수",
      label: "4부서 · 렌더·검수",
      caption: "9:16 MP4 · 주제 검수 · 산출물",
      statusText: hasFinalVideo
        ? hasTopicAudit
          ? `렌더 & 검수 완료 (${productionState?.topic_audit?.fit_score ?? 0}점)`
          : "final.mp4 렌더링 완료"
        : d3Done
        ? "최종 렌더링 준비 완료"
        : "렌더·검수 콘솔",
      progress: d4Pct,
      state: d4Done ? "done" : d3Done ? "progress" : "idle",
      clickable: hasProject
    }
  ];
}

export function ShortsDepartmentIcon({
  id,
  size = 16
}: {
  readonly id: ShortsDepartmentId;
  readonly size?: number;
}) {
  switch (id) {
    case "dept1":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
          <path d="M11 8v6" />
          <path d="M8 11h6" />
        </svg>
      );
    case "dept2":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.12 2.12 0 1 1 3 3L7 19l-4 1 1-4Z" />
        </svg>
      );
    case "dept3":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="2" y="4" width="20" height="16" rx="3" />
          <path d="m10 9 5 3-5 3Z" />
        </svg>
      );
    case "dept4":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09Z" />
          <path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2Z" />
          <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" />
          <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />
        </svg>
      );
  }
}

export interface StudioStepRailProps {
  readonly departments: readonly ShortsDepartmentMeta[];
  readonly activeDept: ShortsDepartmentId;
  readonly isAllMode: boolean;
  readonly onSelectDept: (dept: ShortsDepartmentId) => void;
}

export function StudioStepRail({
  departments,
  activeDept,
  isAllMode,
  onSelectDept
}: StudioStepRailProps) {
  return (
    <nav className="step-rail" aria-label="4개 부서 제작 파이프라인">
      {departments.map((dept, index) => {
        const isActive = !isAllMode && dept.id === activeDept;
        const isComplete = dept.state === "done";

        return (
          <div key={dept.id} className="step-rail-node">
            <button
              type="button"
              className={`step-item ${isActive ? "is-active" : ""} ${isComplete ? "is-complete" : ""}`}
              disabled={!dept.clickable}
              onClick={() => dept.clickable && onSelectDept(dept.id)}
              title={`${dept.shortLabel} 이동`}
            >
              <span className="step-index" aria-hidden="true">
                {isComplete && !isActive ? "✓" : index + 1}
              </span>
              <span>{dept.shortLabel}</span>
            </button>
            {index < departments.length - 1 && (
              <span className="step-arrow" aria-hidden="true">
                →
              </span>
            )}
          </div>
        );
      })}
    </nav>
  );
}
