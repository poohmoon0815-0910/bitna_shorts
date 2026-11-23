import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CandidateDraftsPanel } from "../src/components/CandidateDraftsPanel";
import type { ScriptCandidate } from "../src/types";

const candidate: ScriptCandidate = {
  candidate_id: "same-topic-1",
  candidate_type: "same_topic",
  title: "돈을 모으는 이상한 습관",
  hook: "돈을 못 모으는 사람은 이것부터 틀립니다.",
  target_viewer: "사회초년생",
  why_it_can_work: "자기 문제처럼 들리는 훅입니다.",
  main_curiosity_question: "왜 돈이 안 모일까?",
  structure_summary: "상식 반박, 원인, 반전, 결론.",
  draft_script: "돈을 못 모으는 사람은 의지가 약한 게 아닙니다.",
  borrowed_reference_structure: "레퍼런스의 상식 반박 구조를 빌립니다."
};

describe("CandidateDraftsPanel", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders candidates and calls generate/select actions", async () => {
    const user = userEvent.setup();
    const onGenerate = vi.fn();
    const onSelect = vi.fn();

    render(
      <CandidateDraftsPanel
        candidates={[candidate]}
        isBusy={false}
        onGenerate={onGenerate}
        onSelect={onSelect}
        selectedCandidateId={null}
      />
    );

    expect(screen.getByText("돈을 모으는 이상한 습관")).toBeInTheDocument();
    expect(screen.getByText(/same topic/i)).toBeInTheDocument();
    expect(screen.getByText("돈을 못 모으는 사람은 이것부터 틀립니다.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Generate candidates/i }));
    await user.click(screen.getByRole("button", { name: /Select 돈을 모으는 이상한 습관/i }));

    expect(onGenerate).toHaveBeenCalled();
    expect(onSelect).toHaveBeenCalledWith("same-topic-1");
  });

  it("reviews draft, displays issues, and allows editing draft script", async () => {
    const user = userEvent.setup();
    const onReview = vi.fn();
    const onUpdateCandidate = vi.fn();

    render(
      <CandidateDraftsPanel
        candidates={[candidate]}
        candidateReviews={{
          "same-topic-1": {
            candidate_id: "same-topic-1",
            is_accurate: false,
            summary: "일부 수치에 오류가 있습니다.",
            issues: [
              {
                claim: "의지가 약한 게 아닙니다",
                severity: "warning",
                reason: "단정적 표현입니다.",
                suggestion: "습관 설계의 문제로 완화하세요."
              }
            ],
            suggested_script: "수정 제안된 대본 초안입니다."
          }
        }}
        isBusy={false}
        onGenerate={vi.fn()}
        onReview={onReview}
        onSelect={vi.fn()}
        onUpdateCandidate={onUpdateCandidate}
        selectedCandidateId={null}
      />
    );

    await user.click(screen.getByRole("button", { name: /Review 돈을 모으는 이상한 습관/i }));
    expect(onReview).toHaveBeenCalledWith("same-topic-1");

    expect(screen.getByText(/일부 수치에 오류가 있습니다/i)).toBeInTheDocument();
    expect(screen.getByText(/단정적 표현입니다/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /AI 수정안으로 편집/i }));
    const textarea = screen.getByLabelText(/Edit script for 돈을 모으는 이상한 습관/i);
    expect(textarea).toHaveValue("수정 제안된 대본 초안입니다.");

    await user.clear(textarea);
    await user.type(textarea, "사용자가 직접 수정한 대본입니다.");
    await user.click(screen.getByRole("button", { name: /수정 저장/i }));

    expect(onUpdateCandidate).toHaveBeenCalledWith(
      "same-topic-1",
      "사용자가 직접 수정한 대본입니다."
    );
  });
});
