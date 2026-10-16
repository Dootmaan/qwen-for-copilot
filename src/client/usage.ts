import { CONSOLE_RPC, CSDATA_GATEWAY, USAGE_REQUEST_TIMEOUT_MS } from '../consts';
import { resolveConsoleRpcCommodityCode, resolveConsoleRpcRegionId } from '../endpoint';
import { logger } from '../logger';
import type { UsageMetric, UsageSnapshot, UsageStatus } from '../types';
import { createHttpError, isAbortError, normalizeRequestError } from './errors';

/**
 * Token Plan usage gateway, reverse-engineered from the official web console
 * (platform.qianwenai.com home analytics bundle, 2026-10):
 *
 *   POST https://cs-data.qianwenai.com/data/api.json
 *        ?product=sfm_bailian&action=BroadScopeAspnGateway
 *   Content-Type: application/x-www-form-urlencoded
 *   body: params={"Api":"zeldaHttp.apikeyMgr./tokenplan/personal/api/v2/usage",
 *                 "V":"1.0","Data":{...cornerstoneParam...}}&region=cn-beijing
 *
 * The web console authenticates with browser session cookies (plus sec_token);
 * the gateway currently rejects plain API keys (BailianGateway.Login.NotLogined),
 * so a failed auth degrades to `no-data` instead of surfacing a hard error.
 *
 * Response (business data inside the DataV2 envelope):
 *   { per1WeekPercentage: 0..1, per1WeekResetTime: epochMs }   — weekly plan
 *   { per1MonthPercentage: 0..1, per1MonthResetTime: epochMs } — monthly plan
 */

/** Region data injected into the console-RPC request body. */
interface CodingPlanQuotaInfo {
	per5HourUsedQuota?: number;
	per5HourTotalQuota?: number;
	per5HourNextRefreshTime?: number;
	perWeekUsedQuota?: number;
	perWeekTotalQuota?: number;
	perWeekNextRefreshTime?: number;
	perBillMonthUsedQuota?: number;
	perBillMonthTotalQuota?: number;
	perBillMonthNextRefreshTime?: number;
}

interface CodingPlanInstanceInfo {
	planName?: string;
	instanceName?: string;
	packageName?: string;
}

interface CodingPlanInstanceInfoResponse {
	statusCode?: string;
	code?: string | number;
	message?: string;
	requestId?: string;
	success?: boolean;
	codingPlanInstanceInfos?: CodingPlanInstanceInfo[];
	codingPlanQuotaInfo?: CodingPlanQuotaInfo;
}

export interface IUsageClient {
	fetchSnapshot(apiKey: string, signal?: AbortSignal): Promise<UsageSnapshot>;
	fetchBalance(apiKey: string, signal?: AbortSignal): Promise<UsageSnapshot>;
}

type EndpointKind = 'cs-data' | 'console-rpc' | 'custom';

export class UsageClient implements IUsageClient {
	private readonly resolveEndpoints: () => string[];

	constructor(
		endpointOrResolver: string | (() => string[]) | (() => string),
		private readonly fetchImpl: typeof fetch = fetch,
	) {
		if (typeof endpointOrResolver === 'string') {
			this.resolveEndpoints = () => [endpointOrResolver];
		} else {
			this.resolveEndpoints = () => {
				const value = endpointOrResolver();
				return Array.isArray(value) ? value : [value];
			};
		}
	}

	async fetchSnapshot(apiKey: string, signal?: AbortSignal): Promise<UsageSnapshot> {
		const fetchedAt = Date.now();
		const endpoints = this.resolveEndpoints().map((e) => e.trim()).filter(Boolean);
		if (endpoints.length === 0) {
			return { status: 'no-data', metrics: [], fetchedAt };
		}

		let lastError: unknown;
		let sawNoData = false;
		for (const endpoint of endpoints) {
			const kind = classifyEndpoint(endpoint);
			try {
				const response = await this.fetchUsageEndpoint(endpoint, kind, apiKey, signal);
				if (!response.ok) {
					if (response.status === 401 || response.status === 403) {
						// A 401/403 from the anonymous-friendly cs-data gateway just means the
						// API key cannot authenticate there — fall through to the console RPC
						// (which does accept `sk-sp-` keys) instead of failing the whole refresh.
						if (kind === 'cs-data') {
							sawNoData = true;
							continue;
						}
						const error = await createHttpError(response, { baseUrl: endpoint });
						return this.toErrorSnapshot(error, endpoint, fetchedAt);
					}
					if (response.status === 404 || response.status === 405) {
						sawNoData = true;
						continue;
					}
					lastError = await createHttpError(response, { baseUrl: endpoint });
					continue;
				}
				const contentType = response.headers.get('content-type') ?? '';
				if (!contentType.includes('application/json')) {
					sawNoData = true;
					continue;
				}
				let json: unknown;
				try {
					json = await response.json();
				} catch {
					sawNoData = true;
					continue;
				}
				const parsed = this.parseSnapshot(json, kind, fetchedAt);
				if (parsed) {
					return parsed;
				}
				sawNoData = true;
			} catch (error) {
				if (isAbortError(error)) {
					throw error;
				}
				lastError = error;
			}
		}

		if (sawNoData) {
			return { status: 'no-data', metrics: [], fetchedAt };
		}
		if (lastError) {
			return this.toErrorSnapshot(lastError, endpoints[0], fetchedAt);
		}
		return { status: 'no-data', metrics: [], fetchedAt };
	}

	async fetchBalance(apiKey: string, signal?: AbortSignal): Promise<UsageSnapshot> {
		return this.fetchSnapshot(apiKey, signal);
	}

	/**
	 * POST one usage endpoint with the request shape its gateway expects.
	 * - cs-data: form-encoded `params` + `region` (official Qwen CLI wire format).
	 * - console RPC: JSON body wrapped in `queryCodingPlanInstanceInfoRequest`.
	 * - custom override: JSON body (generic OpenAI-compatible probe).
	 */
	private async fetchUsageEndpoint(
		endpoint: string,
		kind: EndpointKind,
		apiKey: string,
		signal?: AbortSignal,
	): Promise<Response> {
		if (kind === 'cs-data') {
			return this.fetchCsDataGateway(endpoint, apiKey, signal);
		}
		if (kind === 'console-rpc') {
			return this.fetchConsoleRpc(endpoint, apiKey, signal);
		}
		return this.fetchWithTimeout(
			endpoint,
			{
				method: 'POST',
				headers: {
					Authorization: `Bearer ${apiKey}`,
					Accept: 'application/json',
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({}),
			},
			signal,
		);
	}

	/** POST the cs-data gateway `/data/api.json` with the web console's envelope. */
	private async fetchCsDataGateway(
		endpoint: string,
		apiKey: string,
		signal?: AbortSignal,
	): Promise<Response> {
		// Web console wire shape (callBailianApi → cF/sF in the shipped bundle):
		// query: product + action; form body: params=<JSON envelope>&region=cn-beijing.
		// The envelope's cornerstoneParam mirrors dP(): console ONE_CONSOLE, site QIANWENAI.
		const url = withQuery(endpoint, {
			action: CSDATA_GATEWAY.action,
			product: CSDATA_GATEWAY.product,
		});
		const params = {
			Api: CSDATA_GATEWAY.apiUsage,
			V: '1.0',
			Data: {
				cornerstoneParam: {
					protocol: 'V2',
					console: 'ONE_CONSOLE',
					productCode: 'p_efm',
					consoleSite: 'QIANWENAI',
				},
			},
		};
		return this.fetchWithTimeout(
			url,
			{
				method: 'POST',
				headers: {
					Authorization: `Bearer ${apiKey}`,
					Accept: 'application/json',
					'Content-Type': 'application/x-www-form-urlencoded',
				},
				body: new URLSearchParams({
					params: JSON.stringify(params),
					region: CSDATA_GATEWAY.region,
				}).toString(),
			},
			signal,
		);
	}

	/** POST the Model Studio console RPC `queryCodingPlanInstanceInfoV2` (API-key auth). */
	private async fetchConsoleRpc(
		endpoint: string,
		apiKey: string,
		signal?: AbortSignal,
	): Promise<Response> {
		const url = withQuery(endpoint, {
			action: CONSOLE_RPC.action,
			product: CONSOLE_RPC.product,
			api: CONSOLE_RPC.api,
			currentRegionId: resolveConsoleRpcRegionId(),
		});
		const key = apiKey.trim();
		return this.fetchWithTimeout(
			url,
			{
				method: 'POST',
				headers: {
					Authorization: `Bearer ${key}`,
					'x-api-key': key,
					'X-DashScope-API-Key': key,
					Accept: 'application/json',
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					queryCodingPlanInstanceInfoRequest: {
						commodityCode: resolveConsoleRpcCommodityCode(),
					},
				}),
			},
			signal,
		);
	}

	/** Parse a usage response by gateway kind; returns undefined when the payload carries no usage. */
	private parseSnapshot(payload: unknown, kind: EndpointKind, fetchedAt: number): UsageSnapshot | undefined {
		if (kind === 'console-rpc') {
			return this.parseConsoleRpc(payload, fetchedAt);
		}
		if (kind === 'cs-data') {
			return this.parseCsDataUsage(payload, fetchedAt);
		}
		// Custom override endpoint: try both known shapes.
		return this.parseConsoleRpc(payload, fetchedAt) ?? this.parseCsDataUsage(payload, fetchedAt);
	}

	/** Parse the console RPC response: plan name from `codingPlanInstanceInfos`, metrics from `codingPlanQuotaInfo`. */
	private parseConsoleRpc(payload: unknown, fetchedAt: number): UsageSnapshot | undefined {
		const root = payload as CodingPlanInstanceInfoResponse | undefined;
		if (!root || typeof root !== 'object') {
			return undefined;
		}
		const code = root.code ?? root.statusCode;
		if (code !== undefined && String(code) !== '0' && String(code) !== '200') {
			const message = typeof root.message === 'string' ? root.message : '';
			if (/NotLogined|ConsoleNeedLogin|login/i.test(message)) {
				return undefined;
			}
			return { status: 'server-error', metrics: [], fetchedAt };
		}
		const quota = root.codingPlanQuotaInfo;
		if (!quota) {
			return undefined;
		}
		const metrics: UsageMetric[] = [];
		if (quota.per5HourUsedQuota !== undefined) {
			metrics.push({
				kind: 'session',
				used: quota.per5HourUsedQuota,
				limit: quota.per5HourTotalQuota ?? 0,
				resetsAt: quota.per5HourNextRefreshTime,
			});
		}
		if (quota.perWeekUsedQuota !== undefined) {
			metrics.push({
				kind: 'weekly',
				used: quota.perWeekUsedQuota,
				limit: quota.perWeekTotalQuota ?? 0,
				resetsAt: quota.perWeekNextRefreshTime,
			});
		}
		if (quota.perBillMonthUsedQuota !== undefined) {
			metrics.push({
				kind: 'web-searches',
				used: quota.perBillMonthUsedQuota,
				limit: quota.perBillMonthTotalQuota ?? 0,
				resetsAt: quota.perBillMonthNextRefreshTime,
			});
		}
		if (metrics.length === 0) {
			return undefined;
		}
		const instance = (root.codingPlanInstanceInfos ?? [])[0];
		return {
			status: 'ok',
			planName: instance?.planName ?? instance?.packageName,
			metrics,
			fetchedAt,
		};
	}

	/**
	 * Parse the cs-data gateway usage response. The official envelope is layered:
	 * `{code:'200', successResponse, data:{success, DataV2:{ret:['SUCCESS::ok'], data:{code:'SUCCESS',
	 * success:true, data:{per1MonthPercentage, per1MonthResetTime}}}}}`. Monthly is the current
	 * production contract (weekly limit removed 2026-09-22); weekly is the legacy plan shape.
	 */
	private parseCsDataUsage(payload: unknown, fetchedAt: number): UsageSnapshot | undefined {
		const business = unwrapCsDataBusiness(payload);
		if (business === undefined || business === 'not-logined') {
			return undefined;
		}
		const data = (business.data ?? business) as Record<string, unknown>;
		// Mirror of the web console normalizer (GUe in the shipped bundle): the weekly
		// pair wins when present (legacy 7-day-limit plans); otherwise the monthly pair
		// is the current production contract (weekly limit was removed 2026-09-22).
		const metrics: UsageMetric[] = [];
		const weeklyRatio = asNumber(data.per1WeekPercentage);
		const weeklyReset = asNumber(data.per1WeekResetTime);
		if (weeklyRatio > 0 || weeklyReset > 0) {
			metrics.push({
				kind: 'weekly',
				used: Math.round(weeklyRatio * 1000) / 10,
				limit: 100,
				resetsAt: weeklyReset > 0 ? weeklyReset : undefined,
			});
		}
		const monthlyRatio = asNumber(data.per1MonthPercentage);
		const monthlyReset = asNumber(data.per1MonthResetTime);
		if (monthlyRatio > 0 || monthlyReset > 0) {
			metrics.push({
				kind: 'session',
				used: Math.round(monthlyRatio * 1000) / 10,
				limit: 100,
				resetsAt: monthlyReset > 0 ? monthlyReset : undefined,
			});
		}
		if (metrics.length === 0) {
			return undefined;
		}
		return { status: 'ok', metrics, fetchedAt };
	}

	private async fetchWithTimeout(
		url: string,
		init: RequestInit,
		signal?: AbortSignal,
	): Promise<Response> {
		const controller = new AbortController();
		let didTimeout = false;
		if (signal?.aborted) {
			controller.abort();
		}
		const timer = setTimeout(() => {
			didTimeout = true;
			controller.abort();
		}, USAGE_REQUEST_TIMEOUT_MS);
		timer.unref?.();
		const onCallerAbort = () => controller.abort();
		signal?.addEventListener('abort', onCallerAbort, { once: true });
		try {
			return await this.fetchImpl(url, { ...init, signal: controller.signal });
		} catch (error) {
			if (didTimeout && isAbortError(error)) {
				throw Object.assign(new TypeError('fetch timed out'), {
					cause: { code: 'UND_ERR_CONNECT_TIMEOUT' },
				});
			}
			throw error;
		} finally {
			clearTimeout(timer);
			signal?.removeEventListener('abort', onCallerAbort);
		}
	}

	private toErrorSnapshot(error: unknown, endpoint: string, fetchedAt: number): UsageSnapshot {
		const normalized = normalizeRequestError(error, { baseUrl: endpoint });
		let status: UsageStatus;
		if (normalized instanceof Error && 'kind' in normalized) {
			const kind = (normalized as { kind: string }).kind;
			const httpStatus = (normalized as { status?: number }).status;
			if (kind === 'http' && (httpStatus === 401 || httpStatus === 403)) {
				status = 'auth-error';
			} else if (kind === 'network') {
				status = 'network-error';
			} else {
				status = 'server-error';
			}
		} else {
			status = 'server-error';
		}
		return { status, metrics: [], fetchedAt };
	}
}

function asNumber(value: unknown): number {
	return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/** Which gateway protocol an endpoint URL speaks, derived from its host. */
function classifyEndpoint(endpoint: string): EndpointKind {
	if (/cs-data\.qianwenai\.com/i.test(endpoint)) {
		return 'cs-data';
	}
	if (/modelstudio\.console\.alibabacloud\.com|bailian\.console\.aliyun\.com/i.test(endpoint)) {
		return 'console-rpc';
	}
	return 'custom';
}

/** Append query params to a URL string (existing params with the same key are overwritten). */
function withQuery(endpoint: string, params: Record<string, string>): string {
	const url = new URL(endpoint);
	for (const [key, value] of Object.entries(params)) {
		url.searchParams.set(key, value);
	}
	return url.toString();
}

/**
 * Unwrap the layered cs-data envelope down to the business data object, or `'not-logined'`
 * when the gateway reports an auth failure, or undefined when the shape doesn't match.
 */
function unwrapCsDataBusiness(payload: unknown): Record<string, unknown> | 'not-logined' | undefined {
	try {
		const outer = payload as Record<string, unknown> | undefined;
		if (!outer || typeof outer !== 'object') {
			return undefined;
		}
		if (outer.code !== undefined && String(outer.code) !== '200') {
			return undefined;
		}
		const data = (outer.data ?? outer.Data) as Record<string, unknown> | undefined;
		if (!data || typeof data !== 'object') {
			return undefined;
		}
		if (data.success === false && data.errorCode === 'BailianGateway.Login.NotLogined') {
			return 'not-logined';
		}
		const dataV2 = (data.DataV2 ?? data.dataV2) as Record<string, unknown> | undefined;
		if (!dataV2 || typeof dataV2 !== 'object') {
			return undefined;
		}
		const ret = dataV2.ret;
		if (!Array.isArray(ret) || typeof ret[0] !== 'string' || !ret[0].startsWith('SUCCESS::')) {
			return undefined;
		}
		const inner = dataV2.data as Record<string, unknown> | undefined;
		if (!inner || typeof inner !== 'object') {
			return undefined;
		}
		if (inner.code !== undefined && inner.code !== 'SUCCESS') {
			return undefined;
		}
		const business = (inner.data ?? inner) as Record<string, unknown> | undefined;
		if (!business || typeof business !== 'object') {
			return undefined;
		}
		return business;
	} catch (error) {
		logger.warn('Failed to unwrap cs-data usage envelope', error);
		return undefined;
	}
}
