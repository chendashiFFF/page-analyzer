class ConfigManager {
  constructor() {
    this.defaultConfigs = {
      openai: {
        apiUrl: 'https://api.openai.com/v1/chat/completions',
        defaultModel: 'gpt-3.5-turbo',
        type: 'openai',
        authHeader: 'Authorization',
        authPrefix: 'Bearer ',
        keyPattern: /^sk-/,
        models: ['gpt-3.5-turbo', 'gpt-4', 'gpt-4-turbo', 'gpt-4o'],
        headers: {
          'Content-Type': 'application/json'
        }
      },
      anthropic: {
        apiUrl: 'https://api.anthropic.com/v1/messages',
        defaultModel: 'claude-3-haiku-20240307',
        type: 'anthropic',
        authHeader: 'x-api-key',
        authPrefix: '',
        keyPattern: /^sk-ant-/,
        models: ['claude-3-haiku-20240307', 'claude-3-sonnet-20240229', 'claude-3-opus-20240229'],
        headers: {
          'Content-Type': 'application/json',
          'anthropic-version': '2023-06-01'
        }
      }
    };
  }

  async getConfig() {
    try {
      const result = await chrome.storage.sync.get(['aiConfig']);
      return result.aiConfig || null;
    } catch (error) {
      console.error('获取配置失败:', error);
      return null;
    }
  }

  async saveConfig(config) {
    try {
      await chrome.storage.sync.set({ aiConfig: config });
      return { success: true };
    } catch (error) {
      console.error('保存配置失败:', error);
      return { success: false, error: error.message };
    }
  }

  validateConfig(config) {
    if (!config) {
      return { valid: false, error: '配置不能为空' };
    }

    if (!config.apiUrl) {
      return { valid: false, error: 'API地址不能为空' };
    }

    if (!config.apiKey) {
      return { valid: false, error: 'API密钥不能为空' };
    }

    if (!config.model) {
      return { valid: false, error: '模型名称不能为空' };
    }

    if (!config.type || !['openai', 'anthropic', 'custom'].includes(config.type)) {
      return { valid: false, error: '无效的API类型' };
    }

    if (config.maxTokens && (config.maxTokens < 100 || config.maxTokens > 4000)) {
      return { valid: false, error: 'Token数量必须在100-4000之间' };
    }

    if (config.temperature !== undefined && (config.temperature < 0 || config.temperature > 2)) {
      return { valid: false, error: 'Temperature必须在0-2之间' };
    }

    // 检查URL格式
    try {
      new URL(config.apiUrl);
    } catch {
      return { valid: false, error: 'API地址格式不正确' };
    }

    // 检查API密钥格式（仅对非自定义提供商）
    if (config.type !== 'custom' && this.defaultConfigs[config.type]) {
      const keyPattern = this.defaultConfigs[config.type].keyPattern;
      if (!keyPattern.test(config.apiKey)) {
        return { valid: false, error: `${config.type} API密钥格式不正确` };
      }
    }

    return { valid: true };
  }

  async testConnection(config) {
    const validation = this.validateConfig(config);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    try {
      const testMessage = '请回复"连接测试成功"以验证连接正常。';
      const startTime = Date.now();

      let response;
      if (config.type === 'openai') {
        response = await this.testOpenAI(config, testMessage);
      } else if (config.type === 'anthropic') {
        response = await this.testAnthropic(config, testMessage);
      } else {
        response = await this.testCustomAPI(config, testMessage);
      }

      const responseTime = Date.now() - startTime;

      return {
        success: true,
        data: {
          message: response.data,
          responseTime: responseTime,
          provider: config.type,
          model: config.model
        }
      };
    } catch (error) {
      console.error('连接测试失败:', error);
      return { success: false, error: error.message };
    }
  }

  async testOpenAI(config, message) {
    const requestBody = {
      model: config.model,
      messages: [
        {
          role: 'user',
          content: message
        }
      ],
      max_tokens: 50,
      temperature: config.temperature || 0.7
    };

    const headers = {
      ...this.defaultConfigs.openai.headers,
      [config.authHeader || 'Authorization']: `${config.authPrefix || 'Bearer '}${config.apiKey}`
    };

    const response = await fetch(config.apiUrl, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMessage = errorData.error?.message || errorData.message || `HTTP ${response.status}: ${response.statusText}`;
      throw new Error(errorMessage);
    }

    const data = await response.json();
    return {
      success: true,
      data: data.choices?.[0]?.message?.content || '测试成功'
    };
  }

  async testAnthropic(config, message) {
    const requestBody = {
      model: config.model,
      messages: [
        {
          role: 'user',
          content: message
        }
      ],
      max_tokens: 50,
      temperature: config.temperature || 0.7
    };

    const headers = {
      ...this.defaultConfigs.anthropic.headers,
      [config.authHeader || 'x-api-key']: `${config.authPrefix || ''}${config.apiKey}`
    };

    const response = await fetch(config.apiUrl, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMessage = errorData.error?.message || errorData.message || `HTTP ${response.status}: ${response.statusText}`;
      throw new Error(errorMessage);
    }

    const data = await response.json();
    return {
      success: true,
      data: data.content?.[0]?.text || '测试成功'
    };
  }

  async testCustomAPI(config, message) {
    const requestBody = {
      model: config.model,
      messages: [
        {
          role: 'user',
          content: message
        }
      ],
      max_tokens: 50,
      temperature: config.temperature || 0.7
    };

    const headers = {
      'Content-Type': 'application/json',
      [config.authHeader || 'Authorization']: `${config.authPrefix || 'Bearer '}${config.apiKey}`
    };

    const response = await fetch(config.apiUrl, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMessage = errorData.error?.message || errorData.message || `HTTP ${response.status}: ${response.statusText}`;
      throw new Error(errorMessage);
    }

    const data = await response.json();
    return {
      success: true,
      data: data.choices?.[0]?.message?.content || data.content?.[0]?.text || '测试成功'
    };
  }

  buildFormFillingPrompt(fields) {
    const fieldsDescription = fields.map(field => {
      return `- ${field.label} (${field.type})${field.required ? ' [必填]' : ''}${field.placeholder ? ` [提示: ${field.placeholder}]` : ''}`;
    }).join('\n');

    return `请为以下表单字段生成合适的测试数据：

${fieldsDescription}

要求：
1. 生成真实、合理的测试数据
2. 必须返回有效的JSON格式
3. 以字段名作为key，生成的值作为value
4. 考虑字段类型和提示信息
5. 对于必填字段，确保提供有效数据

返回格式示例：
{
  "name": "张三",
  "email": "zhangsan@example.com",
  "age": "25"
}`;
  }

  buildContentAnalysisPrompt(pageData) {
    return `请分析以下网页内容：

**页面信息：**
- 标题：${pageData.title}
- URL：${pageData.url}
- 语言：${pageData.language}

**内容摘要：**
${pageData.content.substring(0, 2000)}${pageData.content.length > 2000 ? '...' : ''}

请提供：
1. **页面主题**：用1-2句话概括页面主要内容
2. **关键信息**：列出3-5个核心要点
3. **内容总结**：用200字左右总结页面内容

请用中文回答，条理清晰。`;
  }

  async callOpenAI(config, prompt) {
    const requestBody = {
      model: config.model,
      messages: [
        {
          role: 'system',
          content: config.systemPrompts?.formFilling || config.systemPrompts?.contentAnalysis || '你是一个AI助手。'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      max_tokens: config.maxTokens || 1000,
      temperature: config.temperature || 0.7
    };

    const headers = {
      ...this.defaultConfigs.openai.headers,
      [config.authHeader || 'Authorization']: `${config.authPrefix || 'Bearer '}${config.apiKey}`
    };

    const response = await fetch(config.apiUrl, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMessage = errorData.error?.message || errorData.message || `API调用失败: ${response.status}`;
      throw new Error(errorMessage);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
  }

  async callAnthropic(config, prompt) {
    const requestBody = {
      model: config.model,
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ],
      max_tokens: config.maxTokens || 1000,
      temperature: config.temperature || 0.7,
      system: config.systemPrompts?.formFilling || config.systemPrompts?.contentAnalysis || '你是一个AI助手。'
    };

    const headers = {
      ...this.defaultConfigs.anthropic.headers,
      [config.authHeader || 'x-api-key']: `${config.authPrefix || ''}${config.apiKey}`
    };

    const response = await fetch(config.apiUrl, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMessage = errorData.error?.message || errorData.message || `API调用失败: ${response.status}`;
      throw new Error(errorMessage);
    }

    const data = await response.json();
    return data.content?.[0]?.text || '';
  }

  async generateFormData(fields) {
    const config = await this.getConfig();
    if (!config) {
      throw new Error('请先配置AI服务');
    }

    const validation = this.validateConfig(config);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    const prompt = this.buildFormFillingPrompt(fields);
    let response;

    if (config.type === 'openai') {
      response = await this.callOpenAI(config, prompt);
    } else if (config.type === 'anthropic') {
      response = await this.callAnthropic(config, prompt);
    } else {
      response = await this.callOpenAI(config, prompt);
    }

    try {
      return JSON.parse(response);
    } catch (error) {
      console.error('解析AI响应失败:', error);
      console.log('原始响应:', response);
      throw new Error('AI返回的数据格式不正确');
    }
  }

  async analyzePageContent(pageData) {
    const config = await this.getConfig();
    if (!config) {
      throw new Error('请先配置AI服务');
    }

    const validation = this.validateConfig(config);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    const prompt = this.buildContentAnalysisPrompt(pageData);

    if (config.type === 'openai') {
      return await this.callOpenAI(config, prompt);
    } else if (config.type === 'anthropic') {
      return await this.callAnthropic(config, prompt);
    } else {
      return await this.callOpenAI(config, prompt);
    }
  }
}

// 创建单例实例
if (typeof window !== 'undefined') {
  window.ConfigManager = ConfigManager;
}

// 在background script中使用
if (typeof self !== 'undefined' && self.chrome && self.chrome.runtime) {
  self.ConfigManager = ConfigManager;
}