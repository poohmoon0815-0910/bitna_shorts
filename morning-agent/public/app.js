const state = {
  currentDate: "2026-11-22",
  currentBriefing: null,
  currentMarkdown: "",
  showMarkdown: false,
  archiveItems: [],
  config: {},
  cockpit: null,
};

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

let toastTimer = null;
function showToast(msg) {
  const el = $("#toast");
  if (!el) return;
  el.textContent = msg;
  el.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add("hidden"), 3200);
}

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatKoreanDate(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  const days = ["일", "월", "화", "수", "목", "금", "토"];
  return `${y}년 ${m}월 ${d}일 (${days[dt.getDay()]})`;
}

async function api(url, opts = {}) {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

function switchTab(tabName) {
  $$(".nav-pill").forEach((btn) => {
    const active = btn.dataset.tab === tabName;
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-selected", String(active));
  });
  $$(".tab-panel").forEach((panel) => {
    panel.classList.toggle("active", panel.id === `tab-${tabName}`);
  });

  if (tabName === "cockpit") loadCockpit();
  if (tabName === "org") {
    loadRootAgentsMd();
    loadAgentsMd();
  }
  if (tabName === "archive") loadArchive();
  if (tabName === "settings") {
    loadConfig();
    loadHistory();
  }
}

/* =========================================================
   CEO FLIGHT DECK (COCKPIT)
   ========================================================= */
function openMediaModal(title, htmlContent) {
  $("#mediaModalTitle").textContent = title;
  $("#mediaModalBody").innerHTML = htmlContent;
  $("#mediaModal").classList.remove("hidden");
}

function closeMediaModal() {
  $("#mediaModal").classList.add("hidden");
  $("#mediaModalBody").innerHTML = "";
}

async function loadCockpit() {
  try {
    const data = await api("/api/cockpit/overview");
    state.cockpit = data;
    renderCockpit(data);
  } catch (err) {
    showToast(`상황실 데이터 로드 실패: ${err.message}`);
  }
}

function renderCockpit(data) {
  if ($("#cockpitClock")) $("#cockpitClock").textContent = data.nowKst || "";
  if ($("#chiefStatusSub")) {
    $("#chiefStatusSub").textContent = `${data.chiefOfStaff?.status || "전 부서 감시 중"} · 전사 9인 정예 초고속 실행 체제`;
  }

  // Chief recent logs
  const logs = data.chiefOfStaff?.recentActions || [];
  $("#chiefRecentLogs").innerHTML = logs
    .map(
      (l) => `
      <div class="chief-log-item">
        <span class="chief-log-meta">[${escapeHtml(l.tag)} · ${escapeHtml(l.time)}]</span>
        ${escapeHtml(l.text)}
      </div>
    `
    )
    .join("");

  // Widget 1: Morning Briefing + Marketing Trends Summary Cards
  const lb = data.morningAndTrendWidget?.latestBriefing;
  const mk = data.morningAndTrendWidget?.marketingInsights || {};
  const topInsights = mk.topInsights || [];
  const kwShorts = mk.activeKeywords?.shorts || [];
  const kwLong = mk.activeKeywords?.longform || [];

  $("#cockpitSummaryCards").innerHTML = `
    <article class="summary-mini-card">
      <div class="summary-mini-head">
        <span>📅 1부서 · 일정 &amp; 중요 메일</span>
        <span class="tag medium">${escapeHtml(lb?.date || "대기")}</span>
      </div>
      <div class="summary-mini-list">
        <div class="summary-mini-row"><strong>요약:</strong> ${escapeHtml(lb?.headline || "최신 브리핑을 생성해 주세요.")}</div>
        ${(lb?.importantMails || [])
      .slice(0, 2)
      .map((m) => `<div class="summary-mini-row">✉️ ${escapeHtml(m.subject)}</div>`)
      .join("")}
      </div>
    </article>

    <article class="summary-mini-card">
      <div class="summary-mini-head">
        <span>🔥 3부서 · 떡상 공식 &amp; SEO</span>
        <span class="tag low">자동 주입 ON</span>
      </div>
      <div class="summary-mini-list">
        ${topInsights
      .slice(0, 2)
      .map((ins) => `<div class="summary-mini-row"><strong>${escapeHtml(ins.title)}</strong></div>`)
      .join("")}
        <div class="keyword-chips">
          ${[...kwShorts.slice(0, 2), ...kwLong.slice(0, 2)]
      .map((k) => `<span class="keyword-chip">#${escapeHtml(k)}</span>`)
      .join("")}
        </div>
      </div>
    </article>

    <article class="summary-mini-card">
      <div class="summary-mini-head">
        <span>🎙️ 대표님 음성 지시 &amp; 맞춤 뉴스</span>
        <span class="tag high">${lb?.voiceMemos?.length ?? 0}건 분석</span>
      </div>
      <div class="summary-mini-list">
        ${(lb?.voiceMemos || []).slice(0, 2).map((v) => `<div class="summary-mini-row">🎙️ ${escapeHtml(v.shortsIdeaTitle || v.name)}</div>`).join("")}
        ${(lb?.news || []).slice(0, 2).map((n) => `<div class="summary-mini-row">📰 <a class="news-link" href="${escapeHtml(n.url)}" target="_blank" rel="noopener">${escapeHtml(n.title)}</a></div>`).join("")}
      </div>
    </article>
  `;

  // Widget 2: Pipeline Traffic Lights
  const pipelines = data.pipelines || [];
  $("#pipelineList").innerHTML = pipelines
    .map(
      (p) => `
      <div class="pipeline-card">
        <img src="${escapeHtml(p.avatar)}" alt="${escapeHtml(p.dept)}" class="dept-avatar" />
        <div class="pipeline-body">
          <div class="pipeline-top">
            <span class="pipeline-title">${escapeHtml(p.dept)}</span>
            <span class="signal-pill ${escapeHtml(p.signal)}">
              <span class="signal-dot"></span>
              ${escapeHtml(p.statusText)}
            </span>
          </div>
          <div class="pipeline-role">${escapeHtml(p.role)}</div>
          <div class="pipeline-summary">${escapeHtml(p.summary)}</div>
          <div class="pipeline-foot">
            <div class="pipeline-bar">
              <div class="pipeline-bar-fill ${escapeHtml(p.signal)}" style="width: ${Number(p.progress || 0)}%"></div>
            </div>
            <span class="pipeline-pct">${Number(p.progress || 0)}%</span>
            ${p.url
          ? `<a href="${escapeHtml(p.url)}" target="_blank" rel="noopener" class="studio-mini-link">${p.portUp ? "🟢 온라인 열기 ↗" : "작업실 ↗"}</a>`
          : ""
        }
          </div>
        </div>
      </div>
    `
    )
    .join("");

  // Widget 4: Cost & Model Monitor
  const cm = data.costMonitor || {};
  const hf = cm.higgsfield || {};
  $("#costMonitorBox").innerHTML = `
    <div class="cost-kpi-row">
      <div class="cost-kpi">
        <div class="cost-kpi-label">Higgsfield (${escapeHtml(hf.plan || "ULTRA")})</div>
        <div class="cost-kpi-val">${Number(hf.credits || 0).toLocaleString()} cr</div>
        <div class="cost-kpi-sub">${hf.live ? "🟢 실시간 동기화" : "캐시 잔여량"}</div>
      </div>
      <div class="cost-kpi">
        <div class="cost-kpi-label">Google Flow</div>
        <div class="cost-kpi-val">0 크레딧</div>
        <div class="cost-kpi-sub">${escapeHtml(cm.googleFlow?.mode || "Nano Banana Pro")}</div>
      </div>
      <div class="cost-kpi">
        <div class="cost-kpi-label">Qwen3-TTS (로컬 성우)</div>
        <div class="cost-kpi-val">0 원</div>
        <div class="cost-kpi-sub">${cm.localTts?.online ? "🟢 로컬 서버 온라인" : "⚪ 대기 모드"}</div>
      </div>
    </div>

    <div class="model-table">
      ${(cm.modelAssignments || [])
      .map(
        (m) => `
          <div class="model-row">
            <span><strong>${escapeHtml(m.role)}</strong></span>
            <span class="model-pill ${escapeHtml(m.tier)}">${escapeHtml(m.model)}</span>
          </div>
        `
      )
      .join("")}
    </div>

    <div class="service-chips">
      ${(cm.studioServices || [])
      .map(
        (s) => `
          <a href="${escapeHtml(s.url)}" target="_blank" rel="noopener" class="service-chip">
            <span class="dot ${s.online ? "up" : "down"}"></span>
            ${escapeHtml(s.name)} (:${s.port})
          </a>
        `
      )
      .join("")}
    </div>
  `;

  // Widget 3: One-Click QA Inbox
  const qaItems = data.qaItems || [];
  const pendingCount = qaItems.filter((q) => (q.state?.status || "pending") === "pending").length;
  $("#qaPendingBadge").textContent = pendingCount > 0 ? `승인 대기 ${pendingCount}건` : "전 건 처리 완료";

  const statusLabels = {
    pending: "🟡 CEO 승인 대기",
    approved: "🟢 승인 완료",
    revision_requested: "🟠 수정 지시됨",
    rejected: "🔴 반려됨",
  };

  $("#qaInboxList").innerHTML = qaItems
    .map((item) => {
      const st = item.state?.status || "pending";
      const stText = statusLabels[st] || st;
      let bodyHtml = "";

      if (item.type === "video") {
        bodyHtml = `
          <div class="qa-video-preview-row">
            <img src="${escapeHtml(item.thumbnailUrl)}" alt="맞춤 썸네일" class="qa-thumb" data-preview-img="${escapeHtml(item.thumbnailUrl)}" data-preview-title="맞춤 썸네일: ${escapeHtml(item.title)}" />
            <div class="qa-meta-box">
              <div><strong>재생목록:</strong> ${escapeHtml(item.playlistTitle)}</div>
              <div class="qa-comment-preview"><strong>고정 댓글 예정:</strong> ${escapeHtml(item.firstComment)}</div>
              <div style="display:flex; gap:6px; flex-wrap:wrap;">
                <button class="btn-ghost" data-play-video="${escapeHtml(item.mediaUrl)}" data-play-title="풀버전 완성본 미리보기">▶ 풀버전 재생</button>
                <button class="btn-ghost" data-play-video="${escapeHtml(item.sampleUrl)}" data-play-title="1분 샘플 미리보기">▶ 1분 샘플 재생</button>
                ${item.uploadedUrl ? `<a href="${escapeHtml(item.uploadedUrl)}" target="_blank" rel="noopener" class="btn-ghost">유튜브 열기 ↗</a>` : ""}
              </div>
            </div>
          </div>
        `;
      } else if (item.type === "blog") {
        const blogFolderPath = item.folderPath || "c:\\longform-v1\\outputs\\아마존_깊은_곳으로_걸어_들어간_남자_1925년_퍼시_포셋_대령과_잃어버린_도시_\\blog_images";
        bodyHtml = `
          <div class="blog-gallery">
            ${(item.images || [])
            .map(
              (img) => `
                <div class="blog-gallery-item" data-preview-img="${escapeHtml(img.url)}" data-preview-title="${escapeHtml(img.label)}">
                  <img src="${escapeHtml(img.url)}" alt="${escapeHtml(img.label)}" />
                </div>
              `
            )
            .join("")}
          </div>
          <div style="display:flex; gap:7px; flex-wrap:wrap; margin-bottom:10px;">
            <button class="btn-ghost" data-copy-text="${escapeHtml(item.slug)}">🔗 영어 슬러그 복사 (${escapeHtml(item.slug)})</button>
            <button class="btn-ghost" data-copy-blog="${escapeHtml(item.id)}">📋 블로그 마크다운 전체 복사</button>
            <button class="btn-ghost" data-preview-blog="${escapeHtml(item.id)}">📄 본문 미리보기</button>
            <button class="btn-ghost" data-copy-text="${escapeHtml(blogFolderPath)}">📁 사진 폴더 경로 복사</button>
          </div>
        `;
      } else if (item.type === "shorts_batch") {
        bodyHtml = `
          <div class="shorts-mini-list">
            ${(item.shortsQueue || [])
            .map(
              (sq) => `
                <div class="shorts-mini-row">
                  <div style="min-width:0; flex:1;">
                    <strong>${escapeHtml(sq.title)}</strong>
                    <div style="font-size:11px; color:var(--text-tertiary);">
                      ${escapeHtml((sq.publishAt || "").replace("+09:00", " KST").replace("T", " "))} · ${escapeHtml(sq.playlistTitle)}
                    </div>
                  </div>
                  <span class="tag ${sq.commentPosted ? "low" : "medium"}">${escapeHtml(sq.status)}</span>
                  <button class="btn-ghost" data-play-video="${escapeHtml(sq.mediaUrl)}" data-play-title="쇼츠 미리보기: ${escapeHtml(sq.title)}">▶</button>
                </div>
              `
            )
            .join("")}
          </div>
        `;
      }

      const publishBtn =
        item.type === "video" && item.canPublishYoutube
          ? `<button class="btn-qa publish" data-qa-id="${escapeHtml(item.id)}" data-qa-action="approve" data-publish="true">🚀 승인 + 유튜브 즉시 업로드</button>`
          : "";

      return `
        <article class="qa-card">
          <div class="qa-card-top">
            <span class="qa-dept-badge">${escapeHtml(item.deptBadge)}</span>
            <span class="qa-status-badge ${escapeHtml(st)}">${escapeHtml(stText)}</span>
          </div>
          <div class="qa-title">${escapeHtml(item.title)}</div>
          <div class="qa-subtitle">${escapeHtml(item.subtitle)}</div>
          <div class="qa-badges-row">
            ${(item.qaBadges || []).map((b) => `<span class="qa-check-chip">✓ ${escapeHtml(b)}</span>`).join("")}
          </div>
          ${bodyHtml}
          ${item.state?.note ? `<div class="qa-comment-preview" style="margin-bottom:10px;"><strong>대표님 지시 메모:</strong> ${escapeHtml(item.state.note)}</div>` : ""}
          <div class="qa-controls">
            <input type="text" class="qa-note-input" id="qa-note-${escapeHtml(item.id)}" value="${escapeHtml(item.state?.note || "")}" placeholder="수정 지시나 반려 사유를 적고 버튼을 누르면 해당 부서에 즉시 전달됩니다..." />
            <div class="qa-btn-row">
              <button class="btn-qa approve" data-qa-id="${escapeHtml(item.id)}" data-qa-action="approve">✅ 승인</button>
              ${publishBtn}
              <button class="btn-qa revise" data-qa-id="${escapeHtml(item.id)}" data-qa-action="revise">✏️ 수정 지시</button>
              <button class="btn-qa reject" data-qa-id="${escapeHtml(item.id)}" data-qa-action="reject">❌ 반려</button>
            </div>
          </div>
        </article>
      `;
    })
    .join("");

  // Bind dynamic QA actions
  $$("[data-play-video]").forEach((btn) => {
    btn.addEventListener("click", () => {
      openMediaModal(
        btn.dataset.playTitle || "영상 미리보기",
        `<video src="${escapeHtml(btn.dataset.playVideo)}" controls autoplay playsinline></video>`
      );
    });
  });

  $$("[data-preview-img]").forEach((el) => {
    el.addEventListener("click", () => {
      openMediaModal(
        el.dataset.previewTitle || "이미지 미리보기",
        `<img src="${escapeHtml(el.dataset.previewImg)}" alt="미리보기" />`
      );
    });
  });

  $$("[data-copy-text]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await navigator.clipboard.writeText(btn.dataset.copyText || "");
      showToast(`복사 완료: ${btn.dataset.copyText}`);
    });
  });

  $$("[data-copy-blog]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const target = (state.cockpit?.qaItems || []).find((q) => q.id === btn.dataset.copyBlog);
      if (!target?.markdown) return;
      await navigator.clipboard.writeText(target.markdown);
      showToast("블로그 마크다운 원고 전체를 클립보드에 복사했습니다!");
    });
  });

  $$("[data-preview-blog]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = (state.cockpit?.qaItems || []).find((q) => q.id === btn.dataset.previewBlog);
      if (!target) return;
      openMediaModal(target.title, `<pre class="md-pre">${escapeHtml(target.markdown || "")}</pre>`);
    });
  });

  $$("[data-open-folder]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const target = btn.dataset.openFolder;
      try {
        const res = await fetch("/api/cockpit/open-folder", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ target }),
        });
        const data = await res.json();
        if (data.ok) {
          try {
            await navigator.clipboard.writeText(data.path);
          } catch (_) { }
          showToast(`📁 사진 4장 폴더를 열었습니다! (경로 복사 완료)`);
        } else {
          showToast(data.error || "폴더 열기에 실패했습니다.", "error");
        }
      } catch (err) {
        showToast("폴더 열기 요청 중 오류가 발생했습니다.", "error");
      }
    });
  });

  $$("[data-qa-action]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.qaId;
      const action = btn.dataset.qaAction;
      const publishYoutube = btn.dataset.publish === "true";
      const noteEl = $(`#qa-note-${id}`);
      const note = noteEl ? noteEl.value.trim() : "";

      if (publishYoutube && !window.confirm("퍼시 포셋 완성본 영상을 지금 Night Moon 유튜브 채널에 즉시 공개 업로드할까요?")) {
        return;
      }

      btn.disabled = true;
      try {
        const res = await api("/api/cockpit/qa-action", {
          method: "POST",
          body: JSON.stringify({ id, action, note, publishYoutube }),
        });
        if (res.youtubeResult?.url || res.youtubeResult?.uploaded?.url) {
          const url = res.youtubeResult.url || res.youtubeResult.uploaded.url;
          showToast(`유튜브 업로드 및 승인 완료! (${url})`);
        } else {
          showToast("CEO 결재 처리가 완료되어 해당 부서에 반영되었습니다.");
        }
        await loadCockpit();
      } catch (err) {
        showToast(`처리 실패: ${err.message}`);
        btn.disabled = false;
      }
    });
  });
}

/* =========================================================
   MORNING BRIEFING RENDERING (100% PRESERVED)
   ========================================================= */
function renderBriefing(briefing, markdown) {
  state.currentBriefing = briefing;
  state.currentMarkdown = markdown || "";

  $("#emptyBriefingState").classList.add("hidden");
  $("#headlineBar").classList.remove("hidden");

  $("#kpiEvents").textContent = briefing.summary?.eventsCount ?? 0;
  $("#kpiMails").textContent = briefing.summary?.importantMailsCount ?? 0;
  if ($("#kpiNews")) $("#kpiNews").textContent = briefing.summary?.newsCount ?? (briefing.facts?.news?.length ?? 0);
  $("#kpiPriorities").textContent = briefing.summary?.prioritiesCount ?? 0;
  $("#kpiDrive").textContent = briefing.summary?.driveDocsCount ?? 0;

  $("#headlineText").textContent = briefing.headline || "";
  $("#generatedAtLabel").textContent = briefing.generatedAt
    ? `업데이트: ${briefing.generatedAt.slice(0, 16).replace("T", " ")}`
    : "";

  $("#calendarNote").textContent = briefing.facts?.calendarNote || "";
  const calEvents = briefing.facts?.calendar || [];
  if (calEvents.length === 0) {
    $("#calendarList").innerHTML = `<div class="empty-inline">예정된 회의나 일정이 없습니다. 자유롭게 집중 시간을 배정해 보세요.</div>`;
  } else {
    $("#calendarList").innerHTML = calEvents
      .map(
        (ev) => `
      <div class="list-item">
        <div class="item-top">
          <div class="item-tags">
            <span class="tag ${ev.isToday ? "high" : "medium"}">${ev.isToday ? "오늘 일정" : "예정 일정"}</span>
          </div>
          <span class="item-date">${escapeHtml(ev.allDay ? "종일" : `${ev.start} ~ ${ev.end}`)}</span>
        </div>
        <div class="item-title">${escapeHtml(ev.title)}</div>
        ${ev.location ? `<div class="item-desc">장소: ${escapeHtml(ev.location)}</div>` : ""}
        ${ev.link ? `<div class="item-meta"><a href="${escapeHtml(ev.link)}" target="_blank" rel="noopener">Google Calendar에서 열기 ↗</a></div>` : ""}
      </div>
    `
      )
      .join("");
  }

  const mails = briefing.facts?.mails || [];
  if (mails.length === 0) {
    $("#mailList").innerHTML = `<div class="empty-inline">조회 기간 내 확인이 필요한 중요 메일이 없습니다.</div>`;
  } else {
    $("#mailList").innerHTML = mails
      .map(
        (m) => `
      <div class="list-item">
        <div class="item-top">
          <div class="item-tags">
            <span class="tag ${escapeHtml(m.importance || "medium")}">${escapeHtml(m.category || "메일")}</span>
          </div>
          <span class="item-date">${escapeHtml(m.date)}</span>
        </div>
        <div class="item-title">${escapeHtml(m.subject)}</div>
        <div class="item-desc">${escapeHtml(m.summary)}</div>
        <div class="item-meta">${escapeHtml(m.from)}</div>
      </div>
    `
      )
      .join("");
  }

  const drive = briefing.facts?.drive || [];
  if (drive.length === 0) {
    $("#driveList").innerHTML = `<div class="empty-inline" style="grid-column: 1 / -1;">최근 업데이트된 Drive 자료가 없습니다.</div>`;
  } else {
    $("#driveList").innerHTML = drive
      .map((f) => {
        const icon = f.type === "folder" ? "📂" : f.type === "audio" ? "🎙️" : "📄";
        return `
        <a class="drive-item" href="${escapeHtml(f.url)}" target="_blank" rel="noopener">
          <div class="drive-icon">${icon}</div>
          <div class="drive-info">
            <div class="drive-name" title="${escapeHtml(f.name)}">${escapeHtml(f.name)}</div>
            <div class="drive-date">${escapeHtml(f.modified)}</div>
          </div>
          <span class="drive-arrow">↗</span>
        </a>
      `;
      })
      .join("");
  }

  const voices = briefing.facts?.voiceMemos || [];
  if ($("#voiceList")) {
    if (voices.length === 0) {
      $("#voiceList").innerHTML = `<div class="empty-inline">분석된 음성 메모가 없습니다.</div>`;
    } else {
      $("#voiceList").innerHTML = voices
        .map((v, idx) => {
          const badgeClass = v.shouldReflect ? "high" : v.isAddressedToAIOrSecretary ? "medium" : "low";
          const badgeText = v.shouldReflect ? "쇼츠 반영 추천" : v.isAddressedToAIOrSecretary ? "비서/AI 지시" : "미반영";
          const sent = Boolean(v.handedOff);
          return `
        <div class="list-item">
          <div class="item-top">
            <div class="item-tags">
              <span class="tag ${badgeClass}">${badgeText}</span>
              <span class="tag medium">${escapeHtml(v.category || "음성 메모")}</span>
            </div>
            <span class="item-date">${escapeHtml(v.modified || "")}</span>
          </div>
          <div class="item-title">${escapeHtml(v.shortsIdeaTitle || v.name)}</div>
          <div class="item-summary"><strong>전사:</strong> ${escapeHtml(v.transcript || "(없음)")}<br/><strong>판단:</strong> ${escapeHtml(v.reason || "")}</div>
          <div class="news-footer">
            <a class="news-link" href="${escapeHtml(v.url)}" target="_blank" rel="noopener">${escapeHtml(v.name)} 열기 ↗</a>
            <button class="btn-handoff btn-voice-handoff ${sent ? "sent" : ""}" data-voice-idx="${idx}" ${sent ? "disabled" : ""}>${sent ? "✓ 인박스 자동 전달됨" : "🎬 쇼츠 소재로 넘기기"}</button>
          </div>
        </div>
      `;
        })
        .join("");

      $$(".btn-voice-handoff").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const item = voices[Number(btn.dataset.voiceIdx)];
          if (!item) return;
          btn.disabled = true;
          try {
            await api("/api/handoff-voice", {
              method: "POST",
              body: JSON.stringify(item),
            });
            btn.classList.add("sent");
            btn.textContent = "✓ 쇼츠팀 전달 완료";
            showToast("쇼츠 제작팀 음성 인박스(inbox_voice_ideas.md)에 저장했습니다!");
          } catch (err) {
            btn.disabled = false;
            showToast(`전달 실패: ${err.message}`);
          }
        });
      });
    }
  }

  const news = briefing.facts?.news || [];
  if ($("#newsList")) {
    if (news.length === 0) {
      $("#newsList").innerHTML = `<div class="empty-inline">수집된 맞춤 뉴스가 없습니다. 상단의 '출근 준비 시작'을 눌러 최신 기사를 모아보세요.</div>`;
    } else {
      $("#newsList").innerHTML = news
        .map(
          (n, idx) => `
        <div class="list-item">
          <div class="item-top">
            <div class="item-tags">
              <span class="tag medium">${escapeHtml(n.keyword || "뉴스")}</span>
              <span class="tag low">${escapeHtml(n.source || "Google 뉴스")}</span>
            </div>
            <span class="item-date">${escapeHtml(n.publishedAt || "")}</span>
          </div>
          <div class="item-title">${escapeHtml(n.title)}</div>
          <div class="news-footer">
            <a class="news-link" href="${escapeHtml(n.url)}" target="_blank" rel="noopener">원문 기사 열기 ↗</a>
            <button class="btn-handoff btn-news-handoff" data-news-idx="${idx}">🛠️ 제작팀 기술 참고로 넘기기</button>
          </div>
        </div>
      `
        )
        .join("");

      $$(".btn-news-handoff").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const item = news[Number(btn.dataset.newsIdx)];
          if (!item) return;
          btn.disabled = true;
          try {
            await api("/api/handoff-news", {
              method: "POST",
              body: JSON.stringify(item),
            });
            btn.classList.add("sent");
            btn.textContent = "✓ 기술 참고 전달 완료";
            showToast("제작팀 기술 참고 인박스(inbox_tech_ideas.md)에 저장했습니다!");
          } catch (err) {
            btn.disabled = false;
            showToast(`전달 실패: ${err.message}`);
          }
        });
      });
    }
  }

  const suggestions = briefing.suggestions || [];
  const doneCount = suggestions.filter((s) => s.done).length;
  const pct = suggestions.length ? Math.round((doneCount / suggestions.length) * 100) : 0;
  $("#todoProgressBadge").textContent = `${doneCount} / ${suggestions.length}`;
  $("#todoProgressFill").style.width = `${pct}%`;
  $("#kpiPrioritiesSub").textContent = `${doneCount}개 완료 · ${suggestions.length - doneCount}개 남음`;

  $("#priorityList").innerHTML = suggestions
    .map(
      (s) => `
    <div class="priority-item ${s.done ? "done" : ""}" data-sug-id="${escapeHtml(s.id)}">
      <div class="check-circle">${s.done ? "✓" : ""}</div>
      <div class="priority-body">
        <div class="priority-badges">
          <span class="p-rank">${escapeHtml(s.priority)}</span>
          <span class="p-tag">${escapeHtml(s.tag)}</span>
        </div>
        <div class="priority-title">${escapeHtml(s.title)}</div>
        <div class="priority-reason">${escapeHtml(s.reason)}</div>
      </div>
    </div>
  `
    )
    .join("");

  $$(".priority-item").forEach((el) => {
    el.addEventListener("click", () => toggleSuggestion(el.dataset.sugId));
  });

  $("#mdFilename").textContent = `briefings/${briefing.date}.md`;
  $("#markdownPre").textContent = state.currentMarkdown;
  updateViewMode();
}

function updateViewMode() {
  if (!state.currentBriefing) {
    $("#structuredView").classList.add("hidden");
    $("#markdownView").classList.add("hidden");
    return;
  }
  $("#structuredView").classList.toggle("hidden", state.showMarkdown);
  $("#markdownView").classList.toggle("hidden", !state.showMarkdown);
  $("#toggleMdBtn").textContent = state.showMarkdown ? "카드 보기로 전환" : "Markdown 보기";
}

async function loadBriefingByDate(dateStr) {
  state.currentDate = dateStr;
  $("#targetDate").value = dateStr;
  $("#todayLabel").textContent = formatKoreanDate(dateStr);

  try {
    const data = await api(`/api/briefings/${dateStr}`);
    renderBriefing(data.briefing, data.markdown);
  } catch (err) {
    if (err.status === 404) {
      state.currentBriefing = null;
      state.currentMarkdown = "";
      $("#kpiEvents").textContent = "-";
      $("#kpiMails").textContent = "-";
      if ($("#kpiNews")) $("#kpiNews").textContent = "-";
      $("#kpiPriorities").textContent = "-";
      $("#kpiDrive").textContent = "-";
      $("#headlineBar").classList.add("hidden");
      $("#structuredView").classList.add("hidden");
      $("#markdownView").classList.add("hidden");
      $("#emptyBriefingState").classList.remove("hidden");
    } else {
      showToast(`브리핑 불러오기 실패: ${err.message}`);
    }
  }
}

async function toggleSuggestion(sugId) {
  if (!state.currentBriefing) return;
  const item = (state.currentBriefing.suggestions || []).find((s) => s.id === sugId);
  if (!item) return;

  try {
    const data = await api(`/api/briefings/${state.currentBriefing.date}/suggestions/${sugId}`, {
      method: "PATCH",
      body: JSON.stringify({ done: !item.done }),
    });
    renderBriefing(data.briefing, data.markdown);
  } catch (err) {
    showToast(`상태 저장 실패: ${err.message}`);
  }
}

async function runAgent() {
  const dateStr = $("#targetDate").value || state.currentDate;
  const prompt = $("#promptInput").value.trim() || "오늘 출근 준비해 줘";

  const runBtn = $("#runBtn");
  const progress = $("#runProgress");
  runBtn.disabled = true;
  runBtn.querySelector(".btn-label").textContent = "브리핑 생성 중...";
  progress.classList.remove("hidden");

  const steps = ["#stepCal", "#stepMail", "#stepDrive", "#stepNews"];
  let idx = 0;
  const stepTimer = setInterval(() => {
    steps.forEach((s, i) => {
      const el = $(s);
      if (el) el.classList.toggle("active", i <= idx);
    });
    idx = (idx + 1) % steps.length;
  }, 900);

  try {
    const data = await api("/api/run", {
      method: "POST",
      body: JSON.stringify({ date: dateStr, prompt }),
    });
    renderBriefing(data.briefing, data.markdown);
    showToast(`브리핑 생성 완료 (${(data.durationMs / 1000).toFixed(1)}초)`);
    loadCockpit();
  } catch (err) {
    showToast(`실행 오류: ${err.message}`);
  } finally {
    clearInterval(stepTimer);
    runBtn.disabled = false;
    runBtn.querySelector(".btn-label").textContent = "출근 준비 시작";
    progress.classList.add("hidden");
  }
}

async function loadArchive() {
  try {
    const data = await api("/api/briefings");
    state.archiveItems = data.items || [];
    renderArchive();
  } catch (err) {
    showToast(`보관함 조회 실패: ${err.message}`);
  }
}

function renderArchive() {
  const q = ($("#archiveSearch").value || "").trim().toLowerCase();
  const filtered = state.archiveItems.filter(
    (item) => !q || item.date.includes(q) || (item.headline || "").toLowerCase().includes(q)
  );

  if (filtered.length === 0) {
    $("#archiveList").innerHTML = `<div class="empty-inline">저장된 브리핑이 없습니다.</div>`;
    return;
  }

  $("#archiveList").innerHTML = filtered
    .map(
      (item) => `
    <div class="archive-row" data-date="${escapeHtml(item.date)}">
      <div>
        <div class="archive-date">${escapeHtml(item.date)} · ${escapeHtml(formatKoreanDate(item.date))}</div>
        <div class="archive-headline">${escapeHtml(item.headline)}</div>
      </div>
      <div class="archive-counts">
        <span class="count-chip">일정 ${item.summary?.eventsCount ?? 0}</span>
        <span class="count-chip">메일 ${item.summary?.importantMailsCount ?? 0}</span>
        <span class="count-chip">뉴스 ${item.summary?.newsCount ?? 0}</span>
        <span class="count-chip">할일 ${item.summary?.prioritiesCount ?? 0}</span>
      </div>
    </div>
  `
    )
    .join("");

  $$(".archive-row").forEach((row) => {
    row.addEventListener("click", () => {
      switchTab("briefing");
      loadBriefingByDate(row.dataset.date);
    });
  });
}

async function loadRootAgentsMd() {
  try {
    const data = await api("/api/root-agents-md");
    $("#rootAgentsEditor").value = data.content || "";
  } catch (err) {
    showToast(`전사 AGENTS.md 불러오기 실패: ${err.message}`);
  }
}

async function saveRootAgentsMd() {
  try {
    await api("/api/root-agents-md", {
      method: "PUT",
      body: JSON.stringify({ content: $("#rootAgentsEditor").value }),
    });
    showToast("전사 규칙서(AGENTS.md)를 저장했습니다.");
  } catch (err) {
    showToast(`저장 실패: ${err.message}`);
  }
}

async function loadAgentsMd() {
  try {
    const data = await api("/api/agents-md");
    $("#agentsEditor").value = data.content || "";
  } catch (err) {
    showToast(`비서실 AGENTS.md 불러오기 실패: ${err.message}`);
  }
}

async function saveAgentsMd() {
  try {
    await api("/api/agents-md", {
      method: "PUT",
      body: JSON.stringify({ content: $("#agentsEditor").value }),
    });
    showToast("비서실 업무 규칙을 저장했습니다.");
  } catch (err) {
    showToast(`저장 실패: ${err.message}`);
  }
}

async function loadConfig() {
  try {
    const cfg = await api("/api/config");
    state.config = cfg;
    $("#cfgAccount").value = cfg.account || "poohmoon0815@gmail.com";
    $("#cfgMailDays").value = cfg.mailLookbackDays ?? 2;
    $("#cfgCalDays").value = cfg.calendarLookaheadDays ?? 7;
    $("#cfgTrigger").value = cfg.briefingTriggerPhrase || "오늘 출근 준비해 줘";
    $("#cfgHideSecurity").checked = Boolean(cfg.hideSecurityAlerts);
    $("#cfgHideCalls").checked = Boolean(cfg.hideCallRecordings);
  } catch (err) {
    showToast(`설정 조회 실패: ${err.message}`);
  }
}

async function saveConfig() {
  try {
    const payload = {
      account: $("#cfgAccount").value.trim() || "poohmoon0815@gmail.com",
      mailLookbackDays: Number($("#cfgMailDays").value || 2),
      calendarLookaheadDays: Number($("#cfgCalDays").value || 7),
      briefingTriggerPhrase: $("#cfgTrigger").value.trim() || "오늘 출근 준비해 줘",
      hideSecurityAlerts: $("#cfgHideSecurity").checked,
      hideCallRecordings: $("#cfgHideCalls").checked,
    };
    const data = await api("/api/config", { method: "PUT", body: JSON.stringify(payload) });
    $("#accountEmail").textContent = data.config.account;
    showToast("설정을 저장했습니다. 다음 실행부터 반영됩니다.");
  } catch (err) {
    showToast(`설정 저장 실패: ${err.message}`);
  }
}

async function loadHistory() {
  try {
    const data = await api("/api/history");
    const items = data.items || [];
    if (items.length === 0) {
      $("#historyList").innerHTML = `<div class="empty-inline">실행 이력이 아직 없습니다.</div>`;
      return;
    }
    $("#historyList").innerHTML = items
      .map(
        (h) => `
      <div class="history-row">
        <div class="history-top">
          <strong>${escapeHtml(h.date)} · ${escapeHtml(h.trigger || "")}</strong>
          <span class="history-status ${escapeHtml(h.status)}">${h.status === "success" ? "성공" : "부분 완료"}</span>
        </div>
        <div class="item-desc">${escapeHtml(h.note || "")}</div>
        <div class="item-meta">
          실행 시각: ${escapeHtml((h.executedAt || "").slice(0, 19).replace("T", " "))} · 소요: ${(Number(h.durationMs || 0) / 1000).toFixed(1)}초
        </div>
      </div>
    `
      )
      .join("");
  } catch (err) {
    showToast(`이력 조회 실패: ${err.message}`);
  }
}

function applyTheme(theme) {
  const valid = ["pop", "neon", "lounge"].includes(theme) ? theme : "neon";
  document.documentElement.setAttribute("data-theme", valid);
  localStorage.setItem("morningAgentTheme", valid);
  $$(".theme-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.themePick === valid);
  });
}

async function init() {
  applyTheme(localStorage.getItem("morningAgentTheme") || "neon");

  $$(".theme-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      applyTheme(btn.dataset.themePick);
      const names = { pop: "팝 아트 · 네오브루탈리즘", neon: "다크 네온 조종석", lounge: "미드나잇 라운지" };
      showToast(`테마 변경: ${names[btn.dataset.themePick] || btn.dataset.themePick}`);
    });
  });

  $$(".nav-pill").forEach((btn) => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });

  $$("[data-jump-tab]").forEach((btn) => {
    btn.addEventListener("click", () => switchTab(btn.dataset.jumpTab));
  });

  $$(".kpi-card").forEach((card) => {
    card.addEventListener("click", () => {
      const target = document.querySelector(card.dataset.scroll);
      if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });

  $("#targetDate").addEventListener("change", (e) => {
    if (e.target.value) loadBriefingByDate(e.target.value);
  });

  $("#promptInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter") runAgent();
  });

  $("#runBtn").addEventListener("click", runAgent);
  $("#emptyRunBtn").addEventListener("click", runAgent);
  $("#refreshCockpitBtn").addEventListener("click", () => {
    loadCockpit();
    showToast("종합상황실 상태를 최신화했습니다.");
  });
  $("#quickRunBriefingBtn").addEventListener("click", () => {
    switchTab("briefing");
    runAgent();
  });

  $("#toggleMdBtn").addEventListener("click", () => {
    state.showMarkdown = !state.showMarkdown;
    updateViewMode();
  });

  $("#copyMdBtn").addEventListener("click", async () => {
    if (!state.currentMarkdown) return;
    await navigator.clipboard.writeText(state.currentMarkdown);
    showToast("마크다운 브리핑을 클립보드에 복사했습니다.");
  });

  $("#archiveSearch").addEventListener("input", renderArchive);
  $("#saveRootRulesBtn").addEventListener("click", saveRootAgentsMd);
  $("#saveRulesBtn").addEventListener("click", saveAgentsMd);
  $("#saveConfigBtn").addEventListener("click", saveConfig);

  $("#mediaModalClose").addEventListener("click", closeMediaModal);
  $("#mediaModalBackdrop").addEventListener("click", closeMediaModal);

  try {
    const status = await api("/api/status");
    $("#accountEmail").textContent = status.account;
    await Promise.all([
      loadCockpit(),
      loadBriefingByDate(status.latestDate || status.today),
    ]);
  } catch (err) {
    showToast(`초기화 오류: ${err.message}`);
  }
}

init();
