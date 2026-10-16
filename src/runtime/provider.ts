import * as vscode from 'vscode';
import { AuthManager } from '../auth';
import { UsageClient } from '../client/usage';
import { VENDOR_ID } from '../consts';
import { resolveTokenPlanStatsEndpoints } from '../endpoint';
import { logger } from '../logger';
import { QwenChatProvider } from '../provider';
import { UsageStatusBar } from './usage-bar';

export async function registerProvider(context: vscode.ExtensionContext): Promise<QwenChatProvider> {
	const authManager = new AuthManager(context);
	const provider = new QwenChatProvider(context, authManager);
	const usageClient = new UsageClient(resolveTokenPlanStatsEndpoints);
	const usageBar = new UsageStatusBar(context, authManager, usageClient);
	context.subscriptions.push(
		vscode.commands.registerCommand('qwen-copilot.setApiKey', () => provider.configureApiKey()),
		vscode.commands.registerCommand('qwen-copilot.clearApiKey', () => provider.clearApiKey()),
		vscode.lm.registerLanguageModelChatProvider(VENDOR_ID, provider),
		usageBar,
	);
	await activateCopilotChat();
	provider.refreshModelPicker();
	return provider;
}

async function activateCopilotChat(): Promise<void> {
	try {
		await vscode.extensions.getExtension('github.copilot-chat')?.activate();
	} catch (error) {
		logger.warn('Copilot Chat activation unavailable; model picker refresh may be delayed', error);
	}
}
