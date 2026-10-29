import { describe, expect, it, vi } from 'vitest';

vi.mock('vscode', () => ({
	LanguageModelChatMessageRole: { User: 1, Assistant: 2 },
	/** Proposed API kept undefined on purpose — mirrors runtimes without the proposal. */
	LanguageModelThinkingPart: undefined,
	LanguageModelTextPart: class LanguageModelTextPart {
		constructor(public value: string) {}
	},
	LanguageModelDataPart: class LanguageModelDataPart {
		constructor(public data: Uint8Array, public mimeType: string) {}
	},
	LanguageModelToolCallPart: class LanguageModelToolCallPart {
		constructor(
			public callId: string,
			public name: string,
			public input: object,
		) {}
	},
	LanguageModelToolResultPart: class LanguageModelToolResultPart {
		constructor(public callId: string, public content: unknown[]) {}
	},
}));

vi.mock('../i18n', () => ({
	t: (key: string, ..._args: string[]) => key,
}));

const { convertMessages, convertTools, sanitizeToolName } = await import('./convert');
const vscode = await import('vscode');

function tool(name: string): vscode.LanguageModelChatTool {
	return { name, description: `desc for ${name}`, inputSchema: { type: 'object' } } as never;
}

type PartCtors = {
	LanguageModelToolCallPart: new (callId: string, name: string, input: object) => unknown;
	LanguageModelToolResultPart: new (callId: string, content: unknown[]) => unknown;
	LanguageModelTextPart: new (value: string) => unknown;
	LanguageModelDataPart: new (data: Uint8Array, mimeType: string) => unknown;
};

function ctor<K extends keyof PartCtors>(key: K): PartCtors[K] {
	return (vscode as never as PartCtors)[key];
}

function toolCall(name: string): vscode.LanguageModelToolCallPart {
	return new (ctor('LanguageModelToolCallPart'))('call-1', name, { a: 1 }) as never;
}

function toolResult(content: unknown[]): vscode.LanguageModelToolResultPart {
	return new (ctor('LanguageModelToolResultPart'))('call-1', content) as never;
}

function text(value: string): unknown {
	return new (ctor('LanguageModelTextPart'))(value);
}

function image(mimeType = 'image/png'): unknown {
	return new (ctor('LanguageModelDataPart'))(new Uint8Array([1, 2, 3]), mimeType);
}

function messages(parts: unknown[]): vscode.LanguageModelChatRequestMessage[] {
	return [{ role: 2, content: parts }] as never[];
}

describe('sanitizeToolName', () => {
	it('rewrites disallowed characters and enforces the DashScope length cap', () => {
		expect(sanitizeToolName('mcp.server.do-thing')).toBe('mcp_server_do-thing');
		expect(sanitizeToolName('a'.repeat(200))).toHaveLength(64);
		expect(sanitizeToolName('')).toBe('tool');
	});
});

describe('convertTools agent-harness mapping', () => {
	it('sanitizes tool names to DashScope-safe wire names with bidirectional maps', () => {
		const converted = convertTools([tool('mcp.server.do-thing'), tool('mcp_server_do-thing')]);
		expect(converted.tools.map((t) => t.function.name)).toEqual([
			'mcp_server_do-thing',
			'mcp_server_do-thing_2',
		]);
		expect(converted.nameMap.get('mcp_server_do-thing')).toBe('mcp.server.do-thing');
		expect(converted.nameMap.get('mcp_server_do-thing_2')).toBe('mcp_server_do-thing');
		expect(converted.wireNames.get('mcp.server.do-thing')).toBe('mcp_server_do-thing');
		expect(converted.wireNames.get('mcp_server_do-thing')).toBe('mcp_server_do-thing_2');
	});
});

describe('convertMessages agent-harness mapping', () => {
	it('replays history tool calls under their wire names', () => {
		const wireNames = new Map([['mcp.server.do-thing', 'mcp_server_do-thing']]);
		const result = convertMessages(messages([toolCall('mcp.server.do-thing')]), false, (name) => wireNames.get(name) ?? name);
		expect(result[0].tool_calls?.[0]?.function.name).toBe('mcp_server_do-thing');
		expect(result[0].tool_calls?.[0]?.id).toBe('call-1');
	});

	it('annotates tool results that contained image outputs (e.g. subagent screenshots)', () => {
		const result = convertMessages(messages([toolResult([text('screenshot taken'), image()])]), false);
		expect(result[0].role).toBe('tool');
		expect(result[0].content).toContain('screenshot taken');
		expect(result[0].content).toContain('request.imageToolResultOmitted');
	});

	it('keeps text-only tool results verbatim', () => {
		const result = convertMessages(messages([toolResult([text('ok')])]), false);
		expect(result[0].content).toBe('ok');
	});
});
