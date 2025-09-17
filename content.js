// Content Script - 页面内容处理
// 导入模块
const formFiller = new (function() {
  // AI Form Filler Module 内联版本
  this.formFields = [];
  this.highlightedFields = new Set();

  this.detectFormFields = function() {
    // 清除之前的高亮
    this.clearHighlights();

    const fields = [];
    const formElements = document.querySelectorAll('input, textarea, select');

    formElements.forEach((element, index) => {
      const fieldInfo = this.extractFieldInfo(element, index);
      if (fieldInfo && fieldInfo.isFillable) {
        fields.push(fieldInfo);
      }
    });

    this.formFields = fields;
    return fields;
  };

  this.extractFieldInfo = function(element, index) {
    const type = element.type || element.tagName.toLowerCase();
    const name = element.name || element.id || `field_${index}`;
    const label = this.getFieldLabel(element);
    const placeholder = element.placeholder || '';
    const required = element.required || false;
    const isVisible = this.isElementVisible(element);
    const isFillable = this.isElementFillable(element);

    return {
      index,
      element,
      name,
      type,
      label,
      placeholder,
      required,
      isVisible,
      isFillable,
      value: element.value || ''
    };
  };

  this.getFieldLabel = function(element) {
    const labelElement = document.querySelector(`label[for="${element.id}"]`);
    if (labelElement) return labelElement.textContent.trim();

    const parentLabel = element.closest('label');
    if (parentLabel) return parentLabel.textContent.replace(element.value, '').trim();

    const prevSibling = element.previousElementSibling;
    if (prevSibling && prevSibling.textContent) {
      return prevSibling.textContent.trim();
    }

    if (element.getAttribute('aria-label')) {
      return element.getAttribute('aria-label');
    }

    if (element.placeholder) {
      return element.placeholder;
    }

    return element.name || element.id || '未知字段';
  };

  this.fillFormWithAI = async function() {
    if (this.formFields.length === 0) {
      throw new Error('未检测到表单字段');
    }

    // 获取AI配置
    const configResult = await new Promise((resolve, reject) => {
      chrome.storage.sync.get(['aiConfig'], (result) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(result);
        }
      });
    });

    const config = configResult.aiConfig;
    if (!config) {
      throw new Error('请先在配置页面设置AI服务');
    }

    const response = await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        action: 'generateFormData',
        fields: this.formFields.map(field => ({
          name: field.name,
          type: field.type,
          label: field.label,
          placeholder: field.placeholder,
          required: field.required
        })),
        config: config
      }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    });

    if (!response || !response.success) {
      throw new Error(response?.error || '表单填充响应无效');
    }

    this.fillFields(response.data);
    return response.data;
  };

  this.fillSingleFieldWithAI = async function(fieldIndex) {
    if (this.formFields.length === 0) {
      throw new Error('未检测到表单字段');
    }

    if (fieldIndex < 0 || fieldIndex >= this.formFields.length) {
      throw new Error('无效的字段索引');
    }

    const field = this.formFields[fieldIndex];

    // 获取AI配置
    const configResult = await new Promise((resolve, reject) => {
      chrome.storage.sync.get(['aiConfig'], (result) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(result);
        }
      });
    });

    const config = configResult.aiConfig;
    if (!config) {
      throw new Error('请先在配置页面设置AI服务');
    }

    const response = await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        action: 'generateSingleFieldData',
        field: {
          name: field.name,
          type: field.type,
          label: field.label,
          placeholder: field.placeholder,
          required: field.required
        },
        config: config
      }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    });

    if (!response || !response.success) {
      throw new Error(response?.error || '字段填充响应无效');
    }

    const fieldValue = response.data;
    this.setFieldValue(field.element, fieldValue);
    return fieldValue;
  };

  this.fillFields = function(data) {
    this.formFields.forEach(field => {
      const fieldData = data[field.name];
      if (fieldData) {
        this.setFieldValue(field.element, fieldData);
      }
    });
  };

  this.setFieldValue = function(element, value) {
    if (element.type === 'select-one' || element.type === 'select-multiple') {
      const option = Array.from(element.options).find(opt =>
        opt.text.toLowerCase().includes(value.toLowerCase()) ||
        opt.value.toLowerCase().includes(value.toLowerCase())
      );
      if (option) {
        element.value = option.value;
      }
    } else if (element.type === 'checkbox' || element.type === 'radio') {
      element.checked = value === true || value === 'true' || value === '1';
    } else {
      element.value = value;
    }

    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  };

  this.isElementFillable = function(element) {
    // 1. 基础属性检查
    const fillableTags = ['INPUT', 'TEXTAREA', 'SELECT'];
    if (!element || !fillableTags.includes(element.tagName)) {
      return false;
    }

    // 过滤隐藏字段
    if (element.tagName === 'INPUT' && element.type === 'hidden') {
      return false;
    }

    // 过滤被禁用或只读的字段
    if (element.disabled || element.readOnly) {
      return false;
    }

    // 2. 递归CSS可见性检查
    let current = element;
    while (current && current.tagName !== 'BODY') {
      const style = window.getComputedStyle(current);
      if (!style) {
        return false;
      }

      if (style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity) === 0) {
        return false;
      }

      current = current.parentElement;
    }

    // 3. 几何尺寸检查
    const rect = element.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      // 例外：<select> 元素在某些浏览器和情况下尺寸可能为0但仍然可交互
      if (element.tagName !== 'SELECT') {
        return false;
      }
    }

    // 4. 启发式过滤规则
    // 检查名称和ID是否包含常见非用户输入字段的关键词
    const nameOrId = (element.name || element.id || '').toLowerCase();
    const honeypotKeywords = ['csrf', 'token', 'honeypot', 'captcha', 'spam', 'bot', 'fake'];
    if (honeypotKeywords.some(keyword => nameOrId.includes(keyword))) {
      return false;
    }

    // 检查autocomplete属性
    const autocomplete = element.getAttribute('autocomplete');
    if (autocomplete === 'off' && nameOrId.includes('email') === false) {
      // email字段即使autocomplete=off也可能是有效的
      return false;
    }

    return true;
  };

  this.isElementVisible = function(element) {
    try {
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();

      // 只检查明确的隐藏属性
      if (style.display === 'none' || style.visibility === 'hidden') {
        return false;
      }

      // 只在完全透明时隐藏
      if (parseFloat(style.opacity) === 0) {
        return false;
      }

      // 如果元素有实际位置和尺寸，通常就是可见的
      if (rect.width > 0 && rect.height > 0) {
        return true;
      }

      // 特殊处理：某些表单元素可能是inline或通过CSS设置尺寸
      const tagName = element.tagName.toLowerCase();
      if (['input', 'select', 'textarea', 'button'].includes(tagName)) {
        // 表单元素，只要有合理的样式属性就认为可见
        if (element.type !== 'hidden' && !element.hasAttribute('hidden')) {
          return true;
        }
      }

      // 默认认为可见，避免误判
      return true;
    } catch (error) {
      return true;
    }
  };

  this.highlightFormField = function(fieldIndex) {
    if (fieldIndex < 0 || fieldIndex >= this.formFields.length) {
      return false;
    }

    const field = this.formFields[fieldIndex];
    const element = field.element;

    // 如果该字段已经有高亮，先清除
    if (element.hasAttribute('data-highlighted')) {
      this.clearFieldHighlight(element);
    }

    // 创建高亮边框
    const highlightBorder = document.createElement('div');
    const rect = element.getBoundingClientRect();
    const scrollX = window.pageXOffset;
    const scrollY = window.pageYOffset;

    highlightBorder.style.position = 'absolute';
    highlightBorder.style.left = (rect.left + scrollX) + 'px';
    highlightBorder.style.top = (rect.top + scrollY) + 'px';
    highlightBorder.style.width = rect.width + 'px';
    highlightBorder.style.height = rect.height + 'px';
    highlightBorder.style.border = '3px solid #3b82f6';
    highlightBorder.style.borderRadius = '4px';
    highlightBorder.style.boxShadow = '0 0 0 1px #3b82f6, 0 0 8px rgba(59, 130, 246, 0.6)';
    highlightBorder.style.pointerEvents = 'none';
    highlightBorder.style.zIndex = '999999';
    highlightBorder.style.transition = 'all 0.3s ease';

    // 创建标签
    const label = document.createElement('div');
    label.style.position = 'absolute';
    label.style.left = (rect.left + scrollX) + 'px';
    label.style.top = (rect.top + scrollY - 30) + 'px';
    label.style.backgroundColor = '#3b82f6';
    label.style.color = 'white';
    label.style.padding = '4px 8px';
    label.style.borderRadius = '4px';
    label.style.fontSize = '12px';
    label.style.fontWeight = 'bold';
    label.style.zIndex = '1000000';
    label.style.pointerEvents = 'none';
    label.textContent = field.label || field.name;

    // 添加到文档
    document.body.appendChild(highlightBorder);
    document.body.appendChild(label);

    // 记录高亮元素
    const highlightId = `highlight-${fieldIndex}-${Date.now()}`;
    highlightBorder.id = highlightId;
    label.id = `${highlightId}-label`;
    this.highlightedFields.add(highlightId);

    // 标记原始元素
    element.setAttribute('data-highlighted', 'true');
    element.setAttribute('data-highlight-id', highlightId);

    // 添加脉冲动画
    this.addPulseAnimation(highlightBorder);

    // 确保元素在视口中
    this.scrollToElement(element);

    return true;
  };

  this.clearHighlights = function() {
    this.highlightedFields.forEach(highlightId => {
      // 删除高亮边框
      const highlightBorder = document.getElementById(highlightId);
      if (highlightBorder) {
        highlightBorder.remove();
      }

      // 删除标签
      const label = document.getElementById(`${highlightId}-label`);
      if (label) {
        label.remove();
      }

      // 清除原始元素的标记
      const originalElements = document.querySelectorAll(`[data-highlight-id="${highlightId}"]`);
      originalElements.forEach(element => {
        element.removeAttribute('data-highlighted');
        element.removeAttribute('data-highlight-id');
      });
    });
    this.highlightedFields.clear();
  };

  this.clearFieldHighlight = function(element) {
    const highlightId = element.getAttribute('data-highlight-id');
    if (highlightId) {
      const highlightBorder = document.getElementById(highlightId);
      const label = document.getElementById(`${highlightId}-label`);

      if (highlightBorder) {
        highlightBorder.remove();
      }
      if (label) {
        label.remove();
      }

      element.removeAttribute('data-highlighted');
      element.removeAttribute('data-highlight-id');
      this.highlightedFields.delete(highlightId);
    }
  };

  this.addPulseAnimation = function(element) {
    let opacity = 0.6;
    let direction = 1;
    let animationId;

    const pulse = () => {
      opacity += direction * 0.02;
      if (opacity >= 0.8) direction = -1;
      if (opacity <= 0.4) direction = 1;

      element.style.boxShadow = `0 0 0 1px #3b82f6, 0 0 ${8 + opacity * 4}px rgba(59, 130, 246, ${opacity})`;

      if (this.highlightedFields.has(element.id)) {
        animationId = requestAnimationFrame(pulse);
      }
    };

    animationId = requestAnimationFrame(pulse);

    // 存储动画ID以便清理
    element.setAttribute('data-animation-id', animationId);
  };

  this.scrollToElement = function(element) {
    const rect = element.getBoundingClientRect();
    const isInViewport = (
      rect.top >= 0 &&
      rect.left >= 0 &&
      rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
      rect.right <= (window.innerWidth || document.documentElement.clientWidth)
    );

    if (!isInViewport) {
      element.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
        inline: 'center'
      });
    }
  };
})();

const pageAnalyzer = new (function() {
  // Page Analyzer Module 内联版本
  this.pageData = {};

  this.analyzePageContent = function() {
    const pageData = {
      url: window.location.href,
      title: document.title,
      description: this.getMetaDescription(),
      content: this.extractMainContent(),
      headings: this.extractHeadings(),
      links: this.extractLinks(),
      images: this.extractImages(),
      wordCount: this.getWordCount(),
      language: this.detectLanguage(),
      timestamp: new Date().toISOString()
    };

    this.pageData = pageData;
    return pageData;
  };

  this.getMetaDescription = function() {
    const metaDesc = document.querySelector('meta[name="description"]');
    return metaDesc ? metaDesc.getAttribute('content') : '';
  };

  this.extractMainContent = function() {
    let mainContent = document.querySelector('main') ||
                     document.querySelector('article') ||
                     document.querySelector('[role="main"], .main, .content, #main, #content') ||
                     document.body;

    const text = mainContent.innerText || mainContent.textContent || '';
    return text.replace(/\s+/g, ' ').trim();
  };

  this.extractHeadings = function() {
    const headings = [];
    const headingElements = document.querySelectorAll('h1, h2, h3, h4, h5, h6');

    headingElements.forEach((heading, index) => {
      headings.push({
        level: parseInt(heading.tagName.charAt(1)),
        text: heading.textContent.trim(),
        id: heading.id || `heading-${index}`
      });
    });

    return headings;
  };

  this.extractLinks = function() {
    const links = [];
    const linkElements = document.querySelectorAll('a[href]');

    linkElements.forEach(link => {
      const href = link.getAttribute('href');
      if (href && !href.startsWith('javascript:')) {
        links.push({
          text: link.textContent.trim(),
          href: href,
          isExternal: this.isExternalLink(href)
        });
      }
    });

    return links;
  };

  this.extractImages = function() {
    const images = [];
    const imageElements = document.querySelectorAll('img');

    imageElements.forEach(img => {
      images.push({
        src: img.src,
        alt: img.alt || '',
        title: img.title || '',
        width: img.width || 0,
        height: img.height || 0
      });
    });

    return images;
  };

  this.getWordCount = function() {
    const text = this.extractMainContent();
    const chineseChars = (text.match(/[\u4e00-\u9fff]/g) || []).length;
    const englishWords = text.replace(/[\u4e00-\u9fff]/g, ' ')
                            .split(/\s+/)
                            .filter(word => word.length > 0).length;

    return {
      total: chineseChars + englishWords,
      chinese: chineseChars,
      english: englishWords
    };
  };

  this.detectLanguage = function() {
    const htmlLang = document.documentElement.lang;
    if (htmlLang) return htmlLang;

    const metaLang = document.querySelector('meta[http-equiv="content-language"]');
    if (metaLang) return metaLang.getAttribute('content');

    const text = this.extractMainContent();
    const chineseChars = (text.match(/[\u4e00-\u9fff]/g) || []).length;
    const totalChars = text.replace(/\s/g, '').length;

    if (chineseChars > totalChars * 0.3) {
      return 'zh-CN';
    }

    return 'en';
  };

  this.isExternalLink = function(href) {
    try {
      const url = new URL(href, window.location.href);
      return url.hostname !== window.location.hostname;
    } catch (e) {
      return false;
    }
  };

  this.analyzeWithAI = async function() {
    const pageData = this.analyzePageContent();

    // 获取AI配置
    const configResult = await new Promise((resolve, reject) => {
      chrome.storage.sync.get(['aiConfig'], (result) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(result);
        }
      });
    });

    const config = configResult.aiConfig;
    if (!config) {
      throw new Error('请先在配置页面设置AI服务');
    }

    const response = await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        action: 'analyzePageContent',
        pageData: pageData,
        config: config
      }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    });

    if (!response || !response.success) {
      throw new Error(response?.error || 'AI分析响应无效');
    }

    return {
      pageData: pageData,
      analysis: response.data
    };
  };
})();

// 消息监听器
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  try {
    if (request.action === 'detectForms') {
      const formData = formFiller.detectFormFields();
      sendResponse({success: true, data: formData});
    }

    else if (request.action === 'fillForm') {
      // 填充前清除高亮
      formFiller.clearHighlights();
      formFiller.fillFormWithAI()
        .then(data => sendResponse({success: true, data: data}))
        .catch(error => sendResponse({success: false, error: error.message}));
      return true;
    }

    else if (request.action === 'fillSingleField') {
      // 填充前清除高亮
      formFiller.clearHighlights();
      formFiller.fillSingleFieldWithAI(request.fieldIndex)
        .then(data => sendResponse({success: true, data: data}))
        .catch(error => sendResponse({success: false, error: error.message}));
      return true;
    }

    else if (request.action === 'highlightField') {
      const success = formFiller.highlightFormField(request.fieldIndex);
      sendResponse({success: success, data: success ? '字段已高亮' : '高亮失败'});
    }

    else if (request.action === 'clearHighlights') {
      formFiller.clearHighlights();
      sendResponse({success: true, data: '高亮已清除'});
    }

    else if (request.action === 'analyzePage') {
      const pageData = pageAnalyzer.analyzePageContent();
      sendResponse({success: true, data: pageData});
    }

    else if (request.action === 'ping') {
      sendResponse({success: true, message: 'pong'});
    }

    else if (request.action === 'analyzePageWithAI') {
      pageAnalyzer.analyzeWithAI()
        .then(data => sendResponse({success: true, data: data}))
        .catch(error => sendResponse({success: false, error: error.message}));
      return true;
    }
  } catch (error) {
    sendResponse({success: false, error: error.message});
  }
});