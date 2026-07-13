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
const WINDOW_STATE_FILE = "still-window-state.json";
const METADATA_CACHE_FILE = "still-metadata-cache.json";
const COVER_CACHE_DIR = "cover-cache";
const IMPORT_CONCURRENCY = Math.max(2, Math.min(4, Number(process.env.STILL_IMPORT_CONCURRENCY || 4)));

app.setName(APP_NAME);
if (process.platform === "win32") app.setAppUserModelId(APP_ID);

let mainWindow = null;
let desktopLyricWindow = null;
let desktopLyricLockedState = false;
let desktopLyricDragState = null;
let desktopLyricControlsInteractive = false;
let desktopLyricSavedBounds = null;
let desktopLyricBoundsLoaded = false;
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

function formatLrcTimestampMs(timestamp) {
  const totalMs = Math.max(0, Math.round(Number(timestamp) || 0));
  const minutes = Math.floor(totalMs / 60000);
  const seconds = Math.floor((totalMs % 60000) / 1000);
  const milliseconds = totalMs % 1000;
  return `[${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(milliseconds).padStart(3, "0")}]`;
}

function syncTextToLrc(syncText) {
  if (!Array.isArray(syncText)) return "";
  return syncText
    .map((item) => {
      if (!item || typeof item !== "object") return "";
      const timestamp = Number(item.timestamp);
      const text = normalizeTagText(item.text ?? item.lyrics ?? item.value ?? item.description);
      if (!Number.isFinite(timestamp) || !text) return "";
      return `${formatLrcTimestampMs(timestamp)}${text}`;
    })
    .filter(Boolean)
    .join("\n")
    .trim();
}

function normalizeTagText(value) {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) return "";
  if (Array.isArray(value)) {
    return value.map((item) => normalizeTagText(item)).filter(Boolean).join("\n").trim();
  }
  if (value && typeof value === "object") {
    const syncedText = syncTextToLrc(value.syncText);
    if (syncedText) return syncedText;
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

async function getWindowStatePath() {
  const dir = app.getPath("userData");
  await fs.mkdir(dir, { recursive: true });
  return path.join(dir, WINDOW_STATE_FILE);
}

function normalizeDesktopLyricBounds(bounds) {
  if (!bounds || typeof bounds !== "object") return null;
  const x = Math.round(Number(bounds.x));
  const y = Math.round(Number(bounds.y));
  const width = Math.round(Number(bounds.width));
  const height = Math.round(Number(bounds.height));
  if (![x, y, width, height].every(Number.isFinite)) return null;
  if (width < 520 || height < 116) return null;
  return { x, y, width, height };
}

async function loadDesktopLyricBounds() {
  if (desktopLyricBoundsLoaded) return desktopLyricSavedBounds;
  desktopLyricBoundsLoaded = true;
  try {
    const raw = await fs.readFile(await getWindowStatePath(), "utf8");
    const state = JSON.parse(raw);
    desktopLyricSavedBounds = normalizeDesktopLyricBounds(state?.desktopLyricBounds);
  } catch {
    desktopLyricSavedBounds = null;
  }
  return desktopLyricSavedBounds;
}

async function saveDesktopLyricBounds(bounds) {
  const nextBounds = normalizeDesktopLyricBounds(bounds);
  if (!nextBounds) return false;
  desktopLyricSavedBounds = nextBounds;
  desktopLyricBoundsLoaded = true;
  let state = {};
  try {
    state = JSON.parse(await fs.readFile(await getWindowStatePath(), "utf8"));
  } catch {
    state = {};
  }
  state.desktopLyricBounds = nextBounds;
  await fs.writeFile(await getWindowStatePath(), JSON.stringify(state), "utf8");
  return true;
}

function rememberDesktopLyricBounds(bounds) {
  const nextBounds = normalizeDesktopLyricBounds(bounds);
  if (nextBounds) {
    desktopLyricSavedBounds = nextBounds;
    desktopLyricBoundsLoaded = true;
  }
  return nextBounds;
}

function captureDesktopLyricBounds() {
  if (!desktopLyricWindow || desktopLyricWindow.isDestroyed()) return;
  const bounds = rememberDesktopLyricBounds(desktopLyricWindow.getBounds());
  if (bounds) void saveDesktopLyricBounds(bounds).catch(() => {});
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
  if (!desktopLyricLockedState) desktopLyricControlsInteractive = false;
  if (!desktopLyricWindow || desktopLyricWindow.isDestroyed()) return;
  applyDesktopLyricMouseEvents();
  if (notify) {
    desktopLyricWindow.webContents.send("desktop-lyrics:data", { locked: desktopLyricLockedState });
  }
}

function applyDesktopLyricMouseEvents() {
  if (!desktopLyricWindow || desktopLyricWindow.isDestroyed()) return;
  if (!desktopLyricLockedState || desktopLyricControlsInteractive) {
    desktopLyricWindow.setIgnoreMouseEvents(false);
    return;
  }
  desktopLyricWindow.setIgnoreMouseEvents(true, { forward: true });
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
        if (desktopLyricWindow && !desktopLyricWindow.isDestroyed()) {
          captureDesktopLyricBounds();
          desktopLyricWindow.destroy();
        }
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
  const savedBounds = normalizeDesktopLyricBounds(desktopLyricSavedBounds);
  desktopLyricWindow = new BrowserWindow({
    width: savedBounds?.width || 920,
    height: savedBounds?.height || 170,
    x: savedBounds?.x,
    y: savedBounds?.y,
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
    html, body { margin: 0; width: 100%; height: 100%; background: transparent !important; overflow: hidden; font-family: "Segoe UI", "Microsoft YaHei", sans-serif; user-select: none; -webkit-user-select: none; }
    #app { height: 100%; display: flex; align-items: center; justify-content: center; padding: 10px; box-sizing: border-box; background: transparent !important; }
    .panel { -webkit-app-region: no-drag; position: relative; isolation: isolate; contain: paint; width: min(760px, 100%); min-height: 88px; border: 1px solid rgba(255,255,255,.16); border-radius: 18px; background: rgba(8,10,18,.58); background-clip: padding-box; box-shadow: inset 0 1px 0 rgba(255,255,255,.14), inset 0 -1px 0 rgba(0,0,0,.18); backdrop-filter: blur(18px); padding: 12px 14px; color: white; box-sizing: border-box; overflow: hidden; user-select: none; -webkit-user-select: none; transition: background .18s ease, border-color .18s ease, box-shadow .18s ease, backdrop-filter .18s ease; }
    .panel.idle { background: transparent; border-color: transparent; box-shadow: none; backdrop-filter: none; }
    .panel.idle .top { opacity: 0; pointer-events: none; }
    .locked { background: transparent; border-color: transparent; box-shadow: none; backdrop-filter: none; }
    .locked, .locked .top, .locked .lyrics-viewport, .locked .desktop-line, .locked .line-scroll, .locked .line-word { -webkit-app-region: no-drag; }
    .locked.idle { background: transparent; border-color: transparent; box-shadow: none; backdrop-filter: none; }
    .locked.idle .playback-controls, .locked.idle .window-controls, .locked.idle button { pointer-events: none; }
    .locked:not(.idle) .top { opacity: 1; pointer-events: none; }
    .locked:not(.idle) .meta { opacity: 1; pointer-events: none; }
    .locked:not(.idle) .playback-controls, .locked:not(.idle) .window-controls, .locked:not(.idle) .playback-controls button, .locked:not(.idle) .window-controls button { opacity: 1; pointer-events: auto; }
    .top { -webkit-app-region: no-drag; position: relative; display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(92px, 1fr); align-items: center; gap: 12px; min-width: 0; transition: opacity .16s ease; }
    .panel:not(.locked), .panel:not(.locked) .top, .panel:not(.locked) .lyrics-viewport { cursor: move; }
    .meta { display: flex; align-items: center; min-width: 0; max-width: 100%; gap: 10px; overflow: hidden; justify-self: start; }
    .cover-box { width: 40px; height: 40px; border-radius: 8px; background: rgba(255,255,255,.1); color: rgba(255,255,255,.66); display: grid; place-items: center; overflow: hidden; flex: 0 0 auto; }
    .cover-box img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .cover-box svg { width: 22px; height: 22px; display: none; }
    .cover-box.empty img { display: none; }
    .cover-box.empty svg { display: block; }
    .title { font-size: 13px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .artist { margin-top: 2px; font-size: 11px; color: rgba(255,255,255,.66); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .playback-controls { -webkit-app-region: no-drag; position: static; display: flex; align-items: center; justify-self: center; gap: 8px; transform: none; }
    .window-controls { -webkit-app-region: no-drag; display: flex; justify-self: end; gap: 6px; margin-left: 0; }
    button { width: 28px; height: 28px; display: inline-grid; place-items: center; border-radius: 999px; border: 1px solid rgba(255,255,255,.16); background: rgba(255,255,255,.08); color: white; cursor: pointer; line-height: 1; padding: 0; }
    button svg { width: 16px; height: 16px; stroke: currentColor; fill: none; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
    .playback-controls button { width: 30px; height: 30px; background: rgba(255,255,255,.1); }
    .playback-controls #play { width: 36px; height: 36px; background: rgba(255,255,255,.16); }
    .playback-controls #play svg { width: 18px; height: 18px; }
    button:hover { border-color: rgba(255,255,255,.42); }
    button:focus { outline: none; }
    button:focus-visible { outline: 2px solid rgba(255,255,255,.45); outline-offset: 2px; }
    .lyrics-viewport { -webkit-app-region: no-drag; position: relative; margin-top: 10px; min-height: calc(var(--font-size, 30px) * 1.5 + var(--second-line-size, 24px) * 1.46 + 6px); padding: 5px 0 8px; overflow: hidden; box-sizing: content-box; transition: min-height .22s ease; }
    .lyrics-viewport.single { min-height: calc(var(--font-size, 30px) * 1.5); }
    .desktop-line { position: absolute; left: 0; right: 0; top: 0; display: block; width: 100%; height: calc(var(--font-size, 30px) * 1.34); text-align: center; font-size: var(--font-size, 30px); line-height: 1.24; font-weight: var(--font-weight, 700); color: var(--played-color, #00b7c3); white-space: nowrap; overflow: hidden; text-overflow: clip; transition: top .44s cubic-bezier(.22,1,.36,1), opacity .32s ease, transform .44s cubic-bezier(.22,1,.36,1), color .16s ease, font-size .22s ease, height .22s ease; will-change: top, opacity, transform; transform: translate3d(0,0,0); backface-visibility: hidden; -webkit-font-smoothing: antialiased; text-rendering: geometricPrecision; }
    .desktop-line.secondary { height: calc(var(--second-line-size, 24px) * 1.32); font-size: var(--second-line-size, 24px); color: var(--pending-color, #ccc); }
    .desktop-line.leaving { opacity: 0; transform: translate3d(0,-24px,0); pointer-events: none; }
    .desktop-line.entering { opacity: 0; transform: translate3d(0,24px,0); }
    .desktop-line.no-animation { transition: none !important; }
    .line-scroll { display: inline-block; max-width: none; white-space: nowrap; will-change: transform; transform: translate3d(0,0,0); backface-visibility: hidden; -webkit-text-stroke: 1px var(--stroke-color, rgba(0,0,0,.69)); paint-order: stroke fill; text-shadow: 1px 0 0 var(--stroke-color, rgba(0,0,0,.69)), -1px 0 0 var(--stroke-color, rgba(0,0,0,.69)), 0 1px 0 var(--stroke-color, rgba(0,0,0,.69)), 0 -1px 0 var(--stroke-color, rgba(0,0,0,.69)), 1px 1px 0 var(--stroke-color, rgba(0,0,0,.69)), -1px 1px 0 var(--stroke-color, rgba(0,0,0,.69)), 1px -1px 0 var(--stroke-color, rgba(0,0,0,.69)), -1px -1px 0 var(--stroke-color, rgba(0,0,0,.69)); }
    .line-scroll.word { -webkit-text-stroke: 0 transparent; text-shadow: none; }
    .line-word { position: relative; z-index: 0; isolation: isolate; display: inline-block; white-space: pre; color: transparent; -webkit-text-fill-color: transparent; -webkit-text-stroke: 0 transparent; background-image: linear-gradient(90deg, var(--played-color, #00b7c3) 0%, var(--played-color, #00b7c3) 50%, var(--pending-color, #ccc) 50%, var(--pending-color, #ccc) 100%); background-size: 200% 100%; background-position-x: var(--word-position, 100%); background-clip: text; -webkit-background-clip: text; transition: background-position-x .06s linear; }
    .line-word::before { content: attr(data-text); position: absolute; inset: 0; z-index: -1; color: transparent; -webkit-text-fill-color: transparent; -webkit-text-stroke: 1px var(--stroke-color, rgba(0,0,0,.69)); paint-order: stroke fill; pointer-events: none; }
    .line-word.with-motion { display: inline-block; transform: translateY(var(--word-lift, 0)) scale(var(--word-scale, 1)); transform-origin: center bottom; transition: background-position-x .06s linear, transform .06s linear; }
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
      <div id="lyricsViewport" class="lyrics-viewport single"></div>
    </div>
  </div>
  <script>
    const appRoot = document.getElementById('app');
    const panel = document.getElementById('panel');
    let hideTimer = 0;
    let locked = false;
    let pointerOnControls = false;
    let draggingWindow = false;
    let dragPointerId = null;
    let lastControlsInteractive = false;
    const setIdle = (idle) => {
      panel.classList.toggle('idle', idle);
      panel.classList.toggle('hovered', !idle);
    };
    const setControlsActive = (active) => panel.classList.toggle('controls-active', active);
    const controlGroups = Array.from(document.querySelectorAll('.playback-controls, .window-controls'));
    const controlButtons = Array.from(document.querySelectorAll('.playback-controls button, .window-controls button'));
    const isControlsNode = (node) => Boolean(node?.closest?.('.playback-controls, .window-controls'));
    const isControlsPoint = (event) => controlButtons.some((node) => {
      const rect = node.getBoundingClientRect();
      return event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
    });
    const hideChrome = () => {
      window.clearTimeout(hideTimer);
      pointerOnControls = false;
      setControlsActive(false);
      syncControlsInteractivity();
      setIdle(true);
    };
    const showChrome = (hideDelay = 1000) => {
      window.clearTimeout(hideTimer);
      setIdle(false);
      setControlsActive(pointerOnControls);
      hideTimer = window.setTimeout(hideChrome, hideDelay);
    };
    const updatePointerTarget = (event) => {
      pointerOnControls = isControlsNode(event.target) || isControlsPoint(event);
      showChrome();
      syncControlsInteractivity();
    };
    const dragPoint = (event) => ({ screenX: event.screenX, screenY: event.screenY });
    const canDragWindow = (event) => {
      if (locked || event.button !== 0 || isControlsNode(event.target)) return false;
      return appRoot.contains(event.target);
    };
    const syncControlsInteractivity = () => {
      const next = Boolean(locked && pointerOnControls);
      if (next === lastControlsInteractive) return;
      lastControlsInteractive = next;
      window.electronAPI.desktopLyrics.controlsHover(next);
    };
    const stopWindowDrag = (event) => {
      if (event?.pointerId !== undefined && dragPointerId !== null && event.pointerId !== dragPointerId) return;
      const wasDragging = draggingWindow;
      draggingWindow = false;
      document.removeEventListener('pointermove', moveWindowDrag);
      document.removeEventListener('pointerup', stopWindowDrag);
      document.removeEventListener('pointercancel', stopWindowDrag);
      dragPointerId = null;
      if (wasDragging) window.electronAPI.desktopLyrics.dragEnd();
    };
    const moveWindowDrag = (event) => {
      if (!draggingWindow || event.pointerId !== dragPointerId) return;
      if (event.buttons === 0) {
        stopWindowDrag(event);
        return;
      }
      window.electronAPI.desktopLyrics.dragMove(dragPoint(event));
      event.preventDefault();
    };
    const startWindowDrag = (event) => {
      updatePointerTarget(event);
      if (!canDragWindow(event)) return;
      draggingWindow = true;
      dragPointerId = event.pointerId;
      document.addEventListener('pointermove', moveWindowDrag);
      document.addEventListener('pointerup', stopWindowDrag);
      document.addEventListener('pointercancel', stopWindowDrag);
      window.electronAPI.desktopLyrics.dragStart(dragPoint(event));
      event.preventDefault();
    };
    const scheduleIdle = () => {
      if (!draggingWindow) {
        dragPointerId = null;
        hideChrome();
      }
    };
    appRoot.addEventListener('pointerenter', updatePointerTarget);
    appRoot.addEventListener('pointerover', updatePointerTarget);
    appRoot.addEventListener('mousemove', updatePointerTarget);
    appRoot.addEventListener('pointerleave', scheduleIdle);
    document.addEventListener('mousemove', updatePointerTarget);
    document.addEventListener('mouseleave', scheduleIdle);
    controlGroups.forEach((node) => {
      node.addEventListener('pointerenter', (event) => {
        updatePointerTarget(event);
      });
      node.addEventListener('pointerleave', () => {
        pointerOnControls = false;
        setControlsActive(false);
        showChrome(300);
        syncControlsInteractivity();
      });
      node.addEventListener('pointerdown', (event) => {
        updatePointerTarget(event);
      });
    });
    appRoot.addEventListener('pointerdown', startWindowDrag);
    window.addEventListener('blur', stopWindowDrag);
    hideChrome();

    const lyricsViewport = document.getElementById('lyricsViewport');
    const lyricEntries = new Map();
    let latestLineSpecs = [];
    let seekBase = 0;
    let seekAnchor = performance.now();
    let seekInitialized = false;
    let seekPlaying = false;
    let scrollFrame = 0;

    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
    const cssNumber = (name, fallback) => {
      const value = Number.parseFloat(getComputedStyle(panel).getPropertyValue(name));
      return Number.isFinite(value) ? value : fallback;
    };
    const getSeek = () => seekPlaying ? seekBase + (performance.now() - seekAnchor) / 1000 : seekBase;
    const lineTop = (index) => index === 0 ? 0 : Math.round(cssNumber('--font-size', 30) * 1.48 + 5);
    const lineHeight = (index) => {
      const size = index === 0 ? cssNumber('--font-size', 30) : cssNumber('--second-line-size', 24);
      return Math.round(size * 1.34);
    };
    const syncSeek = (data) => {
      const next = Number(data.lyricTime ?? data.currentTime);
      if (!Number.isFinite(next)) return;
      const corrected = Number.isFinite(Number(data.sentAt)) ? next + clamp((Date.now() - Number(data.sentAt)) / 1000, 0, 1) : next;
      const drift = Math.abs(corrected - getSeek());
      const shouldReset = !seekInitialized || drift > 0.3 || Boolean(data.forceSeekSync);
      if (shouldReset || !data.isPlaying) {
        seekBase = corrected;
        seekAnchor = performance.now();
        seekInitialized = true;
      }
      seekPlaying = Boolean(data.isPlaying);
      if (!seekPlaying) {
        seekBase = corrected;
        seekAnchor = performance.now();
      }
    };
    const makeLineKey = (prefix, text, start) => {
      const timePart = Number.isFinite(Number(start)) ? Number(start).toFixed(3) : 'idle';
      return prefix + ':' + timePart + ':' + String(text || '').slice(0, 36);
    };
    const getWordProgress = (word) => {
      const start = Number(word?.time);
      const end = Number(word?.endTime);
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
      return clamp((getSeek() - start) / Math.max(0.08, end - start), 0, 1);
    };
    const paintWordNode = (node, word, spec) => {
      const progress = getWordProgress(word);
      node.style.setProperty('--word-position', (100 - progress * 100) + '%');
      node.style.setProperty('--word-lift', spec?.wordLiftEffect ? (-2 * progress) + 'px' : '0px');
      node.style.setProperty('--word-scale', spec?.wordScaleEffect ? String(1 + 0.06 * progress) : '1');
    };
    const setScrollContent = (entry, spec) => {
      const next = spec.text || '';
      const words = Array.isArray(spec.words) ? spec.words : [];
      const nextSignature = spec.wordByWord && words.length ? words.map((word) => word.text + '@' + word.time + '-' + word.endTime).join('|') : next;
      if (entry.text === next && entry.signature === nextSignature) return;
      entry.text = next;
      entry.signature = nextSignature;
      entry.scroll.textContent = '';
      entry.scroll.dataset.text = next;
      if (spec.wordByWord && spec.active && words.length) {
        words.forEach((word) => {
          const node = document.createElement('span');
          node.className = 'line-word' + (spec.wordLiftEffect || spec.wordScaleEffect ? ' with-motion' : '');
          node.textContent = word.text || '';
          node.dataset.text = word.text || '';
          paintWordNode(node, word, spec);
          entry.scroll.appendChild(node);
        });
      } else {
        entry.scroll.textContent = next;
      }
    };
    const createEntry = (spec, animated) => {
      const line = document.createElement('div');
      line.className = 'desktop-line entering';
      if (!animated) line.classList.add('no-animation');
      const scroll = document.createElement('span');
      scroll.className = 'line-scroll';
      line.appendChild(scroll);
      lyricsViewport.appendChild(line);
      const entry = { line, scroll, text: '', signature: '', leavingTimer: 0, spec };
      lyricEntries.set(spec.key, entry);
      setScrollContent(entry, spec);
      applyLineSpec(entry, spec, true);
      requestAnimationFrame(() => {
        line.classList.remove('entering');
        line.classList.remove('no-animation');
      });
      return entry;
    };
    const removeEntry = (key, animated) => {
      const entry = lyricEntries.get(key);
      if (!entry) return;
      lyricEntries.delete(key);
      if (entry.leavingTimer) window.clearTimeout(entry.leavingTimer);
      if (!animated) {
        entry.line.remove();
        return;
      }
      entry.line.classList.add('leaving');
      entry.leavingTimer = window.setTimeout(() => entry.line.remove(), 520);
    };
    const applyLineSpec = (entry, spec, immediate = false) => {
      entry.spec = spec;
      setScrollContent(entry, spec);
      entry.line.classList.toggle('secondary', spec.index > 0);
      entry.line.classList.toggle('no-animation', Boolean(immediate || !spec.animated));
      entry.line.style.top = lineTop(spec.index) + 'px';
      entry.line.style.height = lineHeight(spec.index) + 'px';
      entry.line.style.color = spec.active ? 'var(--played-color, #00b7c3)' : 'var(--pending-color, #ccc)';
      entry.scroll.classList.toggle('word', Boolean(spec.wordByWord && spec.active));
      if (immediate || !spec.animated) {
        requestAnimationFrame(() => entry.line.classList.remove('no-animation'));
      }
    };
    const renderDesktopLines = (data) => {
      const animated = Boolean(data.switchAnimation);
      const primaryText = data.lyric || '...';
      const wantsTranslation = Boolean(data.showTranslation && data.translation);
      const secondText = data.doubleLine ? (wantsTranslation ? data.translation : (data.nextLyric || '')) : '';
      const primaryStart = Number(data.lineStart);
      const primaryEnd = Number(data.lineEnd);
      const nextStart = Number(data.nextLineStart);
      const nextEnd = Number(data.nextLineEnd);
      const primaryKey = data.lineKey || makeLineKey('main', primaryText, primaryStart);
      const lines = [{
        key: primaryKey,
        text: primaryText,
        index: 0,
        active: true,
        animated,
        start: Number.isFinite(primaryStart) ? primaryStart : undefined,
        end: Number.isFinite(primaryEnd) ? primaryEnd : undefined,
        wordByWord: Boolean(data.wordByWord),
        wordLiftEffect: Boolean(data.wordLiftEffect),
        wordScaleEffect: Boolean(data.wordScaleEffect),
        words: Array.isArray(data.words) ? data.words : []
      }];
      if (secondText) {
        lines.push({
          key: wantsTranslation ? primaryKey + ':translation' : (data.nextLineKey || makeLineKey('main', secondText, nextStart)),
          text: secondText,
          index: 1,
          active: false,
          animated,
          start: wantsTranslation ? (Number.isFinite(primaryStart) ? primaryStart : undefined) : (Number.isFinite(nextStart) ? nextStart : undefined),
          end: wantsTranslation ? (Number.isFinite(primaryEnd) ? primaryEnd : undefined) : (Number.isFinite(nextEnd) ? nextEnd : undefined),
          wordByWord: false,
          wordLiftEffect: false,
          wordScaleEffect: false,
          words: []
        });
      }
      lyricsViewport.classList.toggle('single', lines.length < 2);
      latestLineSpecs = lines;
      const nextKeys = new Set(lines.map((line) => line.key));
      Array.from(lyricEntries.keys()).forEach((key) => {
        if (!nextKeys.has(key)) removeEntry(key, animated);
      });
      lines.forEach((spec) => {
        const entry = lyricEntries.get(spec.key) || createEntry(spec, animated);
        applyLineSpec(entry, spec);
      });
      updateLineScrolls();
    };
    const updateLineScrolls = () => {
      const seek = getSeek();
      latestLineSpecs.forEach((spec) => {
        const entry = lyricEntries.get(spec.key);
        if (!entry) return;
        if (spec.wordByWord && spec.active && Array.isArray(spec.words)) {
          entry.scroll.querySelectorAll('.line-word').forEach((node, index) => {
            paintWordNode(node, spec.words[index], spec);
          });
        }
        const rawOverflow = entry.scroll.scrollWidth - entry.line.clientWidth;
        const overflow = rawOverflow > 8 ? rawOverflow + 16 : 0;
        if (overflow <= 8 || !Number.isFinite(Number(spec.start)) || !Number.isFinite(Number(spec.end)) || Number(spec.end) <= Number(spec.start)) {
          entry.scroll.style.transform = 'translate3d(0,0,0)';
          return;
        }
        const end = Math.max(Number(spec.start) + 0.1, Number(spec.end) - 0.8);
        const progress = clamp((seek - Number(spec.start)) / Math.max(0.1, end - Number(spec.start)), 0, 1);
        const scrollStart = 0.3;
        if (progress <= scrollStart) {
          entry.scroll.style.transform = 'translate3d(0,0,0)';
          return;
        }
        const ratio = (progress - scrollStart) / (1 - scrollStart);
        entry.scroll.style.transform = 'translate3d(-' + Math.round(overflow * ratio) + 'px,0,0)';
      });
    };
    const tickLineScrolls = () => {
      updateLineScrolls();
      scrollFrame = window.requestAnimationFrame(tickLineScrolls);
    };
    scrollFrame = window.requestAnimationFrame(tickLineScrolls);
    const desktopIcons = {
      play: '<svg viewBox="0 0 24 24"><path d="m8 5 11 7-11 7V5z"></path></svg>',
      pause: '<svg viewBox="0 0 24 24"><path d="M8 5v14"></path><path d="M16 5v14"></path></svg>',
      locked: '<svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="10" rx="2"></rect><path d="M8 11V7a4 4 0 0 1 8 0v4"></path></svg>',
      unlocked: '<svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="10" rx="2"></rect><path d="M8 11V8a4 4 0 0 1 7.4-2.1"></path></svg>'
    };

    window.electronAPI.desktopLyrics.onData((data) => {
      data = data || {};
      if (Object.prototype.hasOwnProperty.call(data, 'locked')) {
        const wasLocked = locked;
        locked = Boolean(data.locked);
        if (wasLocked !== locked) hideChrome();
        panel.classList.toggle('locked', locked);
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
      syncSeek(data);
      renderDesktopLines(data);
      document.getElementById('play').innerHTML = data.isPlaying ? desktopIcons.pause : desktopIcons.play;
    });
  </script>
</body>
</html>
`)}`);
  desktopLyricWindow.webContents.once("did-finish-load", () => {
    applyDesktopLyricLock(desktopLyricLockedState, true);
  });
  desktopLyricWindow.on("close", () => {
    captureDesktopLyricBounds();
  });
  desktopLyricWindow.on("closed", () => {
    desktopLyricDragState = null;
    desktopLyricControlsInteractive = false;
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

function getDesktopLyricDragPoint(point) {
  const screenX = Number(point?.screenX);
  const screenY = Number(point?.screenY);
  if (!Number.isFinite(screenX) || !Number.isFinite(screenY)) return null;
  return { screenX, screenY };
}

function restoreDesktopLyricDragSize() {
  if (!desktopLyricWindow || desktopLyricWindow.isDestroyed()) return;
  desktopLyricWindow.setMaximumSize(10000, 10000);
}

function isDesktopLyricSender(event) {
  return desktopLyricWindow
    && !desktopLyricWindow.isDestroyed()
    && BrowserWindow.fromWebContents(event.sender) === desktopLyricWindow;
}

ipcMain.on("desktop-lyrics:drag-start", (event, point) => {
  if (desktopLyricLockedState || !isDesktopLyricSender(event)) return;
  const dragPoint = getDesktopLyricDragPoint(point);
  if (!dragPoint) return;
  const bounds = desktopLyricWindow.getBounds();
  const width = Math.max(1, Math.round(bounds.width));
  const height = Math.max(1, Math.round(bounds.height));
  desktopLyricWindow.setMaximumSize(width, height);
  desktopLyricDragState = {
    ...dragPoint,
    windowX: bounds.x,
    windowY: bounds.y,
    width,
    height
  };
});

ipcMain.on("desktop-lyrics:drag-move", (event, point) => {
  if (desktopLyricLockedState || !desktopLyricDragState || !isDesktopLyricSender(event)) return;
  const dragPoint = getDesktopLyricDragPoint(point);
  if (!dragPoint) return;
  const nextX = Math.round(desktopLyricDragState.windowX + dragPoint.screenX - desktopLyricDragState.screenX);
  const nextY = Math.round(desktopLyricDragState.windowY + dragPoint.screenY - desktopLyricDragState.screenY);
  desktopLyricWindow.setBounds({
    x: nextX,
    y: nextY,
    width: desktopLyricDragState.width,
    height: desktopLyricDragState.height
  }, false);
  rememberDesktopLyricBounds({
    x: nextX,
    y: nextY,
    width: desktopLyricDragState.width,
    height: desktopLyricDragState.height
  });
});

ipcMain.on("desktop-lyrics:drag-end", (event) => {
  if (!isDesktopLyricSender(event)) return;
  restoreDesktopLyricDragSize();
  captureDesktopLyricBounds();
  desktopLyricDragState = null;
});

ipcMain.on("desktop-lyrics:controls-hover", (event, active) => {
  if (!isDesktopLyricSender(event)) return;
  desktopLyricControlsInteractive = Boolean(active);
  applyDesktopLyricMouseEvents();
});

ipcMain.handle("desktop-lyrics:set-open", async (_, open) => {
  if (open) {
    await loadDesktopLyricBounds();
    createDesktopLyricWindow().show();
  } else if (desktopLyricWindow && !desktopLyricWindow.isDestroyed()) {
    captureDesktopLyricBounds();
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
