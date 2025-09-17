// Form Filler Module - 提取自 content.js
(function(global) {
  class FormFiller {
    constructor() {
      this.formFields = [];
      this.highlightedFields = new Set();
    }

    detectFormFields() {
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
    }

    extractFieldInfo(element, index) {
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
    }

    getFieldLabel(element) {
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
    }

    async fillFormWithAI() {
      if (this.formFields.length === 0) {
        throw new Error('未检测到表单字段');
      }

      const config = await this.fetchAIConfig();
      const response = await this.requestFormData(config);

      if (!response || !response.success) {
        throw new Error(response?.error || '表单填充响应无效');
      }

      this.fillFields(response.data);
      return response.data;
    }

    async fillSingleFieldWithAI(fieldIndex) {
      if (this.formFields.length === 0) {
        throw new Error('未检测到表单字段');
      }

      if (fieldIndex < 0 || fieldIndex >= this.formFields.length) {
        throw new Error('无效的字段索引');
      }

      const field = this.formFields[fieldIndex];
      const config = await this.fetchAIConfig();

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
        }, (res) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(res);
          }
        });
      });

      if (!response || !response.success) {
        throw new Error(response?.error || '字段填充响应无效');
      }

      const fieldValue = response.data;
      this.setFieldValue(field.element, fieldValue);
      return fieldValue;
    }

    async fetchAIConfig() {
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

      return config;
    }

    requestFormData(config) {
      return new Promise((resolve, reject) => {
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
    }

    fillFields(data) {
      this.formFields.forEach(field => {
        const fieldData = data[field.name];
        if (fieldData) {
          this.setFieldValue(field.element, fieldData);
        }
      });
    }

    setFieldValue(element, value) {
      if (element.type === 'select-one' || element.type === 'select-multiple') {
        const option = Array.from(element.options).find(opt =>
          opt.text.toLowerCase().includes(String(value).toLowerCase()) ||
          opt.value.toLowerCase().includes(String(value).toLowerCase())
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
    }

    isElementFillable(element) {
      const fillableTags = ['INPUT', 'TEXTAREA', 'SELECT'];
      if (!element || !fillableTags.includes(element.tagName)) {
        return false;
      }

      if (element.tagName === 'INPUT' && element.type === 'hidden') {
        return false;
      }

      if (element.disabled || element.readOnly) {
        return false;
      }

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

      const rect = element.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) {
        if (element.tagName !== 'SELECT') {
          return false;
        }
      }

      const nameOrId = (element.name || element.id || '').toLowerCase();
      const honeypotKeywords = ['csrf', 'token', 'honeypot', 'captcha', 'spam', 'bot', 'fake'];
      if (honeypotKeywords.some(keyword => nameOrId.includes(keyword))) {
        return false;
      }

      const autocomplete = element.getAttribute('autocomplete');
      if (autocomplete === 'off' && nameOrId.includes('email') === false) {
        return false;
      }

      return true;
    }

    isElementVisible(element) {
      try {
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();

        if (style.display === 'none' || style.visibility === 'hidden') {
          return false;
        }

        if (parseFloat(style.opacity) === 0) {
          return false;
        }

        if (rect.width > 0 && rect.height > 0) {
          return true;
        }

        const tagName = element.tagName.toLowerCase();
        if (['input', 'select', 'textarea', 'button'].includes(tagName)) {
          if (element.type !== 'hidden' && !element.hasAttribute('hidden')) {
            return true;
          }
        }

        return true;
      } catch (error) {
        return true;
      }
    }

    highlightFormField(fieldIndex) {
      if (fieldIndex < 0 || fieldIndex >= this.formFields.length) {
        return false;
      }

      const field = this.formFields[fieldIndex];
      const element = field.element;

      if (element.hasAttribute('data-highlighted')) {
        this.clearFieldHighlight(element);
      }

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

      document.body.appendChild(highlightBorder);
      document.body.appendChild(label);

      const highlightId = `highlight-${fieldIndex}-${Date.now()}`;
      highlightBorder.id = highlightId;
      label.id = `${highlightId}-label`;
      this.highlightedFields.add(highlightId);

      element.setAttribute('data-highlighted', 'true');
      element.setAttribute('data-highlight-id', highlightId);

      this.addPulseAnimation(highlightBorder);
      this.scrollToElement(element);

      return true;
    }

    clearHighlights() {
      this.highlightedFields.forEach(highlightId => {
        const highlightBorder = document.getElementById(highlightId);
        if (highlightBorder) {
          highlightBorder.remove();
        }

        const label = document.getElementById(`${highlightId}-label`);
        if (label) {
          label.remove();
        }

        const originalElements = document.querySelectorAll(`[data-highlight-id="${highlightId}"]`);
        originalElements.forEach(element => {
          element.removeAttribute('data-highlighted');
          element.removeAttribute('data-highlight-id');
        });
      });
      this.highlightedFields.clear();
    }

    clearFieldHighlight(element) {
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
    }

    addPulseAnimation(element) {
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
      element.setAttribute('data-animation-id', animationId);
    }

    scrollToElement(element) {
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
    }
  }

  global.formFiller = new FormFiller();
})(window);
