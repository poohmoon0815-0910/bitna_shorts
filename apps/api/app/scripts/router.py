from __future__ import annotations

import json
from pathlib import Path
from typing import Callable

from fastapi import APIRouter, Depends, HTTPException

from app.core.settings import AppSettings
from app.jobs.service import append_job, update_job_state
from app.projects.service import read_project, save_project
from app.references.files import REFERENCE_ANALYSIS_FILE, REFERENCE_SCRIPT_FILE
from app.references.openai_clients import AnalysisClient
from app.production.service import (
    CONCEPT_KIT_FILENAME,
    VIDEO_SCENES_FILENAME,
    generate_concept_kit_and_video_scenes,
)
from app.scripts.files import (
    CANDIDATE_REVIEWS_FILE,
    FINAL_SCRIPT_FILE,
    FINAL_SCRIPT_STATE_FILE,
    SCRIPT_CANDIDATES_FILE,
    SELECTED_SCRIPT_CANDIDATE_FILE,
    read_candidate_reviews,
    read_script_candidates,
    read_script_state,
    read_selected_script_candidate,
    write_candidate_reviews,
    write_final_script_state,
    write_script_candidates,
    write_selected_script_candidate,
)
from app.scripts.generation import (
    build_candidate_generation_prompt,
    build_draft_review_prompt,
    build_final_script_prompt,
    build_final_script_state,
    extract_final_script,
    validate_candidate_payload,
    validate_draft_review_payload,
)
from app.scripts.models import (
    FinalizeScriptRequest,
    GenerateCandidatesRequest,
    SelectScriptCandidateRequest,
    UpdateCandidateDraftRequest,
)


def create_scripts_router(
    outputs_dir_provider: Callable[[], Path],
    settings_provider: Callable[[], AppSettings],
    script_client_factory: Callable[[str, str], AnalysisClient],
) -> APIRouter:
    router = APIRouter(prefix="/api/projects/{project_id}/scripts", tags=["scripts"])

    def project_dir(outputs_dir: Path, project_id: str) -> Path:
        read_project(outputs_dir, project_id)
        return outputs_dir / project_id

    def fail_job(outputs_dir: Path, project_id: str, job_id: str | None, message: str) -> None:
        if job_id is None:
            return
        update_job_state(outputs_dir, project_id, job_id, "failed", message, error_message=message)

    @router.get("")
    def get_scripts(project_id: str, outputs: Path = Depends(outputs_dir_provider)):
        try:
            return read_script_state(project_dir(outputs, project_id)).model_dump()
        except FileNotFoundError as exc:
            raise HTTPException(status_code=404, detail="Project not found") from exc
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @router.post("/candidates")
    def generate_candidates(
        project_id: str,
        payload: GenerateCandidatesRequest | None = None,
        outputs: Path = Depends(outputs_dir_provider),
        settings: AppSettings = Depends(settings_provider),
    ):
        job_id: str | None = None
        feedback = payload.feedback.strip() if payload else ""
        try:
            path = project_dir(outputs, project_id)
            script_path = path / REFERENCE_SCRIPT_FILE
            analysis_path = path / REFERENCE_ANALYSIS_FILE
            if not script_path.exists() or not analysis_path.exists():
                raise HTTPException(status_code=400, detail="Reference script and analysis are required")

            reference_script = script_path.read_text(encoding="utf-8")
            reference_analysis = json.loads(analysis_path.read_text(encoding="utf-8"))
            job = append_job(
                outputs,
                project_id,
                "script_candidates",
                "Generate script candidates",
                input_paths=[REFERENCE_SCRIPT_FILE, REFERENCE_ANALYSIS_FILE],
                provider="openai",
                command=settings.openai_analysis_model,
            )
            job_id = job.job_id
            update_job_state(
                outputs,
                project_id,
                job.job_id,
                "running",
                "Generating script drafts based on analysis and feedback",
            )
            client = script_client_factory(settings.openai_api_key, settings.openai_analysis_model)
            prompt = build_candidate_generation_prompt(reference_script, reference_analysis, feedback)
            response_payload = client.analyze(prompt)
            candidates = validate_candidate_payload(response_payload)
            write_script_candidates(path, candidates)
            write_candidate_reviews(path, {})

            project = read_project(outputs, project_id)
            project.generated_files["script_candidates"] = SCRIPT_CANDIDATES_FILE
            project.current_step = "Candidates"
            for status in project.step_statuses:
                if status.name == "Candidates":
                    status.state = "succeeded"
                    status.message = f"{len(candidates)} candidate drafts are ready for selection."
                elif status.name == "Script":
                    status.state = "waiting"
                    status.message = "Candidate drafts generated. Select a candidate to finalize script."
            save_project(outputs, project)
            update_job_state(
                outputs,
                project_id,
                job.job_id,
                "succeeded",
                "Script candidates generated",
                output_paths=[SCRIPT_CANDIDATES_FILE],
            )
            return {"candidates": [item.model_dump() for item in candidates]}
        except HTTPException:
            raise
        except FileNotFoundError as exc:
            raise HTTPException(status_code=404, detail="Project not found") from exc
        except Exception as exc:
            message = str(exc) or exc.__class__.__name__
            fail_job(outputs, project_id, job_id, message)
            raise HTTPException(status_code=400, detail=message) from exc

    @router.post("/select")
    def select_candidate(
        project_id: str,
        payload: SelectScriptCandidateRequest,
        outputs: Path = Depends(outputs_dir_provider),
    ):
        try:
            path = project_dir(outputs, project_id)
            matches = [
                item
                for item in read_script_candidates(path)
                if item.candidate_id == payload.candidate_id
            ]
            if not matches:
                raise HTTPException(status_code=404, detail="Script candidate not found")
            selected = matches[0]
            write_selected_script_candidate(path, selected)

            project = read_project(outputs, project_id)
            project.selected_candidate_id = selected.candidate_id
            project.generated_files["selected_script_candidate"] = SELECTED_SCRIPT_CANDIDATE_FILE
            project.current_step = "Script"
            for status in project.step_statuses:
                if status.name == "Candidates":
                    status.state = "succeeded"
                    status.message = "Script candidate selected."
                elif status.name == "Script":
                    status.state = "running"
                    status.message = "Ready to finalize TTS script."
            save_project(outputs, project)
            return {"selected_candidate": selected.model_dump()}
        except HTTPException:
            raise
        except FileNotFoundError as exc:
            raise HTTPException(status_code=404, detail="Project not found") from exc
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @router.post("/candidates/{candidate_id}/review")
    def review_candidate(
        project_id: str,
        candidate_id: str,
        outputs: Path = Depends(outputs_dir_provider),
        settings: AppSettings = Depends(settings_provider),
    ):
        job_id: str | None = None
        try:
            path = project_dir(outputs, project_id)
            candidates = read_script_candidates(path)
            matches = [item for item in candidates if item.candidate_id == candidate_id]
            if not matches:
                raise HTTPException(status_code=404, detail="Script candidate not found")
            target = matches[0]

            job = append_job(
                outputs,
                project_id,
                "draft_review",
                f"Review script draft ({candidate_id})",
                input_paths=[SCRIPT_CANDIDATES_FILE],
                provider="openai",
                command=settings.openai_analysis_model,
            )
            job_id = job.job_id
            update_job_state(
                outputs,
                project_id,
                job.job_id,
                "running",
                f"Fact-checking draft {candidate_id}",
            )

            client = script_client_factory(settings.openai_api_key, settings.openai_analysis_model)
            response_payload = client.analyze(build_draft_review_prompt(target))
            review = validate_draft_review_payload(candidate_id, response_payload)

            reviews = read_candidate_reviews(path)
            reviews[candidate_id] = review
            write_candidate_reviews(path, reviews)

            project = read_project(outputs, project_id)
            project.generated_files["candidate_reviews"] = CANDIDATE_REVIEWS_FILE
            save_project(outputs, project)

            update_job_state(
                outputs,
                project_id,
                job.job_id,
                "succeeded",
                "Draft review complete",
                output_paths=[CANDIDATE_REVIEWS_FILE],
            )
            return {"review": review.model_dump()}
        except HTTPException:
            raise
        except FileNotFoundError as exc:
            raise HTTPException(status_code=404, detail="Project not found") from exc
        except Exception as exc:
            message = str(exc) or exc.__class__.__name__
            fail_job(outputs, project_id, job_id, message)
            raise HTTPException(status_code=400, detail=message) from exc

    @router.patch("/candidates/{candidate_id}")
    def update_candidate(
        project_id: str,
        candidate_id: str,
        payload: UpdateCandidateDraftRequest,
        outputs: Path = Depends(outputs_dir_provider),
    ):
        try:
            path = project_dir(outputs, project_id)
            candidates = read_script_candidates(path)
            updated_candidate = None
            updated_list = []
            for item in candidates:
                if item.candidate_id == candidate_id:
                    updates = {"draft_script": payload.draft_script}
                    if payload.title is not None:
                        updates["title"] = payload.title
                    if payload.hook is not None:
                        updates["hook"] = payload.hook
                    updated_candidate = item.model_copy(update=updates)
                    updated_list.append(updated_candidate)
                else:
                    updated_list.append(item)

            if updated_candidate is None:
                raise HTTPException(status_code=404, detail="Script candidate not found")

            write_script_candidates(path, updated_list)

            selected = read_selected_script_candidate(path)
            if selected is not None and selected.candidate_id == candidate_id:
                write_selected_script_candidate(path, updated_candidate)

            reviews = read_candidate_reviews(path)
            if candidate_id in reviews:
                del reviews[candidate_id]
                write_candidate_reviews(path, reviews)

            return {"candidate": updated_candidate.model_dump()}
        except HTTPException:
            raise
        except FileNotFoundError as exc:
            raise HTTPException(status_code=404, detail="Project not found") from exc
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @router.post("/finalize")
    def finalize_script(
        project_id: str,
        payload: FinalizeScriptRequest,
        outputs: Path = Depends(outputs_dir_provider),
        settings: AppSettings = Depends(settings_provider),
    ):
        job_id: str | None = None
        try:
            path = project_dir(outputs, project_id)
            selected = read_script_state(path).selected_candidate
            if selected is None:
                raise HTTPException(status_code=400, detail="Select a script candidate before finalizing")

            job = append_job(
                outputs,
                project_id,
                "final_script",
                "Finalize TTS script",
                input_paths=[SELECTED_SCRIPT_CANDIDATE_FILE],
                provider="openai",
                command=settings.openai_analysis_model,
            )
            job_id = job.job_id
            update_job_state(outputs, project_id, job.job_id, "running", "Finalizing TTS-ready script")
            client = script_client_factory(settings.openai_api_key, settings.openai_analysis_model)
            response = client.analyze(build_final_script_prompt(selected, payload.feedback))
            final_script = extract_final_script(response)
            state = build_final_script_state(
                selected.candidate_id,
                payload.feedback,
                final_script,
                source_script=selected.draft_script,
            )
            write_final_script_state(path, state)

            project = read_project(outputs, project_id)
            project.generated_files["final_script"] = FINAL_SCRIPT_FILE
            project.generated_files["final_script_state"] = FINAL_SCRIPT_STATE_FILE

            # Finalize script 시 대본과 함께 각 씬의 이미지 & 비디오 프롬프트 자동 생성!
            try:
                generate_concept_kit_and_video_scenes(path, settings)
                project.generated_files["concept_kit"] = CONCEPT_KIT_FILENAME
                project.generated_files["video_scenes"] = VIDEO_SCENES_FILENAME
            except Exception:
                pass

            project.current_step = "Production"
            for status in project.step_statuses:
                if status.name == "Script":
                    status.state = "succeeded"
                    status.message = "Final TTS-ready script complete."
                elif status.name == "Production":
                    status.state = "waiting"
                    status.message = "Script and scene prompts ready. Ready for TTS voice and images."
            save_project(outputs, project)
            update_job_state(
                outputs,
                project_id,
                job.job_id,
                "succeeded",
                "Final script complete",
                output_paths=[FINAL_SCRIPT_FILE, FINAL_SCRIPT_STATE_FILE],
            )
            return state.model_dump()
        except HTTPException:
            raise
        except FileNotFoundError as exc:
            raise HTTPException(status_code=404, detail="Project not found") from exc
        except Exception as exc:
            message = str(exc) or exc.__class__.__name__
            fail_job(outputs, project_id, job_id, message)
            raise HTTPException(status_code=400, detail=message) from exc

    return router
