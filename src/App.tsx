import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import "@material/web/switch/switch.js";
import "@material/web/slider/slider.js";
import "@material/web/checkbox/checkbox.js";
import stillLogoBlack from "../logo/Still_logo_black/Still_logo_black.ico";
import stillLogoWhite from "../logo/Still_logo_white/Still_logo_white.ico";
import { parseBlob, parseBuffer } from "music-metadata-browser";
import { PointerEvent as ReactPointerEvent, ReactNode, type RefObject, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

type View =
  | "songs"
  | "artists"
  | "albums"
  | "folders"
  | "playlists"
  | "library"
  | "settings"
  | "track-info"
  | "artist-detail"
  | "album-detail"
  | "playlist-detail"
  | "folder-detail";
type LyricMode = "lyrics" | "cover" | "mix-horizontal" | "mix-vertical";
type LyricPosition = "left" | "center" | "right";
type LyricWordAnimation = "off" | "auto";
type SortKey = "title" | "artist" | "album" | "year" | "duration" | "folder" | "filePath";
type PlayMode = "sequential" | "list-loop" | "single-loop" | "shuffle";
type AccentMode = "manual" | "cover";

type LyricWord = { time: number; text: string; endTime?: number };
type LyricLine = { time: number; text: string; translation?: string; words?: LyricWord[] };
type LyricSource = { id: string; label: string; lines: LyricLine[]; kind: "local" | "embedded" };
type LocalMetadataResult = {
  title?: string;
  artist?: string;
  album?: string;
  year?: number;
  trackNo?: number;
  duration?: number;
  fileSize?: number;
  modifiedAt?: number;
  createdAt?: number;
  extension?: string;
  container?: string;
  codec?: string;
  bitrate?: number;
  sampleRate?: number;
  bitsPerSample?: number;
  channels?: number;
  lossless?: boolean;
  tagTypes?: string[];
  embeddedLyrics?: string;
  localLyrics?: Array<{ label: string; raw: string }>;
  coverDataUrl?: string;
};
type ImportedTrackResult = {
  localPath: string;
  relativePath: string;
  title?: string;
  artist?: string;
  album?: string;
  year?: number;
  trackNo?: number;
  duration?: number;
  fileSize?: number;
  modifiedAt?: number;
  createdAt?: number;
  extension?: string;
  container?: string;
  codec?: string;
  bitrate?: number;
  sampleRate?: number;
  bitsPerSample?: number;
  channels?: number;
  lossless?: boolean;
  tagTypes?: string[];
  embeddedLyrics?: string;
  localLyrics?: Array<{ label: string; raw: string }>;
  coverDataUrl?: string;
};
type Track = {
  id: string;
  title: string;
  artist: string;
  album: string;
  year: number;
  trackNo: number;
  duration: number;
  cover: string;
  folder: string;
  filePath: string;
  localPath?: string;
  audioUrl: string;
  fileSize?: number;
  modifiedAt?: number;
  createdAt?: number;
  extension?: string;
  container?: string;
  codec?: string;
  bitrate?: number;
  sampleRate?: number;
  bitsPerSample?: number;
  channels?: number;
  lossless?: boolean;
  tagTypes?: string[];
  lyricSources: LyricSource[];
  selectedLyricSourceId?: string;
};

type Playlist = { id: string; name: string; trackIds: string[] };
type TrackContextMenu = { x: number; y: number; trackIds: string[]; playlistId?: string };
type PlaylistContextMenu = { x: number; y: number; playlistId: string } | null;
type FolderNode = { name: string; path: string; count: number; children: FolderNode[] };
type PersistedAppState = {
  version?: number;
  tracks?: Track[];
  playlists?: Playlist[];
  currentTrackId?: string;
  playQueueIds?: string[];
  theme?: "dark" | "light";
  volume?: number;
  playbackRate?: number;
  playMode?: PlayMode;
  sortKey?: SortKey;
  sortDirection?: "asc" | "desc";
  accentColor?: string;
  accentMode?: AccentMode;
  lyricsMode?: LyricMode;
  translationEnabled?: boolean;
  translationPreference?: boolean;
  lyricAutoScale?: boolean;
  lyricFontSize?: number;
  lyricTranslationFontSize?: number;
  lyricFontWeight?: number;
  lyricPosition?: LyricPosition;
  lyricLeftOffset?: number;
  lyricScrollPosition?: number;
  lyricAutoBlur?: boolean;
  lyricFadeEffect?: boolean;
  lyricDistantView?: boolean;
  lyricWordAnimation?: LyricWordAnimation;
  desktopLyricOpen?: boolean;
  desktopLyricLocked?: boolean;
  desktopLyricDoubleLine?: boolean;
  desktopLyricShowTranslation?: boolean;
  desktopLyricWordByWord?: boolean | LyricWordAnimation;
  desktopLyricSwitchAnimation?: boolean;
  desktopLyricFontSize?: number;
  desktopLyricSecondLineSize?: number;
  desktopLyricSecondLineScale?: number;
  desktopLyricFontWeight?: number;
  desktopLyricPlayedColor?: string;
  desktopLyricPendingColor?: string;
  desktopLyricStrokeColor?: string;
  selectedPlaylistId?: string;
  warnOnMetaMissing?: boolean;
  unreadableTrackIds?: string[];
};

type HostWindow = Window & {
  electronWindow?: Record<string, () => void>;
  electronAPI?: {
    window?: {
      minimize?: () => void;
      maximize?: () => void;
      restore?: () => void;
      close?: () => void;
      fullscreen?: () => Promise<boolean> | void;
      isFullscreen?: () => Promise<boolean>;
      isMaximized?: () => Promise<boolean>;
      onMaximizedChanged?: (callback: (value: boolean) => void) => () => void;
      onFullscreenChanged?: (callback: (value: boolean) => void) => () => void;
    };
    library?: {
      readMetadata?: (filePath: string) => Promise<LocalMetadataResult>;
      importFolder?: () => Promise<{ canceled?: boolean; tracks?: ImportedTrackResult[] }>;
      importPaths?: (paths: string[]) => Promise<{ canceled?: boolean; tracks?: ImportedTrackResult[] }>;
      getPathForFile?: (file: File) => string;
      resolveCover?: (source: string, audioPath?: string) => Promise<string>;
      loadState?: () => Promise<PersistedAppState | null>;
      saveState?: (state: PersistedAppState) => Promise<boolean>;
    };
    desktopLyrics?: {
      setOpen?: (open: boolean) => Promise<void>;
      update?: (payload: Record<string, unknown>) => Promise<void>;
      setLocked?: (locked: boolean) => Promise<void>;
    };
    player?: {
      update?: (state: Record<string, unknown>) => Promise<void>;
      onCommand?: (callback: (command: string) => void) => () => void;
    };
  };
  api?: { window?: Record<string, () => void> };
};

type IconButtonProps = {
  label: string;
  onClick: () => void;
  children: ReactNode;
  active?: boolean;
  disabled?: boolean;
  className?: string;
};

const AUDIO_TYPES = [".mp3", ".flac", ".wav", ".ogg", ".m4a", ".aac"];
const TEXT_TYPES = [".lrc", ".tlrc", ".txt"];
const TRACK_ROW_HEIGHT = 76;
const TRACK_ALPHA_HEIGHT = 46;
const TRACK_LIST_OVERSCAN = 8;
const TRACK_LIST_VIRTUALIZE_THRESHOLD = 1800;
const PLAYER_FOOTER_HEIGHT = 94;
const TRACK_ALPHA_LETTERS = ["#", "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z"];
const PINYIN_BOUNDARIES = [
  ["A", "阿"], ["B", "芭"], ["C", "嚓"], ["D", "搭"], ["E", "婀"], ["F", "发"], ["G", "旮"], ["H", "哈"],
  ["J", "击"], ["K", "喀"], ["L", "垃"], ["M", "妈"], ["N", "拿"], ["O", "噢"], ["P", "啪"], ["Q", "期"],
  ["R", "然"], ["S", "撒"], ["T", "塌"], ["W", "挖"], ["X", "昔"], ["Y", "压"], ["Z", "匝"]
] as const;
const PINYIN_CHAR_MAP: Record<string, string> = {
  "\u90d1": "zheng", "\u7956": "zu",
  阿: "a", 艾: "ai", 安: "an", 暗: "an", 八: "ba", 爸: "ba", 白: "bai", 百: "bai", 半: "ban", 北: "bei", 不: "bu",
  擦: "ca", 参: "can", 曾: "ceng", 茶: "cha", 长: "chang", 超: "chao", 陈: "chen", 辰: "chen", 成: "cheng", 吃: "chi", 冲: "chong", 出: "chu", 春: "chun", 错: "cuo",
  大: "da", 丹: "dan", 当: "dang", 德: "de", 的: "de", 灯: "deng", 地: "di", 点: "dian", 东: "dong", 都: "dou",
  额: "e", 恩: "en", 儿: "er",
  发: "fa", 凡: "fan", 方: "fang", 飞: "fei", 风: "feng", 佛: "fo",
  该: "gai", 干: "gan", 高: "gao", 哥: "ge", 给: "gei", 更: "geng", 孤: "gu", 光: "guang",
  哈: "ha", 海: "hai", 韩: "han", 好: "hao", 和: "he", 黑: "hei", 花: "hua", 华: "hua", 黄: "huang",
  佳: "jia", 家: "jia", 杰: "jie", 金: "jin", 静: "jing", 九: "jiu", 俊: "jun",
  咖: "ka", 开: "kai", 看: "kan", 珂: "ke", 空: "kong",
  来: "lai", 兰: "lan", 蓝: "lan", 梨: "li", 李: "li", 里: "li", 亮: "liang", 林: "lin", 刘: "liu", 龙: "long",
  妈: "ma", 慢: "man", 猫: "mao", 没: "mei", 梦: "meng", 秒: "miao", 明: "ming",
  拿: "na", 南: "nan", 你: "ni", 年: "nian",
  噢: "o",
  怕: "pa", 朋: "peng", 平: "ping",
  七: "qi", 千: "qian", 强: "qiang", 青: "qing", 秋: "qiu",
  然: "ran", 人: "ren", 日: "ri", 如: "ru",
  撒: "sa", 三: "san", 山: "shan", 上: "shang", 少: "shao", 深: "shen", 生: "sheng", 时: "shi", 是: "shi", 手: "shou", 水: "shui",
  他: "ta", 她: "ta", 天: "tian", 听: "ting", 同: "tong",
  晚: "wan", 王: "wang", 位: "wei", 我: "wo",
  西: "xi", 希: "xi", 下: "xia", 仙: "xian", 想: "xiang", 小: "xiao", 心: "xin", 星: "xing", 徐: "xu", 许: "xu",
  鸭: "ya", 雅: "ya", 言: "yan", 杨: "yang", 要: "yao", 也: "ye", 一: "yi", 莹: "ying", 有: "you", 粤: "yue", 云: "yun", 芸: "yun",
  在: "zai", 张: "zhang", 赵: "zhao", 针: "zhen", 中: "zhong", 周: "zhou", 子: "zi"
};
const zhCollator = new Intl.Collator("zh-Hans-u-co-pinyin", { numeric: true, sensitivity: "base" });
const compareText = (a: string, b: string) => zhCollator.compare(a || "", b || "");
const enCollator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });

type VirtualTrackItem =
  | { type: "alpha"; key: string; letter: string }
  | { type: "track"; key: string; track: Track; index: number };

type VirtualTrackScrollDetail = {
  pageKey: string;
  letter?: string;
  trackId?: string;
};

function hashString(value: string) {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) + hash) ^ value.charCodeAt(index);
  }
  return (hash >>> 0).toString(36);
}

function makeLocalTrackId(localPath: string | undefined, relativePath: string) {
  return `local-${hashString((localPath || relativePath || "").toLowerCase())}`;
}

function normalizeTrackPathKey(filePath: string | undefined) {
  return (filePath || "").replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
}

function getParentPath(filePath: string) {
  const normalized = filePath.replace(/\\/g, "/");
  const index = normalized.lastIndexOf("/");
  return index > 0 ? normalized.slice(0, index) : normalized;
}

function compactImportRoots(paths: string[]) {
  const roots: string[] = [];
  const seen = new Set<string>();
  paths
    .map((item) => item.replace(/\\/g, "/").replace(/\/+$/, ""))
    .filter(Boolean)
    .sort((a, b) => a.length - b.length)
    .forEach((item) => {
      const key = item.toLowerCase();
      if (seen.has(key)) return;
      if (roots.some((root) => key.startsWith(`${root.toLowerCase()}/`))) return;
      seen.add(key);
      roots.push(item);
    });
  return roots;
}

function mergeTracksById(existing: Track[], incoming: Track[]) {
  const merged = new Map<string, Track>();
  const pathToId = new Map<string, string>();
  existing.forEach((track) => {
    const pathKey = normalizeTrackPathKey(track.localPath || track.filePath);
    if (pathKey && pathToId.has(pathKey)) return;
    merged.set(track.id, track);
    if (pathKey) pathToId.set(pathKey, track.id);
  });
  incoming.forEach((track) => {
    const pathKey = normalizeTrackPathKey(track.localPath || track.filePath);
    const existingId = pathKey ? pathToId.get(pathKey) : undefined;
    const id = existingId || track.id;
    merged.set(id, { ...track, id });
    if (pathKey) pathToId.set(pathKey, id);
  });
  return [...merged.values()];
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  mapper: (item: T, index: number) => Promise<R>
) {
  const results = new Array<R>(items.length);
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

const PAGE_ANIMATION = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -10 }
};

function IconButton({ label, onClick, children, active, disabled, className = "" }: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex h-9 w-9 items-center justify-center rounded-full border transition ${active ? "border-[var(--accent)] text-[var(--accent)]" : "border-transparent hover:border-[var(--line)]"} ${disabled ? "cursor-not-allowed opacity-35" : ""} ${className}`}
    >
      {children}
    </button>
  );
}

function LineIcon({ children, className = "h-5 w-5" }: { children: ReactNode; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

function VirtualizedTrackRows({
  pageKey,
  items,
  scrollParentRef,
  emptyText,
  renderItem
}: {
  pageKey: string;
  items: VirtualTrackItem[];
  scrollParentRef: RefObject<HTMLElement | null>;
  emptyText: string;
  renderItem: (item: VirtualTrackItem) => ReactNode;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const [viewport, setViewport] = useState({ top: 0, height: 720 });

  const { offsets, totalHeight, letterIndex, trackIndex } = useMemo(() => {
    const nextOffsets: number[] = [];
    const nextLetterIndex = new Map<string, number>();
    const nextTrackIndex = new Map<string, number>();
    let top = 0;
    items.forEach((item, index) => {
      nextOffsets[index] = top;
      if (item.type === "alpha") nextLetterIndex.set(item.letter, index);
      if (item.type === "track") nextTrackIndex.set(item.track.id, index);
      top += item.type === "alpha" ? TRACK_ALPHA_HEIGHT : TRACK_ROW_HEIGHT;
    });
    return {
      offsets: nextOffsets,
      totalHeight: top,
      letterIndex: nextLetterIndex,
      trackIndex: nextTrackIndex
    };
  }, [items]);

  const updateViewport = useCallback(() => {
    const parent = scrollParentRef.current;
    const container = containerRef.current;
    if (!parent || !container) return;
    const parentRect = parent.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    const top = Math.max(0, parentRect.top - containerRect.top);
    setViewport({ top, height: parent.clientHeight || window.innerHeight });
  }, [scrollParentRef]);

  useLayoutEffect(() => {
    updateViewport();
    const parent = scrollParentRef.current;
    if (!parent) return;
    const requestUpdate = () => {
      if (rafRef.current !== null) return;
      rafRef.current = window.requestAnimationFrame(() => {
        rafRef.current = null;
        updateViewport();
      });
    };
    const resizeObserver = new ResizeObserver(requestUpdate);
    if (containerRef.current) resizeObserver.observe(containerRef.current);
    resizeObserver.observe(parent);
    parent.addEventListener("scroll", requestUpdate, { passive: true });
    window.addEventListener("resize", requestUpdate);
    return () => {
      if (rafRef.current !== null) window.cancelAnimationFrame(rafRef.current);
      resizeObserver.disconnect();
      parent.removeEventListener("scroll", requestUpdate);
      window.removeEventListener("resize", requestUpdate);
    };
  }, [scrollParentRef, updateViewport]);

  useLayoutEffect(() => {
    updateViewport();
    const frame = window.requestAnimationFrame(updateViewport);
    const timer = window.setTimeout(updateViewport, 80);
    let retries = 0;
    let retryTimer = 0;
    const retryMeasure = () => {
      retries += 1;
      updateViewport();
      if (retries < 12) retryTimer = window.setTimeout(retryMeasure, 90);
    };
    retryTimer = window.setTimeout(retryMeasure, 160);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
      window.clearTimeout(retryTimer);
    };
  }, [items.length, pageKey, totalHeight, updateViewport]);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<VirtualTrackScrollDetail>).detail;
      if (!detail || detail.pageKey !== pageKey) return;
      const parent = scrollParentRef.current;
      const container = containerRef.current;
      if (!parent || !container) return;
      const index = detail.letter
        ? letterIndex.get(detail.letter)
        : detail.trackId
          ? trackIndex.get(detail.trackId)
          : undefined;
      if (index === undefined) return;
      const parentRect = parent.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      const containerTopInScroll = parent.scrollTop + containerRect.top - parentRect.top;
      parent.scrollTo({
        top: containerTopInScroll + offsets[index] - 12,
        behavior: "smooth"
      });
    };
    window.addEventListener("still:virtual-track-scroll", handler);
    return () => window.removeEventListener("still:virtual-track-scroll", handler);
  }, [letterIndex, offsets, pageKey, scrollParentRef, trackIndex]);

  const shouldVirtualize = items.length > TRACK_LIST_VIRTUALIZE_THRESHOLD;
  const [startIndex, endIndex] = useMemo(() => {
    if (!items.length) return [0, -1];
    if (!shouldVirtualize) return [0, items.length - 1];
    const startTop = Math.max(0, viewport.top - TRACK_ROW_HEIGHT * TRACK_LIST_OVERSCAN);
    const endTop = viewport.top + viewport.height + TRACK_ROW_HEIGHT * TRACK_LIST_OVERSCAN;
    let lo = 0;
    let hi = offsets.length - 1;
    let start = 0;
    while (lo <= hi) {
      const mid = (lo + hi) >>> 1;
      const itemHeight = items[mid].type === "alpha" ? TRACK_ALPHA_HEIGHT : TRACK_ROW_HEIGHT;
      if (offsets[mid] + itemHeight >= startTop) {
        start = mid;
        hi = mid - 1;
      } else {
        lo = mid + 1;
      }
    }
    lo = start;
    hi = offsets.length - 1;
    let end = start;
    while (lo <= hi) {
      const mid = (lo + hi) >>> 1;
      if (offsets[mid] <= endTop) {
        end = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    const expectedWindow = Math.min(
      items.length,
      Math.max(28, Math.ceil(Math.max(viewport.height, window.innerHeight * 0.5) / TRACK_ROW_HEIGHT) + TRACK_LIST_OVERSCAN * 2)
    );
    const safeEnd = Math.max(end, start + expectedWindow - 1);
    return [start, Math.min(items.length - 1, safeEnd)];
  }, [items, offsets, shouldVirtualize, viewport.height, viewport.top]);

  if (!items.length) {
    return <p className="rounded-xl border border-dashed border-[var(--line)] px-4 py-8 text-center text-sm text-[var(--dim)]">{emptyText}</p>;
  }

  return (
    <div id={`track-virtual-list-${pageKey}`} ref={containerRef} className="relative" style={{ height: totalHeight }}>
      {items.slice(startIndex, endIndex + 1).map((item, localIndex) => {
        const index = startIndex + localIndex;
        return (
          <div
            key={item.key}
            className="absolute left-0 right-0"
            style={{
              height: item.type === "alpha" ? TRACK_ALPHA_HEIGHT : TRACK_ROW_HEIGHT,
              transform: `translateY(${offsets[index]}px)`
            }}
          >
            {renderItem(item)}
          </div>
        );
      })}
    </div>
  );
}

function NumberControl({
  value,
  setValue,
  min,
  max,
  step = 1,
  suffix = ""
}: {
  value: number;
  setValue: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
}) {
  const [draft, setDraft] = useState(String(value));

  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  const commit = () => {
    if (!draft.trim()) {
      setDraft(String(value));
      return;
    }
    const parsed = Number(draft);
    if (!Number.isFinite(parsed)) {
      setDraft(String(value));
      return;
    }
    const next = Math.max(min, Math.min(max, parsed));
    setValue(next);
    setDraft(String(next));
  };

  const nudge = (delta: number) => {
    setValue(Math.max(min, Math.min(max, value + delta)));
  };

  return (
    <div className="flex items-center overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--bg-soft)]">
      <button type="button" onClick={() => nudge(-step)} className="px-3 py-2 text-[var(--dim)] hover:text-[var(--text)]">-</button>
      <input
        type="text"
        inputMode="numeric"
        value={draft}
        onChange={(e) => {
          const next = e.target.value;
          if (/^\d*$/.test(next)) setDraft(next);
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            commit();
            e.currentTarget.blur();
          }
          if (e.key === "Escape") {
            setDraft(String(value));
            e.currentTarget.blur();
          }
        }}
        className="h-10 w-20 bg-transparent text-center text-sm outline-none"
      />
      <span className="pr-2 text-xs text-[var(--dim)]">{suffix}</span>
      <button type="button" onClick={() => nudge(step)} className="px-3 py-2 text-[var(--dim)] hover:text-[var(--text)]">＋</button>
    </div>
  );
}

function clampChannel(value: number) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function clampAlpha(value: number) {
  return Math.max(0, Math.min(1, value));
}

function parseRgbaColor(value: string) {
  const hexMatch = value.trim().match(/^#?([0-9a-f]{6})([0-9a-f]{2})?$/i);
  if (hexMatch) {
    return {
      r: Number.parseInt(hexMatch[1].slice(0, 2), 16),
      g: Number.parseInt(hexMatch[1].slice(2, 4), 16),
      b: Number.parseInt(hexMatch[1].slice(4, 6), 16),
      a: hexMatch[2] ? clampAlpha(Number.parseInt(hexMatch[2], 16) / 255) : 1
    };
  }
  const match = value.match(/rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*([0-9.]+))?\s*\)/i);
  if (!match) return { r: 0, g: 0, b: 0, a: 0.69 };
  return {
    r: clampChannel(Number(match[1])),
    g: clampChannel(Number(match[2])),
    b: clampChannel(Number(match[3])),
    a: clampAlpha(match[4] === undefined ? 1 : Number(match[4]))
  };
}

function toHexColor({ r, g, b }: { r: number; g: number; b: number }) {
  return `#${[r, g, b].map((value) => clampChannel(value).toString(16).padStart(2, "0")).join("")}`;
}

function rgbaText(r: number, g: number, b: number, a: number) {
  return `rgba(${clampChannel(r)}, ${clampChannel(g)}, ${clampChannel(b)}, ${clampAlpha(a).toFixed(2).replace(/0+$/, "").replace(/\.$/, "")})`;
}

function ColorValueInput({
  value,
  suffix = "",
  max,
  onCommit
}: {
  value: number;
  suffix?: string;
  max: number;
  onCommit: (value: number) => void;
}) {
  const displayValue = suffix ? `${Math.round(value)}${suffix}` : String(Math.round(value));
  const [draft, setDraft] = useState(displayValue);

  useEffect(() => {
    setDraft(displayValue);
  }, [displayValue]);

  const commit = () => {
    const numeric = Number(draft.replace(suffix, "").trim());
    if (!Number.isFinite(numeric)) {
      setDraft(displayValue);
      return;
    }
    const next = Math.max(0, Math.min(max, numeric));
    onCommit(next);
    setDraft(suffix ? `${Math.round(next)}${suffix}` : String(Math.round(next)));
  };

  return (
    <input
      value={draft}
      inputMode="numeric"
      onChange={(event) => {
        const next = event.target.value;
        if (/^\d{0,3}%?$/.test(next)) setDraft(next);
      }}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          commit();
          event.currentTarget.blur();
        }
        if (event.key === "Escape") {
          setDraft(displayValue);
          event.currentTarget.blur();
        }
      }}
      className="color-value-input"
    />
  );
}

function rgbToHsv({ r, g, b }: { r: number; g: number; b: number }) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;
  let h = 0;
  if (delta) {
    if (max === rn) h = ((gn - bn) / delta) % 6;
    else if (max === gn) h = (bn - rn) / delta + 2;
    else h = (rn - gn) / delta + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max === 0 ? 0 : delta / max, v: max };
}

function hsvToRgb(h: number, s: number, v: number) {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let rn = 0;
  let gn = 0;
  let bn = 0;
  if (h < 60) [rn, gn, bn] = [c, x, 0];
  else if (h < 120) [rn, gn, bn] = [x, c, 0];
  else if (h < 180) [rn, gn, bn] = [0, c, x];
  else if (h < 240) [rn, gn, bn] = [0, x, c];
  else if (h < 300) [rn, gn, bn] = [x, 0, c];
  else [rn, gn, bn] = [c, 0, x];
  return {
    r: clampChannel((rn + m) * 255),
    g: clampChannel((gn + m) * 255),
    b: clampChannel((bn + m) * 255)
  };
}

function ToggleSwitch({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  const switchRef = useRef<(HTMLElement & { selected?: boolean }) | null>(null);

  useEffect(() => {
    if (switchRef.current) switchRef.current.selected = checked;
  }, [checked]);

  return (
    <md-switch ref={switchRef} selected={checked} icons={false} onInput={onChange} class="material-control" />
  );
}

function MaterialCheckbox({
  checked,
  onChange,
  indeterminate = false,
  disabled = false,
  className = ""
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  indeterminate?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  const checkboxRef = useRef<(HTMLElement & { checked?: boolean; indeterminate?: boolean }) | null>(null);

  useEffect(() => {
    if (!checkboxRef.current) return;
    checkboxRef.current.checked = checked;
    checkboxRef.current.indeterminate = indeterminate;
  }, [checked, indeterminate]);

  return (
    <md-checkbox
      ref={checkboxRef}
      checked={checked}
      indeterminate={indeterminate}
      disabled={disabled}
      touch-target="none"
      onInput={(event) => onChange(Boolean((event.currentTarget as HTMLElement & { checked?: boolean }).checked))}
      class={`material-control material-checkbox ${className}`}
    />
  );
}

function AnimatedMaterialCheckbox(props: Parameters<typeof MaterialCheckbox>[0]) {
  return (
    <motion.span
      initial={{ opacity: 0, scale: 0.72, x: -4 }}
      animate={{ opacity: 1, scale: 1, x: 0 }}
      exit={{ opacity: 0, scale: 0.72, x: -4 }}
      transition={{ type: "spring", stiffness: 520, damping: 34, mass: 0.55 }}
      className="inline-flex h-5 w-5 items-center justify-center"
    >
      <MaterialCheckbox {...props} />
    </motion.span>
  );
}

function MaterialSlider({
  min,
  max,
  step,
  value,
  onChange,
  valueLabel,
  className = ""
}: {
  min: number;
  max: number;
  step?: number;
  value: number;
  onChange: (value: number) => void;
  valueLabel?: string;
  className?: string;
}) {
  const progress = max === min ? 0 : ((value - min) / (max - min)) * 100;
  return (
    <md-slider
      min={min}
      max={max}
      step={step ?? 1}
      value={value}
      value-label={valueLabel ?? String(value)}
      labeled
      onInput={(event) => onChange(Number((event.currentTarget as HTMLInputElement).value))}
      class={`material-slider ${className}`}
      style={{ ["--progress" as string]: `${Math.max(0, Math.min(100, progress))}%` }}
    />
  );
}

function SliderPresetMarks({
  values,
  min,
  max,
  activeValue,
  format,
  onSelect
}: {
  values: number[];
  min: number;
  max: number;
  activeValue: number;
  format: (value: number) => string;
  onSelect: (value: number) => void;
}) {
  return (
    <div className="relative mt-2 h-7 px-5 text-xs">
      <div className="relative h-full">
        {values.map((value) => {
          const left = ((value - min) / (max - min)) * 100;
          return (
            <button
              key={value}
              type="button"
              onClick={() => onSelect(value)}
              style={{ left: `${left}%` }}
              className={`absolute top-0 -translate-x-1/2 rounded-md px-1 py-1 font-semibold ${Math.abs(activeValue - value) < 0.05 ? "text-[var(--accent)]" : "text-[var(--dim)] hover:text-[var(--text)]"}`}
            >
              {format(value)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ColorField({
  value,
  onChange,
  disabled = false,
  className = "",
  alpha = false
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
  alpha?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [openUp, setOpenUp] = useState(false);
  const fieldRef = useRef<HTMLDivElement | null>(null);
  const color = parseRgbaColor(value);
  const hsv = rgbToHsv(color);
  const hex = toHexColor(color);
  const displayValue = alpha ? rgbaText(color.r, color.g, color.b, color.a).replace(/^rgba/, "RGBA") : hex.toUpperCase();
  const baseHue = `hsl(${hsv.h} 100% 50%)`;
  const updatePlacement = useCallback(() => {
    const rect = fieldRef.current?.getBoundingClientRect();
    if (!rect) return;
    const freeBelow = window.innerHeight - rect.bottom;
    setOpenUp(freeBelow < 340 && rect.top > freeBelow);
  }, []);
  useEffect(() => {
    if (!open) return;
    updatePlacement();
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target || fieldRef.current?.contains(target)) return;
      setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", updatePlacement);
    window.addEventListener("scroll", updatePlacement, true);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", updatePlacement);
      window.removeEventListener("scroll", updatePlacement, true);
    };
  }, [open, updatePlacement]);
  const commitColor = (next: { r: number; g: number; b: number; a?: number }) => {
    if (alpha) onChange(rgbaText(next.r, next.g, next.b, next.a ?? color.a));
    else onChange(toHexColor(next));
  };
  const updateSvFromPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const s = clampAlpha((event.clientX - rect.left) / rect.width);
    const v = clampAlpha(1 - (event.clientY - rect.top) / rect.height);
    commitColor({ ...hsvToRgb(hsv.h, s, v), a: color.a });
  };
  return (
    <div ref={fieldRef} className={`relative ${disabled ? "opacity-45" : ""} ${className}`} onClick={(event) => event.stopPropagation()}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          updatePlacement();
          setOpen((prev) => !prev);
        }}
        className={`color-field-trigger ${open ? "border-[var(--accent)]" : "border-[var(--line)] hover:border-[var(--accent)]/55"}`}
      >
        <span className="color-swatch" style={{ backgroundColor: alpha ? rgbaText(color.r, color.g, color.b, color.a) : hex }} />
        <span className="min-w-0 flex-1 truncate text-left font-semibold">{displayValue}</span>
      </button>
      {open && (
        <div className={`color-panel ${openUp ? "color-panel-up" : ""}`}>
          <div
            className="color-plane"
            style={{
              background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, ${baseHue})`
            }}
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId);
              updateSvFromPointer(event);
            }}
            onPointerMove={(event) => {
              if (event.buttons !== 1) return;
              updateSvFromPointer(event);
            }}
          >
            <span className="color-plane-thumb" style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%` }} />
          </div>
          <div className="color-slider-row">
            <input
              type="range"
              min={0}
              max={360}
              value={Math.round(hsv.h)}
              onChange={(event) => commitColor({ ...hsvToRgb(Number(event.target.value), hsv.s, hsv.v), a: color.a })}
              className="color-hue-slider"
            />
          </div>
          {alpha && (
            <div className="color-slider-row checker-bg rounded-full">
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round(color.a * 100)}
                onChange={(event) => commitColor({ r: color.r, g: color.g, b: color.b, a: Number(event.target.value) / 100 })}
                className="color-alpha-slider"
                style={{
                  background: `linear-gradient(to right, transparent, ${hex})`
                }}
              />
            </div>
          )}
          <div className={`color-values ${alpha ? "grid-cols-[72px_repeat(4,minmax(0,1fr))]" : "grid-cols-[72px_repeat(3,minmax(0,1fr))]"}`}>
            <div className="color-mode-label">{alpha ? "RGBA" : "RGB"}</div>
            {(["r", "g", "b"] as const).map((channel) => (
              <ColorValueInput
                key={channel}
                value={color[channel]}
                max={255}
                onCommit={(value) => {
                  const next = { ...color, [channel]: clampChannel(value) };
                  commitColor(next);
                }}
              />
            ))}
            {alpha && (
              <ColorValueInput
                value={color.a * 100}
                suffix="%"
                max={100}
                onCommit={(value) => commitColor({ ...color, a: value / 100 })}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function MenuSelect<T extends string>({
  value,
  onChange,
  options,
  className = ""
}: {
  value: T;
  onChange: (value: T) => void;
  options: Array<{ value: T; label: string }>;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value) || options[0];
  return (
    <div className={`relative ${className}`} onClick={(event) => event.stopPropagation()}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={`flex h-10 w-full items-center justify-between rounded-lg border px-3 text-sm transition ${open ? "border-[var(--accent)] text-[var(--text)]" : "border-[var(--line)] text-[var(--text)] hover:border-[var(--accent)]/55"}`}
      >
        <span className="truncate">{selected?.label}</span>
        <LineIcon className={`h-4 w-4 shrink-0 text-[var(--dim)] transition-transform ${open ? "rotate-180" : ""}`}>
          <path d="m6 9 6 6 6-6" />
        </LineIcon>
      </button>
      {open && (
        <div className="absolute right-0 top-11 z-[110] w-full min-w-32 overflow-hidden rounded-xl bg-[var(--bg-soft)]/95 p-1 text-sm shadow-2xl backdrop-blur">
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
              className={`w-full rounded-md px-3 py-2 text-left ${option.value === value ? "accent-soft-action" : "hover:bg-[var(--surface)]"}`}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function InfoCard({ title, children, className = "" }: { title: string; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl bg-[var(--surface)]/65 p-4 ${className}`}>
      <h2 className="mb-3 text-sm font-semibold text-[var(--dim)]">{title}</h2>
      {children}
    </section>
  );
}

function InfoItem({ label, value, mono = false, wide = false }: { label: string; value: ReactNode; mono?: boolean; wide?: boolean }) {
  return (
    <div className={wide ? "md:col-span-2" : ""}>
      <p className="mb-1 text-xs font-semibold text-[var(--dim)]">{label}</p>
      <div className={`${mono ? "break-all" : "break-words"} text-base font-semibold text-[var(--text)]`}>
        {value || "-"}
      </div>
    </div>
  );
}

function makeCover(colors: string[], label: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${colors[0]}"/><stop offset="100%" stop-color="${colors[1]}"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/><circle cx="300" cy="290" r="210" fill="rgba(255,255,255,0.1)"/><text x="70" y="720" fill="white" font-family="Segoe UI" font-size="72">${label}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

const IDLE_TRACK_INFO = {
  title: "静听",
  artist: "此刻有声",
  album: "Still",
  cover: makeCover(["#2a3140", "#596276"], "Still")
};

function toTimeText(sec: number) {
  if (!Number.isFinite(sec)) return "--:--";
  const mm = Math.floor(sec / 60);
  const ss = Math.floor(sec % 60);
  return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

function formatDurationDetail(sec?: number) {
  if (!sec || !Number.isFinite(sec)) return "-";
  return `${toTimeText(sec)} (${Math.round(sec * 1000).toLocaleString()} ms)`;
}

function formatBytes(bytes?: number) {
  if (!bytes || !Number.isFinite(bytes)) return "-";
  const mb = bytes / 1_000_000;
  const mib = bytes / 1_048_576;
  return `${mb.toFixed(2)} MB (${bytes.toLocaleString()} B; ${mib.toFixed(2)} MiB)`;
}

function formatDateTime(timestamp?: number) {
  if (!timestamp || !Number.isFinite(timestamp)) return "-";
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(timestamp));
}

function formatBitrate(value?: number) {
  if (!value || !Number.isFinite(value)) return "-";
  return `${Math.round(value / 1000).toLocaleString()} kbps`;
}

function formatSampleRate(value?: number) {
  if (!value || !Number.isFinite(value)) return "-";
  return `${(value / 1000).toFixed(value % 1000 ? 1 : 0)} kHz`;
}

function formatChannels(value?: number) {
  if (!value || !Number.isFinite(value)) return "-";
  if (value === 1) return "单声道";
  if (value === 2) return "立体声";
  return `${value} 声道`;
}

function toRateText(rate: number) {
  return `${Number(rate.toFixed(2)).toString()}x`;
}

function getExt(name: string) {
  const index = name.lastIndexOf(".");
  return index === -1 ? "" : name.slice(index).toLowerCase();
}

function getBaseName(name: string) {
  const ext = getExt(name);
  return ext ? name.slice(0, -ext.length) : name;
}

function getPinyinInitial(text: string) {
  const first = text.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").charAt(0);
  if (!first) return "#";
  const upper = first.toUpperCase();
  if (/[A-Z]/.test(upper)) return upper;
  if (/[0-9]/.test(upper)) return "#";
  if (!containsCjk(first)) return "#";
  let initial = "#";
  for (const [letter, boundary] of PINYIN_BOUNDARIES) {
    if (compareText(first, boundary) >= 0) initial = letter;
  }
  return initial;
}

function toPinyinSortText(text: string) {
  return text.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").split("").map((char) => {
    if (/[\w\s\-'.()（）/]/.test(char)) return char.toLowerCase();
    if (PINYIN_CHAR_MAP[char]) return PINYIN_CHAR_MAP[char];
    if (containsCjk(char)) return `${getPinyinInitial(char).toLowerCase()}${char}`;
    return char;
  }).join("");
}

const SEARCH_PINYIN_BOUNDARIES = [
  ["a", "阿"], ["b", "芭"], ["c", "擦"], ["d", "搭"], ["e", "蛾"], ["f", "发"], ["g", "噶"], ["h", "哈"],
  ["j", "击"], ["k", "喀"], ["l", "拉"], ["m", "妈"], ["n", "拿"], ["o", "哦"], ["p", "啪"], ["q", "期"],
  ["r", "然"], ["s", "撒"], ["t", "塌"], ["w", "挖"], ["x", "昔"], ["y", "压"], ["z", "匝"]
] as const;
const SEARCH_PINYIN_CHAR_MAP: Record<string, string> = {
  "\u90d1": "zheng", "\u7956": "zu",
  阿: "a", 啊: "a", 爱: "ai", 安: "an", 暗: "an",
  八: "ba", 把: "ba", 白: "bai", 百: "bai", 半: "ban", 北: "bei", 悲: "bei", 别: "bie", 不: "bu",
  蔡: "cai", 曾: "ceng", 长: "chang", 唱: "chang", 超: "chao", 陈: "chen", 城: "cheng", 春: "chun",
  大: "da", 到: "dao", 的: "de", 邓: "deng", 地: "di", 低: "di", 点: "dian", 东: "dong", 冬: "dong", 都: "dou", 独: "du", 短: "duan",
  额: "e", 儿: "er", 尔: "er",
  发: "fa", 菲: "fei", 飞: "fei", 风: "feng", 馥: "fu",
  高: "gao", 歌: "ge", 格: "ge", 孤: "gu", 国: "guo", 光: "guang",
  海: "hai", 韩: "han", 好: "hao", 浩: "hao", 和: "he", 黑: "hei", 红: "hong", 花: "hua", 华: "hua", 坏: "huai", 欢: "huan", 黄: "huang", 回: "hui", 会: "hui", 火: "huo",
  击: "ji", 季: "ji", 记: "ji", 家: "jia", 间: "jian", 杰: "jie", 界: "jie", 金: "jin", 近: "jin", 静: "jing", 敬: "jing", 旧: "jiu", 就: "jiu", 俊: "jun",
  开: "kai", 哭: "ku",
  来: "lai", 蓝: "lan", 丽: "li", 李: "li", 离: "li", 林: "lin", 亮: "liang", 靓: "liang", 刘: "liu", 路: "lu", 伦: "lun", 绿: "lv",
  妈: "ma", 毛: "mao", 没: "mei", 美: "mei", 们: "men", 梦: "meng", 明: "ming", 末: "mo",
  拿: "na", 南: "nan", 年: "nian", 你: "ni", 鸟: "niao",
  哦: "o",
  啪: "pa", 期: "qi", 棋: "qi", 曲: "qu", 去: "qu",
  然: "ran", 人: "ren", 日: "ri", 荣: "rong", 茹: "ru",
  撒: "sa", 山: "shan", 伤: "shang", 声: "sheng", 生: "sheng", 是: "shi", 世: "shi", 水: "shui", 孙: "sun",
  她: "ta", 他: "ta", 它: "ta", 塌: "ta", 天: "tian", 田: "tian", 听: "ting", 腾: "teng",
  挖: "wa", 王: "wang", 我: "wo", 五: "wu", 舞: "wu",
  西: "xi", 昔: "xi", 喜: "xi", 夏: "xia", 想: "xiang", 笑: "xiao", 萧: "xiao", 小: "xiao", 心: "xin", 信: "xin", 星: "xing", 迅: "xun", 薛: "xue", 学: "xue", 雪: "xue", 许: "xu",
  压: "ya", 燕: "yan", 眼: "yan", 颜: "yan", 样: "yang", 要: "yao", 夜: "ye", 也: "ye", 一: "yi", 依: "yi", 怡: "yi", 易: "yi", 奕: "yi", 音: "yin", 银: "yin", 颖: "ying", 永: "yong", 有: "you", 友: "you", 由: "you", 又: "you", 雨: "yu", 鱼: "yu", 与: "yu", 月: "yue", 乐: "yue", 远: "yuan", 云: "yun",
  匝: "za", 在: "zai", 再: "zai", 张: "zhang", 站: "zhan", 甄: "zhen", 之: "zhi", 只: "zhi", 中: "zhong", 周: "zhou", 紫: "zi", 自: "zi", 姿: "zi", 最: "zui", 走: "zou"
};

function getSearchPinyinInitial(char: string) {
  let initial = "";
  for (const [letter, boundary] of SEARCH_PINYIN_BOUNDARIES) {
    if (compareText(char, boundary) >= 0) initial = letter;
  }
  return initial || getPinyinInitial(char).toLowerCase();
}

function normalizeSearchText(text: string) {
  return text
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function getPinyinSearchVariants(text: string) {
  const normalized = normalizeSearchText(text);
  const pinyinParts: string[] = [];
  const initialParts: string[] = [];

  for (const char of Array.from(text)) {
    const pinyin = SEARCH_PINYIN_CHAR_MAP[char] || PINYIN_CHAR_MAP[char];
    if (pinyin) {
      pinyinParts.push(pinyin);
      initialParts.push(pinyin.charAt(0));
    } else if (containsCjk(char)) {
      const initial = getSearchPinyinInitial(char);
      pinyinParts.push(initial);
      initialParts.push(initial);
    } else {
      const normalizedChar = normalizeSearchText(char);
      pinyinParts.push(normalizedChar);
      if (/[a-z0-9]/.test(normalizedChar)) initialParts.push(normalizedChar);
    }
  }

  const pinyin = pinyinParts.join("");
  const initials = initialParts.join("");
  return [normalized, pinyin, initials].filter(Boolean);
}

function matchesPinyinSearch(fields: Array<string | number | undefined>, rawKeyword: string) {
  const keyword = normalizeSearchText(rawKeyword);
  if (!keyword) return true;
  const compactKeyword = keyword.replace(/\s+/g, "");
  const haystack = fields
    .flatMap((field) => getPinyinSearchVariants(String(field ?? "")))
    .join(" ");
  const compactHaystack = haystack.replace(/\s+/g, "");
  return haystack.includes(keyword) || Boolean(compactKeyword && compactHaystack.includes(compactKeyword));
}

function getTrackAlphaText(track: Track, sortKey: SortKey) {
  if (sortKey === "artist") return track.artist || track.title;
  if (sortKey === "album") return track.album || track.title;
  if (sortKey === "folder") return track.folder || track.title;
  if (sortKey === "filePath") return getBaseName(track.filePath || track.title);
  return track.title;
}

function getTrackAlphaLetter(track: Track, sortKey: SortKey) {
  return getPinyinInitial(getTrackAlphaText(track, sortKey));
}

function compareTrackAlphaText(a: Track, b: Track, sortKey: SortKey) {
  const aLetter = getTrackAlphaLetter(a, sortKey);
  const bLetter = getTrackAlphaLetter(b, sortKey);
  const letterDelta = TRACK_ALPHA_LETTERS.indexOf(aLetter) - TRACK_ALPHA_LETTERS.indexOf(bLetter);
  if (letterDelta !== 0) return letterDelta;
  return enCollator.compare(toPinyinSortText(getTrackAlphaText(a, sortKey)), toPinyinSortText(getTrackAlphaText(b, sortKey)));
}

function toFileUrl(localPath: string) {
  const normalized = localPath.replace(/\\/g, "/");
  const withLeading = normalized.startsWith("/") ? normalized : `/${normalized}`;
  return encodeURI(`file://${withLeading}`);
}

function normalizeFolderPath(value: string) {
  return value
    .replace(/\\/g, "/")
    .replace(/\/+/g, "/")
    .replace(/\/$/, "")
    .trim();
}

function getFolderPathFromTrackPath(relativePath: string, localPath?: string) {
  const source = localPath || relativePath;
  const normalized = normalizeFolderPath(source);
  const slashIndex = normalized.lastIndexOf("/");
  if (slashIndex > 0) return normalized.slice(0, slashIndex);
  const relative = normalizeFolderPath(relativePath);
  const relativeSlash = relative.lastIndexOf("/");
  if (relativeSlash > 0) return relative.slice(0, relativeSlash);
  return "Imported";
}

function parseLrc(raw: string) {
  const lines = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const result: LyricLine[] = [];
  const byTime = new Map<number, LyricLine>();

  lines.forEach((line) => {
    const stamps = [...line.matchAll(/\[(\d{1,2}):(\d{1,2})(?:[.:](\d{1,3}))?]/g)];
    if (!stamps.length) return;

    const content = line.replace(/\[(\d{1,2}):(\d{1,2})(?:[.:](\d{1,3}))?]/g, "").trim();
    const enhanced = parseEnhancedLyricWords(content);
    const [main, translation] = splitLyricText(enhanced.text);
    const words = enhanced.words.length > 1 && main
      ? trimEnhancedWordsToText(enhanced.words, main)
      : [];

    stamps.forEach((stamp) => {
      const minute = Number(stamp[1]);
      const second = Number(stamp[2]);
      const msText = stamp[3] || "0";
      const ms = Number(msText.padEnd(3, "0")) / 1000;
      const time = minute * 60 + second + ms;
      const existing = byTime.get(time);
      if (existing) {
        const contentText = main || translation || "";
        if (!contentText) return;
        if (looksLikeTranslation(contentText, existing.text)) {
          existing.translation = appendLyricTranslation(existing.translation, contentText);
        } else if (!existing.text || existing.text === "...") {
          existing.text = contentText;
          existing.translation = translation || existing.translation;
        } else if (existing.text !== contentText) {
          existing.translation = appendLyricTranslation(existing.translation, contentText);
        }
        if (!existing.words?.length && words.length) existing.words = words;
        return;
      }
      const item = { time, text: main || "...", translation, words: words.length ? words : undefined } as LyricLine;
      byTime.set(time, item);
      result.push(item);
    });
  });

  return result.sort((a, b) => a.time - b.time);
}

function parsePlainLyrics(raw: string) {
  return mergeAdjacentPlainTranslations(raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean))
    .map((line, index) => ({ time: index * 5, ...line }));
}

function toLyricSource(id: string, label: string, kind: "local" | "embedded", raw: string) {
  const cleaned = normalizeEmbeddedLyric(raw);
  const parsed = parseLrc(cleaned);
  const lines = parsed.length ? parsed : parsePlainLyrics(raw);
  return { id, label, kind, lines } as LyricSource;
}

function getLyricSourceLabel(source?: LyricSource) {
  if (!source) return "";
  if (source.kind === "embedded" || source.id === "embedded") return "内嵌歌词";
  if (source.kind === "local" && (source.id === "local" || /lrc/i.test(source.label))) return "本地 LRC";
  if (source.kind === "local" && /[�锟镶泣]/.test(source.label)) return "本地歌词";
  return source.label || (source.kind === "local" ? "本地歌词" : "内嵌歌词");
}

function normalizeEmbeddedLyric(raw: string) {
  return raw
    .replace(/\r/g, "")
    .replace(/\[(\d{1,2}):(\d{1,2}):(\d{1,3})]/g, "[$1:$2.$3]")
    .trim();
}

function parseEnhancedLyricWords(content: string) {
  const words: LyricWord[] = [];
  let text = "";
  const matches = [...content.matchAll(/<(\d{1,2}):(\d{1,2})(?:[.:](\d{1,3}))?>([^<]*)/g)];
  if (!matches.length) return { text: content, words };

  matches.forEach((match) => {
    const minute = Number(match[1]);
    const second = Number(match[2]);
    const msText = match[3] || "0";
    const value = match[4] || "";
    const time = minute * 60 + second + Number(msText.padEnd(3, "0")) / 1000;
    words.push({ time, text: value });
    text += value;
  });

  return { text: text.trim() || content.replace(/<(\d{1,2}):(\d{1,2})(?:[.:](\d{1,3}))?>/g, "").trim(), words };
}

function trimEnhancedWordsToText(words: LyricWord[], target: string) {
  const result: LyricWord[] = [];
  let collected = "";

  for (const word of words) {
    if (collected.length >= target.length) break;
    const remaining = target.length - collected.length;
    const nextText = word.text.length > remaining ? word.text.slice(0, remaining) : word.text;
    result.push({ ...word, text: nextText });
    collected += nextText;
  }

  const normalizedCollected = collected.replace(/\s+/g, "");
  const normalizedTarget = target.replace(/\s+/g, "");
  return normalizedCollected === normalizedTarget ? result.filter((word) => word.text) : [];
}

function containsCjk(text: string) {
  return /[\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af]/.test(text);
}

function looksLikeTranslation(candidate: string, original = "") {
  if (!candidate.trim()) return false;
  if (!original.trim()) return false;
  if (containsCjk(candidate) && !containsCjk(original)) return true;
  if (!containsCjk(candidate) && containsCjk(original)) return true;
  return false;
}

function appendLyricTranslation(current: string | undefined, next: string) {
  const value = next.trim();
  if (!value) return current;
  const parts = (current || "").split("\n").map((part) => part.trim()).filter(Boolean);
  return parts.includes(value) ? current : [...parts, value].join("\n");
}

function splitLyricText(content: string): [string, string | undefined] {
  const separators = [/\s*\|\|\s*/, /\s*\|\s*/, /\s* \/ \s*/, /\s*／\s*/, /\s*｜\s*/];
  for (const separator of separators) {
    const parts = content.split(separator).map((part) => part.trim()).filter(Boolean);
    if (parts.length >= 2) return [parts[0], parts.slice(1).join("\n")];
  }
  const slashParts = content.split(/\s{2,}/).map((part) => part.trim()).filter(Boolean);
  if (slashParts.length >= 2 && looksLikeTranslation(slashParts[1], slashParts[0])) {
    return [slashParts[0], slashParts.slice(1).join("\n")];
  }
  return [content, undefined];
}

function mergeAdjacentPlainTranslations(lines: string[]) {
  const out: Array<{ text: string; translation?: string }> = [];
  for (let index = 0; index < lines.length; index += 1) {
    const [text, inlineTranslation] = splitLyricText(lines[index]);
    let translation = inlineTranslation;
    while (!inlineTranslation && lines[index + 1] && looksLikeTranslation(lines[index + 1], text)) {
      translation = appendLyricTranslation(translation, lines[index + 1]);
      index += 1;
    }
    out.push({ text, translation });
  }
  return out;
}

function normalizeLyricLines(lines: LyricLine[]) {
  const out: LyricLine[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    const text = line.text.trim();
    index += 1;
    if (!text) continue;

    const group = [{ ...line, text }];
    while (index < lines.length) {
      const next = lines[index];
      const nextText = next.text.trim();
      const previous = group[group.length - 1];
      const looksLikePersistedWordSplit = nextText === text
        && !previous.words?.length
        && !next.words?.length
        && next.time - previous.time <= 12;
      if (!looksLikePersistedWordSplit) break;
      group.push({ ...next, text: nextText });
      index += 1;
    }

    const normalized = group[0];
    for (const duplicate of group.slice(1)) {
      if (!normalized.translation && duplicate.translation && looksLikeTranslation(duplicate.translation, normalized.text)) {
        normalized.translation = duplicate.translation;
      }
    }
    if (!normalized.words?.length && group.length > 1) {
      normalized.words = buildWordsFromRepeatedLyricLines(normalized.text, group.map((item) => item.time));
    }
    out.push(normalized);
  }
  return out;
}

function buildWordsFromRepeatedLyricLines(text: string, times: number[]) {
  const units = splitLyricWordUnits(text);
  if (!units.length || times.length < 2) return undefined;
  const usableTimes = times.slice(0, Math.min(times.length, units.length + 1));
  if (usableTimes.length < Math.min(2, units.length)) return undefined;
  return units.slice(0, usableTimes.length).map((unit, index) => ({
    time: usableTimes[index],
    text: unit,
    endTime: index === units.length - 1 && usableTimes.length > units.length ? usableTimes[units.length] : undefined
  }));
}

function estimateWrappedLineCount(text: string, charsPerLine: number) {
  const segments = text.split(/\r?\n/).map((part) => part.trim());
  return segments.reduce((total, segment) => total + Math.max(1, Math.ceil(segment.length / charsPerLine)), 0);
}

function getActiveLyricIndexAt(lines: LyricLine[], time: number) {
  if (!lines.length) return -1;
  let low = 0;
  let high = lines.length - 1;
  let hit = 0;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if (time >= lines[middle].time) {
      hit = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return hit;
}

function getLyricWordProgressAt(lines: LyricLine[], lineIndex: number, time: number, duration = 0) {
  const line = lines[lineIndex];
  if (!line?.words?.length) return 0;
  const wordSpans = line.words.map((word) => Math.max(1, Array.from(word.text.trim() || word.text).length));
  const totalUnits = Math.max(1, wordSpans.reduce((sum, value) => sum + value, 0));
  let elapsedUnits = 0;

  for (let index = 0; index < line.words.length; index += 1) {
    const word = line.words[index];
    const wordUnits = wordSpans[index];
    const nextTime = word.endTime
      ?? line.words[index + 1]?.time
      ?? lines[lineIndex + 1]?.time
      ?? duration
      ?? word.time + 1;
    const wordStart = elapsedUnits / totalUnits;
    const wordEnd = (elapsedUnits + wordUnits) / totalUnits;
    if (time < word.time) return Math.max(0, Math.min(1, wordStart));
    if (time < nextTime) {
      const span = Math.max(0.08, nextTime - word.time);
      const wordProgress = Math.max(0, Math.min(1, (time - word.time) / span));
      return Math.max(0, Math.min(1, wordStart + (wordEnd - wordStart) * wordProgress));
    }
    elapsedUnits += wordUnits;
  }

  return 1;
}

function splitLyricWordUnits(text: string) {
  if (containsCjk(text)) {
    const units: string[] = [];
    let pendingSpace = "";
    for (const char of Array.from(text)) {
      if (/\s/.test(char)) {
        pendingSpace += char;
        continue;
      }
      units.push(`${pendingSpace}${char}`);
      pendingSpace = "";
    }
    if (pendingSpace && units.length) units[units.length - 1] += pendingSpace;
    return units;
  }
  const matches = text.match(/\s*\S+/g);
  return matches?.map((item) => item) || [];
}

function normalizeTagText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) {
    return value
      .map((item) => normalizeTagText(item))
      .filter(Boolean)
      .join("\n")
      .trim();
  }
  if (value && typeof value === "object") {
    const candidate = value as { text?: unknown; value?: unknown; id?: unknown };
    return normalizeTagText(candidate.text ?? candidate.value ?? candidate.id ?? "");
  }
  return "";
}

function normalizeArtistList(...values: unknown[]) {
  const out: string[] = [];
  const visit = (value: unknown) => {
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

function getTrackArtists(track: Pick<Track, "artist">) {
  const artists = normalizeArtistList(track.artist);
  return artists.length ? artists : [track.artist || "Unknown Artist"];
}

function pickNativeTag(native: Record<string, Array<{ id: string; value: unknown }>> | undefined, keys: string[]) {
  if (!native) return "";
  const upperKeys = keys.map((key) => key.toUpperCase());
  for (const tags of Object.values(native)) {
    for (const tag of tags || []) {
      if (upperKeys.includes(String(tag.id || "").toUpperCase())) {
        const text = normalizeTagText(tag.value);
        if (text) return text;
      }
    }
  }
  return "";
}

function pickNativePicture(native: Record<string, Array<{ id: string; value: unknown }>> | undefined) {
  if (!native) return undefined;
  for (const tags of Object.values(native)) {
    for (const tag of tags || []) {
      const id = String(tag.id || "").toUpperCase();
      if (!id.includes("PICTURE") && id !== "APIC") continue;
      const value = tag.value as { format?: string; data?: Uint8Array | number[] } | string;
      if (typeof value === "object" && value?.data && value?.format) {
        return coverDataUrlFromPicture(value);
      }
    }
  }
  return undefined;
}

function pictureToDataUrl(format: string, data: number[]) {
  let binary = "";
  const bytes = new Uint8Array(data);
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return `data:${format};base64,${btoa(binary)}`;
}

function coverDataUrlFromPicture(picture?: { format?: string; data?: Uint8Array | number[] }) {
  if (!picture?.format || !picture.data) return undefined;
  return pictureToDataUrl(picture.format, Array.from(picture.data));
}

function rgbToHex(r: number, g: number, b: number) {
  return `#${[r, g, b].map((value) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0")).join("")}`;
}

function normalizeAccentColor(color: string) {
  return /^#[0-9a-f]{6}$/i.test(color) ? color : "#008B8B";
}

function hexToRgb(color: string) {
  const normalized = normalizeAccentColor(color).slice(1);
  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16)
  };
}

function rgbToHsl(r: number, g: number, b: number) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const lightness = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l: lightness };
  const delta = max - min;
  const saturation = lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);
  let hue = 0;
  if (max === rn) hue = (gn - bn) / delta + (gn < bn ? 6 : 0);
  else if (max === gn) hue = (bn - rn) / delta + 2;
  else hue = (rn - gn) / delta + 4;
  return { h: hue * 60, s: saturation, l: lightness };
}

function hslColor(h: number, s: number, l: number, alpha?: number) {
  const hsla = `${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
  return alpha === undefined ? `hsl(${hsla})` : `hsl(${hsla} / ${alpha})`;
}

function relativeLuminance({ r, g, b }: { r: number; g: number; b: number }) {
  const toLinear = (value: number) => {
    const channel = value / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

function buildThemePalette(accent: string, mode: "dark" | "light") {
  const { r, g, b } = hexToRgb(accent);
  const { h, s } = rgbToHsl(r, g, b);
  const saturation = Math.min(0.42, Math.max(0.16, s * 0.58));
  const accentReadable = relativeLuminance({ r, g, b }) > 0.42 ? "#111827" : "#ffffff";
  const accentStrong = mode === "dark"
    ? hslColor(h, Math.min(0.72, Math.max(0.38, s + 0.16)), 0.72)
    : hslColor(h, Math.min(0.70, Math.max(0.36, s + 0.12)), 0.30);
  if (mode === "dark") {
    return {
      bg: hslColor(h, saturation, 0.12),
      bgSoft: hslColor(h, saturation, 0.16),
      surface: hslColor(h, saturation, 0.22),
      line: hslColor(h, saturation, 0.30),
      text: hslColor(h, 0.26, 0.90),
      dim: hslColor(h, 0.20, 0.66),
      accentSoft: hslColor(h, Math.min(0.55, saturation + 0.12), 0.30, 0.42),
      accentReadable,
      accentStrong,
      scrollbar: hslColor(h, saturation, 0.42, 0.55)
    };
  }
  return {
    bg: hslColor(h, saturation, 0.94),
    bgSoft: hslColor(h, saturation, 0.97),
    surface: hslColor(h, saturation, 0.89),
    line: hslColor(h, saturation, 0.80),
    text: hslColor(h, 0.26, 0.20),
    dim: hslColor(h, 0.20, 0.42),
    accentSoft: hslColor(h, Math.min(0.50, saturation + 0.10), 0.86, 0.62),
    accentReadable,
    accentStrong,
    scrollbar: hslColor(h, saturation, 0.64, 0.55)
  };
}

async function extractAccentFromImage(src: string) {
  if (!src) return "";
  return new Promise<string>((resolve) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        const size = 48;
        canvas.width = size;
        canvas.height = size;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) {
          resolve("");
          return;
        }
        context.drawImage(image, 0, 0, size, size);
        const { data } = context.getImageData(0, 0, size, size);
        let r = 0;
        let g = 0;
        let b = 0;
        let weight = 0;
        for (let index = 0; index < data.length; index += 4) {
          const alpha = data[index + 3] / 255;
          if (alpha < 0.2) continue;
          const red = data[index];
          const green = data[index + 1];
          const blue = data[index + 2];
          const saturation = Math.max(red, green, blue) - Math.min(red, green, blue);
          const pixelWeight = alpha * (1 + saturation / 96);
          r += red * pixelWeight;
          g += green * pixelWeight;
          b += blue * pixelWeight;
          weight += pixelWeight;
        }
        resolve(weight ? rgbToHex(r / weight, g / weight, b / weight) : "");
      } catch {
        resolve("");
      }
    };
    image.onerror = () => resolve("");
    image.src = src;
  });
}

async function readTags(file: File, localPath?: string) {
  const parseName = () => {
    const base = getBaseName(file.name);
    const parts = base.split(/\s[-–]\s/).map((item) => item.trim()).filter(Boolean);
    if (parts.length >= 2) {
      return { artist: parts[0], title: parts.slice(1).join(" - ") };
    }
    return { title: base };
  };

  const baseInfo = parseName();
  let merged: {
    title?: string;
    artist?: string;
    album?: string;
    year?: number;
    trackNo?: number;
    container?: string;
    codec?: string;
    bitrate?: number;
    sampleRate?: number;
    bitsPerSample?: number;
    channels?: number;
    lossless?: boolean;
    tagTypes?: string[];
    lyrics?: string;
    localLyrics?: Array<{ label: string; raw: string }>;
    cover?: string;
  } = { ...baseInfo };

  const host = window as HostWindow;
  if (localPath && host.electronAPI?.library?.readMetadata) {
    try {
      const meta = await host.electronAPI.library.readMetadata(localPath);
      merged = {
        ...merged,
        title: meta.title || merged.title,
        artist: normalizeArtistList(meta.artist).join(" / ") || merged.artist,
        album: meta.album || merged.album,
        year: Number(meta.year) || merged.year,
        trackNo: Number(meta.trackNo) || merged.trackNo,
        container: meta.container || merged.container,
        codec: meta.codec || merged.codec,
        bitrate: Number(meta.bitrate) || merged.bitrate,
        sampleRate: Number(meta.sampleRate) || merged.sampleRate,
        bitsPerSample: Number(meta.bitsPerSample) || merged.bitsPerSample,
        channels: Number(meta.channels) || merged.channels,
        lossless: typeof meta.lossless === "boolean" ? meta.lossless : merged.lossless,
        tagTypes: meta.tagTypes || merged.tagTypes,
        lyrics: meta.embeddedLyrics || merged.lyrics,
        localLyrics: meta.localLyrics,
        cover: meta.coverDataUrl || merged.cover
      };
      return merged;
    } catch {
      // Fall back to browser parser.
    }
  }

  try {
    let metadata = await parseBlob(file, { duration: false, skipCovers: false });
    if (!metadata?.common?.title && !metadata?.common?.album) {
      const buffer = new Uint8Array(await file.arrayBuffer());
      metadata = await parseBuffer(buffer, {
        mimeType: file.type || undefined,
        path: file.name,
        size: file.size
      }, { duration: false, skipCovers: false });
    }

    const common = metadata.common;
    const native = metadata.native;
    const embeddedLyrics = Array.isArray(common.lyrics)
      ? common.lyrics.filter(Boolean).join("\n")
      : typeof common.lyrics === "string"
        ? common.lyrics
        : "";

    const nativeAlbum = pickNativeTag(native, ["ALBUM", "TALB"]);
    const nativeYear = pickNativeTag(native, ["DATE", "YEAR", "TYER", "TDRC"]);
    const nativeTrack = pickNativeTag(native, ["TRACKNUMBER", "TRCK"]);
    const nativeLyrics = pickNativeTag(native, ["LYRICS", "UNSYNCEDLYRICS", "USLT", "SYLT", "LYRICSENG", "LYRIC"]);
    const nativeCover = pickNativePicture(native);

    merged = {
      ...merged,
      title: common.title || merged.title,
      artist: normalizeArtistList(common.artists, common.artist, pickNativeTag(native, ["ARTISTS", "ARTIST", "TPE1", "?ART"])).join(" / ") || common.albumartist || merged.artist,
      album: common.album || nativeAlbum || merged.album,
      year: Number(common.year) || Number((common.date || nativeYear || "").match(/(19\d{2}|20\d{2})/)?.[1]) || merged.year,
      trackNo: Number(common.track?.no) || Number(String(nativeTrack).split("/")[0]) || merged.trackNo,
      container: metadata.format.container || merged.container,
      codec: metadata.format.codec || merged.codec,
      bitrate: Number(metadata.format.bitrate) || merged.bitrate,
      sampleRate: Number(metadata.format.sampleRate) || merged.sampleRate,
      bitsPerSample: Number(metadata.format.bitsPerSample) || merged.bitsPerSample,
      channels: Number(metadata.format.numberOfChannels) || merged.channels,
      lossless: typeof metadata.format.lossless === "boolean" ? metadata.format.lossless : merged.lossless,
      tagTypes: metadata.format.tagTypes || merged.tagTypes,
      lyrics: embeddedLyrics || nativeLyrics || merged.lyrics,
      cover: coverDataUrlFromPicture(common.picture?.[0]) || nativeCover || merged.cover
    };
  } catch {
    // Keep filename fallback when the parser fails.
  }

  return merged;
}

async function readDuration(url: string) {
  return new Promise<number>((resolve) => {
    const probe = new Audio(url);
    probe.addEventListener("loadedmetadata", () => resolve(Number.isFinite(probe.duration) ? probe.duration : 0), { once: true });
    probe.addEventListener("error", () => resolve(0), { once: true });
  });
}

const DEMO_TRACKS: Track[] = [];

export default function App() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mainScrollRef = useRef<HTMLElement>(null);
  const queuePanelRef = useRef<HTMLDivElement>(null);
  const queueToggleRef = useRef<HTMLButtonElement>(null);
  const lyricsHudTimerRef = useRef<number | null>(null);
  const lyricRowRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const saveTimerRef = useRef<number | null>(null);
  const restoringRef = useRef(true);
  const viewHistoryRef = useRef<View[]>([]);
  const lyricResizeTimerRef = useRef<number | null>(null);
  const lyricManualScrollUntilRef = useRef(0);
  const lyricProgrammaticScrollRef = useRef(false);
  const lyricProgrammaticScrollTimerRef = useRef<number | null>(null);
  const lyricUserScrollTimerRef = useRef<number | null>(null);
  const lyricTranslationAnchorRef = useRef<{
    row: HTMLElement;
    scroller: HTMLElement;
    offsetTop: number;
    frameId: number | null;
  } | null>(null);
  const activeLyricIndexRef = useRef(-1);
  const lastLyricTrackKeyRef = useRef("");
  const lyricScrollPositionRef = useRef(24);
  const playbackFrameRef = useRef<number | null>(null);
  const currentLyricsRef = useRef<LyricLine[]>([]);
  const currentTrackDurationRef = useRef(0);
  const desktopLyricPayloadKeyRef = useRef("");
  const trackAlphaBubbleTimerRef = useRef<number | null>(null);
  const mainPointerRef = useRef({ x: 0, y: 0 });
  const scrollbarDraggingRef = useRef(false);
  const customScrollbarDraggingRef = useRef(false);

  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [view, setView] = useState<View>("songs");
  const [tracks, setTracks] = useState<Track[]>(DEMO_TRACKS);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [selectedArtist, setSelectedArtist] = useState("");
  const [selectedAlbum, setSelectedAlbum] = useState("");
  const [selectedPlaylistId, setSelectedPlaylistId] = useState("");
  const [selectedFolder, setSelectedFolder] = useState("");
  const [currentTrackId, setCurrentTrackId] = useState("");
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [volume, setVolume] = useState(0.85);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [sortKey, setSortKey] = useState<SortKey>("title");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [searchQuery, setSearchQuery] = useState("");
  const [artistSearchQuery, setArtistSearchQuery] = useState("");
  const [albumSearchQuery, setAlbumSearchQuery] = useState("");
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [multiSelectEnabled, setMultiSelectEnabled] = useState(false);
  const [selectedTrackIds, setSelectedTrackIds] = useState<string[]>([]);
  const [playlistContextMenu, setPlaylistContextMenu] = useState<PlaylistContextMenu>(null);
  const [createPlaylistDialogOpen, setCreatePlaylistDialogOpen] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState("");
  const [renamePlaylistId, setRenamePlaylistId] = useState("");
  const [renamePlaylistName, setRenamePlaylistName] = useState("");
  const [contextMenu, setContextMenu] = useState<TrackContextMenu | null>(null);
  const [contextPlaylistSubmenuOpen, setContextPlaylistSubmenuOpen] = useState(false);
  const [artistDetailTab, setArtistDetailTab] = useState<"songs" | "albums">("songs");
  const [trackInfoId, setTrackInfoId] = useState<string | null>(null);
  const [locatedTrackId, setLocatedTrackId] = useState<string | null>(null);
  const [lastQueueInsertIndex, setLastQueueInsertIndex] = useState(0);
  const [playMode, setPlayMode] = useState<PlayMode>("sequential");
  const [playQueueIds, setPlayQueueIds] = useState<string[]>(DEMO_TRACKS.map((track) => track.id));
  const [queueOpen, setQueueOpen] = useState(false);
  const [draggedQueueIndex, setDraggedQueueIndex] = useState<number | null>(null);
  const [queueDropIndex, setQueueDropIndex] = useState<number | null>(null);
  const [volumePanelOpen, setVolumePanelOpen] = useState(false);
  const [speedPanelOpen, setSpeedPanelOpen] = useState(false);
  const [lyricsOpen, setLyricsOpen] = useState(false);
  const [lyricsHudVisible, setLyricsHudVisible] = useState(true);
  const [lyricUserScrolling, setLyricUserScrolling] = useState(false);
  const [lyricAutoScrolling, setLyricAutoScrolling] = useState(false);
  const [lyricsMode, setLyricsMode] = useState<LyricMode>("lyrics");
  const [translationEnabled, setTranslationEnabled] = useState(true);
  const [translationPreference, setTranslationPreference] = useState(true);
  const [lyricAutoScale, setLyricAutoScale] = useState(true);
  const [lyricFontSize, setLyricFontSize] = useState(60);
  const [lyricTranslationFontSize, setLyricTranslationFontSize] = useState(36);
  const [lyricFontWeight, setLyricFontWeight] = useState(700);
  const [lyricPosition, setLyricPosition] = useState<LyricPosition>("left");
  const [lyricLeftOffset, setLyricLeftOffset] = useState(0);
  const [lyricScrollPosition, setLyricScrollPosition] = useState(24);
  const [lyricTimeOffset, setLyricTimeOffset] = useState(0);
  const [lyricAutoBlur, setLyricAutoBlur] = useState(true);
  const [lyricFadeEffect, setLyricFadeEffect] = useState(true);
  const [lyricDistantView, setLyricDistantView] = useState(true);
  const [lyricWordAnimation, setLyricWordAnimation] = useState<LyricWordAnimation>("auto");
  const translationPreferenceRef = useRef(true);
  const [desktopLyricOpen, setDesktopLyricOpen] = useState(false);
  const [desktopLyricLocked, setDesktopLyricLocked] = useState(false);
  const [desktopLyricDoubleLine, setDesktopLyricDoubleLine] = useState(true);
  const [desktopLyricShowTranslation, setDesktopLyricShowTranslation] = useState(true);
  const [desktopLyricWordByWord, setDesktopLyricWordByWord] = useState<LyricWordAnimation>("auto");
  const [desktopLyricSwitchAnimation, setDesktopLyricSwitchAnimation] = useState(true);
  const [desktopLyricFontSize, setDesktopLyricFontSize] = useState(30);
  const [desktopLyricSecondLineSize, setDesktopLyricSecondLineSize] = useState(24);
  const [desktopLyricFontWeight, setDesktopLyricFontWeight] = useState(700);
  const [desktopLyricPlayedColor, setDesktopLyricPlayedColor] = useState("#00B7C3");
  const [desktopLyricPendingColor, setDesktopLyricPendingColor] = useState("#cccccc");
  const [desktopLyricStrokeColor, setDesktopLyricStrokeColor] = useState("rgba(0,0,0,0.69)");
  const [lyricSourceMenuOpen, setLyricSourceMenuOpen] = useState(false);
  const [lyricsSettingsOpen, setLyricsSettingsOpen] = useState(false);
  const [lyricsCopyOpen, setLyricsCopyOpen] = useState(false);
  const [lyricsOffsetOpen, setLyricsOffsetOpen] = useState(false);
  const [copyTranslation, setCopyTranslation] = useState(true);
  const [copyRomaji, setCopyRomaji] = useState(true);
  const [copyBlankLines, setCopyBlankLines] = useState(true);
  const [copySongTitle, setCopySongTitle] = useState(true);
  const [copyArtist, setCopyArtist] = useState(true);
  const [selectedCopyLyricIndexes, setSelectedCopyLyricIndexes] = useState<number[]>([]);
  const [warnOnMetaMissing, setWarnOnMetaMissing] = useState(true);
  const [unreadableTrackIds, setUnreadableTrackIds] = useState<string[]>([]);
  const [missingPromptTrackId, setMissingPromptTrackId] = useState("");
  const [libraryDragActive, setLibraryDragActive] = useState(false);
  const [libraryRefreshing, setLibraryRefreshing] = useState(false);
  const [settingsTab, setSettingsTab] = useState<"personal" | "lyrics" | "about">("personal");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isWindowMaximized, setIsWindowMaximized] = useState(false);
  const [lastVolumeBeforeMute, setLastVolumeBeforeMute] = useState(0.85);
  const [accentColor, setAccentColor] = useState("#008B8B");
  const [accentMode, setAccentMode] = useState<AccentMode>("manual");
  const [coverAccentColor, setCoverAccentColor] = useState("");
  const [resolvedCurrentCover, setResolvedCurrentCover] = useState("");
  const [coverAspectRatios, setCoverAspectRatios] = useState<Record<string, number>>({});
  const [viewportSize, setViewportSize] = useState(() => ({
    width: typeof window === "undefined" ? 1280 : window.innerWidth,
    height: typeof window === "undefined" ? 720 : window.innerHeight
  }));
  const [trackAlphaBubble, setTrackAlphaBubble] = useState({ visible: false, letter: "#", x: 0, y: 0 });
  const [trackAlphaPickerOpen, setTrackAlphaPickerOpen] = useState(false);
  const [mainScrollbar, setMainScrollbar] = useState({ visible: false, top: 0, right: 0, height: 0, thumbTop: 0, thumbHeight: 28 });
  const [customScrollbarDragging, setCustomScrollbarDragging] = useState(false);

  const folderInputAttrs: Record<string, string> = { webkitdirectory: "", directory: "" };

  const currentTrack = useMemo(() => tracks.find((track) => track.id === currentTrackId) || null, [tracks, currentTrackId]);
  const unreadableTracks = useMemo(
    () => unreadableTrackIds
      .map((id) => tracks.find((track) => track.id === id))
      .filter((track): track is Track => Boolean(track)),
    [tracks, unreadableTrackIds]
  );
  const missingPromptTrack = useMemo(
    () => tracks.find((track) => track.id === missingPromptTrackId) || null,
    [tracks, missingPromptTrackId]
  );
  const isMuted = volume <= 0.001;
  const queueTracks = useMemo(
    () => playQueueIds
      .map((id) => tracks.find((track) => track.id === id))
      .filter((track): track is Track => Boolean(track)),
    [playQueueIds, tracks]
  );
  const currentQueueIndex = useMemo(
    () => queueTracks.findIndex((track) => track.id === currentTrackId),
    [queueTracks, currentTrackId]
  );
  const persistableTracks = (items: Track[]) => items
    .filter((track) => track.localPath || track.audioUrl.startsWith("file://"))
    .map((track) => ({
      ...track,
      audioUrl: track.localPath ? toFileUrl(track.localPath) : track.audioUrl,
      cover: track.localPath && /^(data|blob):/.test(track.cover)
        ? makeCover(["#24459e", "#4b63cc"], "Local")
        : track.cover
    }));

  const restoreState = (state: PersistedAppState | null) => {
    if (!state) return;
    const restoredTracks = (state.tracks || []).map((track) => ({
      ...track,
      folder: track.localPath ? getFolderPathFromTrackPath(track.filePath, track.localPath) : normalizeFolderPath(track.folder || "Imported"),
      audioUrl: track.localPath ? toFileUrl(track.localPath) : track.audioUrl
    }));
    setTracks(restoredTracks);
    setPlaylists((state.playlists || [])
      .filter((playlist) => !(playlist.id === "pl-1" && playlist.name === "收藏" && playlist.trackIds.length === 0))
      .map((playlist) => ({
        ...playlist,
        trackIds: playlist.trackIds.filter((id) => restoredTracks.some((track) => track.id === id))
      })));
    setCurrentTrackId(restoredTracks.some((track) => track.id === state.currentTrackId) ? state.currentTrackId || "" : restoredTracks[0]?.id || "");
    setPlayQueueIds((state.playQueueIds || []).filter((id) => restoredTracks.some((track) => track.id === id)));
    if (state.theme) setTheme(state.theme);
    if (typeof state.volume === "number") setVolume(state.volume);
    if (typeof state.playbackRate === "number") setPlaybackRate(Math.max(0.1, Math.min(3, state.playbackRate)));
    if (state.playMode) setPlayMode(state.playMode);
    if (state.sortKey) setSortKey(state.sortKey);
    if (state.sortDirection) setSortDirection(state.sortDirection);
    if (state.accentColor) setAccentColor(normalizeAccentColor(state.accentColor));
    if (state.accentMode) setAccentMode(state.accentMode);
    if (state.lyricsMode) setLyricsMode(state.lyricsMode);
    if (typeof state.translationPreference === "boolean") {
      translationPreferenceRef.current = state.translationPreference;
      setTranslationPreference(state.translationPreference);
      setTranslationEnabled(state.translationPreference);
    } else if (typeof state.translationEnabled === "boolean") {
      translationPreferenceRef.current = state.translationEnabled;
      setTranslationPreference(state.translationEnabled);
      setTranslationEnabled(state.translationEnabled);
    }
    if (typeof state.lyricAutoScale === "boolean") setLyricAutoScale(state.lyricAutoScale);
    if (typeof state.lyricFontSize === "number") setLyricFontSize(state.lyricFontSize);
    if (typeof state.lyricTranslationFontSize === "number") setLyricTranslationFontSize(state.lyricTranslationFontSize);
    if (typeof state.lyricFontWeight === "number") setLyricFontWeight(state.lyricFontWeight);
    if (state.lyricPosition) setLyricPosition(state.lyricPosition);
    if (typeof state.lyricLeftOffset === "number") setLyricLeftOffset(state.lyricLeftOffset);
    if (typeof state.lyricScrollPosition === "number") setLyricScrollPosition(state.lyricScrollPosition);
    if (typeof state.lyricAutoBlur === "boolean") setLyricAutoBlur(state.lyricAutoBlur);
    if (typeof state.lyricFadeEffect === "boolean") setLyricFadeEffect(state.lyricFadeEffect);
    if (typeof state.lyricDistantView === "boolean") setLyricDistantView(state.lyricDistantView);
    if (state.lyricWordAnimation) setLyricWordAnimation(state.lyricWordAnimation);
    if (typeof state.desktopLyricOpen === "boolean") setDesktopLyricOpen(state.desktopLyricOpen);
    if (typeof state.desktopLyricLocked === "boolean") setDesktopLyricLocked(state.desktopLyricLocked);
    if (typeof state.desktopLyricDoubleLine === "boolean") setDesktopLyricDoubleLine(state.desktopLyricDoubleLine);
    if (typeof state.desktopLyricShowTranslation === "boolean") setDesktopLyricShowTranslation(state.desktopLyricShowTranslation);
    if (state.desktopLyricWordByWord === "auto" || state.desktopLyricWordByWord === "off") {
      setDesktopLyricWordByWord(state.desktopLyricWordByWord);
    } else if (typeof state.desktopLyricWordByWord === "boolean") {
      setDesktopLyricWordByWord(state.desktopLyricWordByWord ? "auto" : "off");
    }
    if (typeof state.desktopLyricSwitchAnimation === "boolean") setDesktopLyricSwitchAnimation(state.desktopLyricSwitchAnimation);
    if (typeof state.desktopLyricFontSize === "number") setDesktopLyricFontSize(state.desktopLyricFontSize === 40 ? 30 : state.desktopLyricFontSize);
    if (typeof state.desktopLyricSecondLineSize === "number") {
      setDesktopLyricSecondLineSize(state.desktopLyricSecondLineSize === 32 ? 24 : state.desktopLyricSecondLineSize);
    } else if (typeof state.desktopLyricSecondLineScale === "number") {
      const migratedSize = state.desktopLyricSecondLineScale > 45
        ? Math.round(30 * state.desktopLyricSecondLineScale / 100)
        : state.desktopLyricSecondLineScale;
      setDesktopLyricSecondLineSize(Math.max(12, Math.min(64, migratedSize)));
    }
    if (typeof state.desktopLyricFontWeight === "number") setDesktopLyricFontWeight(state.desktopLyricFontWeight === 900 ? 700 : state.desktopLyricFontWeight);
    if (state.desktopLyricPlayedColor) setDesktopLyricPlayedColor(state.desktopLyricPlayedColor);
    if (state.desktopLyricPendingColor) setDesktopLyricPendingColor(state.desktopLyricPendingColor);
    if (state.desktopLyricStrokeColor) setDesktopLyricStrokeColor(state.desktopLyricStrokeColor);
    if (state.selectedPlaylistId) setSelectedPlaylistId(state.selectedPlaylistId);
    if (typeof state.warnOnMetaMissing === "boolean") setWarnOnMetaMissing(state.warnOnMetaMissing);
    if (Array.isArray(state.unreadableTrackIds)) {
      const validIds = new Set(restoredTracks.map((track) => track.id));
      setUnreadableTrackIds(state.unreadableTrackIds.filter((id) => validIds.has(id)));
    }
  };

  useEffect(() => {
    const host = window as HostWindow;
    if (!host.electronAPI?.library?.loadState) {
      restoringRef.current = false;
      return;
    }
    host.electronAPI.library.loadState()
      .then((state) => restoreState(state))
      .catch(() => undefined)
      .finally(() => {
        restoringRef.current = false;
      });
  }, []);

  useEffect(() => {
    const host = window as HostWindow;
    if (restoringRef.current || !host.electronAPI?.library?.saveState) return;
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      const storedTracks = persistableTracks(tracks);
      const validIds = new Set(storedTracks.map((track) => track.id));
      void host.electronAPI?.library?.saveState?.({
        version: 1,
        tracks: storedTracks,
        playlists: playlists.map((playlist) => ({ ...playlist, trackIds: playlist.trackIds.filter((id) => validIds.has(id)) })),
        currentTrackId: validIds.has(currentTrackId) ? currentTrackId : storedTracks[0]?.id || "",
        playQueueIds: playQueueIds.filter((id) => validIds.has(id)),
        theme,
        volume,
        playbackRate,
        playMode,
        sortKey,
        sortDirection,
        accentColor,
        accentMode,
        lyricsMode,
        translationEnabled: translationPreference,
        translationPreference,
        lyricAutoScale,
        lyricFontSize,
        lyricTranslationFontSize,
        lyricFontWeight,
        lyricPosition,
        lyricLeftOffset,
        lyricScrollPosition,
        lyricAutoBlur,
        lyricFadeEffect,
        lyricDistantView,
        lyricWordAnimation,
        desktopLyricOpen,
        desktopLyricLocked,
        desktopLyricDoubleLine,
        desktopLyricShowTranslation,
        desktopLyricWordByWord,
        desktopLyricSwitchAnimation,
        desktopLyricFontSize,
        desktopLyricSecondLineSize,
        desktopLyricFontWeight,
        desktopLyricPlayedColor,
        desktopLyricPendingColor,
        desktopLyricStrokeColor,
        selectedPlaylistId,
        warnOnMetaMissing,
        unreadableTrackIds: unreadableTrackIds.filter((id) => validIds.has(id))
      });
    }, 1200);
    return () => {
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    };
  }, [tracks, playlists, currentTrackId, playQueueIds, theme, volume, playbackRate, playMode, sortKey, sortDirection, accentColor, accentMode, lyricsMode, translationEnabled, translationPreference, lyricAutoScale, lyricFontSize, lyricTranslationFontSize, lyricFontWeight, lyricPosition, lyricLeftOffset, lyricScrollPosition, lyricAutoBlur, lyricFadeEffect, lyricDistantView, lyricWordAnimation, desktopLyricOpen, desktopLyricLocked, desktopLyricDoubleLine, desktopLyricShowTranslation, desktopLyricWordByWord, desktopLyricSwitchAnimation, desktopLyricFontSize, desktopLyricSecondLineSize, desktopLyricFontWeight, desktopLyricPlayedColor, desktopLyricPendingColor, desktopLyricStrokeColor, selectedPlaylistId, warnOnMetaMissing, unreadableTrackIds]);

  useEffect(() => {
    const player = audioRef.current;
    if (!player) return;
    if (!currentTrack) {
      player.removeAttribute("src");
      player.load();
      setCurrentTime(0);
      return;
    }
    if (player.src !== currentTrack.audioUrl) {
      player.src = currentTrack.audioUrl;
      player.load();
      setCurrentTime(0);
    }
  }, [currentTrack?.id, currentTrack?.audioUrl]);

  useEffect(() => {
    if (!tracks.length) {
      setIsPlaying(false);
      setCurrentTrackId("");
      return;
    }
    if (currentTrackId && !tracks.some((track) => track.id === currentTrackId)) {
      setCurrentTrackId(tracks[0].id);
    }
  }, [tracks, currentTrackId]);

  useEffect(() => {
    const player = audioRef.current;
    if (!player) return;
    player.volume = volume;
    if (volume > 0.001) setLastVolumeBeforeMute(volume);
  }, [volume]);

  useEffect(() => {
    const player = audioRef.current;
    if (!player) return;
    player.playbackRate = playbackRate;
  }, [playbackRate, currentTrack?.id]);

  useEffect(() => {
    const player = audioRef.current;
    if (!player) return;
    if (isPlaying) {
      player.play().catch(() => setIsPlaying(false));
    } else {
      player.pause();
    }
  }, [isPlaying]);

  useEffect(() => {
    const player = audioRef.current;
    if (!player) return;
    const ensurePlayAfterLoad = () => {
      if (currentTrack) {
        setUnreadableTrackIds((prev) => prev.filter((id) => id !== currentTrack.id));
      }
      if (!isPlaying) return;
      player.play().catch(() => setIsPlaying(false));
    };
    player.addEventListener("canplay", ensurePlayAfterLoad);
    return () => player.removeEventListener("canplay", ensurePlayAfterLoad);
  }, [isPlaying, currentTrackId, currentTrack?.id]);

  useEffect(() => {
    const player = audioRef.current;
    if (!player) return;
    const handleAudioError = () => {
      if (!currentTrack) return;
      setIsPlaying(false);
      setUnreadableTrackIds((prev) => (prev.includes(currentTrack.id) ? prev : [...prev, currentTrack.id]));
      if (warnOnMetaMissing) setMissingPromptTrackId(currentTrack.id);
    };
    player.addEventListener("error", handleAudioError);
    return () => player.removeEventListener("error", handleAudioError);
  }, [currentTrack?.id, warnOnMetaMissing]);

  useEffect(() => {
    const player = audioRef.current;
    if (!player) return;
    const onEnded = () => {
      if (!queueTracks.length) return;
      if (playMode === "single-loop") {
        player.currentTime = 0;
        setCurrentTime(0);
        player.play().catch(() => setIsPlaying(false));
        return;
      }
      const safeIndex = currentQueueIndex < 0 ? 0 : currentQueueIndex;
      if (playMode === "sequential" && safeIndex >= queueTracks.length - 1) {
        setIsPlaying(false);
        return;
      }
      const next = queueTracks[(safeIndex + 1) % queueTracks.length];
      if (!next) return;
      setCurrentTrackId(next.id);
      setIsPlaying(true);
    };
    player.addEventListener("ended", onEnded);
    return () => {
      player.removeEventListener("ended", onEnded);
    };
  }, [queueTracks, currentQueueIndex, playMode]);

  useEffect(() => {
    const player = audioRef.current;
    if (!player) return;
    if (playbackFrameRef.current) {
      window.cancelAnimationFrame(playbackFrameRef.current);
      playbackFrameRef.current = null;
    }
    if (!isPlaying) {
      setCurrentTime(player.currentTime || 0);
      return;
    }

    let lastReported = -1;
    const tick = () => {
      const next = player.currentTime || 0;
      const lyricTime = next + lyricTimeOffset;
      const lines = currentLyricsRef.current;
      const lyricIndex = getActiveLyricIndexAt(lines, lyricTime);
      const activeRow = lyricRowRefs.current[lyricIndex];
      const activeWord = activeRow?.querySelector<HTMLElement>(".lyric-word-sweep");
      if (activeWord) {
        const progress = getLyricWordProgressAt(lines, lyricIndex, lyricTime, currentTrackDurationRef.current) * 100;
        activeWord.style.setProperty("--lyric-word-progress", `${progress}%`);
      }
      const reportInterval = desktopLyricOpen && desktopLyricWordByWord === "auto" ? 0.033 : 0.1;
      if (lyricIndex !== activeLyricIndexRef.current || Math.abs(next - lastReported) >= reportInterval) {
        lastReported = next;
        setCurrentTime(next);
      }
      playbackFrameRef.current = window.requestAnimationFrame(tick);
    };

    playbackFrameRef.current = window.requestAnimationFrame(tick);
    return () => {
      if (playbackFrameRef.current) {
        window.cancelAnimationFrame(playbackFrameRef.current);
        playbackFrameRef.current = null;
      }
    };
  }, [isPlaying, currentTrackId, desktopLyricOpen, desktopLyricWordByWord, lyricTimeOffset]);

  useEffect(() => {
    setPlayQueueIds((prev) => {
      const valid = prev.filter((id) => tracks.some((track) => track.id === id));
      if (valid.length) return valid;
      return tracks.map((track) => track.id);
    });
  }, [tracks]);

  useEffect(() => {
    let active = true;
    const cover = currentTrack?.cover || "";
    const audioPath = currentTrack?.localPath || "";
    if (!cover && !audioPath) {
      setResolvedCurrentCover("");
      return;
    }
    if (!audioPath && !cover.startsWith("file://")) {
      setResolvedCurrentCover(cover);
      return;
    }
    const host = window as HostWindow;
    const resolveCover = host.electronAPI?.library?.resolveCover;
    if (!resolveCover) {
      setResolvedCurrentCover(cover);
      return;
    }
    resolveCover(cover, audioPath)
      .then((resolved) => {
        if (active) setResolvedCurrentCover(resolved || cover || "");
      })
      .catch(() => {
        if (active) setResolvedCurrentCover(cover || "");
      });
    return () => {
      active = false;
    };
  }, [currentTrack?.cover, currentTrack?.localPath]);

  useEffect(() => {
    if (!("mediaSession" in navigator) || typeof MediaMetadata === "undefined" || !currentTrack) return;
    try {
      const artwork = resolvedCurrentCover
        ? [
            { src: resolvedCurrentCover, sizes: "1024x1024", type: resolvedCurrentCover.startsWith("data:image/jpeg") ? "image/jpeg" : "image/png" },
            { src: resolvedCurrentCover, sizes: "512x512", type: resolvedCurrentCover.startsWith("data:image/jpeg") ? "image/jpeg" : "image/png" },
            { src: resolvedCurrentCover, sizes: "256x256", type: resolvedCurrentCover.startsWith("data:image/jpeg") ? "image/jpeg" : "image/png" },
            { src: resolvedCurrentCover, sizes: "96x96", type: resolvedCurrentCover.startsWith("data:image/jpeg") ? "image/jpeg" : "image/png" }
          ]
        : undefined;
      navigator.mediaSession.metadata = new MediaMetadata({
        title: currentTrack.title,
        artist: currentTrack.artist,
        album: currentTrack.album,
        artwork
      });
    } catch {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: currentTrack.title,
        artist: currentTrack.artist,
        album: currentTrack.album
      });
    }
    navigator.mediaSession.playbackState = isPlaying ? "playing" : "paused";
    navigator.mediaSession.setActionHandler("play", () => setIsPlaying(true));
    navigator.mediaSession.setActionHandler("pause", () => setIsPlaying(false));
    navigator.mediaSession.setActionHandler("previoustrack", previousTrack);
    navigator.mediaSession.setActionHandler("nexttrack", nextTrack);
    navigator.mediaSession.setActionHandler("seekto", (event) => {
      if (!audioRef.current || event.seekTime === undefined) return;
      audioRef.current.currentTime = event.seekTime;
      setCurrentTime(event.seekTime);
    });
  }, [currentTrack?.id, currentTrack?.title, currentTrack?.artist, currentTrack?.album, resolvedCurrentCover, isPlaying, currentQueueIndex, queueTracks]);

  useEffect(() => {
    const host = window as HostWindow;
    void host.electronAPI?.player?.update?.({
      title: currentTrack?.title || "Still",
      artist: currentTrack?.artist || "",
      album: currentTrack?.album || "",
      currentTime,
      duration: currentTrack?.duration || 0,
      isPlaying,
      desktopLyricOpen
    });
  }, [currentTrack?.title, currentTrack?.artist, currentTrack?.album, currentTrack?.duration, currentTime, isPlaying, desktopLyricOpen]);

  useEffect(() => {
    if (!lyricsOpen) {
      setLyricsHudVisible(true);
      if (lyricsHudTimerRef.current) {
        window.clearTimeout(lyricsHudTimerRef.current);
        lyricsHudTimerRef.current = null;
      }
      return;
    }

    const revealHud = () => {
      setLyricsHudVisible(true);
      if (lyricsHudTimerRef.current) window.clearTimeout(lyricsHudTimerRef.current);
      lyricsHudTimerRef.current = window.setTimeout(() => setLyricsHudVisible(false), 1600);
    };

    revealHud();
    window.addEventListener("mousemove", revealHud);

    return () => {
      window.removeEventListener("mousemove", revealHud);
      if (lyricsHudTimerRef.current) {
        window.clearTimeout(lyricsHudTimerRef.current);
        lyricsHudTimerRef.current = null;
      }
    };
  }, [lyricsOpen]);

  const artists = useMemo(() => {
    const map = new Map<string, { name: string; songs: Track[]; albums: string[]; cover: string; latestYear: number }>();
    tracks.forEach((track) => {
      getTrackArtists(track).forEach((artistName) => {
        const item = map.get(artistName) || { name: artistName, songs: [], albums: [], cover: track.cover, latestYear: -Infinity };
        item.songs.push(track);
        if (!item.albums.includes(track.album)) item.albums.push(track.album);
        if ((track.year || 0) >= item.latestYear) {
          item.cover = track.cover;
          item.latestYear = track.year || 0;
        }
        map.set(artistName, item);
      });
    });
    return [...map.values()].sort((a, b) => compareText(a.name, b.name));
  }, [tracks]);

  const albums = useMemo(() => {
    const map = new Map<string, { name: string; year: number; songs: Track[]; artists: string[]; cover: string }>();
    tracks.forEach((track) => {
      const item = map.get(track.album) || { name: track.album, year: track.year, songs: [], artists: [], cover: track.cover };
      item.songs.push(track);
      item.year = Math.min(item.year, track.year);
      getTrackArtists(track).forEach((artistName) => {
        if (!item.artists.includes(artistName)) item.artists.push(artistName);
      });
      map.set(track.album, item);
    });
    return [...map.values()].sort((a, b) => a.year - b.year || compareText(a.name, b.name));
  }, [tracks]);

  const filteredArtists = useMemo(() => {
    if (!artistSearchQuery.trim()) return artists;
    return artists.filter((artist) => matchesPinyinSearch([artist.name], artistSearchQuery));
  }, [artists, artistSearchQuery]);

  const filteredAlbums = useMemo(() => {
    if (!albumSearchQuery.trim()) return albums;
    return albums.filter((album) => matchesPinyinSearch([album.name, album.artists.join(" "), album.year], albumSearchQuery));
  }, [albums, albumSearchQuery]);

  const folders = useMemo(() => {
    const map = new Map<string, number>();
    tracks.forEach((track) => map.set(track.folder, (map.get(track.folder) || 0) + 1));
    return [...map.entries()].map(([name, count]) => ({ name, count }));
  }, [tracks]);
  const folderTree = useMemo(() => {
    const roots: FolderNode[] = [];
    const nodeMap = new Map<string, FolderNode>();
    const ensureNode = (pathValue: string) => {
      const normalized = normalizeFolderPath(pathValue || "Imported");
      const cached = nodeMap.get(normalized);
      if (cached) return cached;
      const parts = normalized.split("/").filter(Boolean);
      const name = parts.at(-1) || normalized || "Imported";
      const node: FolderNode = { name, path: normalized, count: 0, children: [] };
      nodeMap.set(normalized, node);
      const parentPath = parts.length > 1 ? parts.slice(0, -1).join("/") : "";
      if (parentPath) {
        ensureNode(parentPath).children.push(node);
      } else {
        roots.push(node);
      }
      return node;
    };

    tracks.forEach((track) => {
      const normalized = normalizeFolderPath(track.folder || "Imported");
      const parts = normalized.split("/").filter(Boolean);
      for (let index = 0; index < parts.length; index += 1) {
        const node = ensureNode(parts.slice(0, index + 1).join("/"));
        node.count += 1;
      }
    });

    const sortNodes = (nodes: FolderNode[]) => {
      nodes.sort((a, b) => compareText(a.name, b.name));
      nodes.forEach((node) => sortNodes(node.children));
    };
    sortNodes(roots);
    return roots;
  }, [tracks]);

  const sortTrackList = (source: Track[]) => {
    const factor = sortDirection === "asc" ? 1 : -1;
    return [...source].sort((a, b) => {
      if (sortKey === "artist") {
        const primary = compareTrackAlphaText(a, b, "artist");
        if (primary !== 0) return primary * factor;
        const secondary = a.year - b.year;
        if (secondary !== 0) return secondary * factor;
        const tertiary = compareText(a.album, b.album);
        if (tertiary !== 0) return tertiary * factor;
        return (a.trackNo - b.trackNo) * factor;
      }
      if (sortKey === "title") return compareTrackAlphaText(a, b, "title") * factor;
      if (sortKey === "album") return (compareTrackAlphaText(a, b, "album") || a.trackNo - b.trackNo) * factor;
      if (sortKey === "year") return (a.year - b.year || a.trackNo - b.trackNo) * factor;
      if (sortKey === "folder") return compareTrackAlphaText(a, b, "folder") * factor;
      if (sortKey === "filePath") return compareTrackAlphaText(a, b, "filePath") * factor;
      return (a.duration - b.duration) * factor;
    });
  };

  const filterTracks = (source: Track[]) => {
    const sorted = sortTrackList(source);
    if (!searchQuery.trim()) return sorted;
    return sorted.filter((track) => matchesPinyinSearch([track.title, track.artist, track.album, track.folder, track.filePath], searchQuery));
  };

  const visibleTracks = useMemo(() => filterTracks(tracks), [tracks, searchQuery, sortDirection, sortKey]);

  const currentLyricSource = useMemo(() => {
    if (!currentTrack?.lyricSources?.length) return null;
    return currentTrack.lyricSources.find((source) => source.id === currentTrack.selectedLyricSourceId) || currentTrack.lyricSources[0];
  }, [currentTrack]);
  const currentLyrics = useMemo(
    () => normalizeLyricLines(currentLyricSource?.lines || []),
    [currentLyricSource]
  );
  const lyricTrackKey = `${currentTrack?.id || "idle"}:${currentLyricSource?.id || "none"}:${currentLyrics.length}`;
  useEffect(() => {
    currentLyricsRef.current = currentLyrics;
  }, [currentLyrics]);
  useEffect(() => {
    currentTrackDurationRef.current = currentTrack?.duration || 0;
  }, [currentTrack?.duration]);
  const hasLyricSources = Boolean(currentTrack?.lyricSources?.length);
  const hasTranslation = currentLyrics.some((line) => line.translation);
  const footerInfoShouldFillCoverSlot = lyricsOpen && (lyricsMode === "cover" || lyricsMode.startsWith("mix"));
  const fullscreenTrackInfo = useMemo(() => currentTrack
    ? {
        title: currentTrack.title,
        artist: currentTrack.artist,
        album: currentTrack.album,
        cover: resolvedCurrentCover || currentTrack.cover,
        hasTrack: true
      }
    : {
        title: IDLE_TRACK_INFO.title,
        artist: IDLE_TRACK_INFO.artist,
        album: IDLE_TRACK_INFO.album,
        cover: "",
        hasTrack: false
      },
    [currentTrack, resolvedCurrentCover]
  );
  useEffect(() => {
    translationPreferenceRef.current = translationPreference;
    setTranslationEnabled(hasTranslation ? translationPreference : false);
  }, [hasTranslation, translationPreference]);

  const activeLyricIndex = useMemo(() => {
    return getActiveLyricIndexAt(currentLyrics, currentTime + lyricTimeOffset);
  }, [currentLyrics, currentTime, lyricTimeOffset]);

  useLayoutEffect(() => {
    activeLyricIndexRef.current = activeLyricIndex;
  }, [activeLyricIndex]);

  useEffect(() => {
    lyricScrollPositionRef.current = lyricScrollPosition;
  }, [lyricScrollPosition]);

  const alignLyricRow = useCallback((lyricIndex: number, behavior: ScrollBehavior = "smooth", force = false) => {
    if (!lyricsOpen || lyricIndex < 0) return;
    if (!force && Date.now() < lyricManualScrollUntilRef.current) return;
    const row = lyricRowRefs.current[lyricIndex];
    const scroller = row?.closest("[data-lyric-scroll]") as HTMLElement | null;
    if (!row) return;
    if (!scroller) {
      lyricProgrammaticScrollRef.current = true;
      setLyricAutoScrolling(true);
      if (lyricProgrammaticScrollTimerRef.current) window.clearTimeout(lyricProgrammaticScrollTimerRef.current);
      lyricProgrammaticScrollTimerRef.current = window.setTimeout(() => {
        lyricProgrammaticScrollRef.current = false;
        setLyricAutoScrolling(false);
      }, behavior === "smooth" ? 450 : 80);
      row?.scrollIntoView({ behavior, block: "center" });
      return;
    }
    const rowRect = row.getBoundingClientRect();
    const scrollerRect = scroller.getBoundingClientRect();
    const rowTop = rowRect.top - scrollerRect.top + scroller.scrollTop;
    const target = rowTop - scroller.clientHeight * (lyricScrollPositionRef.current / 100);
    lyricProgrammaticScrollRef.current = true;
    setLyricAutoScrolling(true);
    if (lyricProgrammaticScrollTimerRef.current) window.clearTimeout(lyricProgrammaticScrollTimerRef.current);
    lyricProgrammaticScrollTimerRef.current = window.setTimeout(() => {
      lyricProgrammaticScrollRef.current = false;
      setLyricAutoScrolling(false);
    }, behavior === "smooth" ? 450 : 80);
    scroller.scrollTo({ top: Math.max(0, target), behavior });
  }, [lyricsOpen]);

  const alignActiveLyric = useCallback((behavior: ScrollBehavior = "smooth", force = false) => {
    alignLyricRow(activeLyricIndexRef.current, behavior, force);
  }, [alignLyricRow]);

  const stopLyricTranslationAnchor = useCallback(() => {
    const anchor = lyricTranslationAnchorRef.current;
    if (anchor?.frameId) window.cancelAnimationFrame(anchor.frameId);
    lyricTranslationAnchorRef.current = null;
  }, []);

  const captureActiveLyricAnchor = useCallback(() => {
    stopLyricTranslationAnchor();
    const row = lyricRowRefs.current[activeLyricIndexRef.current];
    const scroller = row?.closest("[data-lyric-scroll]") as HTMLElement | null;
    if (!row || !scroller) return;
    const rowRect = row.getBoundingClientRect();
    const scrollerRect = scroller.getBoundingClientRect();
    lyricTranslationAnchorRef.current = {
      row,
      scroller,
      offsetTop: rowRect.top - scrollerRect.top,
      frameId: null
    };
  }, [stopLyricTranslationAnchor]);

  const stabilizeActiveLyricAnchor = useCallback((duration = 320) => {
    const anchor = lyricTranslationAnchorRef.current;
    if (!anchor) return false;
    lyricProgrammaticScrollRef.current = true;
    setLyricUserScrolling(false);

    const finish = () => {
      if (lyricTranslationAnchorRef.current === anchor) {
        lyricTranslationAnchorRef.current = null;
      }
      lyricProgrammaticScrollRef.current = false;
    };

    anchor.frameId = window.requestAnimationFrame(() => {
      anchor.frameId = null;
      if (lyricTranslationAnchorRef.current !== anchor || !anchor.row.isConnected || !anchor.scroller.isConnected) {
        finish();
        return;
      }
      const rowRect = anchor.row.getBoundingClientRect();
      const scrollerRect = anchor.scroller.getBoundingClientRect();
      const delta = rowRect.top - scrollerRect.top - anchor.offsetTop;
      if (Math.abs(delta) > 0.1) {
        anchor.scroller.scrollTop += delta;
      }
      window.setTimeout(finish, duration);
    });
    return true;
  }, []);

  const toggleTranslationEnabled = useCallback(() => {
    if (hasTranslation && lyricsOpen) captureActiveLyricAnchor();
    setTranslationPreference((prev) => {
      const next = !prev;
      translationPreferenceRef.current = next;
      setTranslationEnabled(hasTranslation ? next : false);
      return next;
    });
  }, [captureActiveLyricAnchor, hasTranslation, lyricsOpen]);

  const handleLyricUserScroll = useCallback(() => {
    if (lyricProgrammaticScrollRef.current) return;
    lyricManualScrollUntilRef.current = Date.now() + 2600;
    setLyricUserScrolling(true);
    if (lyricUserScrollTimerRef.current) window.clearTimeout(lyricUserScrollTimerRef.current);
    lyricUserScrollTimerRef.current = window.setTimeout(() => {
      setLyricUserScrolling(false);
    }, 2600);
  }, []);

  const seekToLyricLine = useCallback((line: LyricLine, index: number) => {
    if (!audioRef.current || !currentTrack) return;
    lyricManualScrollUntilRef.current = 0;
    setLyricUserScrolling(false);
    const targetTime = Math.max(0, Math.min(currentTrack.duration || Number.POSITIVE_INFINITY, line.time - lyricTimeOffset));
    audioRef.current.currentTime = targetTime;
    setCurrentTime(targetTime);
    alignLyricRow(index, "smooth", true);
    window.requestAnimationFrame(() => alignLyricRow(index, "smooth", true));
  }, [alignLyricRow, currentTrack, lyricTimeOffset]);

  useEffect(() => () => {
    stopLyricTranslationAnchor();
    if (lyricProgrammaticScrollTimerRef.current) {
      window.clearTimeout(lyricProgrammaticScrollTimerRef.current);
      lyricProgrammaticScrollTimerRef.current = null;
    }
    setLyricAutoScrolling(false);
    if (lyricUserScrollTimerRef.current) {
      window.clearTimeout(lyricUserScrollTimerRef.current);
      lyricUserScrollTimerRef.current = null;
    }
  }, [stopLyricTranslationAnchor]);

  useEffect(() => {
    if (!lyricsOpen) {
      lastLyricTrackKeyRef.current = lyricTrackKey;
    }
  }, [lyricsOpen, lyricTrackKey]);

  useLayoutEffect(() => {
    if (!lyricsOpen) return;
    const lyricIndex = currentTrack ? activeLyricIndexRef.current : 0;
    lyricManualScrollUntilRef.current = 0;
    setLyricUserScrolling(false);
    alignLyricRow(lyricIndex, "auto", true);
    const frameId = window.requestAnimationFrame(() => alignLyricRow(lyricIndex, "auto", true));
    return () => window.cancelAnimationFrame(frameId);
  }, [lyricsOpen, lyricsMode, currentTrack?.id, alignLyricRow]);

  useLayoutEffect(() => {
    if (!lyricsOpen) return;
    setLyricUserScrolling(false);
    if (stabilizeActiveLyricAnchor()) return;
    const lyricIndex = currentTrack ? activeLyricIndexRef.current : 0;
    lyricManualScrollUntilRef.current = 0;
    const frameId = window.requestAnimationFrame(() => alignLyricRow(lyricIndex, "auto", true));
    return () => window.cancelAnimationFrame(frameId);
  }, [translationEnabled, lyricsOpen, currentTrack?.id, alignLyricRow, stabilizeActiveLyricAnchor]);

  useEffect(() => {
    if (!lyricsOpen) return;
    if (lastLyricTrackKeyRef.current === lyricTrackKey) return;
    lastLyricTrackKeyRef.current = lyricTrackKey;
    let frameId = 0;
    let timerId = 0;
    lyricManualScrollUntilRef.current = 0;
    setLyricUserScrolling(false);
    const alignFirstLyric = () => alignLyricRow(0, "auto", true);
    frameId = window.requestAnimationFrame(() => {
      alignFirstLyric();
      timerId = window.setTimeout(alignFirstLyric, 80);
    });
    return () => {
      window.cancelAnimationFrame(frameId);
      if (timerId) window.clearTimeout(timerId);
    };
  }, [lyricTrackKey, lyricsOpen, alignLyricRow]);

  useLayoutEffect(() => {
    alignActiveLyric("smooth");
  }, [activeLyricIndex, alignActiveLyric]);

  useEffect(() => {
    if (!lyricsOpen || activeLyricIndexRef.current < 0) return;
    if (lyricResizeTimerRef.current) window.clearTimeout(lyricResizeTimerRef.current);
    alignActiveLyric("auto", true);
    lyricResizeTimerRef.current = window.setTimeout(() => alignActiveLyric("auto", true), 80);
    return () => {
      if (lyricResizeTimerRef.current) {
        window.clearTimeout(lyricResizeTimerRef.current);
        lyricResizeTimerRef.current = null;
      }
    };
  }, [viewportSize.width, viewportSize.height, lyricsOpen, lyricsMode, alignActiveLyric]);

  useEffect(() => {
    if (!lyricsOpen || activeLyricIndexRef.current < 0 || typeof ResizeObserver === "undefined") return;
    const row = lyricRowRefs.current[activeLyricIndexRef.current];
    const scroller = row?.closest("[data-lyric-scroll]") as HTMLElement | null;
    if (!scroller) return;
    const observer = new ResizeObserver(() => {
      if (lyricResizeTimerRef.current) window.clearTimeout(lyricResizeTimerRef.current);
      lyricResizeTimerRef.current = window.setTimeout(() => alignActiveLyric("auto", true), 40);
    });
    observer.observe(scroller);
    return () => observer.disconnect();
  }, [lyricsOpen, lyricsMode, alignActiveLyric]);

  const selectedArtistEntity = artists.find((artist) => artist.name === selectedArtist);
  const selectedAlbumEntity = albums.find((album) => album.name === selectedAlbum);
  const selectedArtistSongs = useMemo(
    () => selectedArtistEntity
      ? [...selectedArtistEntity.songs].sort((a, b) => a.year - b.year || compareText(a.album, b.album) || a.trackNo - b.trackNo)
      : [],
    [selectedArtistEntity]
  );
  const selectedArtistLatestSong = useMemo(
    () => selectedArtistSongs[selectedArtistSongs.length - 1],
    [selectedArtistSongs]
  );
  const selectedArtistAlbums = useMemo(
    () => selectedArtistEntity
      ? selectedArtistEntity.albums
        .map((albumName) => albums.find((item) => item.name === albumName))
        .filter((album): album is { name: string; year: number; songs: Track[]; artists: string[]; cover: string } => Boolean(album))
        .sort((a, b) => a.year - b.year || compareText(a.name, b.name))
      : [],
    [albums, selectedArtistEntity]
  );
  const selectedAlbumSongs = useMemo(
    () => selectedAlbumEntity
      ? [...selectedAlbumEntity.songs].sort((a, b) => a.trackNo - b.trackNo)
      : [],
    [selectedAlbumEntity]
  );
  const selectedPlaylist = useMemo(
    () => playlists.find((playlist) => playlist.id === selectedPlaylistId) || null,
    [playlists, selectedPlaylistId]
  );
  const selectedPlaylistTracks = useMemo(
    () => (selectedPlaylist?.trackIds || [])
      .map((id) => tracks.find((track) => track.id === id))
      .filter((track): track is Track => Boolean(track)),
    [selectedPlaylist, tracks]
  );
  const selectedFolderTracks = useMemo(
    () => tracks.filter((track) => {
      const folder = normalizeFolderPath(track.folder || "Imported");
      const selected = normalizeFolderPath(selectedFolder || "");
      return selected ? folder === selected || folder.startsWith(`${selected}/`) : false;
    }),
    [tracks, selectedFolder]
  );
  const visiblePlaylistTracks = useMemo(
    () => filterTracks(selectedPlaylistTracks),
    [selectedPlaylistTracks, searchQuery, sortDirection, sortKey]
  );
  const visibleFolderTracks = useMemo(
    () => filterTracks(selectedFolderTracks),
    [selectedFolderTracks, searchQuery, sortDirection, sortKey]
  );
  const currentAlphaTracks = useMemo(() => {
    if (view === "playlist-detail") return visiblePlaylistTracks;
    if (view === "folder-detail") return visibleFolderTracks;
    if (view === "songs") return visibleTracks;
    return [];
  }, [view, visibleTracks, visiblePlaylistTracks, visibleFolderTracks]);
  const currentTrackInCurrentPageIndex = useMemo(
    () => currentTrack ? currentAlphaTracks.findIndex((track) => track.id === currentTrack.id) : -1,
    [currentTrack, currentAlphaTracks]
  );
  const availableAlphaLetters = useMemo(() => {
    const letters = new Set(currentAlphaTracks.map((track) => getTrackAlphaLetter(track, sortKey)));
    return TRACK_ALPHA_LETTERS.filter((letter) => letters.has(letter));
  }, [currentAlphaTracks, sortKey]);
  const trackInfo = useMemo(() => tracks.find((track) => track.id === trackInfoId) || null, [trackInfoId, tracks]);
  const trackInfoLyricSource = useMemo(
    () => trackInfo?.lyricSources.find((source) => source.id === trackInfo.selectedLyricSourceId) || trackInfo?.lyricSources[0],
    [trackInfo]
  );
  const contextTracks = useMemo(
    () => (contextMenu?.trackIds || [])
      .map((id) => tracks.find((track) => track.id === id))
      .filter((track): track is Track => Boolean(track)),
    [tracks, contextMenu]
  );
  const contextTrack = contextTracks[0] || null;
  const contextTrackIds = contextTracks.map((track) => track.id);
  const contextIsBatch = contextTracks.length > 1;
  const contextMenuPosition = contextMenu
    ? {
        left: Math.max(8, Math.min(contextMenu.x, window.innerWidth - 336)),
        top: Math.max(8, Math.min(contextMenu.y, window.innerHeight - 520))
      }
    : { left: 8, top: 8 };
  const playlistContextTarget = useMemo(
    () => playlists.find((playlist) => playlist.id === playlistContextMenu?.playlistId) || null,
    [playlists, playlistContextMenu]
  );
  const libraryStats = useMemo(() => ({
    songs: tracks.length,
    artists: artists.length,
    albums: albums.length,
    folders: folders.length,
    duration: tracks.reduce((sum, track) => sum + track.duration, 0)
  }), [tracks, artists.length, albums.length, folders.length]);

  useEffect(() => {
    if (accentMode !== "cover" || !currentTrack?.cover) {
      setCoverAccentColor("");
      return;
    }
    let active = true;
    void extractAccentFromImage(currentTrack.cover).then((color) => {
      if (active) setCoverAccentColor(color);
    });
    return () => {
      active = false;
    };
  }, [accentMode, currentTrack?.cover]);

  const effectiveAccentColor = accentMode === "cover" && coverAccentColor
    ? coverAccentColor
    : normalizeAccentColor(accentColor);

  const themePalette = buildThemePalette(effectiveAccentColor, theme);
  const themeVars = {
    ["--bg" as string]: themePalette.bg,
    ["--bg-soft" as string]: themePalette.bgSoft,
    ["--surface" as string]: themePalette.surface,
    ["--line" as string]: themePalette.line,
    ["--text" as string]: themePalette.text,
    ["--dim" as string]: themePalette.dim,
    ["--accent" as string]: effectiveAccentColor,
    ["--accent-soft" as string]: themePalette.accentSoft,
    ["--accent-readable" as string]: themePalette.accentReadable,
    ["--accent-strong" as string]: themePalette.accentStrong,
    ["--scrollbar" as string]: themePalette.scrollbar
  };

  const playModes: Array<{ mode: PlayMode; label: string; icon: ReactNode }> = [
    {
      mode: "sequential",
      label: "顺序播放",
      icon: <LineIcon><path d="M4 6h12" /><path d="M4 12h10" /><path d="M4 18h8" /><path d="m18 8 4 4-4 4" /><path d="M14 12h8" /></LineIcon>
    },
    {
      mode: "list-loop",
      label: "列表循环",
      icon: <LineIcon><path d="m17 2 4 4-4 4" /><path d="M3 11V9a3 3 0 0 1 3-3h15" /><path d="m7 22-4-4 4-4" /><path d="M21 13v2a3 3 0 0 1-3 3H3" /></LineIcon>
    },
    {
      mode: "single-loop",
      label: "单曲循环",
      icon: <LineIcon><path d="m17 2 4 4-4 4" /><path d="M3 11V9a3 3 0 0 1 3-3h15" /><path d="m7 22-4-4 4-4" /><path d="M21 13v2a3 3 0 0 1-3 3H3" /><path d="M12 10v5" /><path d="m10.5 11.5 1.5-1.5 1.5 1.5" /></LineIcon>
    },
    {
      mode: "shuffle",
      label: "随机播放",
      icon: <LineIcon><path d="m18 14 4 4-4 4" /><path d="m18 2 4 4-4 4" /><path d="M2 18h1.4a7 7 0 0 0 5.2-2.3l6.8-7.4A7 7 0 0 1 20.6 6H22" /><path d="M2 6h1.4a7 7 0 0 1 5.2 2.3l1.2 1.3" /><path d="M14.2 15.7a7 7 0 0 0 5.2 2.3H22" /></LineIcon>
    }
  ];

  const cyclePlayMode = () => {
    const index = playModes.findIndex((item) => item.mode === playMode);
    const next = playModes[(index + 1) % playModes.length] || playModes[0];
    setPlayMode(next.mode);
    if (next.mode === "shuffle" && queueTracks.length > 1) {
      const current = currentTrack;
      const rest = queueTracks.filter((track) => track.id !== current?.id);
      const shuffled = buildQueue(rest, "shuffle");
      setPlayQueueIds([...(current ? [current.id] : []), ...shuffled.map((track) => track.id)]);
    } else if (next.mode !== "shuffle") {
      setPlayQueueIds((prev) => {
        const current = currentTrack;
        const ordered = tracks.map((track) => track.id).filter((id) => prev.includes(id) || id === current?.id);
        return ordered.length ? ordered : prev;
      });
    }
  };

  const currentPlayMode = playModes.find((item) => item.mode === playMode) || playModes[0];

  const navigateTo = (nextView: View) => {
    if (nextView === view) return;
    viewHistoryRef.current.push(view);
    setView(nextView);
  };

  const navigateBack = () => {
    if (lyricsOpen) {
      setLyricsOpen(false);
      return;
    }
    const previous = viewHistoryRef.current.pop();
    setView(previous || "songs");
  };

  const openDesktopLyricSettings = () => {
    setLyricsOpen(false);
    setSettingsTab("lyrics");
    navigateTo("settings");
    window.setTimeout(() => {
      document.getElementById("desktop-lyric-settings")?.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    }, 120);
  };

  const canNavigateBack = view !== "songs" || viewHistoryRef.current.length > 0;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.isContentEditable;
      if (typing) return;
      if ((event.altKey && event.key === "ArrowLeft") || event.key === "Backspace") {
        event.preventDefault();
        navigateBack();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [view, lyricsOpen]);

  const navItems: { key: View; label: string; icon: ReactNode }[] = [
    {
      key: "songs",
      label: "歌曲",
      icon: <LineIcon className="h-4 w-4"><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></LineIcon>
    },
    {
      key: "artists",
      label: "艺术家",
      icon: <LineIcon className="h-4 w-4"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></LineIcon>
    },
    {
      key: "albums",
      label: "专辑",
      icon: <LineIcon className="h-4 w-4"><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="3" /></LineIcon>
    },
    {
      key: "folders",
      label: "文件夹",
      icon: <LineIcon className="h-4 w-4"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" /></LineIcon>
    },
    {
      key: "library",
      label: "音乐库",
      icon: <LineIcon className="h-4 w-4"><path d="M4 19.5V5a2 2 0 0 1 2-2h12" /><path d="M6 17h12" /><path d="M6 21h12a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2" /></LineIcon>
    },
    {
      key: "settings",
      label: "设置",
      icon: <LineIcon className="h-4 w-4"><path d="M12 15.5A3.5 3.5 0 1 0 12 8a3.5 3.5 0 0 0 0 7.5z" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.2a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.2a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1A2 2 0 1 1 7.1 4.3l.1.1a1.7 1.7 0 0 0 1.8.3 1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.2a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8 1.7 1.7 0 0 0 1.5 1h.2a2 2 0 1 1 0 4h-.2a1.7 1.7 0 0 0-1.4 1z" /></LineIcon>
    }
  ];

  const playTrackFromSource = (trackId: string, source: Track[]) => {
    if (!source.length) return;
    const queue = buildQueue(source, playMode === "shuffle" ? "shuffle" : "sequential");
    const selected = queue.find((track) => track.id === trackId);
    setPlayQueueIds(queue.map((track) => track.id));
    setCurrentTrackId(selected?.id || trackId);
    setCurrentTime(0);
    setIsPlaying(true);
  };

  const jumpToTrack = (id: string) => {
    setCurrentTrackId(id);
    setPlayQueueIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
    setCurrentTime(0);
    setIsPlaying(true);
  };

  const locateCurrentTrackInList = () => {
    if (!currentTrack || currentTrackInCurrentPageIndex < 0) return;
    setLocatedTrackId(currentTrack.id);
    window.setTimeout(() => {
      const target = document.getElementById(`track-row-${currentTrack.id}`);
      if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "center" });
      } else {
        window.dispatchEvent(new CustomEvent<VirtualTrackScrollDetail>("still:virtual-track-scroll", {
          detail: { pageKey: view, trackId: currentTrack.id }
        }));
      }
    }, 80);
    window.setTimeout(() => setLocatedTrackId(null), 1800);
  };

  const updateMainScrollbar = useCallback(() => {
    const main = mainScrollRef.current;
    if (!main) {
      setMainScrollbar((prev) => ({ ...prev, visible: false }));
      return;
    }
    const rect = main.getBoundingClientRect();
    const top = rect.top;
    const bottom = Math.min(rect.bottom, window.innerHeight - PLAYER_FOOTER_HEIGHT);
    const height = Math.max(0, bottom - top);
    const maxScroll = Math.max(0, main.scrollHeight - main.clientHeight);
    if (height <= 0 || maxScroll <= 1) {
      setMainScrollbar((prev) => ({ ...prev, visible: false, top, height }));
      return;
    }
    const thumbHeight = Math.max(28, Math.min(height, height * (main.clientHeight / Math.max(main.scrollHeight, 1))));
    const travel = Math.max(1, height - thumbHeight);
    const thumbTop = top + (main.scrollTop / maxScroll) * travel;
    setMainScrollbar({
      visible: true,
      top,
      right: Math.max(0, window.innerWidth - rect.right),
      height,
      thumbTop,
      thumbHeight
    });
  }, []);

  const scrollMainFromScrollbarY = useCallback((clientY: number) => {
    const main = mainScrollRef.current;
    if (!main || !mainScrollbar.visible) return;
    const maxScroll = Math.max(0, main.scrollHeight - main.clientHeight);
    const travel = Math.max(1, mainScrollbar.height - mainScrollbar.thumbHeight);
    const nextRatio = Math.max(0, Math.min(1, (clientY - mainScrollbar.top - mainScrollbar.thumbHeight / 2) / travel));
    main.scrollTop = nextRatio * maxScroll;
    updateMainScrollbar();
  }, [mainScrollbar, updateMainScrollbar]);

  const showTrackAlphaBubble = useCallback((letter: string) => {
    if (!availableAlphaLetters.length) return;
    const main = mainScrollRef.current;
    const rect = main?.getBoundingClientRect();
    const pointer = mainPointerRef.current;
    const maxScroll = main ? Math.max(1, main.scrollHeight - main.clientHeight) : 1;
    const scrollRatio = main ? main.scrollTop / maxScroll : 0.5;
    const bubbleRadius = 28;
    const minY = rect ? rect.top + bubbleRadius : 90;
    const maxY = Math.max(minY, rect ? Math.min(rect.bottom, window.innerHeight - PLAYER_FOOTER_HEIGHT) - bubbleRadius : window.innerHeight - PLAYER_FOOTER_HEIGHT - bubbleRadius);
    const scrollY = minY + scrollRatio * Math.max(1, maxY - minY);
    const pointerY = Math.max(minY, Math.min(maxY, pointer.y || scrollY));
    setTrackAlphaBubble({
      visible: true,
      letter,
      x: rect ? rect.right - 58 : window.innerWidth - 70,
      y: scrollbarDraggingRef.current ? scrollY : pointerY
    });
    if (trackAlphaBubbleTimerRef.current) window.clearTimeout(trackAlphaBubbleTimerRef.current);
    trackAlphaBubbleTimerRef.current = window.setTimeout(() => {
      if (!scrollbarDraggingRef.current) setTrackAlphaBubble((prev) => ({ ...prev, visible: false }));
    }, 900);
  }, [availableAlphaLetters.length]);

  const getCurrentTrackAlphaLetter = useCallback(() => {
    const main = mainScrollRef.current;
    if (!main) return availableAlphaLetters[0] || "#";
    const virtualList = document.getElementById(`track-virtual-list-${view}`);
    if (virtualList && currentAlphaTracks.length) {
      const mainRect = main.getBoundingClientRect();
      const listRect = virtualList.getBoundingClientRect();
      const probeTop = Math.max(0, mainRect.top - listRect.top + 90);
      let active = availableAlphaLetters[0] || "#";
      let top = 0;
      let previousLetter = "";
      for (const track of currentAlphaTracks) {
        const letter = getTrackAlphaLetter(track, sortKey);
        if (letter !== previousLetter) {
          if (top > probeTop) break;
          active = letter;
          previousLetter = letter;
          top += TRACK_ALPHA_HEIGHT;
        }
        top += TRACK_ROW_HEIGHT;
      }
      return active;
    }
    const mainRect = main.getBoundingClientRect();
    const headers = [...main.querySelectorAll<HTMLElement>("[data-alpha-letter]")];
    let active = headers[0]?.dataset.alphaLetter || availableAlphaLetters[0] || "#";
    for (const header of headers) {
      if (header.getBoundingClientRect().top <= mainRect.top + 90) {
        active = header.dataset.alphaLetter || active;
      } else {
        break;
      }
    }
    return active;
  }, [availableAlphaLetters, currentAlphaTracks, sortKey, view]);

  const handleMainScroll = useCallback(() => {
    updateMainScrollbar();
    if (!availableAlphaLetters.length || !scrollbarDraggingRef.current) return;
    showTrackAlphaBubble(getCurrentTrackAlphaLetter());
  }, [availableAlphaLetters.length, getCurrentTrackAlphaLetter, showTrackAlphaBubble, updateMainScrollbar]);

  const handleMainPointerMove = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    mainPointerRef.current = { x: event.clientX, y: event.clientY };
    if (scrollbarDraggingRef.current && availableAlphaLetters.length) {
      showTrackAlphaBubble(getCurrentTrackAlphaLetter());
    }
  }, [availableAlphaLetters.length, getCurrentTrackAlphaLetter, showTrackAlphaBubble]);

  const handleMainPointerDown = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    scrollbarDraggingRef.current = event.clientX >= rect.right - 20;
    mainPointerRef.current = { x: event.clientX, y: event.clientY };
    if (scrollbarDraggingRef.current && availableAlphaLetters.length) {
      showTrackAlphaBubble(getCurrentTrackAlphaLetter());
    }
  }, [availableAlphaLetters.length, getCurrentTrackAlphaLetter, showTrackAlphaBubble]);

  const endScrollbarDrag = useCallback(() => {
    scrollbarDraggingRef.current = false;
    customScrollbarDraggingRef.current = false;
    setCustomScrollbarDragging(false);
  }, []);

  useLayoutEffect(() => {
    updateMainScrollbar();
    const frame = window.requestAnimationFrame(updateMainScrollbar);
    window.addEventListener("resize", updateMainScrollbar);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", updateMainScrollbar);
    };
  }, [currentAlphaTracks.length, updateMainScrollbar, view]);

  useEffect(() => {
    if (!customScrollbarDragging) return;
    const onPointerMove = (event: PointerEvent) => {
      mainPointerRef.current = { x: event.clientX, y: event.clientY };
      scrollMainFromScrollbarY(event.clientY);
      if (availableAlphaLetters.length) showTrackAlphaBubble(getCurrentTrackAlphaLetter());
    };
    const onPointerUp = () => endScrollbarDrag();
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp, { once: true });
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [availableAlphaLetters.length, customScrollbarDragging, endScrollbarDrag, getCurrentTrackAlphaLetter, scrollMainFromScrollbarY, showTrackAlphaBubble, mainScrollbar]);

  const scrollToTrackAlphaLetter = useCallback((letter: string) => {
    setTrackAlphaPickerOpen(false);
    const target = document.getElementById(`track-alpha-${view}-${letter}`);
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    } else {
      window.dispatchEvent(new CustomEvent<VirtualTrackScrollDetail>("still:virtual-track-scroll", {
        detail: { pageKey: view, letter }
      }));
    }
    showTrackAlphaBubble(letter);
  }, [showTrackAlphaBubble, view]);

  const toggleTrackSelection = (trackId: string) => {
    setSelectedTrackIds((prev) => (prev.includes(trackId) ? prev.filter((id) => id !== trackId) : [...prev, trackId]));
  };

  const addTrackIdsToPlaylist = (playlistId: string, trackIds: string[]) => {
    if (!trackIds.length) return;
    setPlaylists((prev) => prev.map((item) => {
      if (item.id !== playlistId) return item;
      const merged = [...item.trackIds];
      trackIds.forEach((id) => {
        if (!merged.includes(id)) merged.push(id);
      });
      return { ...item, trackIds: merged };
    }));
  };

  const navigateArtist = (artist: string) => {
    setSelectedArtist(artist);
    setArtistDetailTab("songs");
    navigateTo("artist-detail");
  };

  const navigateAlbum = (album: string) => {
    setSelectedAlbum(album);
    navigateTo("album-detail");
  };

  function buildQueue(source: Track[], mode: PlayMode) {
    const queue = [...source];
    if (mode === "shuffle") {
      for (let i = queue.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [queue[i], queue[j]] = [queue[j], queue[i]];
      }
    }
    return queue;
  }

  const applyPlayQueue = (source: Track[], mode: PlayMode) => {
    if (!source.length) return;
    const queue = buildQueue(source, mode);
    setPlayMode(mode);
    setPlayQueueIds(queue.map((track) => track.id));
    setCurrentTrackId(queue[0].id);
    setCurrentTime(0);
    setIsPlaying(true);
  };

  const insertTracksToQueue = (trackIds: string[], mode: "after-current" | "after-last" | "to-end") => {
    const uniqueIds = trackIds.filter((id, index) => trackIds.indexOf(id) === index);
    if (!uniqueIds.length) return;
    setPlayQueueIds((prev) => {
      const next = prev.filter((id) => !uniqueIds.includes(id));
      if (mode === "to-end") {
        setLastQueueInsertIndex(next.length);
        return [...next, ...uniqueIds];
      }
      const currentIndex = next.findIndex((id) => id === currentTrackId);
      const anchor = mode === "after-last" ? Math.max(0, Math.min(lastQueueInsertIndex, next.length)) : Math.max(0, currentIndex + 1);
      setLastQueueInsertIndex(anchor + uniqueIds.length);
      return [...next.slice(0, anchor), ...uniqueIds, ...next.slice(anchor)];
    });
  };

  const clearPlayQueue = () => {
    setPlayQueueIds([]);
    setCurrentTrackId("");
    setLastQueueInsertIndex(0);
    setDraggedQueueIndex(null);
    setQueueDropIndex(null);
    setIsPlaying(false);
    setCurrentTime(0);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
  };

  const removeQueueTrackAt = (index: number) => {
    if (index < 0 || index >= playQueueIds.length) return;
    const removedId = playQueueIds[index];
    const nextIds = playQueueIds.filter((_, itemIndex) => itemIndex !== index);
    setPlayQueueIds(nextIds);
    setLastQueueInsertIndex((prev) => Math.max(0, Math.min(prev, nextIds.length)));
    setDraggedQueueIndex(null);
    setQueueDropIndex(null);
    if (removedId !== currentTrackId) return;
    const fallbackId = nextIds[Math.min(index, nextIds.length - 1)] || nextIds[index - 1] || "";
    if (fallbackId) {
      setCurrentTrackId(fallbackId);
      setCurrentTime(0);
      return;
    }
    setIsPlaying(false);
  };

  const moveQueueTrack = (fromIndex: number, dropIndex: number) => {
    if (fromIndex < 0 || fromIndex >= playQueueIds.length) return;
    const boundedDropIndex = Math.max(0, Math.min(dropIndex, playQueueIds.length));
    const toIndex = fromIndex < boundedDropIndex ? boundedDropIndex - 1 : boundedDropIndex;
    if (fromIndex === toIndex) return;
    const nextIds = [...playQueueIds];
    const [movedId] = nextIds.splice(fromIndex, 1);
    if (!movedId) return;
    nextIds.splice(toIndex, 0, movedId);
    setPlayQueueIds(nextIds);
    setLastQueueInsertIndex((prev) => Math.max(0, Math.min(prev, nextIds.length)));
  };

  const openTrackInfo = (trackId: string) => {
    setTrackInfoId(trackId);
    navigateTo("track-info");
  };

  const refreshTrackInfoFromFile = async (trackId: string) => {
    const target = tracks.find((track) => track.id === trackId);
    const host = window as HostWindow;
    if (!target?.localPath || !host.electronAPI?.library?.readMetadata) return;
    const meta = await host.electronAPI.library.readMetadata(target.localPath);
    const lyricSources: LyricSource[] = [];
    (meta.localLyrics || []).forEach((lyric, lyricIndex) => {
      if (!lyric?.raw?.trim()) return;
      lyricSources.push(toLyricSource(`local-${lyricIndex}`, lyric.label || "本地歌词", "local", lyric.raw));
    });
    if (meta.embeddedLyrics?.trim()) {
      lyricSources.push(toLyricSource("embedded", "内嵌歌词", "embedded", meta.embeddedLyrics));
    }
    const uniqueLyricSources = lyricSources.filter((source, sourceIndex, arr) =>
      arr.findIndex((candidate) => candidate.label === source.label && candidate.kind === source.kind && candidate.lines.length === source.lines.length) === sourceIndex
    );

    setTracks((prev) => prev.map((track) => {
      if (track.id !== trackId) return track;
      return {
        ...track,
        title: meta.title || track.title,
        artist: normalizeArtistList(meta.artist).join(" / ") || track.artist,
        album: meta.album || track.album,
        year: Number(meta.year || track.year || 0),
        trackNo: Number(meta.trackNo || track.trackNo || 0),
        duration: Number(meta.duration || track.duration || 0),
        cover: meta.coverDataUrl || track.cover,
        fileSize: meta.fileSize ?? track.fileSize,
        modifiedAt: meta.modifiedAt ?? track.modifiedAt,
        createdAt: meta.createdAt ?? track.createdAt,
        extension: meta.extension || track.extension,
        container: meta.container || track.container,
        codec: meta.codec || track.codec,
        bitrate: meta.bitrate ?? track.bitrate,
        sampleRate: meta.sampleRate ?? track.sampleRate,
        bitsPerSample: meta.bitsPerSample ?? track.bitsPerSample,
        channels: meta.channels ?? track.channels,
        lossless: meta.lossless ?? track.lossless,
        tagTypes: meta.tagTypes || track.tagTypes,
        lyricSources: uniqueLyricSources.length ? uniqueLyricSources : track.lyricSources,
        selectedLyricSourceId: uniqueLyricSources[0]?.id || track.selectedLyricSourceId
      };
    }));
  };

  const removeTracksFromLibrary = (trackIds: string[]) => {
    const removeSet = new Set(trackIds);
    if (!removeSet.size) return;
    setTracks((prev) => prev.filter((track) => !removeSet.has(track.id)));
    setPlaylists((prev) => prev.map((playlist) => ({ ...playlist, trackIds: playlist.trackIds.filter((id) => !removeSet.has(id)) })));
    setPlayQueueIds((prev) => prev.filter((id) => !removeSet.has(id)));
    setSelectedTrackIds((prev) => prev.filter((id) => !removeSet.has(id)));
    setUnreadableTrackIds((prev) => prev.filter((id) => !removeSet.has(id)));
    setMissingPromptTrackId((prev) => (prev && removeSet.has(prev) ? "" : prev));
    if (currentTrackId && removeSet.has(currentTrackId)) {
      const fallback = tracks.find((track) => !removeSet.has(track.id));
      if (fallback) setCurrentTrackId(fallback.id);
    }
  };

  const removeTrackIdsFromPlaylist = (playlistId: string, trackIds: string[]) => {
    const removeSet = new Set(trackIds);
    if (!playlistId || !removeSet.size) return;
    setPlaylists((prev) => prev.map((playlist) => (playlist.id === playlistId
      ? { ...playlist, trackIds: playlist.trackIds.filter((id) => !removeSet.has(id)) }
      : playlist)));
    setSelectedTrackIds((prev) => prev.filter((id) => !removeSet.has(id)));
  };

  const openTrackContext = (event: React.MouseEvent, trackId: string, playlistId?: string) => {
    event.preventDefault();
    const targetIds = selectedTrackIds.includes(trackId) ? selectedTrackIds : [trackId];
    setContextMenu({ x: event.clientX, y: event.clientY, trackIds: targetIds, playlistId });
    setPlaylistContextMenu(null);
  };

  const openPlaylistContext = (event: React.MouseEvent, playlistId: string) => {
    event.preventDefault();
    event.stopPropagation();
    setPlaylistContextMenu({ x: event.clientX, y: event.clientY, playlistId });
    setContextMenu(null);
    setContextPlaylistSubmenuOpen(false);
  };

  const startRenamePlaylist = (playlistId: string) => {
    const playlist = playlists.find((item) => item.id === playlistId);
    if (!playlist) return;
    setRenamePlaylistId(playlistId);
    setRenamePlaylistName(playlist.name);
    setPlaylistContextMenu(null);
  };

  const confirmRenamePlaylist = () => {
    const name = renamePlaylistName.trim();
    if (!renamePlaylistId || !name) return;
    setPlaylists((prev) => prev.map((playlist) => (playlist.id === renamePlaylistId ? { ...playlist, name } : playlist)));
    setRenamePlaylistId("");
    setRenamePlaylistName("");
  };

  const deletePlaylist = (playlistId: string) => {
    setPlaylists((prev) => prev.filter((playlist) => playlist.id !== playlistId));
    if (selectedPlaylistId === playlistId) {
      setSelectedPlaylistId("");
      navigateTo("playlists");
    }
    setPlaylistContextMenu(null);
  };

  useEffect(() => {
    const closeOverlays = () => {
      setContextMenu(null);
      setContextPlaylistSubmenuOpen(false);
      setSortMenuOpen(false);
      setPlaylistContextMenu(null);
      setLyricSourceMenuOpen(false);
      setVolumePanelOpen(false);
      setSpeedPanelOpen(false);
    };
    window.addEventListener("click", closeOverlays);
    window.addEventListener("resize", closeOverlays);
    return () => {
      window.removeEventListener("click", closeOverlays);
      window.removeEventListener("resize", closeOverlays);
    };
  }, []);

  useEffect(() => () => {
    if (trackAlphaBubbleTimerRef.current) {
      window.clearTimeout(trackAlphaBubbleTimerRef.current);
      trackAlphaBubbleTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      mainPointerRef.current = { x: event.clientX, y: event.clientY };
      if (scrollbarDraggingRef.current && availableAlphaLetters.length) {
        showTrackAlphaBubble(getCurrentTrackAlphaLetter());
      }
    };
    const onPointerUp = () => {
      scrollbarDraggingRef.current = false;
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [availableAlphaLetters.length, getCurrentTrackAlphaLetter, showTrackAlphaBubble]);

  useEffect(() => {
    const onResize = () => {
      setViewportSize({ width: window.innerWidth, height: window.innerHeight });
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (!queueOpen) return;
    const closeQueueOnOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (queuePanelRef.current?.contains(target)) return;
      if (queueToggleRef.current?.contains(target)) return;
      setQueueOpen(false);
    };
    window.addEventListener("mousedown", closeQueueOnOutside);
    return () => window.removeEventListener("mousedown", closeQueueOnOutside);
  }, [queueOpen]);

  useEffect(() => {
    if (!multiSelectEnabled) setSelectedTrackIds([]);
  }, [multiSelectEnabled]);

  useEffect(() => {
    const host = window as HostWindow;
    const onFullscreenChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFullscreenChange);
    host.electronAPI?.window?.isFullscreen?.().then(setIsFullscreen).catch(() => undefined);
    const offElectronFullscreen = host.electronAPI?.window?.onFullscreenChanged?.((value) => setIsFullscreen(Boolean(value)));
    return () => {
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      offElectronFullscreen?.();
    };
  }, []);

  useEffect(() => {
    const host = window as HostWindow;
    host.electronAPI?.window?.isMaximized?.().then(setIsWindowMaximized).catch(() => undefined);
    return host.electronAPI?.window?.onMaximizedChanged?.((value) => setIsWindowMaximized(Boolean(value)));
  }, []);

  const callWindowControl = (action: "minimize" | "maximize" | "restore" | "close" | "fullscreen") => {
    const host = window as HostWindow;
    host.electronWindow?.[action]?.();
    host.electronAPI?.window?.[action]?.();
    host.api?.window?.[action]?.();
  };

  const toggleFullscreen = () => {
    const host = window as HostWindow;
    const electronFullscreen = host.electronAPI?.window?.fullscreen;
    if (electronFullscreen) {
      Promise.resolve(electronFullscreen()).then((value) => {
        if (typeof value === "boolean") setIsFullscreen(value);
      }).catch(() => undefined);
      return;
    }
    if (document.fullscreenElement) {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => undefined);
    } else {
      document.documentElement.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => undefined);
    }
  };

  function previousTrack() {
    if (!queueTracks.length) return;
    const safeIndex = currentQueueIndex < 0 ? 0 : currentQueueIndex;
    const target = queueTracks[(safeIndex - 1 + queueTracks.length) % queueTracks.length];
    setCurrentTrackId(target.id);
    setIsPlaying(true);
  }

  function nextTrack() {
    if (!queueTracks.length) return;
    const safeIndex = currentQueueIndex < 0 ? 0 : currentQueueIndex;
    const target = queueTracks[(safeIndex + 1) % queueTracks.length];
    setCurrentTrackId(target.id);
    setIsPlaying(true);
  }

  function togglePlay() {
    if (!audioRef.current || !currentTrack) return;
    setIsPlaying((prev) => !prev);
  }

  useEffect(() => {
    const host = window as HostWindow;
    return host.electronAPI?.player?.onCommand?.((command) => {
      if (command === "previous") previousTrack();
      if (command === "next") nextTrack();
      if (command === "play-pause") togglePlay();
      if (command === "desktop-toggle") setDesktopLyricOpen((prev) => !prev);
      if (command === "desktop-closed") setDesktopLyricOpen(false);
      if (command === "lock-toggle") setDesktopLyricLocked((prev) => !prev);
      if (command === "desktop-settings") openDesktopLyricSettings();
      if (command === "close") setDesktopLyricOpen(false);
    });
  }, [queueTracks, currentQueueIndex, tracks, currentTrack, openDesktopLyricSettings]);

  useEffect(() => {
    const host = window as HostWindow;
    if (desktopLyricOpen) desktopLyricPayloadKeyRef.current = "";
    void host.electronAPI?.desktopLyrics?.setOpen?.(desktopLyricOpen);
  }, [desktopLyricOpen]);

  useEffect(() => {
    const host = window as HostWindow;
    void host.electronAPI?.desktopLyrics?.setLocked?.(desktopLyricLocked);
  }, [desktopLyricLocked, desktopLyricOpen]);

  useEffect(() => {
    if (!desktopLyricOpen) return;
    const activeLine = activeLyricIndex >= 0 ? currentLyrics[activeLyricIndex] : undefined;
    const nextLine = activeLyricIndex >= 0 ? currentLyrics[activeLyricIndex + 1] : undefined;
    const desktopWordByWord = desktopLyricWordByWord === "auto" && Boolean(activeLine?.words?.length);
    const desktopInfo = currentTrack || IDLE_TRACK_INFO;
    const wordProgress = desktopWordByWord && activeLine ? getLyricWordProgress(activeLine, activeLyricIndex) * 100 : 0;
    const cover = resolvedCurrentCover || currentTrack?.cover || "";
    const payloadKey = [
      currentTrack?.id || "idle",
      desktopInfo.title,
      desktopInfo.artist,
      desktopInfo.album,
      cover.length,
      activeLine?.text || "",
      activeLine?.translation || "",
      nextLine?.text || "",
      desktopLyricDoubleLine,
      desktopLyricShowTranslation,
      desktopWordByWord,
      desktopWordByWord ? Math.round(wordProgress * 10) / 10 : 0,
      desktopLyricSwitchAnimation,
      desktopLyricFontSize,
      desktopLyricSecondLineSize,
      desktopLyricFontWeight,
      desktopLyricPlayedColor,
      desktopLyricPendingColor,
      desktopLyricStrokeColor,
      isPlaying,
      desktopLyricLocked
    ].join("\u001f");
    if (desktopLyricPayloadKeyRef.current === payloadKey) return;
    desktopLyricPayloadKeyRef.current = payloadKey;
    const host = window as HostWindow;
    void host.electronAPI?.desktopLyrics?.update?.({
      title: desktopInfo.title,
      artist: desktopInfo.artist,
      album: desktopInfo.album,
      cover,
      lyric: currentTrack ? (activeLine?.text || "...") : IDLE_TRACK_INFO.title,
      translation: activeLine?.translation || "",
      nextLyric: nextLine?.text || "",
      doubleLine: desktopLyricDoubleLine,
      showTranslation: desktopLyricShowTranslation,
      wordByWord: desktopWordByWord,
      switchAnimation: desktopLyricSwitchAnimation,
      fontSize: desktopLyricFontSize,
      secondLineSize: desktopLyricSecondLineSize,
      fontWeight: desktopLyricFontWeight,
      playedColor: desktopLyricPlayedColor,
      pendingColor: desktopLyricPendingColor,
      strokeColor: desktopLyricStrokeColor,
      isPlaying,
      locked: desktopLyricLocked,
      wordProgress
    });
  }, [desktopLyricOpen, desktopLyricLocked, desktopLyricDoubleLine, desktopLyricShowTranslation, desktopLyricWordByWord, desktopLyricSwitchAnimation, desktopLyricFontSize, desktopLyricSecondLineSize, desktopLyricFontWeight, desktopLyricPlayedColor, desktopLyricPendingColor, desktopLyricStrokeColor, currentTrack?.id, currentTrack?.title, currentTrack?.artist, currentTrack?.album, currentTrack?.cover, resolvedCurrentCover, activeLyricIndex, currentLyrics, currentTime, translationEnabled, isPlaying]);

  const appendImportedTracks = (
    imported: ImportedTrackResult[],
    options: { navigate?: boolean } = {}
  ) => {
    if (!imported.length) return 0;
    const shouldNavigate = options.navigate ?? true;
    const existingPathIds = new Map<string, string>();
    tracks.forEach((track) => {
      const pathKey = normalizeTrackPathKey(track.localPath || track.filePath);
      if (pathKey && !existingPathIds.has(pathKey)) existingPathIds.set(pathKey, track.id);
    });
    const loaded = imported.map((item, idx) => {
      const relative = (item.relativePath || "").split("\\").join("/");
      const fileName = relative.split("/").pop() || item.localPath.split("\\").pop() || `track-${idx + 1}`;
      const guessedTitle = getBaseName(fileName);
      const folder = getFolderPathFromTrackPath(relative || item.localPath, item.localPath);
      const lyricSources: LyricSource[] = [];

      (item.localLyrics || []).forEach((lyric, lyricIndex) => {
        if (!lyric?.raw?.trim()) return;
        lyricSources.push(toLyricSource(`local-${lyricIndex}`, lyric.label || "本地歌词", "local", lyric.raw));
      });
      if (item.embeddedLyrics?.trim()) {
        lyricSources.push(toLyricSource("embedded", "内嵌歌词", "embedded", item.embeddedLyrics));
      }

      const uniqueLyricSources = lyricSources.filter((source, sourceIndex, arr) =>
        arr.findIndex((candidate) => candidate.label === source.label && candidate.kind === source.kind && candidate.lines.length === source.lines.length) === sourceIndex
      );

      return {
        id: existingPathIds.get(normalizeTrackPathKey(item.localPath || relative)) || makeLocalTrackId(item.localPath, relative),
        title: item.title || guessedTitle,
        artist: normalizeArtistList(item.artist).join(" / ") || "Unknown Artist",
        album: item.album || "Unknown Album",
        year: Number(item.year || 0),
        trackNo: Number(item.trackNo || idx + 1),
        duration: Number(item.duration || 0),
        cover: item.coverDataUrl || makeCover(["#24459e", "#4b63cc"], "Local"),
        folder,
        filePath: item.localPath || relative,
        localPath: item.localPath,
        audioUrl: toFileUrl(item.localPath),
        fileSize: item.fileSize,
        modifiedAt: item.modifiedAt,
        createdAt: item.createdAt,
        extension: item.extension || getExt(item.localPath || relative).replace(".", "").toUpperCase(),
        container: item.container,
        codec: item.codec,
        bitrate: item.bitrate,
        sampleRate: item.sampleRate,
        bitsPerSample: item.bitsPerSample,
        channels: item.channels,
        lossless: item.lossless,
        tagTypes: item.tagTypes,
        lyricSources: uniqueLyricSources,
        selectedLyricSourceId: uniqueLyricSources[0]?.id
      } as Track;
    });

    setTracks((prev) => mergeTracksById(prev, loaded));
    setPlayQueueIds((prev) => [...prev, ...loaded.map((track) => track.id).filter((id) => !prev.includes(id))]);
    if (shouldNavigate) navigateTo("songs");
    setCurrentTrackId((prev) => prev || loaded[0].id);
    return loaded.length;
  };

  const importFolder = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const host = window as HostWindow;
    if (host.electronAPI?.library?.importFolder) {
      try {
        const result = await host.electronAPI.library.importFolder();
        const imported = result?.tracks || [];
        if (!imported.length) {
          event.target.value = "";
          return;
        }
        appendImportedTracks(imported);
        event.target.value = "";
        return;
      } catch {
        // Fallback to browser file parsing when Electron import fails.
      }
    }

    const files = Array.from(event.target.files || []);
    if (!files.length) return;

    const textMap = new Map<string, string>();
    const imageMap = new Map<string, string>();
    await Promise.all(
      files
        .filter((file) => TEXT_TYPES.includes(getExt(file.name)))
        .map(async (file) => {
          const relRaw = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
          const rel = relRaw.split("\\").join("/");
          const content = await file.text();
          textMap.set(getBaseName(rel).toLowerCase(), content);
          textMap.set(getBaseName(file.name).toLowerCase(), content);
        })
    );

    files
      .filter((file) => [".jpg", ".jpeg", ".png", ".webp"].includes(getExt(file.name)))
      .forEach((file) => {
        const relRaw = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
        const rel = relRaw.split("\\").join("/");
        const dir = rel.includes("/") ? rel.slice(0, rel.lastIndexOf("/")).toLowerCase() : "";
        const key = getBaseName(rel).toLowerCase();
        const url = URL.createObjectURL(file);
        imageMap.set(key, url);
        imageMap.set(getBaseName(file.name).toLowerCase(), url);
        if (dir) imageMap.set(`${dir}/${getBaseName(file.name).toLowerCase()}`, url);
    });

    const audioFiles = files.filter((file) => AUDIO_TYPES.includes(getExt(file.name)));
    const existingPathIds = new Map<string, string>();
    tracks.forEach((track) => {
      const pathKey = normalizeTrackPathKey(track.localPath || track.filePath);
      if (pathKey && !existingPathIds.has(pathKey)) existingPathIds.set(pathKey, track.id);
    });
    const loaded = await mapWithConcurrency(audioFiles, 4, async (file, idx) => {
        const relRaw = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
        const localPath = (file as File & { path?: string }).path;
        const rel = relRaw.split("\\").join("/");
        const relDir = rel.includes("/") ? rel.slice(0, rel.lastIndexOf("/")).toLowerCase() : "";
        const folderParts = rel.split("/");
        const folder = getFolderPathFromTrackPath(rel, localPath);
        const subAlbum = folderParts.length > 2 ? folderParts[folderParts.length - 2] : "";
        const tags = await readTags(file, localPath) as {
          title?: string;
          artist?: string;
          album?: string;
          year?: number;
          trackNo?: number;
          container?: string;
          codec?: string;
          bitrate?: number;
          sampleRate?: number;
          bitsPerSample?: number;
          channels?: number;
          lossless?: boolean;
          tagTypes?: string[];
          lyrics?: string;
          localLyrics?: Array<{ label: string; raw: string }>;
          cover?: string;
        };
        const audioUrl = URL.createObjectURL(file);
        const duration = await readDuration(audioUrl);

        const relKey = getBaseName(rel).toLowerCase();
        const fileKey = getBaseName(file.name).toLowerCase();
        const guessedFromName = getBaseName(file.name);
        const lrc = textMap.get(relKey) || textMap.get(fileKey) || "";
        const embedded = tags.lyrics || "";
        const lyricSources: LyricSource[] = [];
        if (lrc.trim()) lyricSources.push(toLyricSource("local", "本地 LRC", "local", lrc));
        (tags.localLyrics || []).forEach((item, index) => {
          if (!item?.raw?.trim()) return;
          lyricSources.push(toLyricSource(`local-${index}`, item.label || "本地歌词", "local", item.raw));
        });
        if (embedded.trim()) lyricSources.push(toLyricSource("embedded", "内嵌歌词", "embedded", embedded));
        const fallbackCover = imageMap.get(relKey)
          || imageMap.get(`${relDir}/cover`)
          || imageMap.get(`${relDir}/folder`)
          || imageMap.get(`${relDir}/front`)
          || imageMap.get(`${relDir}/album`)
          || imageMap.get(`${folder.toLowerCase()}/cover`)
          || imageMap.get(`${folder.toLowerCase()}/folder`)
          || imageMap.get(`${folder.toLowerCase()}/${subAlbum.toLowerCase()}/cover`);

        const dedupedLyricSources = lyricSources.filter((source, index, arr) =>
          arr.findIndex((item) => item.label === source.label && item.kind === source.kind && item.lines.length === source.lines.length) === index
        );

        const inferredTrackNo = Number(guessedFromName.match(/^(\d{1,2})/)?.[1] || 0);
        const inferredYear = Number((folder + subAlbum + guessedFromName).match(/(19\d{2}|20\d{2})/)?.[1] || 0);

        return {
          id: existingPathIds.get(normalizeTrackPathKey(localPath || rel)) || makeLocalTrackId(localPath, rel),
          title: String(tags.title || guessedFromName),
          artist: normalizeArtistList(tags.artist).join(" / ") || "Unknown Artist",
          album: String(tags.album || subAlbum || folder || "Unknown Album"),
          year: Number(tags.year || inferredYear || 0),
          trackNo: Number(tags.trackNo || inferredTrackNo || 0) || idx + 1,
          duration,
          cover: tags.cover || fallbackCover || makeCover(["#24459e", "#4b63cc"], "Local"),
          folder,
          filePath: localPath || rel,
          localPath,
          audioUrl,
          fileSize: file.size,
          modifiedAt: file.lastModified,
          extension: getExt(file.name).replace(".", "").toUpperCase(),
          container: tags.container,
          codec: tags.codec,
          bitrate: tags.bitrate,
          sampleRate: tags.sampleRate,
          bitsPerSample: tags.bitsPerSample,
          channels: tags.channels,
          lossless: tags.lossless,
          tagTypes: tags.tagTypes,
          lyricSources: dedupedLyricSources,
          selectedLyricSourceId: dedupedLyricSources[0]?.id
        } as Track;
    });

    if (loaded.length) {
      setTracks((prev) => mergeTracksById(prev, loaded));
      setPlayQueueIds((prev) => [...prev, ...loaded.map((track) => track.id).filter((id) => !prev.includes(id))]);
      navigateTo("songs");
      setCurrentTrackId((prev) => prev || loaded[0].id);
      event.target.value = "";
    }
  };

  const importDroppedItems = async (event: React.DragEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setLibraryDragActive(false);
    const host = window as HostWindow;
    const files = Array.from(event.dataTransfer.files || []);
    const paths = files
      .map((file) => host.electronAPI?.library?.getPathForFile?.(file) || (file as File & { path?: string }).path || "")
      .filter(Boolean);
    if (!paths.length || !host.electronAPI?.library?.importPaths) return;
    const result = await host.electronAPI.library.importPaths(paths);
    appendImportedTracks(result?.tracks || []);
  };

  const refreshMusicLibrary = async () => {
    if (libraryRefreshing) return;
    const host = window as HostWindow;
    if (!host.electronAPI?.library?.importPaths) {
      setTracks((prev) => [...prev]);
      return;
    }
    const roots = compactImportRoots(
      tracks
        .map((track) => track.localPath)
        .filter((item): item is string => Boolean(item))
        .map((item) => getParentPath(item))
    );
    if (!roots.length) {
      setTracks((prev) => [...prev]);
      return;
    }
    setLibraryRefreshing(true);
    try {
      const result = await host.electronAPI.library.importPaths(roots);
      appendImportedTracks(result?.tracks || [], { navigate: false });
    } finally {
      setLibraryRefreshing(false);
    }
  };

  const createPlaylist = () => {
    setCreatePlaylistDialogOpen(true);
  };

  const confirmCreatePlaylist = () => {
    const name = newPlaylistName.trim();
    if (!name) return;
    const id = `pl-${Date.now()}`;
    setPlaylists((prev) => [...prev, { id, name, trackIds: [] }]);
    setSelectedPlaylistId(id);
    setNewPlaylistName("");
    setCreatePlaylistDialogOpen(false);
    navigateTo("playlist-detail");
  };

  const renderArtistLinks = (track: Pick<Track, "artist">, className = "text-sm text-[var(--dim)] hover:text-[var(--accent)]") => (
    <span className="inline-flex min-w-0 flex-wrap items-center gap-x-1">
      {getTrackArtists(track).map((artistName, index, artistList) => (
        <span key={`${artistName}-${index}`} className="inline-flex items-center gap-x-1">
          <button type="button" onClick={(e) => { e.stopPropagation(); navigateArtist(artistName); }} className={className}>
            {artistName}
          </button>
          {index < artistList.length - 1 && <span className="text-[var(--dim)]">/</span>}
        </span>
      ))}
    </span>
  );

  const getCoverAspectRatio = (cover: string) => coverAspectRatios[cover] || 1;

  const rememberCoverAspectRatio = (cover: string, image: HTMLImageElement | null) => {
    if (!image || coverAspectRatios[cover] || !image.naturalWidth || !image.naturalHeight) return;
    const ratio = image.naturalWidth / image.naturalHeight;
    if (Number.isFinite(ratio) && ratio > 0) {
      setCoverAspectRatios((prev) => (prev[cover] ? prev : { ...prev, [cover]: ratio }));
    }
  };

  const getCoverBoxSize = (cover: string, maxWidth: number, maxHeight: number) => {
    const ratio = getCoverAspectRatio(cover);
    const widthByHeight = maxHeight * ratio;
    if (widthByHeight <= maxWidth) return { width: widthByHeight, height: maxHeight };
    return { width: maxWidth, height: maxWidth / ratio };
  };

  const renderAlbumCover = (cover: string, alt: string, maxWidth: number | string, maxHeight: number, shellClassName = "") => {
    const numericMaxWidth = typeof maxWidth === "number" ? maxWidth : maxHeight;
    const size = getCoverBoxSize(cover, numericMaxWidth, maxHeight);
    return (
      <span
        className={`grid place-items-center overflow-hidden rounded-xl bg-[var(--surface)] ${shellClassName}`}
        style={{ width: maxWidth, aspectRatio: `${size.width} / ${size.height}`, maxWidth: "100%" }}
      >
        <img
          ref={(node) => rememberCoverAspectRatio(cover, node)}
          onLoad={(event) => rememberCoverAspectRatio(cover, event.currentTarget)}
          src={cover}
          alt={alt}
          loading="lazy"
          decoding="async"
          className="h-full w-full rounded-xl object-contain"
        />
      </span>
    );
  };

  const renderCoverInSlot = (cover: string, alt: string, maxWidth: number, maxHeight: number, imageClassName = "rounded-md") => {
    const size = getCoverBoxSize(cover, maxWidth, maxHeight);
    return (
      <span className="grid place-items-center" style={{ width: maxWidth, height: maxHeight }}>
        <img
          ref={(node) => rememberCoverAspectRatio(cover, node)}
          onLoad={(event) => rememberCoverAspectRatio(cover, event.currentTarget)}
          src={cover}
          alt={alt}
          loading="lazy"
          decoding="async"
          className={`${imageClassName} object-contain`}
          style={{ width: size.width, height: size.height }}
        />
      </span>
    );
  };

  const renderAnimatedCover = (cover: string, alt: string, maxWidth: number, maxHeight: number, className = "") => {
    const size = getCoverBoxSize(cover, maxWidth, maxHeight);
    const radius = className.includes("rounded-lg") ? 8 : className.includes("rounded-xl") ? 12 : className.includes("rounded-2xl") ? 16 : 24;
    if (!cover) {
      const iconSize = Math.max(28, Math.min(size.width, size.height) * 0.42);
      return (
        <motion.div
          layoutId="active-cover"
          initial={false}
          animate={{ opacity: 1 }}
          exit={{ opacity: 1 }}
          transition={{ type: "spring", stiffness: 210, damping: 24 }}
          className={`relative shadow-xl ${className}`}
          style={{ width: size.width, height: size.height, opacity: 1, borderRadius: radius }}
          aria-label={alt}
        >
          <span
            className="absolute inset-0 grid place-items-center overflow-hidden bg-[var(--surface)] text-[var(--dim)]"
            style={{
              borderRadius: "inherit",
              clipPath: `inset(0 round ${radius}px)`,
              transform: "translateZ(0)"
            }}
          >
            <motion.svg
              viewBox="0 0 24 24"
              style={{ width: iconSize, height: iconSize }}
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={false}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.22 }}
            >
              <circle cx="8" cy="18" r="4" />
              <path d="M12 18V2l7 4" />
            </motion.svg>
          </span>
        </motion.div>
      );
    }
    return (
      <motion.div
        layoutId="active-cover"
        initial={false}
        animate={{ opacity: 1 }}
        exit={{ opacity: 1 }}
        transition={{ type: "spring", stiffness: 210, damping: 24 }}
        className={`relative shadow-xl ${className}`}
        style={{ width: size.width, height: size.height, opacity: 1, borderRadius: radius }}
      >
        <span
          className="absolute inset-0 grid place-items-center overflow-hidden bg-[var(--surface)]"
          style={{
            borderRadius: "inherit",
            clipPath: `inset(0 round ${radius}px)`,
            transform: "translateZ(0)"
          }}
        >
          <img
            ref={(node) => rememberCoverAspectRatio(cover, node)}
            onLoad={(event) => rememberCoverAspectRatio(cover, event.currentTarget)}
            src={cover}
            alt={alt}
            className="h-full w-full object-contain"
          />
        </span>
      </motion.div>
    );
  };
  const fullscreenContentFade = {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
    transition: { duration: 0.22 }
  };
  const fullscreenHudClassName = lyricsHudVisible
    ? "pointer-events-auto opacity-100"
    : "pointer-events-none opacity-0";
  const fullscreenHudTranslateClassName = lyricsHudVisible ? "translate-y-0" : "translate-y-[-4px]";

  const lyricScale = lyricAutoScale
    ? Math.max(0.72, Math.min(1.18, viewportSize.height / 1080))
    : 1;
  const activeLyricSize = Math.round(lyricFontSize * lyricScale);
  const inactiveLyricSize = Math.round(activeLyricSize * 0.8);
  const activeTranslationSize = Math.round(lyricTranslationFontSize * lyricScale);
  const inactiveTranslationSize = Math.round(activeTranslationSize * 0.8);
  const mixHorizontalBase = { coverColumn: 660, lyricColumn: 1040, gap: 128, height: 720 };
  const mixHorizontalBaseWidth = mixHorizontalBase.coverColumn + mixHorizontalBase.lyricColumn + mixHorizontalBase.gap;
  const mixHorizontalAvailableWidth = Math.max(360, viewportSize.width - 80);
  const mixHorizontalAvailableHeight = Math.max(280, viewportSize.height - 230);
  const mixHorizontalScale = Math.min(
    1,
    mixHorizontalAvailableWidth / mixHorizontalBaseWidth,
    mixHorizontalAvailableHeight / mixHorizontalBase.height
  );
  const mixHorizontalCoverColumnWidth = Math.round(mixHorizontalBase.coverColumn * mixHorizontalScale);
  const mixHorizontalLyricColumnWidth = Math.round(mixHorizontalBase.lyricColumn * mixHorizontalScale);
  const mixHorizontalGap = Math.round(mixHorizontalBase.gap * mixHorizontalScale);
  const mixHorizontalShift = Math.round(52 * mixHorizontalScale);
  const mixHorizontalCoverMaxHeight = mixHorizontalCoverColumnWidth;
  const mixHorizontalLyricScale = Math.max(0.72, Math.min(1, mixHorizontalScale));
  const lyricTextAlignClass = lyricPosition === "center" ? "text-center" : lyricPosition === "right" ? "text-right" : "text-left";
  const renderLyricStylePreview = (compact = false) => {
    const previewLyricSize = Math.max(28, Math.min(compact ? 54 : 64, activeLyricSize * (compact ? 0.68 : 0.82)));
    const previewTranslationSize = Math.max(18, Math.min(compact ? 34 : 42, activeTranslationSize * (compact ? 0.72 : 0.84)));
    const inactiveSize = Math.max(20, previewLyricSize * 0.78);
    const distantSize = Math.max(20, inactiveSize * 0.92);
    const previewAlign = lyricPosition === "center" ? "center" : lyricPosition === "right" ? "right" : "left";
    const inactiveBaseClass = theme === "dark" ? "text-white/42" : "text-slate-600/62";
    const dimBaseClass = theme === "dark" ? "text-white/28" : "text-slate-600/44";
    const surfaceClass = theme === "dark"
      ? "bg-[var(--surface)]/70 text-white"
      : "bg-[var(--surface)]/80 text-slate-900";
    const lineOrigin = previewAlign === "right" ? "right center" : previewAlign === "center" ? "center" : "left center";

    return (
      <div className={`relative overflow-hidden rounded-xl ${surfaceClass} ${compact ? "p-4 pb-8" : "p-5 pb-9"}`}>
        <div className={compact ? "space-y-4" : "space-y-5"} style={{ textAlign: previewAlign }}>
          <div>
            <p
              className="whitespace-pre-wrap"
              style={{
                fontSize: `${previewLyricSize}px`,
                fontWeight: lyricFontWeight,
                lineHeight: 1.08,
                color: theme === "dark" ? "rgba(255,255,255,.96)" : "rgba(15,23,42,.94)"
              }}
            >
              You'll be the prince{"\n"}and I'll be the princess
            </p>
            <p
              className="mt-2 whitespace-pre-wrap text-[var(--dim)]"
              style={{
                fontSize: `${previewTranslationSize}px`,
                fontWeight: Math.max(500, lyricFontWeight - 180),
                lineHeight: 1.18,
                color: theme === "dark" ? "rgba(255,255,255,.66)" : "rgba(71,85,105,.76)"
              }}
            >
              你会成为王子，而我也将会是公主
            </p>
          </div>
          <div
            className={`${inactiveBaseClass} ${lyricAutoBlur ? "blur-[0.8px]" : ""}`}
            style={{
              fontSize: `${inactiveSize}px`,
              fontWeight: lyricFontWeight,
              lineHeight: 1.12,
              opacity: lyricFadeEffect ? 0.52 : 0.82,
              transform: lyricDistantView ? "translateY(2px) scale(0.96)" : undefined,
              transformOrigin: lineOrigin
            }}
          >
            It's a love story
          </div>
          <div
            className={`${dimBaseClass} ${lyricAutoBlur ? "blur-[1px]" : ""}`}
            style={{
              fontSize: `${Math.max(18, inactiveSize * 0.78)}px`,
              fontWeight: Math.max(500, lyricFontWeight - 220),
              lineHeight: 1.12,
              opacity: lyricFadeEffect ? 0.36 : 0.68,
              transform: lyricDistantView ? "translateY(4px) scale(0.92)" : undefined,
              transformOrigin: lineOrigin
            }}
          >
            这是一个爱情故事
          </div>
          <div
            className={`${dimBaseClass} ${lyricAutoBlur ? "blur-[0.9px]" : ""}`}
            style={{
              fontSize: `${distantSize}px`,
              fontWeight: lyricFontWeight,
              lineHeight: 1.12,
              opacity: lyricFadeEffect ? 0.42 : 0.7,
              transform: lyricDistantView ? "translateY(3px) scale(0.964)" : undefined,
              transformOrigin: lineOrigin
            }}
          >
            Baby just say yes
          </div>
          <div
            className={`${dimBaseClass} ${lyricAutoBlur ? "blur-[1px]" : ""}`}
            style={{
              fontSize: `${Math.max(18, previewTranslationSize * 0.82)}px`,
              fontWeight: Math.max(500, lyricFontWeight - 240),
              lineHeight: 1.12,
              opacity: lyricFadeEffect ? 0.34 : 0.62,
              transform: lyricDistantView ? "translateY(4px) scale(0.95)" : undefined,
              transformOrigin: lineOrigin
            }}
          >
            亲爱的，你只需答应我
          </div>
        </div>
        <p className="absolute bottom-3 right-4 text-right text-xs font-medium text-[var(--dim)]">——Taylor Swift《Love Story》</p>
      </div>
    );
  };
  const renderSettingsRow = (title: string, desc: string, control: ReactNode) => (
    <div className="flex items-center justify-between gap-4 rounded-xl bg-[var(--surface)]/65 px-4 py-3">
      <div>
        <p className="font-semibold">{title}</p>
        <p className="mt-1 text-sm text-[var(--dim)]">{desc}</p>
      </div>
      <div className="shrink-0">{control}</div>
    </div>
  );
  const renderLyricEffectRow = (_icon: ReactNode, title: string, desc: string, checked: boolean, onChange: () => void) => (
    <div className="flex items-center justify-between gap-4 rounded-xl bg-[var(--surface)]/45 px-4 py-4">
      <div className="min-w-0">
        <p className="font-semibold">{title}</p>
        <p className="mt-1 text-sm text-[var(--dim)]">{desc}</p>
      </div>
      <ToggleSwitch checked={checked} onChange={onChange} />
    </div>
  );

  const buildCopyLyricText = useCallback(() => {
    const blocks: string[] = [];
    if (copySongTitle) blocks.push(`《${fullscreenTrackInfo.title}》`);
    if (copyArtist) blocks.push(fullscreenTrackInfo.artist);
    const copyLines = currentLyrics.length ? currentLyrics : [{ time: 0, text: IDLE_TRACK_INFO.title }];
    copyLines.forEach((line, index) => {
      if (!selectedCopyLyricIndexes.includes(index)) return;
      const parts = [line.text];
      const translations = (line.translation || "").split(/\r?\n/).map((part) => part.trim()).filter(Boolean);
      translations.forEach((part) => {
        const isTranslation = containsCjk(part);
        if ((isTranslation && copyTranslation) || (!isTranslation && copyRomaji)) parts.push(part);
      });
      blocks.push(parts.join("\n"));
    });
    return copyBlankLines ? blocks.join("\n\n") : blocks.join("\n");
  }, [copyArtist, copyBlankLines, copyRomaji, copySongTitle, copyTranslation, currentLyrics, fullscreenTrackInfo.artist, fullscreenTrackInfo.title, selectedCopyLyricIndexes]);

  const copyFullLyrics = useCallback(() => {
    const text = buildCopyLyricText();
    if (!text.trim()) return;
    void navigator.clipboard?.writeText(text);
    setLyricsCopyOpen(false);
  }, [buildCopyLyricText]);

  const getLyricWordProgress = (line: LyricLine, lineIndex: number) => {
    if (!line.words?.length) return 0;
    return getLyricWordProgressAt(currentLyrics, lineIndex, currentTime + lyricTimeOffset, currentTrack?.duration || 0);
  };

  const renderLyricMainText = (line: LyricLine, lineIndex: number, active: boolean) => {
    if (!active || lyricWordAnimation !== "auto" || !line.words?.length) return line.text;
    const activeColor = theme === "dark" ? "#ffffff" : "#0f172a";
    const pendingColor = theme === "dark" ? "rgba(255,255,255,0.42)" : "rgba(15,23,42,0.42)";
    const progress = getLyricWordProgress(line, lineIndex) * 100;

    return (
      <span
        className="lyric-word-sweep"
        style={{
          ["--lyric-word-progress" as string]: `${progress}%`,
          ["--lyric-word-active" as string]: activeColor,
          ["--lyric-word-pending" as string]: pendingColor
        }}
      >
        {line.text}
      </span>
    );
  };

  const renderLyricRows = (sizeScale = 1, options: { wideText?: boolean } = {}) => {
    const displayLyrics: LyricLine[] = currentTrack ? currentLyrics : [{ time: 0, text: IDLE_TRACK_INFO.title }];
    const displayActiveLyricIndex = currentTrack ? activeLyricIndex : 0;
    const lyricScrollTopPadding = Math.round(viewportSize.height * (lyricScrollPosition / 100));
    const lyricScrollBottomPadding = Math.round(viewportSize.height * (1 - lyricScrollPosition / 100));
    return (
    <div className="space-y-6" style={{ paddingTop: lyricScrollTopPadding, paddingBottom: lyricScrollBottomPadding }}>
      {!displayLyrics.length && (
        <p className={`pt-12 text-center text-3xl font-black ${theme === "dark" ? "text-white/80" : "text-slate-700"}`}>暂无可用歌词</p>
      )}
      {displayLyrics.map((line, index) => {
        const active = index === displayActiveLyricIndex;
        const browsingLyrics = lyricUserScrolling && !active;
        const distance = Math.abs(index - displayActiveLyricIndex);
        const inactiveClass = theme === "dark"
          ? (browsingLyrics ? "text-white/72 hover:text-white" : lyricFadeEffect ? "text-white/35 hover:text-white/75" : "text-white/68 hover:text-white")
          : (browsingLyrics ? "text-slate-800/82 hover:text-slate-950" : lyricFadeEffect ? "text-slate-700/70 hover:text-slate-900" : "text-slate-800/85 hover:text-slate-950");
        const distantScale = !active && !browsingLyrics && lyricDistantView ? Math.max(0.88, 1 - distance * 0.018) : 1;
        const distantOffset = !active && !browsingLyrics && lyricDistantView ? Math.min(18, distance * 2.2) : 0;
        const activeLayoutScaleRatio = activeLyricSize / Math.max(1, inactiveLyricSize);
        const lyricScaleRatio = active ? activeLayoutScaleRatio : 1;
        const safeTextWidth = options.wideText ? 80 : 78;
        const lyricRowMaxWidth = `${safeTextWidth}%`;
        const rowTransformOrigin = lyricPosition === "right" ? "right center" : lyricPosition === "center" ? "center" : "left center";
        const rowJustifyContent = lyricPosition === "right" ? "flex-end" : lyricPosition === "center" ? "center" : "flex-start";
        const estimatedMainLines = estimateWrappedLineCount(line.text, 22);
        const rowMinHeight = Math.ceil((
          activeLyricSize * 1.15 * estimatedMainLines +
          18
        ) * sizeScale);
        return (
          <button
            key={`${line.time}-${line.text}-${index}`}
            ref={(node) => {
              lyricRowRefs.current[index] = node;
            }}
            onClick={() => seekToLyricLine(line, index)}
            className={`block w-full ${lyricTextAlignClass} transition-[color,opacity,filter,transform] duration-500 ease-out ${active ? (theme === "dark" ? "text-white blur-0" : "text-slate-900 blur-0") : inactiveClass} ${lyricAutoBlur && !active && !browsingLyrics ? "blur-[0.8px]" : ""}`}
            style={{
              fontSize: `${inactiveLyricSize * sizeScale}px`,
              fontWeight: Math.max(500, lyricFontWeight - 100),
              lineHeight: 1.15,
              paddingLeft: lyricPosition === "left" ? `${lyricLeftOffset}%` : undefined,
              paddingRight: lyricPosition === "right" ? `${lyricLeftOffset}%` : undefined,
              display: "flex",
              alignItems: "center",
              justifyContent: rowJustifyContent,
              opacity: active || browsingLyrics || !lyricFadeEffect ? 1 : Math.max(0.26, 1 - distance * 0.12),
              transform: `translateY(${distantOffset}px) scale(${distantScale})`,
              transformOrigin: rowTransformOrigin,
              minHeight: `${rowMinHeight}px`,
              willChange: "opacity, transform, filter",
              backfaceVisibility: "hidden"
            }}
          >
            <span
              className={`inline-block max-w-full rounded-2xl px-4 py-2 transition-[background-color,transform] duration-500 ease-out ${lyricAutoScrolling ? "" : "hover:bg-white/10"}`}
              style={{
                maxWidth: lyricRowMaxWidth,
                boxSizing: "border-box",
                fontWeight: active ? lyricFontWeight : Math.max(500, lyricFontWeight - 100),
                transform: `scale(${lyricScaleRatio})`,
                transformOrigin: rowTransformOrigin,
                overflowWrap: "break-word",
                wordBreak: "break-word",
                willChange: "transform"
              }}
            >
              <p className="whitespace-pre-wrap">
                {renderLyricMainText(line, index, active)}
              </p>
              <AnimatePresence initial={false}>
                {translationEnabled && line.translation && (
                  <motion.p
                    initial={{ height: 0, opacity: 0, marginTop: 0, y: -6, scale: 0.992 }}
                    animate={{ height: "auto", opacity: active ? 0.92 : 0.82, marginTop: 8, y: 0, scale: 1 }}
                    exit={{ height: 0, opacity: 0, marginTop: 0, y: -5, scale: 0.992 }}
                    transition={{
                      height: { duration: 0.28, ease: [0.22, 1, 0.36, 1] },
                      marginTop: { duration: 0.28, ease: [0.22, 1, 0.36, 1] },
                      opacity: { duration: 0.2, ease: "easeOut" },
                      y: { type: "spring", stiffness: 360, damping: 32, mass: 0.65 },
                      scale: { type: "spring", stiffness: 360, damping: 32, mass: 0.65 }
                    }}
                    className={`whitespace-pre-wrap overflow-hidden ${theme === "dark" ? "text-white/60" : "text-slate-600"}`}
                    style={{
                      fontSize: `${inactiveTranslationSize * sizeScale}px`,
                      fontWeight: Math.max(400, lyricFontWeight - 200),
                      lineHeight: 1.28,
                      transformOrigin: rowTransformOrigin,
                      willChange: "height, opacity, transform"
                    }}
                  >
                    {line.translation}
                  </motion.p>
                )}
              </AnimatePresence>
            </span>
          </button>
        );
      })}
    </div>
    );
  };

  const renderTrackListPage = ({
    pageKey,
    title,
    visible,
    total,
    emptyText = "暂无歌曲",
    playlistId,
    extraActions
  }: {
    pageKey: string;
    title: string;
    visible: Track[];
    total: number;
    emptyText?: string;
    playlistId?: string;
    extraActions?: ReactNode;
  }) => {
    const selectedIds = new Set(selectedTrackIds);
    const selectedInList = visible.filter((track) => selectedIds.has(track.id));
    const allVisibleSelected = visible.length > 0 && visible.every((track) => selectedIds.has(track.id));
    const gridClassName = "grid-cols-[18px_64px_1.3fr_1fr_74px_68px]";
    const virtualItems: VirtualTrackItem[] = [];
    visible.forEach((track, index) => {
      const letter = getTrackAlphaLetter(track, sortKey);
      const previousLetter = index > 0 ? getTrackAlphaLetter(visible[index - 1], sortKey) : "";
      if (letter !== previousLetter) {
        virtualItems.push({ type: "alpha", key: `alpha-${pageKey}-${letter}`, letter });
      }
      virtualItems.push({ type: "track", key: track.id, track, index });
    });

    return (
      <motion.section key={pageKey} {...PAGE_ANIMATION} transition={{ duration: 0.22 }}>
        <header className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h1 className="text-4xl font-black">{title}</h1>
            <p className="text-sm text-[var(--dim)]">{visible.length} / {total} 首</p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              onClick={() => applyPlayQueue(visible, "sequential")}
              className={`rounded-lg border px-3 py-1 text-sm ${playMode === "sequential" ? "border-[var(--accent)] text-[var(--accent)]" : "border-[var(--line)]"}`}
            >顺序播放</button>
            <button
              onClick={() => applyPlayQueue(visible, "shuffle")}
              className={`rounded-lg border px-3 py-1 text-sm ${playMode === "shuffle" ? "border-[var(--accent)] text-[var(--accent)]" : "border-[var(--line)]"}`}
            >随机播放</button>
            {extraActions}
            <div className="flex w-[min(320px,34vw)] min-w-[220px] items-center rounded-lg border border-[var(--line)] px-3">
              <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current text-[var(--dim)]"><path d="M10 2a8 8 0 1 0 5.29 14l4.35 4.35 1.41-1.41-4.35-4.35A8 8 0 0 0 10 2zm0 2a6 6 0 1 1 0 12 6 6 0 0 1 0-12z" /></svg>
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜索标题/艺术家/专辑"
                className="h-10 flex-1 bg-transparent px-2 text-sm outline-none"
              />
            </div>
            <div className="relative flex items-center gap-2">
              <button
                type="button"
                aria-label="排序"
                title="排序"
                onClick={(e) => {
                  e.stopPropagation();
                  setSortMenuOpen((prev) => !prev);
                }}
                className={`inline-flex h-10 w-10 items-center justify-center rounded-lg border transition ${sortMenuOpen ? "border-[var(--accent)] text-[var(--accent)]" : "border-[var(--line)] hover:border-[var(--accent)]/55"}`}
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current"><path d="M3 6h11v2H3V6zm0 5h8v2H3v-2zm0 5h5v2H3v-2zm14.59-3.41L20 15V4h2v11l2.41-2.41L26 14l-5 5-5-5z" transform="translate(-2 0)" /></svg>
              </button>
              <button
                type="button"
                aria-label="多选"
                title="多选"
                onClick={() => setMultiSelectEnabled((prev) => !prev)}
                className={`inline-flex h-10 w-10 items-center justify-center rounded-lg border transition ${multiSelectEnabled ? "border-[var(--accent)] text-[var(--accent)]" : "border-[var(--line)] hover:border-[var(--accent)]/55"}`}
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current"><path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm-1.1 14.6-4-4L8.3 11l2.6 2.6 4.8-4.8L17.1 10z" /></svg>
              </button>

              <AnimatePresence>
                {sortMenuOpen && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.96 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.96 }}
                    style={{ transformOrigin: "top right" }}
                    className="absolute right-12 top-12 z-40 w-[300px] overflow-hidden rounded-xl bg-[var(--bg-soft)]/95 p-1 text-sm shadow-2xl backdrop-blur"
                  >
                  {[
                    ["title", "标题", "Alt+1"],
                    ["artist", "艺术家", "Alt+2"],
                    ["album", "专辑", "Alt+3"],
                    ["year", "年份", "Alt+4"],
                    ["duration", "时长", "Alt+5"],
                    ["filePath", "文件路径", "Alt+6"]
                  ].map(([key, label, hotkey]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setSortKey(key as SortKey)}
                      className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left hover:bg-[var(--surface)]"
                    >
                      <span className="flex items-center gap-2">
                        <span className="w-4 text-[var(--accent)]">{sortKey === key ? "✓" : ""}</span>
                        <span>{label}</span>
                      </span>
                      <span className="text-xs text-[var(--dim)]">{hotkey}</span>
                    </button>
                  ))}
                  <div className="my-1 border-t border-[var(--line)]" />
                  {[
                    ["asc", "升序", "Ctrl+↑"],
                    ["desc", "降序", "Ctrl+↓"]
                  ].map(([key, label, hotkey]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setSortDirection(key as "asc" | "desc")}
                      className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left hover:bg-[var(--surface)]"
                    >
                      <span className="flex items-center gap-2">
                        <span className="w-4 text-[var(--accent)]">{sortDirection === key ? "✓" : ""}</span>
                        <span>{label}</span>
                      </span>
                      <span className="text-xs text-[var(--dim)]">{hotkey}</span>
                    </button>
                  ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </header>

        <div className={`mb-1 grid items-center gap-3 px-2 py-1 text-xs text-[var(--dim)] ${gridClassName}`}>
          <div className="flex h-5 w-[18px] items-center justify-center">
            <AnimatePresence initial={false}>
              {multiSelectEnabled && (
                <AnimatedMaterialCheckbox
                  checked={allVisibleSelected}
                  indeterminate={!allVisibleSelected && selectedInList.length > 0}
                  onChange={(checked) => {
                    const visibleIds = visible.map((track) => track.id);
                    setSelectedTrackIds((prev) => checked
                      ? [...prev.filter((id) => !visibleIds.includes(id)), ...visibleIds]
                      : prev.filter((id) => !visibleIds.includes(id)));
                  }}
                />
              )}
            </AnimatePresence>
          </div>
          <p>封面</p><p>歌曲</p><p>专辑</p><p>年份</p><p className="text-right">时长</p>
        </div>
        <VirtualizedTrackRows
          pageKey={pageKey}
          items={virtualItems}
          scrollParentRef={mainScrollRef}
          emptyText={emptyText}
          renderItem={(item) => {
            if (item.type === "alpha") {
              return (
                <div
                  id={`track-alpha-${pageKey}-${item.letter}`}
                  data-alpha-letter={item.letter}
                  onClick={() => setTrackAlphaPickerOpen(true)}
                  className="mb-1 cursor-pointer rounded-lg bg-[var(--bg-soft)]/92 px-3 py-2 text-xl font-black backdrop-blur transition hover:bg-[var(--surface)]"
                >
                  {item.letter}
                </div>
              );
            }
            const { track } = item;
            return (
              <div
                id={`track-row-${track.id}`}
                onDoubleClick={() => playTrackFromSource(track.id, visible)}
                onContextMenu={(e) => openTrackContext(e, track.id, playlistId)}
                className={`grid items-center gap-3 rounded-xl px-2 py-2 transition ${gridClassName} ${track.id === currentTrackId ? "bg-[var(--surface)]" : "hover:bg-[var(--surface)]/75"} ${track.id === locatedTrackId ? "ring-2 ring-[var(--accent)]" : ""}`}
              >
                <div className="flex h-5 w-[18px] items-center justify-center">
                  <AnimatePresence initial={false}>
                    {multiSelectEnabled && (
                      <AnimatedMaterialCheckbox
                        checked={selectedIds.has(track.id)}
                        onChange={() => toggleTrackSelection(track.id)}
                      />
                    )}
                  </AnimatePresence>
                </div>
                {renderCoverInSlot(track.cover, track.album, 56, 56)}
                <div className="min-w-0">
                  <p className="truncate font-semibold">{track.title}</p>
                  {renderArtistLinks(track)}
                </div>
                <button type="button" onClick={(e) => { e.stopPropagation(); navigateAlbum(track.album); }} className="justify-self-start truncate text-sm text-[var(--dim)] hover:text-[var(--accent)]">{track.album}</button>
                <p className="text-sm text-[var(--dim)]">{track.year || "-"}</p>
                <p className="justify-self-end text-sm text-[var(--dim)]">{toTimeText(track.duration)}</p>
              </div>
            );
          }}
        />
      </motion.section>
    );
  };

  const renderFolderNode = (node: FolderNode, depth = 0): ReactNode => (
    <div key={node.path} className="space-y-2">
      <button
        type="button"
        onClick={() => {
          setSelectedFolder(node.path);
          navigateTo("folder-detail");
        }}
        className="grid w-full grid-cols-[32px_minmax(0,1fr)_auto_24px] items-center gap-3 rounded-xl border border-[var(--line)] bg-[var(--surface)]/70 px-4 py-3 text-left hover:bg-[var(--accent-soft)]"
        style={{ marginLeft: `${Math.min(depth * 36, 180)}px`, width: `calc(100% - ${Math.min(depth * 36, 180)}px)` }}
      >
        <LineIcon className="h-5 w-5 text-[var(--dim)]">
          <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
        </LineIcon>
        <div className="min-w-0">
          <p className="truncate font-semibold">{node.name}</p>
          <p className="truncate text-xs text-[var(--dim)]">{node.path}</p>
        </div>
        <p className="text-sm text-[var(--dim)]">{node.count} 首歌曲</p>
        <LineIcon className="h-5 w-5 text-[var(--dim)]">
          <path d="m9 18 6-6-6-6" />
        </LineIcon>
      </button>
      {node.children.map((child) => renderFolderNode(child, depth + 1))}
    </div>
  );

  const renderAboutPage = () => (
    <div className="space-y-5 rounded-xl bg-[var(--surface)]/65 p-5">
      <div>
        <h2 className="text-xl font-bold">关于 Still</h2>
        <p className="mt-1 text-sm text-[var(--dim)]">版本 1.0.0-beta.1</p>
      </div>
      <p className="text-sm leading-6 text-[var(--dim)]">
        Still 是一个本地音乐播放器，支持本地音乐库、播放队列、专辑与艺术家浏览、全屏歌词、桌面歌词、系统托盘、任务栏媒体控制和系统媒体传输控制。
      </p>
      <div className="grid gap-3 text-sm md:grid-cols-2">
        <InfoItem label="作者" value="LRM-COM" />
        <InfoItem label="应用框架" value="Electron + React" />
        <InfoItem label="构建工具" value="Vite + TypeScript" />
        <InfoItem label="界面与动画" value="Tailwind CSS + Framer Motion + Material Web" />
        <InfoItem label="音频元数据" value="music-metadata / jsmediatags" />
        <InfoItem label="应用标识" value="Still" />
      </div>
    </div>
  );

  const renderPage = () => (
    <AnimatePresence mode="wait">
      {view === "songs" && (
        renderTrackListPage({
          pageKey: "songs",
          title: "歌曲",
          visible: visibleTracks,
          total: tracks.length
        })
      )}

      {view === "artists" && (
        <motion.section key="artists" {...PAGE_ANIMATION} transition={{ duration: 0.22 }}>
          <header className="mb-4 flex items-center justify-between">
            <h1 className="text-4xl font-black">艺术家</h1>
            <div className="flex w-[320px] items-center rounded-lg border border-[var(--line)] px-3">
              <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current text-[var(--dim)]"><path d="M10 2a8 8 0 1 0 5.29 14l4.35 4.35 1.41-1.41-4.35-4.35A8 8 0 0 0 10 2zm0 2a6 6 0 1 1 0 12 6 6 0 0 1 0-12z" /></svg>
              <input
                value={artistSearchQuery}
                onChange={(e) => setArtistSearchQuery(e.target.value)}
                placeholder="搜索艺术家"
                className="h-10 flex-1 bg-transparent px-2 text-sm outline-none"
              />
            </div>
          </header>
          <div className="artist-grid grid gap-4">
            {filteredArtists.map((artist) => (
              <button key={artist.name} onClick={() => navigateArtist(artist.name)} className="flex items-center gap-4 rounded-xl bg-[var(--surface)]/70 p-4 text-left hover:bg-[var(--surface)]">
                <span className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-xl bg-[var(--bg-soft)]">
                  <img
                    ref={(node) => rememberCoverAspectRatio(artist.cover, node)}
                    src={artist.cover}
                    alt={artist.name}
                    className="h-full w-full rounded-xl object-contain"
                  />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-2xl font-bold">{artist.name}</p>
                  <p className="text-sm text-[var(--dim)]">{artist.songs.length} 首歌曲 · {artist.albums.length} 张专辑</p>
                </div>
              </button>
            ))}
          </div>
        </motion.section>
      )}

      {view === "artist-detail" && selectedArtistEntity && (
        <motion.section key="artist-detail" {...PAGE_ANIMATION} transition={{ duration: 0.22 }}>
          {selectedArtistLatestSong && (
            <div className="mb-4 max-w-[360px]">
              {renderAlbumCover(selectedArtistLatestSong.cover, selectedArtistEntity.name, 360, 360, "rounded-2xl")}
            </div>
          )}
          <h1 className="text-4xl font-black">{selectedArtistEntity.name}</h1>
          <p className="mt-1 text-[var(--dim)]">{selectedArtistEntity.songs.length} 首歌曲 · {selectedArtistEntity.albums.length} 张专辑</p>

          <div className="mt-6 mb-4 flex items-center justify-between">
            <div className="inline-flex rounded-xl border border-[var(--line)] bg-[var(--bg-soft)] p-1 text-sm">
              <button
                type="button"
                onClick={() => setArtistDetailTab("songs")}
                className={`rounded-lg px-4 py-1.5 ${artistDetailTab === "songs" ? "bg-[var(--surface)] text-[var(--accent)]" : "text-[var(--dim)] hover:text-[var(--text)]"}`}
              >
                歌曲
              </button>
              <button
                type="button"
                onClick={() => setArtistDetailTab("albums")}
                className={`rounded-lg px-4 py-1.5 ${artistDetailTab === "albums" ? "bg-[var(--surface)] text-[var(--accent)]" : "text-[var(--dim)] hover:text-[var(--text)]"}`}
              >
                专辑
              </button>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => applyPlayQueue(selectedArtistSongs, "sequential")}
                className={`rounded-lg border px-3 py-1 text-sm ${playMode === "sequential" ? "border-[var(--accent)] text-[var(--accent)]" : "border-[var(--line)]"}`}
              >
                顺序播放
              </button>
              <button
                onClick={() => applyPlayQueue(selectedArtistSongs, "shuffle")}
                className={`rounded-lg border px-3 py-1 text-sm ${playMode === "shuffle" ? "border-[var(--accent)] text-[var(--accent)]" : "border-[var(--line)]"}`}
              >
                随机播放
              </button>
            </div>
          </div>
          {artistDetailTab === "songs" && (
            <>
              <div className="mb-1 grid grid-cols-[64px_1.4fr_1fr_72px] items-center gap-2 px-2 py-1 text-xs text-[var(--dim)]">
                <p>封面</p>
                <p>歌曲</p>
                <p>专辑</p>
                <p className="text-right">时长</p>
              </div>
              <div className="space-y-1">
                {selectedArtistSongs.map((track) => (
                  <button key={track.id} onDoubleClick={() => playTrackFromSource(track.id, selectedArtistSongs)} onContextMenu={(e) => openTrackContext(e, track.id)} className="grid w-full grid-cols-[64px_1.4fr_1fr_72px] items-center gap-2 rounded-lg px-2 py-2 text-left hover:bg-[var(--surface)]/70">
                    {renderCoverInSlot(track.cover, track.album, 56, 56)}
                    <p>{track.title}</p>
                    <button type="button" onClick={(e) => { e.stopPropagation(); navigateAlbum(track.album); }} className="justify-self-start text-sm text-[var(--dim)] hover:text-[var(--accent)]">
                      {track.album}
                    </button>
                    <p className="justify-self-end text-sm text-[var(--dim)]">{toTimeText(track.duration)}</p>
                  </button>
                ))}
              </div>
            </>
          )}

          {artistDetailTab === "albums" && (
            <div className="album-grid grid gap-5">
              {selectedArtistAlbums.map((album) => (
                <button key={album.name} onClick={() => navigateAlbum(album.name)} className="text-left">
                  {renderAlbumCover(album.cover, album.name, "100%", 260)}
                  <p className="mt-2 font-semibold">{album.name}</p>
                  <p className="text-sm text-[var(--dim)]">{album.year}</p>
                </button>
              ))}
            </div>
          )}
        </motion.section>
      )}

      {view === "albums" && (
        <motion.section key="albums" {...PAGE_ANIMATION} transition={{ duration: 0.22 }}>
          <header className="mb-4 flex items-center justify-between">
            <h1 className="text-4xl font-black">专辑</h1>
            <div className="flex w-[320px] items-center rounded-lg border border-[var(--line)] px-3">
              <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current text-[var(--dim)]"><path d="M10 2a8 8 0 1 0 5.29 14l4.35 4.35 1.41-1.41-4.35-4.35A8 8 0 0 0 10 2zm0 2a6 6 0 1 1 0 12 6 6 0 0 1 0-12z" /></svg>
              <input
                value={albumSearchQuery}
                onChange={(e) => setAlbumSearchQuery(e.target.value)}
                placeholder="搜索专辑 / 艺术家"
                className="h-10 flex-1 bg-transparent px-2 text-sm outline-none"
              />
            </div>
          </header>
          <div className="album-grid grid gap-5">
            {filteredAlbums.map((album) => (
              <button key={album.name} onClick={() => navigateAlbum(album.name)} className="text-left">
                {renderAlbumCover(album.cover, album.name, "100%", 260)}
                <p className="mt-2 font-semibold">{album.name}</p>
                <p className="text-sm text-[var(--dim)]">{album.year} · {album.songs.length} 首</p>
              </button>
            ))}
          </div>
        </motion.section>
      )}

      {view === "album-detail" && selectedAlbumEntity && (
        <motion.section key="album-detail" {...PAGE_ANIMATION} transition={{ duration: 0.22 }}>
          <div className="mb-6 flex gap-5">
            <div className="w-[min(360px,38vw)] shrink-0">
              {renderAlbumCover(selectedAlbumEntity.cover, selectedAlbumEntity.name, 360, 360)}
            </div>
            <div>
              <h1 className="text-4xl font-black">{selectedAlbumEntity.name}</h1>
              <p className="mt-2 text-[var(--dim)]">年份 {selectedAlbumEntity.year}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {selectedAlbumEntity.artists.map((artist) => (
                  <button key={artist} onClick={() => navigateArtist(artist)} className="rounded-full bg-[var(--surface)] px-3 py-1 text-sm hover:text-[var(--accent)]">
                    {artist}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="mb-2 flex items-center justify-between">
            <p className="text-xl font-bold">曲目</p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => applyPlayQueue(selectedAlbumSongs, "sequential")}
                className={`rounded-lg border px-3 py-1 text-sm ${playMode === "sequential" ? "border-[var(--accent)] text-[var(--accent)]" : "border-[var(--line)]"}`}
              >
                顺序播放
              </button>
              <button
                onClick={() => applyPlayQueue(selectedAlbumSongs, "shuffle")}
                className={`rounded-lg border px-3 py-1 text-sm ${playMode === "shuffle" ? "border-[var(--accent)] text-[var(--accent)]" : "border-[var(--line)]"}`}
              >
                随机播放
              </button>
            </div>
          </div>

          <div className="mb-1 grid grid-cols-[48px_1fr_1fr_68px] gap-2 px-2 py-1 text-xs text-[var(--dim)]">
            <p>音轨</p>
            <p>歌曲</p>
            <p>艺术家</p>
            <p className="text-right">时长</p>
          </div>
          <div className="space-y-1">
            {selectedAlbumSongs.map((track) => (
                <button key={track.id} onDoubleClick={() => playTrackFromSource(track.id, selectedAlbumSongs)} onContextMenu={(e) => openTrackContext(e, track.id)} className="grid w-full grid-cols-[48px_1fr_1fr_68px] gap-2 rounded-lg px-2 py-2 text-left hover:bg-[var(--surface)]/75">
                  <p className="text-[var(--dim)]">{String(track.trackNo).padStart(2, "0")}</p>
                  <p>{track.title}</p>
                  <div className="justify-self-start">{renderArtistLinks(track)}</div>
                  <p className="justify-self-end text-sm text-[var(--dim)]">{toTimeText(track.duration)}</p>
                </button>
              ))}
          </div>
        </motion.section>
      )}

      {view === "folders" && (
        <motion.section key="folders" {...PAGE_ANIMATION} transition={{ duration: 0.22 }}>
          <h1 className="mb-5 text-4xl font-black">文件夹</h1>
          <div className="space-y-2">
            {folderTree.map((node) => renderFolderNode(node))}
            {!folderTree.length && <p className="rounded-xl border border-dashed border-[var(--line)] px-4 py-8 text-center text-sm text-[var(--dim)]">暂无文件夹</p>}
          </div>
        </motion.section>
      )}

      {view === "folder-detail" && (
        renderTrackListPage({
          pageKey: "folder-detail",
          title: selectedFolder.split("/").at(-1) || "文件夹",
          visible: visibleFolderTracks,
          total: selectedFolderTracks.length,
          emptyText: "该文件夹没有歌曲"
        })
      )}

      {view === "playlists" && (
        <motion.section key="playlists" {...PAGE_ANIMATION} transition={{ duration: 0.22 }}>
          <header className="mb-4 flex items-center justify-between">
            <h1 className="text-4xl font-black">歌单</h1>
            <IconButton label="新建歌单" onClick={createPlaylist} className="border border-[var(--line)] text-[var(--accent)]">
              <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current"><path d="M19 11h-6V5h-2v6H5v2h6v6h2v-6h6z" /></svg>
            </IconButton>
          </header>

          <div className="artist-grid grid gap-4">
            {playlists.map((playlist) => (
              <button
                key={playlist.id}
                type="button"
                onContextMenu={(e) => openPlaylistContext(e, playlist.id)}
                onClick={() => {
                  setSelectedPlaylistId(playlist.id);
                  navigateTo("playlist-detail");
                }}
                className="rounded-xl bg-[var(--surface)]/70 p-4 text-left hover:bg-[var(--surface)]"
              >
                <img
                  src={tracks.find((track) => track.id === playlist.trackIds[playlist.trackIds.length - 1])?.cover || makeCover(["#3d4d73", "#6a76a0"], playlist.name.slice(0, 1))}
                  alt={playlist.name}
                  className="mb-3 h-28 w-28 rounded-lg object-cover"
                />
                <p className="text-xl font-bold">{playlist.name}</p>
                <p className="text-sm text-[var(--dim)]">{playlist.trackIds.length} 首歌曲</p>
              </button>
            ))}
            {!playlists.length && <p className="col-span-3 text-sm text-[var(--dim)]">暂无歌单</p>}
          </div>
        </motion.section>
      )}

      {view === "playlist-detail" && selectedPlaylist && (
        renderTrackListPage({
          pageKey: "playlist-detail",
          title: selectedPlaylist.name,
          visible: visiblePlaylistTracks,
          total: selectedPlaylistTracks.length,
          emptyText: "该歌单没有歌曲",
          playlistId: selectedPlaylist.id,
          extraActions: (
            <button
              onClick={() => {
                if (!currentTrack) return;
                setPlaylists((prev) => prev.map((item) => (item.id === selectedPlaylist.id && !item.trackIds.includes(currentTrack.id)
                  ? { ...item, trackIds: [...item.trackIds, currentTrack.id] }
                  : item)));
              }}
              className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-sm text-[var(--accent)]"
            >
              添加当前歌曲
            </button>
          )
        })
      )}

      {view === "library" && (
        <motion.section key="library" {...PAGE_ANIMATION} transition={{ duration: 0.22 }}>
          <h1 className="mb-6 text-4xl font-black">音乐库</h1>
          <div
            onDragEnter={(event) => {
              event.preventDefault();
              setLibraryDragActive(true);
            }}
            onDragOver={(event) => {
              event.preventDefault();
              setLibraryDragActive(true);
            }}
            onDragLeave={(event) => {
              if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
              setLibraryDragActive(false);
            }}
            onDrop={importDroppedItems}
            className={`mb-4 rounded-xl border border-dashed p-10 text-center transition ${libraryDragActive ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-strong)]" : "border-[var(--line)] text-[var(--dim)]"}`}
          >
            拖放文件或文件夹到此处可自动识别
          </div>
          <div className="mb-4 rounded-xl bg-[var(--surface)]/65 p-4">
            <div className="grid grid-cols-5 gap-4 text-sm">
              <p>歌曲<br /><span className="text-2xl font-bold text-[var(--text)]">{libraryStats.songs}</span></p>
              <p>艺术家<br /><span className="text-2xl font-bold text-[var(--text)]">{libraryStats.artists}</span></p>
              <p>专辑<br /><span className="text-2xl font-bold text-[var(--text)]">{libraryStats.albums}</span></p>
              <p>文件夹<br /><span className="text-2xl font-bold text-[var(--text)]">{libraryStats.folders}</span></p>
              <p>总时长<br /><span className="text-2xl font-bold text-[var(--text)]">{toTimeText(libraryStats.duration)}</span></p>
            </div>
            <button
              type="button"
              disabled={libraryRefreshing}
              onClick={refreshMusicLibrary}
              className="mt-4 text-sm text-[var(--accent)] disabled:cursor-wait disabled:opacity-55"
            >
              {libraryRefreshing ? "正在刷新..." : "刷新音乐库"}
            </button>
          </div>
          <div className="space-y-3">
            <button className="w-full rounded-xl bg-[var(--surface)]/65 px-4 py-3 text-left">自定义文件夹</button>
            {unreadableTracks.length > 0 && (
              <button
                type="button"
                onClick={() => setMissingPromptTrackId(unreadableTracks[0].id)}
                className="flex w-full items-center justify-between rounded-xl bg-[var(--surface)]/65 px-4 py-3 text-left hover:bg-[var(--surface)]"
              >
                <span>存在无法读取的音轨</span>
                <span className="text-[var(--dim)]">{unreadableTracks.length}</span>
              </button>
            )}
            <label className="flex items-center justify-between rounded-xl bg-[var(--surface)]/65 px-4 py-3 text-left">
              <span>在标题栏显示无法读取音轨警告</span>
              <MaterialCheckbox checked={warnOnMetaMissing} onChange={() => setWarnOnMetaMissing((prev) => !prev)} />
            </label>
          </div>
        </motion.section>
      )}

      {view === "settings" && (
        <motion.section key="settings" {...PAGE_ANIMATION} transition={{ duration: 0.22 }}>
          <h1 className="mb-6 text-4xl font-black">设置</h1>
          <div className="grid grid-cols-[180px_1fr] gap-4">
            <div className="rounded-xl bg-[var(--surface)]/60 p-2">
              {[
                ["personal", "个性化"],
                ["lyrics", "歌词设置"],
                ["about", "关于"]
              ].map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSettingsTab(key as "personal" | "lyrics" | "about")}
                  className={`mb-1 w-full rounded-lg px-3 py-2 text-left text-sm ${settingsTab === key ? "accent-soft-action" : "hover:bg-[var(--surface)]"}`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="space-y-4">
              {settingsTab === "personal" && (
                <div className="space-y-4">
                  <h2 className="text-xl font-bold">个性化</h2>
                  <label className="flex items-center justify-between rounded-xl bg-[var(--surface)]/65 px-4 py-3">
                    <span>主题模式</span>
                    <IconButton
                      label="切换主题"
                      onClick={() => setTheme((prev) => (prev === "dark" ? "light" : "dark"))}
                      className="h-9 w-9 border border-[var(--line)]"
                    >
                      {theme === "dark"
                        ? <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current"><path d="M12 4a1 1 0 0 0 1-1V1h-2v2a1 1 0 0 0 1 1zm0 16a1 1 0 0 0-1 1v2h2v-2a1 1 0 0 0-1-1zm8-8a1 1 0 0 0 1 1h2v-2h-2a1 1 0 0 0-1 1zM1 13h2a1 1 0 0 0 0-2H1v2zm16.95-5.54 1.42-1.41-1.42-1.42-1.41 1.42 1.41 1.41zM4.63 19.37l1.42 1.42 1.41-1.42-1.41-1.41-1.42 1.41zM19.37 19.37l-1.42-1.41-1.41 1.41 1.41 1.42 1.42-1.42zM4.63 4.63 3.21 6.05l1.42 1.41 1.42-1.41-1.42-1.42zM12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10z" /></svg>
                        : <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current"><path d="M20.6 14.8A8.5 8.5 0 0 1 9.2 3.4 9.5 9.5 0 1 0 20.6 14.8z" /></svg>}
                    </IconButton>
                  </label>
                  <div className="rounded-xl bg-[var(--surface)]/65 px-4 py-3">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <p>主题强调色</p>
                      <div className="flex rounded-lg border border-[var(--line)] p-1 text-sm">
                        {[
                          ["manual", "手动"],
                          ["cover", "跟随封面"]
                        ].map(([mode, label]) => (
                          <button
                            key={mode}
                            type="button"
                            onClick={() => setAccentMode(mode as AccentMode)}
                            className={`rounded-md px-3 py-1 ${accentMode === mode ? "accent-soft-action" : "text-[var(--dim)] hover:text-[var(--text)]"}`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <ColorField
                        value={accentColor}
                        onChange={setAccentColor}
                        disabled={accentMode === "cover"}
                      />
                      <div className="h-7 w-7 rounded-full border border-[var(--line)]" style={{ backgroundColor: effectiveAccentColor }} />
                      <span className="text-sm text-[var(--dim)]">{effectiveAccentColor}</span>
                    </div>
                  </div>
                </div>
              )}

              {settingsTab === "lyrics" && (
                <div className="space-y-4">
                  <h2 className="text-xl font-bold">歌词设置</h2>
                  <p className="text-xs text-[var(--dim)]">全屏歌词</p>
                  {renderLyricStylePreview()}

                  {renderSettingsRow(
                    "自适应歌词大小",
                    "根据窗口高度自动缩放，避免全屏过小或窗口过大",
                    <ToggleSwitch checked={lyricAutoScale} onChange={() => setLyricAutoScale((prev) => !prev)} />
                  )}
                  {renderSettingsRow("歌词字体大小", "作为基准大小（以 1080p 高度为准）", (
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => setLyricFontSize(60)} className="shrink-0 rounded-lg bg-[var(--surface)] px-3 py-2 text-sm">恢复默认</button>
                      <NumberControl value={lyricFontSize} setValue={setLyricFontSize} min={32} max={96} suffix="px" />
                    </div>
                  ))}
                  {renderSettingsRow("翻译歌词大小", "翻译行显示字号", (
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => setLyricTranslationFontSize(36)} className="shrink-0 rounded-lg bg-[var(--surface)] px-3 py-2 text-sm">恢复默认</button>
                      <NumberControl value={lyricTranslationFontSize} setValue={setLyricTranslationFontSize} min={18} max={72} suffix="px" />
                    </div>
                  ))}
                  {renderSettingsRow("歌词字重设置", "设置歌词显示的字重", <NumberControl value={lyricFontWeight} setValue={setLyricFontWeight} min={300} max={900} step={50} />)}
                  {renderSettingsRow("歌词位置", "歌词的默认水平位置", (
                    <MenuSelect
                      value={lyricPosition}
                      onChange={setLyricPosition}
                      className="w-48"
                      options={[
                        { value: "left", label: "居左" },
                        { value: "center", label: "居中" },
                        { value: "right", label: "居右" }
                      ]}
                    />
                  ))}
                  {renderSettingsRow("歌词左侧边距", "调整全屏模式下歌词的起始位置", (
                    <div className="w-72">
                      <MaterialSlider min={0} max={36} value={lyricLeftOffset} onChange={setLyricLeftOffset} valueLabel={`${lyricLeftOffset}%`} />
                      <p className="text-xs text-[var(--dim)]">{lyricLeftOffset === 0 ? "默认" : `${lyricLeftOffset}%`}</p>
                    </div>
                  ))}
                  {renderSettingsRow("歌词滚动位置", "歌词高亮时在屏幕中的垂直位置", (
                    <div className="w-72">
                      <MaterialSlider min={8} max={78} value={lyricScrollPosition} onChange={setLyricScrollPosition} valueLabel={`${lyricScrollPosition}%`} />
                      <div className="flex justify-between text-xs text-[var(--dim)]"><span>靠上</span><span>靠下</span></div>
                    </div>
                  ))}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between gap-4 rounded-xl bg-[var(--surface)]/45 px-4 py-4">
                      <div className="min-w-0">
                        <p className="font-semibold">逐字高亮</p>
                        <p className="mt-1 text-sm text-[var(--dim)]">增强歌词存在逐字时间时，按播放进度高亮当前行文字</p>
                      </div>
                      <MenuSelect
                        value={lyricWordAnimation}
                        onChange={setLyricWordAnimation}
                        className="w-32 shrink-0"
                        options={[
                          { value: "auto", label: "自动" },
                          { value: "off", label: "关闭" }
                        ]}
                      />
                    </div>
                    {renderLyricEffectRow(
                      <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current"><path d="M4 4h16v16H4V4zm2 2v12h12V6H6zm2 2h8v2H8V8zm0 4h8v2H8v-2z" /></svg>,
                      "模糊效果",
                      "对非当前行启用轻微模糊",
                      lyricAutoBlur,
                      () => setLyricAutoBlur((prev) => !prev)
                    )}
                    {renderLyricEffectRow(
                      <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current"><path d="M4 5h16v3H4V5zm3 6h10v3H7v-3zm3 6h4v3h-4v-3z" /></svg>,
                      "淡出效果",
                      "让非当前行按距离逐渐淡出",
                      lyricFadeEffect,
                      () => setLyricFadeEffect((prev) => !prev)
                    )}
                    {renderLyricEffectRow(
                      <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current"><path d="M12 3 3 8l9 5 9-5-9-5zm-7 8.5 7 3.9 7-3.9V15l-7 4-7-4v-3.5z" /></svg>,
                      "远离视野",
                      "使非当前行按距离轻微缩小并后退",
                      lyricDistantView,
                      () => setLyricDistantView((prev) => !prev)
                    )}
                  </div>

                  {renderSettingsRow(
                    "默认显示翻译",
                    "进入全屏歌词时优先显示已匹配的翻译行；没有翻译时自动只显示原文",
                    <ToggleSwitch checked={translationPreference} onChange={toggleTranslationEnabled} />
                  )}
                  <p id="desktop-lyric-settings" className="scroll-mt-6 text-xs text-[var(--dim)]">桌面歌词</p>
                  {renderSettingsRow("默认开启桌面歌词", "启动后自动显示独立桌面歌词窗口，可从托盘或歌词界面随时开关", (
                    <ToggleSwitch checked={desktopLyricOpen} onChange={() => setDesktopLyricOpen((prev) => !prev)} />
                  ))}
                  {renderSettingsRow("锁定桌面歌词位置", "锁定后不响应拖动和调整，避免播放时误触或遮挡内容", (
                    <ToggleSwitch checked={desktopLyricLocked} onChange={() => setDesktopLyricLocked((prev) => !prev)} />
                  ))}
                  {renderSettingsRow("双行歌词", "同时显示当前句和下一句；开启翻译时第二行可显示译文", (
                    <ToggleSwitch checked={desktopLyricDoubleLine} onChange={() => setDesktopLyricDoubleLine((prev) => !prev)} />
                  ))}
                  {renderSettingsRow("显示翻译", "歌曲带翻译歌词时第二行显示译文；关闭后双行模式显示下一句原文", (
                    <ToggleSwitch checked={desktopLyricShowTranslation} onChange={() => setDesktopLyricShowTranslation((prev) => !prev)} />
                  ))}
                  {renderSettingsRow("显示逐字歌词", "歌词包含逐字时间轴时，按播放进度填充文字高亮", (
                    <MenuSelect
                      value={desktopLyricWordByWord}
                      onChange={setDesktopLyricWordByWord}
                      className="w-40"
                      options={[
                        { value: "auto", label: "自动" },
                        { value: "off", label: "关闭" }
                      ]}
                    />
                  ))}
                  {renderSettingsRow("歌词切换动画", "换行时使用滑入滑出过渡；关闭后直接切换文本", (
                    <ToggleSwitch checked={desktopLyricSwitchAnimation} onChange={() => setDesktopLyricSwitchAnimation((prev) => !prev)} />
                  ))}
                  {renderSettingsRow("桌面歌词字重", "设置桌面歌词主行文字字重", (
                    <NumberControl value={desktopLyricFontWeight} setValue={setDesktopLyricFontWeight} min={300} max={900} step={50} />
                  ))}
                  {renderSettingsRow("桌面歌词文字大小", "设置桌面歌词主行文字字号", (
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => setDesktopLyricFontSize(30)} className="rounded-lg bg-[var(--surface)] px-3 py-2 text-sm">恢复默认</button>
                      <NumberControl value={desktopLyricFontSize} setValue={setDesktopLyricFontSize} min={20} max={72} suffix="px" />
                    </div>
                  ))}
                  {renderSettingsRow("桌面歌词第二行大小", "设置翻译或下一句的字号", (
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => setDesktopLyricSecondLineSize(24)} className="rounded-lg bg-[var(--surface)] px-3 py-2 text-sm">恢复默认</button>
                      <NumberControl value={desktopLyricSecondLineSize} setValue={setDesktopLyricSecondLineSize} min={12} max={64} suffix="px" />
                    </div>
                  ))}
                  {renderSettingsRow("桌面歌词已播放文字", "桌面歌词已播放文字颜色", (
                    <ColorField value={desktopLyricPlayedColor} onChange={setDesktopLyricPlayedColor} />
                  ))}
                  {renderSettingsRow("桌面歌词未播放文字", "桌面歌词未播放文字颜色", (
                    <ColorField value={desktopLyricPendingColor} onChange={setDesktopLyricPendingColor} />
                  ))}
                  {renderSettingsRow("桌面歌词描边色", "使用 RGBA；A 表示不透明度", (
                    <div className="flex w-auto flex-nowrap items-center justify-end gap-3 whitespace-nowrap">
                      <button type="button" onClick={() => setDesktopLyricStrokeColor("rgba(0, 0, 0, 0.69)")} className="rounded-lg bg-[var(--surface)] px-3 py-2 text-sm">恢复默认</button>
                      <ColorField
                        value={desktopLyricStrokeColor}
                        onChange={setDesktopLyricStrokeColor}
                        alpha
                        className="w-80"
                      />
                    </div>
                  ))}
                </div>
              )}

              {settingsTab === "about" && renderAboutPage()}
              {false && (
                <div className="space-y-4 rounded-xl bg-[var(--surface)]/65 p-5">
                  <h2 className="text-xl font-bold">关于</h2>
                  <p>Still 1.0.0-beta.1</p>
                  <p className="text-sm text-[var(--dim)]">本地音乐播放器，Material 风格界面，支持歌词、多模式全屏、桌面歌词与播放队列。</p>
                  <p className="text-sm text-[var(--dim)]">技术栈：React + Vite + Tailwind CSS + Framer Motion</p>
                </div>
              )}
            </div>
          </div>
        </motion.section>
      )}

      {view === "track-info" && trackInfo && (
        <motion.section key="track-info" {...PAGE_ANIMATION} transition={{ duration: 0.22 }}>
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <h1 className="text-4xl font-black">音轨信息</h1>
              <p className="mt-1 text-sm text-[var(--dim)]">查看音乐库记录、文件属性与音频编码信息</p>
            </div>
            {trackInfo.localPath && (
              <button
                type="button"
                onClick={() => void refreshTrackInfoFromFile(trackInfo.id)}
                className="inline-flex items-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--surface)]/65 px-4 py-2 text-sm font-semibold text-[var(--accent)] hover:border-[var(--accent)]"
              >
                <LineIcon className="h-4 w-4"><path d="M21 12a9 9 0 0 1-15.5 6.2" /><path d="M3 12a9 9 0 0 1 15.5-6.2" /><path d="M3 4v5h5" /><path d="M21 20v-5h-5" /></LineIcon>
                从文件重新读取
              </button>
            )}
          </div>

          <div className="mb-5 grid grid-cols-[96px_1fr_auto] items-center gap-5 rounded-2xl bg-[var(--surface)]/70 p-4">
            <img src={trackInfo.cover} alt={trackInfo.album} className="h-24 w-24 rounded-xl object-cover shadow-lg" />
            <div className="min-w-0">
              <p className="truncate text-3xl font-black">{trackInfo.title}</p>
              <div className="mt-2">{renderArtistLinks(trackInfo, "text-base font-semibold text-[var(--dim)] hover:text-[var(--accent)]")}</div>
              <p className="mt-1 truncate text-sm text-[var(--dim)]">{trackInfo.album || "Unknown Album"}</p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-black">{toTimeText(trackInfo.duration)}</p>
              <p className="mt-1 text-xs text-[var(--dim)]">{trackInfo.extension || getExt(trackInfo.filePath).replace(".", "").toUpperCase() || "AUDIO"}</p>
            </div>
          </div>

          <div className="grid gap-4 text-sm xl:grid-cols-2">
            <InfoCard title="音乐库">
              <div className="grid gap-4 md:grid-cols-2">
                <InfoItem label="标题" value={trackInfo.title} />
                <InfoItem label="艺术家" value={renderArtistLinks(trackInfo, "font-semibold hover:text-[var(--accent)]")} />
                <InfoItem label="专辑" value={trackInfo.album} />
                <InfoItem label="年份" value={trackInfo.year || "-"} />
                <InfoItem label="音轨号" value={trackInfo.trackNo || "-"} />
                <InfoItem label="时长" value={formatDurationDetail(trackInfo.duration)} />
              </div>
            </InfoCard>

            <InfoCard title="音频">
              <div className="grid gap-4 md:grid-cols-2">
                <InfoItem label="容器" value={trackInfo.container || trackInfo.extension || "-"} />
                <InfoItem label="编码" value={trackInfo.codec || "-"} />
                <InfoItem label="码率" value={formatBitrate(trackInfo.bitrate)} />
                <InfoItem label="采样率" value={formatSampleRate(trackInfo.sampleRate)} />
                <InfoItem label="位深" value={trackInfo.bitsPerSample ? `${trackInfo.bitsPerSample} bit` : "-"} />
                <InfoItem label="声道" value={formatChannels(trackInfo.channels)} />
                <InfoItem label="无损" value={trackInfo.lossless === undefined ? "-" : trackInfo.lossless ? "是" : "否"} />
                <InfoItem label="标签类型" value={trackInfo.tagTypes?.join(" / ") || "-"} />
              </div>
            </InfoCard>

            <InfoCard title="文件" className="xl:col-span-2">
              <div className="grid gap-4 md:grid-cols-2">
                <InfoItem label="路径" value={trackInfo.filePath} mono wide />
                <InfoItem label="文件夹" value={trackInfo.folder || "-"} mono />
                <InfoItem label="大小" value={formatBytes(trackInfo.fileSize)} />
                <InfoItem label="修改时间" value={formatDateTime(trackInfo.modifiedAt)} />
                <InfoItem label="创建时间" value={formatDateTime(trackInfo.createdAt)} />
                <div className="flex items-end justify-start">
                  <button
                    type="button"
                    onClick={() => navigator.clipboard?.writeText(trackInfo.filePath)}
                    className="rounded-lg border border-[var(--line)] px-3 py-2 text-sm hover:border-[var(--accent)] hover:text-[var(--accent)]"
                  >
                    复制文件地址
                  </button>
                </div>
              </div>
            </InfoCard>

            <InfoCard title="歌词" className="xl:col-span-2">
              <div className="grid gap-4 md:grid-cols-4">
                <InfoItem label="歌词源数量" value={trackInfo.lyricSources.length || "-"} />
                <InfoItem label="当前歌词源" value={getLyricSourceLabel(trackInfoLyricSource) || "-"} />
                <InfoItem label="类型" value={trackInfoLyricSource?.kind === "embedded" ? "内嵌歌词" : trackInfoLyricSource?.kind === "local" ? "本地歌词" : "-"} />
                <InfoItem label="行数" value={trackInfoLyricSource?.lines.length || "-"} />
                <InfoItem label="含翻译" value={trackInfoLyricSource?.lines.some((line) => line.translation) ? "是" : "否"} />
                <InfoItem label="含逐字" value={trackInfoLyricSource?.lines.some((line) => line.words?.length) ? "是" : "否"} />
              </div>
            </InfoCard>
          </div>
        </motion.section>
      )}
    </AnimatePresence>
  );

  return (
    <LayoutGroup>
      <div style={themeVars} className="relative h-screen w-screen overflow-hidden bg-[var(--bg)] text-[var(--text)]">
        <audio ref={audioRef} />

        <header
          className="fixed left-0 right-0 top-0 z-[70] flex h-10 items-center justify-between border-b border-[var(--line)] bg-[var(--bg-soft)]/92 px-4 backdrop-blur-lg"
          style={{ WebkitAppRegion: "drag" } as any}
        >
          <div className="flex items-center gap-3" style={{ WebkitAppRegion: "no-drag" } as any}>
            <img src={theme === "dark" ? stillLogoBlack : stillLogoWhite} alt="Still" className="h-7 w-7 rounded-md object-contain" />
            <p className="text-[24px] font-black leading-none tracking-tight">Still <span className="text-sm font-semibold text-[var(--dim)]">1.0.0-beta.1</span></p>
            {warnOnMetaMissing && view === "songs" && unreadableTracks.length > 0 && (
              <button
                type="button"
                onClick={() => navigateTo("library")}
                className="inline-flex items-center gap-2 rounded-lg border border-amber-300/35 bg-amber-500/15 px-3 py-1.5 text-sm font-semibold text-amber-200"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current"><path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z" /></svg>
                {unreadableTracks.length} 首无法读取
              </button>
            )}
            {canNavigateBack && (
              <IconButton label="返回上一页" onClick={navigateBack} className="h-8 w-8 border border-[var(--line)]">
                <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current"><path d="M11 5 4 12l7 7 1.4-1.4L7.8 13H20v-2H7.8l4.6-4.6L11 5z" /></svg>
              </IconButton>
            )}
          </div>

          <div className="absolute right-0 top-0 flex items-start text-[var(--dim)]" style={{ WebkitAppRegion: "no-drag" } as any}>
            <button
              type="button"
              title={isFullscreen ? "退出全屏" : "全屏"}
              onClick={toggleFullscreen}
              className="grid h-10 w-[46px] place-items-center hover:bg-[var(--surface)]"
            >
              {isFullscreen
                ? <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current"><path d="M9 3h2v8H3V9h6V3zm6 0v6h6v2h-8V3h2zM3 13h8v8H9v-6H3v-2zm18 0v2h-6v6h-2v-8h8z" /></svg>
                : <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current"><path d="M5 5h6v2H7v4H5V5zm8 0h6v6h-2V7h-4V5zM5 13h2v4h4v2H5v-6zm12 4v-4h2v6h-6v-2h4z" /></svg>}
            </button>
            <button
              type="button"
              title="最小化"
              onClick={() => callWindowControl("minimize")}
              className="grid h-10 w-[46px] place-items-center hover:bg-[var(--surface)]"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current"><path d="M5 11h14v2H5z" /></svg>
            </button>
            <button
              type="button"
              title={isWindowMaximized ? "还原" : "最大化"}
              onClick={() => {
                if (isWindowMaximized) {
                  callWindowControl("restore");
                } else {
                  callWindowControl("maximize");
                }
              }}
              className="grid h-10 w-[46px] place-items-center hover:bg-[var(--surface)]"
            >
              {isWindowMaximized
                ? <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current"><path d="M7 7h10v10H7V7zm-2 2H3V3h6v2H5v4zm10-6h6v6h-2V5h-4V3zM3 15h2v4h4v2H3v-6zm16 4v-4h2v6h-6v-2h4z" /></svg>
                : <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current"><path d="M5 5h14v14H5V5zm2 2v10h10V7H7z" /></svg>}
            </button>
            <button
              type="button"
              title="关闭"
              onClick={() => {
                callWindowControl("close");
                window.close();
              }}
              className="grid h-10 w-[46px] place-items-center hover:bg-[#c42b1c] hover:text-white"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current"><path d="m18.3 5.7-1-1L12 10l-5.3-5.3-1 1L11 11l-5.3 5.3 1 1L12 12l5.3 5.3 1-1L13 11z" /></svg>
            </button>
          </div>
        </header>

        <div className="flex h-[calc(100%-40px)] pt-10">
          <aside className="w-64 border-r border-[var(--line)] bg-[var(--bg-soft)]/95 p-4">
            <nav className="space-y-1 text-sm">
              {navItems.map((item) => (
                <button
                  key={item.key}
                  onClick={() => navigateTo(item.key)}
                  className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left ${(view === item.key || (item.key === "playlists" && view === "playlist-detail")) ? "bg-[var(--surface)]" : "hover:bg-[var(--surface)]/70"}`}
                >
                  <span className="text-[var(--dim)]">{item.icon}</span>
                  <span>{item.label}</span>
                </button>
              ))}
            </nav>

            <input ref={fileInputRef} type="file" multiple className="hidden" onChange={importFolder} {...folderInputAttrs} />

            <div className="mt-4">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs text-[var(--dim)]">我的歌单</p>
                <IconButton label="新建歌单" onClick={createPlaylist} className="h-7 w-7 border border-[var(--line)]">
                  <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current"><path d="M19 11h-6V5h-2v6H5v2h6v6h2v-6h6z" /></svg>
                </IconButton>
              </div>
              <div className="space-y-1">
                {playlists.map((playlist) => (
                  <button
                    key={playlist.id}
                    onContextMenu={(e) => openPlaylistContext(e, playlist.id)}
                    onClick={() => { setSelectedPlaylistId(playlist.id); navigateTo("playlist-detail"); }}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1 text-left hover:bg-[var(--surface)]/70"
                  >
                    <img
                      src={tracks.find((track) => track.id === playlist.trackIds[playlist.trackIds.length - 1])?.cover || makeCover(["#3d4d73", "#6a76a0"], playlist.name.slice(0, 1))}
                      alt={playlist.name}
                      className="h-8 w-8 rounded object-cover"
                    />
                    <span className="truncate">{playlist.name}</span>
                  </button>
                ))}
              </div>
            </div>
          </aside>

          <main
            ref={mainScrollRef}
            onScroll={handleMainScroll}
            onPointerMove={handleMainPointerMove}
            onPointerDown={handleMainPointerDown}
            onPointerUp={endScrollbarDrag}
            onPointerCancel={endScrollbarDrag}
            onPointerLeave={endScrollbarDrag}
            className="app-main-scroll flex-1 overflow-y-auto px-7 pb-[112px] pt-6"
          >
            {renderPage()}
          </main>
        </div>

        {currentTrackInCurrentPageIndex >= 0 && (
          <IconButton
            label="定位当前歌曲"
            onClick={locateCurrentTrackInList}
            className="fixed bottom-[104px] right-7 z-[72] h-11 w-11 border border-[var(--line)] bg-[var(--bg-soft)]/95 shadow-xl backdrop-blur"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current"><path d="M12 2a10 10 0 0 0-1 19.95V18h2v3.95A10 10 0 0 0 12 2zm0 2a8 8 0 0 1 1 15.94V16h-2v3.94A8 8 0 0 1 12 4zm0 4a4 4 0 1 0 4 4 4 4 0 0 0-4-4zm0 2a2 2 0 1 1-2 2 2 2 0 0 1 2-2z" /></svg>
          </IconButton>
        )}

        <AnimatePresence>
          {trackAlphaBubble.visible && availableAlphaLetters.length > 0 && !lyricsOpen && (
            <motion.div
              initial={{ opacity: 0, scale: 0.88 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.88 }}
              transition={{ duration: 0.14 }}
              className="pointer-events-none fixed z-[91] grid h-14 w-14 place-items-center rounded-full bg-[var(--surface)]/95 text-2xl font-black shadow-2xl backdrop-blur"
              style={{
                left: Math.max(12, trackAlphaBubble.x - 28),
                top: Math.max(12, Math.min(window.innerHeight - 68, trackAlphaBubble.y - 28))
              }}
            >
              {trackAlphaBubble.letter}
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {trackAlphaPickerOpen && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[120] grid place-items-center bg-black/36 p-6 backdrop-blur-sm"
              onClick={() => setTrackAlphaPickerOpen(false)}
            >
              <motion.div
                initial={{ opacity: 0, y: 16, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 16, scale: 0.98 }}
                transition={{ duration: 0.18 }}
                onClick={(e) => e.stopPropagation()}
                className="w-[min(720px,92vw)] rounded-2xl bg-[var(--bg-soft)]/92 p-8 shadow-2xl backdrop-blur"
              >
                <div className="grid grid-cols-7 gap-3 sm:grid-cols-9">
                  {TRACK_ALPHA_LETTERS.map((letter) => {
                    const enabled = availableAlphaLetters.includes(letter);
                    return (
                      <button
                        key={letter}
                        type="button"
                        disabled={!enabled}
                        onClick={() => scrollToTrackAlphaLetter(letter)}
                        className={`grid h-14 place-items-center rounded-xl text-2xl font-black transition ${enabled ? "hover:bg-[var(--surface)] text-[var(--text)]" : "cursor-not-allowed text-[var(--dim)]/35"}`}
                      >
                        {letter}
                      </button>
                    );
                  })}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {!lyricsOpen && mainScrollbar.visible && (
          <div
            className="fixed z-[90] w-3"
            style={{
              top: mainScrollbar.top,
              right: mainScrollbar.right,
              height: mainScrollbar.height
            }}
            onPointerDown={(event) => {
              event.preventDefault();
              customScrollbarDraggingRef.current = true;
              scrollbarDraggingRef.current = true;
              setCustomScrollbarDragging(true);
              mainPointerRef.current = { x: event.clientX, y: event.clientY };
              scrollMainFromScrollbarY(event.clientY);
              if (availableAlphaLetters.length) showTrackAlphaBubble(getCurrentTrackAlphaLetter());
            }}
          >
            <div
              className="absolute right-0 w-2 cursor-pointer rounded-full bg-[var(--scrollbar)] transition-colors hover:bg-[var(--accent)]"
              style={{
                top: mainScrollbar.thumbTop - mainScrollbar.top,
                height: mainScrollbar.thumbHeight
              }}
            />
          </div>
        )}

        <footer
          className={`player-footer fixed bottom-0 left-0 right-0 z-[95] grid h-[94px] items-center border-t border-[var(--line)] bg-[var(--bg-soft)]/95 px-5 pt-2 backdrop-blur transition-opacity duration-300 ${lyricsOpen ? (lyricsHudVisible ? "opacity-100" : "pointer-events-none opacity-0") : "opacity-100"}`}
        >
          <input
            type="range"
            min={0}
            max={currentTrack?.duration || 0}
            value={Math.min(currentTime, currentTrack?.duration || 0)}
            style={{ ["--progress" as string]: `${currentTrack?.duration ? Math.min(100, (currentTime / currentTrack.duration) * 100) : 0}%` }}
            onChange={(e) => {
              const sec = Number(e.target.value);
              if (!audioRef.current) return;
              audioRef.current.currentTime = sec;
              setCurrentTime(sec);
            }}
            aria-label="播放进度"
            className="player-progress absolute left-0 right-0 top-0 h-1 w-full cursor-pointer appearance-none bg-transparent accent-[var(--accent)]"
          />
          <div className="player-footer-info flex min-w-0 items-center gap-3 justify-self-start">
            <motion.button
              type="button"
              onClick={() => setLyricsOpen((prev) => !prev)}
              className={`h-14 w-14 shrink-0 overflow-hidden rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] ${footerInfoShouldFillCoverSlot ? "invisible" : ""}`}
              title={lyricsOpen ? "收起全屏歌词" : "打开全屏歌词"}
            >
              {currentTrack ? (
                <motion.div
                  layoutId="active-cover"
                  initial={false}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 1 }}
                  transition={{ type: "spring", stiffness: 210, damping: 24 }}
                  className="grid h-14 w-14 place-items-center overflow-hidden rounded-lg"
                  style={{ opacity: 1 }}
                >
                  {renderCoverInSlot(currentTrack.cover, currentTrack.title, 56, 56, "rounded-lg")}
                </motion.div>
              ) : (
                <motion.div
                  layoutId="active-cover"
                  initial={false}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 1 }}
                  transition={{ type: "spring", stiffness: 210, damping: 24 }}
                  className="grid h-14 w-14 place-items-center rounded-lg bg-[var(--surface)] text-[var(--dim)]"
                >
                  <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="8" cy="18" r="4" />
                    <path d="M12 18V2l7 4" />
                  </svg>
                </motion.div>
              )}
            </motion.button>
            <button
              type="button"
              onClick={() => setLyricsOpen((prev) => !prev)}
              className={`min-w-0 text-left transition-transform duration-200 ${footerInfoShouldFillCoverSlot ? "-translate-x-[68px]" : ""}`}
            >
              <p className="font-semibold">{currentTrack?.title || "静听"}</p>
              <p className="text-sm text-[var(--dim)]">{currentTrack?.artist || "此刻有声"}</p>
            </button>
          </div>

          <div className="player-footer-controls flex flex-none flex-col items-center gap-1 justify-self-center">
            <div className="flex items-center justify-center gap-4 text-sm">
              <span className="min-w-12 text-right text-xs text-[var(--dim)]">{toTimeText(currentTime)}</span>
              <IconButton label={currentPlayMode.label} onClick={cyclePlayMode} active={playMode !== "sequential"}>
                {currentPlayMode.icon}
              </IconButton>
              <IconButton label="上一首" onClick={previousTrack}>
                <LineIcon><path d="M19 20 9 12l10-8v16z" /><path d="M5 19V5" /></LineIcon>
              </IconButton>
              <IconButton label={isPlaying ? "暂停" : "播放"} onClick={togglePlay} className="h-10 w-10 bg-[var(--surface)]">
                {isPlaying
                  ? <LineIcon><path d="M8 5v14" /><path d="M16 5v14" /></LineIcon>
                  : <LineIcon><path d="m8 5 11 7-11 7V5z" /></LineIcon>}
              </IconButton>
              <IconButton label="下一首" onClick={nextTrack}>
                <LineIcon><path d="m5 4 10 8-10 8V4z" /><path d="M19 5v14" /></LineIcon>
              </IconButton>
              <button
                ref={queueToggleRef}
                type="button"
                aria-label="播放列表"
                title="播放列表"
                onClick={(e) => {
                  e.stopPropagation();
                  setQueueOpen((prev) => !prev);
                }}
                className={`inline-flex h-9 w-9 items-center justify-center rounded-full border transition ${queueOpen ? "border-[var(--accent)] text-[var(--accent)]" : "border-transparent hover:border-[var(--line)]"}`}
              >
                <LineIcon><path d="M4 6h12" /><path d="M4 12h10" /><path d="M4 18h8" /><path d="m17 10 4 3-4 3v-6z" /></LineIcon>
              </button>
              <span className="min-w-12 text-xs text-[var(--dim)]">{toTimeText(currentTrack?.duration || 0)}</span>
            </div>
          </div>

          <div className="player-footer-tools flex min-w-0 items-center justify-end gap-2 text-sm justify-self-end">
            <IconButton label="桌面歌词" onClick={() => setDesktopLyricOpen((prev) => !prev)} active={desktopLyricOpen}>
              <LineIcon><rect x="4" y="5" width="16" height="11" rx="2" /><path d="M8 19h8" /><path d="M10 9h4" /><path d="M8 12h8" /></LineIcon>
            </IconButton>
            <div className="relative">
              <button
                type="button"
                disabled={!hasLyricSources}
                onClick={(e) => {
                  e.stopPropagation();
                  setLyricSourceMenuOpen((prev) => !prev);
                }}
                className={`rounded-lg border px-2 py-1 ${hasLyricSources ? "border-[var(--line)] hover:border-[var(--accent)]" : "cursor-not-allowed border-[var(--line)] opacity-35"}`}
              >
                源
              </button>
              {lyricSourceMenuOpen && hasLyricSources && currentTrack && (
                <div className="absolute bottom-10 right-0 z-[97] w-52 overflow-hidden rounded-xl bg-[var(--bg-soft)] p-1 shadow-2xl">
                  {currentTrack.lyricSources.map((source) => (
                    <button
                      key={source.id}
                      type="button"
                      onClick={() => {
                        setTracks((prev) => prev.map((track) => (track.id === currentTrack.id ? { ...track, selectedLyricSourceId: source.id } : track)));
                        setLyricSourceMenuOpen(false);
                      }}
                      className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left hover:bg-[var(--surface)]"
                    >
                      <span className="flex items-center gap-2">
                        <span className="w-4 text-[var(--accent)]">{currentTrack.selectedLyricSourceId === source.id ? "✓" : ""}</span>
                        <span>{getLyricSourceLabel(source)}</span>
                      </span>
                      <span className="text-xs text-[var(--dim)]">{source.kind === "local" ? "本地" : "内嵌"}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              disabled={!hasTranslation}
              onClick={toggleTranslationEnabled}
              className={`rounded-lg border px-2 py-1 ${hasTranslation ? "border-[var(--line)]" : "cursor-not-allowed border-[var(--line)] opacity-35"}`}
            >
              译
            </button>
            <div className="relative" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                aria-label="倍速"
                title="倍速"
                onClick={() => setSpeedPanelOpen((prev) => !prev)}
                className={`inline-flex h-9 min-w-12 items-center justify-center rounded-full border px-3 text-sm font-bold transition ${speedPanelOpen ? "border-[var(--accent)] text-[var(--accent)]" : "border-transparent hover:border-[var(--line)]"}`}
              >
                {toRateText(playbackRate)}
              </button>
              {speedPanelOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 8, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8, scale: 0.98 }}
                  transition={{ duration: 0.16 }}
                  className="absolute bottom-12 right-0 z-[98] w-[560px] rounded-2xl bg-[var(--bg-soft)]/95 p-4 shadow-2xl backdrop-blur"
                >
                  <div className="mb-4">
                    <p className="text-sm font-semibold">播放速度</p>
                    <p className="text-xs text-[var(--dim)]">{toRateText(playbackRate)}</p>
                  </div>
                  <MaterialSlider min={0.1} max={3} step={0.1} value={playbackRate} onChange={setPlaybackRate} valueLabel={toRateText(playbackRate)} />
                  <SliderPresetMarks
                    min={0.1}
                    max={3}
                    values={[0.1, 0.5, 1, 1.25, 1.5, 2, 3]}
                    activeValue={playbackRate}
                    format={toRateText}
                    onSelect={setPlaybackRate}
                  />
                </motion.div>
              )}
            </div>
            <div className="relative" onClick={(e) => e.stopPropagation()}>
              <IconButton
                label="音量"
                active={volumePanelOpen}
                onClick={() => setVolumePanelOpen((prev) => !prev)}
              >
                {isMuted
                  ? <LineIcon><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><path d="m22 9-6 6" /><path d="m16 9 6 6" /></LineIcon>
                  : <LineIcon><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><path d="M15.5 8.5a5 5 0 0 1 0 7" /><path d="M18.5 5.5a9 9 0 0 1 0 13" /></LineIcon>}
              </IconButton>
              {volumePanelOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 8, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8, scale: 0.98 }}
                  transition={{ duration: 0.16 }}
                  className="volume-popover absolute bottom-12 right-0 z-[98] w-80 rounded-2xl bg-[var(--bg-soft)]/95 p-4 shadow-2xl backdrop-blur"
                >
                  <div className="flex items-center gap-3">
                    <IconButton
                      label={isMuted ? "取消静音" : "静音"}
                      className="h-10 w-10 border border-[var(--line)] bg-[var(--surface)]"
                      onClick={() => {
                        if (isMuted) {
                          const next = lastVolumeBeforeMute > 0.001 ? lastVolumeBeforeMute : 0.7;
                          setVolume(next);
                          if (audioRef.current) audioRef.current.volume = next;
                        } else {
                          setLastVolumeBeforeMute(volume);
                          setVolume(0);
                          if (audioRef.current) audioRef.current.volume = 0;
                        }
                      }}
                    >
                      {isMuted
                        ? <LineIcon><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><path d="m22 9-6 6" /><path d="m16 9 6 6" /></LineIcon>
                        : <LineIcon><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><path d="M15.5 8.5a5 5 0 0 1 0 7" /><path d="M18.5 5.5a9 9 0 0 1 0 13" /></LineIcon>}
                    </IconButton>
                    <div className="min-w-0 flex-1">
                      <MaterialSlider
                        min={0}
                        max={1}
                        step={0.01}
                        value={volume}
                        valueLabel={`${Math.round(volume * 100)}%`}
                        onChange={(next) => {
                          setVolume(next);
                          if (audioRef.current) audioRef.current.volume = next;
                        }}
                      />
                    </div>
                    <p className="w-12 text-right text-xl font-black">{Math.round(volume * 100)}%</p>
                  </div>
                </motion.div>
              )}
            </div>
          </div>
        </footer>

        <AnimatePresence>
          {queueOpen && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[95]"
              onClick={() => setQueueOpen(false)}
            />
          )}
          {queueOpen && (
            <motion.aside
              initial={{ opacity: 0, x: 18, y: 10 }}
              animate={{ opacity: 1, x: 0, y: 0 }}
              exit={{ opacity: 0, x: 18, y: 10 }}
              ref={queuePanelRef}
              onClick={(e) => e.stopPropagation()}
              className="fixed bottom-[104px] right-5 z-[96] w-[min(420px,calc(100vw-40px))] overflow-hidden rounded-2xl bg-[var(--bg-soft)]/95 p-4 shadow-2xl backdrop-blur-lg"
            >
              <div className="mb-3 flex items-center justify-between">
                <p className="text-lg font-bold">播放列表</p>
                <div className="flex items-center gap-2">
                  <p className="text-xs text-[var(--dim)]">{queueTracks.length} 首</p>
                  <button
                    type="button"
                    aria-label="清空播放列表"
                    title="清空播放列表"
                    disabled={!queueTracks.length}
                    onClick={clearPlayQueue}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-[var(--line)] text-[var(--dim)] hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-35"
                  >
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 6h18" />
                      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                      <path d="M10 11v6" />
                      <path d="M14 11v6" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    aria-label="关闭播放列表"
                    onClick={() => setQueueOpen(false)}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-[var(--line)] hover:border-[var(--accent)]"
                  >
                    <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current"><path d="M18.3 5.7 12 12l6.3 6.3-1.4 1.4L10.6 13.4 4.3 19.7l-1.4-1.4L9.2 12 2.9 5.7l1.4-1.4 6.3 6.3 6.3-6.3z" /></svg>
                  </button>
                </div>
              </div>
              <div className="max-h-[480px] space-y-1 overflow-y-auto overflow-x-hidden pr-1">
                {queueTracks.map((track, index) => (
                  <div key={`${track.id}-${index}`} className="relative">
                    {draggedQueueIndex !== null && queueDropIndex === index && (
                      <div className="pointer-events-none absolute left-0 right-0 top-[-4px] z-10 h-1 rounded-full bg-[var(--accent)] shadow-[0_0_10px_var(--accent)]" />
                    )}
                    <div
                    draggable
                    onDragStart={(event) => {
                      setDraggedQueueIndex(index);
                      setQueueDropIndex(index);
                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData("text/plain", String(index));
                    }}
                    onDragOver={(event) => {
                      event.preventDefault();
                      event.dataTransfer.dropEffect = "move";
                      const rect = event.currentTarget.getBoundingClientRect();
                      setQueueDropIndex(event.clientY < rect.top + rect.height / 2 ? index : index + 1);
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      const from = draggedQueueIndex ?? Number(event.dataTransfer.getData("text/plain"));
                      moveQueueTrack(from, queueDropIndex ?? index);
                      setDraggedQueueIndex(null);
                      setQueueDropIndex(null);
                    }}
                    onDragEnd={() => {
                      setDraggedQueueIndex(null);
                      setQueueDropIndex(null);
                    }}
                    className={`grid w-full min-w-0 cursor-grab grid-cols-[2.2ch_48px_minmax(0,1fr)_56px_30px] items-center gap-2 rounded-lg px-2 py-2 text-left transition active:cursor-grabbing ${track.id === currentTrackId ? "bg-[var(--surface)]" : "hover:bg-[var(--surface)]/70"} ${draggedQueueIndex === index ? "opacity-55" : ""}`}
                    >
                    <span className="tabular-nums text-center text-sm font-semibold text-[var(--dim)]">
                      {index + 1}
                    </span>
                    <span className="h-11 w-11 shrink-0 overflow-hidden rounded-lg">
                      {renderCoverInSlot(track.cover, track.album, 44, 44, "rounded-lg")}
                    </span>
                    <button
                      type="button"
                      onClick={() => jumpToTrack(track.id)}
                      className="min-w-0 text-left"
                    >
                      <p className="truncate text-sm font-semibold">{track.title}</p>
                      <p className="truncate text-xs text-[var(--dim)]">{track.artist}</p>
                    </button>
                    <p className="whitespace-nowrap text-right text-xs text-[var(--dim)]">{toTimeText(track.duration)}</p>
                    <button
                      type="button"
                      aria-label="从播放列表移除"
                      title="从播放列表移除"
                      onClick={() => removeQueueTrackAt(index)}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-full text-[var(--dim)] hover:bg-rose-500/15 hover:text-rose-300"
                    >
                      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M18 6 6 18" />
                        <path d="m6 6 12 12" />
                      </svg>
                    </button>
                    </div>
                    {draggedQueueIndex !== null && index === queueTracks.length - 1 && queueDropIndex === queueTracks.length && (
                      <div className="pointer-events-none absolute bottom-[-4px] left-0 right-0 z-10 h-1 rounded-full bg-[var(--accent)] shadow-[0_0_10px_var(--accent)]" />
                    )}
                  </div>
                ))}
              </div>
            </motion.aside>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {missingPromptTrack && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[106] grid place-items-center bg-black/45 backdrop-blur-sm"
              onClick={() => setMissingPromptTrackId("")}
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 10 }}
                className="w-[min(520px,92vw)] rounded-2xl border border-[var(--line)] bg-[var(--bg-soft)] p-5 shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="mb-4 flex items-start gap-3">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-500/15 text-amber-300">
                    <svg viewBox="0 0 24 24" className="h-6 w-6 fill-current"><path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z" /></svg>
                  </div>
                  <div className="min-w-0">
                    <p className="text-xl font-bold">无法播放此歌曲</p>
                    <p className="mt-2 text-sm text-[var(--dim)]">
                      {missingPromptTrack.title} 可能已被移动、删除或当前没有读取权限。是否从音乐库中移除？
                    </p>
                  </div>
                </div>
                <div className="flex justify-end gap-3 text-sm">
                  <button
                    type="button"
                    onClick={() => setMissingPromptTrackId("")}
                    className="rounded-lg border border-[var(--line)] px-4 py-2"
                  >
                    暂不移除
                  </button>
                  <button
                    type="button"
                    onClick={() => removeTracksFromLibrary([missingPromptTrack.id])}
                    className="rounded-lg border border-rose-400/40 bg-rose-500/15 px-4 py-2 text-rose-200"
                  >
                    从音乐库移除
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {createPlaylistDialogOpen && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[105] grid place-items-center bg-black/45 backdrop-blur-sm"
              onClick={() => {
                setCreatePlaylistDialogOpen(false);
                setNewPlaylistName("");
              }}
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 10 }}
                className="w-[min(420px,90vw)] rounded-2xl border border-[var(--line)] bg-[var(--bg-soft)] p-5 shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              >
                <p className="mb-3 text-xl font-bold">新建歌单</p>
                <input
                  value={newPlaylistName}
                  onChange={(e) => setNewPlaylistName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") confirmCreatePlaylist();
                  }}
                  autoFocus
                  placeholder="输入歌单名称"
                  className="h-10 w-full rounded-lg border border-[var(--line)] bg-transparent px-3 text-sm outline-none"
                />
                <div className="mt-4 flex justify-end gap-2 text-sm">
                  <button
                    type="button"
                    onClick={() => {
                      setCreatePlaylistDialogOpen(false);
                      setNewPlaylistName("");
                    }}
                    className="rounded-lg border border-[var(--line)] px-3 py-1.5"
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    onClick={confirmCreatePlaylist}
                  className="rounded-lg border border-[var(--accent)] bg-[var(--accent-soft)] px-3 py-1.5 text-[var(--accent)]"
                  >
                    创建
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {renamePlaylistId && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[105] grid place-items-center bg-black/45 backdrop-blur-sm"
              onClick={() => {
                setRenamePlaylistId("");
                setRenamePlaylistName("");
              }}
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 10 }}
                className="w-[min(420px,90vw)] rounded-2xl border border-[var(--line)] bg-[var(--bg-soft)] p-5 shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              >
                <p className="mb-3 text-xl font-bold">重命名歌单</p>
                <input
                  value={renamePlaylistName}
                  onChange={(e) => setRenamePlaylistName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") confirmRenamePlaylist();
                  }}
                  autoFocus
                  className="h-11 w-full rounded-lg border border-[var(--line)] bg-transparent px-3 outline-none focus:border-[var(--accent)]"
                />
                <div className="mt-4 flex justify-end gap-2 text-sm">
                  <button
                    type="button"
                    onClick={() => {
                      setRenamePlaylistId("");
                      setRenamePlaylistName("");
                    }}
                    className="rounded-lg border border-[var(--line)] px-3 py-1.5"
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    onClick={confirmRenamePlaylist}
                    className="rounded-lg border border-[var(--accent)] bg-[var(--accent-soft)] px-3 py-1.5 text-[var(--accent)]"
                  >
                    保存
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {playlistContextMenu && playlistContextTarget && (
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              className="fixed z-[109] w-[220px] overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--bg-soft)]/95 p-1 shadow-2xl backdrop-blur"
              style={{ left: Math.min(playlistContextMenu.x, window.innerWidth - 240), top: Math.min(playlistContextMenu.y, window.innerHeight - 170) }}
              onClick={(e) => e.stopPropagation()}
            >
              <p className="px-3 py-2 text-xs text-[var(--dim)]">{playlistContextTarget.name}</p>
              <div className="my-1 border-t border-[var(--line)]" />
              <button
                type="button"
                onClick={() => startRenamePlaylist(playlistContextTarget.id)}
                className="w-full rounded-md px-3 py-2 text-left hover:bg-[var(--surface)]"
              >
                重命名歌单
              </button>
              <button
                type="button"
                onClick={() => deletePlaylist(playlistContextTarget.id)}
                className="w-full rounded-md px-3 py-2 text-left text-rose-300 hover:bg-rose-500/15"
              >
                删除歌单
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {contextMenu && contextTrack && (
            <motion.div
              key={`${contextMenu.x}-${contextMenu.y}-${contextMenu.trackIds.join("-")}`}
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              className="fixed z-[110] w-[320px] rounded-xl bg-[var(--bg-soft)]/95 p-1.5 shadow-2xl backdrop-blur"
              style={contextMenuPosition}
              onClick={(e) => e.stopPropagation()}
              onMouseLeave={() => setContextPlaylistSubmenuOpen(false)}
            >
              <p className="px-3 py-2 text-xs text-[var(--dim)]">{contextIsBatch ? `已选 ${contextTracks.length} 首歌曲` : contextTrack.title}</p>
              {!contextIsBatch && (
                <>
                  <button onClick={() => { navigateAlbum(contextTrack.album); setContextMenu(null); }} className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left hover:bg-[var(--surface)]"><span>专辑：{contextTrack.album}</span></button>
                  <button onClick={() => { navigateArtist(contextTrack.artist); setContextMenu(null); }} className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left hover:bg-[var(--surface)]"><span>艺术家：{contextTrack.artist}</span></button>
                  <div className="my-1 border-t border-[var(--line)]" />
                </>
              )}
              <div className="relative">
                <button
                  type="button"
                  onMouseEnter={() => setContextPlaylistSubmenuOpen(true)}
                  onClick={() => setContextPlaylistSubmenuOpen((prev) => !prev)}
                  className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left hover:bg-[var(--surface)]"
                >
                  <span className="flex items-center gap-2"><span className="w-4 text-[var(--accent)]">+</span>添加到歌单</span>
                  <span className="text-[var(--dim)]">›</span>
                </button>
                {contextPlaylistSubmenuOpen && (
                  <div className={`absolute top-0 z-[111] w-56 rounded-xl bg-[var(--bg-soft)]/95 p-1 shadow-2xl ${contextMenuPosition.left > window.innerWidth - 600 ? "right-[100%] mr-1" : "left-[100%] ml-1"}`}>
                    {playlists.map((playlist) => (
                      <button
                        key={playlist.id}
                        type="button"
                        onClick={() => {
                          addTrackIdsToPlaylist(playlist.id, contextTrackIds);
                          setContextMenu(null);
                          setContextPlaylistSubmenuOpen(false);
                        }}
                        className="w-full rounded-md px-3 py-2 text-left hover:bg-[var(--surface)]"
                      >
                        {playlist.name}
                      </button>
                    ))}
                  {!playlists.length && <p className="px-3 py-2 text-sm text-[var(--dim)]">暂无歌单</p>}
                  </div>
                )}
              </div>
              <button onClick={() => { insertTracksToQueue(contextTrackIds, "after-current"); setContextMenu(null); }} className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left hover:bg-[var(--surface)]"><span>插播（当前播放后）</span><span className="text-xs text-[var(--dim)]">Ctrl+Enter</span></button>
              <button onClick={() => { insertTracksToQueue(contextTrackIds, "after-last"); setContextMenu(null); }} className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left hover:bg-[var(--surface)]"><span>插播（上次插播后）</span><span className="text-xs text-[var(--dim)]">Shift+Enter</span></button>
              <button onClick={() => { insertTracksToQueue(contextTrackIds, "to-end"); setContextMenu(null); }} className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left hover:bg-[var(--surface)]"><span>插播（队列末尾）</span><span className="text-xs text-[var(--dim)]">Alt+Enter</span></button>
              <div className="my-1 border-t border-[var(--line)]" />
              <button onClick={() => { navigator.clipboard?.writeText(contextTracks.map((track) => track.filePath).join("\n")); setContextMenu(null); }} className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left hover:bg-[var(--surface)]"><span>复制文件地址</span><span className="text-xs text-[var(--dim)]">Ctrl+C</span></button>
              {!contextIsBatch && (
                <button onClick={() => { openTrackInfo(contextTrack.id); setContextMenu(null); }} className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left hover:bg-[var(--surface)]"><span>音轨信息</span><span className="text-xs text-[var(--dim)]">Alt+I</span></button>
              )}
              <div className="my-1 border-t border-[var(--line)]" />
              {contextMenu.playlistId && (
                <button
                  onClick={() => {
                    removeTrackIdsFromPlaylist(contextMenu.playlistId || "", contextTrackIds);
                    setContextMenu(null);
                  }}
                  className="w-full rounded-md px-3 py-2 text-left text-[var(--accent)] hover:bg-[var(--accent-soft)]"
                >
                  从当前歌单移除
                </button>
              )}
              <button onClick={() => { removeTracksFromLibrary(contextTrackIds); setContextMenu(null); }} className="w-full rounded-md px-3 py-2 text-left text-rose-300 hover:bg-rose-500/15">从音乐库中移除</button>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {lyricsOpen && (
            <motion.section
              initial={false}
              animate={{ opacity: 1 }}
              exit={{ opacity: 1 }}
              transition={{ duration: 0 }}
              className="group/lyrics fixed inset-0 z-[80] overflow-hidden"
            >
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="absolute inset-0 z-0"
                style={fullscreenTrackInfo.cover
                  ? {
                      backgroundImage: theme === "dark"
                        ? `linear-gradient(rgba(8,10,18,0.72), rgba(8,10,18,0.82)), url(${fullscreenTrackInfo.cover})`
                        : `linear-gradient(rgba(232,237,246,0.82), rgba(224,232,244,0.88)), url(${fullscreenTrackInfo.cover})`,
                      backgroundSize: "cover",
                      backgroundPosition: "center"
                    }
                  : {
                      background: theme === "dark"
                        ? "linear-gradient(135deg, #10131c 0%, #232936 52%, #111827 100%)"
                        : "linear-gradient(135deg, #f6f8fb 0%, #e7edf5 55%, #f9fbfd 100%)",
                      backgroundSize: "cover",
                      backgroundPosition: "center"
                    }}
              />
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="pointer-events-none absolute inset-0 z-10 backdrop-blur-[56px]"
              />

              <div className={`relative z-20 h-full px-10 ${theme === "dark" ? "text-white" : "text-slate-900"}`}>
                <div className={`absolute left-10 right-10 top-7 z-30 flex items-start justify-between transition duration-300 ${fullscreenHudClassName} focus-within:pointer-events-auto focus-within:opacity-100`}>
                  <div className={lyricsMode === "cover" || lyricsMode.startsWith("mix") ? "opacity-0" : ""}>
                    <p className="text-4xl font-black leading-tight">{fullscreenTrackInfo.title}</p>
                    <div className={`mt-2 flex items-center gap-2 text-sm ${theme === "dark" ? "text-white/80" : "text-slate-600"}`}>
                      {fullscreenTrackInfo.hasTrack && currentTrack
                        ? renderArtistLinks(currentTrack, theme === "dark" ? "hover:text-white" : "hover:text-slate-900")
                        : <span>{fullscreenTrackInfo.artist}</span>}
                      <span>·</span>
                      {fullscreenTrackInfo.hasTrack
                        ? (
                          <button type="button" onClick={() => navigateAlbum(fullscreenTrackInfo.album)} className={theme === "dark" ? "hover:text-white" : "hover:text-slate-900"}>
                            {fullscreenTrackInfo.album}
                          </button>
                        )
                        : <span>{fullscreenTrackInfo.album}</span>}
                    </div>
                  </div>
                  <div className={`flex items-center gap-2 transition duration-300 ${fullscreenHudTranslateClassName} focus-within:translate-y-0`}>
                    <IconButton
                      label="纯歌词"
                      onClick={() => setLyricsMode("lyrics")}
                      active={lyricsMode === "lyrics"}
                      className={theme === "dark" ? "border-white/25 bg-white/10 text-white hover:border-white/45" : "border-slate-300 bg-white/65 text-slate-700 hover:border-slate-500"}
                    >
                      <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current"><path d="M4 6h16v2H4V6zm0 5h11v2H4v-2zm0 5h16v2H4v-2z" /></svg>
                    </IconButton>
                    <IconButton
                      label="纯封面"
                      onClick={() => setLyricsMode("cover")}
                      active={lyricsMode === "cover"}
                      className={theme === "dark" ? "border-white/25 bg-white/10 text-white hover:border-white/45" : "border-slate-300 bg-white/65 text-slate-700 hover:border-slate-500"}
                    >
                      <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current"><path d="M3 5a2 2 0 012-2h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5zm2 0v14h14V5H5zm3 11 3-4 2.4 2.8 1.8-2.3L18 16H8z" /></svg>
                    </IconButton>
                    <IconButton
                      label="混合横屏"
                      onClick={() => setLyricsMode("mix-horizontal")}
                      active={lyricsMode === "mix-horizontal"}
                      className={theme === "dark" ? "border-white/25 bg-white/10 text-white hover:border-white/45" : "border-slate-300 bg-white/65 text-slate-700 hover:border-slate-500"}
                    >
                      <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current"><path d="M3 6h7v12H3V6zm11 0h7v2h-7V6zm0 5h7v2h-7v-2zm0 5h7v2h-7v-2z" /></svg>
                    </IconButton>
                    <IconButton
                      label="混合竖屏"
                      onClick={() => setLyricsMode("mix-vertical")}
                      active={lyricsMode === "mix-vertical"}
                      className={theme === "dark" ? "border-white/25 bg-white/10 text-white hover:border-white/45" : "border-slate-300 bg-white/65 text-slate-700 hover:border-slate-500"}
                    >
                      <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current"><path d="M5 3h14v8H5V3zm0 11h14v2H5v-2zm0 5h10v2H5v-2z" /></svg>
                    </IconButton>
                  </div>
                </div>

                <div className={`absolute right-8 top-1/2 z-30 flex -translate-y-1/2 flex-col items-center gap-3 transition duration-300 ${fullscreenHudClassName} focus-within:pointer-events-auto focus-within:opacity-100`}>
                  <IconButton
                    label="复制歌词"
                    onClick={() => {
                      setSelectedCopyLyricIndexes((currentLyrics.length ? currentLyrics : [{ time: 0, text: IDLE_TRACK_INFO.title }]).map((_, index) => index));
                      setLyricsCopyOpen(true);
                      setLyricsOffsetOpen(false);
                      setLyricsSettingsOpen(false);
                    }}
                    className={theme === "dark" ? "border-white/25 bg-white/10 text-white hover:border-white/45" : "border-slate-300 bg-white/65 text-slate-700 hover:border-slate-500"}
                  >
                    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="8" y="8" width="12" height="12" rx="2" />
                      <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
                    </svg>
                  </IconButton>
                  <IconButton
                    label="歌词偏移"
                    onClick={() => { setLyricsOffsetOpen(true); setLyricsCopyOpen(false); setLyricsSettingsOpen(false); }}
                    active={Math.abs(lyricTimeOffset) > 0.01}
                    className={theme === "dark" ? "border-white/25 bg-white/10 text-white hover:border-white/45" : "border-slate-300 bg-white/65 text-slate-700 hover:border-slate-500"}
                  >
                    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 6v6l4 2" />
                      <path d="M21 12a9 9 0 1 1-3-6.7" />
                      <path d="M21 3v6h-6" />
                    </svg>
                  </IconButton>
                  <IconButton
                    label="歌词设置"
                    onClick={() => { setLyricsSettingsOpen(true); setLyricsCopyOpen(false); setLyricsOffsetOpen(false); }}
                    className={theme === "dark" ? "border-white/25 bg-white/10 text-white hover:border-white/45" : "border-slate-300 bg-white/65 text-slate-700 hover:border-slate-500"}
                  >
                    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 15.5A3.5 3.5 0 1 0 12 8a3.5 3.5 0 0 0 0 7.5z" />
                      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.65 1.65 0 0 0 15 19.4a1.65 1.65 0 0 0-1 .6 1.65 1.65 0 0 0-.4 1.07V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 8.6 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-.6-1 1.65 1.65 0 0 0-1.07-.4H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 8.6a1.65 1.65 0 0 0-.33-1.82l-.06-.06A2 2 0 1 1 7.04 3.9l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-.6 1.65 1.65 0 0 0 .4-1.07V3a2 2 0 1 1 4 0v.09A1.65 1.65 0 0 0 15.4 4.6a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c.2.35.53.6.93.6H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1.4z" />
                    </svg>
                  </IconButton>
                </div>

                <AnimatePresence>
                  {lyricsCopyOpen && (
                    <motion.div className="absolute inset-0 z-40 grid place-items-center bg-black/35 p-8 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setLyricsCopyOpen(false)}>
                      <motion.div className="max-h-[84vh] w-[min(860px,92vw)] overflow-hidden rounded-2xl bg-[var(--bg-soft)]/96 p-6 shadow-2xl" initial={{ opacity: 0, y: 16, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 16, scale: 0.98 }} onClick={(e) => e.stopPropagation()}>
                        <div className="mb-5 flex items-center justify-between">
                          <h2 className="text-2xl font-black">复制歌词</h2>
                          <IconButton label="关闭" onClick={() => setLyricsCopyOpen(false)}><svg viewBox="0 0 24 24" className="h-5 w-5 fill-current"><path d="M18.3 5.7 12 12l6.3 6.3-1.4 1.4-6.3-6.3-6.3 6.3-1.4-1.4L9.2 12 2.9 5.7l1.4-1.4 6.3 6.3 6.3-6.3z" /></svg></IconButton>
                        </div>
                        <div className="max-h-[48vh] space-y-2 overflow-y-auto pr-2">
                          {(currentLyrics.length ? currentLyrics : [{ time: 0, text: IDLE_TRACK_INFO.title }]).map((line, index) => (
                            <button
                              key={`${line.time}-${index}`}
                              type="button"
                              onClick={() => setSelectedCopyLyricIndexes((prev) => prev.includes(index) ? prev.filter((item) => item !== index) : [...prev, index])}
                              className={`grid w-full grid-cols-[34px_minmax(0,1fr)] gap-3 rounded-lg border-b border-[var(--line)] px-3 py-3 text-left transition ${selectedCopyLyricIndexes.includes(index) ? "bg-[var(--surface)]/80" : "hover:bg-[var(--surface)]/45"}`}
                            >
                              <span className={`mt-1 grid h-6 w-6 place-items-center rounded border ${selectedCopyLyricIndexes.includes(index) ? "border-[var(--accent)] bg-[var(--accent)] text-white" : "border-[var(--line)]"}`}>
                                {selectedCopyLyricIndexes.includes(index) && <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current"><path d="m9 16.2-3.5-3.5L4 14.2l5 5 11-11-1.5-1.5z" /></svg>}
                              </span>
                              <span className="min-w-0">
                                <span className="block font-semibold">{line.text}</span>
                                {line.translation && <span className="mt-1 block whitespace-pre-wrap text-sm text-[var(--dim)]">{line.translation}</span>}
                              </span>
                            </button>
                          ))}
                        </div>
                        <div className="mt-5 border-t border-[var(--line)] pt-4">
                          <p className="mb-3 text-sm font-semibold">要复制的内容</p>
                          <div className="flex flex-wrap gap-4 text-sm">
                            {[
                              ["翻译", copyTranslation, setCopyTranslation],
                              ["音译", copyRomaji, setCopyRomaji],
                              ["空行", copyBlankLines, setCopyBlankLines],
                              ["歌名", copySongTitle, setCopySongTitle],
                              ["歌手", copyArtist, setCopyArtist]
                            ].map(([label, checked, setter]) => (
                              <label key={label as string} className="inline-flex items-center gap-2">
                                <MaterialCheckbox checked={checked as boolean} onChange={() => (setter as (next: boolean) => void)(!(checked as boolean))} />
                                <span>{label as string}</span>
                              </label>
                            ))}
                          </div>
                          <div className="mt-5 flex justify-end gap-3">
                            <button
                              type="button"
                              onClick={() => {
                                const indexes = (currentLyrics.length ? currentLyrics : [{ time: 0, text: IDLE_TRACK_INFO.title }]).map((_, index) => index);
                                const allSelected = indexes.length > 0 && indexes.every((index) => selectedCopyLyricIndexes.includes(index));
                                setSelectedCopyLyricIndexes(allSelected ? [] : indexes);
                              }}
                              className="rounded-lg border border-[var(--line)] px-4 py-2"
                            >
                              {selectedCopyLyricIndexes.length === (currentLyrics.length ? currentLyrics.length : 1) ? "全不选" : "全选"}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const indexes = (currentLyrics.length ? currentLyrics : [{ time: 0, text: IDLE_TRACK_INFO.title }]).map((_, index) => index);
                                setSelectedCopyLyricIndexes((prev) => indexes.filter((index) => !prev.includes(index)));
                              }}
                              className="rounded-lg border border-[var(--line)] px-4 py-2"
                            >
                              反选
                            </button>
                            <button type="button" disabled={!selectedCopyLyricIndexes.length} onClick={copyFullLyrics} className="rounded-lg bg-[var(--accent)] px-5 py-2 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-45">复制 ({selectedCopyLyricIndexes.length})</button>
                          </div>
                        </div>
                      </motion.div>
                    </motion.div>
                  )}

                  {lyricsOffsetOpen && (
                    <motion.div className="absolute inset-0 z-40 grid place-items-center bg-black/25 p-8 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setLyricsOffsetOpen(false)}>
                      <motion.div className="w-[min(560px,92vw)] rounded-2xl bg-[var(--bg-soft)]/96 p-6 shadow-2xl" initial={{ opacity: 0, y: 16, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 16, scale: 0.98 }} onClick={(e) => e.stopPropagation()}>
                        <div className="mb-5 flex items-center justify-between">
                          <h2 className="text-2xl font-black">歌词偏移</h2>
                          <IconButton label="关闭" onClick={() => setLyricsOffsetOpen(false)}><svg viewBox="0 0 24 24" className="h-5 w-5 fill-current"><path d="M18.3 5.7 12 12l6.3 6.3-1.4 1.4-6.3-6.3-6.3 6.3-1.4-1.4L9.2 12 2.9 5.7l1.4-1.4 6.3 6.3 6.3-6.3z" /></svg></IconButton>
                        </div>
                        <p className="mb-4 text-center text-3xl font-black">{lyricTimeOffset >= 0 ? "+" : ""}{lyricTimeOffset.toFixed(1)}s</p>
                        <MaterialSlider min={-5} max={5} step={0.1} value={Math.max(-5, Math.min(5, lyricTimeOffset))} onChange={setLyricTimeOffset} valueLabel={`${lyricTimeOffset >= 0 ? "+" : ""}${lyricTimeOffset.toFixed(1)}s`} />
                        <SliderPresetMarks
                          min={-5}
                          max={5}
                          values={Array.from({ length: 11 }, (_, index) => index - 5)}
                          activeValue={lyricTimeOffset}
                          format={(value) => value > 0 ? `+${value}s` : `${value}s`}
                          onSelect={setLyricTimeOffset}
                        />
                      </motion.div>
                    </motion.div>
                  )}

                  {lyricsSettingsOpen && (
                    <motion.div className="absolute inset-0 z-40 grid place-items-center bg-black/35 p-8 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setLyricsSettingsOpen(false)}>
                      <motion.div className="flex max-h-[82vh] w-[min(840px,92vw)] flex-col overflow-hidden rounded-2xl bg-[var(--bg-soft)]/96 p-6 shadow-2xl" initial={{ opacity: 0, y: 16, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 16, scale: 0.98 }} onClick={(e) => e.stopPropagation()}>
                        <div className="mb-5 flex items-center justify-between">
                          <h2 className="text-2xl font-black">歌词设置</h2>
                          <IconButton label="关闭" onClick={() => setLyricsSettingsOpen(false)}><svg viewBox="0 0 24 24" className="h-5 w-5 fill-current"><path d="M18.3 5.7 12 12l6.3 6.3-1.4 1.4-6.3-6.3-6.3 6.3-1.4-1.4L9.2 12 2.9 5.7l1.4-1.4 6.3 6.3 6.3-6.3z" /></svg></IconButton>
                        </div>
                        <div className="min-h-0 space-y-4 overflow-y-auto pr-2">
                          {renderLyricStylePreview(true)}
                          {renderSettingsRow("自适应歌词大小", "根据窗口高度自动缩放", <ToggleSwitch checked={lyricAutoScale} onChange={() => setLyricAutoScale((prev) => !prev)} />)}
                          {renderSettingsRow(
                            "歌词字体大小",
                            "主歌词字号",
                            <div className="flex items-center gap-2">
                              <button type="button" onClick={() => setLyricFontSize(60)} className="rounded-lg bg-[var(--surface)] px-3 py-2 text-sm">恢复默认</button>
                              <NumberControl value={lyricFontSize} setValue={setLyricFontSize} min={32} max={96} suffix="px" />
                            </div>
                          )}
                          {renderSettingsRow(
                            "翻译歌词大小",
                            "翻译行显示字号",
                            <div className="flex items-center gap-2">
                              <button type="button" onClick={() => setLyricTranslationFontSize(36)} className="rounded-lg bg-[var(--surface)] px-3 py-2 text-sm">恢复默认</button>
                              <NumberControl value={lyricTranslationFontSize} setValue={setLyricTranslationFontSize} min={18} max={72} suffix="px" />
                            </div>
                          )}
                          {renderSettingsRow("歌词字重设置", "设置歌词显示的字重", <NumberControl value={lyricFontWeight} setValue={setLyricFontWeight} min={300} max={900} step={50} />)}
                          {renderSettingsRow("歌词位置", "歌词的默认水平位置", (
                            <MenuSelect
                              value={lyricPosition}
                              onChange={setLyricPosition}
                              className="w-40"
                              options={[
                                { value: "left", label: "居左" },
                                { value: "center", label: "居中" },
                                { value: "right", label: "居右" }
                              ]}
                            />
                          ))}
                          {renderSettingsRow("歌词左侧边距", "调整歌词起始位置", <div className="w-64"><MaterialSlider min={0} max={36} value={lyricLeftOffset} onChange={setLyricLeftOffset} valueLabel={`${lyricLeftOffset}%`} /><p className="text-xs text-[var(--dim)]">{lyricLeftOffset === 0 ? "默认" : `${lyricLeftOffset}%`}</p></div>)}
                          {renderSettingsRow("歌词滚动位置", "高亮歌词在屏幕中的垂直位置", <div className="w-64"><MaterialSlider min={8} max={78} value={lyricScrollPosition} onChange={setLyricScrollPosition} valueLabel={`${lyricScrollPosition}%`} /></div>)}
                          {renderLyricEffectRow(<svg viewBox="0 0 24 24" className="h-5 w-5 fill-current"><path d="M4 4h16v16H4V4zm2 2v12h12V6H6z" /></svg>, "模糊效果", "对非当前行启用轻微模糊", lyricAutoBlur, () => setLyricAutoBlur((prev) => !prev))}
                          {renderLyricEffectRow(<svg viewBox="0 0 24 24" className="h-5 w-5 fill-current"><path d="M4 5h16v3H4V5zm3 6h10v3H7v-3zm3 6h4v3h-4v-3z" /></svg>, "淡出效果", "让非当前行按距离逐渐淡出", lyricFadeEffect, () => setLyricFadeEffect((prev) => !prev))}
                          {renderLyricEffectRow(<svg viewBox="0 0 24 24" className="h-5 w-5 fill-current"><path d="M12 3 3 8l9 5 9-5-9-5z" /></svg>, "远离视野", "使非当前行按距离轻微缩小并后退", lyricDistantView, () => setLyricDistantView((prev) => !prev))}
                        </div>
                      </motion.div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {lyricsMode === "cover" && (
                  <div className="flex h-full items-center justify-center">
                    {renderAnimatedCover(fullscreenTrackInfo.cover, fullscreenTrackInfo.album, 560, Math.min(viewportSize.height * 0.56, 560), "shadow-2xl")}
                  </div>
                )}

                {lyricsMode === "mix-horizontal" && (
                  <div className="flex h-full min-h-0 items-center justify-center overflow-hidden">
                    <div
                      className="grid h-full max-w-full min-w-0 items-center"
                      style={{
                        gridTemplateColumns: `${mixHorizontalCoverColumnWidth}px minmax(0, ${mixHorizontalLyricColumnWidth}px)`,
                        columnGap: `${mixHorizontalGap}px`,
                        transform: `translateX(${mixHorizontalShift}px)`
                      }}
                    >
                      <div className="flex min-h-0 flex-col justify-center">
                        {renderAnimatedCover(fullscreenTrackInfo.cover, fullscreenTrackInfo.album, mixHorizontalCoverColumnWidth, mixHorizontalCoverMaxHeight)}
                        <motion.div {...fullscreenContentFade}>
                          <p
                            className="mt-5 font-black leading-tight"
                            style={{ fontSize: `${Math.max(24, Math.round(36 * mixHorizontalScale))}px` }}
                          >
                            {fullscreenTrackInfo.title}
                          </p>
                          <p
                            className={`mt-1 font-bold leading-tight ${theme === "dark" ? "text-white/85" : "text-slate-700"}`}
                            style={{ fontSize: `${Math.max(16, Math.round(24 * mixHorizontalScale))}px` }}
                          >
                            {fullscreenTrackInfo.artist}
                          </p>
                          <p
                            className={`leading-snug ${theme === "dark" ? "text-white/60" : "text-slate-500"}`}
                            style={{ fontSize: `${Math.max(14, Math.round(18 * mixHorizontalScale))}px` }}
                          >
                            {fullscreenTrackInfo.album}
                          </p>
                        </motion.div>
                      </div>
                      <motion.div {...fullscreenContentFade} data-lyric-scroll onScroll={handleLyricUserScroll} className="lyric-scroll h-full min-w-0 overflow-y-auto pr-2">
                        <div className="min-h-full w-full">{renderLyricRows(mixHorizontalLyricScale, { wideText: true })}</div>
                      </motion.div>
                    </div>
                  </div>
                )}

                {lyricsMode === "mix-vertical" && (
                  <div className="mx-auto flex h-full max-w-5xl flex-col gap-6 pt-8">
                    <div className="mx-auto flex items-center gap-4">
                      {renderAnimatedCover(fullscreenTrackInfo.cover, fullscreenTrackInfo.album, 96, 96, "rounded-xl")}
                      <motion.div {...fullscreenContentFade}>
                        <p className="text-3xl font-black">{fullscreenTrackInfo.title}</p>
                        <p className={`text-lg ${theme === "dark" ? "text-white/75" : "text-slate-600"}`}>{fullscreenTrackInfo.artist} · {fullscreenTrackInfo.album}</p>
                      </motion.div>
                    </div>
                    <motion.div {...fullscreenContentFade} data-lyric-scroll onScroll={handleLyricUserScroll} className="lyric-scroll min-h-0 flex-1 overflow-y-auto px-4">{renderLyricRows(0.82)}</motion.div>
                  </div>
                )}

                {lyricsMode === "lyrics" && (
                  <motion.div {...fullscreenContentFade} data-lyric-scroll onScroll={handleLyricUserScroll} className="lyric-scroll mx-auto h-full max-w-5xl overflow-y-auto px-5">
                    {renderLyricRows()}
                  </motion.div>
                )}

              </div>
            </motion.section>
          )}
        </AnimatePresence>
      </div>
    </LayoutGroup>
  );
}
