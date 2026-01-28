const Project = require('../models/Project');

// URLを正規化する関数
function normalizeUrl(url) {
  return url
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/$/, '')
    .toLowerCase();
}

// URLからプロジェクトを検索する関数
async function findProjectByUrl(url) {
  const normalizedUrl = normalizeUrl(url);
  const projects = await Project.find();

  for (const project of projects) {
    const normalizedProjectUrl = normalizeUrl(project.url);
    if (normalizedUrl.startsWith(normalizedProjectUrl) ||
      normalizedProjectUrl.startsWith(normalizedUrl)) {
      return project;
    }
  }
  return null;
}

// URLマッチング関数（正規表現対応強化版）
function matchUrl(url, pattern) {
  if (!pattern || pattern.trim() === '') return true;

  // パターンが正規表現として記述されている場合
  // 形式1: /pattern/flags (JavaScriptの正規表現リテラル形式)
  if (pattern.startsWith('/')) {
    try {
      const lastSlash = pattern.lastIndexOf('/');
      if (lastSlash > 0) {
        const regexPattern = pattern.slice(1, lastSlash);
        const flags = pattern.slice(lastSlash + 1);
        const regex = new RegExp(regexPattern, flags);
        const result = regex.test(url);
        return result;
      }
    } catch (e) {
      console.error('[URL Match] Invalid regex pattern:', pattern, e);
      return false;
    }
  }

  // 形式2: 正規表現の特殊文字が含まれている場合（直接正規表現として扱う）
  const regexChars = /[.*+?^${}()|[\]\\]/;
  if (regexChars.test(pattern)) {
    try {
      const regex = new RegExp(pattern);
      const result = regex.test(url);
      return result;
    } catch (e) {
      console.error('[URL Match] Invalid regex pattern:', pattern, e);
      // 正規表現として無効な場合は文字列マッチにフォールバック
      return url.includes(pattern);
    }
  }

  // 形式3: 通常の文字列マッチ（部分一致）
  const result = url.includes(pattern);
  console.log(`[URL Match] String match: pattern="${pattern}", url="${url}", result=${result}`);
  return result;
}

module.exports = { normalizeUrl, findProjectByUrl, matchUrl };