import { For, Show, createMemo } from "solid-js";
import { A } from "@solidjs/router";
import { Tabs } from "@kobalte/core/tabs";
import type { DesignToken, TokenKind } from "../types/tokens";
import { TOKEN_LABELS } from "../utils/exporters";
import { extractRefs } from "../utils/resolution";
import { contrastGrade, contrastRatio } from "../utils/color";
import { useTokenStore } from "../stores/tokenStore";

const kinds: TokenKind[] = ["color", "fontSize", "spacing", "radius", "shadow", "motion"];

function TokenRow(props: { token: DesignToken; kind: TokenKind }) {
  const store = useTokenStore();
  const isColor = () => props.kind === "color";
  const resolved = () => store.resolution().byId[props.token.id] ?? props.token.value;
  const isAlias = () => extractRefs(props.token.value).length > 0;
  const error = createMemo(() => store.resolution().errors.find((item) => item.tokenId === props.token.id));
  const ratio = createMemo(() => {
    if (!isColor()) return 0;
    const background = store.resolution().byName["color.surface.default"] ?? "#ffffff";
    return contrastRatio(resolved(), background);
  });

  return (
    <div class="grid grid-cols-[minmax(150px,1.2fr)_minmax(110px,0.8fr)_32px] gap-3 border-b border-slate-100 px-3 py-3 last:border-0">
      <div>
        <input
          class="w-full rounded-md border border-transparent bg-transparent px-2 py-1 font-mono text-xs font-semibold text-slate-800 outline-none transition focus:border-blue-300 focus:bg-white"
          value={props.token.name}
          onInput={(event) => store.updateToken(props.kind, props.token.id, { name: event.currentTarget.value })}
        />
        <div class="mt-1 flex items-center gap-1.5 px-2">
          <p class="line-clamp-1 text-[11px] text-slate-400">{props.token.description}</p>
          <Show when={isAlias()}>
            <span class="shrink-0 rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-bold text-blue-600">别名</span>
          </Show>
          <Show when={props.token.override}>
            <span class="shrink-0 rounded bg-violet-50 px-1.5 py-0.5 text-[10px] font-bold text-violet-600">覆盖</span>
          </Show>
          <Show when={props.token.pendingReview}>
            <span class="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">待复核</span>
          </Show>
        </div>
      </div>
      <div class="flex items-center gap-2">
        <Show when={isColor()}>
          <input
            type="color"
            class="h-8 w-8 shrink-0 cursor-pointer rounded-md border border-slate-200 bg-white p-0.5"
            value={resolved().match(/^#[0-9a-f]{6}$/i) ? resolved() : "#000000"}
            onInput={(event) => store.updateToken(props.kind, props.token.id, { value: event.currentTarget.value })}
          />
        </Show>
        <input
          class={`min-w-0 flex-1 rounded-md border bg-white px-2 py-1.5 font-mono text-xs outline-none focus:border-blue-400 ${error() ? "border-rose-300 bg-rose-50/50" : "border-slate-200"}`}
          value={props.token.value}
          onInput={(event) => store.updateToken(props.kind, props.token.id, { value: event.currentTarget.value })}
        />
      </div>
      <button
        class="rounded-md text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
        title="删除令牌"
        onClick={() => store.removeToken(props.kind, props.token.id)}
      >
        ×
      </button>
      <Show when={isAlias() || error()}>
        <div class="col-span-2 col-start-1 flex items-center gap-2 px-2 text-[11px]">
          <Show when={isAlias()}>
            <span class="text-slate-400">
              已重算 → <code class="font-mono font-semibold text-slate-600">{resolved()}</code>
            </span>
          </Show>
          <Show when={error()}>
            <span class="font-semibold text-rose-600">
              {error()!.kind === "missing" ? `引用断裂：${error()!.ref} 不存在` : `引用成环：${error()!.cycle?.join(" → ")}`}
            </span>
          </Show>
        </div>
      </Show>
      <Show when={isColor()}>
        <div class="col-span-2 col-start-2 flex items-center justify-between rounded-md bg-slate-50 px-2 py-1">
          <span class="text-[11px] text-slate-500">对比度 {ratio().toFixed(2)}:1</span>
          <span
            class={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
              ratio() >= 4.5 ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
            }`}
          >
            {contrastGrade(ratio())}
          </span>
        </div>
      </Show>
    </div>
  );
}

export default function TokenEditor() {
  const store = useTokenStore();
  const errorCount = createMemo(() => store.resolution().errors.length);
  const reviewCount = createMemo(
    () =>
      (Object.keys(store.activeTheme().tokens) as TokenKind[]).reduce(
        (count, kind) => count + store.activeTheme().tokens[kind].filter((token) => token.pendingReview).length,
        0,
      ),
  );
  return (
    <section class="flex min-h-0 flex-1 flex-col rounded-xl border border-slate-200 bg-white shadow-sm">
      <div class="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <div>
          <h2 class="text-sm font-bold text-slate-800">令牌编辑器</h2>
          <p class="text-xs text-slate-400">
            支持 <code class="rounded bg-slate-100 px-1 font-mono text-[11px]">{"{color.brand.primary}"}</code> 引用，改动实时重算
          </p>
        </div>
        <div class="flex items-center gap-2">
          <Show when={errorCount() > 0}>
            <A href="/reconcile" class="rounded-full bg-rose-100 px-2.5 py-1 text-xs font-bold text-rose-700 hover:bg-rose-200">
              {errorCount()} 处引用问题
            </A>
          </Show>
          <Show when={reviewCount() > 0}>
            <A href="/reconcile" class="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-700 hover:bg-amber-200">
              {reviewCount()} 枚待复核
            </A>
          </Show>
          <button
            class="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700"
            onClick={() => {
              const label = window.prompt("快照名称", `${store.activeTheme().name} ${new Date().toLocaleTimeString("zh-CN")}`);
              if (label !== null) store.saveSnapshot(label);
            }}
          >
            保存快照
          </button>
        </div>
      </div>

      <Tabs defaultValue="color" class="flex min-h-0 flex-1 flex-col">
        <Tabs.List class="flex flex-wrap gap-1 border-b border-slate-200 bg-slate-50/70 px-3 py-2">
          <For each={kinds}>
            {(kind) => (
              <Tabs.Trigger
                value={kind}
                class="rounded-md px-3 py-1.5 text-xs font-semibold text-slate-500 outline-none transition data-[selected]:bg-white data-[selected]:text-blue-700 data-[selected]:shadow-sm"
              >
                {TOKEN_LABELS[kind]}
              </Tabs.Trigger>
            )}
          </For>
        </Tabs.List>
        <For each={kinds}>
          {(kind) => (
            <Tabs.Content value={kind} class="scroll-area min-h-0 flex-1 overflow-y-auto">
              <div class="flex items-center justify-between border-b border-slate-100 px-3 py-2">
                <span class="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  {store.activeTheme().tokens[kind].length} 个令牌
                </span>
                <button class="text-xs font-semibold text-blue-600 hover:text-blue-800" onClick={() => store.addToken(kind)}>
                  + 添加令牌
                </button>
              </div>
              <For each={store.activeTheme().tokens[kind]}>
                {(token) => <TokenRow token={token} kind={kind} />}
              </For>
            </Tabs.Content>
          )}
        </For>
      </Tabs>
    </section>
  );
}
