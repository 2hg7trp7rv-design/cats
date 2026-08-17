# Cat's tower

昼は猫たちの小さな店、夜はみんなで守る家。猫の暮らし、店舗経営、夜番が一つにつながるスマートフォン縦画面専用Webゲームです。

## Workで続きを始める前に

次の順で必ず確認してください。

1. [`AGENTS.md`](./AGENTS.md)
2. [`PROJECT_HANDOVER.md`](./PROJECT_HANDOVER.md)
3. [`PROJECT_STATUS.json`](./PROJECT_STATUS.json)
4. 現在の`main`
5. 最新のVercel Production

## 正本

- Repository: `2hg7trp7rv-design/cats_tower`
- Branch: `main`
- Current canonical version: `0.8.0`
- Implementation baseline: `8a5b65202bdb10af2ee8f28e0e9fe29042ac5c4d`
- Production: `https://cats-tau-dusky.vercel.app/`

旧V0.9.x、V0.7.x、V0.6以前は試行版です。数値が大きくても正本ではありません。

## 現在の状態

V0.8は、ムギを中心としたLiving Tower Vertical Sliceです。

実装済み:

- タイトルからゲーム開始
- ROOF、3Fさかな食堂、2F共同部屋、1Fロビー
- 通常タワーと俯瞰モード
- 自動販売、在庫、自動仕入れ、オフライン進行
- 魚の皿を棚へ滑らせる短い操作
- 屋台型 / 小料理屋型の専門化
- ムギのごきげん、なでる、休む
- 思い出
- 初回C.L.E.A.N.夜番
- localStorage保存と旧キー移行
- PWA ManifestとService Worker

未完成:

- 物理iPhoneでの最終確認
- 本番品質のムギと部屋アート
- ルナ、トト、ミミの住人実装
- 残り3店舗
- 訪問猫
- 追加夜番
- 音、触覚、クラウドセーブ、課金

## 重要な品質上の事実

現在の画像はWebPラスターですが、Pythonで手続き生成したフラットな仮アートです。

目標の「Illustrated Plush Dollhouse at Night」には未到達です。WebP表示や自動テスト成功を、本番デザイン合格と扱わないでください。

次の最優先は、機能追加ではなく、**ムギ + さかな食堂 + 共同部屋 + 初回夜番の本番アートVertical Slice**です。

## 主要ファイル

- `index.html` — アプリシェル
- `styles.css` — モバイルUIとタワー
- `app.js` — 状態、経済、描画、操作、夜番
- `assets/v080/` — 現行V0.8ラスターアセット
- `assets/illustrations/` — ルナ、トト、ミミの仮一覧画像
- `scripts/build_v080_art.py` — 現行仮アートの再生成
- `tests/living-tower-v080.mjs` — Chromium / WebKit自動検証
- `.github/workflows/verify-main.yml` — 正本QA

## 自動確認

GitHub Actionsで次を検証します。

- JavaScript / Service Worker構文
- WebP / PNG decode、形式、寸法
- Chromium 390×844
- WebKit 390×844
- タイトル、通常タワー、俯瞰、猫一覧、店舗、共同部屋、初回夜番
- ページエラーとconsole error
- メインアート内SVG不使用

物理iPhoneの確認は自動テストとは別です。
