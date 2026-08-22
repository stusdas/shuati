// 只需要把下面的占位文字替换成你的 DeepSeek API Key。
// 本文件仅适合本地测试，不要把包含真实 Key 的版本公开或上传。
window.DEEPSEEK_CONFIG = {
  apiKey: '[REDACTED_SECRET]',
  apiUrl: '/api/chat/completions',
  models: [
    'Qwen/Qwen3-VL-8B-Thinking',
    'deepseek-ai/DeepSeek-V3.2'
  ],
  requestTimeoutMs: 120000
};
