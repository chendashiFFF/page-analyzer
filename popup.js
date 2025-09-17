// Popup Script - 简化版
document.addEventListener('DOMContentLoaded', function () {
  // 绑定 DOM 元素
  const tabs = {
    form: document.getElementById('formTab'),
    analyze: document.getElementById('analyzeTab'),
    config: document.getElementById('configTab')
  };

  const contents = {
    form: document.getElementById('formContent'),
    analyze: document.getElementById('analyzeContent'),
    config: document.getElementById('configContent')
  };

  const buttons = {
    detect: document.getElementById('detectBtn'),
    fill: document.getElementById('fillBtn'),
    analyzePage: document.getElementById('analyzePageBtn'),
    analyzeAI: document.getElementById('analyzeAIBtn'),
    refreshCache: document.getElementById('refreshCacheBtn'),
    saveConfig: document.getElementById('saveConfigBtn'),
    testConnection: document.getElementById('testConnectionBtn'),
    clearConfig: document.getElementById('clearConfigBtn'),
    clearHistory: document.getElementById('clearHistoryBtn')
  };

  const elements = {
    formResults: document.getElementById('formResults'),
    analyzeResults: document.getElementById('analyzeResults'),
    historyList: document.getElementById('historyList'),
    historyEmpty: document.getElementById('historyEmpty'),
    historyCount: document.getElementById('historyCount'),
    configStatus: document.getElementById('configStatus'),
    aiProviderSelect: document.getElementById('aiProviderSelect'),
    apiEndpointInput: document.getElementById('apiEndpointInput'),
    apiKeyInput: document.getElementById('apiKeyInput'),
    modelNameInput: document.getElementById('modelNameInput'),
    maxTokensInput: document.getElementById('maxTokensInput'),
    temperatureInput: document.getElementById('temperatureInput')
  };

  const historyManager = typeof HistoryManager !== 'undefined' ? new HistoryManager() : null;
  let detectedFields = [];
  let historyCache = [];

  // 标签切换
  Object.keys(tabs).forEach(key => tabs[key].addEventListener('click', () => switchTab(key)));
  function switchTab(activeTab) {
    Object.keys(tabs).forEach(key => {
      tabs[key].classList.toggle('active', key === activeTab);
      contents[key].classList.toggle('active', key === activeTab);
    });
  }

  // 表单功能
  buttons.detect.addEventListener('click', detectForms);
  buttons.fill.addEventListener('click', fillForms);

  async function detectForms() {
    showLoading(elements.formResults, '检测表单字段...');
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const response = await chrome.tabs.sendMessage(tab.id, { action: 'detectForms' });
      if (response?.success) {
        detectedFields = response.data || [];
        displayFormResults(detectedFields);
        buttons.fill.disabled = detectedFields.length === 0;
      } else {
        showError(elements.formResults, response?.error || '检测失败');
      }
    } catch (error) {
      showError(elements.formResults, '连接失败: ' + error.message);
    }
  }

  async function fillForms() {
    if (detectedFields.length === 0) {
      showError(elements.formResults, '请先检测表单字段');
      return;
    }
    showLoading(elements.formResults, 'AI 正在生成数据...');
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const response = await chrome.tabs.sendMessage(tab.id, { action: 'fillForm' });
      if (response?.success) {
        showSuccess(elements.formResults, '表单填充成功！');
      } else {
        showError(elements.formResults, response?.error || '填充失败');
      }
    } catch (error) {
      showError(elements.formResults, '填充失败: ' + error.message);
    }
  }

  function displayFormResults(fields) {
    elements.formResults.classList.remove('hidden');
    elements.formResults.innerHTML = `
      <div style="margin-bottom: 8px;"><strong>检测到 ${fields.length} 个表单字段</strong></div>
      ${fields.map(field => `
        <div style="margin: 4px 0; padding: 4px; background: #f0f0f0; border-radius: 3px;">
          <strong>${field.label}</strong> (${field.type})
          ${field.required ? '<span style="color: red;">*</span>' : ''}
        </div>
      `).join('')}
    `;
  }

  // 页面分析功能
  buttons.analyzePage.addEventListener('click', analyzePage);
  buttons.analyzeAI.addEventListener('click', () => analyzeWithAI(false));
  buttons.refreshCache.addEventListener('click', () => analyzeWithAI(true));

  // 历史记录交互
  if (buttons.clearHistory) {
    buttons.clearHistory.addEventListener('click', clearHistory);
  }
  if (elements.historyList) {
    elements.historyList.addEventListener('click', onHistoryItemClick);
  }

  async function analyzePage() {
    showLoading(elements.analyzeResults, '分析页面信息...');
    try {
      const tab = await getActiveTab();
      validateTabUrl(tab);
      await ensureContentScript(tab.id);

      const response = await chrome.tabs.sendMessage(tab.id, { action: 'analyzePage' });
      if (response?.success) {
        displayPageAnalysis(response.data);
      } else {
        showError(elements.analyzeResults, response?.error || '分析失败');
      }
    } catch (error) {
      showError(elements.analyzeResults, '分析失败: ' + error.message);
    }
  }

  async function analyzeWithAI(forceRefresh = false) {
    const loadingText = forceRefresh ? '正在刷新缓存...' : 'AI 正在分析内容...';
    showLoading(elements.analyzeResults, loadingText);

    if (!historyManager) {
      showError(elements.analyzeResults, '历史记录模块未初始化');
      return;
    }

    try {
      const tab = await getActiveTab();
      validateTabUrl(tab);
      await ensureContentScript(tab.id);

      const pageDataResponse = await chrome.tabs.sendMessage(tab.id, { action: 'analyzePage' });
      if (!pageDataResponse?.success) {
        throw new Error(pageDataResponse?.error || '无法获取页面内容');
      }

      const pageData = pageDataResponse.data || {};
      const normalizedUrl = historyManager.normalizeUrl(tab.url);
      const cacheSignature = await historyManager.computeSignature(pageData, normalizedUrl);

      if (!forceRefresh) {
        const cachedEntry = await historyManager.findBySignature(tab.url, cacheSignature);
        if (cachedEntry) {
          displayCachedAnalysis(cachedEntry);
          await renderHistoryList(cachedEntry.id);
          return;
        }
      }

      const response = await chrome.tabs.sendMessage(tab.id, { action: 'analyzePageWithAI', cacheKey: cacheSignature });
      if (!response?.success) {
        throw new Error(response?.error || 'AI 分析失败');
      }

      const payload = response.data || {};
      displayAIAnalysis(payload, {
        badge: forceRefresh ? '手动刷新' : '最新结果',
        badgeClass: forceRefresh ? 'badge-refresh' : 'badge-info',
        timestamp: new Date().toISOString(),
        allowReAnalyze: true
      });

      const analysisText = extractAnalysisText(payload);
      const savedEntry = await historyManager.saveAnalysisEntry({
        url: tab.url,
        pageData: payload.pageData || pageData,
        analysisText,
        pageSignature: cacheSignature,
        source: forceRefresh ? 'manual-refresh' : 'ai',
        cacheKey: cacheSignature
      });

      await renderHistoryList(savedEntry?.id || null);
    } catch (error) {
      showError(elements.analyzeResults, 'AI 分析失败: ' + error.message);
    }
  }

  function displayPageAnalysis(data) {
    elements.analyzeResults.classList.remove('hidden');
    elements.analyzeResults.innerHTML = `
      <div style="margin-bottom: 8px;"><strong>页面基本信息:</strong></div>
      <div><strong>标题:</strong> ${data.title}</div>
      <div><strong>URL:</strong> ${data.url}</div>
      <div><strong>语言:</strong> ${data.language}</div>
      <div><strong>字数:</strong> ${data.wordCount.total} 字</div>
      <div><strong>标题数量:</strong> ${data.headings.length} 个</div>
      <div><strong>链接数量:</strong> ${data.links.length} 个</div>
      <div><strong>图片数量:</strong> ${data.images.length} 个</div>
    `;
  }

  function displayAIAnalysis(data, options = {}) {
    elements.analyzeResults.classList.remove('hidden');

    const analysis = extractAnalysisText(data) || '无法获取分析结果';
    const badgeText = options.badge || null;
    const badgeClass = options.badgeClass || (options.fromCache ? 'badge-info' : 'badge-refresh');
    const badge = badgeText ? `<span class="badge ${badgeClass}">${badgeText}</span>` : '';
    const timestampLine = options.timestamp ? formatTimestampLine(options.timestamp) : '';
    const subtitle = options.subtitle ? `<div class="analysis-subtext">${options.subtitle}</div>` : '';
    const timeInfo = timestampLine ? `<div class="analysis-subtext">${timestampLine}</div>` : '';
    const header = `
      <div class="analysis-header">
        <strong>${options.title || 'AI 内容分析'}</strong>
        ${badge}
      </div>
    `;

    const actions = options.allowReAnalyze ? `
      <div class="analysis-actions">
        <button class="btn btn-secondary" id="reAnalyzeBtn">重新分析当前页面</button>
      </div>
    ` : '';

    elements.analyzeResults.innerHTML = `
      ${header}
      ${subtitle}
      ${timeInfo}
      <div class="analysis-box">${analysis}</div>
      ${actions}
    `;

    if (options.allowReAnalyze) {
      const reAnalyzeBtn = document.getElementById('reAnalyzeBtn');
      if (reAnalyzeBtn) {
        reAnalyzeBtn.addEventListener('click', () => analyzeWithAI(true));
      }
    }
  }

  function displayCachedAnalysis(entry) {
    displayAIAnalysis({ analysis: entry.analysisText }, {
      badge: '缓存命中',
      badgeClass: 'badge-info',
      timestamp: entry.createdAt,
      subtitle: buildHistorySubtitle(entry),
      allowReAnalyze: true,
      fromCache: true,
      title: 'AI 内容分析（缓存）'
    });
    setActiveHistoryItem(entry.id);
  }

  // 配置功能
  elements.aiProviderSelect.addEventListener('change', onProviderChange);
  buttons.saveConfig.addEventListener('click', saveConfiguration);
  buttons.testConnection.addEventListener('click', testConnection);
  buttons.clearConfig.addEventListener('click', clearConfiguration);

  // 加载配置和历史记录
  loadConfiguration();
  renderHistoryList();

  async function loadConfiguration() {
    try {
      const result = await chrome.storage.sync.get('aiConfig');
      const config = result.aiConfig;
      if (config) {
        elements.aiProviderSelect.value = config.provider || 'openai';
        elements.apiEndpointInput.value = config.endpoint || '';
        elements.apiKeyInput.value = config.apiKey || '';
        elements.modelNameInput.value = config.model || '';
        elements.maxTokensInput.value = config.maxTokens || 1000;
        elements.temperatureInput.value = config.temperature || 0.7;
      }
    } catch (error) {
      console.error('加载配置失败:', error);
    }
  }

  async function saveConfiguration() {
    try {
      const config = {
        provider: elements.aiProviderSelect.value,
        endpoint: elements.apiEndpointInput.value.trim(),
        apiKey: elements.apiKeyInput.value.trim(),
        model: elements.modelNameInput.value.trim(),
        maxTokens: parseInt(elements.maxTokensInput.value) || 1000,
        temperature: parseFloat(elements.temperatureInput.value) || 0.7
      };
      await chrome.storage.sync.set({ aiConfig: config });
      showSuccess(elements.configStatus, '配置已保存');
    } catch (error) {
      showError(elements.configStatus, '保存失败: ' + error.message);
    }
  }

  async function testConnection() {
    try {
      const config = {
        provider: elements.aiProviderSelect.value,
        endpoint: elements.apiEndpointInput.value.trim(),
        apiKey: elements.apiKeyInput.value.trim(),
        model: elements.modelNameInput.value.trim(),
        maxTokens: parseInt(elements.maxTokensInput.value) || 1000,
        temperature: parseFloat(elements.temperatureInput.value) || 0.7
      };
      if (!config.endpoint || !config.apiKey || !config.model) {
        showError(elements.configStatus, '请填写完整的配置信息');
        return;
      }
      showLoading(elements.configStatus, '测试连接中...');
      try {
        const messages = [
          { role: 'system', content: 'Reply with "OK"' },
          { role: 'user', content: 'Test' }
        ];
        const body = { model: config.model, messages, max_tokens: 100, temperature: 0.7 };
        if (config.endpoint.includes('bigmodel.cn')) body.stream = false; // 智谱AI特殊处理
        const response = await fetch(config.endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.apiKey}` },
          body: JSON.stringify(body)
        });
        if (response.ok) showSuccess(elements.configStatus, '连接测试成功');
        else {
          const errorText = await response.text();
          showError(elements.configStatus, `连接失败: HTTP ${response.status} - ${errorText}`);
        }
      } catch (fetchError) {
        showError(elements.configStatus, '网络错误: ' + fetchError.message);
      }
    } catch (error) {
      showError(elements.configStatus, '测试失败: ' + error.message);
    }
  }

  async function clearConfiguration() {
    try {
      if (confirm('确定要清除所有配置吗？')) {
        await chrome.storage.sync.remove(['aiConfig']);
        elements.aiProviderSelect.value = 'openai';
        elements.apiEndpointInput.value = '';
        elements.apiKeyInput.value = '';
        elements.modelNameInput.value = '';
        elements.maxTokensInput.value = '1000';
        elements.temperatureInput.value = '0.7';
        showSuccess(elements.configStatus, '配置已清除');
      }
    } catch (error) {
      showError(elements.configStatus, '清除失败: ' + error.message);
    }
  }

  function onProviderChange() {
    const provider = elements.aiProviderSelect.value;
    switch (provider) {
      case 'openai':
        elements.apiEndpointInput.value = 'https://api.openai.com/v1/chat/completions';
        elements.modelNameInput.value = 'gpt-3.5-turbo';
        break;
      case 'gemini':
        elements.apiEndpointInput.value = 'https://generativelanguage.googleapis.com';
        elements.modelNameInput.value = 'gemini-pro';
        break;
      case 'anthropic':
        elements.apiEndpointInput.value = 'https://api.anthropic.com/v1/messages';
        elements.modelNameInput.value = 'claude-3-haiku-20240307';
        break;
    }
  }

  // 历史记录功能
  async function renderHistoryList(activeId = null) {
    if (!historyManager) return;
    try {
      historyCache = await historyManager.getHistory();
      const hasHistory = historyCache.length > 0;
      if (elements.historyCount) {
        elements.historyCount.textContent = hasHistory ? `共 ${historyCache.length} 条` : '';
      }
      if (elements.historyEmpty) {
        elements.historyEmpty.classList.toggle('hidden', hasHistory);
      }
      if (elements.historyList) {
        elements.historyList.classList.toggle('hidden', !hasHistory);
        elements.historyList.innerHTML = hasHistory
          ? historyCache.map(entry => createHistoryItemMarkup(entry, entry.id === activeId)).join('')
          : '';
      }
    } catch (error) {
      console.error('加载历史记录失败:', error);
    }
  }

  function createHistoryItemMarkup(entry, isActive) {
    const domain = safeDomain(entry.originalUrl);
    const preview = truncate(entry.analysisText || '暂无摘要', 120);
    const badgeClass = entry.source === 'manual-refresh' ? 'badge-refresh' : 'badge-info';
    const badgeLabel = entry.source === 'manual-refresh' ? '手动刷新' : '自动生成';
    const relativeTime = formatRelativeTime(entry.createdAt);
    const timeLabel = relativeTime ? `${relativeTime} · ${formatDate(entry.createdAt)}` : formatDate(entry.createdAt);

    return `
      <div class="history-item${isActive ? ' active' : ''}" data-entry-id="${entry.id}">
        <div class="history-item-title">${escapeHtml(entry.pageTitle || domain || '未命名页面')}</div>
        <div class="history-item-meta">
          <span>${escapeHtml(domain || '未知站点')}</span>
          <span>${escapeHtml(timeLabel)}</span>
          <span class="badge ${badgeClass}">${badgeLabel}</span>
        </div>
        <div class="history-item-preview">${escapeHtml(preview)}</div>
      </div>
    `;
  }

  async function clearHistory() {
    if (!historyManager) return;
    if (!confirm('确定要清空所有历史记录吗？')) return;
    try {
      await historyManager.clearHistory();
      historyCache = [];
      await renderHistoryList();
      showSuccess(elements.analyzeResults, '历史记录已清空');
    } catch (error) {
      showError(elements.analyzeResults, '清空失败: ' + error.message);
    }
  }

  function onHistoryItemClick(event) {
    const item = event.target.closest('.history-item');
    if (!item) return;
    const { entryId } = item.dataset;
    const entry = historyCache.find(record => record.id === entryId);
    if (!entry) return;
    displayAIAnalysis({ analysis: entry.analysisText }, {
      badge: entry.source === 'manual-refresh' ? '手动刷新' : '历史记录',
      badgeClass: entry.source === 'manual-refresh' ? 'badge-refresh' : 'badge-info',
      timestamp: entry.createdAt,
      subtitle: buildHistorySubtitle(entry),
      allowReAnalyze: false,
      title: '历史分析结果'
    });
    setActiveHistoryItem(entryId);
  }

  function extractAnalysisText(data) {
    if (!data) return '';
    if (typeof data === 'string') return data;
    if (data.analysis) {
      if (typeof data.analysis === 'string') return data.analysis;
      if (typeof data.analysis.analysis === 'string') return data.analysis.analysis;
    }
    if (Array.isArray(data)) return data.join('\n');
    try {
      return JSON.stringify(data);
    } catch (error) {
      console.error('解析分析结果失败:', error);
      return '';
    }
  }

  async function getActiveTab() {
    const tabsList = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tabsList || tabsList.length === 0) {
      throw new Error('找不到活动标签页');
    }
    return tabsList[0];
  }

  function validateTabUrl(tab) {
    if (!tab.url) throw new Error('无法访问当前页面');
    const restricted = ['chrome://', 'chrome-extension://', 'moz-extension://', 'edge://', 'about:'];
    if (restricted.some(prefix => tab.url.startsWith(prefix))) {
      throw new Error('无法在浏览器内置页面上使用此功能');
    }
  }

  async function ensureContentScript(tabId) {
    try {
      await chrome.tabs.sendMessage(tabId, { action: 'ping' });
    } catch (error) {
      try {
        await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
        await new Promise(resolve => setTimeout(resolve, 120));
        await chrome.tabs.sendMessage(tabId, { action: 'ping' });
      } catch (injectError) {
        throw new Error('无法在当前页面注入脚本，请刷新页面后重试');
      }
    }
  }

  function setActiveHistoryItem(entryId) {
    if (!elements.historyList) return;
    const items = elements.historyList.querySelectorAll('.history-item');
    items.forEach(item => {
      item.classList.toggle('active', item.dataset.entryId === entryId);
    });
  }

  function buildHistorySubtitle(entry) {
    if (!entry?.pageMetrics) return '';
    const metrics = [];
    if (entry.pageMetrics.language) metrics.push(`语言：${entry.pageMetrics.language}`);
    if (entry.pageMetrics.wordCount?.total) metrics.push(`字数：${entry.pageMetrics.wordCount.total}`);
    if (typeof entry.pageMetrics.headings === 'number') metrics.push(`标题：${entry.pageMetrics.headings}`);
    if (typeof entry.pageMetrics.links === 'number') metrics.push(`链接：${entry.pageMetrics.links}`);
    if (typeof entry.pageMetrics.images === 'number') metrics.push(`图片：${entry.pageMetrics.images}`);
    return metrics.join(' · ');
  }

  function formatTimestampLine(timestamp) {
    const readable = formatDate(timestamp);
    const relative = formatRelativeTime(timestamp);
    if (!readable && !relative) return '';
    if (readable && relative) return `生成时间：${readable}（${relative}）`;
    return `生成时间：${readable || relative}`;
  }

  function safeDomain(url) {
    if (!url) return '';
    try {
      return new URL(url).hostname;
    } catch (error) {
      return '';
    }
  }

  function truncate(text, length) {
    if (!text) return '';
    if (text.length <= length) return text;
    return `${text.slice(0, length)}…`;
  }

  function formatRelativeTime(value) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const diff = Date.now() - date.getTime();
    if (diff < 0) return '';
    const minute = 60 * 1000;
    const hour = 60 * minute;
    const day = 24 * hour;
    if (diff < minute) {
      const seconds = Math.max(1, Math.floor(diff / 1000));
      return `${seconds} 秒前`;
    }
    if (diff < hour) {
      return `${Math.floor(diff / minute)} 分钟前`;
    }
    if (diff < day) {
      return `${Math.floor(diff / hour)} 小时前`;
    }
    if (diff < day * 7) {
      return `${Math.floor(diff / day)} 天前`;
    }
    return '';
  }

  function formatDate(value) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleString();
  }

  function escapeHtml(text) {
    if (text === undefined || text === null) return '';
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // 工具函数
  function showLoading(element, message) {
    element.classList.remove('hidden');
    element.innerHTML = `<div class="loading"></div>${message}`;
  }
  function showSuccess(element, message) {
    element.classList.remove('hidden');
    element.innerHTML = `<div class="status success">${message}</div>`;
  }
  function showError(element, message) {
    element.classList.remove('hidden');
    element.innerHTML = `<div class="status error">${message}</div>`;
  }
});
