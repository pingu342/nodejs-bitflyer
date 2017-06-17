//
// OHLCデータ配信サーバーのテスト用のクライアント
//

if (process.argv[2] === 'FX_BTC_JPY') {
	; // valid
} else if (process.argv[2] === 'BTC_JPY') {
	; // valid
} else {
	console.log('product code error.');
	return; // invalid
}

var ohlcs = {	'300'   : null, //5分足
				'900'   : null, //15分足
				'1800'  : null, //30分足
				'3600'  : null, //1時間足
				'21600' : null, //6時間足
				'43200' : null, //12時間足
				'86400' : null  //24時間足
};

var span = null;
for (var key in ohlcs) {
	if (key === String(process.argv[3])) {
		span = key;
	}
}

if (!span) {
	console.log('span error.');
	return;
}

var market = process.argv[2];
var code = market + '_OHLC_' + span;
var requireOldData = true;
var socket = require('socket.io-client')('http://localhost:8080/' + market);

socket.on('connect', function() {

	console.log('[JOIN] ' + code);
	socket.emit('join', {span:span});
});

socket.on(code, function(data) {

	// JOIN後の最初のイベントでは、JOIN時点でのサーバ側での最新データ(1件以上)を受信できる
	// 以降は定期的に、前回受信したデータからの更新データ(1件以上)を受信できる
	console.log('[RECV] ' + data.id);

	if (!requireOldData) {
		return;
	}

	// 過去のOHLCデータをサーバへ要求
	var smallId = Number.MAX_VALUE;
	if (Array.isArray(data)) {
		for (var doc in data) {
			if (smallId > doc.id) {
				smallId = doc.id;
			}
		}
	} else {
		smallId = data.id;
	}
	console.log('[REQ] ' + code + ' before:' + smallId);
	socket.emit('req', {span:span, before:smallId});
	requireOldData = false;
});

socket.on('disconnect', function() {
});
