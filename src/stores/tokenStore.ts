import { createEffect, createMemo, createSignal } from "solid-js";
import type {
  DesignToken,
  Deviation,
  ExportPackage,
  Product,
  ProductReceipt,
  Snapshot,
  Theme,
  TokenKind,
} from "../types/tokens";
import { dependentTokens, extractRefs, fingerprintTokens, resolveTheme } from "../utils/resolution";

const STORAGE_KEY = "token-forge-workspace-v2";
const EXPORT_KEY_PREFIX = "token-forge-export-";

export const PRODUCTS: Product[] = [
  { id: "prod-order-web", name: "订单中台 Web" },
  { id: "prod-merchant-app", name: "商家 App" },
  { id: "prod-bi-board", name: "数据看板" },
];

const now = (): string => new Date().toLocaleString("zh-CN", { hour12: false });

const makeTokens = (): Theme["tokens"] => ({
  color: [
    { id: "color-brand", name: "color.brand.primary", value: "#356ae6", description: "品牌主色，用于主操作" },
    { id: "color-brand-hover", name: "color.brand.hover", value: "{color.brand.primary}", description: "悬停态，跟随品牌主色" },
    {
      id: "color-brand-pressed",
      name: "color.brand.pressed",
      value: "#2a54b8",
      description: "按下态，已显式覆盖",
      override: true,
      sourceRef: "{color.brand.primary}",
    },
    { id: "color-link", name: "color.link.default", value: "{color.brand.primary}", description: "链接色，跟随品牌主色" },
    { id: "color-surface", name: "color.surface.default", value: "#ffffff", description: "默认卡片与页面表面" },
    { id: "color-text", name: "color.text.primary", value: "#172033", description: "正文主文字" },
    { id: "color-muted", name: "color.text.muted", value: "#68738a", description: "次级说明文字" },
    { id: "color-success", name: "color.status.success", value: "#16845b", description: "成功状态" },
    { id: "color-danger", name: "color.status.danger", value: "#c53b4d", description: "错误与危险状态" },
    { id: "color-button-bg", name: "component.button.bg", value: "{color.brand.primary}", description: "按钮变体背景" },
    { id: "color-button-text", name: "component.button.text", value: "{color.surface.default}", description: "按钮变体文字" },
  ],
  fontSize: [
    { id: "font-xs", name: "font.size.xs", value: "12px", description: "辅助标签" },
    { id: "font-sm", name: "font.size.sm", value: "14px", description: "表格与控件" },
    { id: "font-md", name: "font.size.md", value: "16px", description: "正文" },
    { id: "font-lg", name: "font.size.lg", value: "20px", description: "区块标题" },
    { id: "font-xl", name: "font.size.xl", value: "28px", description: "页面标题" },
  ],
  spacing: [
    { id: "space-1", name: "space.1", value: "4px", description: "最小间距" },
    { id: "space-2", name: "space.2", value: "8px", description: "紧凑间距" },
    { id: "space-3", name: "space.3", value: "12px", description: "控件内间距" },
    { id: "space-4", name: "space.4", value: "16px", description: "常规间距" },
    { id: "space-6", name: "space.6", value: "24px", description: "区块间距" },
    { id: "space-8", name: "space.8", value: "32px", description: "大区块间距" },
    { id: "space-section", name: "space.section", value: "{space.8}", description: "页面分区间距，跟随 space.8" },
    { id: "space-card-padding", name: "component.card.padding", value: "{space.4}", description: "卡片变体内边距" },
  ],
  radius: [
    { id: "radius-sm", name: "radius.sm", value: "4px", description: "小控件" },
    { id: "radius-md", name: "radius.md", value: "8px", description: "卡片与输入框" },
    { id: "radius-full", name: "radius.full", value: "999px", description: "胶囊标签" },
    { id: "radius-button", name: "component.button.radius", value: "{radius.md}", description: "按钮变体圆角" },
  ],
  shadow: [
    { id: "shadow-sm", name: "shadow.sm", value: "0 1px 2px rgb(22 32 51 / 0.08)", description: "轻微抬升" },
    { id: "shadow-lg", name: "shadow.lg", value: "0 16px 40px rgb(22 32 51 / 0.14)", description: "浮层与弹窗" },
  ],
  motion: [
    { id: "motion-fast", name: "motion.duration.fast", value: "120ms", description: "即时反馈" },
    { id: "motion-base", name: "motion.duration.base", value: "220ms", description: "标准过渡" },
    { id: "motion-slow", name: "motion.duration.slow", value: "420ms", description: "强调过渡" },
  ],
});

function seedThemes(): Theme[] {
  const light = { id: "theme-light", name: "企业浅色", tokens: makeTokens() };
  const dark = structuredClone(light);
  dark.id = "theme-dark";
  dark.name = "夜间模式";
  dark.tokens.color = dark.tokens.color.map((token) => {
    if (token.id === "color-surface") return { ...token, value: "#151b28" };
    if (token.id === "color-text") return { ...token, value: "#f4f7ff" };
    if (token.id === "color-muted") return { ...token, value: "#aab4ca" };
    return token;
  });
  const dense = structuredClone(light);
  dense.id = "theme-dense";
  dense.name = "高密度运营";
  const shrink = (value: string, by: number, floor: number): string => {
    if (value.includes("{")) return value;
    const size = Number.parseInt(value, 10);
    return Number.isNaN(size) ? value : `${Math.max(floor, size - by)}px`;
  };
  dense.tokens.fontSize = dense.tokens.fontSize.map((token) => ({ ...token, value: shrink(token.value, 1, 11) }));
  dense.tokens.spacing = dense.tokens.spacing.map((token) => ({ ...token, value: shrink(token.value, 2, 2) }));
  return [light, dark, dense];
}

interface PersistedState {
  themes: Theme[];
  activeThemeId: string;
  snapshots: Snapshot[];
  packages: ExportPackage[];
  receipts: ProductReceipt[];
  deviations: Deviation[];
}

function readPersisted(): PersistedState {
  const fallback: PersistedState = {
    themes: seedThemes(),
    activeThemeId: "theme-light",
    snapshots: [],
    packages: [],
    receipts: [],
    deviations: [],
  };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as PersistedState;
    if (!parsed.themes?.length) return fallback;
    return {
      ...fallback,
      ...parsed,
      packages: parsed.packages ?? [],
      receipts: parsed.receipts ?? [],
      deviations: parsed.deviations ?? [],
    };
  } catch {
    return fallback;
  }
}

const initial = readPersisted();
const [themes, setThemes] = createSignal<Theme[]>(initial.themes);
const [activeThemeId, setActiveThemeId] = createSignal(initial.activeThemeId);
const [snapshots, setSnapshots] = createSignal<Snapshot[]>(initial.snapshots);
const [packages, setPackages] = createSignal<ExportPackage[]>(initial.packages);
const [receipts, setReceipts] = createSignal<ProductReceipt[]>(initial.receipts);
const [deviations, setDeviations] = createSignal<Deviation[]>(initial.deviations);
const [publishError, setPublishError] = createSignal<string | null>(null);
const [failNextWrite, setFailNextWrite] = createSignal(false);

const activeTheme = createMemo(() => themes().find((theme) => theme.id === activeThemeId()) ?? themes()[0]);

/** 当前主题的实时解析结果：别名已重算，预览/导出/差异共用 */
const resolution = createMemo(() => resolveTheme(activeTheme()));

/** 当前编辑内容的待发布指纹 */
const draftFingerprint = createMemo(() => fingerprintTokens(resolution().byName));

createEffect(() => {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      themes: themes(),
      activeThemeId: activeThemeId(),
      snapshots: snapshots(),
      packages: packages(),
      receipts: receipts(),
      deviations: deviations(),
    }),
  );
});

function updateTheme(themeId: string, updater: (theme: Theme) => Theme): void {
  setThemes((current) => current.map((theme) => (theme.id === themeId ? updater(theme) : theme)));
}

function mapAllTokens(tokens: Theme["tokens"], fn: (token: DesignToken) => DesignToken): Theme["tokens"] {
  const next = {} as Theme["tokens"];
  (Object.keys(tokens) as TokenKind[]).forEach((kind) => {
    next[kind] = tokens[kind].map(fn);
  });
  return next;
}

/** 基础值改动后：依赖它的显式覆盖令牌保留原值并标为待复核，普通别名由解析器重算 */
function flagStaleOverrides(theme: Theme, changedName: string): Theme {
  const staleIds = new Set(
    dependentTokens(theme, changedName)
      .filter((token) => token.override)
      .map((token) => token.id),
  );
  if (!staleIds.size) return theme;
  return {
    ...theme,
    tokens: mapAllTokens(theme.tokens, (token) => (staleIds.has(token.id) ? { ...token, pendingReview: true } : token)),
  };
}

export function useTokenStore() {
  const updateToken = (kind: TokenKind, id: string, patch: Partial<DesignToken>): void => {
    const target = activeTheme().tokens[kind].find((token) => token.id === id);
    if (!target) return;
    const valueChanged = patch.value !== undefined && patch.value !== target.value;
    const nameChanged = patch.name !== undefined && patch.name !== target.name;
    updateTheme(activeThemeId(), (theme) => {
      let tokens: Theme["tokens"] = {
        ...theme.tokens,
        [kind]: theme.tokens[kind].map((token) => {
          if (token.id !== id) return token;
          let next = { ...token, ...patch };
          if (valueChanged) {
            const wasAlias = extractRefs(token.value).length > 0 || !!token.sourceRef;
            const isAlias = extractRefs(next.value).length > 0;
            if (isAlias) {
              // 重新写成引用：恢复跟随，清除覆盖与复核标记
              next = { ...next, override: false, sourceRef: undefined, pendingReview: false };
            } else if (wasAlias) {
              // 别名被改为字面值：记为显式覆盖，保留原引用用于依赖追踪
              next = { ...next, override: true, sourceRef: token.sourceRef ?? token.value, pendingReview: false };
            }
          }
          return next;
        }),
      };
      let nextTheme: Theme = { ...theme, tokens };
      if (valueChanged || nameChanged) {
        nextTheme = flagStaleOverrides(nextTheme, target.name);
      }
      return nextTheme;
    });
  };

  const addToken = (kind: TokenKind): void => {
    updateTheme(activeThemeId(), (theme) => ({
      ...theme,
      tokens: {
        ...theme.tokens,
        [kind]: [
          ...theme.tokens[kind],
          {
            id: `${kind}-${Date.now()}`,
            name: `${kind}.custom.${theme.tokens[kind].length + 1}`,
            value: kind === "color" ? "#4f46e5" : kind === "shadow" ? "0 8px 24px rgb(0 0 0 / 0.12)" : "8px",
            description: "自定义令牌",
          },
        ],
      },
    }));
  };

  const removeToken = (kind: TokenKind, id: string): void => {
    const target = activeTheme().tokens[kind].find((token) => token.id === id);
    updateTheme(activeThemeId(), (theme) => {
      let nextTheme: Theme = {
        ...theme,
        tokens: { ...theme.tokens, [kind]: theme.tokens[kind].filter((token) => token.id !== id) },
      };
      // 被删令牌若有覆盖令牌依赖，同样标为待复核（引用断裂会在导出前被拦截）
      if (target) nextTheme = flagStaleOverrides(nextTheme, target.name);
      return nextTheme;
    });
  };

  const createTheme = (name: string, sourceId = activeThemeId()): string => {
    const source = themes().find((theme) => theme.id === sourceId) ?? themes()[0];
    const id = `theme-${Date.now()}`;
    setThemes((current) => [...current, { ...structuredClone(source), id, name }]);
    setActiveThemeId(id);
    return id;
  };

  const saveSnapshot = (label: string): void => {
    const snapshot: Snapshot = {
      id: `snapshot-${Date.now()}`,
      label: label.trim() || `快照 ${snapshots().length + 1}`,
      createdAt: now(),
      theme: structuredClone(activeTheme()),
    };
    setSnapshots((current) => [snapshot, ...current].slice(0, 20));
  };

  const replaceTheme = (theme: Theme): void => {
    setThemes((current) => [...current, theme]);
    setActiveThemeId(theme.id);
  };

  /** 复核：keep 保留覆盖值，follow 恢复跟随引用并重算 */
  const reviewToken = (kind: TokenKind, id: string, action: "keep" | "follow"): void => {
    updateTheme(activeThemeId(), (theme) => ({
      ...theme,
      tokens: {
        ...theme.tokens,
        [kind]: theme.tokens[kind].map((token) => {
          if (token.id !== id) return token;
          if (action === "keep") return { ...token, pendingReview: false };
          return { ...token, value: token.sourceRef ?? token.value, override: false, sourceRef: undefined, pendingReview: false };
        }),
      },
    }));
  };

  const reviewAll = (action: "keep" | "follow"): void => {
    updateTheme(activeThemeId(), (theme) => ({
      ...theme,
      tokens: mapAllTokens(theme.tokens, (token) => {
        if (!token.pendingReview) return token;
        if (action === "keep") return { ...token, pendingReview: false };
        return { ...token, value: token.sourceRef ?? token.value, override: false, sourceRef: undefined, pendingReview: false };
      }),
    }));
  };

  const themePackages = (themeId: string): ExportPackage[] => packages().filter((pkg) => pkg.themeId === themeId);

  const currentPackage = (themeId: string): ExportPackage | undefined =>
    themePackages(themeId)
      .filter((pkg) => pkg.status === "published")
      .at(-1);

  /** 写盘：失败时抛错，由发布流程保留上一版并允许重试 */
  const writeExport = (pkg: ExportPackage): void => {
    if (failNextWrite()) {
      setFailNextWrite(false);
      throw new Error("磁盘写入被模拟为失败");
    }
    localStorage.setItem(`${EXPORT_KEY_PREFIX}${pkg.id}`, JSON.stringify(pkg));
  };

  /** 发布导出包：引用断裂或成环时停在导出前；写盘失败保留上一版 */
  const publish = (): boolean => {
    const theme = activeTheme();
    const result = resolveTheme(theme);
    if (result.errors.length) {
      setPublishError(`存在 ${result.errors.length} 处引用问题，已停在导出前，请先处理下方列出的令牌。`);
      return false;
    }
    const version = themePackages(theme.id).reduce((max, pkg) => Math.max(max, pkg.version), 0) + 1;
    const pkg: ExportPackage = {
      id: `pkg-${Date.now()}`,
      themeId: theme.id,
      themeName: theme.name,
      version,
      createdAt: now(),
      fingerprint: fingerprintTokens(result.byName),
      tokens: result.byName,
      status: "published",
    };
    try {
      writeExport(pkg);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setPackages((current) => [...current, { ...pkg, status: "failed", error: message }]);
      setPublishError(`写盘失败：${message}。上一版导出包已保留，可在导出包列表中重试。`);
      return false;
    }
    setPackages((current) => [...current, pkg]);
    setPublishError(null);
    return true;
  };

  /** 重试写盘失败的导出包，成功后成为当前发布版 */
  const retryPackage = (packageId: string): void => {
    const pkg = packages().find((item) => item.id === packageId);
    if (!pkg || pkg.status !== "failed") return;
    try {
      writeExport({ ...pkg, status: "published" });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setPackages((current) => current.map((item) => (item.id === packageId ? { ...item, error: message } : item)));
      setPublishError(`重试写盘仍失败：${message}。上一版导出包继续保留。`);
      return;
    }
    setPackages((current) =>
      current.map((item) => (item.id === packageId ? { ...item, status: "published", error: undefined } : item)),
    );
    setPublishError(null);
  };

  /** 产品装包后回报指纹；与当前导出包对不上则进入偏差清单 */
  const reportReceipt = (productId: string, mode: "match" | "stale" | "corrupt"): void => {
    const pkg = currentPackage(activeThemeId());
    if (!pkg) return;
    let fingerprint = pkg.fingerprint;
    let note = "安装完成，指纹一致";
    if (mode === "stale") {
      const published = themePackages(pkg.themeId).filter((item) => item.status === "published" && item.id !== pkg.id);
      const previous = published.at(-1);
      fingerprint = previous?.fingerprint ?? "00000000";
      note = previous ? `仍回报 v${previous.version} 的旧指纹` : "回报了未知旧指纹";
    } else if (mode === "corrupt") {
      fingerprint = ((Number.parseInt(pkg.fingerprint[0], 16) ^ 1).toString(16) + pkg.fingerprint.slice(1)).padStart(8, "0");
      note = "本地包被改动，指纹校验不一致";
    }
    const receipt: ProductReceipt = {
      id: `rcpt-${Date.now()}-${productId}`,
      productId,
      packageId: pkg.id,
      fingerprint,
      receivedAt: now(),
      note,
    };
    setReceipts((current) => [receipt, ...current].slice(0, 100));
    if (fingerprint === pkg.fingerprint) {
      // 指纹对齐后自动结清该产品在当前包上的偏差
      setDeviations((current) =>
        current.map((item) =>
          item.productId === productId && item.packageId === pkg.id && !item.resolvedAt
            ? { ...item, resolvedAt: now() }
            : item,
        ),
      );
    } else {
      setDeviations((current) => [
        {
          id: `dev-${Date.now()}-${productId}`,
          productId,
          packageId: pkg.id,
          expected: pkg.fingerprint,
          actual: fingerprint,
          detectedAt: now(),
        },
        ...current,
      ]);
    }
  };

  const resolveDeviation = (id: string): void => {
    setDeviations((current) => current.map((item) => (item.id === id ? { ...item, resolvedAt: now() } : item)));
  };

  return {
    themes,
    activeTheme,
    activeThemeId,
    setActiveThemeId,
    snapshots,
    updateToken,
    addToken,
    removeToken,
    createTheme,
    saveSnapshot,
    replaceTheme,
    // 解析与复核
    resolution,
    draftFingerprint,
    reviewToken,
    reviewAll,
    // 发布与对账
    packages,
    receipts,
    deviations,
    publishError,
    failNextWrite,
    setFailNextWrite,
    publish,
    retryPackage,
    reportReceipt,
    resolveDeviation,
    currentPackage,
    reset: () => {
      const fresh = seedThemes();
      setThemes(fresh);
      setActiveThemeId(fresh[0].id);
      setSnapshots([]);
      setPackages([]);
      setReceipts([]);
      setDeviations([]);
      setPublishError(null);
    },
  };
}
