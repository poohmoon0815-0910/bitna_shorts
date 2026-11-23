import { useState } from "react";
import type { FormEvent } from "react";

import type { ScriptCandidate, TtsValidationResult } from "../types";

interface FinalScriptPanelProps {
  readonly finalScript: string | null;
  readonly isBusy: boolean;
  readonly onFinalize: (feedback: string) => void;
  readonly selectedCandidate: ScriptCandidate | null;
  readonly ttsValidation: TtsValidationResult | null;
}

export function FinalScriptPanel({
  finalScript,
  isBusy,
  onFinalize,
  selectedCandidate,
  ttsValidation
}: FinalScriptPanelProps) {
  const [feedback, setFeedback] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isBusy && selectedCandidate) {
      onFinalize(feedback.trim());
    }
  }

  return (
    <section className="panel final-script-panel" aria-labelledby="final-script-title">
      <div className="section-header">
        <div>
          <p className="eyebrow">Step 06 · Final TTS Script</p>
          <h2 id="final-script-title">최종 TTS 낭독 대본 확정</h2>
        </div>
        {finalScript ? (
          <span className="state-pill state-pill--succeeded">
            ⏱️ {finalScript.length}자 (약 {Math.round(finalScript.length / 9.5)}초)
          </span>
        ) : (
          <span className="state-pill state-pill--waiting">확정 대기</span>
        )}
      </div>

      {selectedCandidate ? (
        <div className="selected-script-summary">
          <p className="eyebrow">Selected candidate</p>
          <h3>{selectedCandidate.title}</h3>
          <p>{selectedCandidate.hook}</p>
        </div>
      ) : (
        <p className="empty-state" style={{ marginBottom: "14px" }}>
          Select one candidate before finalizing a script.
        </p>
      )}

      <form className="final-script-form" onSubmit={handleSubmit}>
        <label>
          <span>Feedback</span>
          <textarea
            name="feedback"
            onChange={(event) => setFeedback(event.target.value)}
            placeholder="선택 사항: 더 강하게, 더 짧게, 특정 주제로 조정 등"
            value={feedback}
          />
        </label>
        <button className="primary-button" disabled={isBusy || !selectedCandidate} type="submit">
          {isBusy ? (
            <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
              <span className="spinner-icon">⏳</span> 6. 최종 대본 확정 진행 중...
            </span>
          ) : (
            "6. 최종 대본 확정 (Finalize Script)"
          )}
        </button>
      </form>

      <pre className="script-preview">{finalScript ?? "Final TTS-ready script will appear here."}</pre>

      {ttsValidation ? (
        <div className={ttsValidation.is_valid ? "validation validation--ok" : "validation validation--warning"}>
          <strong>{ttsValidation.is_valid ? "✓ TTS rules passed" : "⚠️ TTS rules need review"}</strong>
          {ttsValidation.issues.length > 0 ? (
            <ul>
              {ttsValidation.issues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
