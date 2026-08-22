# V0.8.2 復旧基準

更新日: 2026-08-22

## 結論

V0.8.2は、新しい100F版の品質目標ではない。既知の欠点を含む旧版を、比較と事故復旧のために同じbyteで再現する工程1A「source/runtime byte checkpoint」の基準である。

- 保存点commit: `727b8d00c281e7539117da5ded7309ea01c7e516`
- tree: `c508c58b0bb1b3fa591eefe143aab2dd6eac9271`
- GitHub archive branch: `archive/v0.8.2-legacy-baseline`
- repository内runtime snapshot: `.github/baselines/v0.8.2/`
- ローカルannotated tag: `v0.8.2-legacy-baseline`
- 旧Vercel deployment: `dpl_4YVfqsWrzkSUmzQLZMzcTHLVzTe1`
- 固定Production: <https://cats-tau-dusky.vercel.app/>
- version: `0.8.2`
- gameplay schema: `2`
- save key: `cats-tower-v080`
- Service Worker cache: `cats-tower-v082-pixel-tower-r3`

GitHubのarchive branchと`main`は監査時点で未保護であり、接続機能からremote tag／Releaseは作成できなかった。このため可変branchだけを保存根拠にせず、baseline各blobとSHA-256を束ねた自己完結snapshotを`.github/baselines/v0.8.2/`へ持つ。これはコード改変やarchive ref移動からの復元を強くするが、GitHub repositoryとVercel projectの双方を丸ごと削除する事故に対する外部provider backupではない。

## deploymentを混同しない

旧保存点deploymentと、現在固定URLが指すdeploymentは別物である。

| 役割 | deployment | GitHub commit | 状態 |
|---|---|---|---|
| 履歴上の保存点 | `dpl_4YVfqsWrzkSUmzQLZMzcTHLVzTe1` | `727b8d0` | `READY` |
| 2026-08-22監査時の固定Production | `dpl_FDbsfp8QxBJ7pysSfjTuSGw4g7Az` | `76c49e9` | `READY` |

後者には文書だけのcommitが追加されている。17件のruntime manifestは旧保存点とすべてSHA-256一致した。したがって、deployment identityは異なるが、配信runtime identityは同じである。

## 復旧できるもの

- GitHub上のソースと全runtime asset
- V0.8.2の1F〜10Fループ
- schema2の永続進行
- 将来schemaを旧版が上書きしない保護
- Service WorkerのV0.8.2 shell、precache、旧cache除去、オフライン起動

## 復旧できないもの

- 既に削除または回復不能に破損した実ユーザーの`localStorage`
- サーバー側に存在しないプレイヤーsave
- schema2が保存していない戦闘中の猫の位置と出撃roster

戦闘中の再読込では、階、通貨、敵HPなどの永続stateは残るが、出撃中の6匹は保存されず、再読込直後は0匹または自動出撃済みの1匹へ戻る。これは保存点の再現失敗ではなくV0.8.2の既知欠点であり、新版へそのまま再利用してはいけない。

## source/runtime復旧手順

検証kitと保存物は別refにある。`727b8d0`だけをcheckoutして、新設testがあるように扱ってはいけない。

1. GitHubから現在の検証済みbranchと`archive/v0.8.2-legacy-baseline`を取得する。
2. 空の別directoryへarchive branchまたはcommit `727b8d0`をcheckoutする。
3. 現在branch側から`CATS_BASELINE_DIR=<別directory> node tests/verify-step-1-baseline.mjs`を実行する。
4. 別directoryを`python3 -m http.server 4173`など、同一originの静的HTTPで配信する。
5. 現在branch側の`tests/living-tower-v080.mjs`で1F〜10F、保存、再読込、migrationを確認する。
6. `tests/step-1-normal-flow.mjs`で`?qa=1`なし、通常motion、通常UIの開始・戦闘・再読込を確認する。
7. `tests/step-1-service-worker.mjs`でService Worker有効、cache本文SHA、synthetic future cache除去、offline、schema2、future-schema raw非上書きを確認する。
8. Git refが利用不能なら`.github/baselines/v0.8.2/runtime/`を空directoryへコピーし、同directoryの`MANIFEST.json`と照合する。

## Vercel復旧runbook

2026-08-22に、baselineと同じtreeを親commitからbuildし直す`codex/v082-recovery-drill@2b58ab7`を作り、Vercel Preview `dpl_3qe2uhLnFQ4e9M4UmedQxRGUY3xV`が`READY`になることを確認した。非HTML15件は直接SHA-256一致し、HTML 2経路はVercel Previewが自動注入するToolbar script 1行だけを除いて一致した。

Production切替は現在版が正常でruntimeも同一なため、この監査では実行していない。障害時は次の順で行う。

1. 切替前に、固定URLが指すdeployment ID、commit、プレイヤー影響、時刻を記録する。
2. `tests/verify-step-1-baseline.mjs --remote --live`で現状を採取する。
3. Vercelのrollback candidateである旧保存点`dpl_4YVfqsWrzkSUmzQLZMzcTHLVzTe1`をProductionへpromoteする。旧deploymentが利用不能なら、同一treeのrecovery drillを再buildしてmanifestを照合後にpromoteする。
4. 固定URLで17件のruntime manifest、通常UI、Service Worker、schema2非破壊を確認する。固有deployment URLは別originなので、固定URLの`localStorage`継続確認には使わない。
5. 失敗した場合は監査時の正常Production `dpl_FDbsfp8QxBJ7pysSfjTuSGw4g7Az`または、その時点で手順1に記録したdeploymentへroll-forwardする。
6. Production変更はユーザーの公開操作承認後だけ行う。`READY`だけで完了にしない。

目標RTOは切替判断後15分、source/runtimeのRPOは0である。プレイヤーsaveのRPOは定義できない。V0.8.2は端末`localStorage`のみで、exportもserver backupもないためである。

## 品質境界

工程1Aの`PASS`は「旧版source/runtimeを同一状態へ戻せる」の意味だけである。player-save continuityは別判定で`UNAVAILABLE_IN_V082`、物理iPhone standalone PWAは`NOT_VERIFIED`である。Production aliasの実切替も、正常な公開環境を不要に動かさないため本監査では実行せず、fresh Preview rebuildと切替・roll-forward手順を証拠にする。次を意味しない。

- V0.8.2のデザインが期待品質へ達した
- V0.8.2が100F仕様を実装した
- 物理iPhoneのstandalone PWAまでProduction Readyである
- 実ユーザーsaveをバックアップできる

完全manifestと証拠は[`quality-reviews/step-1-legacy-baseline/`](./quality-reviews/step-1-legacy-baseline/)を正本とする。
