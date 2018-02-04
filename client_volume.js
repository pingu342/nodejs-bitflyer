//
// FX_BTC_JPY/BTC_JPY 乖離率 価格 出来高
//
var Config = require('config');
var player = require('play-sound')(opts = {})

var Market = function(market) {

	var self = this;

	this.price = 0;
	this.recent_sell = 0;
	this.recent_buy = 0;
	this.sell = 0;
	this.buy = 0;

	var namespace = '/' + market;
	var requireOldData = true;
	var server_url = 'http://' + Config.config.server_host + ':' + Config.config.server_port + namespace;
	var socket = require('socket.io-client')(server_url);

	console.log('[CONN] ' + server_url);

	socket.on('connect', function() {
		console.log('[JOIN] OHLC_300');
		socket.emit('join', {type:'OHLC', span:300});
		console.log('[JOIN] ' + market + ' volume_60');
		socket.emit('join', {type:'volume', span:60});
	});

	socket.on('OHLC_300', function(data) {
		self.price = data.cl;
	});

	socket.on('volume_60', function(data) {
		self.recent_buy += data.recent_buy;
		self.recent_sell += data.recent_sell;
		self.buy = data.buy;
		self.sell = data.sell;
	});

	socket.on('disconnect', function() {
	});

}

var fx = new Market('FX_BTC_JPY');
var btc = new Market('BTC_JPY');
var fx_price = 0;
var btc_price = 0;

var string = function (sign, val, len) {
	var s = val.toString().substr(0, len);
	if (sign)
		if (val >= 0)
			s = '+' + s;
		else
			s = '-' + s;
	var l = len - s.length;
	for (i=0; i<l; i++) {
		s = ' ' + s;
	}
	return s;
}

var sound = function (file) {
}

var red     = '\u001b[31m';
var blue    = '\u001b[34m';
var reset   = '\u001b[0m';

var sound = function (val) {
	var file;
	if (val >= 1.0) {
		file = "up.mp3"
	} else if (val <= -1.0) {
		file = "down3.mp3"
	} else {
		return;
	}
	var v = val / 20.0;
	player.play(file,
			{ afplay: ['-v', v, '-r', 1.8, '-q', 1 ] /* lower volume for afplay on OSX */ },
			function (err) {}
			);
}

setInterval(function() {

	if (fx.price == 0 || btc.price == 0) {
		return;
	}

	if (fx_price == 0 || btc_price == 0) {
		fx_price = fx.price;
		btc_price = btc.price;
	}

	var fx_dire = ' ';
	if (fx_price < fx.price) {
		fx_dire = red + '↑' + reset;
	} else if (fx_price > fx.price) {
		fx_dire = blue + '↓' + reset;
	}
	fx_price = fx.price;

	var btc_dire = ' ';
	if (btc_price < btc.price) {
		btc_dire = red + '↑' + reset;
	} else if (btc_price > btc.price) {
		btc_dire = blue + '↓' + reset;
	}
	btc_price = btc.price;

	var d = (fx.price / btc.price - 1.0) * 100.0;
	d = string(false, d.toFixed(1), 5);

	var fx_sell = '       ';
	if (fx.recent_sell >= 0.01) {
		fx_sell = string(true, fx.recent_sell.toFixed(2), 7);
	}
	fx_sell = string(false, fx.sell.toFixed(1), 5) + ' ' + fx_sell;
	var fx_buy = '       ';
	if (fx.recent_buy >= 0.01) {
		fx_buy = string(true, fx.recent_buy.toFixed(2), 7);
	}
	fx_buy = string(false, fx.buy.toFixed(1), 5) + ' ' + fx_buy;

	var sell = '       ';
	if (btc.recent_sell >= 0.01) {
		sell = string(true, btc.recent_sell.toFixed(2), 7);
	}
	sell = string(false, btc.sell.toFixed(1), 5) + ' ' + sell;
	var buy = '       ';
	if (btc.recent_buy >= 0.01) {
		buy = string(true, btc.recent_buy.toFixed(2), 7);
	}
	buy = string(false, btc.buy.toFixed(1), 5) + ' ' + buy;

	console.log(d + '% | ' + fx_dire + ' ' + fx.price + ' ' + fx_sell + ' ' + fx_buy + ' | '
			+ btc_dire + ' ' + btc.price + ' ' + sell + ' ' + buy);

	sound(fx.recent_buy - fx.recent_sell);

	fx.recent_sell = 0;
	fx.recent_buy = 0;
	btc.recent_sell = 0;
	btc.recent_buy = 0;

}, 1100);

