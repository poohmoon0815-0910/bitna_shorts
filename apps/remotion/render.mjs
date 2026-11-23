import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import path from "node:path";
import fs from "node:fs";
import http from "node:http";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const args = process.argv.slice(2);
  let propsPath = null;
  let outputPath = null;

  for (const arg of args) {
    if (arg.startsWith("--props=")) {
      propsPath = arg.replace("--props=", "");
    } else if (arg.startsWith("--output=")) {
      outputPath = arg.replace("--output=", "");
    }
  }

  if (!propsPath || !outputPath) {
    console.error("Usage: node render.mjs --props=<props.json> --output=<output.mp4>");
    process.exit(1);
  }

  const rawProps = JSON.parse(fs.readFileSync(propsPath, "utf-8"));
  console.log(`[Remotion] Loaded props from ${propsPath}`);
  console.log(`[Remotion] Target output: ${outputPath}`);
  console.log(`[Remotion] Video frames: ${rawProps.durationInFrames}, Subtitles count: ${rawProps.subtitles?.length || 0}`);

  const projectRoot = path.resolve(__dirname, "../../");

  // Local media streaming server to eliminate Windows symlink EPERM issues in Remotion copyDir
  const server = http.createServer((req, res) => {
    try {
      const decoded = decodeURIComponent(req.url.split("?")[0]);
      const filePath = path.join(projectRoot, decoded.replace(/^\/+/, ""));
      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        const ext = path.extname(filePath).toLowerCase();
        const mimeTypes = {
          ".mp4": "video/mp4",
          ".wav": "audio/wav",
          ".mp3": "audio/mpeg",
          ".jpg": "image/jpeg",
          ".jpeg": "image/jpeg",
          ".png": "image/png",
        };
        res.setHeader("Content-Type", mimeTypes[ext] || "application/octet-stream");
        res.setHeader("Access-Control-Allow-Origin", "*");
        fs.createReadStream(filePath).pipe(res);
      } else {
        res.statusCode = 404;
        res.end();
      }
    } catch {
      res.statusCode = 500;
      res.end();
    }
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const serverPort = server.address().port;
  const baseUrl = `http://127.0.0.1:${serverPort}`;

  const toUrl = (relPath) => {
    if (!relPath) return relPath;
    if (relPath.startsWith("http://") || relPath.startsWith("https://") || relPath.startsWith("data:")) {
      return relPath;
    }
    const clean = relPath.replace(/^[./\\]+/, "").replace(/\\/g, "/");
    return `${baseUrl}/${clean}`;
  };

  rawProps.videoSrc = toUrl(rawProps.videoSrc);
  rawProps.audioSrc = toUrl(rawProps.audioSrc);
  rawProps.bgmSrc = toUrl(rawProps.bgmSrc);

  console.log("[Remotion] Bundling React composition...");
  const entryPoint = path.resolve(__dirname, "src/index.ts");
  const bundleLocation = await bundle({
    entryPoint,
    publicDir: null, // Bypasses Windows EPERM symlink bug
  });

  try {
    console.log("[Remotion] Selecting composition 'ShortsVideo'...");
    const composition = await selectComposition({
      serveUrl: bundleLocation,
      id: "ShortsVideo",
      inputProps: rawProps,
    });

    console.log(`[Remotion] Rendering ${composition.durationInFrames} frames (${(composition.durationInFrames / 30).toFixed(1)}s)...`);
    const startTime = Date.now();

    await renderMedia({
      composition,
      serveUrl: bundleLocation,
      codec: "h264",
      outputLocation: path.resolve(outputPath),
      inputProps: rawProps,
      concurrency: null,
      onProgress: ({ progress }) => {
        const pct = Math.round(progress * 100);
        if (pct % 10 === 0) {
          process.stdout.write(`\r[Remotion] Progress: ${pct}%`);
        }
      },
    });

    const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n[Remotion] ✅ Successfully rendered to ${outputPath} in ${durationSec}s`);
  } finally {
    server.close();
  }
}

main().catch((err) => {
  console.error("[Remotion] Render failed:", err);
  process.exit(1);
});
