# Cat's tower

猫が自動出撃し、天敵と戦いながら夜の縦塔を登る、スマートフォン縦画面専用の放置インクリメンタルRPGです。現行のプロダクト方向は**V0.8.1 Pixel Tower Vertical Slice**です。

## Workで続きを始める前に

次の順で、内容を省略せず確認してください。

1. [`AGENTS.md`](./AGENTS.md)
2. [`PROJECT_HANDOVER.md`](./PROJECT_HANDOVER.md)
3. [`PROJECT_STATUS.json`](./PROJECT_STATUS.json)
4. この`README.md`
5. 現在の`main`
6. 最新のVercel Production

## 正本と公開先

- Repository: `2hg7trp7rv-design/cats_tower`
- Canonical branch: `main`
- Product direction: `0.8.1`
- Production build: `v081-pixel-tower-r2-p3`
- Production runtime commit: `ebe26884f9e4500d8e755f0b4fae328ef208c6b6`
- Production: `https://cats-tau-dusky.vercel.app/`

2026-08-18時点でV0.8.1 Pixel Tower Vertical Sliceは`main`と固定Productionへ配信済みです。Productionの実行時13ファイルは上記commitとhash一致しています。Chromium / WebKitの390×844、375×667は全環境PASSし、64画面を目視済みです。物理iPhoneと追加猫・敵・城・長期バランスを含むフルゲームは未完成です。

旧V0.9.xへ戻さないでください。V0.8.0 Living TowerとV0.8 R1 plush sliceも、現在のゲーム性・実行時アートの正本ではありません。

## ゲームループ

1. 猫が自動で出撃し、縦塔を登る
2. 猫と天敵が自動で攻撃し合う
3. タップで猫を1匹増援する。タップ自体の直接ダメージは0
4. 攻撃と撃破で得たコインを、ムギ、猫パンチ、出撃口へ即時再投資する
5. 3Fでさかな食堂、5Fで共同部屋を解放する
6. 8Fの壁で停滞し、夜明けの時機を選ぶ
7. 夜明けでラン内進行を失い、恒久倍率を得る
8. 旧8Fを前回の75%以下の時間で再走する
9. 10Fの初回夜番ボスを倒し、思い出を得る

さかな食堂と共同部屋は塔攻略の支援施設です。店舗経営、魚スライド、ごきげん管理、魚・ベル・箱の三択夜番を主ゲームへ戻しません。

## アートとUI

正本は、温かいレトロピクセルの夜の塔です。

- `assets/v080/pixel-r2/tower-night-r2.png` — 縦塔背景
- `assets/v080/pixel-r2/mugi-sprites-r2.png` — ムギ4フレーム
- `assets/v080/pixel-r2/crow-sprites-r2.png` — カラス4フレーム
- `assets/fonts/noto-sans-jp-700-ja.woff2` — 日本語UI Webfont
- `assets/icons/icon-192.png` / `icon-512.png` — ムギのPixel R2 PWAアイコン

Pixel R2が実行時、Service Worker、QAのcanonicalです。`assets/v080/r1/`のplush画像は履歴上の旧プロトタイプ資料であり、現行ランタイムでは使いません。追加猫、追加敵、追加城は未完成です。

## 保存

- 保存キー: `cats-tower-v080`
- 現行schema: `gameplaySchema: 2`
- schema1バックアップ: `cats-tower-v080-schema1-backup`
- 旧キー: `cats-tower-v01`

V0.8.0とV0.1の保存をschema2へ移行し、破損JSONはfresh stateへ安全に戻します。オフライン進行は最大8時間のコインだけを付与し、未見階やボスを自動突破しません。

## 主要ファイル

- `index.html` — タイトル、HUD、縦塔戦場、増援、強化、夜明け
- `styles.css` — 温かいPixel Tower UI、スプライト、モバイルレイアウト
- `game-data.js` — バランス、階、敵、施設、強化、アセット定義
- `game-core.js` — schema2、決定論的simulation、戦闘、壁、夜明け、offline
- `app.js` — DOM描画、操作、保存、シート、QA bridge
- `sw.js` / `manifest.webmanifest` — PWA
- `tests/living-tower-v080.mjs` — Chromium / WebKitのVertical Tower QA
- `.github/workflows/verify-main.yml` — `main`検証

## Productionで検証する条件

- JavaScript構文とPixel R2画像decodeが成功する
- Chromium / WebKitの390×844と375×667がすべて成功する
- 自動出撃、増援時直接ダメージ0、即時強化、3F、5F、8Fの壁、夜明け、25%以上の高速再走、10Fボスを確認する
- schema2再読込、V0.8.0 / V0.1移行、破損JSON回復を確認する
- 全証跡画像を目視する
- 対象commitを`main`と固定Production URLへ反映し、配信ファイルを照合する
- テスト、引継ぎ文書、旧R1 / Living Towerアートを公開対象へ含めない

上記の自動QAとProduction照合は完了しています。ただし自動QA、HTTP 200、画像decodeを、長期バランスや物理iPhoneの合格と同義にしないでください。物理iPhoneは未検証です。

## 未完の製品領域

- ルナ、トト、ミミを含む追加猫と固有能力
- 追加の自然な天敵とボス
- 追加の城・塔テーマ
- 長期バランスとコンテンツ
- 本番サウンド、触覚、クラウドセーブ、課金、イベント

次は物理iPhoneで主要フローを確認し、その後に追加猫、敵、城、長期コンテンツを拡張します。
