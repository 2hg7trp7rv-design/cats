# Cat's tower repository instructions

このファイルはリポジトリ全体に適用する。会話履歴やバージョン番号だけで判断せず、必ず実ファイル、`main`、GitHub Actions、Vercel Productionを照合する。

## 作業開始時に必ず読むもの

1. `AGENTS.md`
2. `PROJECT_HANDOVER.md`
3. `PROJECT_STATUS.json`
4. `README.md`
5. 現在の`main`
6. 最新Vercel Production

## 正本

- Repository: `2hg7trp7rv-design/cats_tower`
- Canonical branch: `main`
- Product direction: V0.8.1 Pixel Tower Vertical Slice
- Production URL: `https://cats-tau-dusky.vercel.app/`
- Vercel project: `prj_3Ip3e0eYMy9SchP1vS36ibjJP9LB`
- Vercel team: `team_6odZCZQ1QxjzhPdC9sgEtoCM`
- Candidate implementation commit: `f26cebc6dc460cd457fae1034010859f81a8751c`
- Candidate Production deployment: pending; external push requires explicit approval

2026-08-18時点でV0.8.1実装は上記commitへ固定され、ローカルChromium 2環境と全32証跡の目視はPASSしている。外部pushの明示承認待ちであり、`main`、WebKitを含むGitHub Actions、Production配信は未確定である。Vercel URLがHTTP 200でも、対象commitを配信している証拠にはならない。

旧V0.9.x、V0.7.x、V0.6以前へ戻さない。旧V0.8.0 Living TowerおよびV0.8 R1 plush sliceも、現在のゲーム性・アート正本ではない。

## V0.8.1のゲームの核

Cat's towerは、猫が自動で縦塔を登る放置インクリメンタルRPGである。

1. 猫が自動出撃する
2. 猫が上階へ進み、天敵を自動攻撃する
3. タップで追加の猫を出撃させる
4. タップ自体は敵へ直接ダメージを与えない
5. 攻撃・撃破でコインを得る
6. ムギ、猫パンチ、出撃口へ即時再投資する
7. 3Fのさかな食堂、5Fの共同部屋を攻略結果として解放する
8. 8Fで意図的な壁に当たり、進むか夜明けを選ぶ
9. 夜明けでラン内進行を失い、恒久強化を得る
10. 旧階層を前回より25%以上速く再走する
11. 10Fの初回夜番ボスを倒す

店舗経営、猫の世話、魚スライド、魚・ベル・箱の三択防衛を主ゲームへ戻さない。さかな食堂と共同部屋は、塔攻略を支える施設であり、独立した別ゲームではない。

## 参考作品から維持するゲーム文法

- 縦塔を常時見せる
- 仲間の自動出撃と自動戦闘
- タップによる出撃密度の上昇
- 戦闘収入の即時再投資
- 新しい仲間・設備・階層の段階解放
- 明確な停滞壁
- 転生時機の判断
- 転生後の時間圧縮

コード、固有名詞、画像、台詞、数値表は独自にする。参考作品の欠点である連打強制、広告依存、効果不明な強化、無意味な防御値は再現しない。

## アートの非交渉条件

目標は「温かいレトロピクセルの夜の塔」。

- スマートフォンで読める太いシルエットと限られた色数を使う
- 猫、天敵、塔、UIを同じピクセル密度と光源へ揃える
- 主役アートはPNGまたはWebPラスターを使う
- 本番の猫、敵、塔をSVGやCSS図形だけで作らない
- スプライトは役割ごとのフレームを持たせる
- AI生成画像内の文字をUI文字として使わない
- Raw GitHub URLを実行時アセットに使わない
- 実行時アセットは同一ドメインの`/assets/...`から配信する
- `image-rendering: pixelated`だけを理由にピクセルアート合格としない

V0.8 R1のぬいぐるみ・ドールハウス画像は履歴上の旧プロトタイプ資料であり、現行正本アートではない。現行ランタイム、Service Worker、QA契約では使わない。Pixel R2だけをcanonical runtime artとして扱い、旧R1をfallbackへ戻さない。

## 現行Pixel R2アセット

`assets/v080/pixel-r2/`

- `tower-night-r2.png` — 縦塔背景、941×1672、RGB
- `mugi-sprites-r2.png` — ムギ4フレーム、2172×724、RGBA
- `crow-sprites-r2.png` — 天敵4フレーム、1774×887、RGBA

PWA / apple-touch iconは`assets/icons/icon-192.png`と`icon-512.png`のPixel R2ムギ画像を使う。旧フラット肉球へ戻さない。

日本語UIは`assets/fonts/noto-sans-jp-700-ja.woff2`を`CatsTowerJP`として同一ドメイン配信する。Webfont失敗時にもシステム日本語fontへ安全にfallbackさせる。

追加猫、追加天敵、追加城を量産する前に、ムギ、カラス、最初の塔、10Fボスの画面を390×844と375×667で目視確認する。

## 保存データ

- 保存キー: `cats-tower-v080`
- 現行schema: `gameplaySchema: 2`
- 旧キー: `cats-tower-v01`
- schema1バックアップ: `cats-tower-v080-schema1-backup`

V0.8.0 Living Tower保存からは、コイン、在庫から変換したfish、専門化、ムギの気分、思い出、設定を移行する。破損JSONはfresh stateへ安全に戻す。保存キーまたはstate構造を変更する場合、移行とバックアップ方針を先に定義する。

夜明けで失うもの:

- 現在階
- ラン内コイン
- ラン内fish（初期値4へ戻る）
- ムギ、武器、出撃速度のラン内レベル
- さかな食堂のラン内レベル
- さかな食堂の解放状態（3Fで再解放）

夜明け後も残るもの:

- 最高階
- 共同部屋レベル
- 思い出
- 食堂の専門化
- 夜明け回数
- 累計かけらによる恒久倍率

## 実装規約

- スマートフォン縦画面専用
- iPhone Safariを最優先し、Android Chromeも確認する
- PC版と横画面版は対象外
- 主要タップ領域は44×44pt以上
- タップ増援と直接攻撃を混同しない
- 一つの決定論的simulationを実時間とQAで共有する
- DOM表示と`game-core.js`の戦闘計算を分離する
- 可視ユニット数には上限を設ける
- 背景タブでは実時間simulationを回し続けず、復帰時にオフライン報酬を計算する
- オフライン進行は最大8時間のコインのみ。未見の階やボスを自動突破させない
- 数値式は`game-data.js`へ集約する
- ユーザーへコードを書かせたり、コード判断を丸投げしない

## 主要ファイル

- `index.html` — モバイルUI、戦場、強化、夜明け、シート雛形
- `styles.css` — 温かいPixel Tower UIとスプライト表示
- `game-data.js` — バランス、敵、階、施設、強化、アセット定義
- `game-core.js` — schema2、決定論的simulation、戦闘、強化、夜明け、オフライン進行
- `app.js` — DOM描画、操作、保存、UI、QA bridge
- `sw.js` — PWAキャッシュ
- `manifest.webmanifest` — PWA設定
- `tests/living-tower-v080.mjs` — 4環境のVertical Tower QA
- `.github/workflows/verify-main.yml` — main検証

## 作業フロー

1. `main`のHEADと作業ブランチを確認する
2. Vercel Productionの配信内容とcommitを確認する
3. 変更対象、維持対象、失敗条件を定義する
4. 一続きの体験単位で実装する
5. `node --check`と画像decodeを実行する
6. ChromiumとWebKitの390×844、375×667を実行する
7. すべての証跡画像を目視する
8. R1 plush、旧三択夜番、旧管理画面が実行時へ戻っていないか検索する
9. `main`へ反映する
10. Vercel Productionが対象commitを配信していることを確認する
11. commit、URL、検証済み範囲、未確認範囲を報告する

## 必須QA

- `node --check game-data.js`
- `node --check game-core.js`
- `node --check app.js`
- `node --check sw.js`
- `node --check tests/living-tower-v080.mjs`
- PillowによるPNG / WebPのdecode、形式、寸法、alpha検証
- Playwright Chromium 390×844
- Playwright WebKit 390×844
- Playwright Chromium 375×667
- Playwright WebKit 375×667
- 自動出撃
- タップ増援と直接ダメージ0
- 攻撃・撃破収入
- 即時強化とDPS上昇
- 3Fさかな食堂
- 5F共同部屋
- 8Fで12秒以上維持される壁
- 夜明けの「失う・残る・得る」表示
- 夜明け後の旧8F到達時間が前回の75%以下
- 10F初回夜番ボスと`first-night`思い出
- schema2再読込
- V0.8.0、V0.1、破損JSONの移行
- 画面内主要アートのSVG不使用
- JavaScript console / page errorなし
- Vercel ProductionのHTTP 200と対象commit SHA

物理iPhoneの画像を受け取っていない場合、「iPhone実機確認済み」と書かない。自動テスト成功をアート・バランス・実機操作の合格と同義にしない。

## 現在の最優先

1. 明示承認後にcandidate `f26cebc`をpushして`main`へfast-forwardする
2. GitHub Actionsで4環境QAを完走し、全64証跡を目視する
3. 旧R1 plushがランタイム、cache、QAへ再混入していないことを確認する
4. `main`へ反映する
5. Vercel Productionを対象commitへ更新する
6. 物理iPhoneで確認する

追加猫、追加敵、別城、イベント、課金へ進むのはその後である。
