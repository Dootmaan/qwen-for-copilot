import { CONSOLE_RPC, ENDPOINTS, EXTERNAL_URLS, TOKEN_PLAN_USAGE_ENDPOINTS } from './consts';
import { getApiMode, getBaseUrlOverride, getRegion, getTokenPlanStatsEndpointOverride } from './config';

/** Trim and strip trailing slashes from a URL. */
export function normalizeBaseUrl(url: string): string {
	return url.trim().replace(/\/+$/, '');
}

/**
 * Resolve the chat-completions base URL from settings.
 * Override wins; otherwise derive from apiMode (+ region for standard mode).
 */
export function resolveBaseUrl(): string {
	const override = getBaseUrlOverride();
	if (override) {
		return normalizeBaseUrl(override);
	}
	const china = getRegion() === 'china';
	if (getApiMode() === 'coding-plan') {
		return china ? ENDPOINTS.codingPlanChina : ENDPOINTS.codingPlanInternational;
	}
	return china ? ENDPOINTS.standardChina : ENDPOINTS.standardInternational;
}

/** The key-management page that matches the current apiMode/region. */
export function resolveKeyPageUrl(): string {
	const china = getRegion() === 'china';
	if (getApiMode() === 'coding-plan') {
		return china ? EXTERNAL_URLS.codingPlanKeysChina : EXTERNAL_URLS.codingPlanKeysInternational;
	}
	return china ? EXTERNAL_URLS.standardKeysChina : EXTERNAL_URLS.standardKeysInternational;
}

/** Resolve the preferred Token Plan usage endpoint (first candidate). */
export function resolveTokenPlanStatsEndpoint(): string {
	return resolveTokenPlanStatsEndpoints()[0];
}

/**
 * Token Plan usage endpoint candidates, in priority order:
 * 1. cs-data gateway (official Qwen CLI path; needs the form-encoded envelope).
 * 2. Alibaba Model Studio console RPC for the active region (authenticates with the API key).
 * Explicit `tokenPlanStatsEndpoint` override replaces the whole list with one URL.
 */
export function resolveTokenPlanStatsEndpoints(): string[] {
	const override = getTokenPlanStatsEndpointOverride();
	if (override) {
		return [normalizeBaseUrl(override)];
	}
	const consoleRpc = getRegion() === 'china'
		? TOKEN_PLAN_USAGE_ENDPOINTS.consoleRpcChina
		: TOKEN_PLAN_USAGE_ENDPOINTS.consoleRpcInternational;
	return Array.from(
		new Set(
			[
				TOKEN_PLAN_USAGE_ENDPOINTS.csDataGateway,
				consoleRpc,
			].map((endpoint) => normalizeBaseUrl(endpoint)),
		),
	);
}

/** The console RPC `currentRegionId` for the active region. */
export function resolveConsoleRpcRegionId(): string {
	return getRegion() === 'china' ? CONSOLE_RPC.chinaRegion : CONSOLE_RPC.internationalRegion;
}

/** The console RPC `commodityCode` for the active region. */
export function resolveConsoleRpcCommodityCode(): string {
	return getRegion() === 'china' ? CONSOLE_RPC.commodityCodeChina : CONSOLE_RPC.commodityCodeInternational;
}
