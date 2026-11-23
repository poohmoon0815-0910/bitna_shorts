import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";

interface TitleOverlayProps {
  title?: string;
}

export const TitleOverlay: React.FC<TitleOverlayProps> = ({ title }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // 제목이 없거나 공백이면 렌더링하지 않음
  if (!title || !title.trim()) {
    return null;
  }

  // 노출 시간: 유튜브 썸네일 자동 추출(보통 1~3초 지점)을 100% 포착하도록 0초 ~ 3.5초로 연장
  const endFrame = Math.round(3.5 * fps);
  if (frame > endFrame) {
    return null;
  }

  // 1. 완전 처음(0초 0프레임)부터 100% 크기와 불투명도로 즉시 표시
  // (스프링 팝업으로 인한 0초 시점 미노출 현상 제거)

  // 2. 퇴장 페이드아웃 및 축소 효과 (2.8초 ~ 3.5초 동안 부드럽게 퇴장)
  const fadeStartFrame = Math.round(2.8 * fps);
  const exitOpacity = interpolate(
    frame,
    [fadeStartFrame, endFrame],
    [1, 0],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }
  );

  const exitScale = interpolate(
    frame,
    [fadeStartFrame, endFrame],
    [1, 0.94],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }
  );

  const currentScale = exitScale;
  const currentOpacity = exitOpacity;

  // 줄바꿈(\n) 처리 + 긴 제목은 쇼츠 가로폭을 넘지 않도록 어절 단위로 자동 줄바꿈
  const rawLines = title.trim().split("\n");
  const lines: string[] = [];
  for (const rawLine of rawLines) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;
    if (trimmed.length <= 12) {
      lines.push(trimmed);
      continue;
    }
    const words = trimmed.split(/\s+/);
    let current = "";
    for (const w of words) {
      const candidate = current ? `${current} ${w}` : w;
      if (current && candidate.length > 13) {
        lines.push(current);
        current = w;
      } else {
        current = candidate;
      }
    }
    if (current) lines.push(current);
  }

  // 줄 길이 및 줄 수에 맞춰 1080px 폭 안에 안전하게 들어가도록 폰트 크기 계산
  const maxLineLength = Math.max(...lines.map((l) => l.length));
  let calculatedFontSize = 128;
  if (maxLineLength >= 17) {
    calculatedFontSize = 66;
  } else if (maxLineLength >= 14) {
    calculatedFontSize = 74;
  } else if (maxLineLength >= 12) {
    calculatedFontSize = 84;
  } else if (maxLineLength >= 10) {
    calculatedFontSize = 96;
  } else if (maxLineLength >= 8) {
    calculatedFontSize = 110;
  }
  if (lines.length >= 4) {
    calculatedFontSize = Math.min(calculatedFontSize, 66);
  } else if (lines.length === 3) {
    calculatedFontSize = Math.min(calculatedFontSize, 78);
  }

  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top: 0,
        bottom: 0,
        display: "flex",
        justifyContent: "center",
        alignItems: "center", // 중앙 기준
        padding: "0 48px 200px 48px", // 좌우 안전 여백 48px 확보 (가용 폭 984px)
        pointerEvents: "none",
        zIndex: 60, // 하단 자막(zIndex: 50)보다 상위
      }}
    >
      <div
        style={{
          transform: `scale(${currentScale})`,
          opacity: currentOpacity,
          width: "100%",
          maxWidth: "984px",
          textAlign: "center",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "10px",
        }}
      >
        {/* 네모박스 없이 글자만 큼직하게 렌더링하되 가로폭 초과 방지 */}
        {lines.map((line, idx) => (
          <div
            key={idx}
            style={{
              width: "100%",
              maxWidth: "100%",
              fontFamily:
                'Pretendard, -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Segoe UI", Roboto, sans-serif',
              fontSize: `${calculatedFontSize}px`,
              fontWeight: 800, // 자막과 동일한 800(ExtraBold)로 통일
              lineHeight: 1.2,
              color: idx === 0 ? "#ffffff" : "#fef08a", // 1줄은 화이트, 2줄 이후는 강조 옐로우
              letterSpacing: "-2px",
              whiteSpace: "normal",
              wordBreak: "keep-all",
              overflowWrap: "break-word",
              // 커진 폰트에 맞춰 볼드 블랙 외곽선 & 입체 그림자
              WebkitTextStroke: "8px #000000",
              paintOrder: "stroke fill",
              textShadow:
                "0 4px 8px rgba(0, 0, 0, 0.9), 0 8px 24px rgba(0, 0, 0, 0.95), 0 0 35px rgba(0, 0, 0, 0.8)",
            }}
          >
            {line}
          </div>
        ))}
      </div>
    </div>
  );
};
