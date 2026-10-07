import type { DesignToken, IntegrityIssue, Theme, TokenKind, TokenStatus } from "../types/tokens";

const REF_PATTERN = /^\{(.+)\}$/;

/** 从著录值中解析引用路径，无引用返回 null */
export function parseRef(value: string): string | null {
  const match = value.trim().match(REF_PATTERN);
  return match ? match[1].trim() : null;
}

export function isReference(value: string): boolean {
  return REF_PATTERN.test(value.trim());
}

/** 按令牌路径建立索引 */
export function buildByName(theme: Theme): Map<string, DesignToken> {
  const map = new Map<string, DesignToken>();
  for (const kind of Object.keys(theme.tokens) as TokenKind[]) {
    for (const token of theme.tokens[kind]) {
      map.set(token.name, token);
    }
  }
  return map;
}

/** 建立反向依赖图：被引用路径 -> 引用它的令牌路径集合 */
export function buildDependents(theme: Theme): Map<string, Set<string>> {
  const dependents = new Map<string, Set<string>>();
  for (const token of buildByName(theme).values()) {
    if (!token.refPath) continue;
    if (!dependents.has(token.refPath)) dependents.set(token.refPath, new Set());
    dependents.get(token.refPath)!.add(token.name);
  }
  return dependents;
}

/** 找出一组源令牌的所有传递依赖（别名链下游） */
export function findTransitiveDependents(theme: Theme, sourceNames: Set<string>): Set<string> {
  const dependents = buildDependents(theme);
  const result = new Set<string>();
  const queue = [...sourceNames];
  while (queue.length) {
    const current = queue.shift()!;
    const direct = dependents.get(current);
    if (!direct) continue;
    for (const dep of direct) {
      if (!result.has(dep)) {
        result.add(dep);
        queue.push(dep);
      }
    }
  }
  return result;
}

/**
 * 解析单个令牌的有效值。
 * - 基础值：返回字面量
 * - 别名：沿 refPath 递归解析，检测成环/断裂
 * - 显式覆盖：保留覆盖字面量，不随基值变动
 */
export function resolveToken(
  token: DesignToken,
  byName: Map<string, DesignToken>,
  stack: Set<string> = new Set(),
): { value: string; status: TokenStatus; stuckAt: string | null } {
  if (token.role === "base") {
    return { value: token.value, status: "current", stuckAt: null };
  }
  if (token.role === "override") {
    return { value: token.value, status: "current", stuckAt: null };
  }
  const ref = token.refPath;
  if (!ref) {
    return { value: token.value, status: "broken", stuckAt: token.name };
  }
  if (stack.has(token.name)) {
    return { value: token.value, status: "cycle", stuckAt: token.name };
  }
  const target = byName.get(ref);
  if (!target) {
    return { value: token.value, status: "broken", stuckAt: ref };
  }
  stack.add(token.name);
  const resolved = resolveToken(target, byName, stack);
  stack.delete(token.name);
  if (resolved.status === "broken" || resolved.status === "cycle") {
    return { value: resolved.value, status: resolved.status, stuckAt: resolved.stuckAt };
  }
  return { value: resolved.value, status: "current", stuckAt: null };
}

/** 检测引用图中的环，返回成环处的令牌路径；无环返回 null */
export function findCycle(theme: Theme): string | null {
  const byName = buildByName(theme);
  const visited = new Set<string>();
  const stack = new Set<string>();

  const dfs = (name: string): string | null => {
    if (stack.has(name)) return name;
    if (visited.has(name)) return null;
    visited.add(name);
    stack.add(name);
    const token = byName.get(name);
    if (token && token.role === "alias" && token.refPath) {
      const stuck = dfs(token.refPath);
      if (stuck) return stuck;
    }
    stack.delete(name);
    return null;
  };

  for (const name of byName.keys()) {
    const stuck = dfs(name);
    if (stuck) return stuck;
  }
  return null;
}

/** 找出所有断裂引用（别名/覆盖的 refPath 指向不存在的令牌） */
export function findBrokenRefs(theme: Theme): IntegrityIssue[] {
  const byName = buildByName(theme);
  const issues: IntegrityIssue[] = [];
  for (const token of byName.values()) {
    if (token.role === "alias" && token.refPath && !byName.has(token.refPath)) {
      issues.push({
        type: "broken",
        tokenName: token.name,
        refPath: token.refPath,
        message: `别名 ${token.name} 引用了不存在的令牌 ${token.refPath}`,
      });
    }
  }
  return issues;
}

/** 引用完整性检查：返回成环与断裂问题列表 */
export function checkIntegrity(theme: Theme): IntegrityIssue[] {
  const issues = findBrokenRefs(theme);
  const cycleStuck = findCycle(theme);
  if (cycleStuck) {
    issues.push({
      type: "cycle",
      tokenName: cycleStuck,
      refPath: null,
      message: `引用成环，卡在令牌 ${cycleStuck}`,
    });
  }
  return issues;
}

/**
 * 规范化令牌：根据著录值推导角色与引用路径。
 * - 著录值为 "{路径}" → 别名
 * - 著录值为字面量且有 refPath → 显式覆盖
 * - 否则 → 基础值
 */
export function normalizeToken(token: DesignToken): DesignToken {
  const ref = parseRef(token.value);
  if (ref) {
    return { ...token, role: "alias", refPath: ref };
  }
  if (token.refPath) {
    return { ...token, role: "override" };
  }
  return { ...token, role: "base", refPath: null };
}

/**
 * 对账：重算主题内所有令牌的有效值与状态。
 * @param changedSourceNames 本次被直接改动的源令牌路径集合；其传递依赖会被标记为受影响。
 */
export function reconcileTheme(theme: Theme, changedSourceNames: Set<string> = new Set()): Theme {
  const byName = buildByName(theme);
  const affected = changedSourceNames.size
    ? findTransitiveDependents(theme, changedSourceNames)
    : new Set<string>();

  const next: Theme = { ...theme, tokens: { ...theme.tokens } };

  (Object.keys(next.tokens) as TokenKind[]).forEach((kind) => {
    next.tokens[kind] = next.tokens[kind].map((token) => {
      const resolved = resolveToken(token, byName);
      let status: TokenStatus = resolved.status;
      let recomputed = token.recomputed;

      if (token.role === "base") {
        status = "current";
        recomputed = false;
      } else if (token.role === "override") {
        if (affected.has(token.name)) {
          status = "pending_review";
        } else if (status === "current") {
          status = token.status === "pending_review" ? "pending_review" : "current";
        }
      } else if (token.role === "alias") {
        if (affected.has(token.name) && status === "current") {
          recomputed = true;
        }
      }

      return { ...token, resolvedValue: resolved.value, status, recomputed };
    });
  });

  return next;
}

/** 生成字符串的 cyrb53 哈希（64 位，十六进制），用作包指纹 */
export function cyrb53(str: string, seed = 0): string {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097152 + (h2 >>> 0)) + (h1 >>> 0)).toString(16).padStart(16, "0");
}

/** 计算主题的规范化指纹：对排序后的 "名称=有效值" 行取哈希 */
export function canonicalFingerprint(theme: Theme): string {
  const byName = buildByName(theme);
  const lines: string[] = [];
  for (const name of Array.from(byName.keys()).sort()) {
    lines.push(`${name}=${byName.get(name)!.resolvedValue}`);
  }
  return cyrb53(lines.join("\n"));
}

/** 统计主题中的令牌总数 */
export function countTokens(theme: Theme): number {
  return (Object.keys(theme.tokens) as TokenKind[]).reduce((sum, kind) => sum + theme.tokens[kind].length, 0);
}
