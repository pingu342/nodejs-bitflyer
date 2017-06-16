# nodejs-bitflyer
Download bitflyer executions data and create OHLC data.

## 概要

bitflyer lightning APIを使用してBTC_JPY, FX_BTC_JPYの約定データを取得してmongodbに保存します。

ローソク足チャート用のOHLCデータを作成してmongodbに保存します。

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
		└── require@2.4.20

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

* メモリは2GBくらい必要っぽい。使っているのはほとんどmongodbだろう。
* ストレージは、〜2017/5までのデータ記録に8GBが必要。


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

	* mongo_host
	* mongo_port
	* mongo_db : 使用するDBの名前
	* mongo_user : 認証なしの場合は行ごと削除
	* mongo_pwd : 同上


* dbを空っぽにする

		$ node manage_db.js <product_code> dropAll
		$ node manage_db.js <product_code> createIndex

	`<product_code>`には`BTC_JPY`または`FX_BTC_JPY`を入れます。

* 実行

		$ forever start download_exec.js <product_code>
		$ forever start create_ohlc.js <product_code>

	DBが空っぽの場合は、最初の約定から順に処理します。現在に追いつくには2,3日かかります。

	以前に実行されていて、DBに途中までのデータが残っている場合、そこから処理を再開します。

* 停止

		$ forever stop download_exec.js
		$ forever stop create_ohlc.js

	停止しても再開できますのでご安心を。


# DB

	$ mongo

	> show dbs
	admin     0.000GB
	bitflyer  0.000GB
	local     0.000GB

	> show collections
	lightning_executions_<product_code>
	lightning_executions_<product_code>_BTC_JPYOHLC_300
	lightning_executions_<product_code>_BTC_JPYOHLC_900
	lightning_executions_<product_code>_BTC_JPYOHLC_1800
	lightning_executions_<product_code>_BTC_JPYOHLC_3600
	lightning_executions_<product_code>_BTC_JPYOHLC_21600
	lightning_executions_<product_code>_BTC_JPYOHLC_43200
	lightning_executions_<product_code>_BTC_JPYOHLC_86400

`<product_code>`には`BTC_JPY`または`FX_BTC_JPY`が入ります。

コレクションは上から順に、約定データ、OHLCデータ(5分足,15分足,...)です。

BTC_JPYの約定データを見てみます。

	> db.lightning_executions_BTC_JPY.find()
	{ "_id" : ObjectId("593cb89b7ecc67e89da86c41"), "id" : 1, "side" : "SELL", "price" : 30195, "size" : 0.01, "exec_date" : ISODate("2015-06-24T05:58:48.773Z"), "buy_child_order_acceptance_id" : "4b76790b", "sell_child_order_acceptance_id" : "3075b6ed" }

これはbitflyer lightning APIが返したデータそのものです。

次にBTC_JPYのOHLCデータ(1時間足)を見てみます。

	> db.lightning_executions_BTC_JPY_OHLC_3600.find()
	{ "_id" : ObjectId("593cc26df8a789e90c1b687b"), "id" : 1, "open_price" : 30195, "high_price" : 30195, "low_price" : 30195, "close_price" : 30195, "volume_sell" : 0.01, "volume_buy" : 0, "open_date" : ISODate("2015-06-24T05:00:00Z"), "open_exec_id" : 1, "close_exec_id" : 1 }

* open_price : 始値
* high_price : 上ヒゲ
* low_price : 下ヒゲ
* close_price : 終値
* volume_sell : 出来高(売り)
* volume_buy : 出来高(買い)
* open_date : 日時
* open_exec_id : 始値をつけた約定データのid
* close_exec_id : 終値をつけた約定データのid

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


