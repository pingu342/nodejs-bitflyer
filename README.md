# nodejs-bitflyer
Download bitflyer executions data and create OHLC data.

Deliver OHLC data by SocketIO.

## 概要

bitflyer lightning APIを使用してBTC_JPY, FX_BTC_JPY, ETH_BTC, BCH_BTCの約定データを取得してmongodbに保存します。

ローソク足チャート用のOHLCデータを作成してmongodbに保存します。

OHLCデータをSocketIOで配信します。


## 実行環境

### Macbook Pro (2016), macOS Sierra

* node -v
	* v6.10.3

* npm -v
	 * 3.10.10

* npm list

		bitflyer@1.0.0
		├── config@1.26.1
		├── forever@0.15.3
		├── js-yaml@3.8.4
		├── mongodb@2.2.28
		├── pubnub@4.10.0
		├── request@2.81.0
		├── require@2.4.20
		└── socketio@1.0.0

* mongod --version

		db version v3.4.4
		git version: 888390515874a9debd1b6c5d36559ca86b44babd
		OpenSSL version: OpenSSL 1.0.1t  3 May 2016
		allocator: tcmalloc
		modules: none
		build environment:
			distmod: debian81
			distarch: x86_64
			target_arch: x86_64

* mongo --version

		MongoDB shell version v3.4.4
		git version: 888390515874a9debd1b6c5d36559ca86b44babd
		OpenSSL version: OpenSSL 1.0.1t  3 May 2016
		allocator: tcmalloc
		modules: none
		build environment:
			distmod: debian81
			distarch: x86_64
			target_arch: x86_64

### 補足

* メモリは最低2GB必要
* ストレージは〜2017/7までのデータ保存に約3GBが必要。


## 実行

* node.js, mongodbをセットアップ


* このリポジトリをclone

		$ git clone <this_repository>


* node.jsのパッケージをインストール

		$ cd nodejs-bitflyer
		$ npm install
		$ npm install -g forever


* configファイルを修正

		$ vim config/default.yaml

	* mongo_host : mongodのサーバー名
	* mongo_port : mongodのポート番号
	* mongo_db : 使用するDBの名前
	* mongo_user : 認証なしの場合は行ごと削除
	* mongo_pwd : 同上
	* server_port : OHLCデータ配信サーバーのポート番号


* dbを初期化する

	dbからコレクションを削除します。

		$ node manage_db.js BTC_JPY ALL drop
		$ node manage_db.js FX_BTC_JPY ALL drop
		$ node manage_db.js ETH_BTC ALL drop
		$ node manage_db.js BCH_BTC ALL drop

	dbに空のコレクションを作成し、アクセスを高速化するためのインデックスを作成します。

		$ node manage_db.js BTC_JPY ALL createIndex
		$ node manage_db.js FX_BTC_JPY ALL createIndex
		$ node manage_db.js ETH_BTC ALL createIndex
		$ node manage_db.js BCH_BTC ALL createIndex


* 実行

	約定データをダウンロードします。
	
		$ forever start download_exec.js BTC_JPY
		$ forever start download_exec.js FX_BTC_JPY
		$ forever start download_exec.js ETH_BTC
		$ forever start download_exec.js BCH_BTC
	
	OHLCデータを生成します。

		$ forever start create_ohlc.js BTC_JPY
		$ forever start create_ohlc.js FX_BTC_JPY
		$ forever start create_ohlc.js ETH_BTC
		$ forever start create_ohlc.js BCH_BTC

	DBが空っぽの場合は、最初の約定から順に処理します。現在に追いつくには2,3日かかります。

	以前に実行されていて、DBに途中までのデータが残っている場合、そこから処理を再開します。
	
	最後に、OHLCデータを配信します。

		$ forever start server.js

	OHLCデータが正しく配信されているかを確認します。

		$ node client.js BTC_JPY <span>
		$ node client.js FX_BTC_JPY <span>
		$ node client.js ETH_BTC <span>
		$ node client.js BCH_BTC <span>

	`<span>`には、例えば5分足のOHLCデータを確認するなら`300`を入れます。
	他には`900`,`1800`,`3600`,`21600`,`43200`,`86400`を入れることができます。

* 停止

		$ forever stopall

	停止しても再開できますのでご安心を。


# DB

## コレクション

	$ mongo

	> show dbs
	admin     0.000GB
	bitflyer  0.000GB
	local     0.000GB
	
	> use bitflyer
	
	> show collections
	lightning_executions_<product_code>
	lightning_executions_<product_code>_OHLC_300
	lightning_executions_<product_code>_OHLC_900
	lightning_executions_<product_code>_OHLC_1800
	lightning_executions_<product_code>_OHLC_3600
	lightning_executions_<product_code>_OHLC_21600
	lightning_executions_<product_code>_OHLC_43200
	lightning_executions_<product_code>_OHLC_86400

`<product_code>`には`BTC_JPY`,`FX_BTC_JPY`,`ETH_BTC`,`BCH_BTC`が入ります。

コレクションは上から順に、約定データ、OHLCデータ(5分足,15分足,...)です。

BTC_JPYの約定データを見てみます。

	> db.lightning_executions_BTC_JPY.find()
	{ "_id" : ObjectId("593cb89b7ecc67e89da86c41"), "id" : 1, "side" : "SELL", "price" : 30195, "size" : 0.01, "exec_date" : ISODate("2015-06-24T05:58:48.773Z"), "buy_child_order_acceptance_id" : "4b76790b", "sell_child_order_acceptance_id" : "3075b6ed" }

これはbitflyer lightning APIが返したデータそのものです。

次にBTC_JPYのOHLCデータ(1時間足)を見てみます。

	> db.lightning_executions_BTC_JPY_OHLC_3600.find()
	{ "_id" : ObjectId("59492cf9f9cb006dfe16636c"), "id" : 1, "op" : 70570, "hi" : 70570, "lo" : 70494, "cl" : 70494, "vol_sell" : 0.1, "vol_buy" : 4.924977859999999, "op_date" : ISODate("2016-07-01T17:58:01.373Z"), "cl_date" : ISODate("2016-07-01T17:59:48.003Z"), "op_exec_id" : 2902453, "cl_exec_id" : 2902463 }

* op : 始値
* hi : 上ヒゲ
* lo : 下ヒゲ
* cl : 終値
* vol_sell : 出来高(売り)
* vol_buy : 出来高(買い)
* op_date : 日時
* op_exec_id : 始値をつけた約定データのid
* cl_exec_id : 終値をつけた約定データのid


## コレクションの削除・初期化

削除は次のスクリプトで行います。

	$ node manage_db.js <product_code> <target> drop

初期化は次のスクリプトで行います。これは空のコレクション作成と、アクセスを高速化するためのインデックス作成を行います。

	$ node manage_db.js <product_code> <target> createIndex

`<product_code>`には`BTC_JPY`,`FX_BTC_JPY`,`ETH_BTC`,`BCH_BTC`を入れます。

`<target>`には`ALL`,`OHLC`を入れます。

e.g.

* `node manage_db.js BTC_JPY ALL drop`
	* BTC_JPYの約定データ用とOHLCデータ用のコレクションがdbからすべて消えます。要注意。
* `node manage_db.js BTC_JPY ALL createIndex`
	* BTC_JPYの約定データ用とOHLCデータ用のコレクションをdbに作成し、インデックスを作成します。
* `node manage_db.js BTC_JPY OHLC drop`
	* BTC_JPYのOHLCデータ用のコレクションのみがdbから消えます。約定データ用のコレクションは消えません。

# データのチェック

* `test/check_data.ipynb`
	
	pythonのサンプルです。
	
	ファイルはjupyter notebookの形式です。
	
	データの重複や欠落をチェックします。

	（bitflyer lightning APIで取ってきた約定データにもともと欠落があります）


# ローソク足チャートを描く

* `test/candle_chart.ipynb`
	
	pythonのサンプルです。
	
	ファイルはjupyter notebookの形式です。
	
	DBからOHLCデータを読み出し、matplotlibを利用してローソク足チャートを描きます。


