# Cat's tower

猫たちが自動で出撃し、天敵と戦いながら月夜の塔を登る、スマートフォン縦画面専用の放置インクリメンタルRPGです。

## 現在の状態

2026-08-20現在、リリースsource、Vercelの配信実体、Production Ready判定は別々に扱います。

| 対象 | 現在の事実 |
|---|---|
| リリースsource | **V0.8.2 Tower Board Redesign**。この`main` commitが正本 |
| GitHub `main` | **V0.8.2の正本source** |
| Vercel Production | `main` pushの自動deploy先。live版はVercel metadataとruntimeを都度照合 |
| Production URL | `https://cats-tau-dusky.vercel.app/` |
| Production Ready | **false**。配信成功とは別判定 |
| V0.8.2作業の基点HEAD | `7d486189cccbdb58aeb209432f1782d5393915ef` |

`main`へのpushでVercel Productionへ自動deployされます。ただし、WebKit証跡、通常速度、物理iPhone、PWA、精密バランスの全確認が終わるまではProduction Readyと報告しません。live版は公開後にversion、build、Service Worker、R3画像、`githubCommitSha`を確認します。最新deployment IDを文書へ固定すると次の自動deployで古くなるため、Vercel metadataを正本にします。

## Workで続きを始める前に

次の順で、内容を省略せず確認してください。

1. [`AGENTS.md`](./AGENTS.md)
2. [`PROJECT_HANDOVER.md`](./PROJECT_HANDOVER.md)
3. [`PROJECT_STATUS.json`](./PROJECT_STATUS.json)
4. この`README.md`
5. 現在の作業ツリーと`git diff`
6. GitHub `main`
7. 固定Vercel Production

## V0.8.2のゲームループ

1. ムギ、ルナ、トトとhelperが役割別の位置から自動で出撃する
2. 猫と天敵が自動で戦う
3. 呼び鈴タップで空き枠へ増援する。タップ自体の直接ダメージは常に0
4. 満員時の呼び鈴は無効化せず、6秒間の「みんなで号令」へ切り替わる
5. 攻撃・撃破・食堂配膳で得たコインを即時強化へ再投資する
6. 敵撃破後は、勝利表示、階段上昇、新しい階への入階を順番に見せる
7. 3Fのさかな食堂が料理を上階へ配膳し、短時間の攻撃加速とコインを与える
8. 5Fの猫の共同部屋が倒れた猫を休ませ、自動で戦線へ復帰させる
9. 8Fの黒羽の結界で停滞し、夜明けによる転生を選べる
10. 再走後、10Fのクロバネを倒すと最初の夜番が完了する

10F撃破後は`completed`状態で固定し、11Fへ進みません。

## 3層の塔ボード

V0.8.2の戦場は、一枚の塔画像を単に上下移動する画面ではありません。常時三つの層を同時に見せます。

- 上層: 次に攻略する未制圧階
- 中層: 猫と敵が戦う現在階
- 下層: 制圧済みの後方支援階

階の進行は、`撃破 → 勝利 → 上昇 → 入階`の因果順で表示します。シートを開いている間はsimulationを停止し、裏で敵HPや階数を進めません。

## キャストと天敵

### 猫

- ムギ: 前衛。V0.8.1 Pixel R2の専用sheetを継続使用
- ルナ: 後衛。2Fで解放
- トト: 支援。5Fで解放
- helper: キジトラ、灰ねこ、三毛ねこの3定義。R3 helper行を色差分で使用

可視上限は6匹です。名前付き猫の解放に合わせ、実戦枠は4→5→6へ増えます。

### 天敵

- 夜ガラス: 既存R2通常敵
- 夜フクロウ: R3通常敵
- 黒羽の結界: 8F専用の魔法障壁
- クロバネ: 10F専用ボス

通常敵、壁、ボスは、名前やHP表示を隠してもシルエットで区別できることを前提にします。

## アート

### 継続するPixel R2

- `assets/v080/pixel-r2/tower-night-r2.png`
- `assets/v080/pixel-r2/mugi-sprites-r2.png`
- `assets/v080/pixel-r2/crow-sprites-r2.png`

### V0.8.2 Pixel R3

- `assets/v082/pixel-r3/cats-cast-r3.png` — 1448×1086 RGBA、4列×3行
  - 行: ルナ / トト / helper
  - 列: idle / walk / role action / cheer
- `assets/v082/pixel-r3/enemies-r3.png` — 1448×1086 RGBA、4列×3行
  - 行: 夜フクロウ / 黒羽の結界 / クロバネ
  - 列: 各対象の4状態

R3 atlasはV0.8.2のruntimeへ含めます。旧`assets/v080/r1/`のぬいぐるみ素材は履歴資料であり、正本へ戻しません。

## 保存

- 保存キー: `cats-tower-v080`
- schema: `gameplaySchema: 2`
- schema1バックアップ: `cats-tower-v080-schema1-backup`
- 旧キー: `cats-tower-v01`

V0.8.2でも保存キーとschema2を継続します。`completed`と階遷移状態をschema2内で正規化し、旧保存の現在階が11F以上なら10F完了へ安全に丸めます。過去最高階だけが11Fの夜明け後データは1Fの現ランを維持し、最高階だけ10Fへ丸めます。破損JSONはfresh schema2 stateへ戻します。

## 主要ファイル

- `index.html` — 3層塔、HUD、強化、呼び鈴、シート
- `styles.css` — 3層構成、R3 atlas、役割配置、モバイルレイアウト
- `game-data.js` — V0.8.2定義、猫、敵、施設、数値、アセット
- `game-core.js` — schema2、戦闘、号令、施設、階遷移、10F完了
- `app.js` — DOM描画、効果、シート停止、保存、QA bridge
- `sw.js` / `manifest.webmanifest` — V0.8.2 PWA定義
- `tests/living-tower-v080.mjs` — QA。ファイル名は履歴上そのまま

## 検証状態

V0.8.1 Productionについては、過去にChromium / WebKitの390×844、375×667と64証跡を確認済みです。これはV0.8.2の合格証明ではありません。

V0.8.2 release sourceで確認済み:

- Chromium 390×844: E2E PASS、18証跡を目視
- Chromium 375×667: E2E PASS、18証跡を目視
- 統合目視QA: HTTP、console、overflow、tap target、シート停止がPASS
- 6種類を固定formationへ分離し、倒れた猫の回復中も同kindを重複補充しないよう修正。復帰後に6種類が各1匹へ戻る回帰検査と再目視がPASS
- 敵は前衛が戦闘中なら前衛を優先して狙い、前衛不在時だけ後衛・支援へ切り替える回帰検査がPASS
- 10F撃破直後に回復待ちを解消して6種類全員を勝利隊列へ戻し、そのまま保持されることを確認。再読込後も同じ6種類が勝利ポーズで復元される
- 元画像の床座標を戦闘階の共通接地線へ直接アンカー。猫6匹同時攻撃時の身体接地点差は0.003px未満、可視alpha境界box間の水平距離は2.87px以上
- 6匹×4状態と4敵×4状態の全40組をatlas由来の身体接地点で独立検査し、猫の床誤差0.009px未満、敵の意図した浮遊量（結界4px、他6px）との差0.011px未満でPASS
- 10F入階中を100ms間隔・12時点で追跡し、6種類の最小間隔2.87px以上と画面内保持を確認
- 撃破済みの敵は勝利保持・上昇中とも倒れた姿を維持し、新しい階へ入った後だけ次の敵へ切り替わる。通常motionでhit / defeat animation classが再描画後も保持されることを確認
- トトの攻撃シールドは身体接地点から除外し、クリッピングとalpha境界box間隔の検査には含める
- `settingsFacts`の表示を修正し、再目視PASS
- 10F完了状態から完了シートが復元されることを確認

V0.8.2で未完了の検証:

- 精密バランスsimulation
- WebKit 390×844 / 375×667のE2Eと証跡目視
- 390×844、375×667での通常速度動画確認
- 物理iPhone Safari
- 物理iPhoneのChatGPT内ブラウザ
- PWA standaloneとService Worker更新
- 各commitのGitHub Actions結果とVercel `githubCommitSha`は、文書の固定値ではなく外部metadataで都度照合

Chromium上の構造・静止証跡確認は完了しました。次はWebKitと通常速度動画を確認し、その後に精密バランスsimulationを行います。物理iPhone未確認のため、V0.8.2をProduction Readyとは扱いません。

## 履歴として残すV0.8.1

V0.8.1 Pixel Tower Vertical Sliceは、縦塔、自動出撃、自動戦闘、直接tap damageなし、8F夜明け、10Fボスという方向を復元し、固定Productionへ配信した基準版です。

V0.8.2はその方向を否定するものではありません。V0.8.1実機動画で判明した「実際に登って見えない」「同じムギが重なる」「ボスが短すぎる」「満員時に主操作が死ぬ」「シート裏で進行する」「10F後も進む」を構造から修正する版です。

旧V0.9.x、V0.8.0 Living Tower管理ループ、R1 plush、直接tap damage、独立した魚在庫ミニゲーム、ごきげん必須管理、静的部屋カードの塔へ戻さないでください。
