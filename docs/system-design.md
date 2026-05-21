# Social Buzz Radar システム設計

## 流れ

1. Trend Sources
   Yahoo!リアルタイム検索API、Google Trends RSS、Yahoo!ニュースRSS、note公開ページ実験アダプタ、手入力トレンド、サンプルを同じ形式に正規化します。

2. Scoring
   各トピックを note / X / Instagram の重みに通し、鮮度、会話化、保存・シェア価値、深掘り可能性、ソース強度、発信領域との一致を計算します。

3. Risk Guard
   医療・投資・選挙・暴力・成人向け・相互フォロー誘導・過剰なエンゲージメント誘導を減点し、投稿前チェックリストに出します。

4. Content Planner
   上位トピックごとに、Xスレッド、Instagram Reels、note記事の素案を生成します。

5. Dashboard
   ローカルWeb UIで条件入力、トレンド一覧、スコア、投稿案、検証順を確認します。

## 起動

```bash
cd /Users/akirashirouzu/Desktop/social-buzz-radar
npm start
```

ブラウザで `http://localhost:4173` を開きます。

## CLI

```bash
node src/cli.js --sample --no-live
node src/cli.js --query "生成AI" --niche "AIアバター" --audience "経営者"
```

## Yahoo!リアルタイム検索API

公式ページでは、ランキング情報のAPI提供は法人向けとされています。契約済みの場合のみ `.env` 相当の環境変数を指定します。

```bash
YAHOO_REALTIME_API_URL="https://provided-endpoint.example" \
YAHOO_REALTIME_API_KEY="..." \
npm start
```

未設定の場合はスキップし、RSSと手入力で動作します。

## 拡張ポイント

- `src/lib/trendSources.js`: API、RSS、社内データなどの入力を追加
- `config/platform-rules.json`: 重み、リスク語、ハイインテント語を調整
- `src/lib/scoring.js`: 実績データを使った重み最適化に置き換え
- `src/lib/contentPlanner.js`: 業界別テンプレートやブランド文体を追加

## 運用メモ

- 本番運用では、各プラットフォームの公式APIまたは契約済みデータだけを使ってください。
- 投稿自動化より、仮説生成、編集、A/Bテスト記録に使う設計です。
- 実績データを入れる場合は、投稿ID、公開時刻、テーマ、形式、インプレッション、プロフィール遷移、保存、シェア、フォロー増をCSV化すると重み調整できます。
