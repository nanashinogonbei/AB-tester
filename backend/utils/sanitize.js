const createDOMPurify = require('isomorphic-dompurify');
const DOMPurify = createDOMPurify();

// HTMLエスケープ関数
function escapeHtml(unsafe) {
  if (typeof unsafe !== 'string') return '';
  
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// HTMLサニタイズ（一部のタグを許可）
function sanitizeHtml(dirty) {
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'br', 'p', 'span'],
    ALLOWED_ATTR: ['href', 'target', 'class']
  });
}

// URLバリデーション
function isValidUrl(url) {
  try {
    const parsed = new URL(url);
    return ['http:', 'https:'].includes(parsed.protocol);
  } catch (e) {
    return false;
  }
}

// スクリプトタグの検出
function containsScript(text) {
  if (typeof text !== 'string') return false;
  
  const scriptPattern = /<script[\s\S]*?>[\s\S]*?<\/script>/gi;
  const eventHandlerPattern = /on\w+\s*=/gi;
  const javascriptUrlPattern = /javascript:/gi;
  
  return scriptPattern.test(text) || 
         eventHandlerPattern.test(text) || 
         javascriptUrlPattern.test(text);
}

// アカウントIDバリデーション
function isValidAccountId(accountId) {
  if (typeof accountId !== 'string') return false;
  return /^[a-zA-Z0-9]+$/.test(accountId);
}

// CVコードバリデーション
function isValidCvCode(cvCode) {
  if (typeof cvCode !== 'string') return false;
  return /^[a-zA-Z0-9_]+$/.test(cvCode);
}

module.exports = {
  escapeHtml,
  sanitizeHtml,
  isValidUrl,
  containsScript,
  isValidAccountId,
  isValidCvCode
};
