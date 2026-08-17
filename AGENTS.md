# Cat's tower repository instructions

このファイルの指示はリポジトリ全体に適用する。

## 作業開始時に必ず読むもの

1. `PROJECT_HANDOVER.md`
2. `PROJECT_STATUS.json`
3. `README.md`
4. 現在の `main` と最新Vercel Production

会話履歴だけを根拠にせず、必ず実ファイル・GitHub Actions・Vercelの公開物を照合する。

## 正本

- Repository: `2hg7trp7rv-design/cats_tower`
- Canonical branch: `main`
- Production: `https://cats-tau-dusky.vercel.app/`
- Vercel project: `prj_3Ip3e0eYMy9SchP1vS36ibjJP9LB`
- Vercel team: `team_6odZCZQ1QxjzhPdC9sgEtoCM`
- Canonical implementation: V0.8.0 Living Tower vertical slice
- Baseline implementation commit: `8a5b65202bdb10af2ee8f28e0e9fe29042ac5c4d`

旧V0.9.x、V0.7.x、V0.6以前は試行版であり、数値が大きくても正本ではない。旧画面・旧Actions・旧テストへ戻さない。

## プロダクトの核

Cat's towerは「管理画面に猫画像を載せたゲーム」ではない。

- 昼は猫が小さな店で働く
- 猫は共同部屋で暮らし、休み、関係を深める
- 昼の商品・店の選択が夜番の解決手段へ変わる
- タワーの成長を高さ、部屋、生活痕跡で見せる
- 少ない操作で猫への愛着と次の訪問理由を作る

最初の品質基準は、`ムギ + さかな食堂 + 共同部屋 + ロビー + 初回夜番`が一続きで成立するVertical Sliceである。

## 現在の厳密な品質判定

- ゲームロジックと縦型スライス: 動作する
- Chromium / WebKitの390×844自動検証: 通過実績あり
- Vercel Production: 配信済み
- 物理iPhone実機: 未確認
- 現在のV0.8画像: WebPラスターだが、手続き生成したフラットな仮アート
- 目標の「Illustrated Plush Dollhouse at Night」: 未達
- 本番公開品質: 未達

「WebPである」「テストが緑である」ことを、デザイン品質の合格と解釈しない。

## アートの非交渉条件

目標は「夜の絵本に描かれた、ぬいぐるみ猫のドールハウス」。

- 猫、部屋、家具、商品、敵、光、UI装飾の世界観を統一する
- 主役アートは高品質ラスターのPNG / WebPを使う
- SVGやCSS図形を本番の猫・家具・部屋として使わない
- 同じ猫の1枚画像を勤務・睡眠・夜番へ使い回さない
- 猫は家具と接地し、室内光と影を共有する
- タイトルは本編の完成アートから派生させる
- AI生成画像内の文字をUI文字として使わない
- Raw GitHub URLを実行時アセットに使わず、Vercel同一ドメインの`/assets/...`から配信する
- ムギとさかな食堂の本番基準が固まる前に、残り全猫・全店舗を量産しない

## 実装規約

- スマートフォン縦画面専用。iPhone Safariを最優先し、Android Chromeも確認する
- PC版・横画面版は対象外
- 主要タップ領域は44×44pt以上
- 1画面は通常1.5〜2階。俯瞰は別モードにする
- 数値管理より、部屋・猫・商品の状態を先に見せる
- `app.js`の状態、描画、操作、UI、アセット責務を今後段階的に分離する
- 保存互換を壊す変更では、移行処理と保存キー方針を先に定義する
- バージョン変更時はHTMLのキャッシュバスター、`sw.js`のキャッシュ名・アセット一覧、Manifestを同時に確認する
- `node_modules/`、`test-results/`、Playwrightレポート、一回限りの適用workflowをコミットしない
- ユーザーにコードを書かせたり、コード実装の選択を丸投げしない

## 作業フロー

1. `main`のHEAD、対象ファイル、現在のProduction deployment SHAを確認する
2. Playwright証跡または実機スクリーンショットを目視する
3. 変更対象、維持対象、失敗条件を先に定義する
4. 最小の機能断片ではなく、一続きの体験単位で実装する
5. 自分の案を否定する観点で、UI過密、生活感不足、画風分裂、スマホ操作性を再点検する
6. 自動検証を実行する
7. スクリーンショットを目視し、自動テストだけで合格を宣言しない
8. Vercel Productionが対象commitを配信していることを確認する
9. 納品時にcommit、公開URL、検証済み範囲、未確認範囲を明示する

## 必須QA

- `node --check app.js`
- `node --check sw.js`
- `node --check tests/living-tower-v080.mjs`
- PillowによるPNG / WebPのdecode、形式、寸法検証
- Playwright Chromium 390×844
- Playwright WebKit 390×844
- タイトル、通常タワー、俯瞰、猫一覧、さかな食堂、共同部屋、初回夜番の証跡
- 画面内主要アートにSVGがないこと
- JavaScript console / page errorがないこと
- Vercel ProductionのHTTP 200と対象commit SHA

物理iPhoneの画像を受け取っていない場合、「iPhone実機確認済み」と書かない。

## 現在の最優先

機能追加ではなく、現在の仮アートを本番方向へ置き換え、ムギとさかな食堂の一連の体験を物理iPhoneで成立させること。
