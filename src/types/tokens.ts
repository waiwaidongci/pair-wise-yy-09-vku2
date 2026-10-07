export type TokenKind = "color" | "fontSize" | "spacing" | "radius" | "shadow" | "motion";

export interface DesignToken {
  id: string;
  name: string;
  /** 字面值或引用表达式，如 "{color.brand.primary}" */
  value: string;
  description: string;
  /** 显式覆盖：基础值变化时保留字面值，不跟随引用重算 */
  override?: boolean;
  /** 覆盖前的引用表达式，用于依赖追踪与“恢复跟随” */
  sourceRef?: string;
  /** 依赖的基础值已变化，等待维护员复核 */
  pendingReview?: boolean;
}

export interface Theme {
  id: string;
  name: string;
  tokens: Record<TokenKind, DesignToken[]>;
}

export interface Snapshot {
  id: string;
  label: string;
  createdAt: string;
  theme: Theme;
}

export interface TokenDifference {
  path: string;
  before: string;
  after: string;
  kind: "changed" | "added" | "removed";
}

/** 引用解析错误：断裂或成环 */
export interface ResolutionError {
  tokenId: string;
  tokenName: string;
  kind: "missing" | "cycle";
  /** kind 为 missing 时不存在的引用名 */
  ref?: string;
  /** kind 为 cycle 时的成环路径 */
  cycle?: string[];
}

/** 一次导出的令牌包，指纹由解析后的扁平令牌计算 */
export interface ExportPackage {
  id: string;
  themeId: string;
  themeName: string;
  version: number;
  createdAt: string;
  fingerprint: string;
  /** 解析后的扁平令牌（name -> 最终值） */
  tokens: Record<string, string>;
  status: "published" | "failed";
  /** 写盘失败原因 */
  error?: string;
}

export interface Product {
  id: string;
  name: string;
}

/** 产品装包后回报的指纹回执 */
export interface ProductReceipt {
  id: string;
  productId: string;
  packageId: string;
  fingerprint: string;
  receivedAt: string;
  note: string;
}

/** 回执指纹与导出包对不上时进入偏差清单 */
export interface Deviation {
  id: string;
  productId: string;
  packageId: string;
  expected: string;
  actual: string;
  detectedAt: string;
  resolvedAt?: string;
}
