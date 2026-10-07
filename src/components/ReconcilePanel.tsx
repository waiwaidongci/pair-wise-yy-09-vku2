import { For, Show, createMemo, createSignal } from "solid-js";
import type { ExportFormat } from "../types/tokens";
import { useTokenStore } from "../stores/tokenStore";

const FORMAT_LABELS: Record<ExportFormat, string> = {
  json: "Style Dictionary JSON",
  css: "CSS Variables",
  scss: "Sass Variables",
};

function Section(props: { title: string; hint?: string; children: any }) {
  return (
    <section class="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div class="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <div>
          <h2 class="text-sm font-bold text-slate-800">{props.title}</h2>
          <Show when={props.hint}>
            <p class="text-xs text-slate-400">{props.hint}</p>
          </Show>
        </div>
      </div>
      <div class="p-4">{props.children}</div>
    </section>
  );
}

export default function ReconcilePanel() {
  const store = useTokenStore();
  const [format, setFormat] = createSignal<ExportFormat>("json");
  const [productName, setProductName] = createSignal("");
  const [receiptFingerprint, setReceiptFingerprint] = createSignal("");
  const [lastExportVersion, setLastExportVersion] = createSignal<number | null>(null);

  const sortedPackages = createMemo(() => [...store.packages()].sort((a, b) => b.version - a.version));
  const sortedReceipts = createMemo(() => [...store.receipts()].sort((a, b) => b.reportedAt.localeCompare(a.reportedAt)));
  const openDeviations = createMemo(() => store.deviations().filter((item) => !item.resolved));
  const resolvedDeviations = createMemo(() => store.deviations().filter((item) => item.resolved));

  const doExport = () => {
    const record = store.exportPackage(format());
    if (record) setLastExportVersion(record.version);
  };

  const doRetry = () => {
    const record = store.retryExport();
    if (record) setLastExportVersion(record.version);
  };

  const doRecordReceipt = () => {
    if (!productName().trim() || !receiptFingerprint().trim()) return;
    store.recordReceipt(productName(), receiptFingerprint());
    setProductName("");
    setReceiptFingerprint("");
  };

  const copyFingerprint = () => {
    const fp = store.currentPackage()?.fingerprint;
    if (fp) navigator.clipboard?.writeText(fp);
  };

  return (
    <div class="grid h-full min-h-0 grid-cols-[minmax(360px,1fr)_minmax(360px,1fr)] gap-4 overflow-y-auto pr-1">
      <div class="flex flex-col gap-4">
        {/* 引用完整性 */}
        <Section title="引用完整性" hint="导出前校验引用断裂与成环">
          <Show
            when={store.integrityIssues().length === 0}
            fallback={
              <div class="rounded-lg border border-rose-200 bg-rose-50 p-3">
                <p class="text-sm font-bold text-rose-700">存在引用问题，已停在导出前</p>
                <ul class="mt-2 space-y-1">
                  <For each={store.integrityIssues()}>
                    {(issue) => (
                      <li class="font-mono text-xs text-rose-600">
                        {issue.type === "cycle" ? "成环" : "断裂"} · 卡在 {issue.tokenName}
                        <Show when={issue.refPath}> → {issue.refPath}</Show>
                      </li>
                    )}
                  </For>
                </ul>
                <p class="mt-2 text-xs text-rose-500">请先修复上述令牌引用，再导出。</p>
              </div>
            }
          >
            <div class="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
              <span class="text-lg text-emerald-600">✓</span>
              <p class="text-sm font-semibold text-emerald-700">引用完整，无断裂或成环</p>
            </div>
          </Show>
        </Section>

        {/* 导出包 */}
        <Section title="导出包" hint="生成版本包并计算指纹，写盘失败保留上一版">
          <div class="flex flex-wrap items-center gap-2">
            <select
              class="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold outline-none"
              value={format()}
              onChange={(event) => setFormat(event.currentTarget.value as ExportFormat)}
            >
              <option value="json">{FORMAT_LABELS.json}</option>
              <option value="css">{FORMAT_LABELS.css}</option>
              <option value="scss">{FORMAT_LABELS.scss}</option>
            </select>
            <button
              class="rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-40"
              onClick={doExport}
              disabled={store.exportBlocked()}
            >
              导出新版本
            </button>
            <Show when={store.packages().some((pkg) => pkg.writeState === "failed")}>
              <button
                class="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-xs font-bold text-amber-700 hover:bg-amber-100"
                onClick={doRetry}
              >
                重试写入
              </button>
            </Show>
            <label class="ml-auto flex items-center gap-2 text-xs text-slate-500">
              <input
                type="checkbox"
                checked={store.simulateWriteFailure()}
                onChange={(event) => store.setSimulateWriteFailure(event.currentTarget.checked)}
              />
              模拟写盘失败
            </label>
          </div>

          <Show when={lastExportVersion() !== null}>
            <p class="mt-2 text-xs text-slate-500">已导出版本 v{lastExportVersion()}</p>
          </Show>

          <div class="mt-3 space-y-2">
            <For each={sortedPackages()}>
              {(pkg) => (
                <div class={`rounded-lg border p-3 ${pkg.writeState === "failed" ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-slate-50"}`}>
                  <div class="flex items-center justify-between">
                    <div class="flex items-center gap-2">
                      <span class="text-sm font-bold text-slate-800">v{pkg.version}</span>
                      <span class="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-slate-500">{FORMAT_LABELS[pkg.format]}</span>
                      <Show when={pkg.writeState === "failed"}>
                        <span class="rounded-full bg-amber-200 px-2 py-0.5 text-[10px] font-bold text-amber-800">写入失败</span>
                      </Show>
                      <Show when={pkg.writeState === "written"}>
                        <span class="rounded-full bg-emerald-200 px-2 py-0.5 text-[10px] font-bold text-emerald-800">已写入</span>
                      </Show>
                    </div>
                    <span class="text-[11px] text-slate-400">{pkg.exportedAt}</span>
                  </div>
                  <div class="mt-1 flex items-center gap-2">
                    <code class="truncate font-mono text-[11px] text-slate-600" title={pkg.fingerprint}>{pkg.fingerprint}</code>
                    <button class="text-[11px] font-semibold text-blue-600 hover:text-blue-800" onClick={copyFingerprint}>复制</button>
                  </div>
                  <Show when={pkg.failureReason}>
                    <p class="mt-1 text-[11px] text-amber-700">{pkg.failureReason}</p>
                  </Show>
                  <Show when={pkg.previousVersion !== null}>
                    <p class="mt-1 text-[11px] text-slate-500">已保留上一版 v{pkg.previousVersion}</p>
                  </Show>
                </div>
              )}
            </For>
            <Show when={sortedPackages().length === 0}>
              <p class="py-4 text-center text-xs text-slate-400">尚未导出包</p>
            </Show>
          </div>
        </Section>

        {/* 产品回执 */}
        <Section title="产品回执" hint="产品装包后回报指纹，不一致即进偏差清单">
          <div class="space-y-2">
            <input
              class="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs outline-none focus:border-blue-400"
              placeholder="产品名称，如：运营后台 / 门店端"
              value={productName()}
              onInput={(event) => setProductName(event.currentTarget.value)}
            />
            <div class="flex gap-2">
              <input
                class="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 font-mono text-xs outline-none focus:border-blue-400"
                placeholder="回报的包指纹"
                value={receiptFingerprint()}
                onInput={(event) => setReceiptFingerprint(event.currentTarget.value)}
              />
              <button
                class="rounded-lg bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-700 disabled:opacity-40"
                onClick={doRecordReceipt}
                disabled={!productName().trim() || !receiptFingerprint().trim()}
              >
                登记回执
              </button>
            </div>
            <Show when={store.currentPackage()}>
              <button class="text-[11px] font-semibold text-blue-600 hover:text-blue-800" onClick={copyFingerprint}>
                复制当前包指纹（v{store.currentPackage()?.version}）
              </button>
            </Show>
          </div>

          <div class="mt-3 space-y-2">
            <For each={sortedReceipts()}>
              {(receipt) => (
                <div class={`rounded-lg border p-3 ${receipt.synced ? "border-emerald-200 bg-emerald-50" : "border-rose-200 bg-rose-50"}`}>
                  <div class="flex items-center justify-between">
                    <span class="text-sm font-bold text-slate-800">{receipt.productName}</span>
                    <Show
                      when={receipt.synced}
                      fallback={<span class="rounded-full bg-rose-200 px-2 py-0.5 text-[10px] font-bold text-rose-800">未同步</span>}
                    >
                      <span class="rounded-full bg-emerald-200 px-2 py-0.5 text-[10px] font-bold text-emerald-800">已同步</span>
                    </Show>
                  </div>
                  <code class="mt-1 block truncate font-mono text-[11px] text-slate-600">{receipt.fingerprint}</code>
                  <p class="mt-1 text-[11px] text-slate-400">回报版本 v{receipt.packageVersion} · {receipt.reportedAt}</p>
                </div>
              )}
            </For>
            <Show when={sortedReceipts().length === 0}>
              <p class="py-4 text-center text-xs text-slate-400">暂无产品回执</p>
            </Show>
          </div>
        </Section>
      </div>

      <div class="flex flex-col gap-4">
        {/* 待复核 */}
        <Section title="待复核" hint="基础值变更后，覆盖保留原值待确认，别名已重算待知悉">
          <Show
            when={store.reviewItems().length > 0}
            fallback={
              <div class="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                <span class="text-lg text-emerald-600">✓</span>
                <p class="text-sm font-semibold text-emerald-700">无待复核项</p>
              </div>
            }
          >
            <div class="mb-2 flex justify-end">
              <button class="text-[11px] font-semibold text-blue-600 hover:text-blue-800" onClick={() => store.clearAllReviews()}>
                全部知悉
              </button>
            </div>
            <div class="space-y-2">
              <For each={store.reviewItems()}>
                {(item) => (
                  <div class="rounded-lg border border-orange-200 bg-orange-50 p-3">
                    <div class="flex items-center justify-between">
                      <span class="font-mono text-xs font-bold text-slate-800">{item.tokenName}</span>
                      <span class="rounded-full bg-orange-200 px-2 py-0.5 text-[10px] font-bold text-orange-800">
                        {item.reason === "override_pending" ? "覆盖待复核" : "别名已重算"}
                      </span>
                    </div>
                    <p class="mt-1 font-mono text-[11px] text-slate-500">引用自 {item.baseName}</p>
                    <div class="mt-2 grid grid-cols-2 gap-2 text-[11px]">
                      <div>
                        <p class="text-slate-400">{item.reason === "override_pending" ? "保留值" : "引用来源"}</p>
                        <code class="block truncate text-slate-700">{item.oldValue}</code>
                      </div>
                      <div>
                        <p class="text-slate-400">{item.reason === "override_pending" ? "基值新值" : "重算值"}</p>
                        <code class="block truncate text-emerald-700">{item.newValue}</code>
                      </div>
                    </div>
                    <Show when={item.reason === "override_pending"}>
                      <div class="mt-2 flex gap-2">
                        <button
                          class="rounded-md border border-purple-300 bg-white px-2 py-1 text-[11px] font-semibold text-purple-700 hover:bg-purple-100"
                          onClick={() => store.reviewOverride(item.tokenId, "keep")}
                        >
                          保留覆盖
                        </button>
                        <button
                          class="rounded-md border border-blue-300 bg-white px-2 py-1 text-[11px] font-semibold text-blue-700 hover:bg-blue-100"
                          onClick={() => store.reviewOverride(item.tokenId, "adopt")}
                        >
                          采用基值
                        </button>
                      </div>
                    </Show>
                    <Show when={item.reason === "alias_recomputed"}>
                      <div class="mt-2">
                        <button
                          class="rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100"
                          onClick={() => store.acknowledgeRecomputed(item.tokenId)}
                        >
                          已知悉
                        </button>
                      </div>
                    </Show>
                  </div>
                )}
              </For>
            </div>
          </Show>
        </Section>

        {/* 偏差清单 */}
        <Section title="偏差清单" hint="回执指纹与导出包不一致，不能算同步完成">
          <Show
            when={openDeviations().length > 0}
            fallback={
              <div class="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                <span class="text-lg text-emerald-600">✓</span>
                <p class="text-sm font-semibold text-emerald-700">无未解决偏差</p>
              </div>
            }
          >
            <div class="space-y-2">
              <For each={openDeviations()}>
                {(dev) => (
                  <div class="rounded-lg border border-rose-200 bg-rose-50 p-3">
                    <div class="flex items-center justify-between">
                      <span class="text-sm font-bold text-slate-800">{dev.productName}</span>
                      <span class="rounded-full bg-rose-200 px-2 py-0.5 text-[10px] font-bold text-rose-800">偏差</span>
                    </div>
                    <div class="mt-2 space-y-1 font-mono text-[11px]">
                      <p class="text-slate-500">期望 <code class="text-slate-700">{dev.expected}</code></p>
                      <p class="text-slate-500">实际 <code class="text-rose-700">{dev.actual}</code></p>
                    </div>
                    <button
                      class="mt-2 rounded-md border border-emerald-300 bg-white px-2 py-1 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-100"
                      onClick={() => store.resolveDeviation(dev.id)}
                    >
                      已重新同步
                    </button>
                  </div>
                )}
              </For>
            </div>
          </Show>
          <Show when={resolvedDeviations().length > 0}>
            <p class="mt-3 text-[11px] font-semibold text-slate-400">已解决（{resolvedDeviations().length}）</p>
            <div class="mt-1 space-y-1">
              <For each={resolvedDeviations()}>
                {(dev) => (
                  <div class="flex items-center justify-between rounded-md bg-slate-50 px-2 py-1 text-[11px] text-slate-400">
                    <span>{dev.productName}</span>
                    <span>已解决</span>
                  </div>
                )}
              </For>
            </div>
          </Show>
        </Section>
      </div>
    </div>
  );
}
