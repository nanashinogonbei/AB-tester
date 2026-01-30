// フロントエンド用サニタイゼーションライブラリ
(function() {
  // HTMLエスケープ
  function escapeHtml(unsafe) {
    if (typeof unsafe !== 'string') return '';
    
    const div = document.createElement('div');
    div.textContent = unsafe;
    return div.innerHTML;
  }
  
  // 安全なinnerHTML設定
  function setInnerHTML(element, html) {
    // テキストノードとして設定（HTMLタグを無効化）
    element.textContent = html;
  }
  
  // 安全なHTML生成（テンプレートリテラル用）
  function createSafeHTML(template, data) {
    // データをすべてエスケープ
    const escapedData = {};
    for (const key in data) {
      if (data.hasOwnProperty(key)) {
        escapedData[key] = escapeHtml(data[key]);
      }
    }
    return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      return escapedData[key] || '';
    });
  }
  
  // URLの安全性チェック
  function isSafeUrl(url) {
    if (typeof url !== 'string') return false;
    try {
      const parsed = new URL(url, window.location.origin);
      return ['http:', 'https:'].includes(parsed.protocol);
    } catch (e) {
      return false;
    }
  }
  
  // グローバルに公開
  window.sanitize = {
    escapeHtml,
    setInnerHTML,
    createSafeHTML,
    isSafeUrl
  };
  
  console.log('[Sanitize] Sanitization library loaded');
})();
