// 日本時間（UTC+9）に変換する関数
function toJST(date) {
  const utcDate = new Date(date);
  return new Date(utcDate.getTime() + (9 * 60 * 60 * 1000));
}

module.exports = { toJST };
