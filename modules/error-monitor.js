// Error Monitor Module - 提取自 content.js
(function(global) {
  class ErrorMonitor {
    constructor() {
      this.errors = [];
      this.maxErrors = 100;
      this.isEnabled = true;
      this.errorFilters = {
        ignoreScripts: true,
        ignoreThirdParty: true,
        ignoreChromeExtensions: true
      };
      this.originalConsoleError = console.error.bind(console);
      this.init();
    }

    init() {
      this.setupErrorListeners();
    }

    setupErrorListeners() {
      window.addEventListener('error', (event) => this.handleGlobalError(event));
      window.addEventListener('unhandledrejection', (event) => this.handleUnhandledRejection(event));
      console.error = (...args) => this.handleConsoleError(args);
    }

    handleGlobalError(event) {
      if (!this.isEnabled) return;

      const error = {
        type: 'error',
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        stack: event.error?.stack || '',
        timestamp: new Date().toISOString(),
        url: window.location.href,
        userAgent: navigator.userAgent
      };

      if (this.shouldCaptureError(error)) {
        this.captureError(error);
      }
    }

    handleUnhandledRejection(event) {
      if (!this.isEnabled) return;

      const error = {
        type: 'promise',
        message: event.reason?.message || event.reason || 'Unhandled Promise Rejection',
        stack: event.reason?.stack || '',
        timestamp: new Date().toISOString(),
        url: window.location.href,
        userAgent: navigator.userAgent
      };

      if (this.shouldCaptureError(error)) {
        this.captureError(error);
      }
    }

    handleConsoleError(args) {
      if (!this.isEnabled) {
        this.originalConsoleError(...args);
        return;
      }

      const message = args.map(arg => {
        if (typeof arg === 'object') {
          try {
            return JSON.stringify(arg, null, 2);
          } catch (error) {
            return String(arg);
          }
        }
        return String(arg);
      }).join(' ');

      const error = {
        type: 'console',
        message: message,
        stack: this.extractStackFromConsole(args),
        timestamp: new Date().toISOString(),
        url: window.location.href,
        userAgent: navigator.userAgent
      };

      if (this.shouldCaptureError(error)) {
        this.captureError(error);
      }

      this.originalConsoleError(...args);
    }

    extractStackFromConsole(args) {
      const errorArg = args.find(arg => arg instanceof Error);
      if (errorArg) {
        return errorArg.stack || '';
      }

      try {
        const stackTrace = new Error().stack;
        return stackTrace ? stackTrace.split('\n').slice(3).join('\n') : '';
      } catch (error) {
        return '';
      }
    }

    shouldCaptureError(error) {
      if (error.filename && this.errorFilters.ignoreScripts) {
        if (error.filename.includes('chrome-extension://') ||
            error.filename.includes('moz-extension://')) {
          return false;
        }
      }

      if (error.filename && this.errorFilters.ignoreThirdParty) {
        try {
          const currentDomain = window.location.hostname;
          const errorDomain = new URL(error.filename, window.location.href).hostname;
          if (currentDomain !== errorDomain) {
            return false;
          }
        } catch (e) {
          // ignore URL parse errors
        }
      }

      if (!error.message) {
        return false;
      }

      const ignorePatterns = [
        /Script error/i,
        /Failed to fetch/i,
        /Network request failed/i,
        /TypeError: undefined is not a function/i,
        /TypeError: Cannot read property/i
      ];

      if (ignorePatterns.some(pattern => pattern.test(error.message))) {
        return false;
      }

      return true;
    }

    captureError(error) {
      error.id = Date.now().toString() + Math.random().toString(36).substr(2, 9);

      this.errors.unshift(error);

      if (this.errors.length > this.maxErrors) {
        this.errors = this.errors.slice(0, this.maxErrors);
      }

      this.sendErrorToBackground(error);
      this.showErrorIndicator();
    }

    sendErrorToBackground(error) {
      chrome.runtime.sendMessage({
        action: 'captureError',
        error: error
      }).catch(e => {
        this.originalConsoleError('Failed to send error to background:', e);
      });
    }

    showErrorIndicator() {
      let indicator = document.getElementById('js-error-indicator');
      if (!indicator) {
        indicator = document.createElement('div');
        indicator.id = 'js-error-indicator';
        indicator.style.cssText = `
          position: fixed;
          top: 10px;
          right: 10px;
          background: #ef4444;
          color: white;
          padding: 8px 12px;
          border-radius: 4px;
          font-size: 12px;
          font-weight: bold;
          z-index: 1000000;
          cursor: pointer;
          box-shadow: 0 2px 8px rgba(0,0,0,0.3);
          transition: all 0.3s ease;
        `;
        indicator.textContent = '⚠️ JavaScript 错误';
        indicator.title = '点击查看错误详情';
        indicator.addEventListener('click', () => this.showErrorPanel());
        document.body.appendChild(indicator);
      }
    }

    showErrorPanel() {
      let panel = document.getElementById('js-error-panel');
      if (!panel) {
        panel = this.createErrorPanel();
      }
      panel.style.display = 'block';
      this.updateErrorPanel();
    }

    createErrorPanel() {
      const panel = document.createElement('div');
      panel.id = 'js-error-panel';
      panel.style.cssText = `
        position: fixed;
        top: 50px;
        right: 10px;
        width: 400px;
        max-height: 500px;
        background: white;
        border: 1px solid #ddd;
        border-radius: 8px;
        box-shadow: 0 4px 16px rgba(0,0,0,0.1);
        z-index: 1000000;
        font-family: monospace;
        font-size: 12px;
        display: none;
        flex-direction: column;
      `;

      const header = document.createElement('div');
      header.style.cssText = `
        padding: 12px;
        background: #f3f4f6;
        border-bottom: 1px solid #ddd;
        border-radius: 8px 8px 0 0;
        display: flex;
        justify-content: space-between;
        align-items: center;
      `;
      header.innerHTML = `
        <span style="font-weight: bold; color: #374151;">JavaScript 错误监控</span>
        <button id="close-error-panel" style="background: none; border: none; font-size: 16px; cursor: pointer;">✕</button>
      `;

      const content = document.createElement('div');
      content.id = 'js-error-panel-content';
      content.style.cssText = `
        padding: 12px;
        overflow-y: auto;
        max-height: 400px;
      `;

      panel.appendChild(header);
      panel.appendChild(content);

      document.body.appendChild(panel);

      document.getElementById('close-error-panel').addEventListener('click', () => {
        panel.style.display = 'none';
      });

      return panel;
    }

    updateErrorPanel() {
      const content = document.getElementById('js-error-panel-content');
      if (!content) return;

      if (this.errors.length === 0) {
        content.innerHTML = '<div style="text-align: center; color: #6b7280;">暂无错误</div>';
        return;
      }

      content.innerHTML = this.errors.map(error => `
        <div style="margin-bottom: 16px; padding: 12px; background: #fef2f2; border: 1px solid #fecaca; border-radius: 4px;">
          <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
            <span style="font-weight: bold; color: #dc2626;">${error.type.toUpperCase()}</span>
            <span style="color: #6b7280; font-size: 10px;">${new Date(error.timestamp).toLocaleTimeString()}</span>
          </div>
          <div style="color: #374151; margin-bottom: 8px; word-break: break-all;">${error.message}</div>
          ${error.filename ? `<div style="color: #6b7280; font-size: 10px;">${error.filename}:${error.lineno}:${error.colno}</div>` : ''}
          <div style="margin-top: 8px;">
            <button class="analyze-error-btn" data-error-id="${error.id}" style="background: #3b82f6; color: white; border: none; padding: 4px 8px; border-radius: 3px; font-size: 10px; cursor: pointer;">AI 分析</button>
          </div>
        </div>
      `).join('');

      document.querySelectorAll('.analyze-error-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const errorId = e.target.dataset.errorId;
          this.analyzeErrorWithAI(errorId);
        });
      });
    }

    async analyzeErrorWithAI(errorId) {
      const error = this.errors.find(e => e.id === errorId);
      if (!error) return;

      try {
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
          this.showErrorAnalysis(errorId, '请先在配置页面设置AI服务');
          return;
        }

        const response = await chrome.runtime.sendMessage({
          action: 'analyzeError',
          error: error,
          config: config
        });

        if (response?.success) {
          this.showErrorAnalysis(errorId, response.data);
        } else {
          this.showErrorAnalysis(errorId, 'AI分析失败: ' + (response?.error || '未知错误'));
        }
      } catch (e) {
        this.showErrorAnalysis(errorId, '发送AI分析请求失败: ' + e.message);
      }
    }

    showErrorAnalysis(errorId, analysis) {
      const errorButton = document.querySelector(`[data-error-id="${errorId}"]`);
      if (!errorButton) return;

      const errorContainer = errorButton.closest('div[style*="background: #fef2f2"]');
      if (!errorContainer) return;

      const analysisDiv = document.createElement('div');
      analysisDiv.style.cssText = `
        margin-top: 8px;
        padding: 8px;
        background: #eff6ff;
        border: 1px solid #bfdbfe;
        border-radius: 4px;
        font-size: 11px;
        color: #1e40af;
      `;
      analysisDiv.innerHTML = `
        <div style="font-weight: bold; margin-bottom: 4px;">AI 分析结果:</div>
        <div>${analysis}</div>
      `;

      errorContainer.appendChild(analysisDiv);
    }

    getErrors() {
      return this.errors;
    }

    clearErrors() {
      this.errors = [];
      const indicator = document.getElementById('js-error-indicator');
      if (indicator) {
        indicator.remove();
      }
      const panel = document.getElementById('js-error-panel');
      if (panel) {
        panel.remove();
      }
    }

    setEnabled(enabled) {
      this.isEnabled = enabled;
    }
  }

  global.errorMonitor = new ErrorMonitor();
})(window);
