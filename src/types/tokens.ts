export type TokenKind = "color" | "fontSize" | "spacing" | "radius" | "shadow" | "motion";

/** 令牌角色：基础值（字面量）、别名（引用其他令牌）、显式覆盖（字面量覆盖引用） */
export type TokenRole = "base" | "alias" | "override";

/** 令牌状态：正常、失效待重算、待复核、引用断裂、成环 */
export type TokenStatus = "current" | "stale" | "pending_review" | "broken" | "cycle";

export interface DesignToken {
  id: string;
  name: string;
  /** 著录值：字面量或 "{引用路径}" */
  value: string;
  description: string;
  role: TokenRole;
  /** 别名/覆盖所引用的令牌路径（无引用时为 null） */
  refPath: string | null;
  /** 解析后的有效值，用于导出与预览 */
  resolvedValue: string;
  status: TokenStatus;
  /** 别名在基础值变更后被失效重算过（待维护员知悉） */
  recomputed: boolean;
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

// === 对账发布 ===

export type ExportFormat = "json" | "css" | "scss";

export type WriteState = "idle" | "writing" | "written" | "failed";

/** 导出包：每次导出生成一个版本，附带指纹与写盘状态 */
export interface PackageRecord {
  id: string;
  version: number;
  exportedAt: string;
  /** 包指纹：对规范化令牌内容计算的哈希 */
  fingerprint: string;
  format: ExportFormat;
  content: string;
  tokenCount: number;
  status: "published";
  writeState: WriteState;
  failureReason: string | null;
  /** 写盘失败时保留的上一版版本号 */
  previousVersion: number | null;
}

/** 产品回执：产品装包后回报的指纹 */
export interface ProductReceipt {
  id: string;
  productName: string;
  reportedAt: string;
  fingerprint: string;
  packageVersion: number;
  /** 回执指纹是否与当前导出包一致 */
  synced: boolean;
}

/** 偏差：回执指纹与导出包对不上 */
export interface Deviation {
  id: string;
  productName: string;
  receiptId: string;
  expected: string;
  actual: string;
  detectedAt: string;
  resolved: boolean;
}

export type ReviewReason = "override_pending" | "alias_recomputed";

/** 待复核项：显式覆盖待确认，或别名已重算待知悉 */
export interface ReviewItem {
  id: string;
  tokenId: string;
  tokenName: string;
  kind: TokenKind;
  reason: ReviewReason;
  baseName: string;
  /** 覆盖保留值 / 别名旧值 */
  oldValue: string;
  /** 基础值新值 / 别名新值 */
  newValue: string;
  detectedAt: string;
}

export interface IntegrityIssue {
  type: "broken" | "cycle";
  tokenName: string;
  refPath: string | null;
  message: string;
}
