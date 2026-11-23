import { useState } from "react";
import type { JobRecord } from "../types";

export interface LiveLogEntry {
  readonly id: string;
  readonly time: string;
  readonly level: "info" | "success" | "warn" | "error";
  readonly message: string;
}

interface LiveStatusConsoleProps {
  readonly activeTaskLabel: string | null;
  readonly liveLogs: readonly LiveLogEntry[];
  readonly jobHistory: readonly JobRecord[];
  readonly error: string | null;
  readonly onClearLogs?: () => void;
}

function formatShortTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleTimeString("ko-KR", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}

export function LiveStatusConsole({
  activeTaskLabel,
  liveLogs,
  jobHistory,
  error,
  onClearLogs
}: LiveStatusConsoleProps) {
  const [expanded, setExpanded] = useState(false);

  const combinedLines: LiveLogEntry[] = [
    ...liveLogs,
    ...jobHistory.slice(0, 12).map((job) => ({
      id: `job-${job.job_id}`,
      time: formatShortTime(job.updated_at || job.created_at),
      level:
        job.state === "failed"
          ? ("error" as const)
          : job.state === "succeeded"
          ? ("success" as const)
          : job.state === "running"
          ? ("warn" as const)
          : ("info" as const),
      message: `[${job.job_type}] ${job.label} — ${job.state}${job.error_message ? ` (${job.error_message})` : ""}`
    }))
  ];

  const visibleLines = expanded ? combinedLines.slice(0, 30) : combinedLines.slice(0, 3);
  const statusState = error ? "error" : activeTaskLabel ? "running" : "idle";

  return (
    <section
      className={`live-console live-console--${statusState}`}
      aria-label="실시간 상태 로그 콘솔"
    >
      <div className="live-console-bar">
        <div className="live-console-status">
          <span className={`console-led console-led--${statusState}`} aria-hidden="true" />
          <span className="console-badge">LIVE CONSOLE</span>
          <strong className="console-headline">
            {error
              ? `오류 감지: ${error}`
              : activeTaskLabel
              ? activeTaskLabel
              : combinedLines[0]
              ? combinedLines[0].message
              : "워크스테이션 대기 중 · 실행 버튼을 누르면 실시간 로그가 기록됩니다."}
          </strong>
        </div>

        <div className="live-console-actions">
          <span className="console-count">{combinedLines.length}건</span>
          {liveLogs.length > 0 && onClearLogs ? (
            <button
              type="button"
              className="quiet-button"
              style={{ padding: "3px 8px", fontSize: "11px" }}
              onClick={onClearLogs}
            >
              로그 비우기
            </button>
          ) : null}
          <button
            type="button"
            className="quiet-button"
            style={{ padding: "3px 10px", fontSize: "11px" }}
            onClick={() => setExpanded((prev) => !prev)}
            aria-expanded={expanded}
          >
            {expanded ? "▲ 접기" : "▼ 실시간 로그 펼치기"}
          </button>
        </div>
      </div>

      {(expanded || activeTaskLabel || error) && (
        <div className="live-console-stream" role="log" aria-live="polite">
          {visibleLines.length === 0 ? (
            <div className="console-line console-line--info">
              <span className="console-ts">--:--:--</span>
              <span>기록된 작업 로그가 없습니다.</span>
            </div>
          ) : (
            visibleLines.map((entry) => (
              <div key={entry.id} className={`console-line console-line--${entry.level}`}>
                <span className="console-ts">{entry.time}</span>
                <span className="console-level">{entry.level.toUpperCase()}</span>
                <span className="console-msg">{entry.message}</span>
              </div>
            ))
          )}
        </div>
      )}
    </section>
  );
}
