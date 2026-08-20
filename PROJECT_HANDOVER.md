# Cat's tower 引き継ぎ書

更新日: 2026-08-20

対象repository: `2hg7trp7rv-design/cats_tower`

作業branch: `main`

現行リリースsource: **V0.8.2 Tower Board Redesign**

Vercel配信方式: **GitHub `main`からProductionへ自動deploy**

## 1. 最初に理解すべき結論

現行リリースsourceには、V0.8.1実機動画と比較研究から判明した構造問題を直すV0.8.2を実装している。

V0.8.2の正しい一続きの体験は次である。

> 猫が自動出撃する → 役割別に戦う → 呼び鈴で増援する → 満員なら6秒号令をかける → 攻撃・撃破・配膳でコインを得る → 3F食堂と5F共同部屋が戦闘を支える → 8F黒羽の結界で夜明けを選ぶ → 1Fから再走する → 10Fクロバネを倒す → 最初の夜番を完了する

このV0.8.2をGitHub `main`の正本とする。`main` pushはVercelの固定URLへ自動deployされ、公開後にlive runtimeを外部照合する。

- 精密バランスsimulation未実施
- V0.8.2の全ブラウザQA未完了
- 物理iPhone未確認

したがって「V0.8.2を確認できるようdeployする」は正しいが、実測前に「固定URLはV0.8.2」「V0.8.2 Production Ready」「iPhone実機確認済み」と書くのは誤りである。

---

## 2. ソースと公開状態

| 項目 | 現在の事実 |
|---|---|
| GitHub repository | `2hg7trp7rv-design/cats_tower` |
| Canonical branch | `main` |
| V0.8.2作業基点 | `7d486189cccbdb58aeb209432f1782d5393915ef` |
| 現行リリースsource | `0.8.2` / `v082-pixel-tower-gameplay-redesign` |
| GitHub正本 | V0.8.2 / この`main` commit |
| Vercel Production | `main` pushの自動deploy先。live版は外部照合必須 |
| Production URL | `https://cats-tau-dusky.vercel.app/` |
| Production Ready | false。deploy成功とは別判定 |
| Production runtime commit | Vercel最新Production metadataの`githubCommitSha`を現在の`main` HEADと都度照合 |
| Production deployment | Vercelの最新Production deploymentを正本とし、固定IDを文書へ埋め込まない |
| Vercel project | `prj_3Ip3e0eYMy9SchP1vS36ibjJP9LB` |
| Vercel team | `team_6odZCZQ1QxjzhPdC9sgEtoCM` |

固定URLが開けてもV0.8.2が配信されている証拠にはならない。公開前後で、HTML、CSS、JS、Service Worker、manifest、R3 atlasを対象commitと照合する。

---

## 3. V0.8.2を作る理由

V0.8.1は正しいジャンルへ戻すことには成功したが、実機動画では次の問題が残った。

- 一枚の塔背景をずらすだけで、猫が実際に上階へ登って見えない
- 同じムギ素材が多数重なり、役割と個体差が読めない
- 通常敵とボスの区別が弱い
- クロバネが短時間で倒れ、ボス戦になっていない
- 12匹満員後に主操作が長時間意味を失う
- 施設が説明シート内の数値で、戦闘との因果が見えにくい
- シートを開いていても裏で階と敵HPが進む
- 10F後も未完成階へ進む

V0.8.2は見た目の追加ではなく、これらをゲーム構造から修正する版である。

---

## 4. 3層塔ボード

V0.8.2のプレイ画面は、縦方向に三層を常時表示する。

1. 上層: 次の未制圧階
2. 中層: 現在の戦闘階
3. 下層: 制圧済みの後方支援階

`index.html`上の対応:

- `towerSlice--next`
- `towerSlice--battle`
- `towerSlice--support`

現在のCSS設計は、おおむね上16%、中央59%、下25%である。最終割合は実機検証後に調整してよいが、中央戦闘階を主役にする階層は崩さない。

上層は暗く未制圧であることを示す。中央は敵HUD、猫、敵、hit効果を持つ。下層は食堂または共同部屋の稼働状態を見せる。

---

## 5. 階制圧の順序

V0.8.1の即時置換をやめ、V0.8.2は次の順で進める。

1. `enemy-defeated`
2. `floor-cleared`
3. `victory`状態で勝利を保持
4. `ascending`状態で猫と画面が上昇
5. `floor-entered`で次の敵を生成

現行V0.8.2 release値:

- 勝利保持: 650ms
- 上昇: 1350ms
- 合計遷移: 2000ms

内部階数は入階時に更新する。撃破と同じ瞬間に次の敵を出さない。

---

## 6. 猫キャスト

### 名前付き猫

| kind | 名前 | 役割 | 解放 |
|---|---|---|---|
| `mugi` | ムギ | frontline | 1F |
| `luna` | ルナ | ranged | 2F |
| `toto` | トト | support | 5F |

- ムギは敵の近くで攻撃と被弾を引き受ける
- ルナはムギより後ろから短い間隔で攻撃する
- トトは攻撃時に味方を回復し、攻撃cooldownを短縮する

名前付き猫は同時に同kindを複数出さない。

### helper

- `helper-tabby`: frontline
- `helper-gray`: ranged
- `helper-calico`: support

helperはrotationで出撃する。戦闘中と`recoveryQueue`を合わせて各kind 1匹に制限し、回復中はそのkindの枠を予約する。現行R3 atlasはhelperを一行だけ持ち、kind固定のCSS hue差分で見分ける。これはV0.8.1の同じムギ大量表示より改善しているが、将来3種の固有sheetへ分ける余地がある。

### 出撃枠

- 可視上限: 6
- 初期party capacity: 4
- ルナ解放後: 5
- トト解放後: 6

名前付き猫の枠がhelperに先に埋め尽くされないよう、解放に合わせてcapacityを増やす。

---

## 7. 敵と階

| 条件 | 敵 |
|---|---|
| 通常階 | 夜ガラスと夜フクロウを交互に出す |
| 8F | 黒羽の結界 |
| 10F | クロバネ |

### 夜ガラス

既存Pixel R2の通常敵。V0.8.1から継続。

### 夜フクロウ

Pixel R3の追加通常敵。夜ガラスと異なる丸い顔、翼、攻撃姿勢を持つ。

### 8F 黒羽の結界

生物ではなく、黒い羽根が組み合わさった縦長の魔法障壁。高HPと再生を持ち、最初の夜明けを考える壁になる。

### 10F クロバネ

Pixel R3の専用ボス。金色の目、重い嘴、大きな翼、通常カラスと異なるシルエットを持つ。

10F撃破時:

- `firstNightCleared = true`
- `completed = true`
- `currentFloor = 10`
- `bestFloor = 10`
- `first-night`思い出を追加
- 猫を`celebrating`へ変更
- 完了シートを表示
- 11Fへ進まない

---

## 8. 呼び鈴と号令

プレイヤーのtapは敵を直接攻撃しない。

### 空き枠がある場合

- 猫を1匹手動出撃
- 手動cooldownは150ms
- 敵HP変化は0

### 満員の場合

- 呼び鈴を「みんなで号令」へ切り替える
- 6秒間、移動と攻撃を加速
- 現行cooldownは14秒
- 号令による直接ダメージも0
- cooldown中は残り時間を表示

満員時に主ボタンを単なるdisabledへ戻さない。

---

## 9. 3F さかな食堂

3F入階で解放するラン内支援施設。

現行動作:

- 基本配膳間隔: 11秒
- 強化で間隔短縮
- 下限: 6.5秒
- 配膳buff: 4秒
- buff中は猫の攻撃間隔を短縮
- 配膳時にコインを付与
- 下層支援階とtoastで配膳を可視化

夜明けで食堂levelと解放状態を失い、再び3Fで解放する。食材在庫、接客、皿スライドを独立した主ゲームにしない。

---

## 10. 5F 猫の共同部屋

5F入階で解放する復帰支援施設。

猫のHPが0になると:

1. 戦場から外れる
2. `recoveryQueue`へ入る
3. 共同部屋で回復時間を消化する
4. 枠が空けば同じkindで再出撃する

回復中のkindはroster上の予約として扱う。待機中に自動・手動出撃が同kindを代役生成して固定formation上で重ならないようにする。復帰後は6種類が各1匹へ戻る。

現行基本回復時間は9秒。共同部屋解放時の係数、level、名前付きかhelperかで短縮し、下限は2.4秒である。

共同部屋levelは夜明け後も残る。ごきげん管理や撫でる操作を進行必須へ戻さない。

---

## 11. シート中の停止

`app.js`のanimation loopは、`activeSheet`が存在する間`engine.advance`を実行しない。

停止対象:

- 猫と敵のHP
- 攻撃cooldown
- 階遷移
- 自動出撃
- 号令時間
- 食堂配膳
- 共同部屋回復

猫、拠点、思い出、設定、夜明け、完了画面のいずれでも同じ。重要イベントをシート裏で発生させない。

---

## 12. 夜明け

8F到達後に解放する転生システム。

失うもの:

- 現在階
- ラン内コイン
- ムギlevel
- 猫パンチlevel
- 出撃口level
- 食堂level
- 食堂解放状態

残るもの:

- 最高階
- 共同部屋level
- 思い出
- 夜明け回数
- 累計の朝の鈴

得るもの:

- 朝の鈴
- 累計鈴に基づく恒久倍率

V0.8.1では短いVertical Slice用simulationで再走比約0.723を記録した。これは履歴であり、V0.8.2のバランス証明ではない。V0.8.2の精密バランスsimulationは後工程で行う。

---

## 13. 保存と移行

### 継続する契約

- 保存キー: `cats-tower-v080`
- schema: `gameplaySchema: 2`
- schema1 backup: `cats-tower-v080-schema1-backup`
- legacy key: `cats-tower-v01`

V0.8.2でもキーとschema番号を変えない。

schema2に追加・正規化した主な状態:

- `completed`
- `pendingFloor`
- `floorTransitionRemainingMs`
- `floorTransitionStage`

旧V0.8.1保存の`currentFloor`が10Fより上を指し、`firstNightCleared`がtrueの場合だけ、10F完了として正規化する。夜明け後の`currentFloor: 1`に歴代`bestFloor: 11`だけが残る場合は現ランを1Fのまま維持し、bestだけ10Fへ丸める。破損JSONはfresh schema2 stateへ戻す。future schemaは上書きせず保護する。

既存のschema1 / V0.1移行では、次を保護または変換する。この履歴をV0.8.2対応のために削除しない。

- `coins → coins`
- `stock → fish`
- `specialization → specialization`
- `mugiMood → mugiMood`
- `memories → memories`
- `hasPlayed → hasPlayed`
- `sound → sound`
- `firstNightDone → legacyFirstNightDone`と履歴memory

オフライン進行:

- 最大8時間
- コインのみ
- 階を進めない
- 結界とボスを突破しない

---

## 14. アート

### Pixel R2継続

| ファイル | 役割 | 寸法 |
|---|---|---|
| `assets/v080/pixel-r2/tower-night-r2.png` | タイトル・塔 | 941×1672 RGB |
| `assets/v080/pixel-r2/mugi-sprites-r2.png` | ムギ4状態 | 2172×724 RGBA |
| `assets/v080/pixel-r2/crow-sprites-r2.png` | 夜ガラス4状態 | 1774×887 RGBA |

### Pixel R3追加

| ファイル | 行 | 列 | 寸法 |
|---|---|---|---|
| `assets/v082/pixel-r3/cats-cast-r3.png` | ルナ / トト / helper | idle / walk / action / cheer | 1448×1086 RGBA |
| `assets/v082/pixel-r3/enemies-r3.png` | フクロウ / 結界 / クロバネ | 各4状態 | 1448×1086 RGBA |

両R3 atlasは4×3、各cell 362×362。CSSは`background-size: 400% 300%`で表示する。

R3はV0.8.2 runtimeへ含める。live配信の有無は公開後に固定URLで確認する。

旧`assets/v080/r1/` plush素材は履歴資料であり、runtime、fallback、precache、QA依存へ戻さない。

---

## 15. 主要ファイル

| ファイル | V0.8.2での役割 |
|---|---|
| `index.html` | 3層塔、compact HUD、戦闘dock、呼び鈴、シート |
| `styles.css` | 3層比率、役割位置、R3 atlas、階遷移、モバイル調整 |
| `game-data.js` | version、猫、敵、施設、号令、R3 art、数値 |
| `game-core.js` | schema2、役割戦闘、号令、配膳、復帰、階遷移、10F完了 |
| `app.js` | DOM、audio feedback、effects、シート停止、完了画面 |
| `sw.js` | V0.8.2 cache定義 |
| `manifest.webmanifest` | V0.8.2説明 |
| `tests/living-tower-v080.mjs` | 縦塔QA。名前は履歴上継続 |

---

## 16. 検証状態

### V0.8.1で過去に完了したもの

- Chromium / WebKit
- 390×844 / 375×667
- 64証跡目視
- 固定Production 13 runtime filesのhash照合
- Production runtime commit `ebe26884...`

これはV0.8.1の履歴であり、V0.8.2の合格結果ではない。

### V0.8.2で確認済みの範囲

- release source上にV0.8.2 versionとbuild定義がある
- 3層DOMとCSSがある
- 3名の猫、3種helper、フクロウ、結界、クロバネ定義がある
- 直接tap damage 0と満員時号令のcoreがある
- 食堂配膳と共同部屋復帰のcoreがある
- 勝利・上昇・入階の段階状態がある
- シート中に`engine.advance`しない条件がある
- 10Fで`completed`へ固定する条件がある
- R3 atlasがrelease runtime pathへ存在する
- Chromium 390×844の全E2EがPASSし、18証跡を目視した
- Chromium 375×667の全E2EがPASSし、18証跡を目視した
- HTTP、console、overflow、tap target、シート停止の統合目視QAがPASSした
- 6種類を固定formationへ分離し、回復中のkind予約、復帰後の6種類各1匹、kind固定helper色を回帰検査してPASSした
- 前衛優先targetと、前衛不在時だけ後衛・支援へfallbackする役割回帰がPASSした
- 10F撃破直後に回復queueを解消し、6種類全員を勝利rosterへ戻して分離・画面内保持した。再読込後も同じ6種類を復元する
- 元画像の床座標を画面比率補正ではなく共通接地線へ固定し、6匹同時攻撃時の身体接地点差0.003px未満、可視alpha境界box間2.87px以上を両viewportで確認した
- 6匹×4状態と4敵×4状態の全40組をatlas由来の身体接地点で独立検査し、猫の床誤差0.009px未満、敵の浮遊量誤差0.011px未満でPASSした。トトの攻撃シールドは身体接地点から除外し、クリッピング検査には含めた
- 10F入階中を100ms間隔・12時点で追跡し、6種類が重ならず画面内に残ることを両viewportで確認した
- 旧敵は`victory`と`ascending`の両方で`defeated`を維持し、入階後だけ新敵の`moving`へ切り替わる回帰がPASSした。通常motionのhit / defeat classも再描画後に残る
- `settingsFacts`を修正し、再目視PASSした
- 10F完了状態から完了シートが復元されることを確認した

### V0.8.2で未確認

- 精密バランスsimulation
- WebKit 390×844 / 375×667のE2E
- WebKit証跡の目視
- 通常速度の階上昇動画
- 物理iPhone Safari
- ChatGPT内ブラウザ
- PWA standalone
- Service Worker更新挙動
- このcommitに対するGitHub Actionsの外部結果
- Vercel最新Production metadataと現在の`main` HEADの照合

---

## 17. 既知のリスク

### helperは一つのatlas行

3種のkindと役割はあるが、現行ビジュアルは同じhelper行のhue差分である。最終的な固有性が不足する可能性がある。

### バランスは未確定

V0.8.2の構造を先に直しており、8Fまでの時間、夜明け後の短縮率、10Fボス秒数は精密simulation前である。V0.8.1の値をそのまま合格値にしない。

### 物理iPhone未確認

- Dynamic Island
- Safari下部バー
- ホームインジケータ
- ChatGPT内ブラウザのdismiss gesture
- 連続tap
- PWA standalone
- Retina上のpixel表示

### 一部基礎artはR2

塔、ムギ、夜ガラスはR2を継続する。R3との密度・光源差が実機で見える場合は、実装後の画面を基準に調整する。

### 同時タブ

storage event後はsave-lockするが、最初の競合前にwriter lock / CASがない問題は残る。長期版の課題である。

---

## 18. 次に行う順番

1. 現在の`main` HEADとVercel最新Productionの`githubCommitSha`を照合する
2. GitHub ActionsでChromium / WebKitの4環境を完走し、証跡を目視する
3. 通常速度、物理iPhone、PWAを確認する
4. 精密バランスsimulationは今回の方針どおり後続調整へ分離する
5. 全ゲート通過後にProduction Readyを判定する

---

## 19. 戻してはいけないもの

- 旧V0.9.x
- V0.8.0 Living Tower管理ループを主役にすること
- R1 plushを正本artにすること
- 静的部屋カードだけの塔
- 同じムギを12匹重ねること
- 通常カラスと同じボス
- 魚・ベル・箱の三択夜番
- 食材在庫・接客・魚スライド
- ごきげん管理の必須化
- tap直接ダメージ
- 満員時の主操作無効化
- 撃破と次敵出現の同時処理
- シート裏での重要進行
- 10F後の未完成階
- 実機未確認なのに確認済みと書くこと
- V0.8.2のdeploy成功だけでProduction Readyと書くこと

---

## 20. V0.8.1の履歴

V0.8.1 Pixel Tower Vertical Sliceは、誤ったLiving Tower管理ゲームから縦塔自動戦闘へ戻した公開基準である。

- user-approved source snapshot: `0c4c191624b6ffca45c9da91f065d5b9fe49c36a`
- feature integration: `3b0bc6a88ab3a1ee2aa11ed2b588f7c0eeb8eb19`
- WebKit viewport fix: `5d16682e51b974e4b3f72a3ceb7a58c229e827f7`
- Production runtime: `ebe26884f9e4500d8e755f0b4fae328ef208c6b6`
- docs baseline: `7d486189cccbdb58aeb209432f1782d5393915ef`
- visually audited Actions run: `32091801556`
- artifact: `9308695207`

V0.8.1の方向、自動戦闘、直接tap damageなし、8F夜明け、10Fボスという骨格は維持する。V0.8.2は、V0.8.1の実機上の欠点を修正した現行リリースsourceである。

---

## 21. 完了報告の必須項目

1. 変更ファイル
2. 変更しなかった領域
3. ローカルHEADとcommit
4. GitHub反映の有無
5. 固定Production URL
6. Production deploymentとruntime commit
7. node syntax結果
8. JSON結果
9. 画像decode / alpha結果
10. Chromium 390×844
11. WebKit 390×844
12. Chromium 375×667
13. WebKit 375×667
14. 精密バランスsimulation結果
15. 10F後に11Fへ進まない結果
16. シート停止結果
17. 物理iPhone確認の有無
18. 目視で残る問題
19. Production ReadyのOK / NG

ビルド成功、HTTP 200、画像表示だけでは完成判定にならない。
