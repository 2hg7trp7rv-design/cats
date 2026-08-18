# Cat's tower 引き継ぎ書

更新日: 2026-08-18
対象: `2hg7trp7rv-design/cats_tower` / `main`
現行正本: V0.8.1 Pixel Tower Vertical Slice

## 1. 最初に理解すべき結論

Cat's towerのゲーム性は、V0.8.1で縦型放置インクリメンタルRPGへ戻した。

正しい主ループは次である。

> 猫が自動出撃する → 塔を登って天敵と自動戦闘する → タップで増援する → 攻撃・撃破でコインを得る → 直ちに強化する → 8Fの壁へ到達する → 夜明けで転生する → 旧階層を25%以上速く再走する → 10Fの初回夜番ボスを倒す

以前のV0.8.0 Living Towerは、店舗・共同部屋・短い三択夜番が主役になり、参考作品のゲーム性から外れていた。旧ゲームループは正本ではない。

V0.8.1のソース、Pixel R2アセット、schema2エンジン、決定論的QAは`main`へ統合済みである。ユーザー承認時のsource snapshotは`0c4c191624b6ffca45c9da91f065d5b9fe49c36a`、初回GitHub統合は`3b0bc6a88ab3a1ee2aa11ed2b588f7c0eeb8eb19`、WebKit viewport修正は`5d16682e51b974e4b3f72a3ceb7a58c229e827f7`、現行Production runtime基準は`ebe26884f9e4500d8e755f0b4fae328ef208c6b6`である。

固定Productionでは実行時13ファイルのhash一致、テスト・引継ぎ文書・旧アートの公開除外、Chromium 390×844 / 375×667の実走を確認済みである。GitHub ActionsでもChromium / WebKitの2幅、計64画面を検証済みである。物理iPhoneと追加猫・敵・城・長期バランスは未完成である。

したがって「V0.8.1 Production Vertical Slice配信済み」は正しいが、「フルゲーム完成」または「iPhone実機確認済み」と報告してはいけない。

---

## 2. 正本、作業ブランチ、公開先

| 項目 | 現在の事実 |
|---|---|
| GitHub repository | `2hg7trp7rv-design/cats_tower` |
| Canonical branch | `main` |
| Product direction | V0.8.1 Pixel Tower Vertical Slice |
| Production build | `v081-pixel-tower-r2-p3` |
| Source snapshot | `0c4c191624b6ffca45c9da91f065d5b9fe49c36a` |
| Production runtime commit | `ebe26884f9e4500d8e755f0b4fae328ef208c6b6` |
| 現在の正本ブランチ | `main` |
| 作業開始時HEAD | `6c3adac7a31cff3864f55028e77719c54471c84a` |
| Production URL | `https://cats-tau-dusky.vercel.app/` |
| Vercel project ID | `prj_3Ip3e0eYMy9SchP1vS36ibjJP9LB` |
| Vercel team ID | `team_6odZCZQ1QxjzhPdC9sgEtoCM` |
| 最後に照合したruntime | `main@ebe26884f9e4500d8e755f0b4fae328ef208c6b6` |
| V0.8.1 Production deployment | `dpl_6PqJBdQX4mEdZ8xkg28tMfWtP6Cm` / READY |
| Last visually audited Actions run | `32091801556` / artifact `9308695207` |

バージョン番号の大きさを理由に、旧V0.9.xへ戻さない。V0.9.xは途中試作であり、現在の正しい系列ではない。

Production URLが開けることと、V0.8.1が配信されていることは別である。納品前に公開HTML、JS、CSS、アセット、deployment SHAを対象runtime commitと照合する。

---

## 3. V0.8.1のプロダクト定義

### ジャンル

スマートフォン縦画面専用の、縦塔型放置インクリメンタルRPG。

### ゲームの中心

- 戦場は常時動いている
- 猫は自動で出撃する
- 猫は下から上へ進む
- 天敵へ到達すると自動攻撃する
- 天敵も前列の猫を攻撃する
- 猫が倒れても、次の猫が自動出撃する
- プレイヤーのタップは追加出撃であり、直接攻撃ではない
- 攻撃と撃破でコインを得る
- コインはムギ、猫パンチ、出撃口へ即時再投資する
- 支援施設は攻略で制圧した階に出現する
- 8Fに意図的な停滞壁がある
- 夜明けのタイミングを選ぶ
- 夜明け後は前周回の時間が圧縮される

### してはいけない再解釈

- タップで敵を直接殴るクリックゲームにしない
- さかな食堂を在庫・接客中心の別ゲームにしない
- 共同部屋をごきげん管理の必須画面にしない
- 初回夜番を魚・ベル・箱の三択ミニゲームへ戻さない
- 静止カードを縦に並べただけの「塔」に戻さない
- 数値管理画面へ猫画像を載せただけにしない

---

## 4. 現在実装されている一周の流れ

### 4.1 タイトル

- `Cat's tower`
- `V0.8.1 · PIXEL TOWER VERTICAL SLICE`
- Pixel R2の夜の縦塔
- 「夜番を始める」

### 4.2 自動出撃

- ゲーム開始後、猫は一定間隔で自動出撃する
- 初期自動出撃間隔は2300ms
- 強化により最短650msまで短縮する
- 可視ユニット上限は12匹
- 先頭の1匹はムギ、追加個体はhelperとして扱う

### 4.3 タップ増援

- `猫を呼ぶ`で猫を1匹追加する
- 手動出撃クールダウンは150ms
- タップ時に敵HPを変更しない
- タップ連打だけが永久に必要な設計にはしない

### 4.4 戦闘と収入

- 猫は移動後に自動攻撃する
- 敵も攻撃範囲へ来た猫を攻撃する
- 猫の攻撃ごとにコインを得る
- 敵撃破時にも報酬を得る
- 画面上部に現在階、最高階、出撃数、敵HPを表示する

### 4.5 即時強化

常時表示するラン内強化は次の3つ。

- ムギ — 基礎攻撃力とHP
- 猫パンチ — 攻撃倍率
- 出撃口 — 自動出撃間隔

強化ボタンは、購入前後のlevel、cost、DPS変化をQAで確認する。

### 4.6 3F さかな食堂

3F到達で解放する攻略支援施設。

- ラン内の攻撃力を支援する
- 攻撃・撃破収入を支援する
- 速度型または一撃型の専門化を選ぶ
- ラン内levelは夜明けで失う
- 専門化は夜明け後も残る

接客、仕入れ、魚スライドを主ループへ戻さない。

### 4.7 5F 猫の共同部屋

5F到達で解放する恒久支援拠点。

- 共同部屋levelは夜明け後も維持する
- 夜明けのかけらを使って強化する
- 最高階、夜明け回数、恒久倍率を確認する
- 旧V0.8のごきげん・なでる・休むは主ゲームから外す

### 4.8 8Fの壁

- 8Fは最初の意図的な壁
- 夜明け解放階も8F
- 敵HP倍率と回復により、無強化放置では停滞する
- QAでは8Fを12秒以上維持する
- 壁に着いたとき、進み続けるか夜明けを選べる

### 4.9 夜明け

夜明けは転生システムである。

失うもの:

- 現在階
- ラン内コイン
- ラン内fish（初期値4へ戻る）
- ムギlevel
- 猫パンチlevel
- 出撃口level
- さかな食堂のラン内level
- さかな食堂の解放状態（3Fで再解放）

残るもの:

- 最高階
- 共同部屋level
- 思い出
- さかな食堂の専門化
- 夜明け回数
- 累計かけら

得るもの:

- 夜明けのかけら
- 累計かけらに基づく恒久戦力

一つ目のかけらで恒久倍率は1.00から1.55へ上がる。決定論的core単体の初期バランスでは、旧8Fへの到達時間は約61.3秒から約44.6秒へ短縮し、比率は約0.728である。ブラウザ統合QAでも75%以下を必須とする。

### 4.10 10F 初回夜番ボス

- 10Fは最初のボス階
- 撃破時に`firstNightCleared`をtrueにする
- `first-night`の思い出を追加する
- 追加コイン報酬を得る
- 撃破後は11Fへ進む

ロジックと表示の現行ボス定義はPixel R2の`great-crow`である。旧C.L.E.A.N.はV0.8.0の履歴であり、現行初回夜番へ戻さない。

---

## 5. アートとUI

### 正式方向

**温かいレトロピクセルの夜の塔**

- 暗い青紫の夜
- 窓から漏れる暖色光
- 読みやすい太い輪郭
- 小さなスマートフォン画面で認識できる猫と敵
- 木、布、魚、塔の生活感
- ゲーム数値は画面端へ整理し、戦場を中央に残す

### Pixel R2正本

`assets/v080/pixel-r2/`

| ファイル | 役割 | 形式・寸法 |
|---|---|---|
| `tower-night-r2.png` | タイトル・縦塔戦場 | PNG RGB 941×1672 |
| `mugi-sprites-r2.png` | ムギ4フレーム | PNG RGBA 2172×724 |
| `crow-sprites-r2.png` | カラス4フレーム | PNG RGBA 1774×887 |

`assets/icons/icon-192.png`と`icon-512.png`は、ムギ、月夜の塔、暖色ランタンを用いたPixel R2のmaskable PWAアイコンである。`apple-touch-icon`にも同じ192px版を使う。

CSSは4フレームをidle、walk/fly、attack/peck、cheer/retreatとして表示する。

日本語UIは`assets/fonts/noto-sans-jp-700-ja.woff2`を`CatsTowerJP`として同一ドメイン配信する。端末に同fontがなくても画面の字幅と太さを安定させ、読み込み失敗時はシステム日本語fontへfallbackする。

### 旧R1 plush

`assets/v080/r1/`のぬいぐるみ・ドールハウス画像は旧プロトタイプである。

Pixel R2が実行時、Service Worker、QAのcanonicalである。旧R1はリポジトリ履歴や比較資料として残り得るが、ランタイム画像、fallback、precache、QA必須アセットにはしない。

---

## 6. 保存と移行

### 現行キー

`cats-tower-v080`

### 現行schema

`gameplaySchema: 2`

### schema1バックアップ

`cats-tower-v080-schema1-backup`

### 旧キー

`cats-tower-v01`

### 主なstate

- coins
- fish
- currentFloor
- bestFloor
- checkpointFloor
- runFloorPeak
- enemyFloor
- enemyHp
- mugiLevel
- weaponLevel
- dispatchLevel
- restaurantLevel
- roomLevel
- restaurantUnlocked
- roomUnlocked
- dawnShards
- lifetimeShards
- ascensions
- firstNightCleared
- tutorialStep
- specialization
- mugiMood
- memories
- totalKills
- totalTaps
- lifetimeCoins
- runCoinsEarned
- offlineCoinsEarned
- playTimeMs
- lastSeen

### 移行

V0.8.0 Living Tower保存からは、次を維持または変換する。

- coins → coins
- stock → fish
- specialization → specialization
- mugiMood → mugiMood
- memories → memories
- hasPlayed → hasPlayed
- sound → sound
- firstNightDone → legacy記録

移行前のschema1 JSONは一度だけbackup keyへ保存する。破損JSONは例外停止させず、schema2 fresh stateへ戻す。

### オフライン進行

- 最大8時間
- コインだけを付与する
- オフライン中に階を進めない
- 未見ボスを突破しない
- 復帰時にまとめて計算する

---

## 7. ファイル構造

| ファイル | 役割 |
|---|---|
| `index.html` | タイトル、HUD、縦塔戦場、増援、即時強化、夜明け、ナビ、シート |
| `styles.css` | Pixel Towerレイアウト、スプライト、支援、夜明け、レスポンシブ |
| `game-data.js` | version、schema、バランス、敵、施設、強化、アセット |
| `game-core.js` | 保存正規化、移行、決定論的simulation、戦闘、強化、壁、夜明け、offline |
| `app.js` | DOM描画、入力、保存、シート、animation loop、QA API |
| `sw.js` | Service Worker cache |
| `manifest.webmanifest` | PWA設定 |
| `tests/living-tower-v080.mjs` | Chromium / WebKitの縦塔E2E |
| `.github/workflows/verify-main.yml` | mainのsource、画像、4環境QA |

`game-core.js`はDOMへ依存しない。実時間animationとQAの`advance(ms)`は同じ100ms固定step simulationを使う。

---

## 8. QA契約

### 画面と操作

- タイトル
- 自動出撃中の塔
- タップ増援
- 3つの即時強化
- 階層制圧
- 3Fさかな食堂
- 5F共同部屋
- 8Fの壁
- 夜明けpreview
- 夜明け後の高速再走
- 10F初回夜番クリア

### ロジック

- 自動出撃が1回以上発生する
- 手動出撃が1回以上発生する
- 手動出撃直後の直接ダメージは0
- 初回撃破で収入が増える
- 強化後にlevelとDPSが上がる
- 8Fで12秒間floorが変わらない
- 夜明けで最高階と共同部屋を維持する
- 夜明けで食堂ランlevelを0へ戻す
- 夜明けでかけらと恒久倍率が増える
- 再走時間が初回の75%以下
- 10Fボス後に`firstNightCleared`と`first-night`が残る

### 保存

- schema2再読込
- V0.8.0 Living Tower移行
- V0.1移行
- 破損V0.8保存のfresh recovery

### 環境

- Chromium 390×844
- WebKit 390×844
- Chromium 375×667
- WebKit 375×667
- device scale factor 3
- reduced motion
- console error 0
- page error 0
- HTTP 4xx / 5xx 0
- SVG主役アート 0

Production Chromium 390×844 / 375×667は各16画面PASSし、全32枚を目視済みである。GitHub ActionsはChromium / WebKitの両幅、16画面×4環境を生成する。初回8F到達60.7秒、夜明け後43.9秒、再走比0.723、タップ直接ダメージ0、10Fクロバネ表示、11F突破、schema2再読込と旧保存移行を確認した。WebKitでシートが画面外へ移動した初回証跡は`5d16682`で修正し、修正後64枚を目視して再発がないことを確認した。

---

## 9. 既知のリスク

### 1. helper猫がムギsheetを共有

core上はムギ1匹とhelperを分けるが、現行DOMは同じムギsheetへhue差を付けて表示する。Vertical Sliceの機能証明には使えるが、追加猫の完成表現ではない。

### 2. 初期バランスは短縮版

core単体では初回8Fまで約1分である。Vertical Slice内で転生と高速再走を短時間に確認するための値であり、長期製品の最終テンポではない。

### 3. 物理iPhone未確認

未確認項目:

- Dynamic Island
- Safari下部バー
- ホームインジケータ
- 指での連続増援
- 375pxでのHUD密度
- PWA standalone
- Service Worker更新
- Retina上のピクセル拡大

### 4. 音と触覚

vibration呼び出しはあるが、サウンド資産と本番触覚設計は未完成。

### 5. 長期コンテンツ未実装

- ルナ
- トト
- ミミ
- 猫ごとの能力
- 追加天敵
- 追加ボス
- 次の城
- 長期転生曲線
- イベント
- 課金
- クラウドセーブ

### 6. 同時に開いた2タブの最初の競合

別タブから保存更新を受信した後はsave-lockで戦闘・操作・保存を停止し、再読み込みまたは明示初期化だけを許可する。ただし、2タブがstorage eventを受け取る前の極短時間に同時更新した場合はrevision/CASがないため、最初の保存だけ後勝ちになり得る。Vertical Sliceでは複数タブ同時プレイを対象外とし、長期版でwriter lockを追加する。

---

## 10. 次に行う順番

1. 物理iPhoneでタイトル、戦場、支援、壁、夜明け、PWA更新を確認する
2. ルナ、トト、ミミの固有spriteと能力を実装する
3. 自然な追加天敵、ボス、次の城を実装する
4. 長期転生曲線、サウンド、触覚を本番化する
5. 最初の同時保存前から保護するwriter lock / revision arbitrationを実装する

現行Vertical Sliceのゲーム性と画面構造を壊さず、同じ縦塔ループを横へ広げる。

---

## 11. 絶対に戻してはいけないもの

- 旧V0.9.x
- V0.8.0 Living Towerを主ゲームとする構成
- Plush Dollhouseを現行アート正本とする構成
- 静的な部屋カードだけの塔
- 魚・ベル・箱の三択夜番
- 魚の皿スライドを主ゲームにすること
- 猫のごきげん管理を進行必須にすること
- タップによる直接ダメージ
- 広告を通常戦闘より強い進行手段にすること
- 数値チップで戦場を覆うこと
- 実機未確認なのに「iPhone実機確認済み」と書くこと
- commit未確定なのにProduction反映済みと書くこと

---

## 12. 完了報告の必須項目

1. 変更ファイル
2. 変更しなかった領域
3. source snapshot / runtime / main commit SHA
4. Vercel Production URL
5. Production deployment SHA
6. Chromium 390×844結果
7. WebKit 390×844結果
8. Chromium 375×667結果
9. WebKit 375×667結果
10. 画像decode結果
11. schema移行結果
12. 8F再走比率
13. 10Fボス結果
14. 物理iPhone確認の有無
15. 目視で残る問題
16. 次工程へ進めるかのOK / NG

ビルド成功、HTTP 200、PNG表示だけでは完成判定にならない。
