# AI 助手

AI 助手是一个智能浏览器扩展，提供 AI 驱动的表单填充和页面内容分析功能。该扩展基于真实 AI 服务（OpenAI、Anthropic、Google），使用模块化架构，确保代码简洁高效。

## 功能特性
- **AI 表单填充**：自动检测页面表单字段，使用真实 AI 服务生成相关测试数据
- **页面内容分析**：提取页面基本信息并提供 AI 深度分析
- **多 AI 服务支持**：支持 OpenAI、Anthropic 和 Google Gemini
- **智能配置管理**：安全的 API 密钥存储和连接测试
- **模块化设计**：清晰的代码架构，易于维护和扩展

## 快速开始

### 扩展安装
1. 打开 Chrome 浏览器 `chrome://extensions/`
2. 启用"开发者模式"
3. 点击"加载已解压的扩展程序"
4. 选择项目文件夹

### AI 配置要求
**必须配置真实 AI 服务：**

#### OpenAI 配置
- API Key：从 https://platform.openai.com 获取
- 默认模型：gpt-3.5-turbo
- API URL：https://api.openai.com/v1/chat/completions

#### Anthropic 配置
- API Key：从 https://console.anthropic.com 获取
- 默认模型：claude-3-haiku-20240307
- API URL：https://api.anthropic.com/v1/messages

#### Google Gemini 配置
- API Key：从 https://makersuite.google.com/app/apikey 获取
- 默认模型：gemini-pro
- API URL：https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent

## 使用指南

### 表单填充功能
1. 打开包含表单的网页
2. 点击扩展图标打开弹窗
3. 切换到"表单助手"标签页
4. 点击"检测表单字段"查看可填充字段
5. 配置 AI 服务后点击"AI 智能填充"生成并填充数据

### 页面分析功能
1. 在任意网页点击扩展图标
2. 切换到"页面分析"标签页
3. 点击"分析页面基本信息"获取页面摘要
4. 点击"AI 内容分析"获取深度内容分析

### 配置管理
1. 打开扩展弹窗，切换到"配置"标签页
2. 选择 AI 服务提供商（OpenAI、Anthropic、Google）
3. 填写对应的 API Key
4. 使用"测试连接"验证配置
5. 点击"保存配置"完成设置

## 技术实现

### 项目架构
```
page-analyzer/
├── manifest.json          # 扩展程序清单文件
├── popup.html             # 弹出窗口界面
├── popup.js               # 弹出窗口逻辑
├── content.js             # 内容脚本，包含内联模块
├── background.js          # 后台脚本，AI API 调用
├── modules/               # 模块化组件
│   ├── config-manager.js  # 配置管理模块
│   └── history-manager.js  # 历史记录管理模块
└── icons/                 # 图标文件
```

### 核心功能模块

#### 1. 表单填充模块（内联在 content.js）
- 自动检测页面表单字段（input、textarea、select）
- 多策略标签提取：label、aria-label、placeholder
- 字段类型检测和上下文信息收集
- 基于 AI 生成相关测试数据

#### 2. 页面分析模块（内联在 content.js）
- 提取页面基本信息（标题、URL、字数等）
- AI 深度分析页面内容主题和要点
- 专注于内容总结，提取核心观点

#### 3. 配置管理模块
- 支持多种 AI 服务配置
- 安全的 API 密钥存储
- 连接测试和配置验证

### 通信架构
简化的两级消息传递：
1. `popup.js` ↔ `content.js`：UI 交互和页面操作
2. `content.js` ↔ `background.js`：AI 数据生成请求

## 扩展权限

```json
{
  "permissions": ["activeTab", "scripting", "storage"],
  "host_permissions": [
    "https://api.openai.com/*",
    "https://api.anthropic.com/*",
    "https://generativelanguage.googleapis.com/*"
  ]
}
```

- `activeTab`：访问当前活动标签页
- `scripting`：执行内容脚本
- `storage`：存储配置数据
- `host_permissions`：访问 AI 服务 API

## 重要约束

### 无模拟数据政策
- **严格禁止**任何模拟/假数据生成
- 所有 AI 功能必须使用真实 API
- 用户必须配置有效的 API 密钥才能使用

### AI 分析专注点
- 内容分析专注于**页面内容总结**
- 提取主题、关键信息、核心观点
- **不进行 SEO 分析**，不关注技术指标

### 代码简洁性
- 移除所有冗余代码和功能
- 保持最小化的依赖关系
- 优先使用原生 JavaScript API

## 功能测试

### 表单填充测试
1. 打开包含表单的网页
2. 点击"检测表单字段"
3. 点击"AI 智能填充"

### 内容分析测试
1. 在任意网页点击"分析页面基本信息"
2. 点击"AI 内容分析"获取深度分析

## 故障排查

### 常见问题
- **"检测表单"无响应**：确保目标标签页允许注入内容脚本（非 `chrome://` 页面）
- **"AI 填充表单"失败**：确认已保存有效配置，且模型端点可访问
- **"AI 分析页面"无结果**：检查 API 密钥配置和网络连接
- **扩展无法加载**：确认 manifest.json 格式正确，所有文件路径存在

### 调试方法
1. 在 `chrome://extensions/` 中查看 Service Worker 控制台日志
2. 检查popup.html的开发者工具控制台
3. 验证API密钥格式和网络连接状态
4. 确认AI服务配额和限制

## 开发指南

### 代码约定
- 消息传递使用标准Chrome扩展API
- 模块化设计，功能职责清晰分离
- 错误处理完善，提供用户友好的提示信息
- 优先使用原生JavaScript，减少外部依赖

### 核心函数
- **表单处理**：`detectFormFields()`, `fillFormWithAI()`
- **页面分析**：`analyzePageContent()`, `analyzeWithAI()`
- **AI调用**：`generateFormData()`, `analyzePageContent()`
- **配置管理**：`saveConfig()`, `testConnection()`

欢迎贡献代码和建议！
