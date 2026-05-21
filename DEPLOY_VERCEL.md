# Vercel デプロイ手順

Social Buzz Radar をVercelに公開する手順です。所要時間：約15分。

## 必要なもの

- GitHubアカウント（このリポジトリは既にプッシュ済み）
- Vercelアカウント（無料Hobbyプランで動きます）
- Anthropic API キー

## ステップ1：Vercelアカウントとプロジェクト作成

1. https://vercel.com にアクセス → **Sign up**（または既存アカウントでログイン）
2. GitHubと連携（推奨）
3. ダッシュボード → **Add New...** → **Project**
4. **Import Git Repository** で `akira218/social-buzz-radar` を選ぶ
5. **Configure Project** 画面：
   - Framework Preset：**Other**（自動検出されます）
   - Build Command：**空欄のまま**
   - Output Directory：**`public`**
   - Install Command：**`npm install`**

## ステップ2：環境変数を設定

「Environment Variables」セクションで以下を追加：

| Name | Value | 説明 |
|---|---|---|
| `ANTHROPIC_API_KEY` | `sk-ant-api03-...` | Anthropic APIキー（あなたのもの） |
| `BUZZ_RADAR_PASSWORD` | （好きなパスワード） | サイトアクセス用のパスワード |
| `CRON_SECRET` | （ランダムな英数字） | Vercel Cron用の認証トークン |

`CRON_SECRET` は、例えば `mysecret2026xyz789` のような英数字を自分で決めて入れてください。

## ステップ3：デプロイ

「**Deploy**」ボタンを押す → 1-2分待つ → 完了

完了すると、`https://social-buzz-radar-xxxxx.vercel.app` のようなURLが発行されます。

## ステップ4：Vercel KV を追加（アルゴリズム情報の永続化用）

1. プロジェクトダッシュボード → **Storage** タブ
2. **Marketplace Database Providers** で **Redis** を検索
3. **Upstash Redis** または **Vercel KV**（同等品）を選択
4. Free プランで **Add Integration**
5. 自動的に `KV_REST_API_URL` と `KV_REST_API_TOKEN` の環境変数が追加されます
6. **再デプロイ**（Deployments → 最新のデプロイ → ... → Redeploy）

## ステップ5：動作確認

1. 発行されたURLにアクセス
2. パスワード入力画面が出る → ステップ2で設定したパスワードを入力
3. ブラウザに記憶されるので2回目以降は不要
4. 「分析」ボタン → トレンド表示
5. 「文章バリエーション生成」 → 約50秒で生成
6. 「📊 アルゴリズム情報」 → 表示確認

## ステップ6：自動更新の確認（Cron Jobs）

- `vercel.json` の設定で、**毎日 09:00 JST（UTC 00:00）に自動でアルゴリズム情報を更新**します
- Vercel ダッシュボード → **Settings** → **Cron Jobs** で有効か確認できます
- 動作ログは **Logs** タブで `/api/cron/refresh-algorithm` を検索

## 運用上の注意

### コスト目安

- **Vercel**：Hobbyプラン無料（月100GB帯域、Cron 2個まで）
- **Anthropic API**：1回の生成で約 $0.03（4.5円）
  - パスワード保護で守られているので、自分が使う分だけ

### パスワードを変更したい時

1. Vercel ダッシュボード → **Settings** → **Environment Variables**
2. `BUZZ_RADAR_PASSWORD` を編集
3. **Redeploy**（再デプロイで反映）

### URLを誰かに共有する時

URLとパスワードのセットで共有してください。パスワードを変えれば即座にアクセス停止できます。

### ローカル開発はそのまま動く

`npm start` で従来通り `http://localhost:4173` で動作します。`.env` ファイルのAPIキーが使われます。

## トラブルシュート

### 「Authentication error」が出る

→ `ANTHROPIC_API_KEY` が Vercel 環境変数に正しく設定されているか確認

### アルゴリズム情報が空っぽ

→ Vercel KV を追加して再デプロイ。または「今すぐ再確認」ボタンで手動更新

### バリエーション生成が timeout

→ Hobby プランは関数60秒上限。1トピックは48秒程度なので通常は収まりますが、コールドスタート時に超える可能性あり。Pro プラン（$20/月）にすると300秒に拡張可

### Cron が動いていない

→ `CRON_SECRET` 環境変数が設定されているか確認。Vercel の Logs → Functions で `/api/cron/refresh-algorithm` を検索

## URL とパスワードの控え

デプロイ後、以下を安全な場所にメモしておくと便利：

- 公開URL：`https://social-buzz-radar-______.vercel.app`
- パスワード：`______________`
- CRON_SECRET：`______________`
