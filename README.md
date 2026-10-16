# Qwen Models for GitHub Copilot Chat

Use Qwen Token Plan / DashScope models directly in Copilot Chat as a BYOK provider extension.

## Features

- Adds a `Qwen` provider in Copilot model picker
- Supports Token Plan text models (Qwen/DeepSeek/GLM) with per-model context windows (e.g. 983K for qwen3.8/3.7 flagships, 1M for GLM 5.x) and auto-discovery of model IDs from `/models` that inherits the built-in specs
- Thinking effort picker (none/high/max) for thinking-capable models; requests send Qwen's native `enable_thinking` switch
- Bilingual UI (English + 简体中文) for commands, settings, and usage panel
- Token Plan usage status bar + detail panel: 5-hour / weekly / monthly quota with reset times and plan name
- Custom endpoint and custom model support

## Setup

1. Open Command Palette and run `Qwen: Set API Key`
2. Select mode in settings:
   - `qwen-copilot.apiMode = coding-plan` for Token Plan
   - `qwen-copilot.apiMode = standard` for DashScope pay-as-you-go
3. Choose `qwen-copilot.region`:
   - Token Plan default: `token-plan.maas.qianwenaiapi.com/compatible-mode/v1`
   - Standard pay-as-you-go: `dashscope-intl.aliyuncs.com/compatible-mode/v1` or `dashscope.aliyuncs.com/compatible-mode/v1`

Optional:

- Set `qwen-copilot.baseUrl` for a custom compatible gateway
- Set `qwen-copilot.tokenPlanStatsEndpoint` if your usage endpoint differs
- Disable `qwen-copilot.enableModelDiscovery` if you prefer static model list only

## Usage visibility

The status bar queries Token Plan usage through the same gateways the official Qwen CLI uses:

1. **cs-data gateway** (`cs-data.qianwenai.com`) — monthly usage percentage, Bearer auth. If the gateway rejects the API key, the client automatically falls back to:
2. **Alibaba console RPC** (`queryCodingPlanInstanceInfoV2` on Model Studio / Bailian consoles) — 5-hour, weekly, and monthly quota with reset times, authenticated with your API key and region-aware commodity codes.

If both are unavailable, the panel shows **No data** instead of a hard failure. Click the status bar item to open the detail panel. A custom override endpoint is still supported via `qwen-copilot.tokenPlanStatsEndpoint` (both response shapes are detected automatically).

## Notes

- This extension stores API keys in VS Code SecretStorage.
- For latest endpoint and plan policy changes, check official docs:
  - Qwen AI Platform Token Plan: <https://platform.qianwenai.com/pricing/token-plan>
  - DashScope OpenAI-compatible endpoint guide: <https://www.alibabacloud.com/help/en/model-studio/compatibility-of-openai-with-dashscope>
