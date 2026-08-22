# V0.8.2 復旧基準

更新日: 2026-08-22

工程状態: 工程1A=IN_PROGRESS / 工程2=PENDING_REVALIDATION / 工程3=PENDING_REVALIDATION / 工程4以降=NOT_STARTED

工程1A正式名称: V0.8.2 deployed browser-runtime source + deployment-input byte checkpoint

工程1A対象外: whole-repository backup / player-save backup / physical-iPhone approval / Production alias switch

1. V0.8.2 deployed browser-runtime source + deployment-input byte checkpoint — `IN_PROGRESS`

## 結論

V0.8.2は、新しい100F版の品質目標ではない。既知の欠点を含む旧版の16配信runtime sourceと2 deployment inputsを、比較と事故復旧のために同じbyteで再現する工程1Aの基準である。自己完結snapshotには、これら18項目に2 verification inputsを加えた20項目だけを持つ。repository全79ファイルのbackupでも外部provider backupでもない。

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

GitHubのarchive branchと`main`は監査時点で未保護であり、接続機能からremote tag／Releaseやrulesetは作成できなかった。このため可変branchだけを保存根拠にせず、配信runtime source、deployment inputs、検証入力の20項目とSHA-256を束ねた自己完結snapshotを`.github/baselines/v0.8.2/`へ持つ。現在のworkflowが起動すれば封印証拠のrevertや改変を拒否するが、権限を持つ利用者がworkflow自体を削除・無効化することまではin-repository workflow単体で防止できない。その強制には外部のGitHub rulesetまたはrequired workflowが必要である。また、このsnapshotはGitHub repositoryとVercel projectの双方を丸ごと削除する事故に対する外部provider backupではない。

## deploymentを混同しない

旧保存点deploymentと、現在固定URLが指すdeploymentは別物である。

| 役割 | deployment | GitHub commit | 状態 |
|---|---|---|---|
| 履歴上の保存点 | `dpl_4YVfqsWrzkSUmzQLZMzcTHLVzTe1` | `727b8d0` | `READY` |
| 2026-08-22監査時の固定Production | `dpl_FDbsfp8QxBJ7pysSfjTuSGw4g7Az` | `76c49e9` | `READY` |
| fresh recovery drill | `dpl_3qe2uhLnFQ4e9M4UmedQxRGUY3xV` | `2b58ab7` | `READY`。baselineと同一tree |

固定Productionには文書だけのcommitが追加されている。17件のruntime manifestは旧保存点とすべてSHA-256一致した。fresh recovery commitはbaselineの同一treeを持つ直接の子である。そのGit commit object原文は`quality-reviews/step-1-legacy-baseline/evidence/fresh-recovery-commit-object.b64`に保持し、可変なrecovery branchが将来消えてもcommit SHA、tree、parentを再計算できる。したがって、deployment identityは異なるが、配信runtime identityは同じである。

## 復旧できるもの

- manifestで固定した16配信runtime sourceと2 deployment inputs、およびsnapshot内の2 verification inputs
- V0.8.2の1F〜10Fループ
- schema2の永続進行
- 将来schemaを旧版が上書きしない保護
- Service WorkerのV0.8.2 shell、precache、旧cache除去、オフライン起動

## 復旧できないもの

- 既に削除または回復不能に破損した実ユーザーの`localStorage`
- サーバー側に存在しないプレイヤーsave
- schema2が保存していない戦闘中の猫の位置と出撃roster

戦闘中の再読込では、階、通貨、敵HPなどの永続stateは残るが、出撃中の6匹は保存されず、再読込直後は0匹または自動出撃済みの1匹へ戻る。これは保存点の再現失敗ではなくV0.8.2の既知欠点であり、新版へそのまま再利用してはいけない。

## 配信runtime sourceとdeployment inputsの復旧手順

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

2026-08-22に、baselineと同じtreeを親commitからbuildし直す`codex/v082-recovery-drill@2b58ab7`を作り、Vercel Preview `dpl_3qe2uhLnFQ4e9M4UmedQxRGUY3xV`が`READY`になることを確認した。非HTML 15経路は直接SHA-256一致し、各HTMLはbaseline bytesの直後にdeployment-bound Vercel Preview Toolbar suffixが1回だけ追加された。取得したraw response、safe headers、observed/normalized SHA-256を保存し、単なる「1行除去」ではなくbyte境界とsuffix全体を検証した。

Production切替は現在版が正常でruntimeも同一なため、この監査では実行していない。障害時は次の順で行う。

1. 切替前に、固定URLが指すdeployment ID、commit、プレイヤー影響、時刻を記録する。
2. `tests/verify-step-1-baseline.mjs --remote --live`で現状を採取する。
3. Vercelのrollback candidateである旧保存点`dpl_4YVfqsWrzkSUmzQLZMzcTHLVzTe1`をProductionへpromoteする。旧deploymentが利用不能なら、同一treeのrecovery drillを再buildしてmanifestを照合後にpromoteする。
4. 固定URLで17件のruntime manifest、通常UI、Service Worker、schema2非破壊を確認する。固有deployment URLは別originなので、固定URLの`localStorage`継続確認には使わない。
5. 失敗した場合は監査時の正常Production `dpl_FDbsfp8QxBJ7pysSfjTuSGw4g7Az`または、その時点で手順1に記録したdeploymentへroll-forwardする。
6. Production変更はユーザーの公開操作承認後だけ行う。`READY`だけで完了にしない。

目標RTOは切替判断後15分、GitHub内に保持した16配信runtime sourceと2 deployment inputsのbyte欠損RPOは0である。GitHub repositoryとVercel projectの同時削除は対象外であり、プレイヤーsaveのRPOも定義できない。V0.8.2は端末`localStorage`のみで、exportもserver backupもないためである。

## 判定を封印する3 commit

工程1Aは、「検証後に判定基準や本文を差し替える」抜け道を防ぐため、次の直系3 commitで確定する。

1. **C1 Acceptance**: Acceptance、workflow、validator、snapshot、capture、raw証拠を固定する。状態は`IN_PROGRESS`のまま、exact-head CIを実行する。
2. **C2 review candidate**: C1 CI証拠、clean recovery証拠、3人のcritic記録だけを追加する。C1の直接の子としてexact-head CIを実行する。
3. **C3 audit seal**: C2 CI証拠、final judge、round-003、定義済みの機械的な`IN_PROGRESS`→`PASS`変更だけを追加する。C2の直接の子とし、C3 PR-head CI、merge後main treeのC3一致、main push CI合格を完成報告前の外部停止条件とする。

C2とC3はsingle-parentで、各辺の変更pathはAcceptanceのexact setと一致させる。squash/rebase mergeはC1/C2/C3の証拠結合を失うため使用しない。完成報告前に、merge後のmainがC1/C2/C3を祖先とし、main headのtreeがC3と一致し、そのmain headのpush CIがhistorical-seal modeで成功したことまで確認する。C3以降は封印した2つの証拠path内のAcceptance kernelを唯一の機械的正本とし、`QUALITY_GATE.md`はその7つの必須主張をすべて残す進化可能なmirrorとする。検証器は任意の自然言語の意味を完全に解釈するとは主張せず、current文書の編集品質は後続の人間レビュー対象とする。workflowはC1〜C3のpre-seal検証ではexact baseline SHA `727b8d00c281e7539117da5ded7309ea01c7e516`を別checkoutする。C3のdescendantではこのcheckoutを繰り返さず、封印済みC3 kitのruntimeをbaseline objectとSHAへ再照合するため、mutable archive refへ依存しない。これにより、判定記録のrevertを拒否しつつ、期限切れartifactや後続工程の正当なruntime変更を工程1Aが永久に停止させない。validatorが読むAcceptance、状態、CI、証拠、critic、judge、埋め込みverbatim responseの全JSONは、意味が二重にならないよう重複object keyを拒否する。

## 品質境界

工程1Aの`PASS`は「固定した16配信runtime sourceと2 deployment inputsを同じbyteで再現できる」の意味だけである。snapshotの2 verification inputsはその再計算用であり、whole-repository backupではない。player-save continuityは別判定で`UNAVAILABLE_IN_V082`、物理iPhone standalone PWAは`NOT_VERIFIED`である。Production aliasの実切替も、正常な公開環境を不要に動かさないため本監査では実行せず、fresh Preview rebuildと切替・roll-forward手順を証拠にする。次を意味しない。

- V0.8.2のデザインが期待品質へ達した
- V0.8.2が100F仕様を実装した
- 物理iPhoneのstandalone PWAまでProduction Readyである
- 実ユーザーsaveをバックアップできる

完全manifestと証拠は[`quality-reviews/step-1-legacy-baseline/`](./quality-reviews/step-1-legacy-baseline/)を正本とする。
