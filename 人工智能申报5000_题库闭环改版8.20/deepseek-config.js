// 只需要把下面的占位文字替换成你的硅基流动 API Key。
// 本文件仅适合本地测试，不要把包含真实 Key 的版本公开或上传。
window.DEEPSEEK_CONFIG = {
  apiKey: '[REDACTED_SECRET]',
  apiUrl: window.location.protocol === 'file:'
    ? 'http://127.0.0.1:8766/api/chat/completions'
    : '/api/chat/completions',
  models: [
    'Qwen/Qwen3-VL-8B-Thinking'
  ],
  requestTimeoutMs: 90000
};
