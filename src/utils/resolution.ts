import type { DesignToken, ResolutionError, Theme, TokenKind } from "../types/tokens";

const REF_PATTERN = /\{([^{}]+)\}/g;

/** 提取值表达式中的引用名，如 "{color.brand.primary}" -> ["color.brand.primary"] */
export function extractRefs(expression: string): string[] {
  const refs: string[] = [];
  for (const match of expression.matchAll(REF_PATTERN)) {
    refs.push(match[1].trim());
  }
  return refs;
}

export function allTokens(theme: Theme): DesignToken[] {
  return (Object.keys(theme.tokens) as TokenKind[]).flatMap((kind) => theme.tokens[kind]);
}

export interface ResolutionResult {
  /** 按令牌名的解析结果；解析失败的令牌回退为原始表达式 */
  byName: Record<string, string>;
  /** 按令牌 id 的解析结果 */
  byId: Record<string, string>;
  errors: ResolutionError[];
}

/**
 * 解析主题内全部令牌：别名跟随引用重算，显式覆盖保留字面值。
 * 引用断裂或成环时记录错误并指出卡住的令牌，导出流程据此停在导出前。
 */
export function resolveTheme(theme: Theme): ResolutionResult {
  const tokens = allTokens(theme);
  const tokenByName = new Map(tokens.map((token) => [token.name, token]));
  const errors: ResolutionError[] = [];
  const seen = new Set<string>();
  const pushError = (error: ResolutionError): void => {
    const key = `${error.tokenId}|${error.kind}|${error.ref ?? error.cycle?.join(">") ?? ""}`;
    if (seen.has(key)) return;
    seen.add(key);
    errors.push(error);
  };

  const memo = new Map<string, string>();
  const resolveName = (name: string, visiting: string[]): string | undefined => {
    const cached = memo.get(name);
    if (cached !== undefined) return cached;
    const token = tokenByName.get(name);
    if (!token) return undefined;
    if (visiting.includes(name)) {
      const cycle = [...visiting.slice(visiting.indexOf(name)), name];
      pushError({ tokenId: token.id, tokenName: token.name, kind: "cycle", cycle });
      return undefined;
    }
    let failed = false;
    const resolved = token.value.replace(REF_PATTERN, (whole, rawRef: string) => {
      const refName = rawRef.trim();
      if (!tokenByName.has(refName)) {
        pushError({ tokenId: token.id, tokenName: token.name, kind: "missing", ref: refName });
        failed = true;
        return whole;
      }
      const value = resolveName(refName, [...visiting, name]);
      if (value === undefined) {
        failed = true;
        return whole;
      }
      return value;
    });
    if (failed) return undefined;
    memo.set(name, resolved);
    return resolved;
  };

  const byName: Record<string, string> = {};
  const byId: Record<string, string> = {};
  tokens.forEach((token) => {
    const resolved = resolveName(token.name, []);
    byName[token.name] = resolved ?? token.value;
    byId[token.id] = resolved ?? token.value;
  });
  return { byName, byId, errors };
}

/** 令牌自身的依赖名：覆盖令牌追踪 sourceRef，其余追踪当前表达式 */
function dependencyNames(token: DesignToken): string[] {
  return extractRefs(token.override && token.sourceRef ? token.sourceRef : token.value);
}

/**
 * 返回依赖（含传递依赖）指定令牌名的所有令牌。
 * 基础值改动后用于失效标记：覆盖令牌标为待复核，普通别名由解析器自动重算。
 */
export function dependentTokens(theme: Theme, changedName: string): DesignToken[] {
  const tokens = allTokens(theme);
  const dependentsByName = new Map<string, DesignToken[]>();
  tokens.forEach((token) => {
    dependencyNames(token).forEach((dep) => {
      const list = dependentsByName.get(dep) ?? [];
      list.push(token);
      dependentsByName.set(dep, list);
    });
  });
  const affected = new Map<string, DesignToken>();
  const queue = [...(dependentsByName.get(changedName) ?? [])];
  while (queue.length) {
    const token = queue.shift()!;
    if (affected.has(token.id)) continue;
    affected.set(token.id, token);
    queue.push(...(dependentsByName.get(token.name) ?? []));
  }
  return [...affected.values()];
}

/** FNV-1a 32 位哈希，对排序后的扁平令牌计算包指纹 */
export function fingerprintTokens(flat: Record<string, string>): string {
  const text = Object.keys(flat)
    .sort()
    .map((name) => `${name}=${flat[name]}`)
    .join("\n");
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
