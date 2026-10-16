import * as vscode from 'vscode';
import { CONFIG_SECTION, DEFAULT_TOOLS_LIMIT, MODELS, RETRY_DEFAULT_MAX_RETRIES, RETRY_MAX_RETRIES_CEILING, USAGE_DEFAULT_REFRESH_MINUTES, USAGE_MAX_REFRESH_MINUTES, USAGE_MIN_REFRESH_MINUTES } from './consts';
import { t } from './i18n';
import type { ApiMode, CustomModelConfig, QwenModel, Region, ThinkingMode } from './types';

/** Read the `qwen-copilot` configuration section. */
function cfg(): vscode.WorkspaceConfiguration {
	return vscode.workspace.getConfiguration(CONFIG_SECTION);
}

/** Active API mode: `coding-plan` (subscription) or `standard` (pay-as-you-go). */
export function getApiMode(): ApiMode {
	return cfg().get<ApiMode>('apiMode', 'coding-plan');
}

/** Server region: `international` or `china` (for default DashScope endpoints). */
export function getRegion(): Region {
	return cfg().get<Region>('region', 'international');
}

/** User-supplied base URL override (empty = use the apiMode/region-derived endpoint). */
export function getBaseUrlOverride(): string {
	return (cfg().get<string>('baseUrl', '') ?? '').trim();
}

/** Optional override for Token Plan stats endpoint used by the usage panel. */
export function getTokenPlanStatsEndpointOverride(): string {
	return (cfg().get<string>('tokenPlanStatsEndpoint', '') ?? '').trim();
}

/** Whether to discover model IDs from the remote `/models` endpoint. */
export function getEnableModelDiscovery(): boolean {
	return cfg().get<boolean>('enableModelDiscovery', true);
}

/** Output-token cap, or `undefined` when unset (use the API default). */
export function getMaxTokens(): number | undefined {
	const value = cfg().get<number>('maxTokens', 0);
	return value && value > 0 ? value : undefined;
}

/** Map of picker model id → API model id overrides (for regional/proxy naming differences). */
export function getModelIdOverrides(): Record<string, string> {
	return cfg().get<Record<string, string>>('modelIdOverrides', {}) ?? {};
}

/** Resolve the API model id sent for a VS Code model id (override → id). */
export function getApiModelId(modelId: string): string {
	const override = getModelIdOverrides()[modelId];
	return override && override.trim() ? override.trim() : modelId;
}

/** Whether thinking/reasoning is enabled for thinking-capable models. */
export function getThinking(): ThinkingMode {
	return cfg().get<ThinkingMode>('thinking', 'enabled') === 'disabled' ? 'disabled' : 'enabled';
}

/** Whether verbose debug logging is enabled (Qwen output channel). */
export function getDebugLogging(): boolean {
	return cfg().get<boolean>('debugLogging', false);
}

/** Settings-based fallback API key (less secure; for CI/automation). */
export function getSettingsApiKey(): string {
	return (cfg().get<string>('apiKey', '') ?? '').trim();
}

/** User-defined models from the `customModels` setting, normalized to QwenModel. */
export function getCustomModels(): QwenModel[] {
	const raw = cfg().get<Array<string | CustomModelConfig>>('customModels', []) ?? [];
	const models: QwenModel[] = [];
	for (const entry of raw) {
		const config: CustomModelConfig = typeof entry === 'string' ? { id: entry } : entry;
		const id = (config.id ?? '').trim();
		if (!id) {
			continue;
		}
		models.push({
			id,
			name: config.name?.trim() || id,
			family: 'qwen',
			version: 'custom',
			detail: t('model.custom.detail'),
			maxInputTokens: config.maxInputTokens ?? 262144,
			maxOutputTokens: config.maxOutputTokens ?? 128000,
			capabilities: {
				toolCalling: config.toolCalling === false ? false : DEFAULT_TOOLS_LIMIT,
				imageInput: config.vision === true,
				thinking: config.thinking !== false,
			},
			availableIn: ['coding-plan', 'standard'],
		});
	}
	return models;
}

/**
 * Models to show in the picker: built-ins filtered by the active API mode
 * (unless a custom base URL is set), plus all custom models. Custom ids win.
 */
export function listProviderModels(discoveredModelIds: string[] = []): QwenModel[] {
	const customModels = getCustomModels();
	const customIds = new Set(customModels.map((model) => model.id));
	const discoveredModels = toDiscoveredModels(discoveredModelIds).filter(
		(model) => !customIds.has(model.id),
	);
	const discoveredIds = new Set(discoveredModels.map((model) => model.id));
	const useFilter = !getBaseUrlOverride();
	const apiMode = getApiMode();
	const builtins = MODELS.filter(
		(model) =>
			!customIds.has(model.id) &&
			!discoveredIds.has(model.id) &&
			(!useFilter || model.availableIn.includes(apiMode)),
	);
	return [...builtins, ...discoveredModels, ...customModels];
}

/** Find a model definition by id, searching custom models then built-ins. */
export function findModelDefinition(id: string): QwenModel | undefined {
	return getCustomModels().find((model) => model.id === id) ?? MODELS.find((model) => model.id === id);
}

/** Status-bar usage refresh interval in minutes (clamped to the allowed range). */
export function getUsageRefreshIntervalMinutes(): number {
	const value = cfg().get<number>('usageRefreshIntervalMinutes', USAGE_DEFAULT_REFRESH_MINUTES);
	return Math.min(USAGE_MAX_REFRESH_MINUTES, Math.max(USAGE_MIN_REFRESH_MINUTES, value));
}

/** Whether the usage status-bar item should be shown. */
export function getShowUsageStatusBar(): boolean {
	return cfg().get<boolean>('showUsageStatusBar', true);
}

/** Automatic retries for transient chat failures (0 disables), clamped to 0–RETRY_MAX_RETRIES_CEILING. */
export function getMaxRetries(): number {
	const value = cfg().get<number>('maxRetries', RETRY_DEFAULT_MAX_RETRIES);
	return Math.min(RETRY_MAX_RETRIES_CEILING, Math.max(0, Math.floor(value)));
}

/**
 * Convert `/models` ids into picker models. Ids that match a built-in or custom definition
 * inherit its full capabilities (thinking, effort spec, tool calling, token limits) so discovery
 * never *downgrades* a known model — only truly unknown ids get the bare fallback entry.
 */
function toDiscoveredModels(ids: string[]): QwenModel[] {
	const models: QwenModel[] = [];
	for (const rawId of ids) {
		const id = rawId.trim();
		if (!id || !isLikelyChatModelId(id)) {
			continue;
		}
		const builtin = findModelDefinition(id);
		if (builtin) {
			models.push({
				...builtin,
				version: 'discovered',
				detail: t('model.discovered.detail'),
			});
			continue;
		}
		models.push({
			id,
			name: id,
			family: id.split(/[-.]/)[0] || 'model',
			version: 'discovered',
			detail: t('model.discovered.detail'),
			maxInputTokens: 262144,
			maxOutputTokens: 32768,
			capabilities: {
				toolCalling: DEFAULT_TOOLS_LIMIT,
				imageInput: /(vision|vl|image|multimodal)/i.test(id),
				thinking: false,
			},
			availableIn: ['coding-plan', 'standard'],
		});
	}
	return models;
}

function isLikelyChatModelId(id: string): boolean {
	return !/(tts|asr|audio|video|embedding|rerank|speech|image-2\.0$|image-2\.0-pro$|image-3\.0-pro$)/i.test(
		id,
	);
}
