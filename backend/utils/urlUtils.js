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

// URLマッチング関数
function matchUrl(url, pattern) {
  if (!pattern || pattern.trim() === '') return true;

  if (pattern.startsWith('/') && pattern.includes('/')) {
    try {
      const lastSlash = pattern.lastIndexOf('/');
      const regexPattern = pattern.slice(1, lastSlash);
      const flags = pattern.slice(lastSlash + 1);
      const regex = new RegExp(regexPattern, flags);
      return regex.test(url);
    } catch (e) {
      console.error('Invalid regex pattern:', pattern, e);
      return false;
    }
  }

  return url.includes(pattern);
}

module.exports = { normalizeUrl, findProjectByUrl, matchUrl };
