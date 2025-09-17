(function(global) {
  const DEFAULT_LIMIT = 20;
  const LOCAL_KEY = 'analysisHistory';
  const SYNC_KEY = 'analysisHistoryMeta';

  class HistoryManager {
    constructor(options = {}) {
      this.limit = options.limit || DEFAULT_LIMIT;
      this.localKey = options.localKey || LOCAL_KEY;
      this.syncKey = options.syncKey || SYNC_KEY;
      const hasChrome = typeof chrome !== 'undefined' && chrome.storage;
      this.storageLocal = hasChrome ? chrome.storage.local : null;
      this.storageSync = hasChrome ? chrome.storage.sync : null;
    }

    async getHistory() {
      if (!this.storageLocal) return [];
      const result = await this.storageLocal.get([this.localKey]);
      const history = result[this.localKey] || [];
      return Array.isArray(history) ? history : [];
    }

    async getHistoryMeta() {
      if (!this.storageSync) return [];
      const result = await this.storageSync.get([this.syncKey]);
      const meta = result[this.syncKey] || [];
      return Array.isArray(meta) ? meta : [];
    }

    async clearHistory() {
      if (!this.storageLocal) return;
      await this.storageLocal.remove(this.localKey);
      if (this.storageSync) {
        await this.storageSync.remove(this.syncKey);
      }
    }

    async saveAnalysisEntry(payload) {
      if (!this.storageLocal) return null;
      const {
        url,
        pageData = {},
        analysisText = '',
        pageSignature,
        source = 'ai',
        cacheKey = null
      } = payload || {};

      const normalizedUrl = this.normalizeUrl(url || pageData.url || '');
      const signature = pageSignature || cacheKey || await this.computeSignature(pageData, normalizedUrl);
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const createdAt = new Date().toISOString();
      const pageMetrics = this.extractMetrics(pageData);
      const conciseAnalysis = this.toAnalysisText(analysisText);
      const entry = {
        id,
        normalizedUrl,
        originalUrl: url || pageData.url || '',
        pageTitle: pageData.title || '',
        pageSignature: signature,
        createdAt,
        source,
        analysisText: conciseAnalysis,
        pageMetrics
      };

      if (pageData && Object.keys(pageData).length > 0) {
        entry.pageData = this.buildPageSnapshot(pageData);
      }

      let history = await this.getHistory();
      history = history.filter(item => !(item.pageSignature === signature && item.normalizedUrl === normalizedUrl));
      history.unshift(entry);
      if (history.length > this.limit) {
        history = history.slice(0, this.limit);
      }

      await this.storageLocal.set({ [this.localKey]: history });
      await this.persistMeta(history);

      return entry;
    }

    async findBySignature(url, signature) {
      if (!url || !signature) return null;
      const normalizedUrl = this.normalizeUrl(url);
      const history = await this.getHistory();
      return history.find(item => item.normalizedUrl === normalizedUrl && item.pageSignature === signature) || null;
    }

    async persistMeta(history) {
      if (!this.storageSync) return;
      const meta = history.map(item => ({
        id: item.id,
        normalizedUrl: item.normalizedUrl,
        pageTitle: item.pageTitle,
        analysisPreview: this.sliceText(item.analysisText, 140),
        createdAt: item.createdAt,
        originalUrl: item.originalUrl
      }));
      await this.storageSync.set({ [this.syncKey]: meta });
    }

    extractMetrics(pageData = {}) {
      const headings = Array.isArray(pageData.headings) ? pageData.headings.length : 0;
      const links = Array.isArray(pageData.links) ? pageData.links.length : 0;
      const images = Array.isArray(pageData.images) ? pageData.images.length : 0;
      const wordCount = typeof pageData.wordCount === 'object' ? pageData.wordCount : null;
      return {
        language: pageData.language || '',
        headings,
        links,
        images,
        wordCount,
        timestamp: pageData.timestamp || null
      };
    }

    buildPageSnapshot(pageData = {}) {
      const contentPreview = this.sliceText(pageData.content || '', 500);
      return {
        title: pageData.title || '',
        url: pageData.url || '',
        description: pageData.description || '',
        language: pageData.language || '',
        wordCount: pageData.wordCount || null,
        headings: Array.isArray(pageData.headings) ? pageData.headings.slice(0, 20) : [],
        contentPreview,
        timestamp: pageData.timestamp || null
      };
    }

    normalizeUrl(rawUrl) {
      if (!rawUrl) return '';
      try {
        const url = new URL(rawUrl);
        url.hash = '';
        url.username = '';
        url.password = '';
        const normalizedPath = url.pathname.replace(/\/+$/, '') || '/';
        const lowerHost = url.hostname.toLowerCase();
        url.pathname = normalizedPath;
        url.hostname = lowerHost;
        return url.toString();
      } catch (error) {
        console.warn('normalizeUrl failed:', error);
        return rawUrl;
      }
    }

    async computeSignature(pageData = {}, normalizedUrl = '') {
      const snapshot = {
        url: normalizedUrl || this.normalizeUrl(pageData.url || ''),
        title: pageData.title || '',
        language: pageData.language || '',
        wordCount: pageData.wordCount?.total || 0,
        headings: (pageData.headings || []).slice(0, 10).map(h => ({
          level: h.level,
          text: this.sliceText(h.text, 80)
        })),
        contentPreview: this.sliceText(pageData.content || '', 800)
      };

      const payload = JSON.stringify(snapshot);
      try {
        if (typeof crypto !== 'undefined' && crypto.subtle && typeof TextEncoder !== 'undefined') {
          const encoder = new TextEncoder();
          const data = encoder.encode(payload);
          const digest = await crypto.subtle.digest('SHA-256', data);
          return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
        }
      } catch (error) {
        console.warn('computeSignature SHA-256 failed, fallback to simple hash:', error);
      }
      return this.simpleHash(payload);
    }

    simpleHash(text) {
      let hash = 0;
      for (let i = 0; i < text.length; i += 1) {
        const char = text.charCodeAt(i);
        hash = (hash << 5) - hash + char;
        hash |= 0;
      }
      return `fallback-${Math.abs(hash)}`;
    }

    toAnalysisText(input) {
      if (typeof input === 'string') return input;
      if (input && typeof input === 'object') {
        if (input.analysis && typeof input.analysis === 'string') return input.analysis;
        if (Array.isArray(input)) return input.join('\n');
        try {
          return JSON.stringify(input);
        } catch {
          return String(input);
        }
      }
      return '';
    }

    sliceText(text, length) {
      if (!text) return '';
      if (text.length <= length) return text;
      return `${text.slice(0, length)}…`;
    }
  }

  global.HistoryManager = HistoryManager;
})(typeof globalThis !== 'undefined' ? globalThis : this);
