import { describe, expect, it, vi } from 'vitest';

vi.mock('vscode', () => ({
	LanguageModelChatToolMode: { Auto: 1, Required: 2 },
}));

vi.mock('../client', () => ({
	QwenClient: class {
		async streamChatCompletion() {}
	},
}));

vi.mock('../endpoint', () => ({
	resolveBaseUrl: () => 'https://token-plan.maas.qianwenaiapi.com/compatible-mode/v1',
}));

vi.mock('../i18n', () => ({
	t: (key: string) => key,
}));

vi.mock('./convert', async () => await vi.importActual('./convert'));

vi.mock('../config', async () => {
	const { MODELS } = await vi.importActual<typeof import('../consts')>('../consts');
	return {
		findModelDefinition: (id: string) => MODELS.find((model) => model.id === id),
		getApiModelId: (id: string) => id,
		getMaxRetries: () => 3,
		getMaxTokens: () => undefined,
		getThinking: () => 'enabled' as const,
	};
});

import { prepareChatRequest } from './request';

function modelInfo(id: string, toolCalling: number | boolean = 128) {
	return {
		id,
		name: id,
		family: 'qwen',
		version: 'test',
		detail: 'test',
		maxInputTokens: 0,
		maxOutputTokens: 0,
		capabilities: { toolCalling, imageInput: false },
	} as never;
}

function toolOptions(toolMode?: number) {
	return {
		tools: [{ name: 'mcp.server.do-thing', description: 'd', inputSchema: { type: 'object' } }],
		toolMode,
	} as never;
}

const authManager = {
	getApiKey: vi.fn(async () => 'sk-test'),
	getApiKeyForMode: vi.fn(async () => 'sk-test'),
	hasApiKey: vi.fn(),
	promptForApiKey: vi.fn(),
	deleteApiKey: vi.fn(),
};

describe('prepareChatRequest agent-harness toolMode', () => {
	it('respects Required: forces tool_choice required and sanitizes tool names', async () => {
		const prepared = await prepareChatRequest({
			authManager,
			extensionVersion: '0.1.6',
			modelInfo: modelInfo('qwen3.8-max'),
			messages: [],
			options: toolOptions(2),
			token: {} as never,
		});

		expect(prepared.request.tool_choice).toBe('required');
		expect(prepared.request.tools?.[0]?.function.name).toBe('mcp_server_do-thing');
		expect(prepared.toolNameMap.get('mcp_server_do-thing')).toBe('mcp.server.do-thing');
	});

	it('uses tool_choice auto for the default Auto toolMode', async () => {
		const prepared = await prepareChatRequest({
			authManager,
			extensionVersion: '0.1.6',
			modelInfo: modelInfo('qwen3.8-max'),
			messages: [],
			options: toolOptions(1),
			token: {} as never,
		});

		expect(prepared.request.tool_choice).toBe('auto');
	});

	it('omits tool_choice when the harness sends no tools', async () => {
		const prepared = await prepareChatRequest({
			authManager,
			extensionVersion: '0.1.6',
			modelInfo: modelInfo('qwen3.8-max'),
			messages: [],
			options: { tools: [], toolMode: 2 } as never,
			token: {} as never,
		});

		expect(prepared.request.tool_choice).toBeUndefined();
	});

	it('honors Required even when the thinking switch is on (DashScope allows required + thinking)', async () => {
		const prepared = await prepareChatRequest({
			authManager,
			extensionVersion: '0.1.6',
			modelInfo: modelInfo('qwen3.8-max'),
			messages: [],
			options: { ...toolOptions(2), modelConfiguration: { reasoningEffort: 'high' } } as never,
			token: {} as never,
		});

		expect(prepared.request.tool_choice).toBe('required');
		expect(prepared.request.enable_thinking).toBe(true);
	});
});
