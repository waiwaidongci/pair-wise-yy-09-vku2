import { For, Show, createMemo } from "solid-js";
import type { DesignToken, TokenKind } from "../types/tokens";
import { TOKEN_LABELS, downloadText, toCssVariables, toSassVariables } from "../utils/exporters";
import { PRODUCTS, useTokenStore } from "../stores/tokenStore";

const toneStyles: Record<string, string> = {
  slate: "bg-slate-100 text-slate-600",
  amber: "bg-amber-100 text-amber-700",
  emerald: "bg-emerald-100 text-emerald-700",
  rose: "bg-rose-100 text-rose-700",
};

export default function ReconcilePanel() {
  const store = useTokenStore();

  const errors = createMemo(() => store.resolution().errors);
  const themePackages = createMemo(() =>
    store.packages().filter((pkg) => pkg.themeId === store.activeThemeId()).slice().reverse(),
  );
  const currentPkg = createMemo(() => store.currentPackage(store.activeThemeId()));
  const dirty = createMemo(() => !currentPkg() || currentPkg()!.fingerprint !== store.draftFingerprint());

  const pendingReview = createMemo(() => {
    const theme = store.activeTheme();
    return (Object.keys(theme.tokens) as TokenKind[]).flatMap((kind) =>
      theme.tokens[kind].filter((token) => token.pendingReview).map((token) => ({ kind, token })),
    );
  });

  /** 覆盖令牌若恢复跟随引用，按当前基础值会重算出的结果 */
  const followValue = (token: DesignToken): string => {
    const expression = token.sourceRef ?? token.value;
    return expression.replace(/\{([^{}]+)\}/g, (whole, ref: string) => store.resolution().byName[ref.trim()] ?? whole);
  };

  const latestReceipt = (productId: string) => {
    const pkg = currentPkg();
    if (!pkg) return undefined;
    return store.receipts().find((receipt) => receipt.productId === productId && receipt.packageId === pkg.id);
  };

  const productState = (productId: string): { label: string; tone: string } => {
    if (!currentPkg()) return { label: "未发布", tone: "slate" };
    const receipt = latestReceipt(productId);
    if (!receipt) return { label: "待回报", tone: "amber" };
    return receipt.fingerprint === currentPkg()!.fingerprint
      ? { label: "已同步", tone: "emerald" }
      : { label: "偏差", tone: "rose" };
  };

  const syncedCount = createMemo(() => PRODUCTS.filter((product) => productState(product.id).label === "已同步").length);
  const allSynced = createMemo(() => syncedCount() === PRODUCTS.length);
  const openDeviations = createMemo(() => store.deviations().filter((item) => !item.resolvedAt));

  const packageVersion = (packageId: string): string => {
    const pkg = store.packages().find((item) => item.id === packageId);
    return pkg ? `v${pkg.version}` : "未知包";
  };

  return (
    <div class="scroll-area h-full min-h-0 overflow-y-auto pb-6">
      <div class="grid grid-cols-2 gap-4">
        {/* 发布导出包 */}
        <section class="col-span-2 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div class="flex flex-wrap items-center gap-4">
            <div>
              <h2 class="text-sm font-bold text-slate-800">发布导出包</h2>
              <p class="mt-0.5 text-xs text-slate-400">
                当前主题 · {store.activeTheme().name} · 待发布指纹
                <code class="ml-1 rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] font-bold text-slate-700">{store.draftFingerprint()}</code>
              </p>
            </div>
            <div class="flex items-center gap-2">
              <Show when={dirty()}>
                <span class="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700">有未发布改动</span>
              </Show>
              <Show when={!dirty() && currentPkg()}>
                <span class="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">与已发布一致</span>
              </Show>
              <Show when={pendingReview().length > 0}>
                <span class="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-700">
                  {pendingReview().length} 枚覆盖待复核
                </span>
              </Show>
            </div>
            <div class="ml-auto flex items-center gap-3">
              <label class="flex cursor-pointer items-center gap-1.5 text-xs text-slate-500">
                <input
                  type="checkbox"
                  class="accent-rose-600"
                  checked={store.failNextWrite()}
                  onChange={(event) => store.setFailNextWrite(event.currentTarget.checked)}
                />
                模拟下次写盘失败
              </label>
              <button
                class="rounded-lg bg-slate-900 px-4 py-2 text-xs font-bold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
                disabled={errors().length > 0}
                title={errors().length > 0 ? "存在引用问题，已停在导出前" : "解析全部令牌并发布导出包"}
                onClick={() => store.publish()}
              >
                发布导出包
              </button>
            </div>
          </div>

          <Show when={store.publishError()}>
            <div class="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
              {store.publishError()}
            </div>
          </Show>

          <Show when={errors().length > 0}>
            <div class="mt-3 rounded-lg border border-rose-200 bg-rose-50/60 p-3">
              <p class="text-xs font-bold text-rose-700">已停在导出前，以下令牌存在引用问题：</p>
              <ul class="mt-2 space-y-1.5">
                <For each={errors()}>
                  {(error) => (
                    <li class="flex items-center gap-2 text-xs">
                      <code class="rounded bg-white px-1.5 py-0.5 font-mono font-bold text-rose-700 shadow-sm">{error.tokenName}</code>
                      <Show
                        when={error.kind === "missing"}
                        fallback={<span class="text-rose-600">引用成环：{error.cycle?.join(" → ")}</span>}
                      >
                        <span class="text-rose-600">
                          引用断裂：引用了不存在的 <code class="font-mono font-semibold">{error.ref}</code>
                        </span>
                      </Show>
                    </li>
                  )}
                </For>
              </ul>
            </div>
          </Show>
        </section>

        {/* 复核队列 */}
        <section class="flex min-h-0 flex-col rounded-xl border border-slate-200 bg-white shadow-sm">
          <div class="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <div>
              <h2 class="text-sm font-bold text-slate-800">复核队列</h2>
              <p class="text-xs text-slate-400">基础值改动后，显式覆盖保留原值并在此等待复核</p>
            </div>
            <Show when={pendingReview().length > 0}>
              <div class="flex gap-2">
                <button class="rounded-md border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50" onClick={() => store.reviewAll("keep")}>
                  全部保留
                </button>
                <button class="rounded-md border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50" onClick={() => store.reviewAll("follow")}>
                  全部恢复跟随
                </button>
              </div>
            </Show>
          </div>
          <Show
            when={pendingReview().length > 0}
            fallback={<div class="flex flex-1 items-center justify-center p-8 text-sm text-slate-400">没有待复核的覆盖令牌。</div>}
          >
            <div class="scroll-area max-h-72 overflow-y-auto">
              <For each={pendingReview()}>
                {({ kind, token }) => (
                  <div class="flex items-center gap-3 border-b border-slate-100 px-4 py-3 last:border-0">
                    <span class="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-500">{TOKEN_LABELS[kind]}</span>
                    <div class="min-w-0 flex-1">
                      <code class="block truncate font-mono text-xs font-bold text-slate-800">{token.name}</code>
                      <p class="mt-1 text-[11px] text-slate-500">
                        保留值 <code class="font-mono font-semibold text-amber-700">{token.value}</code>
                        <span class="mx-1 text-slate-300">|</span>
                        跟随引用为 <code class="font-mono font-semibold text-emerald-700">{followValue(token)}</code>
                      </p>
                    </div>
                    <button
                      class="rounded-md border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                      onClick={() => store.reviewToken(kind, token.id, "keep")}
                    >
                      保留覆盖
                    </button>
                    <button
                      class="rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-500"
                      onClick={() => store.reviewToken(kind, token.id, "follow")}
                    >
                      恢复跟随
                    </button>
                  </div>
                )}
              </For>
            </div>
          </Show>
        </section>

        {/* 产品回执对账 */}
        <section class="flex min-h-0 flex-col rounded-xl border border-slate-200 bg-white shadow-sm">
          <div class="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <div>
              <h2 class="text-sm font-bold text-slate-800">产品回执对账</h2>
              <p class="text-xs text-slate-400">产品装包后回报指纹，与当前导出包逐台核对</p>
            </div>
            <span class={`rounded-full px-2.5 py-1 text-xs font-bold ${allSynced() ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
              {allSynced() ? "同步完成" : `同步未完成 · ${syncedCount()}/${PRODUCTS.length}`}
            </span>
          </div>
          <div class="scroll-area max-h-72 overflow-y-auto">
            <For each={PRODUCTS}>
              {(product) => {
                const state = createMemo(() => productState(product.id));
                const receipt = createMemo(() => latestReceipt(product.id));
                return (
                  <div class="flex items-center gap-3 border-b border-slate-100 px-4 py-3 last:border-0">
                    <div class="min-w-0 flex-1">
                      <p class="text-xs font-bold text-slate-800">{product.name}</p>
                      <p class="mt-0.5 font-mono text-[11px] text-slate-400">
                        {receipt() ? `回执 ${receipt()!.fingerprint} · ${receipt()!.receivedAt}` : "尚未回报"}
                      </p>
                    </div>
                    <span class={`rounded-full px-2 py-0.5 text-[11px] font-bold ${toneStyles[state().tone]}`}>{state().label}</span>
                    <div class="flex gap-1.5">
                      <button
                        class="rounded-md border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                        disabled={!currentPkg()}
                        title="模拟产品安装当前包并回报匹配指纹"
                        onClick={() => store.reportReceipt(product.id, "match")}
                      >
                        回报匹配
                      </button>
                      <button
                        class="rounded-md border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                        disabled={!currentPkg()}
                        title="模拟产品仍运行旧包，回报上一版指纹"
                        onClick={() => store.reportReceipt(product.id, "stale")}
                      >
                        回报旧指纹
                      </button>
                      <button
                        class="rounded-md border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                        disabled={!currentPkg()}
                        title="模拟产品本地包被改动，回报异常指纹"
                        onClick={() => store.reportReceipt(product.id, "corrupt")}
                      >
                        回报异常
                      </button>
                    </div>
                  </div>
                );
              }}
            </For>
          </div>
        </section>

        {/* 导出包列表 */}
        <section class="flex min-h-0 flex-col rounded-xl border border-slate-200 bg-white shadow-sm">
          <div class="border-b border-slate-200 px-4 py-3">
            <h2 class="text-sm font-bold text-slate-800">导出包</h2>
            <p class="text-xs text-slate-400">写盘失败的包保留记录可重试，上一版发布不受影响</p>
          </div>
          <Show
            when={themePackages().length > 0}
            fallback={<div class="flex flex-1 items-center justify-center p-8 text-sm text-slate-400">还没有导出包，点击“发布导出包”生成第一版。</div>}
          >
            <div class="scroll-area max-h-72 overflow-y-auto">
              <For each={themePackages()}>
                {(pkg) => (
                  <div class="flex items-center gap-3 border-b border-slate-100 px-4 py-3 last:border-0">
                    <span class="w-10 text-sm font-black text-slate-800">v{pkg.version}</span>
                    <div class="min-w-0 flex-1">
                      <code class="font-mono text-xs font-bold text-slate-700">{pkg.fingerprint}</code>
                      <p class="mt-0.5 text-[11px] text-slate-400">
                        {pkg.createdAt} · {Object.keys(pkg.tokens).length} 枚令牌
                        <Show when={pkg.error}>
                          <span class="ml-1 font-semibold text-rose-600">写盘失败：{pkg.error}</span>
                        </Show>
                      </p>
                    </div>
                    <Show
                      when={pkg.status === "published"}
                      fallback={
                        <button
                          class="rounded-md bg-rose-600 px-2.5 py-1 text-xs font-bold text-white hover:bg-rose-500"
                          onClick={() => store.retryPackage(pkg.id)}
                        >
                          重试写盘
                        </button>
                      }
                    >
                      <div class="flex gap-1.5">
                        <button
                          class="rounded-md border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
                          onClick={() => downloadText(`${pkg.themeId}-v${pkg.version}.css`, toCssVariables(pkg.tokens), "text/css")}
                        >
                          CSS
                        </button>
                        <button
                          class="rounded-md border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
                          onClick={() => downloadText(`${pkg.themeId}-v${pkg.version}.scss`, toSassVariables(pkg.tokens), "text/x-scss")}
                        >
                          Sass
                        </button>
                        <button
                          class="rounded-md border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
                          onClick={() => downloadText(`${pkg.themeId}-v${pkg.version}.tokens.json`, `${JSON.stringify(pkg.tokens, null, 2)}\n`, "application/json")}
                        >
                          JSON
                        </button>
                      </div>
                    </Show>
                  </div>
                )}
              </For>
            </div>
          </Show>
        </section>

        {/* 偏差清单 */}
        <section class="flex min-h-0 flex-col rounded-xl border border-slate-200 bg-white shadow-sm">
          <div class="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <div>
              <h2 class="text-sm font-bold text-slate-800">偏差清单</h2>
              <p class="text-xs text-slate-400">回执指纹与导出包对不上的记录，未结清不计入同步完成</p>
            </div>
            <span class={`rounded-full px-2.5 py-1 text-xs font-bold ${openDeviations().length ? "bg-rose-100 text-rose-700" : "bg-slate-100 text-slate-500"}`}>
              {openDeviations().length} 条未处理
            </span>
          </div>
          <Show
            when={store.deviations().length > 0}
            fallback={<div class="flex flex-1 items-center justify-center p-8 text-sm text-slate-400">暂无偏差，所有回执均与导出包一致。</div>}
          >
            <div class="scroll-area max-h-72 overflow-y-auto">
              <For each={store.deviations()}>
                {(deviation) => (
                  <div class={`flex items-center gap-3 border-b border-slate-100 px-4 py-3 last:border-0 ${deviation.resolvedAt ? "opacity-50" : ""}`}>
                    <div class="min-w-0 flex-1">
                      <p class="text-xs font-bold text-slate-800">
                        {PRODUCTS.find((product) => product.id === deviation.productId)?.name ?? deviation.productId}
                        <span class="ml-2 font-mono text-[11px] font-semibold text-slate-400">{packageVersion(deviation.packageId)}</span>
                      </p>
                      <p class="mt-0.5 font-mono text-[11px] text-slate-500">
                        期望 <span class="font-bold text-emerald-700">{deviation.expected}</span>
                        <span class="mx-1 text-slate-300">≠</span>
                        实收 <span class="font-bold text-rose-600">{deviation.actual}</span>
                      </p>
                      <p class="mt-0.5 text-[11px] text-slate-400">{deviation.detectedAt}</p>
                    </div>
                    <Show
                      when={!deviation.resolvedAt}
                      fallback={<span class="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-500">已处理</span>}
                    >
                      <button
                        class="rounded-md border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                        onClick={() => store.resolveDeviation(deviation.id)}
                      >
                        标记已处理
                      </button>
                    </Show>
                  </div>
                )}
              </For>
            </div>
          </Show>
        </section>
      </div>
    </div>
  );
}
