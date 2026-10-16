 

# Changelog

All notable changes to Qwen Models for GitHub Copilot Chat are documented here.

## 0.1.5

- **Rewrote the Token Plan usage query to the web console's real contract** - reverse-engineered the official `platform.qianwenai.com` Token Plan analytics bundle (`console-home/1.1.49/assets/analytics.js` + `shared.js`) and found the production wire shape: the gateway lives at `cs-data.qianwenai.com/data/api.json` (not `/cli/api.json`), takes `product=sfm_bailian&action=BroadScopeAspnGateway` in the query string, and the form-encoded body carries `params={Api,V,Data{cornerstoneParam}}&region`. The response exposes `per1WeekPercentage`/`per1WeekResetTime` (legacy 7-day plans) and `per1MonthPercentage`/`per1MonthResetTime` (current monthly plans, weekly limit removed 2026-09-22) as 0..1 ratios; both are now parsed into weekly + monthly status-bar metrics with reset times, mirroring the console's own normalizer.
- **Honest degradation instead of phantom errors** - the usage gateways authenticate with browser session cookies (or the CLI's OAuth token); plain `sk-sp-` API keys are rejected (`BailianGateway.Login.NotLogined` / `ConsoleNeedLogin`), and no API-key usage endpoint exists on the Token Plan inference host today. Auth failures now degrade to the neutral no-data state, so the status bar no longer reports misleading auth/server errors for keys that are perfectly valid for chat.
- Updated metric labels to the current plan semantics: the primary window is the subscription month (30 days from the subscription day), and the 5-hour quota wording was removed (that window belongs to the separate Bailian Coding Plan, not the Qwen Token Plan).

## 0.1.4

- **Aligned with the latest Copilot Chat LM provider conventions** - the language model provider contribution keeps `managementCommand` wired to `qwen-copilot.openSettings`, so the Qwen provider entry in the model picker exposes the manage-models action, and the per-model `configurationSchema` thinking-effort picker uses the current enum shape.
- **Fixed Token Plan usage query** - the usage status bar and details panel never showed quota because the plugin was calling endpoints that do not exist. Usage is now queried through the same gateways the official Qwen CLI uses: the cs-data gateway (`cs-data.qianwenai.com`, monthly usage percentage, Bearer auth) with automatic fallback to the Alibaba Model Studio / Bailian console RPC (`queryCodingPlanInstanceInfoV2`, 5-hour / weekly / monthly quota, region-aware commodity codes) when the gateway rejects the API key. The bar shows 5-hour, weekly, and monthly quota usage with reset times and the plan name.
- **Correct model context sizes** - context windows are now per-model instead of one flat 262144 for everything: qwen3.8/3.7 flagship models report 983000 input / 131000 output tokens, qwen3.6-flash 262144 / 32768, GLM 5.3/5.2 1000000 / 128000, and DeepSeek v4 models 262144 / 32768. Custom and discovered models inherit sensible defaults and no longer shrink the context.
- **Thinking effort selector restored** - models that support thinking (qwen3.8-max/flash, qwen3.7-max/plus) now expose the none/high/max effort picker again, and requests send the native Qwen `enable_thinking` switch alongside `thinking`/`reasoning_effort`.
- **New Qwen icon** - the extension icon is now a Qwen-branded purple-gradient "Q" mark (replacing the generic star), used in the marketplace listing and walkthrough resources.
- Dropped discontinued models from the picker (qwen3.6-plus, kimi-k2.x, glm-5.1/5, MiniMax-M2.5).

## 0.2.10

- **Standard API balance tracking** - the usage status bar and details panel now also work for the Standard API (pay-as-you-go) mode, not just Coding Plan. Cash balance (available, recharged, gifted, spent, frozen) and token resource packages are queried from both `z.ai` and `bigmodel.cn` account endpoints, which share the same JSON shape. The status bar turns red when the available balance reaches 0.
- **Full usage support matrix** - all four combinations now work: Coding Plan × {International, China} for quota tracking (5h/weekly token limits + monthly web searches), and Standard API × {International, China} for balance tracking (cash + token packages).
- **Status-bar warning colors** - the status bar now uses `statusBarItem.errorBackground` (VS Code theme error color) when any Coding Plan metric hits 100% or when the Standard API available balance reaches 0.
- Contributed by [@Dootmaan](https://github.com/Dootmaan) in [pull request 28](https://github.com/KiwiGaze/qwen-for-copilot/pull/28).

> 💡 If you encountered "No utility model is configured for 'copilot-utility-small' while the selected main agent model is BYOK." error during use, please change the "**Chat:** **Byok Utility Model Default**" option from "None" to "Main Agent Model" in VSCode settings.

## 0.2.9

- **Coding Plan usage for Mainland China** - the usage status bar and details panel now also work for the Coding Plan on the Mainland China (`bigmodel.cn`) region, not just the International (`z.ai`) region. Session (5-hour) and weekly (7-day, if available) token limits plus monthly web searches are queried from `open.bigmodel.cn/api/monitor/usage/quota/limit`, which shares the same JSON shape as the z.ai endpoint (only the host and auth scheme differ — the China monitor endpoint authenticates with the raw API key without the `Bearer` prefix). The gate no longer hides the bar for the China region. (#26 [Link to the PR](https://github.com/KiwiGaze/qwen-for-copilot/pull/26), thanks @Dootmaan [GitHub](https://github.com/Dootmaan))

## 0.2.8

- **Configurable retry limit** - new `qwen-copilot.maxRetries` setting (0–10) caps automatic retries for transient chat failures (HTTP 429 and 5xx). Set `0` to disable automatic retries and fail fast when rate limited. The default drops from 9 retries (10 total attempts) to 3 (4 total attempts), so peak-hour throttling no longer holds a request through ~1.5 minutes of backoff by default. (#20)

## 0.2.7

- **Retry with exponential backoff** - chat requests now retry transient Qwen API failures (HTTP 429 and 5xx) with exponential backoff and jitter before any output is streamed, honoring the server's `Retry-After` / `retry-after-ms` header when present. Up to 10 total attempts, 1s base delay, 10s cap. This clears rate-limit windows instead of failing fast, so the same API key that works in other Qwen clients no longer surfaces "HTTP 429 Too many requests" in Copilot Chat. Non-retryable errors (4xx) and exhausted retries still surface the existing user-facing error. Cancellation during a backoff wait aborts promptly.
- **Identifying User-Agent** - chat requests now send `User-Agent: qwen-copilot/<version>`. The z.ai Coding Plan gateway throttles unidentified HTTP clients more aggressively than known coding-tool traffic; sending a stable product User-Agent removes a source of spurious rate limits on top of the retry/backoff above.

## 0.2.6

- **Coding Plan usage tracking** - adds a Qwen usage status bar plus **Qwen: Refresh Usage**
  and **Qwen: Show Usage Details** commands for Session / Weekly / Web Searches quota,
  plan, renewal, reset, and last-updated details. Visible only for the Coding Plan on the
  International (z.ai) region. Note: this relies on z.ai usage endpoints that are not part
  of the public API and may change without notice; failures degrade gracefully to status states.

## 0.2.5

- **Marketplace identity** - moved the extension package to `yijiazhen-qi.qwen-for-github-copilot-chat` and updated install links, package metadata, and release artifact names.
- **Display name** - changed the visible Marketplace name to `Qwen Models for GitHub Copilot Chat`.
- **Migration note** - documented uninstalling the old `YijiazhenQi.qwen-for-copilot-chat` listing before installing the new one.
- **Docs cleanup** - aligned the settings title with the product name, refreshed the walkthrough model examples, and removed a stale project-plan reference from the contributing guide.

## 0.2.4

- **README badges** — replaced the retired Marketplace version and installs badges with active Marketplace links.

## 0.2.3

- **Mainland China Coding Plan** — `region: china` now routes Coding Plan requests to `open.bigmodel.cn/api/coding/paas/v4` instead of z.ai, and `Qwen: Get API Key` opens the bigmodel.cn coding-plan console. International Coding Plan and all Standard endpoints are unchanged; `region` defaults to `international`, so existing users are unaffected.
- **Display name update** — clarified the extension's GitHub Copilot Chat integration in the Marketplace name. No functional changes.

## 0.2.2

- **Qwen-5.2 Thinking Effort picker** — Qwen-5.2 gains a per-model Thinking Effort control (None / High / Max) in the Copilot model picker. None turns thinking off; High and Max select how deeply the model reasons. The choice persists per model.
- **Qwen-5.2 on the Standard API** — Qwen-5.2 is now available on the Standard API in addition to the Coding Plan, so it appears in the picker under both API modes.
- **Qwen-5.2 context window** — updated to 1M tokens.

## 0.2.1

- **Live thinking stream fix** — request `Accept-Encoding: identity` so z.ai's (nginx) edge does not gzip-buffer the SSE stream. Without it, `reasoning_content` deltas arrived batched and the "Thinking…" block only appeared after reasoning finished; now thinking tokens render live as they generate.
- **New extension icon** — the official z.ai logo (the white “Z” mark on its dark rounded tile) is now the extension icon.

## 0.2.0

- **New model lineup** — Qwen-4.7, Qwen-5, Qwen-5.1, and Qwen-5.2 join Qwen-4.5 Air in the picker (Qwen-4.6 removed).
- **Plan-aware picker** — the model list is filtered by your API Mode: Qwen-5 and Qwen-5.1 are Standard-API only, Qwen-5.2 is Coding-Plan only, while Qwen-4.7 and Qwen-4.5 Air work on both. You only ever see models your plan can serve. (With a custom `baseUrl`, all built-in models are shown.)
- **Custom models** — add your own model ids with the new `qwen-copilot.customModels` setting (plain id strings, or objects with `name`, token limits, and capability flags). Custom models always appear and target your active endpoint.
- **`modelIdOverrides`** — now a generic id-to-id map for any built-in model, for regional endpoints (bigmodel.cn) and proxies.

## 0.1.0

Initial release.

- **Qwen-4.6 and Qwen-4.5 Air in Copilot Chat** — both models appear in the Copilot Chat model picker via the VS Code Language Model Provider API.
- **Dual API support** — choose between a Z.ai Qwen Coding Plan subscription (`api.z.ai/api/coding/paas/v4`) and the Standard pay-as-you-go API (`api.z.ai` for International, `open.bigmodel.cn` for Mainland China).
- **Thinking mode** — toggle step-by-step reasoning on or off with the `qwen-copilot.thinking` setting.
- **Tool calling** — full support for OpenAI-compatible function calling; Copilot's agent mode and tool integrations work unchanged.
- **BYOK** — API key stored in VS Code SecretStorage (OS keychain). Never written to `settings.json`.
- **Onboarding walkthrough** — three-step guided setup: set API key, choose API mode, open the model picker.
- **`baseUrl` override** — point the extension at any OpenAI-compatible proxy or self-hosted Qwen endpoint.
- **`modelIdOverrides`** — remap VS Code model IDs to different API model names for compatible third-party endpoints.
- **i18n** — English and Simplified Chinese localizations (`package.nls.json`, `package.nls.zh-cn.json`).
- **Debug logging** — optional verbose output to the Qwen output channel (`Qwen: Show Logs`).
