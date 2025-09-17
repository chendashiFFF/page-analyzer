// Content Script - 页面内容处理
// 导入模块
const formFiller = new (function() {
  // AI Form Filler Module 内联版本
  this.formFields = [];

  this.detectFormFields = function() {
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

    return {
      index,
      element,
      name,
      type,
      label,
      placeholder,
      required,
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
      formFiller.fillFormWithAI()
        .then(data => sendResponse({success: true, data: data}))
        .catch(error => sendResponse({success: false, error: error.message}));
      return true;
    }

    else if (request.action === 'fillSingleField') {
      formFiller.fillSingleFieldWithAI(request.fieldIndex)
        .then(data => sendResponse({success: true, data: data}))
        .catch(error => sendResponse({success: false, error: error.message}));
      return true;
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