# Cat's tower repository instructions

このファイルはリポジトリ全体に適用する。会話履歴やバージョン番号だけで判断せず、release source、GitHub `main`、GitHub Actions、固定Vercel Productionを別々に照合する。

## 作業開始時に必ず読むもの

1. `AGENTS.md`
2. `PROJECT_HANDOVER.md`
3. `PROJECT_STATUS.json`
4. `README.md`
5. 現在の`git status`と`git diff`
6. GitHub `main`
7. 固定Vercel Production

## 状態を混同しない

2026-08-20現在:

- release source: V0.8.2 Tower Board Redesign。この`main` commitが正本
- V0.8.2作業基点: `main@7d486189cccbdb58aeb209432f1782d5393915ef`
- GitHub `main`: V0.8.2の正本source
- Vercel Production: `main` pushの自動deploy先。live版は外部metadataとruntimeで都度確認
- Production Ready: false。deploy成功とは別判定
- 固定URL: `https://cats-tau-dusky.vercel.app/`

`main`へのpushでVercel Productionへ自動deployされる。公開後にVercel最新Production metadataの`githubCommitSha`を現在の`main` HEADと照合し、固定URLのruntimeも確認する。GitHub Actions、WebKit証跡、通常速度、実機、PWA、精密balanceを分離して報告し、deploy成功だけを根拠にProduction Readyと書かない。V0.8.1の過去QA結果をV0.8.2のQA結果として流用しない。

## V0.8.2の非交渉プロダクト定義

Cat's towerは、スマートフォン縦画面専用の縦塔型放置インクリメンタルRPGである。

1. 猫は自動で出撃する
2. 猫は役割別の位置へ進み、天敵を自動攻撃する
3. プレイヤーのtapは増援または号令であり、直接ダメージは0
4. 攻撃、撃破、食堂配膳で得たコインを即時再投資する
5. 3F食堂と5F共同部屋は塔の中で戦闘を支援する
6. 8F黒羽の結界で停滞し、夜明けを選ぶ
7. 夜明け後は恒久強化を得て1Fから再走する
8. 10Fクロバネ撃破で最初の夜番を完了する
9. 10F後に11Fへ進めない

店舗経営、在庫、接客、魚スライド、ごきげん管理を主ゲームへ戻さない。

## 3層塔ボード

プレイ画面は常時、次の三層を持つ。

- `towerSlice--next`: 次の未制圧階
- `towerSlice--battle`: 現在の戦闘階
- `towerSlice--support`: 制圧済み後方支援階

戦場を静的な部屋カード一覧へ戻さない。階移動は次の順番を崩さない。

> 敵撃破 → 勝利保持 → 猫の上昇 → 新しい階へ入階

現行V0.8.2 release値は、勝利保持650ms、上昇1350ms、合計2000msである。数値は将来調整可能だが、因果順を同時切り替えへ戻さない。

## 猫の契約

- `mugi`: 前衛、1F
- `luna`: 後衛、2F
- `toto`: 支援、5F
- `helper-tabby`: 前衛helper
- `helper-gray`: 後衛helper
- `helper-calico`: 支援helper

名前付き猫と3種類のhelperは、戦闘中と`recoveryQueue`を合わせて各kind 1匹だけ。回復中のkindは枠を予約し、自動・手動出撃で代役の同kindを重複生成しない。実戦枠は4から始まり、ルナとトトの解放で5、6へ増える。可視上限は6。helperは同一R3 helper行をkind固定の色差分で使うため、将来固有sheetへ置き換える余地を残す。

猫の役割:

- 前衛: 敵の近くで攻撃と被弾を引き受ける
- 後衛: 前衛より後ろから短い間隔で攻撃する
- 支援: 攻撃時に回復と味方cooldown短縮を行う

## 敵の契約

- `crow` / 夜ガラス: R2通常敵
- `owl` / 夜フクロウ: R3通常敵
- `black-feather-barrier` / 黒羽の結界: 8F壁
- `great-crow` / クロバネ: 10Fボス

通常階は夜ガラスと夜フクロウを交互に出す。8Fと10Fは通常rotationへ含めない。クロバネを通常カラスの単純拡大へ戻さない。

## 呼び鈴と号令

- 空き枠がある: 猫を1匹増援
- 満員: 6秒間の「みんなで号令」
- 号令cooldown: 現行14秒
- 号令中: 攻撃と移動を加速
- どちらも直接tap damageは0

満員時に主操作をdisabledのまま放置しない。号令が充填中なら残り時間を表示する。

## 支援施設

### 3F さかな食堂

- 制圧後に解放
- 現行基本配膳間隔11秒、強化で短縮、下限6.5秒
- 配膳後4秒間、攻撃間隔を短縮
- 配膳時にコインを得る
- 食堂ランlevelと解放状態は夜明けで失う

### 5F 猫の共同部屋

- 制圧後に解放
- 倒れた猫をrecovery queueへ入れる
- 回復完了後、同じkindを入口から再出撃させる
- 共同部屋levelは夜明け後も残る

食堂を在庫・接客ゲームにせず、共同部屋をごきげん管理画面にしない。

## シート停止

猫、拠点、思い出、設定、夜明け、完了画面などのシートが開いている間は、`engine.advance`を呼ばない。次を裏で進めない。

- 敵HP
- 猫HP
- 階数
- 階遷移
- 食堂配膳
- 共同部屋復帰
- 号令時間

シートを閉じた後に通常simulationへ戻す。保存や画面再描画は許可する。

## 10F完了

10Fクロバネ撃破時:

- `firstNightCleared = true`
- `completed = true`
- `currentFloor = 10`
- `first-night`思い出を追加
- 猫は勝利状態
- 完了シートを表示
- 11Fを生成しない

旧V0.8.1保存の`currentFloor`が11F以上かつ`firstNightCleared`の場合だけ、schema2正規化で10F完了へ移す。夜明け後の`currentFloor: 1`に歴代`bestFloor: 11`が残るデータは、現ランを1Fのまま維持し、bestだけ10Fへ丸める。

## アートの非交渉条件

目標は「温かいレトロピクセルの夜の塔」。

- 猫、敵、塔、UIを同じピクセル密度と光源へ揃える
- 主役アートは同一ドメインのPNG / WebPラスターを使う
- AI生成画像内の文字をUI文字として使用しない
- Raw GitHub URLを実行時アセットに使わない
- `image-rendering: pixelated`だけを合格理由にしない
- 黒い敵は濃紺背景上で輪郭が消えないことを確認する

### Runtime art

Pixel R2継続:

- `assets/v080/pixel-r2/tower-night-r2.png`
- `assets/v080/pixel-r2/mugi-sprites-r2.png`
- `assets/v080/pixel-r2/crow-sprites-r2.png`

Pixel R3追加:

- `assets/v082/pixel-r3/cats-cast-r3.png` — 1448×1086 RGBA、4×3、各362px
- `assets/v082/pixel-r3/enemies-r3.png` — 1448×1086 RGBA、4×3、各362px

R3行契約:

- cats: ルナ / トト / helper
- enemies: 夜フクロウ / 黒羽の結界 / クロバネ

R3列契約は、idle / movement / action / completion系の4状態。CSSの`background-size: 400% 300%`と行位置を維持する。

## 保存データ

- 保存キー: `cats-tower-v080`
- schema: `gameplaySchema: 2`
- 旧キー: `cats-tower-v01`
- schema1バックアップ: `cats-tower-v080-schema1-backup`

V0.8.2だからという理由で保存キーやschema番号を変更しない。schema2内で追加した主な状態は、`completed`、`pendingFloor`、`floorTransitionRemainingMs`、`floorTransitionStage`である。将来schemaを上げる場合は、先に移行とbackup方針を定義する。

既存のschema1 / V0.1移行で行っている`coins`、`stock → fish`、`specialization`、`mugiMood`、`memories`、`hasPlayed`、`sound`、`firstNightDone`の保護を削除しない。

オフライン進行は最大8時間のコインだけを付与し、未見階、8F結界、10Fボスを自動突破させない。

## 実装規約

- スマートフォン縦画面専用
- iPhone Safari最優先。Android Chromeも確認
- PC版・横画面版は対象外
- 主要tap領域は44×44pt以上
- simulationとDOM表示を分離
- 実時間とQAで同じ固定step coreを使う
- 数値式は`game-data.js`へ集約
- 背景タブでは実時間simulationを回し続けない
- ユーザーへコードを書かせたり、コード判断を丸投げしない
- 関係のないユーザー変更を巻き戻さない

## QA状態

### V0.8.2 release sourceで完了

- Chromium 390×844: 全E2E PASS、18証跡を目視
- Chromium 375×667: 全E2E PASS、18証跡を目視
- HTTP、console、overflow、tap target、シート停止の統合目視QAがPASS
- 6種類を固定formationへ分離し、回復中のkind予約、復帰後の6種類各1匹、kind固定helper色を回帰検査してPASS
- 前衛優先targetと、前衛不在時だけ後衛・支援へfallbackする役割回帰がPASS
- 10F撃破直後に回復queueを解消して6種類全員を勝利rosterへ戻し、再読込後も同じ6種類を復元することを確認
- 元画像床座標を共通接地線へ直接アンカーし、6匹同時攻撃時の身体接地点差0.003px未満、可視alpha境界box間2.87px以上をChromium両viewportで確認
- 6匹×4状態と4敵×4状態の全40組をatlas由来の身体接地点で独立検査し、猫の床誤差0.009px未満、敵の浮遊量誤差0.011px未満でPASS。トトの攻撃シールドは接地点から除外し、クリッピング検査には含める
- 10F入階中の12時点でも6種類の最小間隔2.87px以上と画面内保持を確認
- 旧敵は勝利保持・上昇中とも`defeated`を維持し、入階後だけ新敵へ切り替える。通常motionのhit / defeat animation classも再描画後に保持する
- `settingsFacts`を修正し、再目視PASS
- 10F完了状態から完了シートが復元されることを確認
- `PROJECT_STATUS.json`のJSON parse
- R3画像のdecode、寸法、alpha確認

Chromiumの36証跡はV0.8.2の証跡として扱ってよい。V0.8.1の過去64証跡とは別に管理する。

### Production Ready前に残る必須QA

- WebKit 390×844
- WebKit 375×667
- WebKit証跡画像の目視
- 通常速度動画で3層と階上昇を確認
- 精密バランスsimulation
- 物理iPhone Safari / PWA / ChatGPT内ブラウザ
- Service Worker更新確認
- GitHub Actions
- 固定Productionのruntime hash照合

物理iPhoneの証跡を受け取っていない場合、「iPhone実機確認済み」と書かない。V0.8.1の過去64画面をV0.8.2の証跡に数えない。

## GitHub / Production反映手順

1. 作業ツリー、ローカル構文検査、利用可能なbrowser QAを完了し、未確認範囲を明記
2. 目視上の問題を修正
3. 明示的な承認後にcommit scopeを確認し、`main`へ反映
4. `main` pushによるVercel Production自動deployを待ち、対象commitのdeploymentを特定
5. GitHub ActionsでChromium / WebKitの4環境を完走し、証跡を目視
6. 固定URLのHTML、CSS、JS、Service Worker、R3画像を対象commitと照合
7. 通常速度・実機・PWA・精密balanceの未確認範囲を再評価
8. commit、deployment、URL、確認済み範囲、未確認範囲、Production Ready判定を報告

URLがHTTP 200であるだけではV0.8.2配信の証明にならない。

## V0.8.1の履歴

V0.8.1 Pixel Tower Vertical Sliceは、縦塔、自動戦闘、tap増援、8F夜明け、10Fボスを固定Productionへ戻した公開基準である。

- Production build: `v081-pixel-tower-r2-p3`
- Production runtime commit: `ebe26884f9e4500d8e755f0b4fae328ef208c6b6`
- Production deployment: `dpl_6PqJBdQX4mEdZ8xkg28tMfWtP6Cm`
- 最後に目視したActions: run `32091801556` / artifact `9308695207`
- Chromium / WebKit、390×844 / 375×667の64証跡を当時確認

この履歴は保持する。ただしV0.8.2の現在品質を証明しない。

## 戻してはいけないもの

- 旧V0.9.x
- V0.8.0 Living Tower管理ループを主ゲームにする構成
- R1 plushをcanonical runtime artにすること
- 静止カードを塔として並べること
- 魚・ベル・箱の三択夜番
- 魚在庫・接客・ごきげん管理の必須化
- tap直接ダメージ
- 同じムギを12匹重ねること
- 満員時に主操作を長時間無効化すること
- 10F後の未完成階を進ませること
- シート裏で重要進行を続けること
- 実機未確認なのに確認済みと書くこと
- deploy成功だけでV0.8.2をProduction Readyと書くこと

## 現在の優先順位

1. 現在の`main` HEADとVercel最新Productionの`githubCommitSha`を照合する
2. GitHub Actionsの4環境QAと証跡目視を完了する
3. 物理iPhoneで通常速度の主要フローを確認する
4. PWA standaloneとService Worker更新を実機確認する
5. 精密バランスsimulationは後続調整として行う
6. 全ゲート通過後にProduction Readyを判定する
