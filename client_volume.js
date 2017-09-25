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

var span = 60;

var market = process.argv[2];
var namespace = '/' + market;
//var server_url = 'http://ec2-54-250-245-71.ap-northeast-1.compute.amazonaws.com:' + Config.config.server_port + namespace;
var server_url = 'http://localhost:' + Config.config.server_port + namespace;
var socket = require('socket.io-client')(server_url);
var sell = 0;
var buy = 0;

socket.on('connect', function() {

	console.log('[CONN] ' + server_url);

	console.log('[JOIN] volume_60');
	socket.emit('join', {type:'volume', span:60});
});

socket.on('volume_60', function(data) {

	if (sell === data.sell && buy === data.buy &&
		data.recent_buy == 0 && data.recent_sell == 0) {
		return;
	}
	var recent, str;
	recent = data.recent_sell;
	sell = data.sell;
	if (recent > 0.001) {
		str = 'sell:' + data.sell.toFixed(3) + ' +' + recent.toFixed(3);
	} else {
		str = 'sell:' + data.sell.toFixed(3) + '       ';
	}
	recent = data.recent_buy;
	buy = data.buy;
	if (recent > 0.001) {
		str += ' buy :' + data.buy.toFixed(3) + ' +' + recent.toFixed(3);
	} else {
		str += ' buy :' + data.buy.toFixed(3);
	}
	console.log(str);
});

socket.on('rsp', function(data) {

	// reqに対するrsp
	console.log('[RSP] span:' + data.span + ' before:' + data.before + ' after:' + data.after + ' msg:' + data.msg);
});

socket.on('disconnect', function() {
});
