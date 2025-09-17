// Background Script - 简化版本

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
    const prompt = `请为以下表单字段生成合适的测试数据：

${request.fields.map(field => `
字段名称: ${field.name}
字段类型: ${field.type}
字段标签: ${field.label}
${field.required ? '必填字段: 是' : '必填字段: 否'}
${field.placeholder ? `提示信息: ${field.placeholder}` : ''}`).join('\n')}

要求：
1. 生成真实、合理的测试数据
2. 考虑字段类型和提示信息
3. 如果是必填字段，确保提供有效数据
4. 返回有效的JSON格式，字段名作为键

请严格按照以下JSON格式返回：
{
  "${request.fields[0]?.name || 'field1'}": "生成的值",
  "${request.fields[1]?.name || 'field2'}": "生成的值"
}

字段类型说明：
- text: 生成合适的文本内容
- email: 生成有效的邮箱地址
- password: 生成安全的密码
- number: 生成数字
- tel: 生成电话号码
- url: 生成有效的URL
- date: 生成日期
- select: 生成选项值
- textarea: 生成较长的文本内容
- checkbox: 生成true或false
- radio: 生成选项值

请直接返回JSON格式的数据：`;

    callAI(prompt, request.config, '你是一个AI助手，专门为表单字段生成测试数据。请严格按照JSON格式返回数据。')
      .then(response => {

        try {
          // 简化JSON解析逻辑
          let cleanResponse = response.trim();

          // 移除markdown代码块标记
          if (cleanResponse.includes('```')) {
            cleanResponse = cleanResponse.replace(/```(?:json)?\n?/g, '').replace(/\n?```$/g, '');
          }

          // 查找JSON对象
          const jsonMatch = cleanResponse.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const data = JSON.parse(jsonMatch[0]);
            sendResponse({ success: true, data: data });
          } else {
            throw new Error('响应中未找到有效的JSON格式');
          }
        } catch (parseError) {
          console.error('JSON解析错误:', parseError);
          sendResponse({
            success: false,
            error: `Invalid JSON response: ${parseError.message}`
          });
        }
      })
      .catch(error => {
        console.error('AI调用错误:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }

  // 辅助函数：从文本中提取JSON
  function extractJsonFromText(text) {
    try {
      // 查找JSON对象
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }

      // 查找JSON数组
      const arrayMatch = text.match(/\[[\s\S]*\]/);
      if (arrayMatch) {
        return JSON.parse(arrayMatch[0]);
      }

      return null;
    } catch (e) {
      return null;
    }
  }

  // 错误存储和管理
  async function storeError(error) {
    try {
      const result = await chrome.storage.local.get('errorHistory');
      const errorHistory = result.errorHistory || [];

      // 添加错误信息
      errorHistory.push({
        ...error,
        storedAt: Date.now()
      });

      // 限制存储数量
      if (errorHistory.length > 1000) {
        errorHistory.splice(0, errorHistory.length - 1000);
      }

      await chrome.storage.local.set({ errorHistory });
      return true;
    } catch (error) {
      console.error('存储错误失败:', error);
      throw error;
    }
  }

  async function getErrorHistory() {
    try {
      const result = await chrome.storage.local.get('errorHistory');
      return result.errorHistory || [];
    } catch (error) {
      console.error('获取错误历史失败:', error);
      throw error;
    }
  }

  async function clearErrorHistory() {
    try {
      await chrome.storage.local.remove('errorHistory');
      return true;
    } catch (error) {
      console.error('清除错误历史失败:', error);
      throw error;
    }
  }

  if (request.action === 'generateSingleFieldData') {
    const field = request.field;
    const prompt = `请为以下表单字段生成合适的测试数据：

字段名称: ${field.name}
字段类型: ${field.type}
字段标签: ${field.label}
${field.required ? '必填字段: 是' : '必填字段: 否'}
${field.placeholder ? `提示信息: ${field.placeholder}` : ''}

要求：
1. 生成真实、合理的测试数据
2. 考虑字段类型和提示信息
3. 如果是必填字段，确保提供有效数据
4. 直接返回数据，不要包含其他解释

字段类型说明：
- text: 生成合适的文本内容
- email: 生成有效的邮箱地址
- password: 生成安全的密码
- number: 生成数字
- tel: 生成电话号码
- url: 生成有效的URL
- date: 生成日期
- select: 生成选项值
- textarea: 生成较长的文本内容
- checkbox: 生成true或false
- radio: 生成选项值

请直接返回该字段的值:`;

    callAI(prompt, request.config, '你是一个AI助手，专门为表单字段生成测试数据。')
      .then(response => {
        // 清理AI响应，去除可能的格式化和解释
        let cleanResponse = response.trim();

        // 如果响应被引号包围，去掉引号
        if (cleanResponse.startsWith('"') && cleanResponse.endsWith('"')) {
          cleanResponse = cleanResponse.slice(1, -1);
        }

        // 如果响应是JSON格式，尝试解析
        try {
          const parsed = JSON.parse(cleanResponse);
          if (typeof parsed === 'string') {
            cleanResponse = parsed;
          }
        } catch (e) {
          // 不是JSON格式，直接使用
        }

        sendResponse({ success: true, data: cleanResponse });
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

  if (request.action === 'captureError') {
    // 存储错误信息
    storeError(request.error)
      .then(() => sendResponse({ success: true, data: '错误已存储' }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (request.action === 'analyzeError') {
    const config = request.config || (await chrome.storage.sync.get('aiConfig')).aiConfig;
    if (!config) {
      sendResponse({ success: false, error: '请先配置AI服务' });
      return true;
    }

    const prompt = `请分析以下JavaScript错误，提供详细的错误原因和解决方案：

错误类型: ${request.error.type}
错误信息: ${request.error.message}
错误文件: ${request.error.filename || '未知'}
错误位置: ${request.error.lineno || '未知'}:${request.error.colno || '未知'}
错误堆栈: ${request.error.stack || '无'}
页面URL: ${request.error.url}
用户代理: ${request.error.userAgent}
发生时间: ${request.error.timestamp}

请按照以下格式进行分析：
1. 错误类型和原因
2. 可能的解决方案
3. 预防措施
4. 相关建议

请用中文回答，保持专业和实用。`;

    callAI(prompt, config, '你是一个资深的JavaScript开发者，专门帮助分析和解决JavaScript错误。')
      .then(response => {
        sendResponse({ success: true, data: response });
      })
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (request.action === 'getErrorHistory') {
    getErrorHistory()
      .then(errors => sendResponse({ success: true, data: errors }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (request.action === 'clearErrorHistory') {
    clearErrorHistory()
      .then(() => sendResponse({ success: true, data: '错误历史已清除' }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  return false;
});
