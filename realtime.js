//
// pubnubを利用してリアルタイムで約定、板の情報を取得するサンプル
//
var Volume = function(span) {

	var execList = []; //過去span秒の約定履歴

	this.sell = 0.0;
	this.buy = 0.0;

	//
	// 新しい約定を追加
	//
	this.pushExec = function(exec) {
		execList.push(exec);
		if (exec.side == 'SELL') {
			this.sell += exec.size;
		} else {
			this.buy += exec.size;
		}
	}

	//
	// 古い約定を履歴から削除
	//
	this.checkExec = function() {
		var changed = false;
		while (execList.length > 0) {
			var oldest = execList[0];
			var d = Date.now() - oldest.exec_date.getTime();
			if (d > 1000.0 * span) {
				//console.log('remove');
				if (oldest.side == 'SELL') {
					this.sell -= oldest.size;
				} else {
					this.buy -= oldest.size;
				}
				execList.splice(0, 1);
				changed = true;
			} else {
				break;
			}
		}
		return changed;
	}
}

var productCode = 'FX_BTC_JPY';
var volume = new Volume(60);
var boardBids = [];
var boardAsks = [];
var bidSize = [-1, -1, -1];
var askSize = [-1, -1, -1];
var midPrice = 0;
var chExec = 'lightning_executions_' + productCode;
var chBoardSnap = 'lightning_board_snapshot_' + productCode;
var chBoard = 'lightning_board_' + productCode;

var subscribePubNub = function() {

	var PubNub = require('pubnub');
	var white = '\u001b[37m';
	var reset = '\u001b[0m';

	var pubnub = new PubNub({
		subscribeKey: 'sub-c-52a9ab50-291b-11e5-baaa-0619f8945a4f',
		ssl: true
	});

	pubnub.addListener({
		message: function(m) {
			// handle message
			var channelName = m.channel; // The channel for which the message belongs
			var channelGroup = m.subscription; // The channel group or wildcard subscription match (if exists)
			var pubTT = m.timetoken; // Publish timetoken
			var msg = m.message; // The Payload
			//console.log(msg);
			if (channelName == chExec) {
				var sell=0, buy=0;
				for (var i=0; i<msg.length; i++) {
					msg[i].exec_date = new Date(msg[i].exec_date);
					volume.pushExec(msg[i]);
					if (msg[i].side == 'SELL') {
						sell += msg[i].size;
					} else {
						buy += msg[i].size;
					}
				}
				volume.checkExec();
				var str;
				if (sell >= 0.001) {
					str = volume.sell.toFixed(3) + ' +' + sell.toFixed(3);
				} else {
					str = volume.sell.toFixed(3) + ',      ';
				}
				if (buy >= 0.001) {
					str += ', ' + volume.buy.toFixed(3) + ' +' + buy.toFixed(3);
				} else {
					str += ', ' + volume.buy.toFixed(3) + ',      ';
				}
				console.log(productCode + ", " + msg[msg.length-1].price + ", " + str + ", " + askSize[0].toFixed(0) + ":" + bidSize[0].toFixed(0) + ", " + askSize[1].toFixed(0) + ":" + bidSize[1].toFixed(0) + ", " + askSize[2].toFixed(0) + ":" + bidSize[2].toFixed(0));
			} else if (channelName == chBoardSnap) {
				console.log(white + "[*] board snapshot has obtained." + reset);
				boardBids = msg.bids;
				boardAsks = msg.asks;
				midPrice = msg.mid_price;
			} else if (channelName == chBoard) {
				var updateBoard = function (org, dif) {
					if (org.length == 0) {
						return;
					}
					for (var i=0; i<dif.length; i++) {
						var found = 0;
						var side = (dif[i].price > midPrice) ? '売り' : '買い';
						for (var j=0; j<org.length; j++) {
							if (org[j].price == dif[i].price) {
								var d = dif[i].size - org[j].size;
								if ((d < 0 ? -d : d) > 20) {
									console.log(white + '[*] Big order: ' + side + ' ' + dif[i].price + ' ' + d.toFixed(3) + reset);
								}
								org[j].size = dif[i].size;
								found = 1;
								break;
							}
						}
						if (found == 0) {
							if (dif[i].size > 20) {
								console.log(white + '[*] Big order: ' + side + ' ' + dif[i].price + ' ' + dif[i].size.toFixed(3) + reset);
							}
							org.push(dif[i]);
						}
					}
				}
				var getBoardSize = function(board, lower, upper) {
					var size = 0;
					if (board.length == 0) {
						return -1;
					}
					for (var i=0; i<board.length; i++) {
						if (board[i].price >= lower) {
							if (board[i].price <= upper) {
								size += board[i].size;
							}
						}
					}
					return size;
				}
				midPrice = msg.mid_price;
				updateBoard(boardBids, msg.bids);
				updateBoard(boardAsks, msg.asks);
				bidSize[0] = getBoardSize(boardBids, midPrice-1000, midPrice);
				bidSize[1] = getBoardSize(boardBids, midPrice-10000, midPrice);
				bidSize[2] = getBoardSize(boardBids, midPrice-100000, midPrice);
				askSize[0] = getBoardSize(boardAsks, midPrice, midPrice+1000);
				askSize[1] = getBoardSize(boardAsks, midPrice, midPrice+10000);
				askSize[2] = getBoardSize(boardAsks, midPrice, midPrice+100000);
			}
		},
		presence: function(p) {
			// handle presence
			var action = p.action; // Can be join, leave, state-change or timeout
			var channelName = p.channel; // The channel for which the message belongs
			var occupancy = p.occupancy; // No. of users connected with the channel
			var state = p.state; // User State
			var channelGroup = p.subscription; //  The channel group or wildcard subscription match (if exists)
			var publishTime = p.timestamp; // Publish timetoken
			var timetoken = p.timetoken;  // Current timetoken
			var uuid = p.uuid; // UUIDs of users who are connected with the channel
		},
		status: function(s) {
			// handle status
		}
	})

	pubnub.subscribe({
		channels: [chExec, chBoardSnap, chBoard],
		withPresence: true // also subscribe to presence instances.
	})
}

subscribePubNub();
