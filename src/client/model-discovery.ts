import { USAGE_REQUEST_TIMEOUT_MS } from '../consts';
import { logger } from '../logger';

interface ModelsResponse {
	data?: Array<{ id?: string }>;
}

/**
 * Fetch model IDs from an OpenAI-compatible `/models` endpoint.
 * Returns an empty list on any non-fatal failure.
 */
export async function discoverModelIds(
	baseUrl: string,
	apiKey: string,
	fetchImpl: typeof fetch = fetch,
): Promise<string[]> {
	const url = `${baseUrl.replace(/\/+$/, '')}/models`;
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), USAGE_REQUEST_TIMEOUT_MS);
	timer.unref?.();
	try {
		const response = await fetchImpl(url, {
			method: 'GET',
			headers: {
				Authorization: `Bearer ${apiKey}`,
				Accept: 'application/json',
			},
			signal: controller.signal,
		});
		if (!response.ok) {
			return [];
		}
		const json = (await response.json()) as ModelsResponse;
		const list = Array.isArray(json.data) ? json.data : [];
		return list
			.map((item) => item.id?.trim() ?? '')
			.filter((id) => id.length > 0);
	} catch (error) {
		logger.warn('Failed to discover model IDs from /models', { baseUrl, error });
		return [];
	} finally {
		clearTimeout(timer);
	}
}
