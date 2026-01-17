(function () {
	// サーバー側で置換されるプレースホルダー
	const PROJECT_ID = '{{PROJECT_ID}}';
	const API_KEY = '{{API_KEY}}';
	const SERVER_HOST = '{{SERVER_HOST}}';
	
	// クライアント側でプロトコルを判定してサーバーURLを構築
	const SERVER_URL = (window.location.protocol === 'https:' ? 'https://' : 'http://') + SERVER_HOST;

	// URLパラメーターをチェック
	const urlParams = new URLSearchParams(window.location.search);
	const isVoidMode = urlParams.get('gh_void') === '0';
	
	// gh_void=0が設定されている場合はトラッキングを無効化
	if (isVoidMode) {
		console.log('[Tracker] Tracking disabled: gh_void=0 detected');
		// ダミー関数を設定（エラーを防ぐため）
		window.trackerEvent = function() {
			console.log('[Tracker] Event ignored (void mode)');
		};
		return; // ここで処理を終了
	}

	// ユーザーIDの管理
	let userId = localStorage.getItem('tracker_user_id');
	let isFirstVisit = false;
	
	if (!userId) {
		userId = 'user_' + Math.random().toString(36).substring(2, 11) + '_' + Date.now();
		localStorage.setItem('tracker_user_id', userId);
		isFirstVisit = true;
	}

	// 訪問回数の管理
	let visitCount = parseInt(localStorage.getItem('tracker_visit_count') || '0');
	visitCount++;
	localStorage.setItem('tracker_visit_count', visitCount.toString());

	// トラッキング関数
	window.trackerEvent = function (eventName, isExit = false) {
		const data = {
			projectId: PROJECT_ID,
			apiKey: API_KEY,
			userId: userId,
			url: window.location.href,
			event: eventName,
			exitTimestamp: isExit ? new Date().toISOString() : null
		};

		const payload = JSON.stringify(data);

		if (isExit) {
			// ページ離脱時は sendBeacon を使用
			navigator.sendBeacon(`${SERVER_URL}/track`, payload);
		} else {
			// 通常のイベントは fetch を使用
			fetch(`${SERVER_URL}/track`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: payload,
				keepalive: true
			}).catch(err => console.error('[Tracker] Error:', err));
		}
	};

	// ABテスト実行関数
	async function executeABTest() {
		try {
			const response = await fetch(`${SERVER_URL}/api/abtests/execute`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					projectId: PROJECT_ID,
					url: window.location.href,
					userAgent: navigator.userAgent,
					language: navigator.language || 'unknown',
					visitCount: visitCount,
					referrer: document.referrer
				})
			});

			const result = await response.json();

			if (result.matched && result.creative) {
				// オリジナルの場合は何もしない
				if (result.creative.isOriginal) {
					console.log('[ABTest] Original version selected');
					return;
				}

				// CSSの適用
				if (result.creative.css && result.creative.css.trim() !== '') {
					const style = document.createElement('style');
					style.textContent = result.creative.css;
					document.head.appendChild(style);
					console.log('[ABTest] CSS applied');
				}

				// JavaScriptの実行
				if (result.creative.javascript && result.creative.javascript.trim() !== '') {
					// DOMContentLoadedを待ってから実行
					if (document.readyState === 'loading') {
						document.addEventListener('DOMContentLoaded', () => {
							try {
								eval(result.creative.javascript);
								console.log('[ABTest] JavaScript executed');
							} catch (err) {
								console.error('[ABTest] JavaScript execution error:', err);
							}
						});
					} else {
						try {
							eval(result.creative.javascript);
							console.log('[ABTest] JavaScript executed');
						} catch (err) {
							console.error('[ABTest] JavaScript execution error:', err);
						}
					}
				}

				console.log('[ABTest] Creative applied:', result.creative.name);
			} else {
				console.log('[ABTest] No matching test found');
			}
		} catch (err) {
			console.error('[ABTest] Execution error:', err);
		}
	}

	// ABテストを実行
	executeABTest();

	// 初回訪問時は first_view、それ以外は page_view
	trackerEvent(isFirstVisit ? 'first_view' : 'page_view');

	// ページ離脱イベントの検出
	window.addEventListener('visibilitychange', () => {
		if (document.visibilityState === 'hidden') {
			trackerEvent('page_leave', true);
		}
	});
	
	window.addEventListener('pagehide', () => {
		trackerEvent('page_leave', true);
	});

	// デバッグ用（本番環境では削除可能）
	if (window.location.search.includes('tracker_debug=1')) {
		console.log('[Tracker] Initialized', {
			projectId: PROJECT_ID,
			userId: userId,
			serverUrl: SERVER_URL,
			visitCount: visitCount
		});
	}
})();