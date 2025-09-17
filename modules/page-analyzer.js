// Page Analyzer Module - 提取自 content.js
(function(global) {
  class PageAnalyzer {
    constructor() {
      this.pageData = {};
    }

    analyzePageContent() {
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
    }

    getMetaDescription() {
      const metaDesc = document.querySelector('meta[name="description"]');
      return metaDesc ? metaDesc.getAttribute('content') : '';
    }

    extractMainContent() {
      const mainContent = document.querySelector('main') ||
        document.querySelector('article') ||
        document.querySelector('[role="main"], .main, .content, #main, #content') ||
        document.body;

      const text = mainContent ? (mainContent.innerText || mainContent.textContent || '') : '';
      return text.replace(/\s+/g, ' ').trim();
    }

    extractHeadings() {
      const headings = [];
      const headingElements = document.querySelectorAll('h1, h2, h3, h4, h5, h6');

      headingElements.forEach((heading, index) => {
        headings.push({
          level: parseInt(heading.tagName.charAt(1), 10),
          text: heading.textContent.trim(),
          id: heading.id || `heading-${index}`
        });
      });

      return headings;
    }

    extractLinks() {
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
    }

    extractImages() {
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
    }

    getWordCount() {
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
    }

    detectLanguage() {
      const htmlLang = document.documentElement.lang;
      if (htmlLang) return htmlLang;

      const metaLang = document.querySelector('meta[http-equiv="content-language"]');
      if (metaLang) return metaLang.getAttribute('content');

      const text = this.extractMainContent();
      const chineseChars = (text.match(/[\u4e00-\u9fff]/g) || []).length;
      const totalChars = text.replace(/\s/g, '').length;

      if (totalChars > 0 && chineseChars > totalChars * 0.3) {
        return 'zh-CN';
      }

      return 'en';
    }

    isExternalLink(href) {
      try {
        const url = new URL(href, window.location.href);
        return url.hostname !== window.location.hostname;
      } catch (error) {
        return false;
      }
    }

    async analyzeWithAI() {
      const pageData = this.analyzePageContent();

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
        }, (res) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(res);
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
    }
  }

  global.pageAnalyzer = new PageAnalyzer();
})(window);
