import type { DesignToken, Theme, TokenDifference, TokenKind } from "../types/tokens";
import { resolveTheme } from "./resolution";

export const TOKEN_LABELS: Record<TokenKind, string> = {
  color: "颜色",
  fontSize: "字号",
  spacing: "间距",
  radius: "圆角",
  shadow: "阴影",
  motion: "动效时长",
};

/** 解析后的扁平令牌（别名已重算），导出、预览与差异统一使用，避免停在编辑前的旧值 */
export function flattenResolved(theme: Theme): Record<string, string> {
  return resolveTheme(theme).byName;
}

function cssVariableName(name: string): string {
  return name.replace(/\./g, "-").replace(/[^a-zA-Z0-9-_]/g, "-");
}

export function toCssVariables(flat: Record<string, string>): string {
  const lines = Object.entries(flat).map(([name, value]) => `  --${cssVariableName(name)}: ${value};`);
  return `:root {\n${lines.join("\n")}\n}\n`;
}

export function toSassVariables(flat: Record<string, string>): string {
  const lines = Object.entries(flat).map(([name, value]) => `$${cssVariableName(name)}: ${value};`);
  return `${lines.join("\n")}\n`;
}

export function toStyleDictionaryJson(theme: Theme): string {
  const resolved = resolveTheme(theme).byId;
  const tree: Record<string, unknown> = {};
  (Object.keys(theme.tokens) as TokenKind[]).forEach((kind) => {
    theme.tokens[kind].forEach((token) => {
      const path = token.name.split(".");
      let branch = tree;
      path.forEach((segment, index) => {
        if (index === path.length - 1) {
          branch[segment] = {
            value: resolved[token.id] ?? token.value,
            type: kind === "motion" ? "time" : kind === "fontSize" ? "dimension" : kind,
            comment: token.description,
          };
          return;
        }
        branch[segment] = branch[segment] ?? {};
        branch = branch[segment] as Record<string, unknown>;
      });
    });
  });
  return `${JSON.stringify(tree, null, 2)}\n`;
}

export function downloadText(filename: string, content: string, mime = "text/plain"): void {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function parseImportedTheme(raw: string, fallback: Theme): Theme {
  const parsed = JSON.parse(raw) as Partial<Theme> | Record<string, string>;
  if ("tokens" in parsed && parsed.tokens) {
    return {
      id: `imported-${Date.now()}`,
      name: parsed.name ?? "导入主题",
      tokens: parsed.tokens as Theme["tokens"],
    };
  }

  const imported = parsed as Record<string, string>;
  const next: Theme = structuredClone(fallback);
  next.id = `imported-${Date.now()}`;
  next.name = "导入的令牌集";
  (Object.keys(next.tokens) as TokenKind[]).forEach((kind) => {
    next.tokens[kind] = next.tokens[kind].map((token) => ({
      ...token,
      value: token.name in imported ? imported[token.name] : token.value,
    }));
  });
  return next;
}

export function diffFlattened(before: Record<string, string>, after: Record<string, string>): TokenDifference[] {
  const names = Array.from(new Set([...Object.keys(before), ...Object.keys(after)])).sort();
  return names.reduce<TokenDifference[]>((differences, path) => {
    if (!(path in before)) {
      differences.push({ path, before: "未定义", after: after[path], kind: "added" });
      return differences;
    }
    if (!(path in after)) {
      differences.push({ path, before: before[path], after: "已移除", kind: "removed" });
      return differences;
    }
    if (before[path] !== after[path]) {
      differences.push({ path, before: before[path], after: after[path], kind: "changed" });
    }
    return differences;
  }, []);
}

export function diffThemes(before: Theme, after: Theme): TokenDifference[] {
  return diffFlattened(flattenResolved(before), flattenResolved(after));
}

export function tokenToCss(token: DesignToken): string {
  if (token.name.includes("font")) return `font-size:${token.value}`;
  if (token.name.includes("radius")) return `border-radius:${token.value}`;
  if (token.name.includes("shadow")) return `box-shadow:${token.value}`;
  return token.value;
}
