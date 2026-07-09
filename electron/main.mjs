import { app, BrowserWindow, ipcMain, Menu, Tray, dialog, nativeImage } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { deflateSync } from "node:zlib";
import { parseFile } from "music-metadata";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const APP_NAME = "Still";
const APP_ID = "com.still.player";
const APP_ICON_PATH = path.join(__dirname, "../logo/Still_logo_white/Still_logo_white_rounded.ico");
const AUDIO_EXTENSIONS = new Set([".mp3", ".flac", ".wav", ".ogg", ".m4a", ".aac"]);
const STORE_FILE = "still-library.json";
const METADATA_CACHE_FILE = "still-metadata-cache.json";
const COVER_CACHE_DIR = "cover-cache";
const IMPORT_CONCURRENCY = Math.max(2, Math.min(4, Number(process.env.STILL_IMPORT_CONCURRENCY || 4)));

app.setName(APP_NAME);
if (process.platform === "win32") app.setAppUserModelId(APP_ID);

let mainWindow = null;
let desktopLyricWindow = null;
let desktopLyricLockedState = false;
let tray = null;
let isQuitting = false;
const thumbarIconCache = new Map();
let lastTaskbarButtonState = "";
let lastTaskbarTitle = "";
let lastPlayerState = {
  title: APP_NAME,
  artist: "",
  album: "",
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  desktopLyricOpen: false
};

function fileUrlFromPath(filePath) {
  const normalized = filePath.replace(/\\/g, "/");
  const withLeading = normalized.startsWith("/") ? normalized : `/${normalized}`;
  return encodeURI(`file://${withLeading}`);
}

function filePathFromFileUrl(fileUrl) {
  const url = new URL(fileUrl);
  let filePath = decodeURIComponent(url.pathname);
  if (process.platform === "win32" && /^\/[A-Za-z]:/.test(filePath)) filePath = filePath.slice(1);
  return filePath;
}

async function imageSourceToDataUrl(source, target = 512) {
  if (!source || typeof source !== "string") return "";
  if (source.startsWith("data:")) return source;
  let buffer;
  try {
    if (source.startsWith("file://")) {
      buffer = await fs.readFile(filePathFromFileUrl(source));
    } else if (path.isAbsolute(source)) {
      buffer = await fs.readFile(source);
    } else {
      return source;
    }
  } catch {
    return "";
  }
  const image = nativeImage.createFromBuffer(buffer);
  if (image.isEmpty()) return "";
  const size = image.getSize();
  const maxSide = Math.max(size.width, size.height);
  const resized = maxSide > target
    ? image.resize({
        width: Math.max(1, Math.round(size.width * (target / maxSide))),
        height: Math.max(1, Math.round(size.height * (target / maxSide))),
        quality: "best"
      })
    : image;
  return resized.toDataURL();
}

function imageBufferToDataUrl(buffer, target = 1600) {
  const image = nativeImage.createFromBuffer(buffer);
  if (image.isEmpty()) return "";
  const size = image.getSize();
  const maxSide = Math.max(size.width, size.height);
  const resized = maxSide > target
    ? image.resize({
        width: Math.max(1, Math.round(size.width * (target / maxSide))),
        height: Math.max(1, Math.round(size.height * (target / maxSide))),
        quality: "best"
      })
    : image;
  return resized.toDataURL();
}

async function resolveCurrentCover(source, audioPath) {
  if (audioPath && typeof audioPath === "string") {
    try {
      const metadata = await parseFile(audioPath, { skipCovers: false, duration: false });
      const picture = metadata.common.picture?.[0];
      if (picture?.data?.length) {
        const dataUrl = imageBufferToDataUrl(Buffer.from(picture.data), 1600);
        if (dataUrl) return dataUrl;
      }
    } catch {
      // Fall back to cached or folder artwork when the audio file cannot be read.
    }
    try {
      const folderCover = await readFolderCover(audioPath);
      const folderDataUrl = await imageSourceToDataUrl(folderCover, 1600);
      if (folderDataUrl) return folderDataUrl;
    } catch {
      // Ignore missing folder cover.
    }
  }
  return imageSourceToDataUrl(source, 1600);
}

function hashText(value) {
  return createHash("sha1").update(value).digest("hex");
}

async function getCoverCacheDir() {
  const dir = path.join(app.getPath("userData"), COVER_CACHE_DIR);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

async function bufferToCoverUrl(buffer, mime, cacheKey) {
  const image = nativeImage.createFromBuffer(buffer);
  if (!image.isEmpty()) {
    const size = image.getSize();
    const maxSide = Math.max(size.width, size.height);
    const target = 384;
    const resized = maxSide > target
      ? image.resize({
          width: Math.max(1, Math.round(size.width * (target / maxSide))),
          height: Math.max(1, Math.round(size.height * (target / maxSide))),
          quality: "best"
        })
      : image;
    const out = resized.toJPEG(82);
    const coverDir = await getCoverCacheDir();
    const coverPath = path.join(coverDir, `${hashText(`${cacheKey}:${out.length}`)}.jpg`);
    await fs.writeFile(coverPath, out).catch(async (error) => {
      if (error?.code !== "EEXIST") throw error;
    });
    return fileUrlFromPath(coverPath);
  }
  if (buffer.length > 96 * 1024) return undefined;
  return `data:${mime};base64,${buffer.toString("base64")}`;
}

async function dataUrlToCoverUrl(dataUrl, cacheKey) {
  const match = String(dataUrl || "").match(/^data:([^;,]+);base64,(.+)$/);
  if (!match) return undefined;
  return bufferToCoverUrl(Buffer.from(match[2], "base64"), match[1], cacheKey);
}

function normalizeTagText(value) {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) return "";
  if (Array.isArray(value)) {
    return value.map((item) => normalizeTagText(item)).filter(Boolean).join("\n").trim();
  }
  if (value && typeof value === "object") {
    const direct = value.text ?? value.lyrics ?? value.value ?? value.description;
    const directText = normalizeTagText(direct);
    if (directText) return directText;
    return Object.values(value).map((item) => normalizeTagText(item)).filter(Boolean).join("\n").trim();
  }
  return "";
}

function pickNativeTag(native, keys) {
  if (!native) return "";
  const upper = keys.map((key) => key.toUpperCase());
  for (const tags of Object.values(native)) {
    for (const tag of tags || []) {
      if (!upper.includes(String(tag.id || "").toUpperCase())) continue;
      const text = normalizeTagText(tag.value);
      if (text) return text;
    }
  }
  return "";
}

function collectNativeTags(native, keys) {
  if (!native) return [];
  const upper = keys.map((key) => key.toUpperCase());
  const out = [];
  for (const tags of Object.values(native)) {
    for (const tag of tags || []) {
      if (!upper.includes(String(tag.id || "").toUpperCase())) continue;
      const text = normalizeTagText(tag.value);
      if (text) out.push(text);
    }
  }
  return out;
}

function collectCommonLyrics(lyrics) {
  if (!lyrics) return [];
  if (typeof lyrics === "string") return [lyrics.trim()].filter(Boolean);
  if (!Array.isArray(lyrics)) return [normalizeTagText(lyrics)].filter(Boolean);
  return lyrics.map((item) => normalizeTagText(item)).filter(Boolean);
}

function normalizeArtistList(...values) {
  const out = [];
  const visit = (value) => {
    if (!value) return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    const text = normalizeTagText(value);
    if (!text) return;
    text
      .split(/\s*(?:;|\uFF1B|\u3001|,|\uFF0C|\/|\uFF0F|\||\+|&|\band\b|\bfeat\.?\b|\bft\.?\b|\bfeaturing\b)\s*/i)
      .map((item) => item.trim())
      .filter(Boolean)
      .forEach((item) => {
        if (!out.some((existing) => existing.toLowerCase() === item.toLowerCase())) out.push(item);
      });
  };
  values.forEach(visit);
  return out;
}

async function readLocalLyrics(filePath) {
  const dir = path.dirname(filePath);
  const base = path.basename(filePath, path.extname(filePath));
  const names = [
    `${base}.lrc`,
    `${base}.LRC`,
    `${base}.tlrc`,
    `${base}.txt`,
    "lyrics.lrc"
  ];
  const out = [];
  for (const name of names) {
    const lyricPath = path.join(dir, name);
    try {
      const raw = await fs.readFile(lyricPath, "utf8");
      if (raw.trim()) {
        out.push({ label: `鏈湴 ${path.extname(name).replace(".", "").toUpperCase() || "LRC"}`, raw });
      }
    } catch {
      // Ignore missing lyric file.
    }
  }
  return out;
}

async function readFolderCover(filePath) {
  const dir = path.dirname(filePath);
  const names = [
    "cover.jpg",
    "cover.jpeg",
    "cover.png",
    "folder.jpg",
    "folder.jpeg",
    "folder.png",
    "front.jpg",
    "front.png",
    "album.jpg",
    "album.png",
    "artwork.jpg",
    "artwork.png"
  ];
  for (const name of names) {
    const fullPath = path.join(dir, name);
    try {
      const stat = await fs.stat(fullPath);
      if (stat.size) return fileUrlFromPath(fullPath);
    } catch {
      // Ignore missing cover.
    }
  }
  return undefined;
}

async function collectAudioFiles(rootDir) {
  const result = [];
  const stack = [rootDir];
  while (stack.length) {
    const current = stack.pop();
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }
      if (entry.isFile() && AUDIO_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
        result.push(fullPath);
      }
    }
  }
  return result;
}

async function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await mapper(items[currentIndex], currentIndex);
    }
  });
  await Promise.all(workers);
  return results;
}

async function getMetadataCachePath() {
  const dir = app.getPath("userData");
  await fs.mkdir(dir, { recursive: true });
  return path.join(dir, METADATA_CACHE_FILE);
}

async function readMetadataCache() {
  try {
    const raw = await fs.readFile(await getMetadataCachePath(), "utf8");
    const parsed = JSON.parse(raw);
    if (parsed?.version === 1 && parsed.tracks && typeof parsed.tracks === "object") return parsed;
  } catch {
    // Cache misses are expected on first run.
  }
  return { version: 1, tracks: {} };
}

async function writeMetadataCache(cache) {
  await fs.writeFile(await getMetadataCachePath(), JSON.stringify(cache), "utf8").catch(() => {});
}

async function importAudioPaths(inputPaths) {
  const roots = Array.from(new Set((inputPaths || []).filter(Boolean)));
  const tracks = [];
  const metadataCache = await readMetadataCache();
  let cacheChanged = false;
  for (const inputPath of roots) {
    let stat;
    try {
      stat = await fs.stat(inputPath);
    } catch {
      continue;
    }

    const audioFiles = stat.isDirectory()
      ? await collectAudioFiles(inputPath)
      : stat.isFile() && AUDIO_EXTENSIONS.has(path.extname(inputPath).toLowerCase())
        ? [inputPath]
        : [];
    const rootDir = stat.isDirectory() ? inputPath : path.dirname(inputPath);

    const imported = await mapWithConcurrency(audioFiles, IMPORT_CONCURRENCY, async (audioPath) => {
      const fileStat = await fs.stat(audioPath).catch(() => null);
      if (!fileStat) return null;
      const cacheKey = path.resolve(audioPath);
      const cached = metadataCache.tracks[cacheKey];
      const metadata = cached?.size === fileStat.size && cached?.modifiedAt === fileStat.mtimeMs
        ? cached.metadata
        : await parseMetadataFromPath(audioPath, fileStat);
      if (!cached || cached.size !== fileStat.size || cached.modifiedAt !== fileStat.mtimeMs) {
        metadataCache.tracks[cacheKey] = {
          size: fileStat.size,
          modifiedAt: fileStat.mtimeMs,
          metadata
        };
        cacheChanged = true;
      }
      return {
        localPath: audioPath,
        relativePath: path.relative(rootDir, audioPath),
        ...metadata
      };
    });
    tracks.push(...imported.filter(Boolean));
  }
  if (cacheChanged) await writeMetadataCache(metadataCache);
  return tracks;
}

async function parseMetadataFromPath(filePath, knownFileStat) {
  const fileStat = knownFileStat || await fs.stat(filePath).catch(() => null);
  const fileInfo = {
    fileSize: fileStat?.size,
    modifiedAt: fileStat?.mtimeMs,
    createdAt: fileStat?.birthtimeMs,
    extension: path.extname(filePath).replace(".", "").toUpperCase() || undefined
  };
  try {
    const meta = await parseFile(filePath, { skipCovers: false, duration: true });
    const format = meta.format || {};
    const embeddedPicture = meta.common.picture?.[0];
    const nativeCoverTag = pickNativeTag(meta.native, ["METADATA_BLOCK_PICTURE", "APIC"]);
    const embeddedLyrics = [
      ...collectCommonLyrics(meta.common.lyrics),
      ...collectNativeTags(meta.native, [
        "LYRICS",
        "UNSYNCEDLYRICS",
        "UNSYNCED LYRICS",
        "UNSYNCLYRICS",
        "USLT",
        "SYLT",
        "ULT",
        "LYRIC",
        "LYRICSENG",
        "漏LYR"
      ])
    ].filter(Boolean).join("\n");
    const localLyrics = await readLocalLyrics(filePath);
    const nativeTrack = pickNativeTag(meta.native, ["TRACKNUMBER", "TRCK", "TRACK"]);
    const nativeYear = pickNativeTag(meta.native, ["DATE", "YEAR", "TYER", "TDRC"]);

    const coverCacheKey = `${filePath}:${fileInfo.modifiedAt || 0}:${fileInfo.fileSize || 0}`;
    let coverDataUrl;
    if (embeddedPicture?.data?.length && embeddedPicture.format) {
      coverDataUrl = await bufferToCoverUrl(Buffer.from(embeddedPicture.data), embeddedPicture.format, coverCacheKey);
    } else if (typeof nativeCoverTag === "string" && nativeCoverTag.startsWith("data:")) {
      coverDataUrl = await dataUrlToCoverUrl(nativeCoverTag, coverCacheKey);
    } else {
      coverDataUrl = await readFolderCover(filePath);
    }

    const yearMatch = String(meta.common.date || nativeYear || "").match(/(19\d{2}|20\d{2})/);
    const parsedYear = Number(meta.common.year || yearMatch?.[1] || 0);
    const parsedTrack = Number(meta.common.track?.no || String(nativeTrack).split("/")[0] || 0);

    return {
      title: meta.common.title,
      artist: normalizeArtistList(
        meta.common.artists,
        meta.common.artist,
        pickNativeTag(meta.native, ["ARTISTS", "ARTIST", "TPE1", "漏ART"])
      ).join(" / ") || meta.common.albumartist,
      album: meta.common.album,
      year: parsedYear || undefined,
      trackNo: parsedTrack || undefined,
      duration: Number(meta.format.duration || 0),
      container: format.container,
      codec: format.codec,
      bitrate: Number(format.bitrate || 0) || undefined,
      sampleRate: Number(format.sampleRate || 0) || undefined,
      bitsPerSample: Number(format.bitsPerSample || 0) || undefined,
      channels: Number(format.numberOfChannels || 0) || undefined,
      lossless: typeof format.lossless === "boolean" ? format.lossless : undefined,
      tagTypes: Array.isArray(format.tagTypes) ? format.tagTypes : undefined,
      embeddedLyrics: embeddedLyrics || undefined,
      localLyrics,
      coverDataUrl,
      ...fileInfo
    };
  } catch {
    return {
      localLyrics: await readLocalLyrics(filePath),
      coverDataUrl: await readFolderCover(filePath),
      ...fileInfo
    };
  }
}

async function getStorePath() {
  const dir = app.getPath("userData");
  await fs.mkdir(dir, { recursive: true });
  return path.join(dir, STORE_FILE);
}

async function getLegacyStorePath() {
  const dir = app.getPath("userData");
  return path.join(dir, ["star", "music-library.json"].join(""));
}

async function readPersistedState() {
  const filePath = await getStorePath();
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    try {
      const legacyPath = await getLegacyStorePath();
      const raw = await fs.readFile(legacyPath, "utf8");
      await fs.writeFile(filePath, raw, "utf8").catch(() => {});
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
}

async function writePersistedState(state) {
  const filePath = await getStorePath();
  await fs.writeFile(filePath, JSON.stringify(state || {}), "utf8");
  return true;
}

function makeTrayIcon() {
  return nativeImage.createFromPath(APP_ICON_PATH).resize({ width: 16, height: 16 });
}

function formatTrackTitle({ title, artist }, includeAppName = false) {
  const trackTitle = title && title !== APP_NAME ? title : "";
  const trackArtist = artist || "";
  const nowPlaying = trackTitle
    ? `${trackTitle}${trackArtist ? ` - ${trackArtist}` : ""}`
    : APP_NAME;
  return includeAppName && trackTitle ? `${nowPlaying}  | ${APP_NAME}` : nowPlaying;
}

const PNG_CRC_TABLE = new Uint32Array(256).map((_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
  }
  return value >>> 0;
});

function pngCrc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = PNG_CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, "ascii");
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  typeBuffer.copy(chunk, 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE(pngCrc32(Buffer.concat([typeBuffer, data])), 8 + data.length);
  return chunk;
}

function makePngIconBuffer(kind) {
  const size = 32;
  const scale = size / 24;
  const rgba = Buffer.alloc(size * size * 4);
  const setPixel = (x, y, alpha = 255) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const offset = (y * size + x) * 4;
    rgba[offset] = 255;
    rgba[offset + 1] = 255;
    rgba[offset + 2] = 255;
    rgba[offset + 3] = alpha;
  };
  const fillCircle = (cx, cy, radius) => {
    const minX = Math.floor(cx - radius);
    const maxX = Math.ceil(cx + radius);
    const minY = Math.floor(cy - radius);
    const maxY = Math.ceil(cy + radius);
    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        const distance = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
        if (distance <= radius) setPixel(x, y);
      }
    }
  };
  const drawLine = (x1, y1, x2, y2, strokeWidth = 2) => {
    const start = { x: x1 * scale, y: y1 * scale };
    const end = { x: x2 * scale, y: y2 * scale };
    const distance = Math.hypot(end.x - start.x, end.y - start.y);
    const steps = Math.max(1, Math.ceil(distance * 2));
    const radius = (strokeWidth * scale) / 2;
    for (let step = 0; step <= steps; step += 1) {
      const t = step / steps;
      fillCircle(start.x + (end.x - start.x) * t, start.y + (end.y - start.y) * t, radius);
    }
  };
  const drawPolyline = (points) => {
    for (let index = 1; index < points.length; index += 1) {
      drawLine(points[index - 1][0], points[index - 1][1], points[index][0], points[index][1]);
    }
  };

  if (kind === "previous") {
    drawPolyline([[19, 20], [9, 12], [19, 4], [19, 20]]);
    drawLine(5, 19, 5, 5);
  } else if (kind === "pause") {
    drawLine(8, 5, 8, 19);
    drawLine(16, 5, 16, 19);
  } else if (kind === "next") {
    drawPolyline([[5, 4], [15, 12], [5, 20], [5, 4]]);
    drawLine(19, 5, 19, 19);
  } else {
    drawPolyline([[8, 5], [19, 12], [8, 19], [8, 5]]);
  }

  const scanlines = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y += 1) {
    scanlines[y * (size * 4 + 1)] = 0;
    rgba.copy(scanlines, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(scanlines)),
    pngChunk("IEND", Buffer.alloc(0))
  ]);
}

function makeThumbarIcon(kind) {
  if (thumbarIconCache.has(kind)) return thumbarIconCache.get(kind);
  const icon = nativeImage.createFromBuffer(makePngIconBuffer(kind)).resize({ width: 16, height: 16, quality: "best" });
  thumbarIconCache.set(kind, icon);
  return icon;
}

function updateTaskbarControls() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const hasTrack = Boolean(lastPlayerState.title && lastPlayerState.title !== APP_NAME);
  const tooltip = formatTrackTitle(lastPlayerState, hasTrack);
  const windowTitle = formatTrackTitle(lastPlayerState, hasTrack);
  const duration = Number(lastPlayerState.duration || 0);
  const currentTime = Number(lastPlayerState.currentTime || 0);
  if (windowTitle !== lastTaskbarTitle) {
    mainWindow.setTitle(windowTitle);
    lastTaskbarTitle = windowTitle;
  }
  mainWindow.setThumbnailToolTip(tooltip);
  mainWindow.setProgressBar(duration > 0 ? Math.max(0, Math.min(1, currentTime / duration)) : -1);
  const buttonState = `${Boolean(lastPlayerState.isPlaying)}`;
  if (buttonState !== lastTaskbarButtonState) {
    mainWindow.setThumbarButtons([
      { tooltip: "上一首", icon: makeThumbarIcon("previous"), click: () => sendPlayerCommand("previous") },
      { tooltip: lastPlayerState.isPlaying ? "暂停" : "播放", icon: makeThumbarIcon(lastPlayerState.isPlaying ? "pause" : "play"), click: () => sendPlayerCommand("play-pause") },
      { tooltip: "下一首", icon: makeThumbarIcon("next"), click: () => sendPlayerCommand("next") }
    ]);
    lastTaskbarButtonState = buttonState;
  }
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) createWindow();
  if (!mainWindow) return;
  mainWindow.show();
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
  if (desktopLyricWindow && !desktopLyricWindow.isDestroyed()) {
    desktopLyricWindow.setAlwaysOnTop(true, "screen-saver");
    desktopLyricWindow.moveTop();
  }
}

function sendPlayerCommand(command, options = {}) {
  if (options.showWindow) showMainWindow();
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const send = () => mainWindow?.webContents.send("player:command", command);
  if (mainWindow.webContents.isLoading()) {
    mainWindow.webContents.once("did-finish-load", send);
  } else {
    send();
  }
}

function applyDesktopLyricLock(locked, notify = false) {
  desktopLyricLockedState = Boolean(locked);
  if (!desktopLyricWindow || desktopLyricWindow.isDestroyed()) return;
  if (notify) {
    desktopLyricWindow.webContents.send("desktop-lyrics:data", { locked: desktopLyricLockedState });
  }
}

function updateTrayMenu() {
  if (!tray) return;
  const nowPlayingLabel = lastPlayerState.title && lastPlayerState.title !== APP_NAME
    ? `正在播放：${formatTrackTitle(lastPlayerState)}`
    : "正在播放：未播放";
  tray.setToolTip(formatTrackTitle(lastPlayerState));
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: nowPlayingLabel, enabled: false },
    { type: "separator" },
    {
      label: "桌面歌词",
      type: "checkbox",
      checked: Boolean(lastPlayerState.desktopLyricOpen),
      click: () => sendPlayerCommand("desktop-toggle")
    },
    { type: "separator" },
    { label: `显示 ${APP_NAME}`, click: showMainWindow },
    { type: "separator" },
    {
      label: lastPlayerState.isPlaying ? "暂停" : "播放",
      click: () => sendPlayerCommand("play-pause")
    },
    { label: "上一首", click: () => sendPlayerCommand("previous") },
    { label: "下一首", click: () => sendPlayerCommand("next") },
    { type: "separator" },
    {
      label: "退出",
      click: () => {
        isQuitting = true;
        if (desktopLyricWindow && !desktopLyricWindow.isDestroyed()) desktopLyricWindow.destroy();
        app.quit();
      }
    }
  ]));
}

function createTray() {
  if (tray) return;
  tray = new Tray(makeTrayIcon());
  tray.on("click", showMainWindow);
  updateTrayMenu();
}

function createDesktopLyricWindow() {
  if (desktopLyricWindow && !desktopLyricWindow.isDestroyed()) return desktopLyricWindow;
  desktopLyricWindow = new BrowserWindow({
    width: 920,
    height: 170,
    minWidth: 520,
    minHeight: 116,
    frame: false,
    transparent: true,
    hasShadow: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: true,
    backgroundColor: "#00000000",
    webPreferences: {
      preload: path.join(__dirname, "preload.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false
    }
  });

  desktopLyricWindow.setAlwaysOnTop(true, "screen-saver");
  desktopLyricWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    @property --word-progress { syntax: "<percentage>"; inherits: true; initial-value: 0%; }
    html, body { margin: 0; width: 100%; height: 100%; background: transparent !important; overflow: hidden; font-family: "Segoe UI", "Microsoft YaHei", sans-serif; user-select: none; -webkit-user-select: none; }
    #app { height: 100%; display: flex; align-items: center; padding: 10px; box-sizing: border-box; background: transparent !important; }
    .panel { -webkit-app-region: drag; position: relative; isolation: isolate; contain: paint; width: 100%; min-height: 88px; border: 1px solid rgba(255,255,255,.16); border-radius: 18px; background: rgba(8,10,18,.58); background-clip: padding-box; box-shadow: inset 0 1px 0 rgba(255,255,255,.14), inset 0 -1px 0 rgba(0,0,0,.18); backdrop-filter: blur(18px); padding: 12px 14px; color: white; box-sizing: border-box; overflow: hidden; user-select: none; -webkit-user-select: none; transition: background .18s ease, border-color .18s ease, box-shadow .18s ease, backdrop-filter .18s ease; }
    .panel.idle { background: rgba(8,10,18,.01); border-color: transparent; box-shadow: none; backdrop-filter: none; }
    .panel.idle .top { opacity: 0; pointer-events: none; }
    .panel.idle.controls-active .top { opacity: 1; pointer-events: auto; }
    .locked { background: transparent; border-color: transparent; box-shadow: none; backdrop-filter: none; }
    .locked, .locked .top, .locked .lyric, .locked .translation { -webkit-app-region: no-drag; }
    .locked.idle { background: transparent; border-color: transparent; box-shadow: none; backdrop-filter: none; }
    .top { -webkit-app-region: drag; position: relative; display: flex; align-items: center; justify-content: space-between; gap: 12px; transition: opacity .16s ease; }
    .meta { display: flex; align-items: center; min-width: 0; gap: 10px; }
    .cover-box { width: 40px; height: 40px; border-radius: 8px; background: rgba(255,255,255,.1); color: rgba(255,255,255,.66); display: grid; place-items: center; overflow: hidden; flex: 0 0 auto; }
    .cover-box img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .cover-box svg { width: 22px; height: 22px; display: none; }
    .cover-box.empty img { display: none; }
    .cover-box.empty svg { display: block; }
    .title { font-size: 13px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .artist { margin-top: 2px; font-size: 11px; color: rgba(255,255,255,.66); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .playback-controls { -webkit-app-region: no-drag; position: absolute; left: 50%; top: 50%; display: flex; align-items: center; gap: 8px; transform: translate(-50%, -50%); }
    .window-controls { -webkit-app-region: no-drag; display: flex; gap: 6px; margin-left: auto; }
    button { width: 28px; height: 28px; display: inline-grid; place-items: center; border-radius: 999px; border: 1px solid rgba(255,255,255,.16); background: rgba(255,255,255,.08); color: white; cursor: pointer; line-height: 1; padding: 0; }
    button svg { width: 16px; height: 16px; stroke: currentColor; fill: none; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
    .playback-controls button { width: 30px; height: 30px; background: rgba(255,255,255,.1); }
    .playback-controls #play { width: 36px; height: 36px; background: rgba(255,255,255,.16); }
    .playback-controls #play svg { width: 18px; height: 18px; }
    button:hover { border-color: rgba(255,255,255,.42); }
    button:focus { outline: none; }
    button:focus-visible { outline: 2px solid rgba(255,255,255,.45); outline-offset: 2px; }
    .lyric { -webkit-app-region: drag; position: relative; margin-top: 10px; min-height: calc(var(--font-size, 30px) * 1.48); padding: 5px 0 8px; overflow: hidden; box-sizing: content-box; }
    .translation { -webkit-app-region: drag; position: relative; margin-top: 3px; min-height: calc(var(--second-line-size, 24px) * 1.42); padding: 3px 0 7px; overflow: hidden; box-sizing: content-box; }
    .desktop-line { display: block; width: 100%; text-align: center; font-size: var(--font-size, 30px); line-height: 1.24; font-weight: var(--font-weight, 700); color: var(--played-color, #00b7c3); -webkit-text-stroke: 1px var(--stroke-color, rgba(0,0,0,.69)); paint-order: stroke fill; text-shadow: 1px 0 0 var(--stroke-color, rgba(0,0,0,.69)), -1px 0 0 var(--stroke-color, rgba(0,0,0,.69)), 0 1px 0 var(--stroke-color, rgba(0,0,0,.69)), 0 -1px 0 var(--stroke-color, rgba(0,0,0,.69)), 1px 1px 0 var(--stroke-color, rgba(0,0,0,.69)), -1px 1px 0 var(--stroke-color, rgba(0,0,0,.69)), 1px -1px 0 var(--stroke-color, rgba(0,0,0,.69)), -1px -1px 0 var(--stroke-color, rgba(0,0,0,.69)); white-space: nowrap; overflow: visible; text-overflow: clip; transition: color .16s ease, text-shadow .16s ease, -webkit-text-stroke-color .16s ease, --word-progress .06s linear; will-change: opacity, transform; transform: translate3d(0,0,0); backface-visibility: hidden; -webkit-font-smoothing: antialiased; text-rendering: geometricPrecision; }
    .desktop-line.current { position: relative; }
    .desktop-line.ghost { position: absolute; left: 0; right: 0; top: 0; height: auto; opacity: 0; transform: translate3d(0,28px,0); pointer-events: none; }
    .measure-line { position: absolute; left: -99999px; top: -99999px; width: auto; min-width: 0; visibility: hidden; pointer-events: none; }
    .lyric > .desktop-line.ghost { top: 3px; }
    .translation > .desktop-line.ghost { top: 2px; }
    .desktop-line.no-transition { transition: none !important; }
    .desktop-line.out { opacity: 0; transform: translate3d(0,-22px,0); }
    .desktop-line.in { opacity: 1; transform: translate3d(0,0,0); }
    .desktop-line.word { position: relative; color: transparent; -webkit-text-fill-color: transparent; -webkit-text-stroke: 0 transparent; text-shadow: none; background: none; filter: none; }
    .desktop-line.word::before, .desktop-line.word::after { content: attr(data-text); position: absolute; inset: 0; width: 100%; overflow: hidden; -webkit-text-stroke: 1px var(--stroke-color, rgba(0,0,0,.69)); paint-order: stroke fill; text-shadow: 1px 0 0 var(--stroke-color, rgba(0,0,0,.69)), -1px 0 0 var(--stroke-color, rgba(0,0,0,.69)), 0 1px 0 var(--stroke-color, rgba(0,0,0,.69)), 0 -1px 0 var(--stroke-color, rgba(0,0,0,.69)), 1px 1px 0 var(--stroke-color, rgba(0,0,0,.69)), -1px 1px 0 var(--stroke-color, rgba(0,0,0,.69)), 1px -1px 0 var(--stroke-color, rgba(0,0,0,.69)), -1px -1px 0 var(--stroke-color, rgba(0,0,0,.69)); white-space: nowrap; text-align: inherit; pointer-events: none; }
    .desktop-line.word::before { clip-path: inset(0 0 0 var(--word-progress, 0%)); color: var(--pending-color, #ccc); -webkit-text-fill-color: var(--pending-color, #ccc); }
    .desktop-line.word::after { clip-path: inset(0 calc(100% - var(--word-progress, 0%)) 0 0); color: var(--played-color, #00b7c3); -webkit-text-fill-color: var(--played-color, #00b7c3); }
    .translation .desktop-line { font-size: var(--second-line-size, 24px); font-weight: 700; color: var(--pending-color, #ccc); }
    .translation.empty { display: none; }
    .translation.promoting { overflow: visible; }
    .promotion-line { position: absolute; z-index: 3; opacity: 0; pointer-events: none; transform-origin: center center; contain: paint; overflow: visible; text-overflow: clip; }
  </style>
</head>
<body>
  <div id="app">
    <div id="panel" class="panel">
      <div class="top">
        <div class="meta">
          <span id="coverBox" class="cover-box empty">
            <img id="cover" />
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <circle cx="8" cy="18" r="4"></circle>
              <path d="M12 18V2l7 4"></path>
            </svg>
          </span>
          <div style="min-width:0">
            <div id="title" class="title">Still</div>
            <div id="artist" class="artist"></div>
          </div>
        </div>
        <div class="playback-controls">
          <button title="Previous" onclick="window.electronAPI.desktopLyrics.sendCommand('previous')"><svg viewBox="0 0 24 24"><path d="M19 20 9 12l10-8v16z"></path><path d="M5 19V5"></path></svg></button>
          <button id="play" title="Play / pause" onclick="window.electronAPI.desktopLyrics.sendCommand('play-pause')"><svg viewBox="0 0 24 24"><path d="m8 5 11 7-11 7V5z"></path></svg></button>
          <button title="Next" onclick="window.electronAPI.desktopLyrics.sendCommand('next')"><svg viewBox="0 0 24 24"><path d="m5 4 10 8-10 8V4z"></path><path d="M19 5v14"></path></svg></button>
        </div>
        <div class="window-controls">
          <button id="lock" title="Lock / unlock" onclick="window.electronAPI.desktopLyrics.sendCommand('lock-toggle')"><svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="10" rx="2"></rect><path d="M8 11V8a4 4 0 0 1 7.4-2.1"></path></svg></button>
          <button title="Desktop lyric settings" onclick="window.electronAPI.desktopLyrics.sendCommand('desktop-settings')"><svg viewBox="0 0 24 24"><path d="M12 15.5A3.5 3.5 0 1 0 12 8a3.5 3.5 0 0 0 0 7.5z"></path><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.2a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.2a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1A2 2 0 1 1 7.1 4.3l.1.1a1.7 1.7 0 0 0 1.8.3 1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.2a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8 1.7 1.7 0 0 0 1.5 1h.2a2 2 0 1 1 0 4h-.2a1.7 1.7 0 0 0-1.4 1z"></path></svg></button>
          <button title="Close" onclick="window.electronAPI.desktopLyrics.sendCommand('close')"><svg viewBox="0 0 24 24"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg></button>
        </div>
      </div>
      <div id="lyric" class="lyric">
        <span id="lyricCurrent" class="desktop-line current">...</span>
        <span id="lyricGhost" class="desktop-line ghost"></span>
      </div>
      <div id="translation" class="translation">
        <span id="translationCurrent" class="desktop-line current"></span>
        <span id="translationGhost" class="desktop-line ghost"></span>
      </div>
      <span id="promotedLine" class="desktop-line promotion-line"></span>
      <span id="lineMeasure" class="desktop-line measure-line"></span>
    </div>
  </div>
  <script>
    const appRoot = document.getElementById('app');
    const panel = document.getElementById('panel');
    const translation = document.getElementById('translation');
    let idleTimer = 0;
    let pointerInside = false;
    let pointerOnControls = false;
    const setIdle = (idle) => panel.classList.toggle('idle', idle);
    const setControlsActive = (active) => panel.classList.toggle('controls-active', active);
    const queueIdle = (delay = 1050) => {
      window.clearTimeout(idleTimer);
      idleTimer = window.setTimeout(() => {
        if (!pointerOnControls) setIdle(true);
      }, delay);
    };
    const showPanel = () => {
      pointerInside = true;
      window.clearTimeout(idleTimer);
      setIdle(false);
      if (!pointerOnControls) queueIdle();
    };
    const scheduleIdle = () => {
      pointerInside = false;
      queueIdle(650);
    };
    appRoot.addEventListener('pointerenter', showPanel);
    appRoot.addEventListener('pointerover', showPanel);
    appRoot.addEventListener('mousemove', showPanel);
    appRoot.addEventListener('pointerleave', scheduleIdle);
    document.addEventListener('mousemove', showPanel);
    document.querySelectorAll('.playback-controls, .window-controls').forEach((node) => {
      node.addEventListener('pointerenter', () => {
        pointerOnControls = true;
        setControlsActive(true);
        showPanel();
      });
      node.addEventListener('pointerleave', () => {
        pointerOnControls = false;
        setControlsActive(false);
        scheduleIdle();
      });
      node.addEventListener('pointerdown', showPanel);
    });
    scheduleIdle();

    const lyric = document.getElementById('lyric');
    const lyricCurrent = document.getElementById('lyricCurrent');
    const lyricGhost = document.getElementById('lyricGhost');
    const translationCurrent = document.getElementById('translationCurrent');
    const translationGhost = document.getElementById('translationGhost');
    const promotedLine = document.getElementById('promotedLine');
    const lineMeasure = document.getElementById('lineMeasure');
    const animationTimers = new WeakMap();
    const animationTokens = new WeakMap();
    const pendingTexts = new WeakMap();
    const marqueeAnimations = new WeakMap();
    const marqueeFrames = new WeakMap();
    let pairPending = null;
    let lastPrimaryText = '';
    let lastSecondText = '';
    const clearMarquee = (node) => {
      const frame = marqueeFrames.get(node);
      if (frame) window.cancelAnimationFrame(frame);
      marqueeFrames.delete(node);
      const animation = marqueeAnimations.get(node);
      if (animation) animation.cancel();
      marqueeAnimations.delete(node);
      delete node.dataset.marquee;
      node.style.transform = '';
    };
    const updateMarquee = (node, delay = 720) => {
      if (!node || node.classList.contains('ghost') || node === promotedLine) return;
      clearMarquee(node);
      const frame = window.requestAnimationFrame(() => {
        marqueeFrames.delete(node);
        if (!node.textContent || node.style.opacity === '0') return;
        const style = getComputedStyle(node);
        lineMeasure.textContent = node.textContent;
        lineMeasure.style.fontFamily = style.fontFamily;
        lineMeasure.style.fontSize = style.fontSize;
        lineMeasure.style.fontWeight = style.fontWeight;
        lineMeasure.style.letterSpacing = style.letterSpacing;
        lineMeasure.style.lineHeight = style.lineHeight;
        const textWidth = lineMeasure.getBoundingClientRect().width + 12;
        const overflow = textWidth - node.clientWidth;
        if (overflow <= 8) return;
        node.dataset.marquee = 'true';
        node.classList.remove('word');
        node.style.removeProperty('--word-progress');
        const distance = Math.ceil(overflow / 2) + 18;
        const duration = Math.max(7200, Math.min(22000, (overflow + node.clientWidth) * 30));
        const animation = node.animate([
          { transform: 'translate3d(' + distance + 'px,0,0)', offset: 0 },
          { transform: 'translate3d(' + distance + 'px,0,0)', offset: 0.12 },
          { transform: 'translate3d(-' + distance + 'px,0,0)', offset: 0.88 },
          { transform: 'translate3d(-' + distance + 'px,0,0)', offset: 1 }
        ], {
          delay,
          duration,
          iterations: Infinity,
          easing: 'linear'
        });
        marqueeAnimations.set(node, animation);
      });
      marqueeFrames.set(node, frame);
    };
    const setLineText = (node, value) => {
      const text = value || '';
      node.textContent = text;
      node.dataset.text = text;
    };
    const clearAnimation = (current, ghost) => {
      clearMarquee(current);
      clearMarquee(ghost);
      const timers = animationTimers.get(current);
      if (timers?.settleTimer) window.clearTimeout(timers.settleTimer);
      if (timers?.outAnimation) timers.outAnimation.cancel();
      if (timers?.inAnimation) timers.inAnimation.cancel();
      current.classList.remove('out', 'no-transition');
      ghost.classList.remove('in', 'no-transition');
      current.style.opacity = '';
      current.style.transform = '';
      current.style.transformOrigin = '';
      current.style.fontSize = '';
      current.style.lineHeight = '';
      current.style.height = '';
      current.style.fontWeight = '';
      current.style.color = '';
      current.style.removeProperty('--word-progress');
      ghost.style.opacity = '';
      ghost.style.transform = '';
      ghost.style.transformOrigin = '';
      ghost.style.fontSize = '';
      ghost.style.lineHeight = '';
      ghost.style.height = '';
      ghost.style.fontWeight = '';
      ghost.style.color = '';
      ghost.style.removeProperty('--word-progress');
      setLineText(ghost, '');
      animationTimers.delete(current);
      animationTokens.delete(current);
    };
    const setText = (current, ghost, value, animated) => {
      const next = value || '';
      if (pendingTexts.get(current) === next) return;
      if (current.textContent === next && !pendingTexts.has(current)) {
        if (!marqueeAnimations.has(current) && !marqueeFrames.has(current)) updateMarquee(current);
        return;
      }
      if (!animated) {
        clearAnimation(current, ghost);
        pendingTexts.delete(current);
        setLineText(current, next);
        updateMarquee(current);
        return;
      }
      clearAnimation(current, ghost);
      const token = Symbol('desktop-lyric-transition');
      pendingTexts.set(current, next);
      animationTokens.set(current, token);
      setLineText(ghost, next);
      const currentHeight = current.getBoundingClientRect().height || Number.parseFloat(getComputedStyle(current).fontSize) || 40;
      const slide = Math.max(18, Math.min(42, currentHeight * 0.62));
      const duration = 430;
      const timing = { duration, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'forwards' };
      const incomingWordProgress = getComputedStyle(current).getPropertyValue('--word-progress') || '0%';
      current.style.opacity = '1';
      current.style.transform = 'translate3d(0,0,0)';
      ghost.style.opacity = '0';
      ghost.style.transform = 'translate3d(0,' + slide + 'px,0)';
      if (current.classList.contains('word')) {
        current.style.setProperty('--word-progress', '100%');
        ghost.style.setProperty('--word-progress', incomingWordProgress);
      }
      void ghost.offsetWidth;
      const outAnimation = current.animate([
        { opacity: 1, transform: 'translate3d(0,0,0)' },
        { opacity: 0, transform: 'translate3d(0,-' + slide + 'px,0)' }
      ], timing);
      const inAnimation = ghost.animate([
        { opacity: 0, transform: 'translate3d(0,' + slide + 'px,0)' },
        { opacity: 1, transform: 'translate3d(0,0,0)' }
      ], timing);
      const settle = () => {
        if (animationTokens.get(current) !== token) return;
        setLineText(current, next);
        current.style.opacity = '1';
        current.style.transform = 'translate3d(0,0,0)';
        ghost.style.opacity = '0';
        ghost.style.transform = 'translate3d(0,0,0)';
        outAnimation.cancel();
        inAnimation.cancel();
        current.style.opacity = '';
        current.style.transform = '';
        current.style.lineHeight = '';
        current.style.height = '';
        current.style.fontWeight = '';
        current.style.color = '';
        current.style.removeProperty('--word-progress');
        setLineText(ghost, '');
        ghost.style.opacity = '';
        ghost.style.transform = '';
        ghost.style.lineHeight = '';
        ghost.style.height = '';
        ghost.style.fontWeight = '';
        ghost.style.color = '';
        ghost.style.removeProperty('--word-progress');
        pendingTexts.delete(current);
        animationTimers.delete(current);
        animationTokens.delete(current);
        updateMarquee(current);
      };
      const settleTimer = window.setTimeout(settle, duration + 60);
      Promise.allSettled([outAnimation.finished, inAnimation.finished]).then(settle);
      animationTimers.set(current, { outAnimation, inAnimation, settleTimer });
    };
    const clearPairAnimation = () => {
      if (!pairPending) return;
      if (pairPending.settleTimer) window.clearTimeout(pairPending.settleTimer);
      pairPending.animations.forEach((animation) => animation.cancel());
      [lyricCurrent, translationCurrent, translationGhost].forEach((node) => {
        clearMarquee(node);
        node.style.opacity = '';
        node.style.transform = '';
        node.style.transformOrigin = '';
        node.style.fontSize = '';
        node.style.lineHeight = '';
        node.style.height = '';
        node.style.fontWeight = '';
        node.style.color = '';
        node.style.removeProperty('--word-progress');
      });
      setLineText(promotedLine, '');
      clearMarquee(promotedLine);
      promotedLine.classList.remove('word');
      promotedLine.style.cssText = '';
      translationCurrent.classList.remove('word');
      setLineText(translationGhost, '');
      translation.classList.remove('promoting');
      pairPending = null;
    };
    const setDesktopLines = (primary, second, options) => {
      const animated = Boolean(options?.animated);
      const queueOriginals = Boolean(options?.queueOriginals);
      const wordByWord = Boolean(options?.wordByWord);
      const wordProgress = Math.max(0, Math.min(100, Number(options?.wordProgress || 0))) + '%';
      const nextPrimary = primary || '...';
      const nextSecond = second || '';
      if (pairPending?.primary === nextPrimary) {
        if (pairPending.second !== nextSecond) {
          pairPending.second = nextSecond;
          setLineText(translationGhost, nextSecond);
        }
        promotedLine.classList.toggle('word', wordByWord);
        if (wordByWord) promotedLine.style.setProperty('--word-progress', wordProgress);
        else promotedLine.style.removeProperty('--word-progress');
        pairPending.wordByWord = wordByWord;
        pairPending.wordProgress = wordProgress;
        return;
      }
      const canPromoteSecond = false;
      if (!canPromoteSecond) {
        clearPairAnimation();
        setText(lyricCurrent, lyricGhost, nextPrimary, animated);
        setText(translationCurrent, translationGhost, nextSecond, animated);
        lastPrimaryText = nextPrimary;
        lastSecondText = nextSecond;
        return;
      }
      clearAnimation(lyricCurrent, lyricGhost);
      clearAnimation(translationCurrent, translationGhost);
      clearPairAnimation();
      const lyricRect = lyricCurrent.getBoundingClientRect();
      const secondRect = translationCurrent.getBoundingClientRect();
      const panelRect = panel.getBoundingClientRect();
      const primaryStyle = getComputedStyle(lyricCurrent);
      const secondStyle = getComputedStyle(translationCurrent);
      const mainSlide = Math.max(20, Math.min(44, lyricRect.height * 0.64));
      const secondSlide = Math.max(16, Math.min(36, secondRect.height * 0.72));
      const primaryFontSize = Number.parseFloat(primaryStyle.fontSize) || 30;
      const secondFontSize = Number.parseFloat(secondStyle.fontSize) || primaryFontSize;
      const promoteStartScale = Math.max(0.5, Math.min(1, secondFontSize / primaryFontSize));
      const promoteStart = {
        left: secondRect.left - panelRect.left,
        top: secondRect.top - panelRect.top,
        width: secondRect.width,
        height: secondRect.height
      };
      const promoteEnd = {
        left: lyricRect.left - panelRect.left,
        top: lyricRect.top - panelRect.top,
        width: lyricRect.width,
        height: lyricRect.height
      };
      const promoteBoxHeight = Math.max(promoteStart.height, promoteEnd.height) + 10;
      const duration = 440;
      const timing = { duration, easing: 'cubic-bezier(.2,1,.32,1)', fill: 'forwards' };
      translation.classList.add('promoting');
      setLineText(translationGhost, nextSecond);
      lyricCurrent.style.opacity = '1';
      lyricCurrent.style.transform = 'translate3d(0,0,0)';
      const oldMainHadWord = lyricCurrent.classList.contains('word');
      if (oldMainHadWord) {
        lyricCurrent.classList.remove('word');
        lyricCurrent.style.color = getComputedStyle(panel).getPropertyValue('--played-color').trim() || '#00b7c3';
      }
      translationCurrent.style.opacity = '0';
      setLineText(promotedLine, nextPrimary);
      promotedLine.style.left = promoteStart.left + 'px';
      promotedLine.style.top = promoteStart.top + 'px';
      promotedLine.style.width = promoteStart.width + 'px';
      promotedLine.style.height = promoteBoxHeight + 'px';
      promotedLine.style.fontSize = primaryStyle.fontSize;
      promotedLine.style.lineHeight = primaryStyle.lineHeight;
      promotedLine.style.fontWeight = primaryStyle.fontWeight;
      promotedLine.style.color = wordByWord ? secondStyle.color : primaryStyle.color;
      promotedLine.style.opacity = '1';
      promotedLine.style.transformOrigin = 'center top';
      promotedLine.style.transform = 'scale(' + promoteStartScale + ')';
      translationGhost.style.opacity = '0';
      translationGhost.style.transform = 'translate3d(0,' + secondSlide + 'px,0)';
      if (wordByWord) {
        lyricCurrent.style.setProperty('--word-progress', '100%');
        promotedLine.classList.add('word');
        promotedLine.style.setProperty('--word-progress', wordProgress);
      } else {
        promotedLine.classList.remove('word');
        promotedLine.style.removeProperty('--word-progress');
      }
      void translationGhost.offsetWidth;
      const oldMain = lyricCurrent.animate([
        { opacity: 1, transform: 'translate3d(0,0,0)' },
        { opacity: 0, transform: 'translate3d(0,-' + mainSlide + 'px,0)' }
      ], timing);
      const promoted = promotedLine.animate([
        {
          opacity: 1,
          left: promoteStart.left + 'px',
          top: promoteStart.top + 'px',
          width: promoteStart.width + 'px',
          height: promoteBoxHeight + 'px',
          color: wordByWord ? secondStyle.color : primaryStyle.color,
          transform: 'scale(' + promoteStartScale + ')'
        },
        {
          opacity: 1,
          left: promoteEnd.left + 'px',
          top: promoteEnd.top + 'px',
          width: promoteEnd.width + 'px',
          height: promoteBoxHeight + 'px',
          color: wordByWord ? secondStyle.color : primaryStyle.color,
          transform: 'scale(1)'
        }
      ], timing);
      const incomingSecond = translationGhost.animate([
        { opacity: 0, transform: 'translate3d(0,' + secondSlide + 'px,0)' },
        { opacity: 1, transform: 'translate3d(0,0,0)' }
      ], timing);
      const settle = () => {
        if (pairPending?.primary !== nextPrimary) return;
        const finalSecond = pairPending.second;
        setLineText(lyricCurrent, nextPrimary);
        setLineText(translationCurrent, finalSecond);
        setLineText(translationGhost, '');
        lyricCurrent.style.opacity = '1';
        lyricCurrent.style.transform = 'translate3d(0,0,0)';
        translationCurrent.style.opacity = '1';
        translationCurrent.style.transform = 'translate3d(0,0,0)';
        translationGhost.style.opacity = '0';
        translationGhost.style.transform = 'translate3d(0,0,0)';
        oldMain.cancel();
        promoted.cancel();
        incomingSecond.cancel();
        [lyricCurrent, translationCurrent, translationGhost].forEach((node) => {
          node.style.opacity = '';
          node.style.transform = '';
          node.style.transformOrigin = '';
          node.style.fontSize = '';
          node.style.lineHeight = '';
          node.style.height = '';
          node.style.fontWeight = '';
          node.style.color = '';
          node.style.removeProperty('--word-progress');
        });
        const finalWordByWord = Boolean(pairPending?.wordByWord);
        const finalWordProgress = pairPending?.wordProgress || wordProgress;
        lyricCurrent.classList.toggle('word', finalWordByWord);
        if (finalWordByWord) lyricCurrent.style.setProperty('--word-progress', finalWordProgress);
        setLineText(promotedLine, '');
        promotedLine.classList.remove('word');
        promotedLine.style.cssText = '';
        translationCurrent.classList.remove('word');
        translation.classList.remove('promoting');
        pairPending = null;
        lastPrimaryText = nextPrimary;
        lastSecondText = finalSecond;
        updateMarquee(lyricCurrent);
        updateMarquee(translationCurrent);
      };
      const settleTimer = window.setTimeout(settle, duration + 70);
      pairPending = { primary: nextPrimary, second: nextSecond, animations: [oldMain, promoted, incomingSecond], settleTimer, oldMainHadWord, wordByWord, wordProgress };
      Promise.allSettled([oldMain.finished, promoted.finished, incomingSecond.finished]).then(settle);
    };
    const desktopIcons = {
      play: '<svg viewBox="0 0 24 24"><path d="m8 5 11 7-11 7V5z"></path></svg>',
      pause: '<svg viewBox="0 0 24 24"><path d="M8 5v14"></path><path d="M16 5v14"></path></svg>',
      locked: '<svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="10" rx="2"></rect><path d="M8 11V7a4 4 0 0 1 8 0v4"></path></svg>',
      unlocked: '<svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="10" rx="2"></rect><path d="M8 11V8a4 4 0 0 1 7.4-2.1"></path></svg>'
    };

    window.electronAPI.desktopLyrics.onData((data) => {
      data = data || {};
      if (Object.prototype.hasOwnProperty.call(data, 'locked')) {
        panel.classList.toggle('locked', Boolean(data.locked));
        document.getElementById('lock').innerHTML = data.locked ? desktopIcons.locked : desktopIcons.unlocked;
      }
      const lockOnlyUpdate = Object.keys(data || {}).every((key) => key === 'locked');
      if (lockOnlyUpdate) return;
      const hasCover = Boolean(data.cover);
      document.getElementById('coverBox').classList.toggle('empty', !hasCover);
      document.getElementById('cover').src = hasCover ? data.cover : '';
      document.getElementById('title').textContent = data.title || 'Still';
      document.getElementById('artist').textContent = [data.artist, data.album].filter(Boolean).join(' · ');
      panel.style.setProperty('--font-size', Math.max(20, Math.min(72, Number(data.fontSize || 30))) + 'px');
      panel.style.setProperty('--second-line-size', Math.max(12, Math.min(64, Number(data.secondLineSize || 24))) + 'px');
      panel.style.setProperty('--font-weight', Math.max(300, Math.min(900, Number(data.fontWeight || 900))));
      panel.style.setProperty('--played-color', data.playedColor || '#00b7c3');
      panel.style.setProperty('--pending-color', data.pendingColor || '#ccc');
      panel.style.setProperty('--stroke-color', data.strokeColor || 'rgba(0,0,0,.69)');
      const desktopWordProgress = Math.max(0, Math.min(100, Number(data.wordProgress || 0))) + '%';
      const lyricMarqueeing = lyricCurrent.dataset.marquee === 'true';
      const shouldUseWordByWord = Boolean(data.wordByWord) && !lyricMarqueeing;
      if (!pairPending) {
        lyricCurrent.classList.toggle('word', shouldUseWordByWord);
        lyricGhost.classList.toggle('word', shouldUseWordByWord);
      }
      if (shouldUseWordByWord) lyric.style.setProperty('--word-progress', desktopWordProgress);
      else lyric.style.removeProperty('--word-progress');
      const wantsTranslation = Boolean(data.showTranslation && data.translation);
      const secondLine = data.doubleLine ? (wantsTranslation ? data.translation : (data.nextLyric || '')) : '';
      setDesktopLines(data.lyric || '...', secondLine, {
        animated: Boolean(data.switchAnimation),
        queueOriginals: Boolean(data.doubleLine && !wantsTranslation),
        wordByWord: shouldUseWordByWord,
        wordProgress: data.wordProgress
      });
      translation.classList.toggle('empty', !secondLine);
      document.getElementById('play').innerHTML = data.isPlaying ? desktopIcons.pause : desktopIcons.play;
    });
  </script>
</body>
</html>
`)}`);
  desktopLyricWindow.webContents.once("did-finish-load", () => {
    applyDesktopLyricLock(desktopLyricLockedState, true);
  });
  desktopLyricWindow.on("closed", () => {
    desktopLyricWindow = null;
    sendPlayerCommand("desktop-closed");
  });
  return desktopLyricWindow;
}

ipcMain.handle("window:minimize", (event) => {
  BrowserWindow.fromWebContents(event.sender)?.minimize();
});
ipcMain.handle("window:maximize", (event) => {
  BrowserWindow.fromWebContents(event.sender)?.maximize();
});
ipcMain.handle("window:restore", (event) => {
  BrowserWindow.fromWebContents(event.sender)?.restore();
});
ipcMain.handle("window:close", (event) => {
  BrowserWindow.fromWebContents(event.sender)?.close();
});
ipcMain.handle("window:fullscreen", (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return false;
  const next = !win.isFullScreen();
  win.setFullScreen(next);
  win.webContents.send("window:fullscreen-changed", next);
  return next;
});
ipcMain.handle("window:is-fullscreen", (event) => {
  return Boolean(BrowserWindow.fromWebContents(event.sender)?.isFullScreen());
});
ipcMain.handle("window:is-maximized", (event) => {
  return Boolean(BrowserWindow.fromWebContents(event.sender)?.isMaximized());
});

ipcMain.handle("library:read-metadata", async (_, filePath) => {
  if (!filePath) return {};
  return parseMetadataFromPath(filePath);
});

ipcMain.handle("library:resolve-cover", async (_, source, audioPath) => resolveCurrentCover(source, audioPath));

ipcMain.handle("library:load-state", async () => readPersistedState());
ipcMain.handle("library:save-state", async (_, state) => writePersistedState(state));

ipcMain.handle("library:import-folder", async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const { canceled, filePaths } = await dialog.showOpenDialog(win || undefined, {
    title: "选择音乐文件夹",
    properties: ["openDirectory"]
  });
  if (canceled || !filePaths.length) return { canceled: true, tracks: [] };

  const tracks = await importAudioPaths([filePaths[0]]);

  return { canceled: false, tracks };
});

ipcMain.handle("library:import-paths", async (_, paths) => {
  const tracks = await importAudioPaths(Array.isArray(paths) ? paths : []);
  return { canceled: false, tracks };
});

ipcMain.handle("desktop-lyrics:set-open", (_, open) => {
  if (open) {
    createDesktopLyricWindow().show();
  } else if (desktopLyricWindow && !desktopLyricWindow.isDestroyed()) {
    desktopLyricWindow.close();
  }
});

ipcMain.handle("desktop-lyrics:update", async (_, payload) => {
  if (!desktopLyricWindow || desktopLyricWindow.isDestroyed()) return;
  if (!desktopLyricWindow.isVisible()) desktopLyricWindow.showInactive();
  desktopLyricWindow.setAlwaysOnTop(true, "screen-saver");
  const nextPayload = { ...(payload || {}) };
  nextPayload.locked = desktopLyricLockedState;
  if (nextPayload.cover) nextPayload.cover = await imageSourceToDataUrl(nextPayload.cover, 256);
  desktopLyricWindow.webContents.send("desktop-lyrics:data", nextPayload);
});

ipcMain.handle("desktop-lyrics:set-locked", (_, locked) => {
  applyDesktopLyricLock(locked, true);
  return desktopLyricLockedState;
});

ipcMain.on("desktop-lyrics:command", (_, command) => {
  if (command === "lock-toggle") {
    applyDesktopLyricLock(!desktopLyricLockedState, true);
  }
  sendPlayerCommand(command, { showWindow: command === "desktop-settings" });
});

ipcMain.handle("player:update", (_, state) => {
  const previous = lastPlayerState;
  lastPlayerState = { ...lastPlayerState, ...(state || {}) };
  const trayStateChanged = previous.title !== lastPlayerState.title
    || previous.artist !== lastPlayerState.artist
    || previous.isPlaying !== lastPlayerState.isPlaying
    || previous.desktopLyricOpen !== lastPlayerState.desktopLyricOpen;
  if (trayStateChanged) updateTrayMenu();
  updateTaskbarControls();
});

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 460,
    minHeight: 680,
    title: APP_NAME,
    backgroundColor: "#121726",
    icon: APP_ICON_PATH,
    frame: false,
    titleBarStyle: "hidden",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false
    }
  });
  mainWindow = win;
  updateTaskbarControls();

  win.setMenuBarVisibility(false);
  win.removeMenu();
  Menu.setApplicationMenu(null);

  win.on("page-title-updated", (event) => {
    event.preventDefault();
    updateTaskbarControls();
  });
  win.on("maximize", () => win.webContents.send("window:maximized-changed", true));
  win.on("unmaximize", () => win.webContents.send("window:maximized-changed", false));
  win.on("enter-full-screen", () => win.webContents.send("window:fullscreen-changed", true));
  win.on("leave-full-screen", () => win.webContents.send("window:fullscreen-changed", false));
  win.on("close", (event) => {
    if (isQuitting) return;
    event.preventDefault();
    win.hide();
  });
  win.on("closed", () => {
    if (mainWindow === win) mainWindow = null;
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(__dirname, "../dist/index.html"));
  }
}

app.whenReady().then(() => {
  createTray();
  createWindow();
  app.on("activate", () => {
    if (!mainWindow || mainWindow.isDestroyed()) createWindow();
    showMainWindow();
  });
});

app.on("window-all-closed", () => {
  if (isQuitting && process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  isQuitting = true;
});
