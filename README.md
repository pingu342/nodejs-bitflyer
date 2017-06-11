# nodejs-bitflyer
Download bitflyer executions data to mongodb.

## 概要

bitflyer lightning APIを使用してBTC_JPY, FX_BTC_JPYの約定データを取得しmongodbに保存する。

ローソク足チャートを描くため、保存したmongodbからOHLCデータを作成してmongodbに保存する。

## 実行環境

### Macbook Pro (2016), macOS Sierra

* node -v
	* v6.10.3

* npm -v
	 * 3.10.10

* npm list

		bitflyer@1.0.0
		├── forever@0.15.3
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


