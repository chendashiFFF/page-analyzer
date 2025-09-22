// Content Script - 页面内容处理
/* global formFiller, errorMonitor, pageAnalyzer */

(function() {
  const filler = window.formFiller;
  const monitor = window.errorMonitor;
  const analyzer = window.pageAnalyzer;

  if (!filler || !monitor || !analyzer) {
    console.warn('内容脚本缺少所需模块:', {
      formFiller: Boolean(filler),
      errorMonitor: Boolean(monitor),
      pageAnalyzer: Boolean(analyzer)
    });
    return;
  }

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    try {
      switch (request.action) {
        case 'detectForms': {
          const formData = filler.detectFormFields();
          sendResponse({ success: true, data: formData });
          break;
        }

        case 'fillForm': {
          filler.clearHighlights();
          filler.fillFormWithAI()
            .then(data => sendResponse({ success: true, data }))
            .catch(error => sendResponse({ success: false, error: error.message }));
          return true;
        }

        case 'fillSingleField': {
          filler.clearHighlights();
          filler.fillSingleFieldWithAI(request.fieldIndex)
            .then(data => sendResponse({ success: true, data }))
            .catch(error => sendResponse({ success: false, error: error.message }));
          return true;
        }

        case 'highlightField': {
          const success = filler.highlightFormField(request.fieldIndex);
          sendResponse({ success, data: success ? '字段已高亮' : '高亮失败' });
          break;
        }

        case 'clearHighlights': {
          filler.clearHighlights();
          sendResponse({ success: true, data: '高亮已清除' });
          break;
        }

        case 'analyzePage': {
          const pageData = analyzer.analyzePageContent();
          sendResponse({ success: true, data: pageData });
          break;
        }

        case 'analyzePageWithAI': {
          analyzer.analyzeWithAI()
            .then(data => sendResponse({ success: true, data }))
            .catch(error => sendResponse({ success: false, error: error.message }));
          return true;
        }

        case 'getErrorList': {
          sendResponse({ success: true, data: monitor.getErrors() });
          break;
        }

        case 'clearErrors': {
          monitor.clearErrors();
          sendResponse({ success: true, data: '错误已清除' });
          break;
        }

        case 'toggleErrorMonitor': {
          monitor.setEnabled(request.enabled);
          sendResponse({ success: true, data: `错误监控已${request.enabled ? '启用' : '禁用'}` });
          break;
        }

        case 'analyzeErrorWithAI': {
          const errorId = request.errorId;
          const error = monitor.getErrors().find(e => e.id === errorId);
          if (error) {
            monitor.analyzeErrorWithAI(errorId);
            sendResponse({ success: true, data: 'AI分析已启动' });
          } else {
            sendResponse({ success: false, error: '错误未找到' });
          }
          break;
        }

        case 'ping': {
          sendResponse({ success: true, message: 'pong' });
          break;
        }

        default:
          sendResponse({ success: false, error: `未知的action: ${request.action}` });
      }
    } catch (error) {
      sendResponse({ success: false, error: error.message });
    }
    return false;
  });
})();
