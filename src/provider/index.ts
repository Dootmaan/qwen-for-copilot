import * as vscode from 'vscode';
import { discoverModelIds } from '../client';
import { getEnableModelDiscovery, listProviderModels } from '../config';
import { API_KEY_SECRET, VENDOR_ID } from '../consts';
import { resolveBaseUrl } from '../endpoint';
import { t } from '../i18n';
import { logger } from '../logger';
import type { IAuthManager } from '../types';
import { toChatInfo } from './models';
import { prepareChatRequest } from './request';
import { streamChatCompletion } from './stream';
import { estimateTokenCount } from './tokens';

/**
 * Qwen Chat Provider — implements `vscode.LanguageModelChatProvider` so Qwen
 * models appear directly in the Copilot Chat model picker.
 */
export class QwenChatProvider implements vscode.LanguageModelChatProvider {
	private readonly onDidChangeLanguageModelChatInformationEmitter =
		new vscode.EventEmitter<void>();

	readonly onDidChangeLanguageModelChatInformation =
		this.onDidChangeLanguageModelChatInformationEmitter.event;

	/**
	 * Adaptive chars-per-token ratio, calibrated from real usage data via an
	 * exponential moving average each time the API reports token counts.
	 */
	private charsPerToken = 4.0;

	private isActive = true;

	private readonly extensionVersion: string;
	private discoveredModelIds: string[] = [];
	private discoveryPromise: Promise<void> | null = null;

	constructor(
		context: vscode.ExtensionContext,
		private readonly authManager: IAuthManager,
	) {
		this.extensionVersion = context.extension.packageJSON.version as string;
		context.subscriptions.push(
			this.onDidChangeLanguageModelChatInformationEmitter,
			vscode.workspace.onDidChangeConfiguration((e) => {
				if (
					e.affectsConfiguration('qwen-copilot.apiKey') ||
					e.affectsConfiguration('qwen-copilot.baseUrl') ||
					e.affectsConfiguration('qwen-copilot.apiMode') ||
					e.affectsConfiguration('qwen-copilot.region') ||
					e.affectsConfiguration('qwen-copilot.customModels') ||
					e.affectsConfiguration('qwen-copilot.enableModelDiscovery')
				) {
					void this.refreshModelCatalog();
				}
			}),
			context.secrets.onDidChange((e) => {
				if (e.key === API_KEY_SECRET) {
					void this.refreshModelCatalog();
				}
			}),
		);
		void this.refreshModelCatalog();
	}

	async provideLanguageModelChatInformation(
		_options: vscode.PrepareLanguageModelChatModelOptions,
		_token: vscode.CancellationToken,
	): Promise<vscode.LanguageModelChatInformation[]> {
		if (!this.isActive) {
			return [];
		}
		const hasKey = await this.authManager.hasApiKey();
		if (hasKey && this.discoveredModelIds.length === 0 && getEnableModelDiscovery()) {
			await this.refreshModelCatalog();
		}
		return listProviderModels(this.discoveredModelIds).map((model) => toChatInfo(model, hasKey));
	}

	async provideLanguageModelChatResponse(
		model: vscode.LanguageModelChatInformation,
		messages: readonly vscode.LanguageModelChatRequestMessage[],
		options: vscode.ProvideLanguageModelChatResponseOptions,
		progress: vscode.Progress<vscode.LanguageModelResponsePart>,
		token: vscode.CancellationToken,
	): Promise<void> {
		const prepared = await prepareChatRequest({
			authManager: this.authManager,
			extensionVersion: this.extensionVersion,
			modelInfo: model,
			messages,
			options,
			token,
		});
		await streamChatCompletion({
			prepared,
			progress,
			token,
			getCharsPerToken: () => this.charsPerToken,
			setCharsPerToken: (value) => {
				this.charsPerToken = value;
			},
		});
	}

	async provideTokenCount(
		_model: vscode.LanguageModelChatInformation,
		text: string | vscode.LanguageModelChatRequestMessage,
		_token: vscode.CancellationToken,
	): Promise<number> {
		return estimateTokenCount(text, this.charsPerToken);
	}

	async hasApiKey(): Promise<boolean> {
		return this.authManager.hasApiKey();
	}

	async configureApiKey(): Promise<void> {
		const saved = await this.authManager.promptForApiKey();
		if (saved) {
			await this.refreshModelCatalog();
		}
	}

	async clearApiKey(): Promise<void> {
		await this.authManager.deleteApiKey();
		this.discoveredModelIds = [];
		this.refreshModelPicker();
		vscode.window.showInformationMessage(t('auth.removed'));
	}

	/** Force Copilot Chat to re-query model information. */
	refreshModelPicker(): void {
		this.onDidChangeLanguageModelChatInformationEmitter.fire();
	}

	async prepareForDeactivate(): Promise<void> {
		this.isActive = false;
		this.refreshModelPicker();
		try {
			await vscode.lm.selectChatModels({ vendor: VENDOR_ID });
		} catch (error) {
			logger.warn('Failed to refresh Qwen models during deactivate', error);
		}
	}

	private async refreshModelCatalog(): Promise<void> {
		if (this.discoveryPromise) {
			return this.discoveryPromise;
		}
		const task = (async () => {
			if (!getEnableModelDiscovery()) {
				this.discoveredModelIds = [];
				this.refreshModelPicker();
				return;
			}
			const apiKey = await this.authManager.getApiKey();
			if (!apiKey) {
				this.discoveredModelIds = [];
				this.refreshModelPicker();
				return;
			}
			const ids = await discoverModelIds(resolveBaseUrl(), apiKey);
			this.discoveredModelIds = ids;
			this.refreshModelPicker();
		})().finally(() => {
			if (this.discoveryPromise === task) {
				this.discoveryPromise = null;
			}
		});
		this.discoveryPromise = task;
		await task;
	}
}
