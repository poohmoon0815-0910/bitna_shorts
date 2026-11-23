import { useEffect, useMemo, useState } from "react";

import {
  addDirectReference,
  alignSubtitlesAndScenes,
  createProject,
  deleteProject,
  extractReferenceAudio,
  fetchProductionState,
  fetchScriptsState,
  fetchProjects,
  fetchReferenceState,
  fetchSettingsStatus,
  finalizeScript,
  generateAllSceneImages,
  generateConcepts,
  generateSceneImage,
  generateSceneVideo,
  passContinuityToNext,
  renderShorts,
  auditProducedVideoTopic,
  generateScriptCandidates,
  generateTtsAudio,
  getProject,
  regenerateSceneWithFeedback,
  reviewScriptCandidate,
  runReferenceAnalysis,
  runReferenceStt,
  searchReferences,
  selectScriptCandidate,
  selectReference,
  updateProject,
  updateScenePrompts,
  updateScriptCandidate
} from "./api";
import { CandidateDraftsPanel } from "./components/CandidateDraftsPanel";
import { FinalScriptPanel } from "./components/FinalScriptPanel";
import { LiveStatusConsole, type LiveLogEntry } from "./components/LiveStatusConsole";
import { ProductionPanel } from "./components/ProductionPanel";
import { ProjectDashboard } from "./components/ProjectDashboard";
import { ProjectWorkflow } from "./components/ProjectWorkflow";
import { ReferenceAnalysisPanel } from "./components/ReferenceAnalysisPanel";
import { ReferenceSearchPanel } from "./components/ReferenceSearchPanel";
import { ReferenceTranscriptPanel } from "./components/ReferenceTranscriptPanel";
import { SettingsPanel } from "./components/SettingsPanel";
import {
  ShortsDepartmentIcon,
  StudioStepRail,
  getShortsDepartmentMetaList,
  inferDefaultShortsDept,
  type ShortsDepartmentId
} from "./components/StudioStepRail";
import type {
  ProductionState,
  Project,
  ReferenceSearchPayload,
  ReferenceState,
  ScriptsState,
  SettingsStatus,
  VideoSceneItem
} from "./types";

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

function nowTimeStamp(): string {
  return new Date().toLocaleTimeString("ko-KR", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}

// Keep unused import referenced only if needed by existing build
void alignSubtitlesAndScenes;

export default function App() {
  const [projects, setProjects] = useState<readonly Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [referenceState, setReferenceState] = useState<ReferenceState | null>(null);
  const [scriptsState, setScriptsState] = useState<ScriptsState | null>(null);
  const [productionState, setProductionState] = useState<ProductionState | null>(null);
  const [settings, setSettings] = useState<SettingsStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isReferenceBusy, setIsReferenceBusy] = useState(false);
  const [isAudioBusy, setIsAudioBusy] = useState(false);
  const [isSttBusy, setIsSttBusy] = useState(false);
  const [isAnalysisBusy, setIsAnalysisBusy] = useState(false);
  const [isScriptBusy, setIsScriptBusy] = useState(false);
  const [reviewingCandidateId, setReviewingCandidateId] = useState<string | null>(null);
  const [isProductionBusy, setIsProductionBusy] = useState(false);
  const [videoTitle, setVideoTitle] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  // 다크 워크스테이션 UI 상태 (1~4부서 집중 탭 + 전체 보기 토글 + 실시간 상태 로그)
  const [activeDept, setActiveDept] = useState<ShortsDepartmentId>("dept1");
  const [viewMode, setViewMode] = useState<"dept" | "all">("dept");
  const [showProjectDrawer, setShowProjectDrawer] = useState<boolean>(true);
  const [liveLogs, setLiveLogs] = useState<LiveLogEntry[]>([]);

  function pushLog(level: LiveLogEntry["level"], message: string) {
    setLiveLogs((prev) => [
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        time: nowTimeStamp(),
        level,
        message
      },
      ...prev.slice(0, 49)
    ]);
  }

  useEffect(() => {
    if (selectedProject?.project_title) {
      setVideoTitle(selectedProject.project_title);
    } else {
      setVideoTitle("");
    }
  }, [selectedProject?.project_id, selectedProject?.project_title]);

  useEffect(() => {
    let isActive = true;

    Promise.all([fetchProjects(), fetchSettingsStatus()])
      .then(([loadedProjects, loadedSettings]) => {
        if (!isActive) {
          return;
        }
        setProjects(loadedProjects);
        setSettings(loadedSettings);
        const firstProject = loadedProjects[0] ?? null;
        setSelectedProject((current) => current ?? firstProject);
        if (firstProject) {
          setActiveDept(inferDefaultShortsDept(firstProject));
        }
        setError(null);
      })
      .catch((reason: unknown) => {
        if (isActive) {
          const msg = reason instanceof Error ? reason.message : "데이터를 불러오지 못했습니다.";
          setError(msg);
          pushLog("error", `초기 로드 실패: ${msg}`);
        }
      })
      .finally(() => {
        if (isActive) {
          setIsLoading(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedProject) {
      setReferenceState(null);
      setScriptsState(null);
      setProductionState(null);
      return;
    }

    let isActive = true;
    Promise.all([
      fetchReferenceState(selectedProject.project_id),
      fetchScriptsState(selectedProject.project_id),
      fetchProductionState(selectedProject.project_id)
    ])
      .then(([reference, scripts, production]) => {
        if (isActive) {
          setReferenceState(reference);
          setScriptsState(scripts);
          setProductionState(production);
          setError(null);
        }
      })
      .catch((reason: unknown) => {
        if (isActive) {
          setReferenceState(null);
          setScriptsState(null);
          setProductionState(null);
          const msg = reason instanceof Error ? reason.message : "프로젝트 상태를 불러오지 못했습니다.";
          setError(msg);
          pushLog("error", `프로젝트 상태 로드 실패: ${msg}`);
        }
      });

    return () => {
      isActive = false;
    };
  }, [selectedProject?.project_id]);

  const generatedFiles = useMemo(() => {
    return selectedProject ? Object.entries(selectedProject.generated_files) : [];
  }, [selectedProject]);

  function handleSelectProject(project: Project) {
    setSelectedProject(project);
    setActiveDept(inferDefaultShortsDept(project));
    pushLog("info", `프로젝트 전환: ${project.display_name}`);
  }

  function handleSelectDept(dept: ShortsDepartmentId) {
    setActiveDept(dept);
    setViewMode("dept");
    if (typeof window !== "undefined" && typeof window.scrollTo === "function") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  async function handleCreateProject() {
    const titleInput = window.prompt("Project title", "untitled");
    if (titleInput === null) {
      return;
    }
    const title = titleInput.trim() || "untitled";

    try {
      pushLog("info", `새 쇼츠 프로젝트 생성 중: "${title}"`);
      const project = await createProject(title);
      setProjects((current) => [project, ...current]);
      setSelectedProject(project);
      setActiveDept("dept1");
      setViewMode("dept");
      setError(null);
      pushLog("success", `새 프로젝트 생성 완료: ${project.display_name}`);
    } catch (reason) {
      const msg = reason instanceof Error ? reason.message : "프로젝트를 만들지 못했습니다.";
      setError(msg);
      pushLog("error", msg);
    }
  }

  async function handleDeleteProject(projectToDelete: Project) {
    const confirmed = window.confirm(
      `"${projectToDelete.display_name}" 프로젝트를 정말 삭제하시겠습니까?\n폴더 안의 모든 생성 파일도 함께 삭제됩니다.`
    );
    if (!confirmed) {
      return;
    }

    try {
      await deleteProject(projectToDelete.project_id);
      const remaining = projects.filter((item) => item.project_id !== projectToDelete.project_id);
      setProjects(remaining);
      if (selectedProject?.project_id === projectToDelete.project_id) {
        setSelectedProject(remaining[0] ?? null);
      }
      setError(null);
      pushLog("warn", `프로젝트 삭제됨: ${projectToDelete.display_name}`);
    } catch (reason) {
      const msg = reason instanceof Error ? reason.message : "프로젝트를 삭제하지 못했습니다.";
      setError(msg);
      pushLog("error", msg);
    }
  }

  async function handleEditTitle() {
    if (!selectedProject) {
      return;
    }
    const titleInput = window.prompt("Project title", selectedProject.project_title);
    if (titleInput === null) {
      return;
    }
    const title = titleInput.trim() || "untitled";

    try {
      const project = await updateProject(selectedProject.project_id, { project_title: title });
      setProjects((current) =>
        current.map((item) => (item.project_id === project.project_id ? project : item))
      );
      setSelectedProject(project);
      setError(null);
      pushLog("success", `프로젝트 제목 변경 완료: ${project.display_name}`);
    } catch (reason) {
      const msg = reason instanceof Error ? reason.message : "프로젝트 제목을 바꾸지 못했습니다.";
      setError(msg);
      pushLog("error", msg);
    }
  }

  async function runReferenceAction(label: string, action: () => Promise<unknown>) {
    if (!selectedProject) {
      return;
    }
    setIsReferenceBusy(true);
    pushLog("info", `[1부서] ${label} 시작...`);
    try {
      await action();
      const [project, state] = await Promise.all([
        getProject(selectedProject.project_id),
        fetchReferenceState(selectedProject.project_id)
      ]);
      setSelectedProject(project);
      setProjects((current) =>
        current.map((item) => (item.project_id === project.project_id ? project : item))
      );
      setReferenceState(state);
      setError(null);
      pushLog("success", `[1부서] ${label} 완료`);
    } catch (reason) {
      const msg = reason instanceof Error ? reason.message : "레퍼런스 작업에 실패했습니다.";
      setError(msg);
      pushLog("error", `[1부서] ${label} 실패: ${msg}`);
    } finally {
      setIsReferenceBusy(false);
    }
  }

  async function runScriptAction(label: string, action: () => Promise<unknown>) {
    if (!selectedProject) {
      return;
    }
    setIsScriptBusy(true);
    pushLog("info", `[2부서] ${label} 시작...`);
    try {
      await action();
      const [project, state] = await Promise.all([
        getProject(selectedProject.project_id),
        fetchScriptsState(selectedProject.project_id)
      ]);
      setSelectedProject(project);
      setProjects((current) =>
        current.map((item) => (item.project_id === project.project_id ? project : item))
      );
      setScriptsState(state);
      setError(null);
      pushLog("success", `[2부서] ${label} 완료`);
    } catch (reason) {
      const msg = reason instanceof Error ? reason.message : "대본 작업에 실패했습니다.";
      setError(msg);
      pushLog("error", `[2부서] ${label} 실패: ${msg}`);
    } finally {
      setIsScriptBusy(false);
    }
  }

  function handleReferenceSearch(payload: ReferenceSearchPayload) {
    if (!selectedProject) {
      return;
    }
    void runReferenceAction("레퍼런스 영상 검색", () => searchReferences(selectedProject.project_id, payload));
  }

  function handleAddDirectReference(url: string) {
    if (!selectedProject) {
      return;
    }
    // Direct URL 추가 후 자동으로 해당 영상을 Selected Reference로 선택
    void runReferenceAction("Direct URL 연결 및 선택", async () => {
      const result = await addDirectReference(selectedProject.project_id, url);
      if (result.candidate?.video_id) {
        await selectReference(selectedProject.project_id, result.candidate.video_id);
      }
    });
  }

  function handleSelectReference(videoId: string) {
    if (!selectedProject) {
      return;
    }
    void runReferenceAction("레퍼런스 선택", () => selectReference(selectedProject.project_id, videoId));
  }

  const hasAudio = Boolean(selectedProject?.generated_files?.reference_audio);
  const hasSelectedReference = Boolean(selectedProject?.selected_reference_path || referenceState?.selected_reference);

  async function handleExtractAudio() {
    if (!selectedProject) {
      return;
    }
    setIsAudioBusy(true);
    pushLog("info", "[1부서] 레퍼런스 오디오 추출 시작...");
    try {
      await extractReferenceAudio(selectedProject.project_id);
      const [project, state] = await Promise.all([
        getProject(selectedProject.project_id),
        fetchReferenceState(selectedProject.project_id)
      ]);
      setSelectedProject(project);
      setProjects((current) =>
        current.map((item) => (item.project_id === project.project_id ? project : item))
      );
      setReferenceState(state);
      setError(null);
      pushLog("success", "[1부서] 레퍼런스 오디오 추출 완료");
    } catch (reason) {
      const msg = reason instanceof Error ? reason.message : "오디오 추출에 실패했습니다.";
      setError(msg);
      pushLog("error", `[1부서] 오디오 추출 실패: ${msg}`);
    } finally {
      setIsAudioBusy(false);
    }
  }

  async function handleRunStt() {
    if (!selectedProject) {
      return;
    }
    setIsSttBusy(true);
    pushLog("info", "[1부서] OpenAI STT 대본 변환 시작...");
    try {
      await runReferenceStt(selectedProject.project_id);
      const [project, state] = await Promise.all([
        getProject(selectedProject.project_id),
        fetchReferenceState(selectedProject.project_id)
      ]);
      setSelectedProject(project);
      setProjects((current) =>
        current.map((item) => (item.project_id === project.project_id ? project : item))
      );
      setReferenceState(state);
      setError(null);
      pushLog("success", "[1부서] STT 대본 변환 완료");
    } catch (reason) {
      const msg = reason instanceof Error ? reason.message : "STT 변환에 실패했습니다.";
      setError(msg);
      pushLog("error", `[1부서] STT 변환 실패: ${msg}`);
    } finally {
      setIsSttBusy(false);
    }
  }

  async function handleAnalyzeReference() {
    if (!selectedProject) {
      return;
    }
    setIsAnalysisBusy(true);
    pushLog("info", "[1부서] 레퍼런스 후킹·구조 분석 시작...");
    try {
      await runReferenceAnalysis(selectedProject.project_id);
      const [project, state] = await Promise.all([
        getProject(selectedProject.project_id),
        fetchReferenceState(selectedProject.project_id)
      ]);
      setSelectedProject(project);
      setProjects((current) =>
        current.map((item) => (item.project_id === project.project_id ? project : item))
      );
      setReferenceState(state);
      setError(null);
      pushLog("success", "[1부서] 레퍼런스 분석 리포트 완료");
    } catch (reason) {
      const msg = reason instanceof Error ? reason.message : "레퍼런스 분석에 실패했습니다.";
      setError(msg);
      pushLog("error", `[1부서] 레퍼런스 분석 실패: ${msg}`);
    } finally {
      setIsAnalysisBusy(false);
    }
  }

  function handleGenerateCandidates(feedback?: string) {
    if (!selectedProject) {
      return;
    }
    const trimmed = feedback?.trim();
    void runScriptAction("대본 초안 2종 생성", () =>
      trimmed
        ? generateScriptCandidates(selectedProject.project_id, trimmed)
        : generateScriptCandidates(selectedProject.project_id)
    );
  }

  function handleSelectScriptCandidate(candidateId: string) {
    if (!selectedProject) {
      return;
    }
    void runScriptAction(`대본 초안 선택 (${candidateId})`, () =>
      selectScriptCandidate(selectedProject.project_id, candidateId)
    );
  }

  async function handleReviewScriptCandidate(candidateId: string) {
    if (!selectedProject) {
      return;
    }
    setReviewingCandidateId(candidateId);
    try {
      await runScriptAction(`대본 초안 팩트 검토 (${candidateId})`, () =>
        reviewScriptCandidate(selectedProject.project_id, candidateId)
      );
    } finally {
      setReviewingCandidateId(null);
    }
  }

  async function handleUpdateScriptCandidate(candidateId: string, draftScript: string) {
    if (!selectedProject) {
      return;
    }
    await runScriptAction(`대본 초안 수동 편집 저장 (${candidateId})`, () =>
      updateScriptCandidate(selectedProject.project_id, candidateId, { draft_script: draftScript })
    );
  }

  function handleFinalizeScript(feedback: string) {
    if (!selectedProject) {
      return;
    }
    void runScriptAction("최종 TTS 대본 확정", async () => {
      const result = await finalizeScript(selectedProject.project_id, feedback);
      const prod = await fetchProductionState(selectedProject.project_id);
      setProductionState(prod);
      return result;
    });
  }

  async function handleGenerateProduction(speedRate?: number) {
    if (!selectedProject) {
      return;
    }
    setIsProductionBusy(true);
    pushLog("info", `[3부서] ${speedRate ?? 1.2}x TTS 음성 생성 및 씬 분할 시작...`);
    try {
      const updated = await generateTtsAudio(selectedProject.project_id, speedRate);
      setProductionState(updated);
      const project = await getProject(selectedProject.project_id);
      setSelectedProject(project);
      setProjects((current) =>
        current.map((item) => (item.project_id === project.project_id ? project : item))
      );
      setError(null);
      pushLog("success", `[3부서] TTS 생성 및 씬 분할 완료 (${updated.video_scenes?.length ?? 0}개 씬)`);
    } catch (reason) {
      const msg = reason instanceof Error ? reason.message : "음성 생성 및 씬 분할에 실패했습니다.";
      setError(msg);
      pushLog("error", `[3부서] TTS 생성 실패: ${msg}`);
      throw reason;
    } finally {
      setIsProductionBusy(false);
    }
  }

  async function handleGenerateConcepts(
    stylePreset?: string,
    customStylePrompt?: string,
    targetSceneCount?: number | null
  ) {
    if (!selectedProject) {
      return;
    }
    setIsProductionBusy(true);
    pushLog("info", `[3부서] 비주얼 콘셉트(${stylePreset ?? "claymation"}) 설계 시작...`);
    try {
      const updated = await generateConcepts(
        selectedProject.project_id,
        stylePreset,
        customStylePrompt,
        targetSceneCount
      );
      setProductionState(updated);
      const project = await getProject(selectedProject.project_id);
      setSelectedProject(project);
      setProjects((current) =>
        current.map((item) => (item.project_id === project.project_id ? project : item))
      );
      setError(null);
      pushLog("success", "[3부서] 비주얼 콘셉트 및 씬 프롬프트 적용 완료");
    } catch (reason) {
      const msg = reason instanceof Error ? reason.message : "비디오 씬 및 연속성 설계에 실패했습니다.";
      setError(msg);
      pushLog("error", `[3부서] 콘셉트 설계 실패: ${msg}`);
    } finally {
      setIsProductionBusy(false);
    }
  }

  async function handleGenerateSceneImage(sceneId: number, model?: string) {
    if (!selectedProject) {
      return;
    }
    pushLog("info", `[3부서] Scene ${sceneId} AI 이미지 생성 요청 (${model ?? "default"})`);
    try {
      const updated = await generateSceneImage(selectedProject.project_id, sceneId, model);
      setProductionState((prev) => {
        if (!prev || !prev.video_scenes || !updated.video_scenes) return updated;
        const prevScenes = prev.video_scenes;
        const mergedScenes: readonly VideoSceneItem[] = updated.video_scenes.map((uScene) => {
          const pScene = prevScenes.find((p) => p.scene_id === uScene.scene_id);
          return {
            ...uScene,
            start_image_url: uScene.start_image_url ?? pScene?.start_image_url ?? null,
            generated_video_url: uScene.generated_video_url ?? pScene?.generated_video_url ?? null,
            final_frame_url: uScene.final_frame_url ?? pScene?.final_frame_url ?? null
          };
        });
        return {
          ...updated,
          video_scenes: mergedScenes
        };
      });
      setError(null);
      pushLog("success", `[3부서] Scene ${sceneId} 이미지 생성 완료`);
    } catch (reason) {
      const msg = reason instanceof Error ? reason.message : `Scene ${sceneId} 이미지 생성 실패`;
      setError(msg);
      pushLog("error", `[3부서] ${msg}`);
    }
  }

  async function handleGenerateAllSceneImages(model: string = "nano_banana_pro") {
    if (!selectedProject) {
      return;
    }
    setIsProductionBusy(true);
    pushLog("info", `[3부서] 전체 씬 AI 이미지 일괄 생성 시작 (${model})...`);
    try {
      const updated = await generateAllSceneImages(selectedProject.project_id, model);
      setProductionState(updated);
      setError(null);
      pushLog("success", "[3부서] 전체 씬 이미지 일괄 생성 완료");
    } catch (reason) {
      const msg = reason instanceof Error ? reason.message : "전체 씬 이미지 생성 실패";
      setError(msg);
      pushLog("error", `[3부서] ${msg}`);
    } finally {
      setIsProductionBusy(false);
    }
  }

  async function handleGenerateSceneVideo(
    sceneId: number,
    model: string = "kling_o3_flf",
    duration: number = 5,
    multiShots: boolean = false,
    matchPrevFrame: boolean = true
  ) {
    if (!selectedProject) {
      return;
    }
    pushLog("info", `[3부서] Scene ${sceneId} AI 비디오 생성 요청 (${model}, ${duration}s)`);
    try {
      const updated = await generateSceneVideo(
        selectedProject.project_id,
        sceneId,
        model,
        duration,
        multiShots,
        matchPrevFrame
      );
      setProductionState((prev) => {
        if (!prev || !prev.video_scenes || !updated.video_scenes) return updated;
        const prevScenes = prev.video_scenes;
        const mergedScenes: readonly VideoSceneItem[] = updated.video_scenes.map((uScene) => {
          const pScene = prevScenes.find((p) => p.scene_id === uScene.scene_id);
          return {
            ...uScene,
            start_image_url: uScene.start_image_url ?? pScene?.start_image_url ?? null,
            generated_video_url: uScene.generated_video_url ?? pScene?.generated_video_url ?? null,
            final_frame_url: uScene.final_frame_url ?? pScene?.final_frame_url ?? null
          };
        });
        return {
          ...updated,
          video_scenes: mergedScenes
        };
      });
      setError(null);
      pushLog("success", `[3부서] Scene ${sceneId} 비디오 생성 완료`);
    } catch (reason) {
      const msg = reason instanceof Error ? reason.message : `Scene ${sceneId} 비디오 생성 실패`;
      setError(msg);
      pushLog("error", `[3부서] ${msg}`);
    }
  }

  async function handlePassContinuity(sceneId: number) {
    if (!selectedProject) {
      return;
    }
    setIsProductionBusy(true);
    pushLog("info", `[3부서] Scene ${sceneId} 마지막 프레임 연속성 인계...`);
    try {
      const updated = await passContinuityToNext(selectedProject.project_id, sceneId);
      setProductionState(updated);
      setError(null);
      pushLog("success", `[3부서] Scene ${sceneId} 연속성 인계 완료`);
    } catch (reason) {
      const msg = reason instanceof Error ? reason.message : `Scene ${sceneId} 연속성 인계 실패`;
      setError(msg);
      pushLog("error", `[3부서] ${msg}`);
    } finally {
      setIsProductionBusy(false);
    }
  }

  async function handleRegenerateSceneWithFeedback(
    sceneId: number,
    feedback: string,
    target: "image" | "video" | "both" | "prompt_only",
    model?: string,
    duration: number = 5,
    multiShots: boolean = false,
    matchPrevFrame: boolean = true
  ) {
    if (!selectedProject) {
      return;
    }
    setIsProductionBusy(true);
    pushLog("info", `[3부서] Scene ${sceneId} 피드백 재생성 (${target}) 시작...`);
    try {
      const updated = await regenerateSceneWithFeedback(
        selectedProject.project_id,
        sceneId,
        feedback,
        target,
        model,
        duration,
        multiShots,
        matchPrevFrame
      );
      setProductionState(updated);
      setError(null);
      pushLog("success", `[3부서] Scene ${sceneId} 피드백 재생성 완료`);
    } catch (reason) {
      const msg = reason instanceof Error ? reason.message : `Scene ${sceneId} 피드백 재생성 실패`;
      setError(msg);
      pushLog("error", `[3부서] ${msg}`);
    } finally {
      setIsProductionBusy(false);
    }
  }

  async function handleUpdateScenePrompts(
    sceneId: number,
    startImagePrompt?: string,
    videoPrompt?: string
  ) {
    if (!selectedProject) {
      return;
    }
    try {
      const updated = await updateScenePrompts(
        selectedProject.project_id,
        sceneId,
        startImagePrompt,
        videoPrompt
      );
      setProductionState(updated);
      setError(null);
      pushLog("success", `[3부서] Scene ${sceneId} 프롬프트 수동 수정 저장 완료`);
    } catch (reason) {
      const msg = reason instanceof Error ? reason.message : `Scene ${sceneId} 프롬프트 수정 실패`;
      setError(msg);
      pushLog("error", `[3부서] ${msg}`);
    }
  }

  async function handleRenderShorts(title?: string) {
    if (!selectedProject) {
      return;
    }
    setIsProductionBusy(true);
    pushLog("info", "[4부서] Remotion 9:16 최종 쇼츠 MP4 렌더링 시작...");
    try {
      const updated = await renderShorts(selectedProject.project_id, title);
      setProductionState(updated);
      const project = await getProject(selectedProject.project_id);
      setSelectedProject(project);
      setProjects((current) =>
        current.map((item) => (item.project_id === project.project_id ? project : item))
      );
      setError(null);
      pushLog("success", "[4부서] 최종 쇼츠 MP4 렌더링 완료 (final.mp4)");
    } catch (reason) {
      const msg = reason instanceof Error ? reason.message : "최종 쇼츠 비디오 렌더링에 실패했습니다.";
      setError(msg);
      pushLog("error", `[4부서] 렌더링 실패: ${msg}`);
    } finally {
      setIsProductionBusy(false);
    }
  }

  async function handleAuditTopic() {
    if (!selectedProject) {
      return;
    }
    setIsProductionBusy(true);
    pushLog("info", "[4부서] 유튜브 업로드 전 주제 적합도 검수 실행...");
    try {
      const updated = await auditProducedVideoTopic(selectedProject.project_id);
      setProductionState(updated);
      setError(null);
      pushLog(
        "success",
        `[4부서] 주제 적합도 검수 완료: ${updated.topic_audit?.verdict_label ?? "완료"} (${updated.topic_audit?.fit_score ?? "-"}점)`
      );
    } catch (reason) {
      const msg = reason instanceof Error ? reason.message : "제작 영상 주제 적합도 검수에 실패했습니다.";
      setError(msg);
      pushLog("error", `[4부서] 주제 검수 실패: ${msg}`);
    } finally {
      setIsProductionBusy(false);
    }
  }

  async function handleTitleChange(newTitle: string) {
    setVideoTitle(newTitle);
    if (!selectedProject) {
      return;
    }
    try {
      const updated = await updateProject(selectedProject.project_id, {
        project_title: newTitle
      });
      setSelectedProject(updated);
      setProjects((current) =>
        current.map((item) => (item.project_id === updated.project_id ? updated : item))
      );
    } catch {
      // 타이핑 도중 실시간 저장은 실패하더라도 조용히 무시 (화면 입력 보존)
    }
  }

  const departments = getShortsDepartmentMetaList({
    project: selectedProject,
    referenceState,
    scriptsState,
    productionState,
    isReferenceBusy,
    isAudioBusy,
    isSttBusy,
    isAnalysisBusy,
    isScriptBusy,
    isProductionBusy
  });

  const activeTaskLabel = isReferenceBusy
    ? "1부서 · 레퍼런스 영상 검색 및 메타데이터 불러오는 중..."
    : isAudioBusy
    ? "1부서 · 레퍼런스 영상 오디오(WAV) 추출 진행 중..."
    : isSttBusy
    ? "1부서 · OpenAI Whisper STT 대본 변환 진행 중..."
    : isAnalysisBusy
    ? "1부서 · 레퍼런스 후킹·구조 분석 리포트 작성 중..."
    : reviewingCandidateId
    ? "2부서 · AI 초안 팩트체크 및 정확도 검토 진행 중..."
    : isScriptBusy
    ? "2부서 · AI 쇼츠 대본 생성/확정 처리 중..."
    : isProductionBusy
    ? "3·4부서 · 음성(TTS) · 비주얼 · Remotion 렌더링 작업 진행 중..."
    : null;

  const engineBadges = settings
    ? [
        { name: "OpenAI", ready: settings.openai_api_key },
        { name: "YouTube", ready: settings.youtube_api_key },
        { name: "Higgsfield", ready: settings.higgsfield_api_key },
        { name: "Qwen3-TTS", ready: Boolean(settings.qwen3_tts_base_url) }
      ]
    : [];

  const isAllMode = viewMode === "all";

  return (
    <div className="workstation-shell">
      {/* 좌측 고정 다크 워크스테이션 사이드바 (272px) */}
      <aside className="studio-sidebar" aria-label="Project dashboard">
        <button
          className="sidebar-brand"
          type="button"
          onClick={() => handleSelectDept("dept1")}
        >
          <span className="brand-emblem" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2a9.93 9.93 0 0 0-7.07 2.93A10 10 0 1 0 21.8 14a7.5 7.5 0 0 1-9.8-9.8c0-.74.1-1.48.27-2.2H12Zm7-1 1 2.5L22.5 4.5 20 5.5 19 8l-1-2.5L15.5 4.5 18 3.5 19 1Z" />
            </svg>
          </span>
          <span className="sidebar-brand-text">
            <strong>호기심빛나 스튜디오</strong>
            <small>SHORTS WORKSTATION</small>
          </span>
        </button>

        {/* 활성 프로젝트 빠른 전환기 */}
        <div className="sidebar-section">
          <div className="sidebar-label">
            <span>활성 프로젝트</span>
            <span>{projects.length}편</span>
          </div>
          <div className="project-switcher-box">
            <select
              aria-label="프로젝트 빠른 전환"
              className="project-select"
              value={selectedProject?.project_id ?? ""}
              onChange={(event) => {
                const target = projects.find((item) => item.project_id === event.target.value);
                if (target) handleSelectProject(target);
              }}
            >
              {projects.length === 0 ? (
                <option value="">— 프로젝트 없음 —</option>
              ) : (
                projects.map((item) => (
                  <option key={item.project_id} value={item.project_id}>
                    {item.display_name}
                  </option>
                ))
              )}
            </select>
            <div className="sidebar-quick-btns">
              <button
                type="button"
                className="sidebar-mini-btn is-accent"
                onClick={handleCreateProject}
              >
                <span>+ 새 쇼츠</span>
              </button>
              <button
                type="button"
                className="sidebar-mini-btn"
                onClick={() => setShowProjectDrawer((prev) => !prev)}
              >
                <span>{showProjectDrawer ? "목록 접기" : "목록 열기"}</span>
              </button>
            </div>
          </div>
        </div>

        {/* 좌측 1~4부서 진행률 레일 */}
        <div className="sidebar-section">
          <div className="sidebar-label">
            <span>1~4부서 제작 레일</span>
            <span>{isAllMode ? "전체" : activeDept.toUpperCase()}</span>
          </div>
          <nav className="dept-nav-list" aria-label="1~4부서 진행률 레일">
            {departments.map((dept) => {
              const isActive = !isAllMode && Boolean(selectedProject) && activeDept === dept.id;
              return (
                <button
                  key={dept.id}
                  type="button"
                  className={`dept-nav-btn ${isActive ? "is-active" : ""} ${dept.state === "done" ? "is-done" : ""}`}
                  disabled={!dept.clickable}
                  onClick={() => handleSelectDept(dept.id)}
                >
                  <div className="dept-nav-top">
                    <span className="dept-nav-icon">
                      <ShortsDepartmentIcon id={dept.id} size={15} />
                    </span>
                    <span className="dept-nav-title">
                      <strong>{dept.label}</strong>
                      <small>{dept.statusText}</small>
                    </span>
                    <span
                      className={`dept-status-dot ${
                        dept.state === "done" ? "is-done" : dept.state === "progress" ? "is-progress" : ""
                      }`}
                    />
                  </div>
                  {selectedProject && (
                    <div className="dept-mini-progress">
                      <span style={{ width: `${dept.progress}%` }} />
                    </div>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* 프로젝트 목록 (선택·삭제·신규 생성) */}
        {showProjectDrawer && (
          <div className="sidebar-section">
            <ProjectDashboard
              onCreateProject={handleCreateProject}
              onDeleteProject={handleDeleteProject}
              onSelectProject={handleSelectProject}
              projects={projects}
              selectedProjectId={selectedProject?.project_id ?? null}
            />
          </div>
        )}

        {/* 하단 엔진 연결 상태 LED 카드 */}
        <div className="sidebar-footer">
          <div className="sidebar-label">
            <span>엔진 연결 상태</span>
          </div>
          <div className="engine-grid">
            {engineBadges.length > 0 ? (
              engineBadges.map((engine) => (
                <div
                  className="engine-pill"
                  key={engine.name}
                  title={`${engine.name}: ${engine.ready ? "연결됨" : "미설정"}`}
                >
                  <span className={`engine-led ${engine.ready ? "is-ready" : "is-error"}`} />
                  <span>{engine.name}</span>
                </div>
              ))
            ) : (
              <div className="engine-pill" style={{ gridColumn: "1 / -1" }}>
                <span className="engine-led is-ready" />
                <span>로컬 엔진 확인 중...</span>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* 우측 메인 워크스테이션 영역 */}
      <div className="studio-main-column">
        <header className="top-command-bar">
          <div className="topbar-project-info">
            <h1>{selectedProject ? selectedProject.display_name : "호기심빛나 쇼츠 스튜디오"}</h1>
            {selectedProject && (
              <>
                <span className="topbar-meta-chip">{formatDate(selectedProject.updated_at)}</span>
                <button
                  className="quiet-button"
                  onClick={handleEditTitle}
                  type="button"
                  aria-label="Edit title"
                  title="프로젝트 제목 수정"
                  style={{ padding: "4px 10px", fontSize: "11.5px" }}
                >
                  제목 수정
                </button>
              </>
            )}
          </div>

          {selectedProject && (
            <StudioStepRail
              departments={departments}
              activeDept={activeDept}
              isAllMode={isAllMode}
              onSelectDept={handleSelectDept}
            />
          )}

          <div className="topbar-actions">
            {selectedProject && (
              <button
                type="button"
                className={`view-toggle-btn ${isAllMode ? "is-active" : ""}`}
                onClick={() => setViewMode((prev) => (prev === "all" ? "dept" : "all"))}
                aria-pressed={isAllMode}
                title="1~4부서 전체 패널을 한 화면에 펼치거나 현재 부서에만 집중합니다"
              >
                {isAllMode ? "📑 부서별 집중 보기" : "🧩 전체 보기"}
              </button>
            )}
            <span className="local-chip">
              <span />
              로컬 저장
            </span>
          </div>
        </header>

        <main className="studio-content">
          {isLoading ? (
            <p className="status-banner">프로젝트와 워크스테이션 설정을 불러오는 중입니다...</p>
          ) : null}
          {error ? (
            <p className="status-banner status-banner--warning">API 연결/작업 오류: {error}</p>
          ) : null}

          {selectedProject ? (
            <>
              {/* 실시간 상태 로그 콘솔 */}
              <LiveStatusConsole
                activeTaskLabel={activeTaskLabel}
                liveLogs={liveLogs}
                jobHistory={selectedProject.job_history}
                error={error}
                onClearLogs={() => setLiveLogs([])}
              />

              {/* ========================
                  부서 집중 모드 (1~4부서)
                  ======================== */}
              {!isAllMode && activeDept === "dept1" && (
                <article className="dept-stack enter-up">
                  <div className="dept-hero-bar">
                    <div>
                      <span className="eyebrow">DEPARTMENT 01 · REFERENCE &amp; ANALYSIS</span>
                      <h2>1부서 · 레퍼런스 탐색 · STT · 구조 분석</h2>
                      <p>떡상 레퍼런스를 검색하거나 링크로 연결하고 오디오 추출 → STT → 구조 분석까지 한 번에 마칩니다.</p>
                    </div>
                    <div className="dept-hero-actions">
                      <button
                        type="button"
                        className="primary-button"
                        onClick={() => handleSelectDept("dept2")}
                      >
                        2부서 · 기획·대본으로 이동 →
                      </button>
                    </div>
                  </div>

                  <ReferenceSearchPanel
                    candidates={referenceState?.candidates ?? []}
                    isBusy={isReferenceBusy}
                    onAddDirect={handleAddDirectReference}
                    onSearch={handleReferenceSearch}
                    onSelect={handleSelectReference}
                    selectedReference={referenceState?.selected_reference ?? null}
                  />

                  <div className="dept-two-col">
                    <div className="dept-stack">
                      <ReferenceTranscriptPanel
                        hasAudio={hasAudio}
                        hasSelectedReference={hasSelectedReference}
                        isAudioBusy={isAudioBusy}
                        isSttBusy={isSttBusy}
                        onExtractAudio={handleExtractAudio}
                        onRunStt={handleRunStt}
                        referenceScript={referenceState?.reference_script ?? null}
                      />
                      <ReferenceAnalysisPanel
                        analysisMarkdown={referenceState?.analysis_markdown ?? null}
                        isBusy={isAnalysisBusy}
                        onAnalyze={handleAnalyzeReference}
                      />
                    </div>

                    <ProjectWorkflow
                      currentStep={selectedProject.current_step}
                      hasAnalysis={Boolean(
                        referenceState?.analysis || selectedProject?.generated_files?.reference_analysis
                      )}
                      hasAudio={hasAudio}
                      hasSelectedReference={hasSelectedReference}
                      isAnalysisBusy={isAnalysisBusy}
                      isAudioBusy={isAudioBusy}
                      isSttBusy={isSttBusy}
                      stepStatuses={selectedProject.step_statuses}
                    />
                  </div>
                </article>
              )}

              {!isAllMode && activeDept === "dept2" && (
                <article className="dept-stack enter-up">
                  <div className="dept-hero-bar">
                    <div>
                      <span className="eyebrow">DEPARTMENT 02 · PLANNING &amp; SCRIPT</span>
                      <h2>2부서 · 기획 · AI 대본 초안 · 최종 TTS 대본</h2>
                      <p>초안 2종을 생성하고 팩트체크·직접 수정 후 오프닝 타이틀과 최종 낭독 대본을 확정합니다.</p>
                    </div>
                    <div className="dept-hero-actions">
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => handleSelectDept("dept1")}
                      >
                        ← 1부서
                      </button>
                      <button
                        type="button"
                        className="primary-button"
                        onClick={() => handleSelectDept("dept3")}
                      >
                        3부서 · 음성·비주얼로 이동 →
                      </button>
                    </div>
                  </div>

                  <CandidateDraftsPanel
                    candidates={scriptsState?.candidates ?? []}
                    candidateReviews={scriptsState?.candidate_reviews}
                    isBusy={isScriptBusy}
                    onGenerate={handleGenerateCandidates}
                    onReview={handleReviewScriptCandidate}
                    onSelect={handleSelectScriptCandidate}
                    onUpdateCandidate={handleUpdateScriptCandidate}
                    reviewingCandidateId={reviewingCandidateId}
                    selectedCandidateId={scriptsState?.selected_candidate?.candidate_id ?? null}
                    videoTitle={videoTitle}
                    onTitleChange={handleTitleChange}
                  />

                  <FinalScriptPanel
                    finalScript={scriptsState?.final_script ?? null}
                    isBusy={isScriptBusy}
                    onFinalize={handleFinalizeScript}
                    selectedCandidate={scriptsState?.selected_candidate ?? null}
                    ttsValidation={scriptsState?.tts_validation ?? null}
                  />
                </article>
              )}

              {!isAllMode && activeDept === "dept3" && (
                <article className="dept-stack enter-up">
                  <div className="dept-hero-bar">
                    <div>
                      <span className="eyebrow">DEPARTMENT 03 · VOICE &amp; VISUAL PRODUCTION</span>
                      <h2>3부서 · 1.2x TTS 음성 · 씬 이미지 · AI 비디오 제작</h2>
                      <p>확정 대본으로 음성과 씬을 분할하고, 스타일 콘셉트·AI 이미지·원테이크 비디오 소스를 생성합니다.</p>
                    </div>
                    <div className="dept-hero-actions">
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => handleSelectDept("dept2")}
                      >
                        ← 2부서
                      </button>
                      <button
                        type="button"
                        className="primary-button"
                        onClick={() => handleSelectDept("dept4")}
                      >
                        4부서 · 렌더·검수로 이동 →
                      </button>
                    </div>
                  </div>

                  <ProductionPanel
                    hasFinalScript={Boolean(
                      scriptsState?.final_script || selectedProject.generated_files?.final_script
                    )}
                    isBusy={isProductionBusy}
                    onGenerateAllSceneImages={handleGenerateAllSceneImages}
                    onGenerateConcepts={handleGenerateConcepts}
                    onGenerateProduction={handleGenerateProduction}
                    onGenerateSceneImage={handleGenerateSceneImage}
                    onGenerateSceneVideo={handleGenerateSceneVideo}
                    onPassContinuity={handlePassContinuity}
                    onRegenerateWithFeedback={handleRegenerateSceneWithFeedback}
                    onUpdateScenePrompts={handleUpdateScenePrompts}
                    onRenderShorts={handleRenderShorts}
                    onAuditTopic={handleAuditTopic}
                    productionState={productionState}
                    projectId={selectedProject.project_id}
                    projectTitle={selectedProject.project_title}
                    videoTitle={videoTitle}
                    onTitleChange={handleTitleChange}
                    viewSection="production"
                  />
                </article>
              )}

              {!isAllMode && activeDept === "dept4" && (
                <article className="dept-stack enter-up">
                  <div className="dept-hero-bar">
                    <div>
                      <span className="eyebrow">DEPARTMENT 04 · RENDER, QA &amp; ARCHIVE</span>
                      <h2>4부서 · 9:16 최종 렌더링 · 주제 적합도 검수 · 산출물</h2>
                      <p>Remotion 24fps 최종 쇼츠를 렌더링하고, 채널 주제 적합도 검수·작업 이력·산출물 경로를 확인합니다.</p>
                    </div>
                    <div className="dept-hero-actions">
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => handleSelectDept("dept3")}
                      >
                        ← 3부서로 돌아가기
                      </button>
                    </div>
                  </div>

                  <ProductionPanel
                    hasFinalScript={Boolean(
                      scriptsState?.final_script || selectedProject.generated_files?.final_script
                    )}
                    isBusy={isProductionBusy}
                    onGenerateAllSceneImages={handleGenerateAllSceneImages}
                    onGenerateConcepts={handleGenerateConcepts}
                    onGenerateProduction={handleGenerateProduction}
                    onGenerateSceneImage={handleGenerateSceneImage}
                    onGenerateSceneVideo={handleGenerateSceneVideo}
                    onPassContinuity={handlePassContinuity}
                    onRegenerateWithFeedback={handleRegenerateSceneWithFeedback}
                    onUpdateScenePrompts={handleUpdateScenePrompts}
                    onRenderShorts={handleRenderShorts}
                    onAuditTopic={handleAuditTopic}
                    productionState={productionState}
                    projectId={selectedProject.project_id}
                    projectTitle={selectedProject.project_title}
                    videoTitle={videoTitle}
                    onTitleChange={handleTitleChange}
                    viewSection="render"
                  />

                  <div className="dept-equal-col">
                    <section className="panel" aria-labelledby="jobs-title">
                      <div className="section-header">
                        <div>
                          <p className="eyebrow">Jobs</p>
                          <h2 id="jobs-title">최근 실행 작업 이력</h2>
                        </div>
                        <span className="count-pill">{selectedProject.job_history.length}</span>
                      </div>
                      {selectedProject.job_history.length > 0 ? (
                        <ul className="job-list">
                          {selectedProject.job_history.map((job) => (
                            <li key={job.job_id}>
                              <span>
                                <strong>{job.label}</strong>
                                <small>{job.job_type}</small>
                              </span>
                              <span className={`state-pill state-pill--${job.state}`}>{job.state}</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="empty-state">아직 실행된 작업이 없습니다.</p>
                      )}
                    </section>

                    <section className="panel" aria-labelledby="files-title">
                      <div className="section-header">
                        <div>
                          <p className="eyebrow">Outputs</p>
                          <h2 id="files-title">생성된 산출물 파일</h2>
                        </div>
                        <span className="count-pill">{generatedFiles.length}</span>
                      </div>
                      {generatedFiles.length > 0 ? (
                        <dl className="file-list">
                          {generatedFiles.map(([label, path]) => (
                            <div key={label}>
                              <dt>{label}</dt>
                              <dd>{path}</dd>
                            </div>
                          ))}
                        </dl>
                      ) : (
                        <p className="empty-state">생성된 파일이 없습니다.</p>
                      )}
                    </section>
                  </div>

                  <SettingsPanel settings={settings} />
                </article>
              )}

              {/* ========================
                  전체 보기 모드 (1~4부서 통합)
                  ======================== */}
              {isAllMode && (
                <article className="dashboard enter-up">
                  <div className="dept-hero-bar">
                    <div>
                      <span className="eyebrow">ALL-IN-ONE OVERVIEW · 1~4부서 전체 보기</span>
                      <h2>전체 파이프라인 통합 워크스페이스</h2>
                      <p>1부서 레퍼런스 분석부터 4부서 최종 렌더링·검수까지 모든 패널을 한 화면에서 확인합니다.</p>
                    </div>
                    <div className="dept-hero-actions">
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => setViewMode("dept")}
                      >
                        📑 현재 부서 집중 모드로 돌아가기
                      </button>
                    </div>
                  </div>

                  <div className="dashboard-grid">
                    <ReferenceSearchPanel
                      candidates={referenceState?.candidates ?? []}
                      isBusy={isReferenceBusy}
                      onAddDirect={handleAddDirectReference}
                      onSearch={handleReferenceSearch}
                      onSelect={handleSelectReference}
                      selectedReference={referenceState?.selected_reference ?? null}
                    />
                    <ReferenceTranscriptPanel
                      hasAudio={hasAudio}
                      hasSelectedReference={hasSelectedReference}
                      isAudioBusy={isAudioBusy}
                      isSttBusy={isSttBusy}
                      onExtractAudio={handleExtractAudio}
                      onRunStt={handleRunStt}
                      referenceScript={referenceState?.reference_script ?? null}
                    />
                    <ProjectWorkflow
                      currentStep={selectedProject.current_step}
                      hasAnalysis={Boolean(
                        referenceState?.analysis || selectedProject?.generated_files?.reference_analysis
                      )}
                      hasAudio={hasAudio}
                      hasSelectedReference={hasSelectedReference}
                      isAnalysisBusy={isAnalysisBusy}
                      isAudioBusy={isAudioBusy}
                      isSttBusy={isSttBusy}
                      stepStatuses={selectedProject.step_statuses}
                    />
                    <ReferenceAnalysisPanel
                      analysisMarkdown={referenceState?.analysis_markdown ?? null}
                      isBusy={isAnalysisBusy}
                      onAnalyze={handleAnalyzeReference}
                    />
                    <CandidateDraftsPanel
                      candidates={scriptsState?.candidates ?? []}
                      candidateReviews={scriptsState?.candidate_reviews}
                      isBusy={isScriptBusy}
                      onGenerate={handleGenerateCandidates}
                      onReview={handleReviewScriptCandidate}
                      onSelect={handleSelectScriptCandidate}
                      onUpdateCandidate={handleUpdateScriptCandidate}
                      reviewingCandidateId={reviewingCandidateId}
                      selectedCandidateId={scriptsState?.selected_candidate?.candidate_id ?? null}
                      videoTitle={videoTitle}
                      onTitleChange={handleTitleChange}
                    />
                    <FinalScriptPanel
                      finalScript={scriptsState?.final_script ?? null}
                      isBusy={isScriptBusy}
                      onFinalize={handleFinalizeScript}
                      selectedCandidate={scriptsState?.selected_candidate ?? null}
                      ttsValidation={scriptsState?.tts_validation ?? null}
                    />
                    <ProductionPanel
                      hasFinalScript={Boolean(
                        scriptsState?.final_script || selectedProject.generated_files?.final_script
                      )}
                      isBusy={isProductionBusy}
                      onGenerateAllSceneImages={handleGenerateAllSceneImages}
                      onGenerateConcepts={handleGenerateConcepts}
                      onGenerateProduction={handleGenerateProduction}
                      onGenerateSceneImage={handleGenerateSceneImage}
                      onGenerateSceneVideo={handleGenerateSceneVideo}
                      onPassContinuity={handlePassContinuity}
                      onRegenerateWithFeedback={handleRegenerateSceneWithFeedback}
                      onUpdateScenePrompts={handleUpdateScenePrompts}
                      onRenderShorts={handleRenderShorts}
                      onAuditTopic={handleAuditTopic}
                      productionState={productionState}
                      projectId={selectedProject.project_id}
                      projectTitle={selectedProject.project_title}
                      videoTitle={videoTitle}
                      onTitleChange={handleTitleChange}
                      viewSection="all"
                    />
                    <SettingsPanel settings={settings} />

                    <section className="panel" aria-labelledby="jobs-title-all">
                      <div className="section-header">
                        <div>
                          <p className="eyebrow">Jobs</p>
                          <h2 id="jobs-title-all">Recent work</h2>
                        </div>
                        <span className="count-pill">{selectedProject.job_history.length}</span>
                      </div>
                      {selectedProject.job_history.length > 0 ? (
                        <ul className="job-list">
                          {selectedProject.job_history.map((job) => (
                            <li key={job.job_id}>
                              <span>
                                <strong>{job.label}</strong>
                                <small>{job.job_type}</small>
                              </span>
                              <span className={`state-pill state-pill--${job.state}`}>{job.state}</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="empty-state">아직 실행된 작업이 없습니다.</p>
                      )}
                    </section>

                    <section className="panel panel-span-full" aria-labelledby="files-title-all">
                      <div className="section-header">
                        <div>
                          <p className="eyebrow">Outputs</p>
                          <h2 id="files-title-all">Generated files</h2>
                        </div>
                        <span className="count-pill">{generatedFiles.length}</span>
                      </div>
                      {generatedFiles.length > 0 ? (
                        <dl className="file-list">
                          {generatedFiles.map(([label, path]) => (
                            <div key={label}>
                              <dt>{label}</dt>
                              <dd>{path}</dd>
                            </div>
                          ))}
                        </dl>
                      ) : (
                        <p className="empty-state">생성된 파일이 없습니다.</p>
                      )}
                    </section>
                  </div>
                </article>
              )}
            </>
          ) : (
            <section className="panel empty-workspace" aria-label="Empty workspace">
              <p className="eyebrow">SHORTS WORKSTATION · READY</p>
              <h1>Create a project to begin.</h1>
              <p className="muted">좌측의 [+ 새 쇼츠] 또는 [+ New Project] 버튼을 눌러 새 쇼츠 제작을 시작하세요.</p>
              <button type="button" className="primary-button" onClick={handleCreateProject}>
                + 새 쇼츠 프로젝트 만들기
              </button>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}
