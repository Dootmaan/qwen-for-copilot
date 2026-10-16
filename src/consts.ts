import type { QwenModel, ThinkingEffortSpec } from './types';

export const CONFIG_SECTION = 'qwen-copilot';
export const VENDOR_ID = 'qwen-copilot';
export const API_KEY_SECRET = 'qwen-copilot.apiKey';
export const WELCOME_SHOWN_KEY = 'qwen-copilot.welcomeShown';
export const WALKTHROUGH_ID = 'qwenGettingStarted';
export const LANGUAGE_MODEL_CHAT_SYSTEM_ROLE = 3;
export const DEFAULT_TOOLS_LIMIT = 128;

/**
 * OpenAI-compatible endpoints.
 *
 * Token Plan docs:
 * https://platform.qianwenai.com/docs/token-plan/personal/token-plan-personal-quickstart
 */
export const ENDPOINTS = {
	codingPlanInternational: 'https://token-plan.maas.qianwenaiapi.com/compatible-mode/v1',
	codingPlanChina: 'https://token-plan.maas.qianwenaiapi.com/compatible-mode/v1',
	standardInternational: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
	standardChina: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
} as const;

export const EXTERNAL_URLS = {
	codingPlanKeysInternational: 'https://platform.qianwenai.com/home/api-keys',
	codingPlanKeysChina: 'https://platform.qianwenai.com/home/api-keys',
	standardKeysInternational: 'https://platform.qianwenai.com/docs/api-reference/preparation/api-key',
	standardKeysChina: 'https://help.aliyun.com/zh/model-studio/get-api-key',
	docs: 'https://platform.qianwenai.com/docs',
	tokenPlanDashboardInternational: 'https://platform.qianwenai.com/home/analytics/token-plan/individual',
	tokenPlanDashboardChina: 'https://platform.qianwenai.com/home/analytics/token-plan/individual',
} as const;

/**
 * Token Plan usage — dual-source strategy.
 *
 * (A) cs-data gateway (official path used by the Qwen CLI, `QianWen-AI/qianwen-cli`):
 *     POST https://cs-data.qianwenai.com/data/api.json
 *     `?action=BroadScopeAspnGateway&product=sfm_bailian&api=zeldaHttp.apikeyMgr./tokenplan/personal/api/v2/<route>`
 *     Form-encoded body: `params` (JSON envelope with `cornerstoneParam`) + `region=cn-beijing`.
 *     The CLI authenticates with an OAuth-derived bearer token; the API key may be rejected —
 *     in that case we fall through to (B).
 * (B) Alibaba Model Studio console RPC (works with `sk-sp-` Token Plan API keys):
 *     POST https://modelstudio.console.alibabacloud.com/data/api.json (international)
 *     POST https://bailian.console.aliyun.com/data/api.json (china)
 *     `?action=zeldaEasy.broadscope-bailian.codingPlan.queryCodingPlanInstanceInfoV2`
 *     `&product=broadscope-bailian&api=queryCodingPlanInstanceInfoV2&currentRegionId=<region>`
 *
 * Both are stored as full request URLs; `UsageClient` derives the request shape from the URL.
 */
export const TOKEN_PLAN_USAGE_ENDPOINTS = {
	csDataGateway: 'https://cs-data.qianwenai.com/data/api.json',
	consoleRpcInternational: 'https://modelstudio.console.alibabacloud.com/data/api.json',
	consoleRpcChina: 'https://bailian.console.aliyun.com/data/api.json',
} as const;

/** cs-data gateway envelope constants (mirror of the official web console's gateway client). */
export const CSDATA_GATEWAY = {
	action: 'BroadScopeAspnGateway',
	product: 'sfm_bailian',
	region: 'cn-beijing',
	apiUsage: 'zeldaHttp.apikeyMgr./tokenplan/personal/api/v2/usage',
	apiSubscription: 'zeldaHttp.apikeyMgr./tokenplan/personal/api/v2/subscription',
	apiQuotaConfig: 'zeldaHttp.apikeyMgr./tokenplan/personal/api/v2/quota-config',
	subscriptionCommodityCode: 'sfm_tokenplansolo_public_cn',
} as const;

/** Alibaba Model Studio console RPC constants (queryCodingPlanInstanceInfoV2). */
export const CONSOLE_RPC = {
	action: 'zeldaEasy.broadscope-bailian.codingPlan.queryCodingPlanInstanceInfoV2',
	product: 'broadscope-bailian',
	api: 'queryCodingPlanInstanceInfoV2',
	internationalRegion: 'ap-southeast-1',
	chinaRegion: 'cn-beijing',
	commodityCodeInternational: 'sfm_codingplan_public_intl',
	commodityCodeChina: 'sfm_codingplan_public_cn',
} as const;

export const USAGE_MIN_REFRESH_MINUTES = 1;
export const USAGE_DEFAULT_REFRESH_MINUTES = 5;
export const USAGE_MAX_REFRESH_MINUTES = 1440;
export const USAGE_CACHE_STALE_MS = 60 * 60 * 1000;
export const USAGE_MANUAL_DEBOUNCE_MS = 30 * 1000;
export const USAGE_REQUEST_TIMEOUT_MS = 10_000;

export const RETRY_DEFAULT_MAX_RETRIES = 3;
export const RETRY_MAX_RETRIES_CEILING = 10;
export const RETRY_BASE_DELAY_MS = 1000;
export const RETRY_MAX_DELAY_MS = 10_000;

export const URI_PATHS = {
	setApiKey: '/setApiKey',
	showLogs: '/showLogs',
} as const;

const QWEN_REASONING_EFFORT: ThinkingEffortSpec = {
	levels: ['none', 'high', 'max'],
	default: 'high',
};

function textModel(
	id: string,
	overrides: Partial<
		QwenModel['capabilities'] &
			Pick<QwenModel, 'name' | 'detail' | 'maxInputTokens' | 'maxOutputTokens'>
	> = {},
): QwenModel {
	return {
		id,
		name: overrides.name ?? id,
		family: id.split(/[-.]/)[0] || 'qwen',
		version: 'token-plan',
		detail: overrides.detail ?? 'Token Plan model',
		maxInputTokens: overrides.maxInputTokens ?? 262144,
		maxOutputTokens: overrides.maxOutputTokens ?? 32768,
		capabilities: {
			toolCalling: DEFAULT_TOOLS_LIMIT,
			imageInput: overrides.imageInput === true,
			thinking: overrides.thinking === true,
			thinkingEffort: overrides.thinking === true ? QWEN_REASONING_EFFORT : undefined,
		},
		availableIn: ['coding-plan', 'standard'],
	};
}

/**
 * Built-in text-capable models from the current Token Plan supported list.
 * Source: platform.qianwenai.com token-plan overview + official model-spec pages.
 *
 * Context windows (official specs):
 * - qwen3.8/3.7 flagship: 1M total context — 983K input (thinking-mode safe) / 131K output.
 * - qwen3.6-flash: 262K context (verified via qwen-code model presets).
 * - glm-5.3/5.2: 1M context — 1M input / 128K output.
 * - deepseek v4 family: 256K context family — 262K input / 32K output.
 */
export const MODELS: QwenModel[] = [
	textModel('auto', {
		name: 'Auto',
		detail: 'Token Plan automatic routing',
		maxInputTokens: 983000,
		maxOutputTokens: 131000,
	}),
	textModel('qwen3.8-max', {
		thinking: true,
		imageInput: true,
		maxInputTokens: 983000,
		maxOutputTokens: 131000,
	}),
	textModel('qwen3.8-flash', {
		thinking: true,
		imageInput: true,
		maxInputTokens: 983000,
		maxOutputTokens: 131000,
	}),
	textModel('qwen3.7-max', {
		thinking: true,
		maxInputTokens: 983000,
		maxOutputTokens: 131000,
	}),
	textModel('qwen3.7-plus', {
		thinking: true,
		imageInput: true,
		maxInputTokens: 983000,
		maxOutputTokens: 131000,
	}),
	textModel('qwen3.6-flash', {
		thinking: true,
		imageInput: true,
		maxInputTokens: 262144,
		maxOutputTokens: 32768,
	}),
	textModel('deepseek-v4-pro', { maxInputTokens: 262144, maxOutputTokens: 32768 }),
	textModel('deepseek-v4-pro-0813', { maxInputTokens: 262144, maxOutputTokens: 32768 }),
	textModel('deepseek-v4-flash-0731', { maxInputTokens: 262144, maxOutputTokens: 32768 }),
	textModel('deepseek-v4.1-flash', { imageInput: true, maxInputTokens: 262144, maxOutputTokens: 32768 }),
	textModel('glm-5.3', { maxInputTokens: 1000000, maxOutputTokens: 128000 }),
	textModel('glm-5.2', { maxInputTokens: 1000000, maxOutputTokens: 128000 }),
];
