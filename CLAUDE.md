# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

这是一个重构后的AI助手浏览器扩展，提供智能表单填充和页面内容分析功能。该扩展完全基于真实AI服务（OpenAI、Anthropic），使用模块化架构，确保代码简洁高效。

## 核心架构

### 文件结构
```
page-analyzer/
├── manifest.json          # 扩展程序清单文件
├── popup.html             # 简化的弹出窗口界面
├── popup.js               # 弹出窗口逻辑，处理三个标签页
├── content.js             # 内容脚本，包含内联模块
├── background.js          # 后台脚本，AI API 调用
├── modules/               # 模块化组件
│   ├── form-filler.js     # 表单填充模块
│   ├── page-analyzer.js   # 页面分析模块
│   └── config-manager.js  # 配置管理模块
└── icons/                 # 图标文件
```

### 主要功能模块

#### 1. AI 表单填充
- 自动检测页面表单字段（input、textarea、select）
- 基于字段信息生成真实测试数据
- 智能填充各种字段类型
- **无模拟数据，仅使用真实AI服务**

#### 2. AI 内容分析
- 提取页面基本信息（标题、URL、字数等）
- AI深度分析页面内容主题和要点
- **专注内容总结，非SEO分析**

#### 3. 配置管理
- 支持 OpenAI 和 Anthropic API
- 安全的API密钥存储
- 连接测试和配置验证

### 通信架构
简化的两级消息传递：
1. `popup.js` ↔ `content.js`：UI交互和页面操作
2. `content.js` ↔ `background.js`：AI数据生成请求

## 开发指南

### 扩展安装
1. 打开 Chrome 浏览器 `chrome://extensions/`
2. 启用"开发者模式"
3. 点击"加载已解压的扩展程序"
4. 选择项目文件夹

### AI 配置要求
**必须配置真实AI服务，无模拟模式：**

#### OpenAI 配置
- API Key：从 https://platform.openai.com 获取
- 默认模型：gpt-3.5-turbo
- API URL：https://api.openai.com/v1/chat/completions

#### Anthropic 配置
- API Key：从 https://console.anthropic.com 获取
- 默认模型：claude-3-haiku-20240307
- API URL：https://api.anthropic.com/v1/messages

### 功能测试
1. **表单填充测试**
   - 打开包含表单的网页
   - 点击"检测表单字段"
   - 点击"AI 智能填充"

2. **内容分析测试**
   - 在任意网页点击"分析页面基本信息"
   - 点击"AI 内容分析"获取深度分析

## 技术实现

### 表单字段识别
- 多策略标签提取：label、aria-label、placeholder
- 字段类型检测：基于DOM属性和类型
- 上下文信息收集：required、placeholder等

### AI 数据生成
- 表单结构分析：`buildFormFillingPrompt()`
- 内容分析构建：`buildContentAnalysisPrompt()`
- API调用：`callOpenAI()`, `callAnthropic()`
- 配置管理：`ConfigManager` 类

### 模块化设计
- **FormFiller 模块**：表单检测和数据填充
- **PageAnalyzer 模块**：页面信息提取和AI分析
- **ConfigManager 模块**：AI服务配置和连接测试

## 代码约定

### 消息传递
```javascript
// Popup to Content
chrome.tabs.sendMessage(tabId, {action: 'detectForms'})
chrome.tabs.sendMessage(tabId, {action: 'fillForm'})
chrome.tabs.sendMessage(tabId, {action: 'analyzePage'})
chrome.tabs.sendMessage(tabId, {action: 'analyzePageWithAI'})

// Content to Background
chrome.runtime.sendMessage({action: 'generateFormData', fields: []})
chrome.runtime.sendMessage({action: 'analyzePageContent', pageData: {}})
chrome.runtime.sendMessage({action: 'testConnection', config: {}})
```

### 核心函数
- **表单处理**：`detectFormFields()`, `fillFormWithAI()`
- **页面分析**：`analyzePageContent()`, `analyzeWithAI()`
- **AI调用**：`generateFormData()`, `analyzePageContent()`
- **配置管理**：`saveConfig()`, `testConnection()`

### 错误处理
- 所有异步操作包含完整错误处理
- 用户友好的错误消息显示
- API调用失败的重试机制

## 重要约束

### 无模拟数据政策
- **严格禁止**任何模拟/假数据生成
- 所有AI功能必须使用真实API
- 用户必须配置有效的API密钥才能使用

### AI 分析专注点
- 内容分析专注于**页面内容总结**
- 提取主题、关键信息、核心观点
- **不进行SEO分析**，不关注技术指标

### 代码简洁性
- 移除所有冗余代码和功能
- 保持最小化的依赖关系
- 优先使用原生JavaScript API

## 扩展权限

```json
{
  "permissions": ["activeTab", "scripting", "storage"],
  "host_permissions": [
    "https://api.openai.com/*",
    "https://api.anthropic.com/*"
  ]
}
```

- `activeTab`：访问当前活动标签页
- `scripting`：执行内容脚本
- `storage`：存储配置数据
- `host_permissions`：访问AI服务API