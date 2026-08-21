// GitHub 发布版：请仅在自己的本地副本中填写 API Key，勿将真实 Key 提交到 GitHub。
window.DEEPSEEK_CONFIG = {
  apiKey: '',
  apiUrl: window.location.protocol === 'file:'
    ? 'http://127.0.0.1:8766/api/chat/completions'
    : '/api/chat/completions',
  models: ['Qwen/Qwen3-VL-8B-Thinking'],
  requestTimeoutMs: 90000
};
