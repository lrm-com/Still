<div align="center">

<image src="logo/Still_logo/Still_logo.png" height="256" width="256"/>

<h1>Still</h1>
<h2>静听</h2>
<h3>此刻有声</h3>

Still 是一个基于 React、Vite 和 Electron 的本地音乐播放器。

它主要面向桌面端使用，支持导入本地音乐、浏览歌曲/艺术家/专辑/文件夹、管理歌单，并提供歌词、封面、播放模式和主题相关的界面设置。
</div>

## 功能概览

- 本地音乐库浏览
- 歌曲、艺术家、专辑、文件夹和歌单视图
- 音频元数据读取
- 歌词与封面展示
- 顺序播放、列表循环、单曲循环和随机播放
- 深色/浅色主题
- Electron 桌面端打包

## 开发

安装依赖：

```bash
npm install
```

启动开发服务器：

```bash
npm run dev
```

构建前端资源：

```bash
npm run build
```

打包 Windows 应用：

```bash
npm run dist
```

仅生成未安装包目录：

```bash
npm run pack
```

## 项目结构

```text
electron/      Electron 主进程和预加载脚本
src/           React 应用源码
logo/          应用图标和 logo 资源
dist/          构建输出，未提交
release/       Electron 打包输出，未提交
```

## 技术栈

- React
- TypeScript
- Vite
- Electron
- Material Web
- Framer Motion
- Tailwind CSS
- music-metadata-browser

## 说明

这是一个仍在开发中的项目，README 会随着功能完善继续更新。

由CodeX生成，测试用~
