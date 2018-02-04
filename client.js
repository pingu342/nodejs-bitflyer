//
// OHLCデータ配信サーバーのテスト用のクライアント
//
var Config = require('config');

if (process.argv[2] === 'FX_BTC_JPY') {
	; // valid
} else if (process.argv[2] === 'BTC_JPY') {
	; // valid
} else if (process.argv[2] === 'ETH_BTC') {
	; // valid
} else if (process.argv[2] === 'BCH_BTC') {
	; // valid
} else {
	console.log('product code error.');
	return; // invalid
}

var ohlcspan = {	'300'   : null, //5分足
					'900'   : null, //15分足
					'1800'  : null, //30分足
					'3600'  : null, //1時間足
					'21600' : null, //6時間足
					'43200' : null, //12時間足
					'86400' : null  //24時間足
};

var span = null;
for (var key in ohlcspan) {
	if (key === String(process.argv[3])) {
		span = key;
	}
}

if (!span) {
	console.log('span error.');
	return;
}

var market = process.argv[2];
var namespace = '/' + market;
var requireOldData = true;
var server_url = 'http://localhost:' + Config.config.server_port + namespace;
var socket = require('socket.io-client')(server_url);

console.log('[CONN] ' + server_url);

socket.on('connect', function() {

	// OHLCデータの配信を要求
	console.log('[JOIN] OHLC_' + span);
	socket.emit('join', {type:'OHLC', span:span});

	// 1分間出来高の配信を要求
	console.log('[JOIN] volume_60');
	socket.emit('join', {type:'volume', span:60});
});

socket.on('OHLC_' + span, function(data) {

	// OHLCデータ配信を要求後、最初にサーバから配信されるOHCLデータは1件で、それはサーバ側のその時点での最新のOHLCデータ
	// 以降は定期的に、新しいOHLCデータが配信される
	console.log('[RECV] ' + data.id + ' ' + data.cl_date + ' ' + data.cl);

	if (!requireOldData) {
		return;
	}

	// 過去のOHLCデータ20件をサーバへ要求
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
	console.log('[REQ] before:' + smallId);
	socket.emit('req', {type:'OHLC', span:span, before:smallId, after:smallId-20});
	requireOldData = false;
});

socket.on('volume_60', function(data) {

	console.log('[RECV] sell:' + data.sell + ' buy: ' + data.buy);
});

socket.on('rsp', function(data) {

	// reqに対するrsp
	console.log('[RSP] span:' + data.span + ' before:' + data.before + ' after:' + data.after + ' msg:' + data.msg);
});

socket.on('disconnect', function() {
});
