import { For, Show, createMemo } from "solid-js";
import { Tabs } from "@kobalte/core/tabs";
import type { DesignToken, TokenKind, TokenRole, TokenStatus } from "../types/tokens";
import { TOKEN_LABELS } from "../utils/exporters";
import { contrastGrade, contrastRatio } from "../utils/color";
import { buildByName } from "../utils/reconcile";
import { useTokenStore } from "../stores/tokenStore";

const kinds: TokenKind[] = ["color", "fontSize", "spacing", "radius", "shadow", "motion"];

const ROLE_LABELS: Record<TokenRole, string> = {
  base: "基础",
  alias: "别名",
  override: "覆盖",
};

const STATUS_META: Record<TokenStatus, { label: string; cls: string } | null> = {
  current: null,
  stale: { label: "失效", cls: "bg-amber-100 text-amber-700" },
  pending_review: { label: "待复核", cls: "bg-orange-100 text-orange-700" },
  broken: { label: "断裂", cls: "bg-rose-100 text-rose-700" },
  cycle: { label: "成环", cls: "bg-rose-100 text-rose-700" },
};

function TokenRow(props: { token: DesignToken; kind: TokenKind }) {
  const store = useTokenStore();
  const isColor = () => props.kind === "color";
  const ratio = createMemo(() => {
    if (!isColor()) return 0;
    const background = store.activeTheme().tokens.color.find((token) => token.id === "color-surface")?.resolvedValue ?? "#fff";
    return contrastRatio(props.token.resolvedValue, background);
  });

  const allNames = createMemo(() => Array.from(buildByName(store.activeTheme()).keys()).sort());
  const statusMeta = () => STATUS_META[props.token.status];

  const onRefChange = (event: Event) => {
    const value = (event.currentTarget as HTMLSelectElement).value;
    store.setTokenRef(props.kind, props.token.id, value === "" ? null : value);
  };

  const makeOverride = () => {
    const value = window.prompt("覆盖值（保留原值，基值变更后标为待复核）", props.token.resolvedValue);
    if (value !== null) store.convertToOverride(props.kind, props.token.id, value);
  };

  return (
    <div class="grid grid-cols-[minmax(150px,1.2fr)_minmax(110px,0.8fr)_32px] gap-3 border-b border-slate-100 px-3 py-3 last:border-0">
      <div>
        <div class="flex items-center gap-2">
          <input
            class="w-full rounded-md border border-transparent bg-transparent px-2 py-1 font-mono text-xs font-semibold text-slate-800 outline-none transition focus:border-blue-300 focus:bg-white"
            value={props.token.name}
            onInput={(event) => store.updateToken(props.kind, props.token.id, { name: event.currentTarget.value })}
          />
          <span class={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
            props.token.role === "base" ? "bg-slate-100 text-slate-600"
              : props.token.role === "alias" ? "bg-blue-100 text-blue-700"
              : "bg-purple-100 text-purple-700"
          }`}>
            {ROLE_LABELS[props.token.role]}
          </span>
          <Show when={statusMeta()}>
            {(meta) => (
              <span class={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${meta().cls}`}>
                {meta().label}
              </span>
            )}
          </Show>
          <Show when={props.token.recomputed && props.token.status === "current"}>
            <span class="shrink-0 rounded-full bg-cyan-100 px-1.5 py-0.5 text-[10px] font-bold text-cyan-700">已重算</span>
          </Show>
        </div>
        <p class="mt-1 line-clamp-1 px-2 text-[11px] text-slate-400">{props.token.description}</p>
        <Show when={props.token.role !== "base" && props.token.refPath}>
          <p class="mt-0.5 px-2 font-mono text-[10px] text-slate-400">
            {props.token.role === "alias" ? "→ " : "⤺ 覆盖 "}
            {props.token.refPath}
          </p>
        </Show>
      </div>
      <div class="flex items-center gap-2">
        <Show when={isColor()}>
          <input
            type="color"
            class="h-8 w-8 shrink-0 cursor-pointer rounded-md border border-slate-200 bg-white p-0.5"
            value={props.token.resolvedValue.match(/^#[0-9a-f]{6}$/i) ? props.token.resolvedValue : "#000000"}
            onInput={(event) => store.updateToken(props.kind, props.token.id, { value: event.currentTarget.value })}
          />
        </Show>
        <input
          class="min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-2 py-1.5 font-mono text-xs outline-none focus:border-blue-400"
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
      <div class="col-span-2 col-start-2 flex flex-wrap items-center gap-2">
        <select
          class="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] outline-none focus:border-blue-400"
          value={props.token.refPath ?? ""}
          onChange={onRefChange}
          title="引用其他令牌（设为别名）"
        >
          <option value="">无引用（基础值）</option>
          <For each={allNames()}>
            {(name) => <option value={name} disabled={name === props.token.name}>{name}</option>}
          </For>
        </select>
        <Show when={props.token.role === "alias"}>
          <button
            class="rounded-md border border-purple-200 bg-purple-50 px-2 py-1 text-[11px] font-semibold text-purple-700 hover:bg-purple-100"
            onClick={makeOverride}
          >
            转为覆盖
          </button>
        </Show>
        <Show when={props.token.role === "override"}>
          <button
            class="rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-[11px] font-semibold text-blue-700 hover:bg-blue-100"
            onClick={() => store.restoreAlias(props.kind, props.token.id)}
          >
            恢复引用
          </button>
        </Show>
        <Show when={isColor()}>
          <span class="ml-auto flex items-center gap-2 rounded-md bg-slate-50 px-2 py-1">
            <span class="text-[11px] text-slate-500">对比度 {ratio().toFixed(2)}:1</span>
            <span
              class={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                ratio() >= 4.5 ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
              }`}
            >
              {contrastGrade(ratio())}
            </span>
          </span>
        </Show>
      </div>
    </div>
  );
}

export default function TokenEditor() {
  const store = useTokenStore();
  return (
    <section class="flex min-h-0 flex-1 flex-col rounded-xl border border-slate-200 bg-white shadow-sm">
      <div class="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <div>
          <h2 class="text-sm font-bold text-slate-800">令牌编辑器</h2>
          <p class="text-xs text-slate-400">基础值改动会失效重算别名，覆盖保留原值待复核</p>
        </div>
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
