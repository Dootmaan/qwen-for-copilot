import { describe, expect, it, vi } from 'vitest';
import { UsageClient } from './usage';

vi.mock('vscode', () => ({
	workspace: {
		getConfiguration: vi.fn(() => ({ get: vi.fn((_k: string, d: unknown) => d) })),
	},
	env: { language: 'en' },
}));

// The config getters drive region-dependent routing in usage.ts; mock them HOISTED
// so mutations are visible when the module under test is imported.
const cfg = vi.hoisted(() => ({ region: 'international' as 'international' | 'china' }));
vi.mock('../config', () => ({
	getRegion: () => cfg.region,
	getApiMode: () => 'coding-plan',
	getBaseUrlOverride: () => '',
	getTokenPlanStatsEndpointOverride: () => '',
}));

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json' },
	});
}

describe('UsageClient — Alibaba console RPC (queryCodingPlanInstanceInfoV2)', () => {
	it('maps codingPlanQuotaInfo to session/weekly/web-searches metrics with plan name', async () => {
		const calls: Array<{ url: string; method?: string; body?: string; auth?: string }> = [];
		const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
			calls.push({
				url: String(url),
				method: init?.method,
				body: typeof init?.body === 'string' ? init.body : undefined,
				auth: (init?.headers as Record<string, string>)?.Authorization,
			});
			return jsonResponse({
				statusCode: '200',
				requestId: 'req-1',
				success: true,
				codingPlanInstanceInfos: [{ planName: 'Qwen Coding Pro', instanceName: 'cp-1' }],
				codingPlanQuotaInfo: {
					per5HourUsedQuota: 42,
					per5HourTotalQuota: 300,
					per5HourNextRefreshTime: 1761000000000,
					perWeekUsedQuota: 1200,
					perWeekTotalQuota: 5000,
					perWeekNextRefreshTime: 1762000000000,
					perBillMonthUsedQuota: 1095,
					perBillMonthTotalQuota: 4000,
					perBillMonthNextRefreshTime: 1763000000000,
				},
			});
		});
		const client = new UsageClient('https://modelstudio.console.alibabacloud.com/data/api.json', fetchImpl as typeof fetch);
		const snap = await client.fetchSnapshot('sk-sp-test');
		expect(snap.status).toBe('ok');
		expect(snap.planName).toBe('Qwen Coding Pro');
		expect(snap.metrics.map((m) => m.kind)).toEqual(['session', 'weekly', 'web-searches']);
		expect(snap.metrics[0]).toMatchObject({ used: 42, limit: 300, resetsAt: 1761000000000 });
		expect(snap.metrics[1]).toMatchObject({ used: 1200, limit: 5000 });
		expect(snap.metrics[2]).toMatchObject({ used: 1095, limit: 4000 });

		// Request shape: POST with the RPC query params, API-key auth headers, wrapped JSON body.
		expect(calls).toHaveLength(1);
		const { url, method, body, auth } = calls[0];
		expect(method).toBe('POST');
		expect(auth).toBe('Bearer sk-sp-test');
		const parsedUrl = new URL(url);
		expect(parsedUrl.searchParams.get('api')).toBe('queryCodingPlanInstanceInfoV2');
		expect(parsedUrl.searchParams.get('currentRegionId')).toBe('ap-southeast-1');
		expect(JSON.parse(body ?? '{}')).toEqual({
			queryCodingPlanInstanceInfoRequest: { commodityCode: 'sfm_codingplan_public_intl' },
		});
	});

	it('uses the china console host, region id, and commodity code for region=china', async () => {
		cfg.region = 'china';
		try {
			const calls: Array<{ url: string; body?: string }> = [];
			const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
				calls.push({ url: String(url), body: typeof init?.body === 'string' ? init.body : undefined });
				return jsonResponse({
					codingPlanQuotaInfo: { per5HourUsedQuota: 1, per5HourTotalQuota: 5 },
				});
			});
			const client = new UsageClient('https://bailian.console.aliyun.com/data/api.json', fetchImpl as typeof fetch);
			const snap = await client.fetchSnapshot('sk-sp-test');
			expect(snap.status).toBe('ok');
			const parsedUrl = new URL(calls[0].url);
			expect(parsedUrl.searchParams.get('currentRegionId')).toBe('cn-beijing');
			expect(JSON.parse(calls[0].body ?? '{}')).toEqual({
				queryCodingPlanInstanceInfoRequest: { commodityCode: 'sfm_codingplan_public_cn' },
			});
		} finally {
			cfg.region = 'international';
		}
	});

	it('maps HTTP 401 from the console RPC to auth-error', async () => {
		const fetchImpl = vi.fn(async () => jsonResponse({ message: 'unauthorized' }, 401));
		const client = new UsageClient('https://modelstudio.console.alibabacloud.com/data/api.json', fetchImpl);
		const snap = await client.fetchSnapshot('bad-key');
		expect(snap.status).toBe('auth-error');
	});

	it('returns no-data when the RPC payload has no quota info', async () => {
		const fetchImpl = vi.fn(async () => jsonResponse({ codingPlanInstanceInfos: [] }));
		const client = new UsageClient('https://modelstudio.console.alibabacloud.com/data/api.json', fetchImpl);
		const snap = await client.fetchSnapshot('sk-sp-test');
		expect(snap.status).toBe('no-data');
		expect(snap.metrics).toEqual([]);
	});
});

describe('UsageClient — cs-data gateway (official Qwen CLI path)', () => {
	function csDataResponse(usage: Record<string, unknown>): unknown {
		return {
			code: '200',
			successResponse: true,
			data: {
				success: true,
				DataV2: {
					ret: ['SUCCESS::ok'],
					data: {
						code: 'SUCCESS',
						success: true,
						data: usage,
					},
				},
			},
		};
	}

	it('maps per1MonthPercentage to a session percent metric', async () => {
		const calls: Array<{ url: string; method?: string; body?: string; contentType?: string }> = [];
		const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
			calls.push({
				url: String(url),
				method: init?.method,
				body: typeof init?.body === 'string' ? init.body : undefined,
				contentType: (init?.headers as Record<string, string>)?.['Content-Type'],
			});
			return jsonResponse(csDataResponse({ per1MonthPercentage: 0.1438, per1MonthResetTime: 1761234567000 }));
		});
		const client = new UsageClient('https://cs-data.qianwenai.com/data/api.json', fetchImpl as typeof fetch);
		const snap = await client.fetchSnapshot('sk-sp-test');
		expect(snap.status).toBe('ok');
		expect(snap.metrics).toHaveLength(1);
		expect(snap.metrics[0]).toMatchObject({ kind: 'session', used: 14.4, limit: 100, resetsAt: 1761234567000 });

		// Request shape: POST form-encoded with the official CLI envelope.
		expect(calls).toHaveLength(1);
		const { url, method, body, contentType } = calls[0];
		expect(method).toBe('POST');
		expect(contentType).toBe('application/x-www-form-urlencoded');
		const parsedUrl = new URL(url);
		expect(parsedUrl.pathname).toBe('/data/api.json');
		expect(parsedUrl.searchParams.get('action')).toBe('BroadScopeAspnGateway');
		expect(parsedUrl.searchParams.get('product')).toBe('sfm_bailian');
		const form = new URLSearchParams(body ?? '');
		const params = JSON.parse(form.get('params') ?? '{}') as {
			Api?: string;
			V?: string;
			Data?: { cornerstoneParam?: Record<string, unknown> };
		};
		expect(params.Api).toBe('zeldaHttp.apikeyMgr./tokenplan/personal/api/v2/usage');
		expect(params.V).toBe('1.0');
		expect(params.Data?.cornerstoneParam).toMatchObject({
			protocol: 'V2',
			console: 'ONE_CONSOLE',
			consoleSite: 'QIANWENAI',
		});
		expect(form.get('region')).toBe('cn-beijing');
	});

	it('maps per1WeekPercentage to a weekly metric alongside monthly', async () => {
		const fetchImpl = vi.fn(async () =>
			jsonResponse(csDataResponse({
				per1WeekPercentage: 0.42,
				per1WeekResetTime: 1761200000000,
				per1MonthPercentage: 0.31,
				per1MonthResetTime: 1761234567000,
			})),
		);
		const client = new UsageClient('https://cs-data.qianwenai.com/data/api.json', fetchImpl);
		const snap = await client.fetchSnapshot('sk-sp-test');
		expect(snap.status).toBe('ok');
		expect(snap.metrics).toHaveLength(2);
		expect(snap.metrics[0]).toMatchObject({ kind: 'weekly', used: 42, limit: 100, resetsAt: 1761200000000 });
		expect(snap.metrics[1]).toMatchObject({ kind: 'session', used: 31, limit: 100, resetsAt: 1761234567000 });
	});

	it('falls back to the next endpoint when the cs-data gateway rejects the key (401)', async () => {
		const urls: string[] = [];
		const fetchImpl = vi.fn(async (url: string) => {
			urls.push(String(url));
			if (String(url).includes('cs-data.qianwenai.com')) {
				return jsonResponse({ code: '401', message: 'Unauthorized' }, 401);
			}
			return jsonResponse({
				codingPlanQuotaInfo: { per5HourUsedQuota: 10, per5HourTotalQuota: 60 },
			});
		});
		const client = new UsageClient(
			() => [
				'https://cs-data.qianwenai.com/data/api.json',
				'https://modelstudio.console.alibabacloud.com/data/api.json',
			],
			fetchImpl as typeof fetch,
		);
		const snap = await client.fetchSnapshot('sk-sp-test');
		expect(snap.status).toBe('ok');
		expect(snap.metrics[0]).toMatchObject({ used: 10, limit: 60 });
		expect(urls).toHaveLength(2);
	});

	it('treats NotLogined gateway errors as no-data, not a hard failure', async () => {
		const fetchImpl = vi.fn(async () =>
			jsonResponse({
				code: '200',
				successResponse: true,
				data: { success: false, errorCode: 'BailianGateway.Login.NotLogined' },
			}),
		);
		const client = new UsageClient('https://cs-data.qianwenai.com/data/api.json', fetchImpl);
		const snap = await client.fetchSnapshot('sk-sp-test');
		expect(snap.status).toBe('no-data');
	});
});

describe('UsageClient — custom override endpoint', () => {
	it('tries the console-RPC shape first, then cs-data, on an unknown host', async () => {
		// One fetch, one payload: the console-RPC parse finds no quota info and defers to
		// the cs-data envelope parser, which recognizes the layered usage shape.
		const fetchImpl = vi.fn(async () =>
			jsonResponse({
				code: '200',
				data: {
					success: true,
					DataV2: {
						ret: ['SUCCESS::ok'],
						data: { code: 'SUCCESS', success: true, data: { per1WeekPercentage: 0.5 } },
					},
				},
			}),
		);
		const client = new UsageClient('https://my-proxy.example/usage', fetchImpl as typeof fetch);
		const snap = await client.fetchSnapshot('sk-sp-test');
		expect(snap.status).toBe('ok');
		expect(snap.metrics[0]).toMatchObject({ kind: 'weekly', used: 50, limit: 100 });
		expect(fetchImpl).toHaveBeenCalledTimes(1);
	});
});

