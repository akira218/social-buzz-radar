# Social Buzz Radar

note / X / Instagram向けのトレンド検知と投稿案生成MVPです。公式情報・公開GitHubのアルゴリズム分析をベースに、Yahoo!リアルタイム検索APIなどのライブ入力をつなげられる形にしています。

## できること

- Google Trends RSS、Yahoo!ニュースRSS、手入力トレンド、サンプルを統合
- 契約済みのYahoo!リアルタイム検索ランキングAPIを接続
- note / X / Instagram別にバズりやすさをスコアリング
- X投稿案、Instagram Reels案、note記事構成を生成
- リスク語、スパム的誘導、誤情報リスクを減点

## 使い方

```bash
cd /Users/akirashirouzu/Desktop/social-buzz-radar
npm start
```

開くURL:

```text
http://localhost:4173
```

CLIで試す場合:

```bash
npm run analyze
node src/cli.js --sample --no-live --query "生成AI"
```

## 設定

`.env.example` を見て、必要な環境変数を設定してください。Yahoo!リアルタイム検索ランキングAPIは公式ページ上で法人向け提供とされているため、未契約の場合は手入力またはRSSで運用します。

## 調査メモ

- [アルゴリズム分析](./docs/algorithm-analysis.md)
- [システム設計](./docs/system-design.md)

## 方針

このツールは、虚偽エンゲージメントや規約回避ではなく、話題性、読者適合、一次情報化、保存・共有価値を高めるための編集支援です。
