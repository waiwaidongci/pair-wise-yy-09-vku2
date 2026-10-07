import { createEffect, createMemo, createSignal } from "solid-js";
import type {
  DesignToken,
  Deviation,
  ExportFormat,
  PackageRecord,
  ProductReceipt,
  ReviewItem,
  Snapshot,
  Theme,
  TokenKind,
} from "../types/tokens";
import {
  buildByName,
  canonicalFingerprint,
  checkIntegrity,
  countTokens,
  normalizeToken,
  reconcileTheme,
  resolveToken,
} from "../utils/reconcile";
import { toCssVariables, toSassVariables, toStyleDictionaryJson } from "../utils/exporters";

const STORAGE_KEY = "token-forge-workspace-v2";

const makeTokens = (): Theme["tokens"] => ({
  color: [
    { id: "color-brand", name: "color.brand.primary", value: "#356ae6", description: "品牌主色，用于主操作", role: "base", refPath: null, resolvedValue: "#356ae6", status: "current", recomputed: false },
    { id: "color-action-primary", name: "color.action.primary", value: "#ff5500", description: "操作主色（显式覆盖品牌色）", role: "override", refPath: "color.brand.primary", resolvedValue: "#ff5500", status: "current", recomputed: false },
    { id: "color-action-hover", name: "color.action.hover", value: "{color.action.primary}", description: "操作悬停态，引用操作主色", role: "alias", refPath: "color.action.primary", resolvedValue: "{color.action.primary}", status: "current", recomputed: false },
    { id: "color-focus-ring", name: "color.focus.ring", value: "{color.brand.primary}", description: "聚焦环，引用品牌主色", role: "alias", refPath: "color.brand.primary", resolvedValue: "{color.brand.primary}", status: "current", recomputed: false },
    { id: "color-button-bg", name: "color.button.primary.bg", value: "{color.action.primary}", description: "主按钮背景（组件变体）", role: "alias", refPath: "color.action.primary", resolvedValue: "{color.action.primary}", status: "current", recomputed: false },
    { id: "color-surface", name: "color.surface.default", value: "#ffffff", description: "默认卡片与页面表面", role: "base", refPath: null, resolvedValue: "#ffffff", status: "current", recomputed: false },
    { id: "color-text", name: "color.text.primary", value: "#172033", description: "正文主文字", role: "base", refPath: null, resolvedValue: "#172033", status: "current", recomputed: false },
    { id: "color-muted", name: "color.text.muted", value: "#68738a", description: "次级说明文字", role: "base", refPath: null, resolvedValue: "#68738a", status: "current", recomputed: false },
    { id: "color-success", name: "color.status.success", value: "#16845b", description: "成功状态", role: "base", refPath: null, resolvedValue: "#16845b", status: "current", recomputed: false },
    { id: "color-danger", name: "color.status.danger", value: "#c53b4d", description: "错误与危险状态", role: "base", refPath: null, resolvedValue: "#c53b4d", status: "current", recomputed: false },
  ],
  fontSize: [
    { id: "font-xs", name: "font.size.xs", value: "12px", description: "辅助标签", role: "base", refPath: null, resolvedValue: "12px", status: "current", recomputed: false },
    { id: "font-sm", name: "font.size.sm", value: "14px", description: "表格与控件", role: "base", refPath: null, resolvedValue: "14px", status: "current", recomputed: false },
    { id: "font-md", name: "font.size.md", value: "16px", description: "正文", role: "base", refPath: null, resolvedValue: "16px", status: "current", recomputed: false },
    { id: "font-lg", name: "font.size.lg", value: "20px", description: "区块标题", role: "base", refPath: null, resolvedValue: "20px", status: "current", recomputed: false },
    { id: "font-xl", name: "font.size.xl", value: "28px", description: "页面标题", role: "base", refPath: null, resolvedValue: "28px", status: "current", recomputed: false },
  ],
  spacing: [
    { id: "space-1", name: "space.1", value: "4px", description: "最小间距", role: "base", refPath: null, resolvedValue: "4px", status: "current", recomputed: false },
    { id: "space-2", name: "space.2", value: "8px", description: "紧凑间距", role: "base", refPath: null, resolvedValue: "8px", status: "current", recomputed: false },
    { id: "space-3", name: "space.3", value: "12px", description: "控件内间距", role: "base", refPath: null, resolvedValue: "12px", status: "current", recomputed: false },
    { id: "space-4", name: "space.4", value: "16px", description: "常规间距", role: "base", refPath: null, resolvedValue: "16px", status: "current", recomputed: false },
    { id: "space-6", name: "space.6", value: "24px", description: "区块间距", role: "base", refPath: null, resolvedValue: "24px", status: "current", recomputed: false },
    { id: "space-8", name: "space.8", value: "32px", description: "大区块间距", role: "base", refPath: null, resolvedValue: "32px", status: "current", recomputed: false },
  ],
  radius: [
    { id: "radius-sm", name: "radius.sm", value: "4px", description: "小控件", role: "base", refPath: null, resolvedValue: "4px", status: "current", recomputed: false },
    { id: "radius-md", name: "radius.md", value: "8px", description: "卡片与输入框", role: "base", refPath: null, resolvedValue: "8px", status: "current", recomputed: false },
    { id: "radius-full", name: "radius.full", value: "999px", description: "胶囊标签", role: "base", refPath: null, resolvedValue: "999px", status: "current", recomputed: false },
  ],
  shadow: [
    { id: "shadow-sm", name: "shadow.sm", value: "0 1px 2px rgb(22 32 51 / 0.08)", description: "轻微抬升", role: "base", refPath: null, resolvedValue: "0 1px 2px rgb(22 32 51 / 0.08)", status: "current", recomputed: false },
    { id: "shadow-lg", name: "shadow.lg", value: "0 16px 40px rgb(22 32 51 / 0.14)", description: "浮层与弹窗", role: "base", refPath: null, resolvedValue: "0 16px 40px rgb(22 32 51 / 0.14)", status: "current", recomputed: false },
  ],
  motion: [
    { id: "motion-fast", name: "motion.duration.fast", value: "120ms", description: "即时反馈", role: "base", refPath: null, resolvedValue: "120ms", status: "current", recomputed: false },
    { id: "motion-base", name: "motion.duration.base", value: "220ms", description: "标准过渡", role: "base", refPath: null, resolvedValue: "220ms", status: "current", recomputed: false },
    { id: "motion-slow", name: "motion.duration.slow", value: "420ms", description: "强调过渡", role: "base", refPath: null, resolvedValue: "420ms", status: "current", recomputed: false },
  ],
});

function seedThemes(): Theme[] {
  const light: Theme = { id: "theme-light", name: "企业浅色", tokens: makeTokens() };
  const dark = structuredClone(light);
  dark.id = "theme-dark";
  dark.name = "夜间模式";
  dark.tokens.color = dark.tokens.color.map((token) => {
    if (token.id === "color-surface") return { ...token, value: "#151b28", resolvedValue: "#151b28" };
    if (token.id === "color-text") return { ...token, value: "#f4f7ff", resolvedValue: "#f4f7ff" };
    if (token.id === "color-muted") return { ...token, value: "#aab4ca", resolvedValue: "#aab4ca" };
    return token;
  });
  const dense = structuredClone(light);
  dense.id = "theme-dense";
  dense.name = "高密度运营";
  dense.tokens.fontSize = dense.tokens.fontSize.map((token) => ({
    ...token,
    value: `${Math.max(11, Number.parseInt(token.value, 10) - 1)}px`,
    resolvedValue: `${Math.max(11, Number.parseInt(token.value, 10) - 1)}px`,
  }));
  dense.tokens.spacing = dense.tokens.spacing.map((token) => ({
    ...token,
    value: `${Math.max(2, Number.parseInt(token.value, 10) - 2)}px`,
    resolvedValue: `${Math.max(2, Number.parseInt(token.value, 10) - 2)}px`,
  }));
  return [light, dark, dense].map((theme) => reconcileTheme(theme));
}

interface PersistedState {
  themes: Theme[];
  activeThemeId: string;
  snapshots: Snapshot[];
  packages: PackageRecord[];
  receipts: ProductReceipt[];
  deviations: Deviation[];
  simulateWriteFailure: boolean;
}

/** 迁移旧版本地数据：补全 role/refPath/resolvedValue/status/recomputed 字段 */
function migrateTheme(theme: Theme): Theme {
  const migrated: Theme = {
    ...theme,
    tokens: { ...theme.tokens },
  };
  (Object.keys(migrated.tokens) as TokenKind[]).forEach((kind) => {
    migrated.tokens[kind] = migrated.tokens[kind].map((token) => {
      const base: DesignToken = {
        ...token,
        role: token.role ?? "base",
        refPath: token.refPath ?? null,
        resolvedValue: token.resolvedValue ?? token.value,
        status: token.status ?? "current",
        recomputed: token.recomputed ?? false,
      };
      return normalizeToken(base);
    });
  });
  return reconcileTheme(migrated);
}

function readPersisted(): PersistedState {
  const fallback: PersistedState = {
    themes: seedThemes(),
    activeThemeId: "theme-light",
    snapshots: [],
    packages: [],
    receipts: [],
    deviations: [],
    simulateWriteFailure: false,
  };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<PersistedState>;
    if (!parsed.themes?.length) return fallback;
    return {
      themes: parsed.themes.map(migrateTheme),
      activeThemeId: parsed.activeThemeId ?? "theme-light",
      snapshots: parsed.snapshots ?? [],
      packages: parsed.packages ?? [],
      receipts: parsed.receipts ?? [],
      deviations: parsed.deviations ?? [],
      simulateWriteFailure: parsed.simulateWriteFailure ?? false,
    };
  } catch {
    return fallback;
  }
}

const initial = readPersisted();
const [themes, setThemes] = createSignal<Theme[]>(initial.themes);
const [activeThemeId, setActiveThemeId] = createSignal(initial.activeThemeId);
const [snapshots, setSnapshots] = createSignal<Snapshot[]>(initial.snapshots);
const [packages, setPackages] = createSignal<PackageRecord[]>(initial.packages);
const [receipts, setReceipts] = createSignal<ProductReceipt[]>(initial.receipts);
const [deviations, setDeviations] = createSignal<Deviation[]>(initial.deviations);
const [simulateWriteFailure, setSimulateWriteFailure] = createSignal(initial.simulateWriteFailure);

const activeTheme = createMemo(() => themes().find((theme) => theme.id === activeThemeId()) ?? themes()[0]);
const integrityIssues = createMemo(() => checkIntegrity(activeTheme()));
const exportBlocked = createMemo(() => integrityIssues().length > 0);
const currentPackage = createMemo<PackageRecord | null>(() => {
  const list = packages();
  return list.length ? list.reduce((latest, pkg) => (pkg.version > latest.version ? pkg : latest)) : null;
});

/** 待复核队列：显式覆盖待确认 + 别名已重算待知悉 */
const reviewItems = createMemo<ReviewItem[]>(() => {
  const theme = activeTheme();
  const byName = buildByName(theme);
  const items: ReviewItem[] = [];
  (Object.keys(theme.tokens) as TokenKind[]).forEach((kind) => {
    for (const token of theme.tokens[kind]) {
      if (token.status === "pending_review" && token.role === "override") {
        const base = token.refPath ? byName.get(token.refPath) : null;
        items.push({
          id: `review-${token.id}`,
          tokenId: token.id,
          tokenName: token.name,
          kind,
          reason: "override_pending",
          baseName: token.refPath ?? "(无引用)",
          oldValue: token.value,
          newValue: base?.resolvedValue ?? "(无法解析)",
          detectedAt: new Date().toLocaleString("zh-CN", { hour12: false }),
        });
      } else if (token.recomputed && token.role === "alias") {
        items.push({
          id: `review-${token.id}`,
          tokenId: token.id,
          tokenName: token.name,
          kind,
          reason: "alias_recomputed",
          baseName: token.refPath ?? "(无引用)",
          oldValue: token.refPath ?? "(引用来源)",
          newValue: token.resolvedValue,
          detectedAt: new Date().toLocaleString("zh-CN", { hour12: false }),
        });
      }
    }
  });
  return items;
});

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
      simulateWriteFailure: simulateWriteFailure(),
    }),
  );
});

function updateTheme(themeId: string, updater: (theme: Theme) => Theme): void {
  setThemes((current) => current.map((theme) => (theme.id === themeId ? updater(theme) : theme)));
}

/** 计算令牌的解析值（用于判断是否需要标记依赖受影响） */
function resolvedValueOf(token: DesignToken, byName: Map<string, DesignToken>): string {
  if (token.role === "alias" && token.refPath) {
    return resolveToken(token, byName).value;
  }
  return token.value;
}

export function useTokenStore() {
  const updateToken = (kind: TokenKind, id: string, patch: Partial<DesignToken>): void => {
    updateTheme(activeThemeId(), (theme) => {
      const before = theme.tokens[kind].find((token) => token.id === id);
      if (!before) return theme;
      const merged = normalizeToken({ ...before, ...patch });
      const byName = buildByName(theme);
      const beforeResolved = before.resolvedValue;
      const afterResolved = resolvedValueOf(merged, byName);
      const sources = new Set<string>();
      if (beforeResolved !== afterResolved) sources.add(merged.name);

      let next: Theme = {
        ...theme,
        tokens: {
          ...theme.tokens,
          [kind]: theme.tokens[kind].map((token) => (token.id === id ? merged : token)),
        },
      };

      // 令牌改名时，同步更新其他令牌的引用路径
      if (patch.name !== undefined && patch.name !== before.name) {
        const oldName = before.name;
        const newName = merged.name;
        (Object.keys(next.tokens) as TokenKind[]).forEach((k) => {
          next.tokens[k] = next.tokens[k].map((token) => {
            if (token.refPath !== oldName) return token;
            const updated = { ...token, refPath: newName };
            if (token.role === "alias") updated.value = `{${newName}}`;
            return normalizeToken(updated);
          });
        });
      }

      return reconcileTheme(next, sources);
    });
  };

  /** 设置或清除令牌的引用 */
  const setTokenRef = (kind: TokenKind, id: string, refPath: string | null): void => {
    updateTheme(activeThemeId(), (theme) => {
      const token = theme.tokens[kind].find((item) => item.id === id);
      if (!token) return theme;
      const merged = refPath
        ? normalizeToken({ ...token, value: `{${refPath}}`, refPath })
        : normalizeToken({ ...token, value: token.resolvedValue, refPath: null });
      const byName = buildByName(theme);
      const sources = new Set<string>();
      if (token.resolvedValue !== resolvedValueOf(merged, byName)) sources.add(merged.name);
      const next: Theme = {
        ...theme,
        tokens: {
          ...theme.tokens,
          [kind]: theme.tokens[kind].map((item) => (item.id === id ? merged : item)),
        },
      };
      return reconcileTheme(next, sources);
    });
  };

  /** 将别名转为显式覆盖（保留字面量，基值变更时待复核） */
  const convertToOverride = (kind: TokenKind, id: string, overrideValue: string): void => {
    updateTheme(activeThemeId(), (theme) => {
      const token = theme.tokens[kind].find((item) => item.id === id);
      if (!token || !token.refPath) return theme;
      const merged = normalizeToken({ ...token, value: overrideValue, refPath: token.refPath });
      const next: Theme = {
        ...theme,
        tokens: {
          ...theme.tokens,
          [kind]: theme.tokens[kind].map((item) => (item.id === id ? merged : item)),
        },
      };
      return reconcileTheme(next, new Set([merged.name]));
    });
  };

  /** 清除覆盖，恢复为别名引用 */
  const restoreAlias = (kind: TokenKind, id: string): void => {
    updateTheme(activeThemeId(), (theme) => {
      const token = theme.tokens[kind].find((item) => item.id === id);
      if (!token || !token.refPath) return theme;
      const merged = normalizeToken({ ...token, value: `{${token.refPath}}`, refPath: token.refPath });
      const next: Theme = {
        ...theme,
        tokens: {
          ...theme.tokens,
          [kind]: theme.tokens[kind].map((item) => (item.id === id ? merged : item)),
        },
      };
      return reconcileTheme(next, new Set([merged.name]));
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
            role: "base",
            refPath: null,
            resolvedValue: kind === "color" ? "#4f46e5" : kind === "shadow" ? "0 8px 24px rgb(0 0 0 / 0.12)" : "8px",
            status: "current",
            recomputed: false,
          },
        ],
      },
    }));
  };

  const removeToken = (kind: TokenKind, id: string): void => {
    updateTheme(activeThemeId(), (theme) => ({
      ...theme,
      tokens: { ...theme.tokens, [kind]: theme.tokens[kind].filter((token) => token.id !== id) },
    }));
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
      createdAt: new Date().toLocaleString("zh-CN", { hour12: false }),
      theme: structuredClone(activeTheme()),
    };
    setSnapshots((current) => [snapshot, ...current].slice(0, 20));
  };

  const replaceTheme = (theme: Theme): void => {
    setThemes((current) => [...current, theme]);
    setActiveThemeId(theme.id);
  };

  // === 导出包 ===

  const buildContent = (theme: Theme, format: ExportFormat): string => {
    if (format === "css") return toCssVariables(theme);
    if (format === "scss") return toSassVariables(theme);
    return toStyleDictionaryJson(theme);
  };

  /** 导出当前主题为一个新版本包；引用不完整时停在导出前 */
  const exportPackage = (format: ExportFormat): PackageRecord | null => {
    const theme = activeTheme();
    if (checkIntegrity(theme).length > 0) return null;
    const content = buildContent(theme, format);
    const fingerprint = canonicalFingerprint(theme);
    const version = packages().reduce((max, pkg) => Math.max(max, pkg.version), 0) + 1;
    const previous = currentPackage();
    const record: PackageRecord = {
      id: `pkg-${Date.now()}`,
      version,
      exportedAt: new Date().toLocaleString("zh-CN", { hour12: false }),
      fingerprint,
      format,
      content,
      tokenCount: countTokens(theme),
      status: "published",
      writeState: simulateWriteFailure() ? "failed" : "written",
      failureReason: simulateWriteFailure() ? "模拟写入失败：磁盘空间不足或权限错误，已保留上一版导出" : null,
      previousVersion: previous ? previous.version : null,
    };
    setPackages((current) => [...current, record]);
    if (record.writeState === "written") {
      const ext = format === "css" ? "css" : format === "scss" ? "scss" : "tokens.json";
      const mime = format === "css" ? "text/css" : format === "scss" ? "text/x-scss" : "application/json";
      downloadText(`${theme.id}.v${version}.${ext}`, content, mime);
    }
    return record;
  };

  /** 重试最近一次写盘失败的导出 */
  const retryExport = (): PackageRecord | null => {
    const failed = [...packages()].reverse().find((pkg) => pkg.writeState === "failed");
    if (!failed) return null;
    const theme = activeTheme();
    if (checkIntegrity(theme).length > 0) return null;
    const content = buildContent(theme, failed.format);
    const fingerprint = canonicalFingerprint(theme);
    const record: PackageRecord = {
      ...failed,
      exportedAt: new Date().toLocaleString("zh-CN", { hour12: false }),
      fingerprint,
      content,
      tokenCount: countTokens(theme),
      writeState: simulateWriteFailure() ? "failed" : "written",
      failureReason: simulateWriteFailure() ? "模拟写入失败：磁盘空间不足或权限错误，已保留上一版导出" : null,
    };
    setPackages((current) => current.map((pkg) => (pkg.id === failed.id ? record : pkg)));
    if (record.writeState === "written") {
      const ext = record.format === "css" ? "css" : record.format === "scss" ? "scss" : "tokens.json";
      const mime = record.format === "css" ? "text/css" : record.format === "scss" ? "text/x-scss" : "application/json";
      downloadText(`${theme.id}.v${record.version}.${ext}`, content, mime);
    }
    return record;
  };

  // === 产品回执与偏差 ===

  /** 登记产品回执；指纹与当前导出包不一致则进入偏差清单 */
  const recordReceipt = (productName: string, fingerprint: string): ProductReceipt => {
    const current = currentPackage();
    const synced = !!current && current.fingerprint === fingerprint.trim();
    const receipt: ProductReceipt = {
      id: `receipt-${Date.now()}`,
      productName: productName.trim() || "未命名产品",
      reportedAt: new Date().toLocaleString("zh-CN", { hour12: false }),
      fingerprint: fingerprint.trim(),
      packageVersion: current?.version ?? 0,
      synced,
    };
    setReceipts((currentList) => [receipt, ...currentList]);
    if (!synced) {
      const deviation: Deviation = {
        id: `dev-${Date.now()}`,
        productName: receipt.productName,
        receiptId: receipt.id,
        expected: current?.fingerprint ?? "(无已发布包)",
        actual: receipt.fingerprint,
        detectedAt: receipt.reportedAt,
        resolved: false,
      };
      setDeviations((currentList) => [deviation, ...currentList]);
    }
    return receipt;
  };

  const resolveDeviation = (id: string): void => {
    setDeviations((current) => current.map((item) => (item.id === id ? { ...item, resolved: true } : item)));
  };

  // === 复核 ===

  /** 维护员复核覆盖：保留覆盖（原值）或采用基值（变为别名引用） */
  const reviewOverride = (tokenId: string, action: "keep" | "adopt"): void => {
    updateTheme(activeThemeId(), (theme) => {
      const kind = (Object.keys(theme.tokens) as TokenKind[]).find((k) =>
        theme.tokens[k].some((token) => token.id === tokenId),
      );
      if (!kind) return theme;
      const token = theme.tokens[kind].find((item) => item.id === tokenId);
      if (!token || token.role !== "override") return theme;
      let merged: DesignToken;
      if (action === "adopt" && token.refPath) {
        merged = normalizeToken({ ...token, value: `{${token.refPath}}`, refPath: token.refPath, status: "current" });
      } else {
        merged = { ...token, status: "current", recomputed: false };
      }
      const next: Theme = {
        ...theme,
        tokens: {
          ...theme.tokens,
          [kind]: theme.tokens[kind].map((item) => (item.id === tokenId ? merged : item)),
        },
      };
      return reconcileTheme(next);
    });
  };

  /** 知悉别名已重算：清除重算标记 */
  const acknowledgeRecomputed = (tokenId: string): void => {
    updateTheme(activeThemeId(), (theme) => {
      const kind = (Object.keys(theme.tokens) as TokenKind[]).find((k) =>
        theme.tokens[k].some((token) => token.id === tokenId),
      );
      if (!kind) return theme;
      const next: Theme = {
        ...theme,
        tokens: {
          ...theme.tokens,
          [kind]: theme.tokens[kind].map((item) =>
            item.id === tokenId ? { ...item, recomputed: false, status: "current" } : item,
          ),
        },
      };
      return reconcileTheme(next);
    });
  };

  const clearAllReviews = (): void => {
    for (const item of reviewItems()) {
      if (item.reason === "override_pending") reviewOverride(item.tokenId, "keep");
      else acknowledgeRecomputed(item.tokenId);
    }
  };

  return {
    themes,
    activeTheme,
    activeThemeId,
    setActiveThemeId,
    snapshots,
    packages,
    receipts,
    deviations,
    simulateWriteFailure,
    setSimulateWriteFailure,
    integrityIssues,
    exportBlocked,
    currentPackage,
    reviewItems,
    updateToken,
    setTokenRef,
    convertToOverride,
    restoreAlias,
    addToken,
    removeToken,
    createTheme,
    saveSnapshot,
    replaceTheme,
    exportPackage,
    retryExport,
    recordReceipt,
    resolveDeviation,
    reviewOverride,
    acknowledgeRecomputed,
    clearAllReviews,
    reset: () => {
      const fresh = seedThemes();
      setThemes(fresh);
      setActiveThemeId(fresh[0].id);
      setSnapshots([]);
      setPackages([]);
      setReceipts([]);
      setDeviations([]);
      setSimulateWriteFailure(false);
    },
  };
}

function downloadText(filename: string, content: string, mime = "text/plain"): void {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
