const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const useragent = require('useragent');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const cron = require('node-cron');

const app = express();

// プロキシ信頼設定を追加
app.set('trust proxy', true);

app.use(cors());
app.use(express.json({ type: '*/*' }));
app.use(express.static('public'));

mongoose.connect('mongodb://mongodb:27017/trackerDB');

const projectSchema = new mongoose.Schema({ 
	name: String, 
	url: String,
	apiKey: { type: String, required: true, unique: true }
});
const Project = mongoose.model('Project', projectSchema);

const logSchema = new mongoose.Schema({
	projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
	userId: String,
	url: String,
	event: String,
	device: String,
	browser: String,
	os: String,
	language: String,
	timestamp: { type: Date, default: Date.now },
	exitTimestamp: Date
});

// インデックスの設定
logSchema.index({ projectId: 1, timestamp: -1 });
logSchema.index({ projectId: 1, userId: 1 });
logSchema.index({ projectId: 1, event: 1 });

const Log = mongoose.model('Log', logSchema);

// サジェスト用のスキーマを追加
const suggestionSchema = new mongoose.Schema({
	devices: [String],
	browsers: [String],
	oss: [String],
	languages: [String],
	updatedAt: { type: Date, default: Date.now }
});

const Suggestion = mongoose.model('Suggestion', suggestionSchema);

// ABテスト用のスキーマを追加
const abtestSchema = new mongoose.Schema({
	projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
	name: String,
	active: { type: Boolean, default: false },
	cvCode: String,
	targetUrl: String,
	excludeUrl: String,
	startDate: Date,
	endDate: Date,
	conditions: {
		device: [{ value: String, condition: String, values: [String] }],
		language: [{ value: String, condition: String, values: [String] }],
		os: [{ value: String, condition: String, values: [String] }],
		browser: [{ value: String, condition: String, values: [String] }],
		other: [{ type: String, value: String, condition: String, values: [String] }]
	},
	creatives: [{
		name: String,
		distribution: Number,
		isOriginal: { type: Boolean, default: false },
		css: String,
		javascript: String
	}],
	createdAt: { type: Date, default: Date.now },
	updatedAt: { type: Date, default: Date.now }
});

const ABTest = mongoose.model('ABTest', abtestSchema);

// 日本時間（UTC+9）に変換する関数
function toJST(date) {
	const utcDate = new Date(date);
	return new Date(utcDate.getTime() + (9 * 60 * 60 * 1000));
}

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

// サジェストデータを更新する関数
async function updateSuggestions() {
	try {
		console.log('[Suggestion Update] Starting at', new Date().toISOString());
		
		const uniqueValues = await Log.aggregate([
			{
				$group: {
					_id: null,
					devices: { $addToSet: '$device' },
					browsers: { $addToSet: '$browser' },
					oss: { $addToSet: '$os' },
					languages: { $addToSet: '$language' }
				}
			}
		]);

		if (uniqueValues.length === 0) {
			console.log('[Suggestion Update] No data found');
			return;
		}

		const data = uniqueValues[0];
		
		// null/undefined/空文字を除外してソート
		const cleanAndSort = (arr) => {
			return arr
				.filter(v => v && v.trim() !== '')
				.sort((a, b) => a.localeCompare(b));
		};

		const suggestionData = {
			devices: cleanAndSort(data.devices),
			browsers: cleanAndSort(data.browsers),
			oss: cleanAndSort(data.oss),
			languages: cleanAndSort(data.languages),
			updatedAt: new Date()
		};

		// upsert: データがなければ作成、あれば更新
		await Suggestion.findOneAndUpdate(
			{},
			suggestionData,
			{ upsert: true, new: true }
		);

		console.log('[Suggestion Update] Completed', {
			devices: suggestionData.devices.length,
			browsers: suggestionData.browsers.length,
			oss: suggestionData.oss.length,
			languages: suggestionData.languages.length
		});
	} catch (err) {
		console.error('[Suggestion Update] Error:', err);
	}
}

// 12時間ごとにサジェストデータを更新（毎日0時と12時に実行）
cron.schedule('0 0,12 * * *', () => {
	console.log('[Cron] Triggering suggestion update');
	updateSuggestions();
});

// サーバー起動時に初回更新を実行
updateSuggestions();

// サジェストデータ取得API
app.get('/api/suggestions', async (req, res) => {
	try {
		let suggestion = await Suggestion.findOne();
		
		if (!suggestion) {
			// データがない場合は空の配列を返す
			suggestion = {
				devices: [],
				browsers: [],
				oss: [],
				languages: [],
				updatedAt: new Date()
			};
		}
		
		res.json(suggestion);
	} catch (err) {
		console.error('Suggestions error:', err);
		res.status(500).json({ error: err.message });
	}
});

app.get('/api/projects', async (req, res) => {
	const projects = await Project.find();
	// APIキーは管理画面にのみ表示（セキュリティのため削除しない）
	res.json(projects);
});

app.post('/api/projects', async (req, res) => {
	try {
		// ランダムなAPIキーを生成
		const apiKey = crypto.randomBytes(32).toString('hex');
		
		const normalizedUrl = normalizeUrl(req.body.url);
		const project = new Project({
			name: req.body.name,
			url: normalizedUrl,
			apiKey: apiKey
		});
		
		const saved = await project.save();
		res.json(saved);
	} catch (err) {
		console.error('Create project error:', err);
		res.status(500).json({ error: err.message });
	}
});

app.delete('/api/projects/:id', async (req, res) => {
	try {
		const project = await Project.findById(req.params.id);
		if (!project) {
			return res.status(404).json({ error: 'Project not found' });
		}

		// projectIdで関連ログを削除
		await Log.deleteMany({ projectId: project._id });
		await Project.findByIdAndDelete(req.params.id);
		
		res.json({ success: true });
	} catch (err) {
		console.error('Delete error:', err);
		res.status(500).json({ error: err.message });
	}
});

app.get('/api/analytics/:projectId', async (req, res) => {
	try {
		const project = await Project.findById(req.params.projectId);
		if (!project) return res.status(404).send('Project not found');

		const { start, end, device, browser, os, language } = req.query;
		
		// 日本時間の日付範囲をそのまま使用（タイムゾーン変換なし）
		const startDate = new Date(start + 'T00:00:00.000Z');
		const endDate = new Date(end + 'T23:59:59.999Z');

		const query = {
			projectId: project._id,
			timestamp: { $gte: startDate, $lte: endDate }
		};

		if (device) query.device = { $in: device.split(',') };
		if (browser) query.browser = { $in: browser.split(',') };
		if (os) query.os = { $in: os.split(',') };
		if (language) query.language = { $in: language.split(',') };

		const [stats, pages, events] = await Promise.all([
			Log.aggregate([
				{ $match: query },
				{ 
					$group: { 
						_id: null, 
						pv: { $sum: { $cond: [{ $eq: ["$event", "page_view"] }, 1, 0] } },
						fv: { $sum: { $cond: [{ $eq: ["$event", "first_view"] }, 1, 0] } },
						uu: { $addToSet: "$userId" } 
					} 
				}
			]),
			Log.aggregate([
				{ $match: { ...query, event: { $in: ['page_view', 'first_view'] } } },
				{ $group: { _id: "$url", count: { $sum: 1 } } },
				{ $sort: { count: -1 } },
				{ $limit: 10 }
			]),
			Log.aggregate([
				{ $match: { projectId: project._id } },
				{ $group: { 
					_id: null,
					events: { $addToSet: "$event" }
				}}
			])
		]);

		const result = stats[0] || { pv: 0, fv: 0, uu: [] };
		const e = events[0] || { events: [] };

		res.json({
			pageViews: result.pv + result.fv,
			uniqueUsers: result.uu ? result.uu.length : 0,
			popularPages: pages.map(p => ({ url: p._id, count: p.count })),
			availableEvents: e.events.filter(ev => ev !== 'page_view' && ev !== 'first_view' && ev !== 'page_leave')
		});
	} catch (err) {
		console.error('Analytics error:', err);
		res.status(500).json({ error: err.message });
	}
});

app.get('/api/analytics/:projectId/event-count', async (req, res) => {
	try {
		const project = await Project.findById(req.params.projectId);
		if (!project) return res.status(404).send('Project not found');
		
		const { start, end, event } = req.query;
		
		// 日本時間の日付範囲をそのまま使用
		const startDate = new Date(start + 'T00:00:00.000Z');
		const endDate = new Date(end + 'T23:59:59.999Z');

		const count = await Log.countDocuments({
			projectId: project._id,
			event: event,
			timestamp: { $gte: startDate, $lte: endDate }
		});
		
		res.json({ count });
	} catch (err) {
		console.error('Event count error:', err);
		res.status(500).json({ error: err.message });
	}
});

// プロジェクトごとのカスタマイズSDKを配信
app.get('/tracker/:projectId.js', async (req, res) => {
	try {
		const project = await Project.findById(req.params.projectId);
		if (!project) {
			return res.status(404).send('// Project not found');
		}

		// Origin/Refererチェック（オプション）
		const origin = req.get('origin') || req.get('referer');
		if (origin) {
			const requestProject = await findProjectByUrl(origin);
			if (!requestProject || requestProject._id.toString() !== project._id.toString()) {
				console.warn(`Unauthorized SDK access: ${origin} for project ${project._id}`);
				return res.status(403).send('// Domain not authorized');
			}
		}

		// SDKテンプレートを読み込み
		const templatePath = path.join(__dirname, 'public', 'tracker-sdk-template.js');
		let sdkTemplate = fs.readFileSync(templatePath, 'utf8');

		// ホスト名のみを埋め込み、プロトコルはクライアント側で判定
		const host = req.get('host');

		// デバッグログ
		console.log(`SDK Request - Host: ${host}, Headers:`, {
			proto: req.get('x-forwarded-proto'),
			protocol: req.protocol,
			secure: req.secure
		});

		// プレースホルダーを置換（SERVER_URLにはホスト名のみ）
		const customizedSdk = sdkTemplate
			.replace('{{PROJECT_ID}}', project._id.toString())
			.replace('{{API_KEY}}', project.apiKey)
			.replace('{{SERVER_HOST}}', host);

		res.setHeader('Content-Type', 'application/javascript');
		res.setHeader('Cache-Control', 'public, max-age=3600');
		res.send(customizedSdk);
	} catch (err) {
		console.error('SDK Error:', err);
		res.status(500).send('// Server Error');
	}
});

// トラッキングエンドポイント（認証強化版）
app.post('/track', async (req, res) => {
	try {
		const { projectId, apiKey, userId, url, event, exitTimestamp } = req.body;

		// 必須パラメータのチェック
		if (!projectId || !apiKey || !userId || !url || !event) {
			return res.status(400).json({ error: 'Missing required parameters' });
		}

		// APIキーとプロジェクトIDの検証
		const project = await Project.findOne({ _id: projectId, apiKey: apiKey });
		if (!project) {
			console.warn(`Invalid credentials: projectId=${projectId}`);
			return res.status(403).json({ error: 'Invalid credentials' });
		}

		// URLの検証（プロジェクトのドメインと一致するか）
		const normalizedRequestUrl = normalizeUrl(url);
		const normalizedProjectUrl = normalizeUrl(project.url);
		if (!normalizedRequestUrl.startsWith(normalizedProjectUrl)) {
			console.warn(`URL mismatch: ${url} does not match project ${project.url}`);
			return res.status(403).json({ error: 'URL mismatch' });
		}

		// User-Agent解析
		const agent = useragent.parse(req.headers['user-agent']);
		
		let deviceType = 'other';
		const deviceFamily = agent.device.family;
		
		if (deviceFamily === 'Other' || deviceFamily === 'Desktop') {
			deviceType = 'PC';
		} else if (deviceFamily.includes('iPad') || deviceFamily.includes('Tablet')) {
			deviceType = 'Tablet';
		} else if (deviceFamily.includes('iPhone') || deviceFamily.includes('Android') || 
		           deviceFamily.includes('Mobile')) {
			deviceType = 'SP';
		}
		
		// 日本時間で保存
		const jstNow = toJST(new Date());
		
		const log = new Log({
			projectId: project._id,
			userId: userId,
			url: url,
			event: event,
			device: deviceType,
			browser: agent.family,
			os: agent.os.family,
			language: req.headers['accept-language']?.split(',')[0].split('-')[0] || 'unknown',
			timestamp: jstNow,
			exitTimestamp: exitTimestamp ? toJST(new Date(exitTimestamp)) : null
		});
		
		await log.save();
		res.json({ status: 'ok' });
	} catch (err) {
		console.error('Track error:', err);
		res.status(500).json({ error: err.message });
	}
});

// ABテスト関連のAPI
app.get('/api/abtests', async (req, res) => {
	try {
		const { projectId } = req.query;
		if (!projectId) {
			return res.status(400).json({ error: 'projectId is required' });
		}

		const abtests = await ABTest.find({ projectId }).sort({ createdAt: -1 });
		res.json(abtests);
	} catch (err) {
		console.error('Get ABTests error:', err);
		res.status(500).json({ error: err.message });
	}
});

app.post('/api/abtests', async (req, res) => {
	try {
		const abtest = new ABTest(req.body);
		const saved = await abtest.save();
		res.json(saved);
	} catch (err) {
		console.error('Create ABTest error:', err);
		res.status(500).json({ error: err.message });
	}
});

app.get('/api/abtests/:id', async (req, res) => {
	try {
		const abtest = await ABTest.findById(req.params.id);
		if (!abtest) {
			return res.status(404).json({ error: 'ABTest not found' });
		}
		res.json(abtest);
	} catch (err) {
		console.error('Get ABTest error:', err);
		res.status(500).json({ error: err.message });
	}
});

app.put('/api/abtests/:id', async (req, res) => {
	try {
		req.body.updatedAt = new Date();
		const abtest = await ABTest.findByIdAndUpdate(
			req.params.id,
			req.body,
			{ new: true }
		);
		if (!abtest) {
			return res.status(404).json({ error: 'ABTest not found' });
		}
		res.json(abtest);
	} catch (err) {
		console.error('Update ABTest error:', err);
		res.status(500).json({ error: err.message });
	}
});

app.delete('/api/abtests/:id', async (req, res) => {
	try {
		const abtest = await ABTest.findByIdAndDelete(req.params.id);
		if (!abtest) {
			return res.status(404).json({ error: 'ABTest not found' });
		}
		res.json({ success: true });
	} catch (err) {
		console.error('Delete ABTest error:', err);
		res.status(500).json({ error: err.message });
	}
});

app.put('/api/abtests/:id/toggle', async (req, res) => {
	try {
		const abtest = await ABTest.findById(req.params.id);
		if (!abtest) {
			return res.status(404).json({ error: 'ABTest not found' });
		}
		abtest.active = !abtest.active;
		abtest.updatedAt = new Date();
		await abtest.save();
		res.json(abtest);
	} catch (err) {
		console.error('Toggle ABTest error:', err);
		res.status(500).json({ error: err.message });
	}
});

app.get('/api/abtests/:id/stats', async (req, res) => {
	try {
		const abtest = await ABTest.findById(req.params.id);
		if (!abtest) {
			return res.status(404).json({ error: 'ABTest not found' });
		}

		// ABテストの統計情報を計算
		// 実装は後で拡張可能
		const stats = abtest.creatives.map((creative, index) => ({
			creativeId: index,
			name: creative.name,
			impressions: 0,
			conversions: 0,
			cvr: 0
		}));

		res.json(stats);
	} catch (err) {
		console.error('Get ABTest stats error:', err);
		res.status(500).json({ error: err.message });
	}
});

app.listen(3000, () => console.log('Server running on port 3000'));