#!/usr/bin/env node
/**
 * YouTube Data API v3 Scheduled Shorts Uploader for 호기심빛나
 *
 * Features:
 * - OAuth 2.0 Desktop App flow with persistent refresh token (c:\shorts-v2\config\youtube_token.json)
 * - Enforces >= 90 minutes (1.5h) lead time before publishAt
 * - Resumable MP4 upload (videos.insert) with private + publishAt scheduling
 * - Automatic playlist lookup/creation and insertion (playlistItems.insert)
 * - Automatic first comment posting via API (commentThreads.insert) with graceful handling if disabled while private
 * - Graceful stop on quotaExceeded / uploadLimitExceeded
 */

import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { exec } from "node:child_process";

const ROOT_DIR = "c:\\shorts-v2";
const CLIENT_SECRET_PATH = path.join(ROOT_DIR, "config", "client_secret.json");
const TOKEN_PATH = path.join(ROOT_DIR, "config", "youtube_token.json");
const SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube.force-ssl",
];

function loadClientConfig() {
  if (!fs.existsSync(CLIENT_SECRET_PATH)) {
    throw new Error(`Missing client_secret.json at ${CLIENT_SECRET_PATH}`);
  }
  const raw = JSON.parse(fs.readFileSync(CLIENT_SECRET_PATH, "utf8"));
  const cfg = raw.installed || raw.web;
  if (!cfg?.client_id || !cfg?.client_secret) {
    throw new Error("Invalid client_secret.json: missing client_id or client_secret");
  }
  return cfg;
}

function openBrowser(url) {
  const escaped = url.replace(/"/g, '\\"');
  if (process.platform === "win32") {
    exec(`start "" "${escaped}"`);
  } else if (process.platform === "darwin") {
    exec(`open "${escaped}"`);
  } else {
    exec(`xdg-open "${escaped}"`);
  }
}

async function exchangeCodeForToken(cfg, code, redirectUri) {
  const body = new URLSearchParams({
    code,
    client_id: cfg.client_id,
    client_secret: cfg.client_secret,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });
  const res = await fetch(cfg.token_uri || "https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Token exchange failed (${res.status}): ${JSON.stringify(data)}`);
  }
  data.obtained_at = Date.now();
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(data, null, 2), "utf8");
  return data;
}

async function refreshAccessToken(cfg, tokenData) {
  const body = new URLSearchParams({
    client_id: cfg.client_id,
    client_secret: cfg.client_secret,
    refresh_token: tokenData.refresh_token,
    grant_type: "refresh_token",
  });
  const res = await fetch(cfg.token_uri || "https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Token refresh failed (${res.status}): ${JSON.stringify(data)}`);
  }
  const merged = {
    ...tokenData,
    ...data,
    refresh_token: data.refresh_token || tokenData.refresh_token,
    obtained_at: Date.now(),
  };
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(merged, null, 2), "utf8");
  return merged;
}

async function authorizeInteractive(cfg) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      try {
        const reqUrl = new URL(req.url, "http://127.0.0.1");
        const code = reqUrl.searchParams.get("code");
        const err = reqUrl.searchParams.get("error");
        if (err) {
          res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
          res.end(`<h3>인증 실패: ${err}</h3><p>창을 닫고 다시 시도해 주세요.</p>`);
          server.close();
          reject(new Error(`OAuth error: ${err}`));
          return;
        }
        if (code) {
          const addr = server.address();
          const redirectUri = `http://127.0.0.1:${addr.port}`;
          const token = await exchangeCodeForToken(cfg, code, redirectUri);
          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
          res.end("<h3>유튜브 인증이 완료되었습니다!</h3><p>이 창을 닫으셔도 됩니다.</p>");
          server.close();
          resolve(token);
        }
      } catch (e) {
        server.close();
        reject(e);
      }
    });

    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      const redirectUri = `http://127.0.0.1:${addr.port}`;
      const authUrl = new URL(cfg.auth_uri || "https://accounts.google.com/o/oauth2/v2/auth");
      authUrl.searchParams.set("client_id", cfg.client_id);
      authUrl.searchParams.set("redirect_uri", redirectUri);
      authUrl.searchParams.set("response_type", "code");
      authUrl.searchParams.set("scope", SCOPES.join(" "));
      authUrl.searchParams.set("access_type", "offline");
      authUrl.searchParams.set("prompt", "consent");

      console.log("\n=== YouTube OAuth 인증 필요 ===");
      console.log("브라우저가 자동으로 열리지 않으면 아래 URL을 열어 '호기심빛나' 채널 계정으로 로그인해 주세요:");
      console.log(authUrl.toString());
      console.log("================================\n");
      openBrowser(authUrl.toString());
    });
  });
}

async function getAccessToken(forceAuth = false) {
  const cfg = loadClientConfig();
  if (!forceAuth && fs.existsSync(TOKEN_PATH)) {
    const token = JSON.parse(fs.readFileSync(TOKEN_PATH, "utf8"));
    const expiresInMs = (token.expires_in || 3600) * 1000;
    const isExpired = !token.obtained_at || Date.now() - token.obtained_at > expiresInMs - 120_000;
    if (!isExpired && token.access_token) {
      return token.access_token;
    }
    if (token.refresh_token) {
      const refreshed = await refreshAccessToken(cfg, token);
      return refreshed.access_token;
    }
  }
  const token = await authorizeInteractive(cfg);
  return token.access_token;
}

async function ytJson(accessToken, url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    const err = new Error(`YouTube API error ${res.status}: ${JSON.stringify(data)}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

async function getChannelInfo(accessToken) {
  const data = await ytJson(
    accessToken,
    "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true"
  );
  return data.items?.[0] || null;
}

async function listMyPlaylists(accessToken) {
  const items = [];
  let pageToken = "";
  do {
    const url = new URL("https://www.googleapis.com/youtube/v3/playlists");
    url.searchParams.set("part", "snippet,status");
    url.searchParams.set("mine", "true");
    url.searchParams.set("maxResults", "50");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const data = await ytJson(accessToken, url.toString());
    items.push(...(data.items || []));
    pageToken = data.nextPageToken || "";
  } while (pageToken);
  return items;
}

async function ensurePlaylist(accessToken, title, playlistCache) {
  const existing = playlistCache.find((p) => p.snippet?.title === title);
  if (existing) return existing.id;
  const created = await ytJson(
    accessToken,
    "https://www.googleapis.com/youtube/v3/playlists?part=snippet,status",
    {
      method: "POST",
      body: JSON.stringify({
        snippet: {
          title,
          description: `${title} 쇼츠 모음`,
          defaultLanguage: "ko",
        },
        status: { privacyStatus: "public" },
      }),
    }
  );
  playlistCache.push(created);
  return created.id;
}

async function addVideoToPlaylist(accessToken, playlistId, videoId) {
  return ytJson(
    accessToken,
    "https://www.googleapis.com/youtube/v3/playlistItems?part=snippet",
    {
      method: "POST",
      body: JSON.stringify({
        snippet: {
          playlistId,
          resourceId: {
            kind: "youtube#video",
            videoId,
          },
        },
      }),
    }
  );
}

async function postFirstComment(accessToken, videoId, text) {
  return ytJson(
    accessToken,
    "https://www.googleapis.com/youtube/v3/commentThreads?part=snippet",
    {
      method: "POST",
      body: JSON.stringify({
        snippet: {
          videoId,
          topLevelComment: {
            snippet: {
              textOriginal: text,
            },
          },
        },
      }),
    }
  );
}

async function listPlaylistVideoIds(accessToken, playlistId) {
  const videoIds = new Set();
  let pageToken = "";
  do {
    const url = new URL("https://www.googleapis.com/youtube/v3/playlistItems");
    url.searchParams.set("part", "contentDetails");
    url.searchParams.set("playlistId", playlistId);
    url.searchParams.set("maxResults", "50");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const data = await ytJson(accessToken, url.toString());
    for (const item of data.items || []) {
      const vid = item.contentDetails?.videoId;
      if (vid) videoIds.add(vid);
    }
    pageToken = data.nextPageToken || "";
  } while (pageToken);
  return videoIds;
}

async function fetchVideosById(accessToken, videoIds) {
  const byId = new Map();
  for (let i = 0; i < videoIds.length; i += 50) {
    const chunk = videoIds.slice(i, i + 50);
    const url = new URL("https://www.googleapis.com/youtube/v3/videos");
    url.searchParams.set("part", "status,snippet,localizations");
    url.searchParams.set("id", chunk.join(","));
    const data = await ytJson(accessToken, url.toString());
    for (const item of data.items || []) {
      byId.set(item.id, item);
    }
  }
  return byId;
}

function validateLeadTime(publishAtIso) {
  if (!publishAtIso) return;
  const targetMs = Date.parse(publishAtIso);
  if (Number.isNaN(targetMs)) {
    throw new Error(`Invalid publishAt format: ${publishAtIso}`);
  }
  const diffMin = (targetMs - Date.now()) / 60000;
  if (diffMin < 90) {
    throw new Error(
      `publishAt (${publishAtIso}) must be at least 90 minutes (1h 30m) in the future. Current lead: ${diffMin.toFixed(1)} min`
    );
  }
}

async function uploadVideoResumable(accessToken, item) {
  if (!fs.existsSync(item.filePath)) {
    throw new Error(`File not found: ${item.filePath}`);
  }
  validateLeadTime(item.publishAt);

  const fileBuffer = fs.readFileSync(item.filePath);
  const metadata = {
    snippet: {
      title: item.title,
      description: item.description,
      tags: item.tags || ["쇼츠", "Shorts", "과학상식", "호기심빛나"],
      categoryId: item.categoryId || "28",
      defaultLanguage: "ko",
      defaultAudioLanguage: "ko",
    },
    status: {
      privacyStatus: "private",
      ...(item.publishAt ? { publishAt: item.publishAt } : {}),
      selfDeclaredMadeForKids: false,
    },
  };

  const initRes = await fetch(
    "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Length": String(fileBuffer.length),
        "X-Upload-Content-Type": "video/mp4",
      },
      body: JSON.stringify(metadata),
    }
  );

  if (!initRes.ok) {
    const errText = await initRes.text();
    const err = new Error(`Upload init failed (${initRes.status}): ${errText}`);
    err.status = initRes.status;
    err.raw = errText;
    throw err;
  }

  const uploadUrl = initRes.headers.get("location");
  if (!uploadUrl) {
    throw new Error("Missing resumable upload Location header");
  }

  const putRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Length": String(fileBuffer.length),
      "Content-Type": "video/mp4",
    },
    body: fileBuffer,
  });

  const putText = await putRes.text();
  let putData;
  try {
    putData = JSON.parse(putText);
  } catch {
    putData = { raw: putText };
  }
  if (!putRes.ok) {
    const err = new Error(`Upload PUT failed (${putRes.status}): ${putText}`);
    err.status = putRes.status;
    err.data = putData;
    throw err;
  }

  return putData;
}

function isQuotaOrLimitError(err) {
  const msg = `${err?.message || ""} ${err?.raw || ""} ${JSON.stringify(err?.data || "")}`;
  return /quotaExceeded|uploadLimitExceeded|rateLimitExceeded|exceeded the number of videos/i.test(msg);
}

async function main() {
  const args = process.argv.slice(2);
  const cmd = args[0];

  if (cmd === "auth") {
    const token = await getAccessToken(true);
    const ch = await getChannelInfo(token);
    console.log("인증 성공! 연결된 채널:", ch?.snippet?.title, `(${ch?.id})`);
    return;
  }

  if (cmd === "whoami") {
    const token = await getAccessToken(false);
    const ch = await getChannelInfo(token);
    console.log(JSON.stringify({ channelId: ch?.id, title: ch?.snippet?.title }, null, 2));
    return;
  }

  if (cmd === "reschedule") {
    const schedulePath = args[1];
    if (!schedulePath || !fs.existsSync(schedulePath)) {
      throw new Error(`Schedule file not found: ${schedulePath}`);
    }
    const updates = JSON.parse(fs.readFileSync(schedulePath, "utf8"));
    const accessToken = await getAccessToken(false);
    for (const u of updates) {
      validateLeadTime(u.publishAt);
      const res = await ytJson(
        accessToken,
        "https://www.googleapis.com/youtube/v3/videos?part=status",
        {
          method: "PUT",
          body: JSON.stringify({
            id: u.videoId,
            status: {
              privacyStatus: "private",
              publishAt: u.publishAt,
              selfDeclaredMadeForKids: false,
            },
          }),
        }
      );
      console.log(`예약 변경 완료: ${u.videoId} (${u.title || ""}) -> ${res.status?.publishAt}`);
    }
    return;
  }

  if (cmd === "batch") {
    const manifestPath = args[1];
    if (!manifestPath || !fs.existsSync(manifestPath)) {
      throw new Error(`Manifest file not found: ${manifestPath}`);
    }
    const items = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    const accessToken = await getAccessToken(false);
    const ch = await getChannelInfo(accessToken);
    console.log(`업로드 대상 채널: ${ch?.snippet?.title} (${ch?.id})`);

    const playlistCache = await listMyPlaylists(accessToken);
    const results = { channel: ch?.snippet?.title, uploaded: [], remaining: [], stoppedReason: null };

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      console.log(`\n[${i + 1}/${items.length}] 업로드 시작: ${item.title}`);
      try {
        const video = await uploadVideoResumable(accessToken, item);
        const videoId = video.id;
        console.log(`  -> 업로드 완료: https://youtube.com/shorts/${videoId} (예약: ${item.publishAt})`);

        let playlistId = item.playlistId || null;
        if (!playlistId && item.playlistTitle) {
          playlistId = await ensurePlaylist(accessToken, item.playlistTitle, playlistCache);
        }
        if (playlistId) {
          await addVideoToPlaylist(accessToken, playlistId, videoId);
          console.log(`  -> 재생목록 추가 완료: ${item.playlistTitle || playlistId} (${playlistId})`);
        }

        let commentStatus = "skipped";
        let commentError = null;
        if (item.comment) {
          try {
            const c = await postFirstComment(accessToken, videoId, item.comment);
            commentStatus = `posted (${c.id})`;
            console.log(`  -> 첫 댓글 API 작성 완료: ${c.id}`);
          } catch (ce) {
            commentStatus = "deferred_private";
            commentError = ce.message;
            console.log(`  -> 첫 댓글 보류 (예약 비공개 상태 제한 가능성): ${ce.message}`);
          }
        }

        results.uploaded.push({
          title: item.title,
          filePath: item.filePath,
          videoId,
          url: `https://youtube.com/shorts/${videoId}`,
          publishAt: item.publishAt,
          playlistTitle: item.playlistTitle,
          playlistId,
          commentStatus,
          commentError,
        });
      } catch (err) {
        console.error(`  -> 실패: ${err.message}`);
        if (isQuotaOrLimitError(err)) {
          results.stoppedReason = `YouTube upload/quota limit reached: ${err.message}`;
          results.remaining = items.slice(i);
          break;
        }
        results.stoppedReason = err.message;
        results.remaining = items.slice(i);
        break;
      }
    }

    const outPath = path.join(ROOT_DIR, "outputs", "last_upload_results.json");
    fs.writeFileSync(outPath, JSON.stringify(results, null, 2), "utf8");
    console.log(`\n결과 저장: ${outPath}`);
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  if (cmd === "post-due-comments") {
    const manifestPath = args[1] || path.join(ROOT_DIR, "outputs", "upload_manifest_261122.json");
    const statePath = path.join(ROOT_DIR, "outputs", "pinned_comments_state.json");
    if (!fs.existsSync(manifestPath)) {
      throw new Error(`Manifest not found: ${manifestPath}`);
    }
    const items = JSON.parse(fs.readFileSync(manifestPath, "utf8").replace(/^\uFEFF/, ""));
    const state = fs.existsSync(statePath) ? JSON.parse(fs.readFileSync(statePath, "utf8").replace(/^\uFEFF/, "")) : {};
    const withIds = items.filter((it) => it.videoId && it.comment);
    if (withIds.length === 0) {
      console.log(JSON.stringify({ newlyPosted: [], pendingPin: [], message: "No videoIds in manifest" }, null, 2));
      return;
    }

    const accessToken = await getAccessToken(false);
    const videosById = await fetchVideosById(accessToken, withIds.map((it) => it.videoId));
    const newlyPosted = [];
    const pendingPin = [];

    for (const item of withIds) {
      const vid = item.videoId;
      const vData = videosById.get(vid);
      const privacy = vData?.status?.privacyStatus;
      if (privacy !== "public") {
        continue;
      }
      const entry = state[vid] || {
        videoId: vid,
        title: item.title,
        url: `https://www.youtube.com/shorts/${vid}`,
        comment: item.comment,
        pinned: false,
      };
      if (!entry.commentId) {
        const res = await postFirstComment(accessToken, vid, item.comment);
        entry.commentId = res.id;
        entry.postedAt = new Date().toISOString();
        newlyPosted.push({ videoId: vid, title: item.title, commentId: res.id, url: entry.url });
      }
      state[vid] = entry;
      if (!entry.pinned) {
        pendingPin.push({
          videoId: vid,
          title: item.title,
          url: entry.url,
          commentId: entry.commentId,
          comment: item.comment,
        });
      }
    }

    fs.writeFileSync(statePath, JSON.stringify(state, null, 2), "utf8");
    console.log(JSON.stringify({ newlyPosted, pendingPin }, null, 2));
    return;
  }

  if (cmd === "seo-setup") {
    const seoPath = args[1] || path.join(ROOT_DIR, "outputs", "seo_setup_config.json");
    if (!fs.existsSync(seoPath)) {
      throw new Error(`SEO config file not found: ${seoPath}`);
    }
    const cfg = JSON.parse(fs.readFileSync(seoPath, "utf8"));
    const accessToken = await getAccessToken(false);
    const playlistCache = await listMyPlaylists(accessToken);

    const playlistResults = [];
    const playlistItemsCache = new Map();
    for (const pl of cfg.playlists || []) {
      const pid = await ensurePlaylist(accessToken, pl.playlistTitle, playlistCache);
      if (!playlistItemsCache.has(pid)) {
        playlistItemsCache.set(pid, await listPlaylistVideoIds(accessToken, pid));
      }
      const existingSet = playlistItemsCache.get(pid);
      if (existingSet.has(pl.videoId)) {
        playlistResults.push({ videoId: pl.videoId, playlistTitle: pl.playlistTitle, playlistId: pid, status: "already_in_playlist" });
      } else {
        await addVideoToPlaylist(accessToken, pid, pl.videoId);
        existingSet.add(pl.videoId);
        playlistResults.push({ videoId: pl.videoId, playlistTitle: pl.playlistTitle, playlistId: pid, status: "added" });
      }
    }

    const locItems = cfg.localizations || [];
    const videosById = await fetchVideosById(accessToken, locItems.map((x) => x.videoId));
    const localizationResults = [];
    for (const loc of locItems) {
      const existing = videosById.get(loc.videoId);
      if (!existing) {
        localizationResults.push({ videoId: loc.videoId, status: "not_found" });
        continue;
      }
      const snippet = {
        ...existing.snippet,
        defaultLanguage: "ko",
        defaultAudioLanguage: "ko",
      };
      const localizations = {
        ...(existing.localizations || {}),
        en: {
          title: loc.enTitle,
          description: loc.enDescription,
        },
      };
      const updated = await ytJson(
        accessToken,
        "https://www.googleapis.com/youtube/v3/videos?part=snippet,localizations",
        {
          method: "PUT",
          body: JSON.stringify({
            id: loc.videoId,
            snippet,
            localizations,
          }),
        }
      );
      localizationResults.push({
        videoId: loc.videoId,
        title: updated.snippet?.title,
        enTitle: updated.localizations?.en?.title,
        status: "updated",
      });
    }

    const outPath = path.join(ROOT_DIR, "outputs", "last_seo_setup_results.json");
    const summary = { playlistResults, localizationResults };
    fs.writeFileSync(outPath, JSON.stringify(summary, null, 2), "utf8");
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  if (cmd === "delete") {
    const videoId = args[1];
    if (!videoId) throw new Error("Missing videoId");
    const accessToken = await getAccessToken(false);
    const res = await fetch(`https://www.googleapis.com/youtube/v3/videos?id=${videoId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    console.log(`Video ${videoId} delete status:`, res.status);
    return;
  }

  console.log("Usage:");
  console.log("  node tools/youtube-uploader.mjs auth");
  console.log("  node tools/youtube-uploader.mjs whoami");
  console.log("  node tools/youtube-uploader.mjs batch <manifest.json>");
  console.log("  node tools/youtube-uploader.mjs reschedule <schedule.json>");
  console.log("  node tools/youtube-uploader.mjs post-due-comments [manifest.json]");
  console.log("  node tools/youtube-uploader.mjs seo-setup [seo_setup_config.json]");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
