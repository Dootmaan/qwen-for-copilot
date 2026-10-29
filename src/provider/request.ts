import * as vscode from 'vscode';
import { QwenClient } from '../client';
import { findModelDefinition, getApiModelId, getMaxRetries, getMaxTokens, getThinking } from '../config';
import { DEFAULT_TOOLS_LIMIT } from '../consts';
import { resolveBaseUrl } from '../endpoint';
import { t } from '../i18n';
import type {
	QwenChatRequest,
	QwenTool,
	IAuthManager,
	IQwenClient,
	ThinkingEffort,
	ThinkingEffortSpec,
	ThinkingMode,
} from '../types';
import { convertMessages, convertTools, countMessageChars, sanitizeToolName } from './convert';

interface PrepareChatRequestArgs {
	authManager: IAuthManager;
	extensionVersion: string;
	modelInfo: vscode.LanguageModelChatInformation;
	messages: readonly vscode.LanguageModelChatRequestMessage[];
	options: vscode.ProvideLanguageModelChatResponseOptions;
	token: vscode.CancellationToken;
}

export interface PreparedChatRequest {
	client: IQwenClient;
	request: QwenChatRequest;
	totalRequestChars: number;
	isThinkingModel: boolean;
	/** wire (sanitized) tool name → original VS Code tool name, used to restore names on streamed calls. */
	toolNameMap: Map<string, string>;
}

/** Build the Qwen client and request body for one Copilot Chat turn. */
export async function prepareChatRequest({
	authManager,
	extensionVersion,
	modelInfo,
	messages,
	options,
}: PrepareChatRequestArgs): Promise<PreparedChatRequest> {
	const apiKey = await authManager.getApiKey();
	if (!apiKey) {
		throw new Error(t('auth.notConfigured'));
	}
	const baseUrl = resolveBaseUrl();
	const client = new QwenClient(baseUrl, apiKey, extensionVersion, getMaxRetries());
	const modelDef = findModelDefinition(modelInfo.id);
	const isThinkingModel = modelDef?.capabilities.thinking === true && isQwenFamilyModel(modelInfo.id);
	const toolCalling = modelInfo.capabilities.toolCalling ?? modelDef?.capabilities.toolCalling ?? false;
	const toolLimit = typeof toolCalling === 'number' ? toolCalling : DEFAULT_TOOLS_LIMIT;
	const converted = toolCalling ? convertTools(options.tools ?? []) : undefined;
	const tools: QwenTool[] | undefined = converted?.tools;
	if (tools && tools.length > toolLimit) {
		throw new Error(t('request.toolsLimitExceeded', String(toolLimit), String(tools.length)));
	}
	const hasTools = !!(tools && tools.length > 0);
	/**
	 * Copilot harness contract: `Required` means the model must call one of the provided tools
	 * (e.g. when the user pins `#tool:...`). DashScope's OpenAI-compatible mode accepts
	 * `tool_choice: "required"`, so Required turns are forwarded verbatim.
	 */
	const requiresToolCall =
		hasTools && options.toolMode === vscode.LanguageModelChatToolMode.Required;
	const wireNames = converted?.wireNames ?? new Map<string, string>();
	const glmMessages = convertMessages(messages, isThinkingModel, (name) => wireNames.get(name) ?? sanitizeToolName(name));
	const effortSpec = modelDef?.capabilities.thinkingEffort;
	let thinkingFields: Pick<QwenChatRequest, 'thinking' | 'enable_thinking' | 'reasoning_effort'> = {};
	if (effortSpec) {
		const effort = resolveEffort(options as EffortOptions, effortSpec);
		// Qwen's native switch (`enable_thinking`) is sent alongside `thinking.type`, plus
		// `reasoning_effort` when a non-none level is picked — mirroring the official CLI.
		thinkingFields =
			effort === 'none'
				? { thinking: { type: 'disabled' }, enable_thinking: false }
				: { thinking: { type: 'enabled' }, enable_thinking: true, reasoning_effort: effort };
	} else if (isThinkingModel) {
		const type = resolveThinking(options);
		thinkingFields = { thinking: { type }, enable_thinking: type === 'enabled' };
	}
	const request: QwenChatRequest = {
		model: getApiModelId(modelInfo.id),
		messages: glmMessages,
		stream: true,
		tools: hasTools ? tools : undefined,
		tool_choice: hasTools ? (requiresToolCall ? 'required' : 'auto') : undefined,
		max_tokens: getMaxTokens(),
		...thinkingFields,
	};
	const totalRequestChars = countMessageChars(glmMessages);
	return { client, request, totalRequestChars, isThinkingModel, toolNameMap: converted?.nameMap ?? new Map<string, string>() };
}

function isQwenFamilyModel(modelId: string): boolean {
	return /^qwen/i.test(modelId) || modelId === 'auto';
}

type EffortOptions = vscode.ProvideLanguageModelChatResponseOptions & {
	readonly modelConfiguration?: { readonly reasoningEffort?: ThinkingEffort };
	readonly configuration?: { readonly reasoningEffort?: ThinkingEffort };
};

function resolveEffort(options: EffortOptions, spec: ThinkingEffortSpec): ThinkingEffort {
	const picked = options.modelConfiguration?.reasoningEffort ?? options.configuration?.reasoningEffort;
	return picked && spec.levels.includes(picked) ? picked : spec.default;
}

/** Thinking mode from a per-request override (modelOptions), else the setting. */
function resolveThinking(options: vscode.ProvideLanguageModelChatResponseOptions): ThinkingMode {
	const modelOptions = options.modelOptions as Record<string, unknown> | undefined;
	const override = modelOptions?.['thinking'];
	if (override === 'disabled') {
		return 'disabled';
	}
	if (override === 'enabled') {
		return 'enabled';
	}
	return getThinking();
}
