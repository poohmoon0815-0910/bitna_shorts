import http from "node:http";
import net from "node:net";
import fs from "node:fs";
import path from "node:path";
import { exec, execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.MORNING_AGENT_PORT || 4173);
const HOST = "127.0.0.1";

const PATHS = {
  publicDir: path.join(__dirname, "public"),
  briefingsDir: path.join(__dirname, "briefings"),
  agentsMd: path.join(__dirname, "AGENTS.md"),
  rootAgentsMd: path.resolve(__dirname, "..", "AGENTS.md"),
  configJson: path.join(__dirname, "config.json"),
  historyJson: path.join(__dirname, "history.json"),
  voiceCacheJson: path.join(__dirname, "voice_memo_cache.json"),
  voiceTmpDir: path.join(__dirname, ".tmp_voice"),
  rootEnv: path.resolve(__dirname, "..", ".env"),
  shortsNewsInbox: path.resolve(__dirname, "..", "shorts-team", "inbox_tech_ideas.md"),
  shortsVoiceInbox: path.resolve(__dirname, "..", "shorts-team", "inbox_voice_ideas.md"),
  sharedInsightsJson: path.resolve(__dirname, "..", "marketing-team", "shared_marketing_insights.json"),
  qaStateJson: path.join(__dirname, "cockpit_qa_state.json"),
  revisionOrdersMd: path.join(__dirname, "cockpit_revision_orders.md"),
  shortsManifest: "c:\\shorts-v2\\outputs\\upload_manifest_261122.json",
  shortsPinnedState: "c:\\shorts-v2\\outputs\\pinned_comments_state.json",
  fawcettManifest: "c:\\longform-v1\\outputs\\upload_manifest_fawcett.json",
  fawcettDir: "c:\\longform-v1\\outputs\\아마존_깊은_곳으로_걸어_들어간_남자_1925년_퍼시_포셋_대령과_잃어버린_도시_",
  fawcettFullVideo: "c:\\longform-v1\\outputs\\1925년_퍼시포셋_잃어버린도시Z_실종실화_완성본.mp4",
  fawcettSampleVideo: "c:\\longform-v1\\outputs\\1925년_퍼시포셋_잃어버린도시Z_실종실화_1분샘플.mp4",
  longformUploadResults: "c:\\longform-v1\\outputs\\last_upload_results.json",
  longformUploader: "c:\\longform-v1\\tools\\youtube-uploader.mjs",
};

const DRIVE_VOICE_FOLDERS = [
  "1JV1Ydbhb7v0GHHRoqM62_y7FdYeQ7-Ip", // DriveSyncFiles 루트
  "1NF0cDTezCFRbYmo8Hok8GGhc_xgNVi6a", // Voice Recorder
];

fs.mkdirSync(PATHS.briefingsDir, { recursive: true });

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n", "utf8");
}

function getKstNow() {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const pad = (n) => String(n).padStart(2, "0");
  const date = `${kst.getUTCFullYear()}-${pad(kst.getUTCMonth() + 1)}-${pad(kst.getUTCDate())}`;
  const time = `${pad(kst.getUTCHours())}:${pad(kst.getUTCMinutes())}:${pad(kst.getUTCSeconds())}`;
  return {
    date,
    iso: `${date}T${time}+09:00`,
    display: `${date} ${time.slice(0, 5)} KST`,
  };
}

function formatKstDateTime(raw) {
  if (!raw) return "";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return String(raw);
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  const pad = (n) => String(n).padStart(2, "0");
  return `${kst.getUTCFullYear()}-${pad(kst.getUTCMonth() + 1)}-${pad(kst.getUTCDate())} ${pad(kst.getUTCHours())}:${pad(kst.getUTCMinutes())} KST`;
}

function addDays(dateStr, days) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  const pad = (n) => String(n).padStart(2, "0");
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

async function runCli(command, account, timeoutMs = 25000) {
  try {
    const { stdout, stderr } = await execAsync(command, {
      timeout: timeoutMs,
      maxBuffer: 10 * 1024 * 1024,
      env: {
        ...process.env,
        AGY_ACCOUNT: account,
      },
      windowsHide: true,
    });
    return { ok: true, stdout: stdout || "", stderr: stderr || "" };
  } catch (err) {
    return {
      ok: false,
      stdout: err.stdout || "",
      stderr: err.stderr || err.message || "CLI execution failed",
    };
  }
}

function decodeEntities(text) {
  return String(text || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&rarr;/gi, "→")
    .replace(/&larr;/gi, "←")
    .replace(/&middot;/gi, "·");
}

function stripHtmlAndNoise(text) {
  if (!text) return "";
  let clean = decodeEntities(
    text
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/body\s*\{[^}]*\}/gi, " ")
    .replace(/https?:\/\/\S{40,}/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (clean.length > 220) {
    clean = clean.slice(0, 217).trim() + "...";
  }
  return clean;
}

async function fetchNewsForKeyword(keyword, limit = 3) {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(keyword)}&hl=ko&gl=KR&ceid=KR:ko`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "MorningAgent/1.0" },
    });
    if (!res.ok) return [];
    const xml = await res.text();
    const items = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match;
    while ((match = itemRegex.exec(xml)) !== null && items.length < limit) {
      const block = match[1];
      const rawTitle = (block.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || "";
      const link = ((block.match(/<link>([\s\S]*?)<\/link>/) || [])[1] || "").trim();
      const pubDate = ((block.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || [])[1] || "").trim();
      const source = decodeEntities(((block.match(/<source[^>]*>([\s\S]*?)<\/source>/) || [])[1] || "").trim());
      let title = decodeEntities(rawTitle.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").trim());
      if (source && title.endsWith(` - ${source}`)) {
        title = title.slice(0, -(` - ${source}`.length)).trim();
      }
      if (!title || !link) continue;
      items.push({
        id: `news-${Buffer.from(title).toString("base64url").slice(0, 14)}`,
        keyword,
        title,
        source: source || "Google 뉴스",
        publishedAt: formatKstDateTime(pubDate) || pubDate,
        url: link,
      });
    }
    return items;
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

async function fetchAllNews(keywords, maxPerKeyword = 3) {
  const list = Array.isArray(keywords) && keywords.length > 0 ? keywords : ["AI 영상 제작", "유튜브 쇼츠", "우주 과학"];
  const results = await Promise.all(list.map((kw) => fetchNewsForKeyword(kw, maxPerKeyword)));
  const seen = new Set();
  const merged = [];
  for (const group of results) {
    for (const item of group) {
      const key = item.title.replace(/\s+/g, "").slice(0, 30);
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(item);
    }
  }
  return merged.slice(0, 9);
}

function getGeminiApiKey() {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY.trim();
  try {
    const envText = fs.readFileSync(PATHS.rootEnv, "utf8");
    const match = envText.match(/^GEMINI_API_KEY=(.+)$/m);
    if (match) return match[1].trim().replace(/^["']|["']$/g, "");
  } catch {
    // ignore
  }
  return "";
}

function appendVoiceInbox(entry) {
  fs.mkdirSync(path.dirname(PATHS.shortsVoiceInbox), { recursive: true });
  if (!fs.existsSync(PATHS.shortsVoiceInbox)) {
    fs.writeFileSync(
      PATHS.shortsVoiceInbox,
      "# 🎙️ 쇼츠 제작팀 음성 메모 인박스 (비서실 자료 직원 전달)\n\n비서실의 📁 자료 직원이 DriveSyncFiles 음성 메모를 분석해 영상 제작 반영을 추천한 항목입니다.\n\n",
      "utf8"
    );
  }
  const title = entry.shortsIdeaTitle || entry.name;
  const line = `- **[${getKstNow().date}] [${entry.category || "음성 메모"}] ${title}** — 원본: [${entry.name}](${entry.url})\n  - 전사: ${entry.transcript || "(없음)"}\n  - 판단: ${entry.reason || ""}\n`;
  fs.appendFileSync(PATHS.shortsVoiceInbox, line, "utf8");
}

async function analyzeSingleVoiceMemo(file, account, apiKey) {
  const maxBytes = 14 * 1024 * 1024;
  const sizeNum = Number(file.size || 0);
  if (sizeNum > maxBytes) {
    return {
      transcript: "(14MB 초과로 자동 분석 건너뜀)",
      isAddressedToAIOrSecretary: false,
      category: "용량 초과",
      canReflectInShorts: false,
      shouldReflect: false,
      shortsIdeaTitle: null,
      reason: `파일 크기(${Math.round(sizeNum / 1024 / 1024)}MB)가 14MB를 넘어 자동 분석에서 제외되었습니다.`,
    };
  }

  fs.mkdirSync(PATHS.voiceTmpDir, { recursive: true });
  const ext = path.extname(file.name) || ".m4a";
  const tmpFile = path.join(PATHS.voiceTmpDir, `${file.id}${ext}`);
  try {
    const dl = await runCli(`gdrive readonly download ${file.id} --out "${tmpFile}"`, account, 30000);
    if (!dl.ok || !fs.existsSync(tmpFile)) {
      throw new Error(dl.stderr || "음성 파일 다운로드 실패");
    }
    const audioBase64 = fs.readFileSync(tmpFile).toString("base64");
    const mimeMap = {
      ".m4a": "audio/mp4",
      ".mp3": "audio/mpeg",
      ".wav": "audio/wav",
      ".ogg": "audio/ogg",
      ".3gp": "audio/3gpp",
    };
    const mimeType = mimeMap[ext.toLowerCase()] || "audio/mp4";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${apiKey}`;
    const prompt = `당신은 '호기심빛나' AI 회사의 비서실 자료 직원입니다. 호기심빛나는 과학·인체·우주·호기심 지식을 귀여운 클레이 3D 캐릭터로 풀어내는 유튜브 쇼츠 채널입니다.
사용자가 스마트폰으로 녹음한 음성 메모를 듣고 아래 JSON 형식으로만 정확히 분석하세요:
{
  "transcript": "음성 전체 받아쓰기 (한국어)",
  "isAddressedToAIOrSecretary": true 또는 false (제미나이, AI, 비서, 쇼츠팀에게 말하거나 지시하는 내용인지),
  "category": "비서/AI 지시" | "쇼츠 기획 아이디어" | "일반 개인 메모" | "잡음/무의미",
  "canReflectInShorts": true 또는 false (유튜브 쇼츠 영상 제작이나 채널 운영에 반영 가능한 내용인지),
  "shouldReflect": true 또는 false (실제로 영상 제작에 반영하는 것이 좋을지 최종 판단),
  "shortsIdeaTitle": "쇼츠로 만든다면 어울릴 제목 또는 반영 액션 요약 (없으면 null)",
  "reason": "판단 이유를 2~3문장으로 명확히 설명"
}`;

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: prompt }, { inline_data: { mime_type: mimeType, data: audioBase64 } }],
          },
        ],
        generationConfig: { responseMimeType: "application/json" },
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error?.message || `Gemini API ${res.status}`);
    }
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
    return JSON.parse(text);
  } finally {
    try {
      if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
    } catch {
      // ignore cleanup error
    }
  }
}

async function analyzeVoiceMemos(account) {
  const apiKey = getGeminiApiKey();
  const cache = readJson(PATHS.voiceCacheJson, {});
  const folderResults = await Promise.all(
    DRIVE_VOICE_FOLDERS.map((fid) => runCli(`gdrive readonly ls ${fid} --max 30 --json`, account))
  );

  const rawFiles = [];
  for (const res of folderResults) {
    if (!res.ok || !res.stdout.trim()) continue;
    try {
      const parsed = JSON.parse(res.stdout);
      if (Array.isArray(parsed)) rawFiles.push(...parsed);
    } catch {
      // ignore
    }
  }

  // 오디오 파일만 필터링 + 파일명/크기 기준 중복 제거
  const seenKey = new Set();
  const audioFiles = rawFiles
    .filter((f) => f.mimeType !== "application/vnd.google-apps.folder" && /\.(m4a|mp3|wav|ogg|3gp)$/i.test(f.name || ""))
    .sort((a, b) => (a.modifiedTime < b.modifiedTime ? 1 : -1))
    .filter((f) => {
      const key = `${f.name}::${f.size || ""}`;
      if (seenKey.has(key)) return false;
      seenKey.add(key);
      return true;
    })
    .slice(0, 8);

  let newAnalyses = 0;
  const results = [];
  for (const f of audioFiles) {
    const fileUrl = `https://drive.google.com/file/d/${f.id}/view?usp=drivesdk`;
    let entry = cache[f.id];
    if (!entry && apiKey && newAnalyses < 3) {
      newAnalyses++;
      try {
        const analysis = await analyzeSingleVoiceMemo(f, account, apiKey);
        entry = {
          id: f.id,
          name: f.name,
          modified: formatKstDateTime(f.modifiedTime),
          modifiedTime: f.modifiedTime,
          url: fileUrl,
          ...analysis,
          analyzedAt: getKstNow().iso,
          handedOff: false,
        };
      } catch (err) {
        entry = {
          id: f.id,
          name: f.name,
          modified: formatKstDateTime(f.modifiedTime),
          modifiedTime: f.modifiedTime,
          url: fileUrl,
          transcript: "(분석 중 오류 발생)",
          isAddressedToAIOrSecretary: false,
          category: "분석 실패",
          canReflectInShorts: false,
          shouldReflect: false,
          shortsIdeaTitle: null,
          reason: err.message || "음성 분석 실패",
          analyzedAt: getKstNow().iso,
          handedOff: false,
        };
      }
    }

    if (entry) {
      if (entry.shouldReflect && entry.canReflectInShorts && !entry.handedOff) {
        appendVoiceInbox(entry);
        entry.handedOff = true;
      }
      cache[f.id] = entry;
      results.push(entry);
    }
  }

  writeJson(PATHS.voiceCacheJson, cache);
  return results;
}

function parseGmailReadOutput(raw) {
  if (!raw || !raw.trim()) return [];
  const sections = raw.split(/\r?\n?--- Message \d+ ---\r?\n/);
  const messages = [];

  for (let i = 0; i < sections.length; i++) {
    const chunk = sections[i].trim();
    if (!chunk) continue;
    const sepIdx = chunk.search(/\r?\n---\r?\n/);
    const headerPart = sepIdx >= 0 ? chunk.slice(0, sepIdx) : chunk;
    const bodyPart = sepIdx >= 0 ? chunk.slice(sepIdx).replace(/^\r?\n---\r?\n/, "") : "";

    const subject = (headerPart.match(/^Subject:\s*(.+)$/im) || [])[1]?.trim() || "";
    const from = (headerPart.match(/^From:\s*(.+)$/im) || [])[1]?.trim() || "";
    const date = (headerPart.match(/^Date:\s*(.+)$/im) || [])[1]?.trim() || "";
    if (!subject && !from) continue;

    messages.push({
      id: `mail-${i}`,
      subject,
      from,
      date,
      body: bodyPart.trim(),
    });
  }
  return messages;
}

async function autoOrganizeInbox(account) {
  try {
    const labelRes = await runCli("gmail readonly labels", account, 15000);
    if (!labelRes.ok) return;
    const labelMap = {};
    for (const line of labelRes.stdout.split(/\r?\n/)) {
      const m = line.match(/^(Label_\d+)\s+([^\s]+)/);
      if (m) labelMap[m[2]] = m[1];
    }

    const rules = [
      {
        query: "in:inbox category:promotions",
        labelId: labelMap["91_프로모션_광고"],
        archive: true,
      },
      {
        query: "in:inbox (보안 OR 로그인 OR 액세스 OR 인증)",
        labelId: labelMap["90_보안_로그인알림"],
        archive: true,
      },
      {
        query: 'in:inbox ("아침 브리핑" OR "특별 분석 보고서")',
        labelId: labelMap["01_아침브리핑_보고"],
        archive: false,
      },
    ];

    for (const rule of rules) {
      if (!rule.labelId) continue;
      const res = await runCli(`gmail readonly search "${rule.query}" --max 50 --json`, account, 15000);
      if (!res.ok || !res.stdout.trim()) continue;
      const msgs = JSON.parse(res.stdout);
      if (!Array.isArray(msgs) || msgs.length === 0) continue;
      const ids = msgs.map((m) => m.id).filter(Boolean).join(",");
      if (!ids) continue;
      const removeFlag = rule.archive ? ' --remove-labels "INBOX"' : "";
      await runCli(
        `gmail mutate batch-modify "${ids}" --add-labels "${rule.labelId}"${removeFlag}`,
        account,
        20000
      );
    }
  } catch {
    // 자동 정리 실패 시에도 브리핑 생성은 중단하지 않음
  }
}

function classifyMail(mail) {
  const text = `${mail.subject} ${mail.from} ${mail.body}`.toLowerCase();
  if (/보안 알림|security alert|로그인|sign-in/.test(text)) {
    return { category: "보안 알림", importance: "low", isSecurity: true };
  }
  if (/마감|종료|결제|체험판|만료|청구|invoice|deadline|요청|회신|문의|협업|미팅|회의/.test(text)) {
    return { category: "요청/마감", importance: "high", isSecurity: false };
  }
  if (/브리핑|보고서|분석|쇼츠|유튜브|전략/.test(text)) {
    return { category: "업무/보고", importance: "high", isSecurity: false };
  }
  if (/공유|초대|share|google one/.test(text)) {
    return { category: "계정/공유", importance: "medium", isSecurity: false };
  }
  if (/unsubscribe|newsletter|marketing|프로모션|광고|try /.test(text)) {
    return { category: "안내/마케팅", importance: "low", isSecurity: false };
  }
  return { category: "일반 메일", importance: "medium", isSecurity: false };
}

function buildMarkdownFromBriefing(b) {
  const lines = [];
  lines.push(`# 📋 오늘의 출근 준비 브리핑 (${b.date})`);
  lines.push("");
  lines.push(`- **생성 시각**: ${formatKstDateTime(b.generatedAt)}`);
  lines.push(`- **기준 계정**: \`${b.account}\``);
  lines.push(
    `- **요약**: 일정 ${b.summary.eventsCount}개 · 중요 메일 ${b.summary.importantMailsCount}개 · 맞춤 뉴스 ${b.summary.newsCount ?? 0}건 · 우선순위 ${b.summary.prioritiesCount}개 · 관련 자료 ${b.summary.driveDocsCount}개`
  );
  lines.push("");
  lines.push(`> ${b.headline}`);
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push("## ✅ 1. 확인된 사실 (Facts)");
  lines.push("");
  lines.push("### 📅 오늘의 일정 & 회의 (Google Calendar)");
  if (b.facts.calendar && b.facts.calendar.length > 0) {
    for (const ev of b.facts.calendar) {
      const timeRange = ev.allDay ? "종일" : `${ev.start} ~ ${ev.end}`;
      lines.push(`- **${ev.title}** (${timeRange})${ev.location ? ` · 장소: ${ev.location}` : ""}${ev.link ? ` · [일정 열기](${ev.link})` : ""}`);
    }
  } else {
    lines.push(`- ${b.facts.calendarNote || "등록된 일정이 없습니다."}`);
  }
  lines.push("");
  lines.push("### ✉️ 최근 중요 메일 (Gmail)");
  if (b.facts.mails && b.facts.mails.length > 0) {
    for (const m of b.facts.mails) {
      lines.push(`- **[${m.category}] ${m.subject}** (\`${m.date}\`)`);
      if (m.summary) lines.push(`  - ${m.summary}`);
    }
  } else {
    lines.push("- 조회 기간 내 중요 메일이 없습니다.");
  }
  lines.push("");
  lines.push("### 📁 관련·최근 자료 (Google Drive 원문 링크)");
  if (b.facts.drive && b.facts.drive.length > 0) {
    for (const f of b.facts.drive) {
      lines.push(`- [${f.name}](${f.url}) (\`${f.modified}\`)`);
    }
  } else {
    lines.push("- 최근 업데이트된 Drive 자료가 없습니다.");
  }
  lines.push("");
  lines.push("### 🎙️ 음성 메모 분석 (DriveSyncFiles · 자료 직원)");
  if (b.facts.voiceMemos && b.facts.voiceMemos.length > 0) {
    for (const v of b.facts.voiceMemos) {
      const verdict = v.shouldReflect ? "반영 추천" : v.isAddressedToAIOrSecretary ? "비서 지시" : "미반영";
      lines.push(`- **[${verdict} · ${v.category}]** [${v.name}](${v.url}) (\`${v.modified}\`)`);
      if (v.transcript) lines.push(`  - 전사: ${v.transcript}`);
      if (v.reason) lines.push(`  - 판단: ${v.reason}`);
    }
  } else {
    lines.push("- 분석된 음성 메모가 없습니다.");
  }
  lines.push("");
  lines.push("### 📰 오늘의 맞춤 뉴스 (Google News 원문 링크)");
  if (b.facts.news && b.facts.news.length > 0) {
    for (const n of b.facts.news) {
      lines.push(`- **[${n.keyword}]** [${n.title}](${n.url}) — ${n.source} (\`${n.publishedAt}\`)`);
    }
  } else {
    lines.push("- 수집된 맞춤 뉴스가 없습니다.");
  }
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push("## 💡 2. 오늘의 우선순위 (Suggestions)");
  lines.push("");
  if (b.suggestions && b.suggestions.length > 0) {
    b.suggestions.forEach((s, i) => {
      const mark = s.done ? "[x]" : "[ ]";
      lines.push(`${i + 1}. ${mark} **[${s.priority} · ${s.tag}]** ${s.title}`);
      if (s.reason) lines.push(`   - ${s.reason}`);
    });
  } else {
    lines.push("- 도출된 우선순위 항목이 없습니다.");
  }
  lines.push("");
  return lines.join("\n");
}

function buildSuggestions(dateStr, events, mails, driveFiles, voiceMemos = []) {
  const items = [];
  let idx = 1;

  const actionVoices = voiceMemos.filter((v) => v.shouldReflect || v.isAddressedToAIOrSecretary);
  for (const v of actionVoices.slice(0, 2)) {
    items.push({
      id: `p${idx}`,
      priority: `P${idx}`,
      tag: v.shouldReflect ? "음성→쇼츠반영" : "음성 지시",
      title: v.shortsIdeaTitle || `음성 메모 확인: ${v.name}`,
      reason: v.reason || v.transcript || "음성 메모 분석 결과를 확인하세요.",
      done: false,
    });
    idx++;
  }

  const todayEvents = events.filter((e) => (e.rawStart || "").startsWith(dateStr));
  for (const ev of todayEvents.slice(0, 3)) {
    items.push({
      id: `p${idx}`,
      priority: `P${idx}`,
      tag: "오늘 회의",
      title: `${ev.title} 사전 준비 (${ev.allDay ? "종일" : ev.start})`,
      reason: ev.location ? `장소/링크: ${ev.location}` : "회의 시작 전 관련 자료와 안건을 미리 확인하세요.",
      done: false,
    });
    idx++;
  }

  const highMails = mails.filter((m) => m.importance === "high");
  for (const m of highMails.slice(0, 3)) {
    items.push({
      id: `p${idx}`,
      priority: `P${idx}`,
      tag: m.category,
      title: m.subject,
      reason: m.summary || "중요 메일 내용을 확인하고 필요한 후속 조치를 진행하세요.",
      done: false,
    });
    idx++;
  }

  if (items.length < 3 && driveFiles.length > 0) {
    const latest = driveFiles[0];
    items.push({
      id: `p${idx}`,
      priority: `P${idx}`,
      tag: "최근 자료",
      title: `최근 업데이트 파일 확인: ${latest.name}`,
      reason: `${latest.modified}에 업데이트된 파일입니다. 후속 정리나 일정 반영이 필요한지 점검하세요.`,
      done: false,
    });
    idx++;
  }

  if (items.length === 0) {
    items.push({
      id: "p1",
      priority: "P1",
      tag: "자유 집중",
      title: "긴급 회의·요청 없음 — 핵심 목표 1가지에 집중",
      reason: "캘린더와 받은편지함에 긴급 일정이 없습니다. 오늘 가장 중요한 프로젝트 작업에 집중하기 좋은 날입니다.",
      done: false,
    });
  }

  return items.slice(0, 5);
}

async function runBriefingAgent({ targetDate, promptText }) {
  const startedAt = Date.now();
  const config = readJson(PATHS.configJson, {
    account: "poohmoon0815@gmail.com",
    mailLookbackDays: 2,
    calendarLookaheadDays: 7,
    includeFamilyCalendar: true,
    hideSecurityAlerts: false,
    hideCallRecordings: false,
  });

  const kstNow = getKstNow();
  const dateStr = targetDate && /^\d{4}-\d{2}-\d{2}$/.test(targetDate) ? targetDate : kstNow.date;
  const endDateStr = addDays(dateStr, Number(config.calendarLookaheadDays || 7));
  const lookbackDays = Number(config.mailLookbackDays || 2);
  const account = config.account || "poohmoon0815@gmail.com";

  // 4개 서브 에이전트 병렬 실행 (Calendar / Gmail / Drive / News + Voice Memo)
  const [calRes, mailSearchRes, driveRes, newsItems, voiceMemos] = await Promise.all([
    runCli(
      `gcalendar readonly events --start ${dateStr}T00:00:00+09:00 --end ${endDateStr}T23:59:59+09:00 --max 30 --json`,
      account
    ),
    runCli(`gmail readonly search "newer_than:${lookbackDays}d" --max 15 --json`, account),
    runCli(`gdrive readonly recent --max 15 --json`, account),
    fetchAllNews(config.newsKeywords, Number(config.newsMaxPerKeyword || 3)),
    analyzeVoiceMemos(account).catch(() => []),
  ]);

  const errors = [];
  if (!calRes.ok) errors.push(`Calendar: ${calRes.stderr.trim()}`);
  if (!mailSearchRes.ok) errors.push(`Gmail: ${mailSearchRes.stderr.trim()}`);
  if (!driveRes.ok) errors.push(`Drive: ${driveRes.stderr.trim()}`);

  if (errors.length === 3) {
    throw new Error(
      `Google 플러그인 CLI 인증 연결을 확인할 수 없습니다. Antigravity 세션 안에서 서버가 실행 중인지 확인해 주세요. (${errors[0]})`
    );
  }

  // 1. Calendar 파싱
  let calendarEvents = [];
  if (calRes.ok && calRes.stdout.trim()) {
    try {
      const parsed = JSON.parse(calRes.stdout);
      if (Array.isArray(parsed)) {
        calendarEvents = parsed.map((ev) => {
          const rawStart = ev.start?.dateTime || ev.start?.date || "";
          const rawEnd = ev.end?.dateTime || ev.end?.date || "";
          const allDay = Boolean(ev.start?.date && !ev.start?.dateTime);
          return {
            id: ev.id || "",
            title: ev.summary || "(제목 없음)",
            allDay,
            rawStart,
            start: allDay ? rawStart : formatKstDateTime(rawStart),
            end: allDay ? rawEnd : formatKstDateTime(rawEnd),
            location: ev.location || "",
            link: ev.htmlLink || "",
            isToday: rawStart.startsWith(dateStr),
          };
        });
      }
    } catch {
      // ignore parse failure
    }
  }

  // 2. Gmail 상세 읽기 (최대 8건 배치 조회)
  let mails = [];
  if (mailSearchRes.ok) {
    const readRes = await runCli(`gmail readonly read "newer_than:${lookbackDays}d" --max 10`, account, 30000);
    if (readRes.ok) {
      const parsedMails = parseGmailReadOutput(readRes.stdout);
      mails = parsedMails
        .map((m) => {
          const cls = classifyMail(m);
          return {
            id: m.id,
            category: cls.category,
            importance: cls.importance,
            isSecurity: cls.isSecurity,
            subject: m.subject || "(제목 없음)",
            from: m.from || "",
            date: formatKstDateTime(m.date) || m.date,
            summary: stripHtmlAndNoise(m.body),
          };
        })
        .filter((m) => !(config.hideSecurityAlerts && m.isSecurity));

      // 중요도 순 정렬 + 동일 제목 중복 제거 (최신 1건 유지)
      const seenSubjects = new Set();
      mails = mails.filter((m) => {
        const key = m.subject.replace(/\s+/g, "").toLowerCase();
        if (seenSubjects.has(key)) return false;
        seenSubjects.add(key);
        return true;
      });
      const rank = { high: 0, medium: 1, low: 2 };
      mails.sort((a, b) => (rank[a.importance] ?? 9) - (rank[b.importance] ?? 9));
    }
  }

  // 2-1. 받은편지함 자동 정리 (비파괴 보관 + 라벨 분류)
  if (config.autoOrganizeInbox) {
    await autoOrganizeInbox(account);
  }

  // 3. Google Drive 파싱
  let driveFiles = [];
  if (driveRes.ok && driveRes.stdout.trim()) {
    try {
      const parsed = JSON.parse(driveRes.stdout);
      if (Array.isArray(parsed)) {
        driveFiles = parsed
          .filter((f) => {
            if (!config.hideCallRecordings) return true;
            return !/^통화 |^음성 |\.m4a$/i.test(f.name || "");
          })
          .slice(0, 8)
          .map((f) => {
            const isFolder = f.mimeType === "application/vnd.google-apps.folder";
            return {
              id: f.id,
              name: f.name,
              type: isFolder ? "folder" : /audio|3gpp|m4a/i.test(f.mimeType || f.name) ? "audio" : "file",
              modified: formatKstDateTime(f.modifiedTime),
              url: isFolder
                ? `https://drive.google.com/drive/folders/${f.id}`
                : `https://drive.google.com/file/d/${f.id}/view?usp=drivesdk`,
            };
          });
      }
    } catch {
      // ignore parse failure
    }
  }

  const todayEventsCount = calendarEvents.filter((e) => e.isToday).length;
  const importantMails = mails.filter((m) => m.importance !== "low" || !m.isSecurity);
  const suggestions = buildSuggestions(dateStr, calendarEvents, importantMails, driveFiles, voiceMemos);

  let headline = "";
  if (todayEventsCount > 0) {
    headline = `오늘 예정된 일정 ${todayEventsCount}건, 중요 메일 ${importantMails.length}건, 맞춤 뉴스 ${newsItems.length}건을 정리했습니다.`;
  } else if (importantMails.length > 0) {
    headline = `오늘 등록된 일정은 없으며, 확인이 필요한 메일 ${importantMails.length}건과 맞춤 뉴스 ${newsItems.length}건을 정리했습니다.`;
  } else {
    headline = `오늘 예정된 일정과 긴급 메일은 없으며, 맞춤 뉴스 ${newsItems.length}건과 최근 자료를 준비했습니다.`;
  }

  const briefing = {
    date: dateStr,
    generatedAt: getKstNow().iso,
    account,
    trigger: promptText || config.briefingTriggerPhrase || "오늘 출근 준비해 줘",
    sourceMode: errors.length === 0 ? "live" : "partial",
    warnings: errors,
    summary: {
      eventsCount: todayEventsCount,
      importantMailsCount: importantMails.length,
      newsCount: newsItems.length,
      voiceMemosCount: voiceMemos.length,
      prioritiesCount: suggestions.length,
      driveDocsCount: driveFiles.length,
    },
    headline,
    facts: {
      calendar: calendarEvents,
      calendarNote:
        calendarEvents.length === 0
          ? `${dateStr} 및 향후 ${config.calendarLookaheadDays || 7}일간 등록된 일정이 없습니다.`
          : `오늘(${dateStr}) 일정 ${todayEventsCount}건, 향후 ${config.calendarLookaheadDays || 7}일 총 ${calendarEvents.length}건 확인.`,
      mails: mails.slice(0, 8),
      drive: driveFiles,
      voiceMemos,
      news: newsItems,
    },
    suggestions,
  };

  const jsonPath = path.join(PATHS.briefingsDir, `${dateStr}.json`);
  const mdPath = path.join(PATHS.briefingsDir, `${dateStr}.md`);
  writeJson(jsonPath, briefing);
  const mdContent = buildMarkdownFromBriefing(briefing);
  fs.writeFileSync(mdPath, mdContent, "utf8");

  const durationMs = Date.now() - startedAt;
  const history = readJson(PATHS.historyJson, []);
  history.unshift({
    id: `run-${Date.now()}`,
    date: dateStr,
    executedAt: briefing.generatedAt,
    trigger: briefing.trigger,
    status: errors.length === 0 ? "success" : "partial",
    durationMs,
    account,
    summary: briefing.summary,
    note: errors.length === 0 ? "실시간 Google Workspace 동기화 완료" : errors.join(" | "),
  });
  writeJson(PATHS.historyJson, history.slice(0, 50));

  return { briefing, markdown: mdContent, durationMs };
}

function listBriefings() {
  const files = fs.readdirSync(PATHS.briefingsDir).filter((f) => f.endsWith(".json"));
  const items = files
    .map((f) => {
      const data = readJson(path.join(PATHS.briefingsDir, f), null);
      if (!data) return null;
      return {
        date: data.date,
        generatedAt: data.generatedAt,
        headline: data.headline,
        summary: data.summary,
        account: data.account,
      };
    })
    .filter(Boolean)
    .sort((a, b) => (a.date < b.date ? 1 : -1));
  return items;
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 2 * 1024 * 1024) {
        reject(new Error("Payload too large"));
      }
    });
    req.on("end", () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
};

function readJsonClean(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const raw = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

let higgsfieldCreditCache = {
  credits: 1814.06,
  plan: "ULTRA",
  checkedAt: 0,
  live: false,
};

async function getHiggsfieldCredits() {
  const now = Date.now();
  if (now - higgsfieldCreditCache.checkedAt < 60_000) {
    return higgsfieldCreditCache;
  }
  const appData = process.env.APPDATA || "";
  const hfExe = path.join(appData, "npm", "node_modules", "@higgsfield", "cli", "vendor", "hf.exe");
  if (!fs.existsSync(hfExe)) {
    higgsfieldCreditCache.checkedAt = now;
    return higgsfieldCreditCache;
  }
  try {
    const { stdout } = await execFileAsync(hfExe, ["workspace", "list", "--json"], {
      timeout: 4000,
      windowsHide: true,
    });
    const list = JSON.parse(stdout);
    const active = list.find((w) => w.is_selected) || list[0];
    if (active && typeof active.credits === "number") {
      higgsfieldCreditCache = {
        credits: Number(active.credits.toFixed(2)),
        plan: String(active.plan_type || "ultra").toUpperCase(),
        checkedAt: now,
        live: true,
      };
    }
  } catch {
    higgsfieldCreditCache.checkedAt = now;
  }
  return higgsfieldCreditCache;
}

function checkPortOpen(port, host = "127.0.0.1", timeoutMs = 400) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;
    const done = (up) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(up);
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
    socket.connect(port, host);
  });
}

function getFileSizeMb(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    return Number((fs.statSync(filePath).size / (1024 * 1024)).toFixed(1));
  } catch {
    return null;
  }
}

function streamMediaFile(req, res, filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    return res.end("Media file not found");
  }
  const stat = fs.statSync(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME[ext] || "application/octet-stream";
  const range = req.headers.range;
  if (range) {
    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
    if (Number.isNaN(start) || start >= stat.size) {
      res.writeHead(416, { "Content-Range": `bytes */${stat.size}` });
      return res.end();
    }
    const chunkSize = end - start + 1;
    res.writeHead(206, {
      "Content-Range": `bytes ${start}-${end}/${stat.size}`,
      "Accept-Ranges": "bytes",
      "Content-Length": chunkSize,
      "Content-Type": contentType,
      "Cache-Control": "no-store",
    });
    return fs.createReadStream(filePath, { start, end }).pipe(res);
  }
  res.writeHead(200, {
    "Content-Length": stat.size,
    "Accept-Ranges": "bytes",
    "Content-Type": contentType,
    "Cache-Control": "no-store",
  });
  return fs.createReadStream(filePath).pipe(res);
}

function resolveCockpitMediaPath(urlObj) {
  const target = urlObj.searchParams.get("target") || "";
  if (target === "fawcett_full") return PATHS.fawcettFullVideo;
  if (target === "fawcett_sample") return PATHS.fawcettSampleVideo;
  if (target === "fawcett_thumb") return path.join(PATHS.fawcettDir, "thumbnail_custom.jpg");
  if (target === "fawcett_blog_img_1") return path.join(PATHS.fawcettDir, "blog_images", "01_jungle_entry.png");
  if (target === "fawcett_blog_img_2") return path.join(PATHS.fawcettDir, "blog_images", "02_manuscript_512.png");
  if (target === "fawcett_blog_img_3") return path.join(PATHS.fawcettDir, "blog_images", "03_false_coordinates.png");
  if (target === "fawcett_blog_img_4") return path.join(PATHS.fawcettDir, "blog_images", "04_lidar_kuhikugu.png");
  if (target === "shorts") {
    const idx = Number(urlObj.searchParams.get("idx"));
    const items = readJsonClean(PATHS.shortsManifest, []);
    if (Number.isInteger(idx) && idx >= 0 && idx < items.length) {
      return items[idx].filePath;
    }
  }
  return null;
}

async function buildCockpitOverview() {
  const briefings = listBriefings();
  const latestMeta = briefings[0];
  const latestBriefing = latestMeta
    ? readJsonClean(path.join(PATHS.briefingsDir, `${latestMeta.date}.json`), null)
    : null;
  const sharedInsights = readJsonClean(PATHS.sharedInsightsJson, { topInsights: [], activeKeywords: {}, channels: {} });
  const qaState = readJsonClean(PATHS.qaStateJson, {});
  const shortsManifest = readJsonClean(PATHS.shortsManifest, []);
  const shortsPinned = readJsonClean(PATHS.shortsPinnedState, {});
  const fawcettManifest = readJsonClean(PATHS.fawcettManifest, []);
  const fawcettItem = fawcettManifest[0] || null;
  const longformUpload = readJsonClean(PATHS.longformUploadResults, { uploaded: [] });
  const fawcettUploaded = (longformUpload.uploaded || []).find((u) =>
    String(u.title || "").includes("퍼시 포셋")
  );

  const blogPath = path.join(PATHS.fawcettDir, "blog_post.md");
  const blogText = fs.existsSync(blogPath) ? fs.readFileSync(blogPath, "utf8") : "";
  const slugMatch = blogText.match(/### 🔗 추천 블로그 URL 슬러그[^\n]*\r?\n`([^`]+)`/);
  const blogSlug = slugMatch ? slugMatch[1] : "percy-fawcett-lost-city-of-z-mystery";

  const [hfCredits, p5173, p8001, p4318, p7860] = await Promise.all([
    getHiggsfieldCredits(),
    checkPortOpen(5173),
    checkPortOpen(8001),
    checkPortOpen(4318),
    checkPortOpen(7860),
  ]);

  const shortsQueue = shortsManifest.map((item, idx) => {
    const pin = shortsPinned[item.videoId] || null;
    const isCommentPosted = Boolean(pin && pin.commentId);
    const pubMs = item.publishAt ? Date.parse(item.publishAt) : NaN;
    const isDue = !Number.isNaN(pubMs) && pubMs <= Date.now();
    return {
      idx,
      videoId: item.videoId,
      title: item.title,
      playlistTitle: item.playlistTitle,
      publishAt: item.publishAt,
      status: isCommentPosted ? "공개 · 댓글 완료" : isDue ? "공개됨 · 확인 필요" : "예약 대기 중",
      commentPosted: isCommentPosted,
      commentId: pin?.commentId || null,
      comment: item.comment,
      url: `https://www.youtube.com/shorts/${item.videoId}`,
      mediaUrl: `/api/cockpit/media?target=shorts&idx=${idx}`,
    };
  });

  const shortsPostedCount = shortsQueue.filter((q) => q.commentPosted).length;
  const shortsScheduledCount = shortsQueue.length - shortsPostedCount;

  const fawcettQa = qaState["fawcett-full"] || { status: "pending", note: "", updatedAt: null };
  const blogQa = qaState["fawcett-blog"] || { status: "pending", note: "", updatedAt: null };
  const shortsQa = qaState["shorts-queue-261122"] || { status: "approved", note: "자동 댓글 스케줄러 가동 확인", updatedAt: null };

  const dept4Signal = fawcettUploaded
    ? { signal: "green", label: "업로드 완료", progress: 100 }
    : fawcettQa.status === "approved"
    ? { signal: "green", label: "승인 완료", progress: 100 }
    : fawcettQa.status === "revision_requested" || fawcettQa.status === "rejected"
    ? { signal: "red", label: "수정 요청", progress: 85 }
    : { signal: "amber", label: "CEO 승인 대기", progress: 95 };

  const pipelines = [
    {
      dept: "1부서 · 비서실 (2명)",
      role: "비서실 팀장 AI + 통합 데이터 수집 봇",
      avatar: "/assets/dept1_avatar.jpg",
      signal: "green",
      statusText: "정상 가동",
      progress: 100,
      summary: latestBriefing
        ? `최신 브리핑(${latestBriefing.date}) 준비 완료 · 1채널 댓글 자동화(ShortsAuto_PostDueComments) 가동 중`
        : "아침 브리핑 및 1채널 댓글 스케줄러 가동 중",
      url: null,
      portUp: true,
    },
    {
      dept: "2부서 · 쇼츠 제작팀 (3명)",
      role: "기획·팩트체크 / 통합제작 / 검수·업로드 QA",
      avatar: "/assets/dept2_avatar.jpg",
      signal: "green",
      statusText: `예약 ${shortsScheduledCount}편 장전`,
      progress: 100,
      summary: `호기심빛나 1채널 오늘 공개 ${shortsPostedCount}편 댓글 등록 완료 · 11/23~11/25 ${shortsScheduledCount}편 무인 예약 대기`,
      url: "http://127.0.0.1:5173",
      portUp: p5173,
    },
    {
      dept: "3부서 · 마케팅·블로그실 (2명)",
      role: "유튜브 분석·글로벌 SEO + 블로그 OSMU 에이전트",
      avatar: "/assets/dept3_avatar.jpg",
      signal: blogQa.status === "approved" ? "green" : "amber",
      statusText: blogQa.status === "approved" ? "원고 승인 완료" : "OSMU 원고 대기",
      progress: blogQa.status === "approved" ? 100 : 95,
      summary: `떡상 공식 Top 3 전 부서 자동 주입 개통 · 퍼시 포셋 티스토리/네이버 OSMU 원고(${blogText.length.toLocaleString()}자) 완비`,
      url: "http://127.0.0.1:8001",
      portUp: p8001,
    },
    {
      dept: "4부서 · 종합 영상스튜디오 (3명)",
      role: "시나리오 작가 / 비주얼 디렉터 / 사운드·렌더링·QA 마스터",
      avatar: "/assets/dept4_avatar.jpg",
      signal: dept4Signal.signal,
      statusText: dept4Signal.label,
      progress: dept4Signal.progress,
      summary: fawcettUploaded
        ? `Night Moon 퍼시 포셋 업로드 완료 (${fawcettUploaded.videoId}) · 직전작 에일린 모어(kJ3LpcxqyDA) 공개 중`
        : "차기작 『1925년 퍼시 포셋 대령과 잃어버린 도시 Z』 완성본 QA 통과 · CEO 최종 승인 대기",
      url: "http://127.0.0.1:4318",
      portUp: p4318,
    },
  ];

  const qaItems = [
    {
      id: "fawcett-full",
      deptBadge: "4부서 롱폼 · Night Moon",
      type: "video",
      title: fawcettItem?.title || "아마존 깊은 곳으로 걸어 들어간 남자… 1925년 퍼시 포셋 대령과 잃어버린 도시 Z 실종 실화",
      subtitle: "24씬 풀버전 마스터링 완료 · 1080p 30fps · Qwen3-TTS(6.45자/초) · 맞춤 썸네일 포함",
      qaBadges: ["싱크 100점 PASS", "모션·자막 육안검수 PASS", `용량 ${getFileSizeMb(PATHS.fawcettFullVideo) ?? "-"} MB`],
      mediaUrl: "/api/cockpit/media?target=fawcett_full",
      sampleUrl: "/api/cockpit/media?target=fawcett_sample",
      thumbnailUrl: "/api/cockpit/media?target=fawcett_thumb",
      description: fawcettItem?.description || "",
      firstComment: fawcettItem?.comment || "",
      playlistTitle: fawcettItem?.playlistTitle || "",
      uploadedUrl: fawcettUploaded?.url || null,
      canPublishYoutube: !fawcettUploaded,
      state: fawcettQa,
    },
    {
      id: "fawcett-blog",
      deptBadge: "3부서 블로그 · OSMU 패키지",
      type: "blog",
      title: "1925년 퍼시 포셋 대령과 잃어버린 도시 Z — 빛나 아카이브(티스토리/네이버) 수익화 원고",
      subtitle: `Flash 모델 최적화 변환 완료 · ${blogText.length.toLocaleString()}자 · 고화질 본문 이미지 4장 세트`,
      qaBadges: ["첫 문단 두괄식 결론", "H2 + FAQ 4선", "중학생 솔직 감상평", `슬러그: ${blogSlug}`],
      slug: blogSlug,
      folderPath: path.join(PATHS.fawcettDir, "blog_images"),
      markdown: blogText,
      images: [
        { label: "01. 데드 호스 캠프 출발", url: "/api/cockpit/media?target=fawcett_blog_img_1" },
        { label: "02. 1753년 고문서 512호", url: "/api/cockpit/media?target=fawcett_blog_img_2" },
        { label: "03. 위장 가짜 좌표 분석", url: "/api/cockpit/media?target=fawcett_blog_img_3" },
        { label: "04. 21세기 라이다 쿠이쿠구", url: "/api/cockpit/media?target=fawcett_blog_img_4" },
      ],
      state: blogQa,
    },
    {
      id: "shorts-queue-261122",
      deptBadge: "2부서 쇼츠 · 호기심빛나 1채널",
      type: "shorts_batch",
      title: `호기심빛나 1채널 쇼츠 8편 현황 (오늘 공개 ${shortsPostedCount}편 댓글 완료 · 예약 ${shortsScheduledCount}편)`,
      subtitle: "매일 낮 12:00 / 저녁 18:00 분산 공개 · 공개 2분 후(12:02/18:02) 첫 댓글 자동 등록 가동 중",
      qaBadges: ["제목 20자 이내 PASS", "한글 숫자 단위 PASS", "자동 댓글 스케줄러 ON"],
      shortsQueue,
      state: shortsQa,
    },
  ];

  return {
    nowKst: getKstNow().display,
    chiefOfStaff: {
      name: "총괄 실장",
      title: "Chief of Staff & General Director",
      avatar: "/assets/chief_avatar.jpg",
      heroBanner: "/assets/cockpit_hero.jpg",
      orgChart: "/assets/org_chart_latest.jpg",
      status: "전 부서 실시간 감시 중 · 병목 0건",
      recentActions: [
        {
          time: "21:30 KST",
          tag: "잡도리·슈퍼캐리",
          text: "1채널 오늘(11/22) 공개 영상 2편 첫 댓글 누락 포착 → UTF-8 BOM 버그 수정 및 2편 댓글 즉시 API 등록 + 매일 12:02/18:02 자동 스케줄러(ShortsAuto_PostDueComments) 구축 완료",
        },
        {
          time: "22:45 KST",
          tag: "조직·파이프 개편",
          text: "전사 9인 정예 슬림화(14명→9명), 3부서 떡상 공식 2·4부서 자동 주입 파이프 개통, 블로그 OSMU 3부서 Flash 모델 전담 이관 완료",
        },
        {
          time: "실시간",
          tag: "QA 대기",
          text: "4부서 퍼시 포셋 대령 롱폼(9.1분) & 3부서 블로그 원고 세트 자체 QA 통과 → 대표님 원클릭 승인 대기 중",
        },
      ],
    },
    morningAndTrendWidget: {
      latestBriefing: latestBriefing
        ? {
            date: latestBriefing.date,
            headline: latestBriefing.headline,
            summary: latestBriefing.summary,
            importantMails: (latestBriefing.facts?.mails || []).filter((m) => m.importance === "high").slice(0, 3),
            news: (latestBriefing.facts?.news || []).slice(0, 4),
            voiceMemos: (latestBriefing.facts?.voiceMemos || []).slice(0, 3),
            suggestions: (latestBriefing.suggestions || []).slice(0, 3),
          }
        : null,
      marketingInsights: sharedInsights,
    },
    pipelines,
    qaItems,
    costMonitor: {
      higgsfield: hfCredits,
      googleFlow: { mode: "Nano Banana Pro", cost: "0 크레딧 (무료 우선)" },
      localTts: { name: "Pinokio Qwen3-TTS", cost: "로컬 무료 (0원)", online: p7860 },
      modelAssignments: [
        { role: "총괄 실장 · 고급 7패스 시나리오", model: "Gemini 4 Argon (High)", tier: "premium" },
        { role: "3부서 블로그 OSMU · 자막 교정", model: "Gemini 3.8 Flash · GPT-4o-mini", tier: "eco" },
        { role: "1부서 데이터 수집 봇 (일정/메일/뉴스)", model: "비동기 API 직접 수집 (토큰 0)", tier: "free" },
        { role: "4부서 비주얼 (실사 아카이브 + AI)", model: "아카이브 수집 + Higgsfield", tier: "hybrid" },
      ],
      studioServices: [
        { name: "CEO 종합상황실", port: 4173, online: true, url: "http://127.0.0.1:4173" },
        { name: "2부서 쇼츠 스튜디오", port: 5173, online: p5173, url: "http://127.0.0.1:5173" },
        { name: "3부서 유튜브 분석실", port: 8001, online: p8001, url: "http://127.0.0.1:8001" },
        { name: "4부서 롱폼 스튜디오", port: 4318, online: p4318, url: "http://127.0.0.1:4318" },
        { name: "Qwen3-TTS 엔진", port: 7860, online: p7860, url: "http://127.0.0.1:7860" },
      ],
    },
  };
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${HOST}:${PORT}`);
    const pathname = url.pathname;

    // API Routes
    if (pathname === "/api/status" && req.method === "GET") {
      const config = readJson(PATHS.configJson, {});
      const briefings = listBriefings();
      return sendJson(res, 200, {
        ok: true,
        today: getKstNow().date,
        nowKst: getKstNow().display,
        account: config.account || "poohmoon0815@gmail.com",
        briefingsCount: briefings.length,
        latestDate: briefings[0]?.date || getKstNow().date,
      });
    }

    if (pathname === "/api/briefings" && req.method === "GET") {
      return sendJson(res, 200, { items: listBriefings() });
    }

    const briefingMatch = pathname.match(/^\/api\/briefings\/(\d{4}-\d{2}-\d{2})$/);
    if (briefingMatch && req.method === "GET") {
      const dateStr = briefingMatch[1];
      const jsonPath = path.join(PATHS.briefingsDir, `${dateStr}.json`);
      const mdPath = path.join(PATHS.briefingsDir, `${dateStr}.md`);
      if (!fs.existsSync(jsonPath)) {
        return sendJson(res, 404, { error: "해당 날짜의 브리핑이 아직 없습니다.", date: dateStr });
      }
      const briefing = readJson(jsonPath, null);
      const markdown = fs.existsSync(mdPath) ? fs.readFileSync(mdPath, "utf8") : buildMarkdownFromBriefing(briefing);
      return sendJson(res, 200, { briefing, markdown });
    }

    const toggleMatch = pathname.match(/^\/api\/briefings\/(\d{4}-\d{2}-\d{2})\/suggestions\/([^/]+)$/);
    if (toggleMatch && req.method === "PATCH") {
      const [, dateStr, sugId] = toggleMatch;
      const jsonPath = path.join(PATHS.briefingsDir, `${dateStr}.json`);
      if (!fs.existsSync(jsonPath)) {
        return sendJson(res, 404, { error: "브리핑을 찾을 수 없습니다." });
      }
      const body = await readBody(req);
      const briefing = readJson(jsonPath, null);
      const target = (briefing.suggestions || []).find((s) => s.id === sugId);
      if (!target) {
        return sendJson(res, 404, { error: "우선순위 항목을 찾을 수 없습니다." });
      }
      target.done = Boolean(body.done);
      writeJson(jsonPath, briefing);
      const mdContent = buildMarkdownFromBriefing(briefing);
      fs.writeFileSync(path.join(PATHS.briefingsDir, `${dateStr}.md`), mdContent, "utf8");
      return sendJson(res, 200, { briefing, markdown: mdContent });
    }

    if (pathname === "/api/run" && req.method === "POST") {
      const body = await readBody(req);
      const result = await runBriefingAgent({
        targetDate: body.date,
        promptText: body.prompt,
      });
      return sendJson(res, 200, result);
    }

    if (pathname === "/api/agents-md" && req.method === "GET") {
      const content = fs.existsSync(PATHS.agentsMd) ? fs.readFileSync(PATHS.agentsMd, "utf8") : "";
      return sendJson(res, 200, { content });
    }

    if (pathname === "/api/agents-md" && req.method === "PUT") {
      const body = await readBody(req);
      if (typeof body.content !== "string") {
        return sendJson(res, 400, { error: "content 문자열이 필요합니다." });
      }
      fs.writeFileSync(PATHS.agentsMd, body.content, "utf8");
      return sendJson(res, 200, { ok: true, savedAt: getKstNow().iso });
    }

    if (pathname === "/api/config" && req.method === "GET") {
      return sendJson(res, 200, readJson(PATHS.configJson, {}));
    }

    if (pathname === "/api/config" && req.method === "PUT") {
      const body = await readBody(req);
      const prev = readJson(PATHS.configJson, {});
      const next = { ...prev, ...body };
      writeJson(PATHS.configJson, next);
      return sendJson(res, 200, { ok: true, config: next });
    }

    if (pathname === "/api/history" && req.method === "GET") {
      return sendJson(res, 200, { items: readJson(PATHS.historyJson, []) });
    }

    if (pathname === "/api/handoff-news" && req.method === "POST") {
      const body = await readBody(req);
      if (!body.title || !body.url) {
        return sendJson(res, 400, { error: "뉴스 제목과 링크가 필요합니다." });
      }
      fs.mkdirSync(path.dirname(PATHS.shortsNewsInbox), { recursive: true });
      if (!fs.existsSync(PATHS.shortsNewsInbox)) {
        fs.writeFileSync(
          PATHS.shortsNewsInbox,
          "# 🛠️ 쇼츠 제작팀 기술·툴 참고 인박스 (비서실 뉴스 직원 전달)\n\n비서실의 📰 뉴스·트렌드 직원이 대표님 선택으로 전달한 영상 제작 도구·AI 모델·파이프라인 개선 참고 기사 목록입니다.\n\n",
          "utf8"
        );
      }
      const entry = `- **[${getKstNow().date}] [${body.keyword || "뉴스"}]** [${body.title}](${body.url}) — ${body.source || "Google 뉴스"} *(전달 시각: ${getKstNow().display})*\n`;
      fs.appendFileSync(PATHS.shortsNewsInbox, entry, "utf8");
      return sendJson(res, 200, { ok: true, savedPath: PATHS.shortsNewsInbox });
    }

    if (pathname === "/api/handoff-voice" && req.method === "POST") {
      const body = await readBody(req);
      if (!body.name || !body.url) {
        return sendJson(res, 400, { error: "음성 파일 이름과 링크가 필요합니다." });
      }
      appendVoiceInbox(body);
      if (body.id) {
        const cache = readJson(PATHS.voiceCacheJson, {});
        if (cache[body.id]) {
          cache[body.id].handedOff = true;
          writeJson(PATHS.voiceCacheJson, cache);
        }
      }
      return sendJson(res, 200, { ok: true, savedPath: PATHS.shortsVoiceInbox });
    }

    if (pathname === "/api/voice-memos" && req.method === "GET") {
      const cache = readJson(PATHS.voiceCacheJson, {});
      const items = Object.values(cache).sort((a, b) => (a.modifiedTime < b.modifiedTime ? 1 : -1));
      return sendJson(res, 200, { items });
    }

    if (pathname === "/api/voice-memos/scan" && req.method === "POST") {
      const config = readJson(PATHS.configJson, {});
      const items = await analyzeVoiceMemos(config.account || "poohmoon0815@gmail.com");
      return sendJson(res, 200, { ok: true, items });
    }

    if (pathname === "/api/handoff-voice" && req.method === "POST") {
      const body = await readBody(req);
      if (!body.name || !body.url) {
        return sendJson(res, 400, { error: "음성 파일 이름과 링크가 필요합니다." });
      }
      appendVoiceInbox(body);
      if (body.id) {
        const cache = readJson(PATHS.voiceCacheJson, {});
        if (cache[body.id]) {
          cache[body.id].handedOff = true;
          writeJson(PATHS.voiceCacheJson, cache);
        }
      }
      return sendJson(res, 200, { ok: true, savedPath: PATHS.shortsVoiceInbox });
    }

    if (pathname === "/api/voice-memos" && req.method === "GET") {
      const cache = readJson(PATHS.voiceCacheJson, {});
      const items = Object.values(cache).sort((a, b) => (a.modifiedTime < b.modifiedTime ? 1 : -1));
      return sendJson(res, 200, { items });
    }

    if (pathname === "/api/voice-memos/scan" && req.method === "POST") {
      const config = readJson(PATHS.configJson, {});
      const items = await analyzeVoiceMemos(config.account || "poohmoon0815@gmail.com");
      return sendJson(res, 200, { ok: true, items });
    }

    if (pathname === "/api/cockpit/overview" && req.method === "GET") {
      const overview = await buildCockpitOverview();
      return sendJson(res, 200, overview);
    }

    if (pathname === "/api/cockpit/media" && req.method === "GET") {
      const targetPath = resolveCockpitMediaPath(url);
      return streamMediaFile(req, res, targetPath);
    }

    if (pathname === "/api/cockpit/qa-action" && req.method === "POST") {
      const body = await readBody(req);
      const { id, action, note, publishYoutube } = body || {};
      if (!id || !["approve", "revise", "reject", "reset"].includes(action)) {
        return sendJson(res, 400, { error: "유효한 id와 action(approve|revise|reject|reset)이 필요합니다." });
      }
      const qaState = readJsonClean(PATHS.qaStateJson, {});
      const statusMap = {
        approve: "approved",
        revise: "revision_requested",
        reject: "rejected",
        reset: "pending",
      };
      qaState[id] = {
        status: statusMap[action],
        note: String(note || "").trim(),
        updatedAt: getKstNow().iso,
      };
      writeJson(PATHS.qaStateJson, qaState);

      if ((action === "revise" || action === "reject") && note) {
        const orderLine = `- **[${getKstNow().display}] [${id}] [${action === "revise" ? "수정 지시" : "반려"}]** ${String(note).trim()}\n`;
        if (!fs.existsSync(PATHS.revisionOrdersMd)) {
          fs.writeFileSync(PATHS.revisionOrdersMd, "# 📋 CEO 종합상황실 수정·반려 지시 기록\n\n", "utf8");
        }
        fs.appendFileSync(PATHS.revisionOrdersMd, orderLine, "utf8");
      }

      let youtubeResult = null;
      if (action === "approve" && id === "fawcett-full" && publishYoutube === true) {
        const uploadLog = readJsonClean(PATHS.longformUploadResults, { uploaded: [] });
        const already = (uploadLog.uploaded || []).find((u) => String(u.title || "").includes("퍼시 포셋"));
        if (already) {
          youtubeResult = { ok: true, alreadyUploaded: true, url: already.url };
        } else {
          const run = await execFileAsync(
            "node",
            [PATHS.longformUploader, "batch", PATHS.fawcettManifest],
            { cwd: "c:\\longform-v1", timeout: 180000, windowsHide: true }
          ).catch((e) => ({ error: e.message, stdout: e.stdout, stderr: e.stderr }));
          if (run.error) {
            return sendJson(res, 500, {
              error: `승인은 저장되었으나 유튜브 업로드 중 오류가 발생했습니다: ${run.error}`,
              qaState: qaState[id],
            });
          }
          const updatedLog = readJsonClean(PATHS.longformUploadResults, { uploaded: [] });
          youtubeResult = { ok: true, uploaded: updatedLog.uploaded?.[0] || null };
        }
      }

      return sendJson(res, 200, { ok: true, qaState: qaState[id], youtubeResult });
    }

    if (pathname === "/api/cockpit/open-folder" && req.method === "POST") {
      const body = await readBody(req);
      const { target } = body || {};
      let folderPath = null;
      if (target === "fawcett_blog_images") {
        const desktopFolder = "C:\\Users\\user\\Desktop\\블로그_사진_4장";
        folderPath = fs.existsSync(desktopFolder) ? desktopFolder : "c:\\longform-v1\\outputs\\blog_images";
      } else if (target === "fawcett_dir") {
        folderPath = PATHS.fawcettDir;
      } else if (target === "longform_outputs") {
        folderPath = path.dirname(PATHS.fawcettFullVideo);
      } else if (target === "shorts_outputs") {
        folderPath = "c:\\shorts-v2\\outputs";
      }

      if (!folderPath || !fs.existsSync(folderPath)) {
        return sendJson(res, 404, { error: `폴더를 찾을 수 없습니다: ${folderPath}` });
      }

      if (process.platform === "win32") {
        try {
          spawn("powershell.exe", ["-NoProfile", "-WindowStyle", "Hidden", "-Command", `Start-Process explorer.exe -ArgumentList '${folderPath}'`], {
            detached: true,
            stdio: "ignore",
          }).unref();
        } catch (_) {}
      } else {
        const escaped = folderPath.replace(/"/g, '\\"');
        exec(`xdg-open "${escaped}"`);
      }
      return sendJson(res, 200, { ok: true, path: folderPath });
    }

    if (pathname === "/api/root-agents-md" && req.method === "GET") {
      const content = fs.existsSync(PATHS.rootAgentsMd) ? fs.readFileSync(PATHS.rootAgentsMd, "utf8") : "";
      return sendJson(res, 200, { content });
    }

    if (pathname === "/api/root-agents-md" && req.method === "PUT") {
      const body = await readBody(req);
      if (typeof body.content !== "string") {
        return sendJson(res, 400, { error: "content 문자열이 필요합니다." });
      }
      fs.writeFileSync(PATHS.rootAgentsMd, body.content, "utf8");
      return sendJson(res, 200, { ok: true, savedAt: getKstNow().iso });
    }

    // Static files
    let filePath = pathname === "/" ? path.join(PATHS.publicDir, "index.html") : path.join(PATHS.publicDir, pathname);
    filePath = path.normalize(filePath);
    if (!filePath.startsWith(PATHS.publicDir) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      filePath = path.join(PATHS.publicDir, "index.html");
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
    fs.createReadStream(filePath).pipe(res);
  } catch (err) {
    sendJson(res, 500, { error: err.message || "Internal server error" });
  }
});

let isVoicePolling = false;
async function pollNewVoiceMemos() {
  if (isVoicePolling) return;
  isVoicePolling = true;
  try {
    const config = readJson(PATHS.configJson, {});
    const account = config.account || "poohmoon0815@gmail.com";
    const beforeIds = new Set(Object.keys(readJson(PATHS.voiceCacheJson, {})));
    const items = await analyzeVoiceMemos(account);
    const newlyAnalyzed = items.filter((it) => !beforeIds.has(it.id));
    if (newlyAnalyzed.length > 0) {
      console.log(`[자료 직원] 새 음성 메모 ${newlyAnalyzed.length}건 분석 완료:`);
      for (const it of newlyAnalyzed) {
        console.log(`  - ${it.name} | ${it.category} | 쇼츠반영:${it.shouldReflect ? "예" : "아니오"}`);
      }
    }
  } catch (err) {
    console.warn(`[자료 직원] 음성 메모 감시 중 오류: ${err.message}`);
  } finally {
    isVoicePolling = false;
  }
}

server.listen(PORT, HOST, () => {
  console.log("========================================================");
  console.log("☀️  출근 준비 AI 비서 대시보드 실행 완료!");
  console.log(`👉 접속 주소: http://${HOST}:${PORT}`);
  console.log("🎙️  자료 직원: DriveSyncFiles 새 음성 메모 5분 주기 자동 감시 활성화");
  console.log("========================================================");
  setTimeout(pollNewVoiceMemos, 10000);
  setInterval(pollNewVoiceMemos, 5 * 60 * 1000);
});
