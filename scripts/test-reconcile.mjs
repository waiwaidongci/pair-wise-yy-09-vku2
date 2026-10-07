// 对账引擎逻辑验证（不依赖 SolidJS）
// 运行：node --experimental-vm-modules scripts/test-reconcile.mjs

import {
  buildByName,
  canonicalFingerprint,
  checkIntegrity,
  findCycle,
  findBrokenRefs,
  normalizeToken,
  reconcileTheme,
  resolveToken,
} from "/tmp/reconcile-compiled/utils/reconcile.js";

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${message}`);
  } else {
    failed++;
    console.error(`  ✗ ${message}`);
  }
}

function makeTheme(tokens) {
  return {
    id: "test",
    name: "测试",
    tokens: {
      color: tokens,
      fontSize: [],
      spacing: [],
      radius: [],
      shadow: [],
      motion: [],
    },
  };
}

function token(id, name, value, role = "base", refPath = null) {
  return {
    id,
    name,
    value,
    description: "",
    role,
    refPath,
    resolvedValue: value,
    status: "current",
    recomputed: false,
  };
}

console.log("\n[1] 基础值解析");
{
  const theme = makeTheme([token("b", "color.brand", "#356ae6")]);
  const byName = buildByName(theme);
  const result = resolveToken(theme.tokens.color[0], byName);
  assert(result.value === "#356ae6", "基础值返回字面量");
}

console.log("\n[2] 别名解析（引用基础值）");
{
  const theme = makeTheme([
    token("b", "color.brand", "#356ae6"),
    token("a", "color.action", "{color.brand}", "alias", "color.brand"),
  ]);
  const byName = buildByName(theme);
  const result = resolveToken(theme.tokens.color[1], byName);
  assert(result.value === "#356ae6", "别名解析为基础值");
}

console.log("\n[3] 别名链解析（别名→别名→基础值）");
{
  const theme = makeTheme([
    token("b", "color.brand", "#356ae6"),
    token("a1", "color.action", "{color.brand}", "alias", "color.brand"),
    token("a2", "color.hover", "{color.action}", "alias", "color.action"),
  ]);
  const byName = buildByName(theme);
  const result = resolveToken(theme.tokens.color[2], byName);
  assert(result.value === "#356ae6", "别名链解析到基础值");
}

console.log("\n[4] 显式覆盖保留原值");
{
  const theme = makeTheme([
    token("b", "color.brand", "#356ae6"),
    token("o", "color.action", "#ff5500", "override", "color.brand"),
  ]);
  const byName = buildByName(theme);
  const result = resolveToken(theme.tokens.color[1], byName);
  assert(result.value === "#ff5500", "覆盖保留字面量");
}

console.log("\n[5] 基础值变更后：别名失效重算，覆盖待复核");
{
  const theme = makeTheme([
    token("b", "color.brand", "#356ae6"),
    token("a", "color.focus", "{color.brand}", "alias", "color.brand"),
    token("o", "color.action", "#ff5500", "override", "color.brand"),
  ]);
  // 改基础值
  theme.tokens.color[0].value = "#16845b";
  const reconciled = reconcileTheme(theme, new Set(["color.brand"]));
  const focus = reconciled.tokens.color.find((t) => t.name === "color.focus");
  const action = reconciled.tokens.color.find((t) => t.name === "color.action");
  assert(focus.resolvedValue === "#16845b", "别名重算为新基值");
  assert(focus.recomputed === true, "别名标记已重算");
  assert(action.resolvedValue === "#ff5500", "覆盖保留原值");
  assert(action.status === "pending_review", "覆盖标记待复核");
}

console.log("\n[6] 引用成环检测");
{
  const theme = makeTheme([
    token("a", "color.a", "{color.b}", "alias", "color.b"),
    token("b", "color.b", "{color.a}", "alias", "color.a"),
  ]);
  const cycle = findCycle(theme);
  assert(cycle !== null, "检测到成环");
  const issues = checkIntegrity(theme);
  assert(issues.some((i) => i.type === "cycle"), "完整性报告成环问题");
}

console.log("\n[7] 引用断裂检测");
{
  const theme = makeTheme([
    token("a", "color.a", "{color.missing}", "alias", "color.missing"),
  ]);
  const broken = findBrokenRefs(theme);
  assert(broken.length === 1, "检测到断裂引用");
  assert(broken[0].refPath === "color.missing", "报告缺失路径");
}

console.log("\n[8] 规范化：著录值推导角色");
{
  const t1 = normalizeToken(token("x", "color.x", "{color.brand}", "base", null));
  assert(t1.role === "alias" && t1.refPath === "color.brand", "引用值→别名");
  const t2 = normalizeToken(token("y", "color.y", "#ff0000", "alias", "color.brand"));
  assert(t2.role === "override", "有引用+字面量→覆盖");
  const t3 = normalizeToken(token("z", "color.z", "#00ff00", "base", null));
  assert(t3.role === "base", "无引用+字面量→基础");
}

console.log("\n[9] 指纹稳定性");
{
  const theme1 = makeTheme([
    token("b", "color.brand", "#356ae6"),
    token("a", "color.action", "{color.brand}", "alias", "color.brand"),
  ]);
  const theme2 = makeTheme([
    token("b", "color.brand", "#356ae6"),
    token("a", "color.action", "{color.brand}", "alias", "color.brand"),
  ]);
  const fp1 = canonicalFingerprint(reconcileTheme(theme1));
  const fp2 = canonicalFingerprint(reconcileTheme(theme2));
  assert(fp1 === fp2, "相同内容指纹一致");
  theme2.tokens.color[0].value = "#16845b";
  const fp3 = canonicalFingerprint(reconcileTheme(theme2, new Set(["color.brand"])));
  assert(fp1 !== fp3, "基值变更后指纹变化");
}

console.log("\n[10] 成环/断裂时完整性检查阻止导出");
{
  const brokenTheme = makeTheme([
    token("a", "color.a", "{color.missing}", "alias", "color.missing"),
  ]);
  assert(checkIntegrity(brokenTheme).length > 0, "断裂引用阻止导出");
  const cycleTheme = makeTheme([
    token("a", "color.a", "{color.b}", "alias", "color.b"),
    token("b", "color.b", "{color.a}", "alias", "color.a"),
  ]);
  assert(checkIntegrity(cycleTheme).length > 0, "成环引用阻止导出");
}

console.log(`\n${"=".repeat(50)}`);
console.log(`结果：${passed} 通过，${failed} 失败`);
process.exit(failed > 0 ? 1 : 0);
