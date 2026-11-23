import type { StepName, StepStatus } from "../types";

const WORKFLOW_STEPS: readonly StepName[] = [
  "Reference",
  "STT",
  "Analysis",
  "Candidates",
  "Script",
  "Production",
  "Render"
];

interface ProjectWorkflowProps {
  readonly currentStep: StepName;
  readonly stepStatuses: readonly StepStatus[];
  readonly hasAudio?: boolean;
  readonly isAudioBusy?: boolean;
  readonly isSttBusy?: boolean;
  readonly isAnalysisBusy?: boolean;
  readonly hasAnalysis?: boolean;
  readonly hasSelectedReference?: boolean;
}

interface WorkflowItem {
  id: string;
  name: string;
  state: "waiting" | "running" | "succeeded" | "failed";
  message: string;
  isActive: boolean;
}

function stateLabel(state: string): string {
  return state.charAt(0).toUpperCase() + state.slice(1);
}

const DEFAULT_STEP_DESCRIPTIONS: Record<string, string> = {
  Reference: "레퍼런스 영상을 검색해 선택하세요.",
  "Extract Audio": "선택한 레퍼런스 영상에서 오디오를 추출합니다.",
  STT: "추출한 오디오를 텍스트 대본으로 변환합니다.",
  Analysis: "레퍼런스 대본의 후킹과 구조를 분석합니다.",
  Candidates: "대본 초안 2개를 생성하고 검토·선택합니다.",
  Script: "선택한 초안을 바탕으로 최종 TTS 대본을 확정합니다.",
  Production: "TTS 음성, 이미지 및 영상 소스를 준비합니다.",
  Render: "최종 쇼츠 영상을 렌더링합니다."
};

const MESSAGE_TRANSLATIONS: Record<string, string> = {
  "Reference selected.": "레퍼런스 영상이 선택되었습니다.",
  "Select a reference.": "레퍼런스 영상을 검색해 선택하세요.",
  "Reference selected. Ready for audio and STT.": "레퍼런스 선택 완료 — 오디오 추출 및 STT 준비됨",
  "Extracting reference audio...": "레퍼런스 오디오를 추출하는 중입니다...",
  "Reference audio extracted.": "레퍼런스 오디오 추출이 완료되었습니다.",
  "Ready to extract audio.": "오디오 추출 준비가 완료되었습니다.",
  "Waiting for reference selection.": "레퍼런스 선택을 기다리는 중입니다.",
  "Reference audio is ready for STT.": "오디오 추출 완료 — STT 변환 준비됨",
  "Running OpenAI STT...": "OpenAI STT 음성 인식을 실행 중입니다...",
  "Running OpenAI STT.": "OpenAI STT 음성 인식을 실행 중입니다...",
  "Reference STT complete.": "음성 인식(STT)이 완료되었습니다.",
  "Ready for STT.": "음성 인식(STT) 실행 준비가 완료되었습니다.",
  "Waiting for audio extraction.": "오디오 추출을 기다리는 중입니다.",
  "Analyzing reference script...": "레퍼런스 대본을 분석하는 중입니다...",
  "Reference analysis complete.": "레퍼런스 분석이 완료되었습니다.",
  "Reference script is ready for analysis.": "레퍼런스 분석 준비가 완료되었습니다.",
  "Ready to generate candidates.": "대본 초안 생성 준비가 완료되었습니다.",
  "Candidate drafts generated. Select a candidate to finalize.": "대본 초안이 생성되었습니다. 초안을 검토 후 선택하세요.",
  "Script candidate selected.": "대본 초안이 선택되었습니다.",
  "Ready to finalize TTS script.": "최종 TTS 대본 생성 준비가 완료되었습니다.",
  "Final TTS-ready script complete.": "최종 TTS 대본 생성이 완료되었습니다.",
  "Script and scene prompts ready. Ready for TTS voice and visual production.": "최종 대본 및 장면 프롬프트 준비 완료 — 제작 단계로 이동하세요.",
  "TTS and scene alignment complete.": "TTS 음성 및 장면 싱크 작업이 완료되었습니다.",
  "Ready for visual concept & Remotion rendering.": "비주얼 콘셉트 및 Remotion 렌더링 준비가 완료되었습니다."
};

function formatWorkflowMessage(stepName: string, rawMessage?: string): string {
  const trimmed = rawMessage?.trim() ?? "";
  if (!trimmed) {
    return DEFAULT_STEP_DESCRIPTIONS[stepName] ?? "";
  }
  if (MESSAGE_TRANSLATIONS[trimmed]) {
    return MESSAGE_TRANSLATIONS[trimmed];
  }
  const candidateMatch = /^(\d+)\s+candidate drafts are ready for selection\.$/i.exec(trimmed);
  if (candidateMatch) {
    return `대본 초안 ${candidateMatch[1]}개가 생성되었습니다. 초안을 선택하세요.`;
  }
  return trimmed;
}

export function ProjectWorkflow({
  currentStep,
  stepStatuses,
  hasAudio = false,
  isAudioBusy = false,
  isSttBusy = false,
  isAnalysisBusy = false,
  hasAnalysis = false,
  hasSelectedReference = false
}: ProjectWorkflowProps) {
  const statusesByName = new Map(stepStatuses.map((status) => [status.name, status]));

  const referenceStatus = statusesByName.get("Reference");
  const sttStatus = statusesByName.get("STT");
  const analysisStatus = statusesByName.get("Analysis");

  // Determine current effective active step
  let effectiveStepName = currentStep as string;
  if (currentStep === "STT") {
    if (!hasAudio) {
      effectiveStepName = "Extract Audio";
    }
  }

  // Build the pipeline items
  const items: WorkflowItem[] = [
    {
      id: "reference",
      name: "Reference",
      state: referenceStatus?.state ?? "waiting",
      message: referenceStatus?.message || (referenceStatus?.state === "succeeded" ? "Reference selected." : "Select a reference."),
      isActive: currentStep === "Reference"
    },
    {
      id: "extract-audio",
      name: "Extract Audio",
      state: isAudioBusy
        ? "running"
        : hasAudio
        ? "succeeded"
        : hasSelectedReference
        ? "waiting"
        : "waiting",
      message: isAudioBusy
        ? "Extracting reference audio..."
        : hasAudio
        ? "Reference audio extracted."
        : hasSelectedReference
        ? "Ready to extract audio."
        : "Waiting for reference selection.",
      isActive: effectiveStepName === "Extract Audio"
    },
    {
      id: "stt",
      name: "STT",
      state: isSttBusy || sttStatus?.state === "running"
        ? "running"
        : sttStatus?.state === "succeeded"
        ? "succeeded"
        : "waiting",
      message: isSttBusy
        ? "Running OpenAI STT..."
        : sttStatus?.message || (
          sttStatus?.state === "succeeded"
            ? "Reference STT complete."
            : hasAudio
            ? "Ready for STT."
            : "Waiting for audio extraction."
        ),
      isActive: effectiveStepName === "STT"
    },
    {
      id: "analysis",
      name: "Analysis",
      state: isAnalysisBusy
        ? "running"
        : hasAnalysis || analysisStatus?.state === "succeeded"
        ? "succeeded"
        : analysisStatus?.state === "running" && analysisStatus?.message !== "Reference script is ready for analysis."
        ? "running"
        : "waiting",
      message: isAnalysisBusy
        ? "Analyzing reference script..."
        : hasAnalysis || analysisStatus?.state === "succeeded"
        ? (analysisStatus?.message || "Reference analysis complete.")
        : (analysisStatus?.message || "Reference script is ready for analysis."),
      isActive: effectiveStepName === "Analysis"
    },
    ...(["Candidates", "Script", "Production", "Render"] as const).map((step) => {
      const status = statusesByName.get(step);
      let effectiveState = (status?.state ?? "waiting") as WorkflowItem["state"];
      if (step === "Candidates" && status?.message?.startsWith("Ready to generate")) {
        effectiveState = "waiting";
      }
      return {
        id: step.toLowerCase(),
        name: step,
        state: effectiveState,
        message: status?.message || "",
        isActive: currentStep === step
      };
    })
  ];

  return (
    <section className="panel workflow-panel" aria-labelledby="workflow-title">
      <div className="section-header">
        <div>
          <p className="eyebrow">Workflow</p>
          <h2 id="workflow-title">Production pipeline</h2>
        </div>
        <span className="current-step">현재 단계: {effectiveStepName}</span>
      </div>

      <ol className="workflow-list">
        {items.map((item, index) => {
          const label = stateLabel(item.state);
          const description = formatWorkflowMessage(item.name, item.message) || label;
          return (
            <li
              className={[
                "workflow-step",
                item.isActive ? "active" : "",
                `workflow-step--${item.state}`
              ]
                .filter(Boolean)
                .join(" ")}
              key={item.id}
            >
              <span className="step-index">{index + 1}</span>
              <span className={item.isActive ? "step-main active" : "step-main"}>
                <strong aria-current={item.isActive ? "step" : undefined} className={item.isActive ? "active" : undefined}>
                  {item.name}
                </strong>
                <span title={description}>{description}</span>
              </span>
              <span className={`state-pill state-pill--${item.state}`}>{label}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
