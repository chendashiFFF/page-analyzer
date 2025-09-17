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
      if (fieldInfo) {
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

    return {
      index,
      element,
      name,
      type,
      label,
      placeholder,
      required,
      isVisible,
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

    // 清除之前的高亮
    this.clearHighlights();

    // 创建主高亮层
    const highlightId = `form-highlight-${fieldIndex}`;
    const highlightDiv = document.createElement('div');
    highlightDiv.id = highlightId;

    // 创建高亮标签
    const labelDiv = document.createElement('div');
    labelDiv.className = 'form-highlight-label';
    labelDiv.textContent = field.label || field.name || '表单字段';
    labelDiv.style.cssText = `
      position: absolute;
      top: -30px;
      left: 0;
      background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
      color: white;
      padding: 4px 8px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 600;
      z-index: 10000;
      box-shadow: 0 2px 8px rgba(99, 102, 241, 0.3);
      white-space: nowrap;
      max-width: 200px;
      overflow: hidden;
      text-overflow: ellipsis;
    `;

    // 创建角标
    const cornerBadge = document.createElement('div');
    cornerBadge.className = 'form-highlight-corner';
    cornerBadge.innerHTML = '●';
    cornerBadge.style.cssText = `
      position: absolute;
      top: -8px;
      right: -8px;
      width: 16px;
      height: 16px;
      background: linear-gradient(135deg, #f59e0b 0%, #ef4444 100%);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-size: 10px;
      font-weight: bold;
      z-index: 10001;
      animation: cornerPulse 1.5s ease-in-out infinite;
    `;

    // 添加CSS动画
    if (!document.getElementById('highlight-animations')) {
      const style = document.createElement('style');
      style.id = 'highlight-animations';
      style.textContent = `
        @keyframes cornerPulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.2); opacity: 0.8; }
        }
        @keyframes highlightGlow {
          0%, 100% {
            box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.4),
                       0 0 20px rgba(99, 102, 241, 0.2),
                       0 0 40px rgba(99, 102, 241, 0.1);
          }
          50% {
            box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.6),
                       0 0 30px rgba(99, 102, 241, 0.3),
                       0 0 60px rgba(99, 102, 241, 0.15);
          }
        }
        @keyframes highlightBorder {
          0%, 100% { border-color: #6366f1; }
          50% { border-color: #8b5cf6; }
        }
      `;
      document.head.appendChild(style);
    }

    // 设置主高亮样式
    highlightDiv.style.cssText = `
      position: absolute;
      border: 3px solid #6366f1;
      background: linear-gradient(135deg, rgba(99, 102, 241, 0.08) 0%, rgba(139, 92, 246, 0.12) 100%);
      border-radius: 8px;
      pointer-events: none;
      z-index: 9999;
      transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
      animation: highlightGlow 2s ease-in-out infinite, highlightBorder 3s ease-in-out infinite;
      backdrop-filter: blur(2px);
    `;

    // 计算元素位置
    const rect = element.getBoundingClientRect();
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;

    highlightDiv.style.left = `${rect.left + scrollLeft - 3}px`;
    highlightDiv.style.top = `${rect.top + scrollTop - 3}px`;
    highlightDiv.style.width = `${rect.width + 6}px`;
    highlightDiv.style.height = `${rect.height + 6}px`;

    // 添加元素到页面
    document.body.appendChild(highlightDiv);
    document.body.appendChild(labelDiv);
    document.body.appendChild(cornerBadge);

    // 保存引用
    this.highlightedFields.add(highlightId);
    this.highlightedFields.add(`${highlightId}-label`);
    this.highlightedFields.add(`${highlightId}-corner`);

    // 滚动到高亮元素
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });

    // 添加元素本身的视觉效果
    element.style.transition = 'all 0.3s ease';
    element.style.transform = 'scale(1.02)';
    element.style.boxShadow = '0 4px 20px rgba(99, 102, 241, 0.3)';

    return true;
  };

  this.clearHighlights = function() {
    this.highlightedFields.forEach(highlightId => {
      const element = document.getElementById(highlightId);
      if (element) {
        element.remove();
      }
    });
    this.highlightedFields.clear();

    // 清除所有表单元素的视觉效果
    this.formFields.forEach(field => {
      if (field.element) {
        field.element.style.transition = '';
        field.element.style.transform = '';
        field.element.style.boxShadow = '';
      }
    });
  };

  this.addPulseAnimation = function(element) {
    let opacity = 0.3;
    let direction = 1;

    const pulse = () => {
      opacity += direction * 0.05;
      if (opacity >= 0.6) direction = -1;
      if (opacity <= 0.3) direction = 1;

      element.style.backgroundColor = `rgba(99, 102, 241, ${opacity})`;

      if (this.highlightedFields.has(element.id)) {
        requestAnimationFrame(pulse);
      }
    };

    requestAnimationFrame(pulse);
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