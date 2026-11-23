interface ReferenceAnalysisPanelProps {
  readonly analysisMarkdown: string | null;
  readonly isBusy: boolean;
  readonly onAnalyze: () => void;
}

export function ReferenceAnalysisPanel({
  analysisMarkdown,
  isBusy,
  onAnalyze
}: ReferenceAnalysisPanelProps) {
  return (
    <section className="panel analysis-panel" aria-labelledby="analysis-title">
      <div className="section-header">
        <div>
          <p className="eyebrow">Step 04 · Analysis</p>
          <h2 id="analysis-title">레퍼런스 후킹 · 구조 분석 리포트</h2>
        </div>
        <button className="primary-button" disabled={isBusy} onClick={onAnalyze} type="button">
          {isBusy ? (
            <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
              <span className="spinner-icon">⏳</span> 4. 레퍼런스 분석 진행 중...
            </span>
          ) : (
            "4. Analyze Reference"
          )}
        </button>
      </div>
      <pre className="script-preview">
        {analysisMarkdown ?? "Analysis report will appear here after script analysis."}
      </pre>
    </section>
  );
}
