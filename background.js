// Background Script - 简化版本
console.log('Background script loaded');

try {
  importScripts('modules/history-manager.js');
} catch (error) {
  console.error('无法加载历史记录模块:', error);
}

const historyManager = typeof HistoryManager !== 'undefined' ? new HistoryManager() : null;

// 主AI调用函数
async function callAI(prompt, config, systemPrompt = null) {
  const { endpoint, apiKey, model, maxTokens = 1000, temperature = 0.7 } = config;

  const messages = [];
  if (systemPrompt) {
    messages.push({ role: 'system', content: systemPrompt });
  }
  messages.push({ role: 'user', content: prompt });

  const body = {
    model: model,
    messages: messages,
    max_tokens: maxTokens,
    temperature: temperature
  };

  // 智谱AI特殊处理
  if (endpoint.includes('bigmodel.cn')) {
    body.stream = false;
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const data = await response.json();

  if (data.choices && data.choices[0] && data.choices[0].message) {
    return data.choices[0].message.content;
  } else {
    throw new Error('Invalid response format');
  }
}

// 消息监听器
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'testConnection') {
    callAI('Test', request.config, 'Reply with "OK"')
      .then(response => sendResponse({ success: true, data: response }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (request.action === 'generateFormData') {
    const prompt = `Generate test data for these form fields: ${JSON.stringify(request.fields)}`;
    callAI(prompt, request.config, 'Return JSON with field names as keys')
      .then(response => {
        try {
          const data = JSON.parse(response);
          sendResponse({ success: true, data: data });
        } catch {
          sendResponse({ success: false, error: 'Invalid JSON response' });
        }
      })
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (request.action === 'analyzePageContent') {
    const prompt = `请用中文分析这个页面的内容，总结要点：${JSON.stringify(request.pageData)}`;

    callAI(prompt, request.config, '你是一个页面内容分析助手，请用中文回答，保持简洁明了')
      .then(response => {
        // 尝试解析JSON响应，如果不是JSON则直接使用
        let analysis = response;
        try {
          const parsed = JSON.parse(response);
          if (parsed.choices && parsed.choices[0] && parsed.choices[0].message) {
            analysis = parsed.choices[0].message.content;
          }
        } catch (e) {
          // 不是JSON格式，直接使用原始响应
        }
        sendResponse({ success: true, data: { analysis: analysis }, cacheKey: request.cacheKey || null });
      })
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (request.action === 'history:get' && historyManager) {
    historyManager.getHistory()
      .then(history => sendResponse({ success: true, data: history }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (request.action === 'history:clear' && historyManager) {
    historyManager.clearHistory()
      .then(() => sendResponse({ success: true }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (request.action === 'history:save' && historyManager) {
    historyManager.saveAnalysisEntry(request.payload)
      .then(entry => sendResponse({ success: true, data: entry }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (request.action === 'history:findBySignature' && historyManager) {
    historyManager.findBySignature(request.url, request.signature)
      .then(entry => sendResponse({ success: true, data: entry }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  return false;
});
