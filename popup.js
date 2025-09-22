// Popup Script - 简化版
document.addEventListener('DOMContentLoaded', function () {
  // 绑定 DOM 元素
  const tabs = {
    form: document.getElementById('formTab'),
    analyze: document.getElementById('analyzeTab'),
    error: document.getElementById('errorTab'),
    config: document.getElementById('configTab')
  };

  // 当popup关闭时清除高亮
  window.addEventListener('beforeunload', function() {
    clearFieldHighlights();
  });

  const contents = {
    form: document.getElementById('formContent'),
    analyze: document.getElementById('analyzeContent'),
    error: document.getElementById('errorContent'),
    config: document.getElementById('configContent')
  };

  const buttons = {
    detect: document.getElementById('detectBtn'),
    fill: document.getElementById('fillBtn'),
    analyzePage: document.getElementById('analyzePageBtn'),
    analyzeAI: document.getElementById('analyzeAIBtn'),
    refreshCache: document.getElementById('refreshCacheBtn'),
    getErrorList: document.getElementById('getErrorListBtn'),
    clearErrors: document.getElementById('clearErrorsBtn'),
    clearErrorHistory: document.getElementById('clearErrorHistoryBtn'),
    saveConfig: document.getElementById('saveConfigBtn'),
    testConnection: document.getElementById('testConnectionBtn'),
    clearConfig: document.getElementById('clearConfigBtn'),
    clearHistory: document.getElementById('clearHistoryBtn')
  };

  const elements = {
    formResults: document.getElementById('formResults'),
    analyzeResults: document.getElementById('analyzeResults'),
    errorResults: document.getElementById('errorResults'),
    historyList: document.getElementById('historyList'),
    historyEmpty: document.getElementById('historyEmpty'),
    historyCount: document.getElementById('historyCount'),
    errorList: document.getElementById('errorList'),
    errorEmpty: document.getElementById('errorEmpty'),
    errorCount: document.getElementById('errorCount'),
    configStatus: document.getElementById('configStatus'),
    aiProviderSelect: document.getElementById('aiProviderSelect'),
    apiEndpointInput: document.getElementById('apiEndpointInput'),
    apiKeyInput: document.getElementById('apiKeyInput'),
    modelNameInput: document.getElementById('modelNameInput'),
    maxTokensInput: document.getElementById('maxTokensInput'),
    temperatureInput: document.getElementById('temperatureInput'),
    themeSelect: document.getElementById('themeSelect')
  };

  const historyManager = typeof HistoryManager !== 'undefined' ? new HistoryManager() : null;
  let detectedFields = [];
  let historyCache = [];
  let errorCache = [];
  let isFillingForm = false; // 防止重复点击

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
      await ensureContentScript(tab.id);

      const response = await chrome.tabs.sendMessage(tab.id, { action: 'detectForms' });
      if (response?.success) {
        detectedFields = response.data || [];
        displayFormResults(detectedFields);
        buttons.fill.disabled = detectedFields.length === 0;

        // 如果没有找到表单字段，显示友好的提示
        if (detectedFields.length === 0) {
          showSuccess(elements.formResults, '当前页面未检测到表单字段');
        }
      } else {
        showError(elements.formResults, response?.error || '检测失败');
      }
    } catch (error) {
      // 如果是连接错误且是Chrome页面，显示特殊提示
      if (error.message.includes('Could not establish connection') || error.message.includes('Receiving end does not exist')) {
        showError(elements.formResults, '无法检测表单字段，请刷新页面后重试');
      } else {
        showError(elements.formResults, '检测失败: ' + error.message);
      }
    }
  }

  async function fillForms() {
    if (detectedFields.length === 0) {
      showError(elements.formResults, '请先检测表单字段');
      return;
    }

    // 防止重复点击
    if (isFillingForm) {
      return;
    }

    isFillingForm = true;
    buttons.fill.disabled = true;
    buttons.fill.textContent = '填充中...';

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
      // 如果是连接错误，显示友好的提示
      if (error.message.includes('Could not establish connection') || error.message.includes('Receiving end does not exist')) {
        showError(elements.formResults, '无法填充表单，请刷新页面后重试');
      } else {
        showError(elements.formResults, '填充失败: ' + error.message);
      }
    } finally {
      isFillingForm = false;
      buttons.fill.disabled = false;
      buttons.fill.textContent = 'AI 智能填充';
    }
  }

  function displayFormResults(fields) {
    elements.formResults.classList.remove('hidden');

    // 过滤出可见的字段
    const visibleFields = fields.filter(field => field.isVisible);
    const hiddenFields = fields.filter(field => !field.isVisible);

    elements.formResults.innerHTML = `
      <div style="margin-bottom: 8px;"><strong>检测到 ${visibleFields.length} 个可见表单字段</strong>
        ${hiddenFields.length > 0 ? `<span style="color: var(--muted); font-size: 12px;">(过滤了 ${hiddenFields.length} 个隐藏字段)</span>` : ''}
      </div>
      ${visibleFields.map((field, index) => {
        // 获取在原数组中的真实索引
        const originalIndex = fields.indexOf(field);
        return `
        <div class="field-item" data-field-index="${originalIndex}" style="margin: 4px 0; padding: 8px; background: var(--surface); border-radius: 6px; border: 1px solid var(--border); cursor: pointer; transition: all 0.2s ease;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
            <div>
              <strong style="color: var(--text);">${field.label}</strong> <span style="color: var(--muted);">(${field.type})</span>
              ${field.required ? '<span style="color: #ef4444;">*</span>' : ''}
            </div>
            <button class="field-fill-btn" data-field-index="${originalIndex}" style="padding: 4px 8px; font-size: 12px; background: var(--primary); color: white; border: none; border-radius: 4px; cursor: pointer;">
              填充
            </button>
          </div>
          ${field.placeholder ? `<div style="font-size: 12px; color: var(--muted); margin-bottom: 4px;">提示: ${field.placeholder}</div>` : ''}
          <div class="field-result" data-field-index="${originalIndex}" style="display: none; margin-top: 4px; padding: 4px; background: var(--success-bg); border-radius: 3px; font-size: 12px; color: var(--success-fg);"></div>
        </div>
      `;
      }).join('')}
      ${hiddenFields.length > 0 ? `
        <details style="margin-top: 12px;">
          <summary style="cursor: pointer; font-size: 12px; color: var(--muted);">查看隐藏字段 (${hiddenFields.length})</summary>
          <div style="margin-top: 8px; padding: 8px; background: var(--surface); border-radius: 6px; border: 1px solid var(--border);">
            ${hiddenFields.map((field, index) => {
              const originalIndex = fields.indexOf(field);
              return `
              <div class="field-item" data-field-index="${originalIndex}" style="margin: 4px 0; padding: 6px; background: var(--surface); border-radius: 4px; opacity: 0.7; cursor: pointer; transition: all 0.2s ease;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                  <div>
                    <strong style="color: var(--text);">${field.label}</strong> <span style="color: var(--muted);">(${field.type})</span>
                    ${field.required ? '<span style="color: #ef4444;">*</span>' : ''}
                    <span style="color: var(--muted); font-size: 11px;">(隐藏)</span>
                  </div>
                  <button class="field-fill-btn" data-field-index="${originalIndex}" style="padding: 3px 6px; font-size: 11px; background: var(--primary); color: white; border: none; border-radius: 3px; cursor: pointer;">
                    填充
                  </button>
                </div>
                ${field.placeholder ? `<div style="font-size: 11px; color: var(--muted);">提示: ${field.placeholder}</div>` : ''}
              </div>
            `;
            }).join('')}
          </div>
        </details>
      ` : ''}
    `;

    // 为字段项添加悬停高亮事件
    document.querySelectorAll('.field-item').forEach(item => {
      item.addEventListener('mouseenter', function() {
        const fieldIndex = parseInt(this.dataset.fieldIndex);
        this.style.background = 'var(--primary-50)';
        this.style.borderColor = 'var(--primary)';
        this.style.transform = 'translateY(-1px)';
        highlightField(fieldIndex);
      });

      item.addEventListener('mouseleave', function() {
        this.style.background = 'var(--surface)';
        this.style.borderColor = 'var(--border)';
        this.style.transform = 'translateY(0)';
        clearFieldHighlights();
      });
    });

    // 为每个单独填充按钮添加事件监听（阻止事件冒泡）
    document.querySelectorAll('.field-fill-btn').forEach(btn => {
      btn.addEventListener('click', function(e) {
        e.stopPropagation(); // 阻止事件冒泡
        const fieldIndex = parseInt(this.dataset.fieldIndex);
        fillSingleField(fieldIndex);
      });
    });
  }

  async function highlightField(fieldIndex) {
    if (fieldIndex < 0 || fieldIndex >= detectedFields.length) {
      return; // 静默失败，不影响用户体验
    }

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const response = await chrome.tabs.sendMessage(tab.id, {
        action: 'highlightField',
        fieldIndex: fieldIndex
      });

      // 高亮不需要显示成功/失败信息，静默处理即可
    } catch (error) {
      // 静默处理错误，不影响用户体验
      console.warn('Highlight field failed:', error);
    }
  }

  async function fillSingleField(fieldIndex) {
    if (fieldIndex < 0 || fieldIndex >= detectedFields.length) {
      showError(elements.formResults, '无效的字段索引');
      return;
    }

    const field = detectedFields[fieldIndex];
    const resultDiv = document.querySelector(`.field-result[data-field-index="${fieldIndex}"]`);
    const btn = document.querySelector(`.field-fill-btn[data-field-index="${fieldIndex}"]`);

    // 防止重复点击
    if (btn.disabled) {
      return;
    }

    // 显示加载状态
    if (resultDiv) {
      resultDiv.style.display = 'block';
      resultDiv.innerHTML = '<div class="loading" style="width: 12px; height: 12px;"></div>正在生成数据...';
    }
    if (btn) {
      btn.disabled = true;
      btn.textContent = '填充中...';
    }

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const response = await chrome.tabs.sendMessage(tab.id, {
        action: 'fillSingleField',
        fieldIndex: fieldIndex
      });

      if (response?.success) {
        if (resultDiv) {
          resultDiv.innerHTML = `✅ 填充成功: ${response.data || '数据已生成'}`;
        }
        if (btn) {
          btn.textContent = '已填充';
          btn.style.background = '#16a34a';
        }
      } else {
        if (resultDiv) {
          resultDiv.innerHTML = `❌ 填充失败: ${response?.error || '未知错误'}`;
          resultDiv.style.background = '#fee2e2';
        }
        if (btn) {
          btn.textContent = '重试';
          btn.disabled = false;
        }
      }
    } catch (error) {
      // 如果是连接错误，显示友好的提示
      if (error.message.includes('Could not establish connection') || error.message.includes('Receiving end does not exist')) {
        if (resultDiv) {
          resultDiv.innerHTML = '❌ 无法填充字段，请刷新页面后重试';
          resultDiv.style.background = '#fee2e2';
        }
      } else {
        if (resultDiv) {
          resultDiv.innerHTML = `❌ 填充失败: ${error.message}`;
          resultDiv.style.background = '#fee2e2';
        }
      }
      if (btn) {
        btn.textContent = '重试';
        btn.disabled = false;
      }
    }
  }

  // 页面分析功能
  buttons.analyzePage.addEventListener('click', analyzePage);
  buttons.analyzeAI.addEventListener('click', () => analyzeWithAI(false));
  buttons.refreshCache.addEventListener('click', () => analyzeWithAI(true));

  // 错误监控功能
  buttons.getErrorList.addEventListener('click', getErrorList);
  buttons.clearErrors.addEventListener('click', clearErrors);
  buttons.clearErrorHistory.addEventListener('click', clearErrorHistory);

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
      // 如果是连接错误，显示友好的提示
      if (error.message.includes('Could not establish connection') || error.message.includes('Receiving end does not exist')) {
        showError(elements.analyzeResults, '无法分析页面，请刷新页面后重试');
      } else {
        showError(elements.analyzeResults, '分析失败: ' + error.message);
      }
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
      // 如果是连接错误，显示友好的提示
      if (error.message.includes('Could not establish connection') || error.message.includes('Receiving end does not exist')) {
        showError(elements.analyzeResults, '无法进行AI分析，请刷新页面后重试');
      } else {
        showError(elements.analyzeResults, 'AI 分析失败: ' + error.message);
      }
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

  // 错误监控功能
  async function getErrorList() {
    showLoading(elements.errorResults, '获取错误列表...');
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      await ensureContentScript(tab.id);

      const response = await chrome.tabs.sendMessage(tab.id, { action: 'getErrorList' });
      
      if (response?.success) {
        displayErrorList(response.data);
      } else {
        showError(elements.errorResults, response?.error || '获取错误列表失败');
      }
    } catch (error) {
      showError(elements.errorResults, '获取错误列表失败: ' + error.message);
    }
  }

  async function clearErrors() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      await ensureContentScript(tab.id);

      const response = await chrome.tabs.sendMessage(tab.id, { action: 'clearErrors' });
      if (response?.success) {
        showSuccess(elements.errorResults, '错误已清除');
        elements.errorResults.innerHTML = '';
      } else {
        showError(elements.errorResults, response?.error || '清除错误失败');
      }
    } catch (error) {
      showError(elements.errorResults, '清除错误失败: ' + error.message);
    }
  }


  async function clearErrorHistory() {
    if (!confirm('确定要清空所有错误历史记录吗？')) return;

    try {
      const response = await chrome.runtime.sendMessage({ action: 'clearErrorHistory' });
      if (response?.success) {
        errorCache = [];
        await renderErrorList();
        showSuccess(elements.errorResults, '错误历史已清空');
      } else {
        showError(elements.errorResults, response?.error || '清空错误历史失败');
      }
    } catch (error) {
      showError(elements.errorResults, '清空错误历史失败: ' + error.message);
    }
  }



  function displayErrorList(errors) {
    elements.errorResults.classList.remove('hidden');

    if (errors.length === 0) {
      showSuccess(elements.errorResults, '当前页面没有JavaScript错误');
      return;
    }

    elements.errorResults.innerHTML = `
      <div class="error-header">检测到 ${errors.length} 个JavaScript错误</div>
      ${errors.map((error, index) => `
        <div class="error-item">
          <div class="error-item-header">
            <span class="error-type">${error.type.toUpperCase()}</span>
            <span class="error-timestamp">${new Date(error.timestamp).toLocaleTimeString()}</span>
          </div>
          <div class="error-message">${escapeHtml(error.message)}</div>
          ${error.filename ? `<div class="error-location">${escapeHtml(error.filename)}:${error.lineno}:${error.colno}</div>` : ''}
          ${error.stack ? `<div class="error-stack">${escapeHtml(error.stack.substring(0, 500))}${error.stack.length > 500 ? '\n...' : ''}</div>` : ''}
          <div class="error-actions">
            <button class="error-btn error-btn-primary analyze-error-btn" data-error-index="${index}">AI 分析</button>
            <button class="error-btn error-btn-secondary copy-error-btn" data-error-index="${index}">复制</button>
          </div>
        </div>
      `).join('')}
    `;

    // 绑定AI分析按钮事件
    document.querySelectorAll('.analyze-error-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const errorIndex = parseInt(e.target.dataset.errorIndex);
        analyzeErrorWithAI(errors[errorIndex]);
      });
    });

    // 绑定复制按钮事件
    document.querySelectorAll('.copy-error-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const errorIndex = parseInt(e.target.dataset.errorIndex);
        copyErrorToClipboard(errors[errorIndex]);
      });
    });
  }

  async function analyzeErrorWithAI(error) {
    if (!error) return;

    showLoading(elements.errorResults, 'AI 正在分析错误...');
    try {
      const configResult = await chrome.storage.sync.get(['aiConfig']);
      const config = configResult.aiConfig;
      if (!config) {
        showError(elements.errorResults, '请先在配置页面设置AI服务');
        return;
      }

      const response = await chrome.runtime.sendMessage({
        action: 'analyzeError',
        error: error,
        config: config
      });

      if (response?.success) {
        displayErrorAnalysis(error, response.data);
      } else {
        showError(elements.errorResults, response?.error || 'AI分析失败');
      }
    } catch (error) {
      showError(elements.errorResults, 'AI分析失败: ' + error.message);
    }
  }

  function displayErrorAnalysis(error, analysis) {
    elements.errorResults.classList.remove('hidden');

    const analysisHtml = `
      <div style="margin-top: 16px; padding: 12px; background: var(--surface); border: 1px solid var(--primary); border-radius: 8px;">
        <div style="font-weight: bold; color: var(--primary); margin-bottom: 8px;">AI 分析结果:</div>
        <div style="white-space: pre-wrap; font-size: 12px; line-height: 1.5; color: var(--text);">${analysis}</div>
      </div>
    `;

    // 如果已经有错误列表显示，在最后添加分析结果
    if (elements.errorResults.innerHTML.includes('检测到')) {
      elements.errorResults.innerHTML += analysisHtml;
    } else {
      elements.errorResults.innerHTML = analysisHtml;
    }
  }

  async function copyErrorToClipboard(error) {
    const errorText = `错误类型: ${error.type}
错误信息: ${error.message}
错误文件: ${error.filename || '未知'}
错误位置: ${error.lineno || '未知'}:${error.colno || '未知'}
发生时间: ${new Date(error.timestamp).toLocaleString()}
错误堆栈:
${error.stack || '无'}`;

    try {
      await navigator.clipboard.writeText(errorText);
      showSuccess(elements.errorResults, '错误信息已复制到剪贴板');
    } catch (error) {
      showError(elements.errorResults, '复制失败: ' + error.message);
    }
  }

  async function renderErrorList() {
    try {
      const response = await chrome.runtime.sendMessage({ action: 'getErrorHistory' });
      if (response?.success) {
        errorCache = response.data || [];
        const hasErrors = errorCache.length > 0;

        if (elements.errorCount) {
          elements.errorCount.textContent = hasErrors ? `共 ${errorCache.length} 条` : '';
        }
        if (elements.errorEmpty) {
          elements.errorEmpty.classList.toggle('hidden', hasErrors);
        }
        if (elements.errorList) {
          elements.errorList.classList.toggle('hidden', !hasErrors);
          
          // 移除旧的事件监听器
          elements.errorList.removeEventListener('click', onErrorHistoryItemClick);
          
          elements.errorList.innerHTML = hasErrors
            ? errorCache.map(error => createErrorItemMarkup(error)).join('')
            : '';
          
          // 添加展开/收起功能的事件监听器
          if (hasErrors) {
            elements.errorList.addEventListener('click', onErrorHistoryItemClick);
          }
        }
      }
    } catch (error) {
      console.error('渲染错误列表失败:', error);
    }
  }

  function createErrorItemMarkup(error) {
    const domain = error.url ? new URL(error.url).hostname : '未知站点';
    const preview = error.message.length > 100 ? error.message.substring(0, 100) + '...' : error.message;
    const relativeTime = formatRelativeTime(error.timestamp);
    const timeLabel = relativeTime ? `${relativeTime} · ${formatDate(error.timestamp)}` : formatDate(error.timestamp);

    return `
      <div class="history-item error-history-item" data-error-id="${error.id}" style="cursor: pointer;">
        <div class="history-item-title">${error.type.toUpperCase()}</div>
        <div class="history-item-meta">
          <span>${escapeHtml(domain)}</span>
          <span>${escapeHtml(timeLabel)}</span>
        </div>
        <div class="history-item-preview">${escapeHtml(preview)}</div>
        <div class="error-details" style="display: none;">
          <div class="error-details-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; padding-bottom: 12px; border-bottom: 1px solid var(--border);">
            <h4 style="margin: 0; font-size: 15px; font-weight: 700; color: var(--text);">📋 错误详情</h4>
            <div style="display: flex; gap: 8px;">
              <button class="error-btn error-btn-secondary quick-copy-btn" data-error-id="${error.id}" style="padding: 4px 12px; font-size: 11px;">📋 一键复制</button>
              <button class="error-btn error-btn-secondary collapse-btn" style="padding: 4px 8px; font-size: 11px;">✕ 收起</button>
            </div>
          </div>
          <div class="error-detail-section">
            <div class="error-detail-label">完整错误信息：</div>
            <div class="error-detail-content" style="word-break: break-all; white-space: pre-wrap; max-width: 100%;">${escapeHtml(error.message)}</div>
          </div>
          ${error.filename ? `
            <div class="error-detail-section" style="margin-top: 8px;">
              <div class="error-detail-label">文件位置：</div>
              <div class="error-detail-content" style="word-break: break-all;">${escapeHtml(error.filename)}${error.lineno ? `:${error.lineno}` : ''}${error.colno ? `:${error.colno}` : ''}</div>
            </div>
          ` : ''}
          ${error.stack ? `
            <div class="error-detail-section" style="margin-top: 8px;">
              <div class="error-detail-label">错误堆栈：</div>
              <div class="error-detail-content error-stack" style="font-family: 'Consolas', 'Monaco', 'Courier New', monospace; font-size: 12px; word-break: break-all; white-space: pre-wrap; max-width: 100%; overflow-x: hidden; background-color: var(--card); border: 1px solid var(--border); border-radius: 6px;">${escapeHtml(error.stack)}</div>
            </div>
          ` : ''}
          ${error.userAgent ? `
            <div class="error-detail-section" style="margin-top: 8px;">
              <div class="error-detail-label">用户代理：</div>
              <div class="error-detail-content" style="word-break: break-all; font-size: 12px; color: var(--muted);">${escapeHtml(error.userAgent)}</div>
            </div>
          ` : ''}
          <div class="error-actions" style="margin-top: 16px; display: flex; gap: 12px; padding-top: 12px; border-top: 1px solid var(--border);">
            <button class="error-btn error-btn-primary ai-analyze-btn" data-error-id="${error.id}">🤖 AI 分析</button>
            <button class="error-btn error-btn-secondary copy-error-btn" data-error-id="${error.id}">📋 复制错误</button>
          </div>
          <div class="ai-analysis-container" style="display: ${error.aiAnalysis ? 'block' : 'none'}; margin-top: 16px; padding-top: 16px; border-top: 2px solid var(--primary);">
            <div class="analysis-header" style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px;">
              <span style="font-size: 16px;">🤖</span>
              <span style="font-weight: 700; font-size: 14px; color: var(--text);">AI 分析结果</span>
              <span class="badge badge-info" style="margin-left: auto;">${error.aiAnalysis ? '已缓存' : '智能诊断'}</span>
            </div>
            <div class="analysis-content" style="background-color: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 14px; font-size: 13px; line-height: 1.6; white-space: pre-wrap;">${error.aiAnalysis ? escapeHtml(error.aiAnalysis) : ''}</div>
            <div class="analysis-actions" style="margin-top: 12px; display: flex; gap: 8px;">
              <button class="error-btn error-btn-secondary copy-analysis-btn" data-error-id="${error.id}">📋 复制分析</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  // 处理错误历史项点击事件
  function onErrorHistoryItemClick(event) {
    // 检查是否点击了按钮
    const aiAnalyzeBtn = event.target.closest('.ai-analyze-btn');
    const copyErrorBtn = event.target.closest('.copy-error-btn');
    const copyAnalysisBtn = event.target.closest('.copy-analysis-btn');
    const quickCopyBtn = event.target.closest('.quick-copy-btn');
    const collapseBtn = event.target.closest('.collapse-btn');
    
    if (aiAnalyzeBtn) {
      event.preventDefault();
      event.stopPropagation();
      const errorId = aiAnalyzeBtn.dataset.errorId;
      analyzeErrorWithAI(errorId);
      return;
    }
    
    if (copyErrorBtn) {
      event.preventDefault();
      event.stopPropagation();
      const errorId = copyErrorBtn.dataset.errorId;
      copyErrorToClipboard(errorId);
      return;
    }
    
    if (copyAnalysisBtn) {
      event.preventDefault();
      event.stopPropagation();
      const errorId = copyAnalysisBtn.dataset.errorId;
      copyAnalysisResult(errorId);
      return;
    }
    
    if (quickCopyBtn) {
      event.preventDefault();
      event.stopPropagation();
      const errorId = quickCopyBtn.dataset.errorId;
      quickCopyError(errorId);
      return;
    }
    
    if (collapseBtn) {
      event.preventDefault();
      event.stopPropagation();
      const errorItem = event.target.closest('.error-history-item');
      if (errorItem) {
        collapseErrorDetails(errorItem);
      }
      return;
    }
    
    // 如果点击的不是按钮，则处理展开/收起
    const errorItem = event.target.closest('.error-history-item');
    if (!errorItem) return;
    
    // 检查是否点击在已展开的详情区域内
    const errorDetails = errorItem.querySelector('.error-details');
    if (!errorDetails) return;
    
    const isExpanded = errorDetails.style.display === 'block';
    const clickedInDetails = event.target.closest('.error-details');
    
    // 如果已展开且点击在详情区域内，不做任何操作
    if (isExpanded && clickedInDetails) {
      return;
    }
    
    // 否则处理展开/收起
    if (isExpanded) {
      collapseErrorDetails(errorItem);
    } else {
      expandErrorDetails(errorItem);
    }
  }

  // 展开错误详情
  function expandErrorDetails(errorItem) {
    const errorDetails = errorItem.querySelector('.error-details');
    if (!errorDetails) return;
    
    errorDetails.style.display = 'block';
    errorItem.classList.add('expanded');
    
    // 添加展开动画
    errorDetails.style.opacity = '0';
    errorDetails.style.transform = 'translateY(-10px)';
    
    setTimeout(() => {
      errorDetails.style.transition = 'all 0.3s ease';
      errorDetails.style.opacity = '1';
      errorDetails.style.transform = 'translateY(0)';
    }, 10);
  }

  // 收起错误详情
  function collapseErrorDetails(errorItem) {
    const errorDetails = errorItem.querySelector('.error-details');
    if (!errorDetails) return;
    
    errorDetails.style.transition = 'all 0.2s ease';
    errorDetails.style.opacity = '0';
    errorDetails.style.transform = 'translateY(-5px)';
    
    setTimeout(() => {
      errorDetails.style.display = 'none';
      errorItem.classList.remove('expanded');
      errorDetails.style.transition = '';
      errorDetails.style.opacity = '';
      errorDetails.style.transform = '';
    }, 200);
  }

  // 一键复制错误信息
  async function quickCopyError(errorId) {
    try {
      const error = errorCache.find(e => e.id === errorId);
      if (!error) return;

      const errorText = `错误类型: ${error.type}
错误信息: ${error.message}
${error.filename ? `文件位置: ${error.filename}${error.lineno ? `:${error.lineno}` : ''}${error.colno ? `:${error.colno}` : ''}` : ''}
时间: ${formatDate(error.timestamp)}
URL: ${error.url || ''}`;

      await navigator.clipboard.writeText(errorText);
      
      // 临时显示复制成功提示
      const copyBtn = document.querySelector(`[data-error-id="${errorId}"].quick-copy-btn`);
      if (copyBtn) {
        const originalText = copyBtn.textContent;
        copyBtn.textContent = '✅ 已复制';
        copyBtn.style.background = '#10b981';
        copyBtn.style.color = 'white';
        setTimeout(() => {
          copyBtn.textContent = originalText;
          copyBtn.style.background = '';
          copyBtn.style.color = '';
        }, 2000);
      }
    } catch (error) {
      console.error('一键复制失败:', error);
    }
  }

  // AI分析错误
  async function analyzeErrorWithAI(errorId) {
    try {
      const error = errorCache.find(e => e.id === errorId);
      if (!error) {
        return;
      }

      // 找到对应的错误项和分析容器
      const errorItem = document.querySelector(`[data-error-id="${errorId}"]`);
      if (!errorItem) return;

      const analysisContainer = errorItem.querySelector('.ai-analysis-container');
      const analysisContent = errorItem.querySelector('.analysis-content');
      const analyzeBtn = errorItem.querySelector('.ai-analyze-btn');
      const analysisBadge = errorItem.querySelector('.analysis-header .badge');

      if (!analysisContainer || !analysisContent || !analyzeBtn) return;

      // 检查是否已有缓存的分析结果
      if (error.aiAnalysis) {
        analysisContent.innerHTML = escapeHtml(error.aiAnalysis);
        analysisContainer.style.display = 'block';
        analyzeBtn.innerHTML = '🤖 已分析';
        if (analysisBadge) {
          analysisBadge.textContent = '已缓存';
        }
        return;
      }

      // 显示加载状态
      analyzeBtn.disabled = true;
      analyzeBtn.innerHTML = '🔄 分析中...';
      analysisContent.innerHTML = '正在分析错误，请稍候...';
      analysisContainer.style.display = 'block';

      const response = await chrome.runtime.sendMessage({
        action: 'analyzeError',
        error: error
      });

      if (response?.success) {
        // 缓存分析结果
        error.aiAnalysis = response.data;
        
        // 更新本地缓存
        const errorIndex = errorCache.findIndex(e => e.id === errorId);
        if (errorIndex !== -1) {
          errorCache[errorIndex].aiAnalysis = response.data;
        }

        // 保存到持久存储
        await chrome.runtime.sendMessage({
          action: 'updateErrorAnalysis',
          errorId: errorId,
          analysis: response.data
        });

        // 显示分析结果
        analysisContent.innerHTML = escapeHtml(response.data);
        analyzeBtn.innerHTML = '✅ 分析完成';
        analyzeBtn.disabled = false;
        if (analysisBadge) {
          analysisBadge.textContent = '已缓存';
        }
        
        // 3秒后恢复按钮状态
        setTimeout(() => {
          analyzeBtn.innerHTML = '🤖 已分析';
        }, 3000);
      } else {
        analysisContent.innerHTML = `❌ 分析失败: ${response?.error || '未知错误'}`;
        analyzeBtn.innerHTML = '🤖 AI 分析';
        analyzeBtn.disabled = false;
      }
    } catch (error) {
      const errorItem = document.querySelector(`[data-error-id="${errorId}"]`);
      if (errorItem) {
        const analysisContent = errorItem.querySelector('.analysis-content');
        const analyzeBtn = errorItem.querySelector('.ai-analyze-btn');
        if (analysisContent) {
          analysisContent.innerHTML = `❌ 分析失败: ${error.message}`;
        }
        if (analyzeBtn) {
          analyzeBtn.innerHTML = '🤖 AI 分析';
          analyzeBtn.disabled = false;
        }
      }
    }
  }

  // 复制错误信息到剪贴板
  async function copyErrorToClipboard(errorId) {
    try {
      const error = errorCache.find(e => e.id === errorId);
      if (!error) return;

      const errorText = `错误类型: ${error.type}
错误信息: ${error.message}
${error.filename ? `文件位置: ${error.filename}${error.lineno ? `:${error.lineno}` : ''}${error.colno ? `:${error.colno}` : ''}` : ''}
时间: ${formatDate(error.timestamp)}
URL: ${error.url || ''}
${error.stack ? `\n堆栈跟踪:\n${error.stack}` : ''}`;

      await navigator.clipboard.writeText(errorText);
      
      // 临时显示复制成功提示
      const copyBtn = document.querySelector(`[data-error-id="${errorId}"].copy-error-btn`);
      if (copyBtn) {
        const originalText = copyBtn.textContent;
        copyBtn.textContent = '已复制';
        copyBtn.style.background = '#10b981';
        setTimeout(() => {
          copyBtn.textContent = originalText;
          copyBtn.style.background = '';
        }, 1500);
      }
    } catch (error) {
      showError(elements.errorResults, '复制失败: ' + error.message);
    }
  }

  // 复制AI分析结果
  async function copyAnalysisResult(errorId) {
    try {
      const error = errorCache.find(e => e.id === errorId);
      if (!error) return;

      const errorItem = document.querySelector(`[data-error-id="${errorId}"]`);
      const analysisContent = errorItem?.querySelector('.analysis-content');
      const copyBtn = errorItem?.querySelector('.copy-analysis-btn');
      
      if (!analysisContent || !copyBtn) return;

      const analysisText = analysisContent.textContent || '';
      if (!analysisText || analysisText.includes('正在分析') || analysisText.includes('分析失败')) {
        return;
      }

      const fullText = `错误信息: ${error.message}
AI分析结果:
${analysisText}`;

      await navigator.clipboard.writeText(fullText);
      
      // 临时显示复制成功提示
      const originalText = copyBtn.textContent;
      copyBtn.textContent = '✅ 已复制';
      copyBtn.style.background = '#10b981';
      setTimeout(() => {
        copyBtn.textContent = originalText;
        copyBtn.style.background = '';
      }, 2000);
    } catch (error) {
      console.error('复制分析结果失败:', error);
    }
  }

  // 复制AI分析结果 (旧版本兼容)
  window.copyErrorAnalysis = async function(errorId) {
    await copyAnalysisResult(errorId);
  }

  // 配置功能
  elements.aiProviderSelect.addEventListener('change', onProviderChange);
  elements.themeSelect.addEventListener('change', onThemeChange);
  buttons.saveConfig.addEventListener('click', saveConfiguration);
  buttons.testConnection.addEventListener('click', testConnection);
  buttons.clearConfig.addEventListener('click', clearConfiguration);

  // 加载配置和历史记录
  loadConfiguration();
  renderHistoryList();
  renderErrorList();

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

      // 加载主题设置
      const themeResult = await chrome.storage.sync.get('theme');
      const theme = themeResult.theme || 'system';
      elements.themeSelect.value = theme;
      applyTheme(theme);
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

  async function onThemeChange() {
    const theme = elements.themeSelect.value;
    try {
      await chrome.storage.sync.set({ theme });
      applyTheme(theme);
      showSuccess(elements.configStatus, '主题已更新');
    } catch (error) {
      showError(elements.configStatus, '主题更新失败: ' + error.message);
    }
  }

  function applyTheme(theme) {
    const root = document.documentElement;

    // 移除所有主题类
    root.classList.remove('theme-light', 'theme-dark', 'theme-system');

    // 移除所有主题相关的样式
    root.style.removeProperty('--theme-override');

    if (theme === 'light') {
      // 强制浅色主题
      root.style.setProperty('--theme-override', 'light');
      root.classList.add('theme-light');
    } else if (theme === 'dark') {
      // 强制深色主题
      root.style.setProperty('--theme-override', 'dark');
      root.classList.add('theme-dark');
    } else {
      // 跟随系统
      root.classList.add('theme-system');
      root.style.removeProperty('--theme-override');
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

  // 清除高亮的辅助函数
  async function clearFieldHighlights() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      await chrome.tabs.sendMessage(tab.id, { action: 'clearHighlights' });
    } catch (error) {
      // 忽略清除高亮时的错误
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
