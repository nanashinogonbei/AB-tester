const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const connectDB = require('./config/database');
const { updateSuggestions } = require('./services/suggestionService');

const app = express();

// プロキシ信頼設定
app.set('trust proxy', true);

// ミドルウェア
app.use(cors());
app.use(express.json({ type: '*/*' }));
app.use(express.static('public'));

// データベース接続
connectDB();

// ルート読み込み
const projectRoutes = require('./routes/projects');
const analyticsRoutes = require('./routes/analytics');
const abtestRoutes = require('./routes/abtests');
const trackerRoutes = require('./routes/tracker');

// ルート設定
app.use('/api/projects', projectRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/abtests', abtestRoutes);
app.use('/tracker', trackerRoutes);
app.post('/track', trackerRoutes);

// サジェスト更新のcron設定（0時と12時に実行）
cron.schedule('0 0,12 * * *', () => {
  console.log('[Cron] Triggering suggestion update');
  updateSuggestions();
});

// 初回起動時にサジェストデータを更新
updateSuggestions();

// サーバー起動
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
