import * as vscode from 'vscode';

/** Runtime UI strings (toasts, prompts, errors, picker labels). */
const en: Record<string, string> = {
	// Model picker
	'model.auto.detail': 'Token Plan automatic routing',
	'model.qwen3.8-max.detail': 'Flagship text+vision model',
	'model.qwen3.8-flash.detail': 'Fast text+vision model',
	'model.qwen3.7-max.detail': 'High-quality reasoning model',
	'model.qwen3.7-plus.detail': 'Balanced text+vision model',
	'model.qwen3.6-flash.detail': 'Fast text+vision model',
	'model.deepseek-v4-pro.detail': 'DeepSeek reasoning model',
	'model.deepseek-v4.1-flash.detail': 'DeepSeek text+vision model',
	'model.glm-5.3.detail': 'GLM reasoning model',
	'model.discovered.detail': 'Discovered from /models',
	'model.custom.detail': 'Custom model',

	// Auth
	'auth.apiKeyRequiredDetail': 'Run "Qwen: Set API Key" to configure.',
	'auth.prompt':
		'Enter your Qwen API key (for example, sk-xxx). Use Token Plan or DashScope-compatible keys.',
	'auth.placeholder': 'sk-xxxxxxxx',
	'auth.emptyValidation': 'API key cannot be empty',
	'auth.saved': 'Qwen API key saved.',
	'auth.removed': 'Qwen API key removed.',
	'auth.notConfigured': 'Qwen API key not configured. Run "Qwen: Set API Key" from the Command Palette.',

	// Thinking control
	'thinking.title': 'Thinking',
	'thinking.on': 'On',
	'thinking.off': 'Off',
	'thinking.on.desc': 'Enable step-by-step reasoning (recommended)',
	'thinking.off.desc': 'Disable reasoning for faster responses',

	// Thinking effort control
	'effort.title': 'Thinking Effort',
	'effort.none.label': 'None',
	'effort.none.desc': 'No reasoning — fastest, lowest quota',
	'effort.high.label': 'High',
	'effort.high.desc': 'Balanced reasoning (recommended)',
	'effort.max.label': 'Max',
	'effort.max.desc': 'Deepest reasoning — best for hard coding, uses more quota',

	// Request limits
	'request.toolsLimitExceeded':
		'Qwen supports at most {0} tools in one request, but this request has {1}. Use VS Code Configure Tools to disable tools you rarely use.',
	'request.imageToolResultOmitted':
		'[{0} image tool output omitted — Qwen tool results are text-only]',
	'request.retry.rateLimited': 'Qwen is rate limited. Retrying in {0}s ({1}/{2}).',
	'request.retry.busy': 'Qwen is busy. Retrying in {0}s ({1}/{2}).',

	// HTTP errors
	'error.http.400': '[{0}] Invalid request. Check the request parameters.',
	'error.http.401':
		'[{0}] Authentication failed. Check your Qwen API key, or create one for your selected plan.',
	'error.http.401.withCreateApiKeyLink':
		'[{0}] Authentication failed. Check your Qwen API key, or [create one]({1}).',
	'error.http.402': '[{0}] Your Qwen balance or plan quota is used up. Check your plan or top up.',
	'error.http.404':
		'[{0}] Model or endpoint not found. Check your API Mode, Region, and model id settings.',
	'error.http.422': '[{0}] Invalid parameters. Check the request parameters.',
	'error.http.429': '[{0}] Too many requests. Slow down and try again.',
	'error.http.500': '[{0}] Qwen server error. Retry after a short wait.',
	'error.http.503': '[{0}] Qwen service is overloaded. Retry after a short wait.',
	'error.http.generic': '[{0}] The service returned an error response.',

	// Network errors
	'error.network.dns':
		'[{0}] DNS lookup failed. Check your network connection, firewall, proxy settings, or custom Base URL.',
	'error.network.unreachable':
		'[{0}] The target is unreachable or refused the connection. Check your Base URL, proxy, network, or firewall.',
	'error.network.interrupted':
		'[{0}] The connection was interrupted. Check your network, firewall, or proxy, or try again later.',
	'error.network.timeout':
		'[{0}] Connection timed out. Try again later, or check your network, firewall, or proxy.',
	'error.network.tls':
		'[{0}] TLS/certificate verification failed. Check your proxy settings, certificates, or custom Base URL.',
	'error.network.aborted':
		'[{0}] The request was aborted. If you did not cancel it, check your network or proxy, or try again later.',
	'error.network.protocol':
		'[{0}] The HTTP connection or response parsing failed. Check your proxy, custom Base URL, or service response.',
	'error.network.configuration':
		'[{0}] The request configuration is invalid. Check your custom Base URL or extension settings.',
	'error.network.generic':
		'[{0}] Network request failed. Check your network connection, firewall, proxy settings, or custom Base URL.',
	'error.unknown': 'Qwen request failed: {0}',

	// Error action buttons
	'error.action.setApiKey': 'Set API Key',
	'error.action.createApiKey': 'Create API Key',
	'error.action.viewDetails': 'Show Logs',

	// Lifecycle
	'extension.activateFailed': 'Qwen failed to activate. Run "Qwen: Show Logs" for details.',

	// Usage status bar
	'usage.status.loading': 'Refreshing…',
	'usage.status.ok.short': '$(sparkle) Qwen {0}%',
	'usage.status.no-data': 'No token-plan usage data is available for this key.',
	'usage.status.auth-error': 'API key invalid. Click to set your key.',
	'usage.status.network-error': 'Usage unavailable (offline).',
	'usage.status.server-error': 'Usage request failed. Try again later.',
	'usage.tooltip.lastUpdated': 'Last updated: {0}',
	'usage.tooltip.offline': 'Usage unavailable (offline). Showing last data.',
	'usage.metric.session': 'Monthly Quota Used %',
	'usage.metric.weekly': 'Weekly Quota Used %',
	'usage.metric.webSearches': 'Monthly Quota Used',
	'usage.metric.resetsAt': 'Resets: {0}',
	'usage.plan.label': 'Plan: {0}',
	'usage.plan.renewsAt': 'Renews: {0}',
	'usage.panel.title': 'Qwen Usage',
	'usage.panel.refresh': 'Refresh',
	'usage.panel.setKey': 'Set API Key',
	'usage.panel.offline': 'Offline · showing last data',
	'usage.panel.unavailable': 'Usage unavailable. Configure a valid Token Plan endpoint and API key to view details.',
	'usage.metric.window.session': 'Subscription month (30 days from subscription day)',
	'usage.metric.window.weekly': '7-day rolling window (legacy plans)',
	'usage.metric.window.webSearches': 'Calendar month',
	'usage.metric.resetsIn': 'Resets in {0}',
	'usage.panel.lastUpdated': 'Last updated: {0}',
	'usage.balance.section': 'Account Balance',
	'usage.balance.available': 'Available',
	'usage.balance.recharged': 'Recharged',
	'usage.balance.spent': 'Spent',
	'usage.balance.gifted': 'Gifted',
	'usage.balance.frozen': 'Frozen',
	'usage.balance.packages': 'Token Packages',
	'usage.balance.exhausted': 'Balance exhausted — top up to keep using Qwen.',
};

const zh: Record<string, string> = {
	'model.auto.detail': 'Token Plan 自动路由',
	'model.qwen3.8-max.detail': '旗舰文本+视觉模型',
	'model.qwen3.8-flash.detail': '快速文本+视觉模型',
	'model.qwen3.7-max.detail': '高质量推理模型',
	'model.qwen3.7-plus.detail': '均衡文本+视觉模型',
	'model.qwen3.6-flash.detail': '快速文本+视觉模型',
	'model.deepseek-v4-pro.detail': 'DeepSeek 推理模型',
	'model.deepseek-v4.1-flash.detail': 'DeepSeek 文本+视觉模型',
	'model.glm-5.3.detail': 'GLM 推理模型',
	'model.discovered.detail': '从 /models 自动发现',
	'model.custom.detail': '自定义模型',

	'auth.apiKeyRequiredDetail': '请运行“Qwen: Set API Key”进行配置。',
	'auth.prompt': '请输入你的 Qwen API Key（例如 sk-xxx）。支持 Token Plan 或 DashScope 兼容密钥。',
	'auth.placeholder': 'sk-xxxxxxxx',
	'auth.emptyValidation': 'API Key 不能为空',
	'auth.saved': 'Qwen API Key 已保存。',
	'auth.removed': 'Qwen API Key 已删除。',
	'auth.notConfigured': '尚未配置 Qwen API Key。请在命令面板运行“Qwen: Set API Key”。',

	'thinking.title': '思考',
	'thinking.on': '开启',
	'thinking.off': '关闭',
	'thinking.on.desc': '启用逐步推理（推荐）',
	'thinking.off.desc': '关闭推理以获得更快响应',

	'effort.title': '思考强度',
	'effort.none.label': '关闭',
	'effort.none.desc': '不进行推理——最快、消耗最低',
	'effort.high.label': '高',
	'effort.high.desc': '均衡推理（推荐）',
	'effort.max.label': '最高',
	'effort.max.desc': '最深入的推理——适合复杂编程，消耗更多额度',

	'request.toolsLimitExceeded':
		'Qwen 单次请求最多支持 {0} 个工具，但本次请求包含 {1} 个。请使用 VS Code 的“配置工具”关闭不常用的工具。',
	'request.imageToolResultOmitted':
		'［已省略 {0} 个图片工具输出——Qwen 工具结果仅支持文本］',
	'request.retry.rateLimited': 'Qwen 请求过于频繁。将在 {0} 秒后重试（{1}/{2}）。',
	'request.retry.busy': 'Qwen 服务繁忙。将在 {0} 秒后重试（{1}/{2}）。',

	'error.http.400': '[{0}] 请求无效。请检查请求参数。',
	'error.http.401': '[{0}] 身份验证失败。请检查你的 Qwen API Key，或为所选套餐创建一个。',
	'error.http.401.withCreateApiKeyLink': '[{0}] 身份验证失败。请检查你的 Qwen API Key，或[创建一个]({1})。',
	'error.http.402': '[{0}] 你的 Qwen 余额或套餐额度已用尽。请检查套餐或充值。',
	'error.http.404': '[{0}] 未找到模型或接口。请检查 API 模式、区域和模型 ID 设置。',
	'error.http.422': '[{0}] 参数无效。请检查请求参数。',
	'error.http.429': '[{0}] 请求过于频繁。请放慢速度后重试。',
	'error.http.500': '[{0}] Qwen 服务器错误。请稍后重试。',
	'error.http.503': '[{0}] Qwen 服务繁忙。请稍后重试。',
	'error.http.generic': '[{0}] 服务返回了错误响应。',

	'error.network.dns': '[{0}] DNS 解析失败。请检查网络连接、防火墙、代理设置或自定义 Base URL。',
	'error.network.unreachable': '[{0}] 目标不可达或拒绝连接。请检查 Base URL、代理、网络或防火墙。',
	'error.network.interrupted': '[{0}] 连接中断。请检查网络、防火墙或代理，或稍后重试。',
	'error.network.timeout': '[{0}] 连接超时。请稍后重试，或检查网络、防火墙或代理。',
	'error.network.tls': '[{0}] TLS/证书校验失败。请检查代理设置、证书或自定义 Base URL。',
	'error.network.aborted': '[{0}] 请求已中止。若非你主动取消，请检查网络或代理，或稍后重试。',
	'error.network.protocol': '[{0}] HTTP 连接或响应解析失败。请检查代理、自定义 Base URL 或服务响应。',
	'error.network.configuration': '[{0}] 请求配置无效。请检查自定义 Base URL 或扩展设置。',
	'error.network.generic': '[{0}] 网络请求失败。请检查网络连接、防火墙、代理设置或自定义 Base URL。',
	'error.unknown': 'Qwen 请求失败：{0}',

	'error.action.setApiKey': '设置 API Key',
	'error.action.createApiKey': '创建 API Key',
	'error.action.viewDetails': '查看日志',

	'extension.activateFailed': 'Qwen 激活失败。请运行“Qwen: Show Logs”查看详情。',

	// 用量状态栏
	'usage.status.loading': '刷新中…',
	'usage.status.ok.short': '$(sparkle) Qwen {0}%',
	'usage.status.no-data': '该密钥暂无可用的 Token Plan 用量数据。',
	'usage.status.auth-error': 'API 密钥无效。点击设置密钥。',
	'usage.status.network-error': '无法获取用量（离线）。',
	'usage.status.server-error': '用量请求失败，请稍后重试。',
	'usage.tooltip.lastUpdated': '最后更新：{0}',
	'usage.tooltip.offline': '无法获取用量（离线）。显示上次数据。',
	'usage.metric.session': '月额度已用 %',
	'usage.metric.weekly': '周额度已用 %',
	'usage.metric.webSearches': '月额度已用',
	'usage.metric.resetsAt': '重置时间：{0}',
	'usage.plan.label': '套餐：{0}',
	'usage.plan.renewsAt': '续期时间：{0}',
	'usage.panel.title': 'Qwen 用量',
	'usage.panel.refresh': '刷新',
	'usage.panel.setKey': '设置 API 密钥',
	'usage.panel.offline': '离线 · 显示上次数据',
	'usage.panel.unavailable': '用量不可用。请配置可用的 Token Plan 用量接口地址与 API Key。',
	'usage.metric.window.session': '订阅月（自订阅日起 30 天）',
	'usage.metric.window.weekly': '7 天滚动窗口（旧套餐）',
	'usage.metric.window.webSearches': '自然月',
	'usage.metric.resetsIn': '{0} 后重置',
	'usage.panel.lastUpdated': '最后更新：{0}',
	'usage.balance.section': '账户余额',
	'usage.balance.available': '可用余额',
	'usage.balance.recharged': '累计充值',
	'usage.balance.spent': '累计消耗',
	'usage.balance.gifted': '赠送金额',
	'usage.balance.frozen': '冻结金额',
	'usage.balance.packages': '资源包',
	'usage.balance.exhausted': '余额已耗尽——请充值后继续使用。',
};

function isZh(): boolean {
	return vscode.env.language.toLowerCase() === 'zh-cn';
}

/** Translate `key`, substituting `{0}`, `{1}`, … with `args`. */
export function t(key: string, ...args: string[]): string {
	const dict = isZh() ? zh : en;
	let text = dict[key] ?? en[key];
	if (text === undefined) {
		return key;
	}
	for (let i = 0; i < args.length; i++) {
		text = text.replaceAll(`{${i}}`, String(args[i]));
	}
	return text;
}
