# note / X / Instagram アルゴリズム分析

作成日: 2026-05-21

このMVPは「バズを保証する装置」ではなく、公開情報から推定できる配信面の評価軸に、リアルタイムの話題性を重ねて、投稿仮説を短時間で作るためのシステムです。自動投稿、相互フォロー、虚偽のエンゲージメント、規約回避は対象外です。

## X

2026年5月時点では、古い `twitter/the-algorithm` に加えて、xAI公式GitHubの `xai-org/x-algorithm` が「For You」フィードの中核を説明しています。READMEでは、In-NetworkのThunderとOut-of-NetworkのPhoenix Retrievalから候補を集め、PhoenixのGrok系Transformerで複数アクションの確率を出し、Weighted Scorerで最終スコアにする流れが示されています。

実務上の示唆:

- 単純な「いいね狙い」より、返信・リポスト・クリック・滞在・フォロー意向など複数アクションを同時に狙う。
- 候補生成に乗るには、既存フォロワーだけでなく、興味が近い人の反応やトピック文脈が重要。
- ブロック、ミュート、通報、興味なしを招く煽りは長期的に不利。
- 同一著者の連投だけで押し切るより、会話の質と多様性を作る。

このMVPでのXスコアは、鮮度、会話化しやすさ、ソース強度、新規性、複数ソース一致、発信者領域との一致を重み付けしています。

## Instagram

Instagramは単一のアルゴリズムではなく、Feed、Stories、Explore、Reelsなど面ごとにランキングが異なります。MetaのFeed Ranking System Cardでは、候補を集め、投稿情報・投稿者との関係・過去行動からアクション確率を予測し、それらをスコア化、誤情報などを降格、多様性ルールをかける流れが説明されています。Meta EngineeringのExplore記事では、候補検索、第一段階ランキング、第二段階ランキング、最終リランキングという多段推薦、Two Tower、継続的な再学習、クリック・いいね・see lessなどの価値モデルが説明されています。

実務上の示唆:

- Reelsは冒頭の理解速度、視聴維持、リプレイ、シェアされる構造が大事。
- Feedは保存・コメント・プロフィール遷移など、投稿後の行動確率を意識する。
- Explore/Reelsは非フォロワー配信の入口なので、オリジナル性と推薦適格性を落とさない。
- 低品質な転載、攻撃的・成人向け・誤情報リスクの高い表現は伸びる前に落とされやすい。

このMVPでのInstagramスコアは、映像化しやすさ、保存・シェア価値、鮮度、ソース強度、オリジナル化余地、発信者領域との一致を重み付けしています。

## note

noteは2026年2月12日に、読者ごとに記事をおすすめするAIレコメンドエンジンの刷新を発表しました。公式記事では、LLMで記事内容を理解し、カテゴリ・トピックへ分類し、読者の行動履歴から興味関心とマッチングする流れが説明されています。別記事では、投稿後ほぼリアルタイムでAIタグ付けを行い、カテゴリ分類、クリエイターごとのトピック関心度、急上昇・おすすめ・カテゴリページへの反映が説明されています。noteは一次情報、体験、オリジナル視点を重視し、AI生成文の貼り付けのような記事は優先度が下がると説明しています。

実務上の示唆:

- トレンド語を入れるだけでなく、自分の体験・検証・一次情報を中心に据える。
- タグは本文理解の補助として効くが、本文とズレたタグは除外される可能性がある。
- 検索流入とnote内回遊が大きいので、SNS用の短文よりも、後から検索される深掘りが向く。
- 急上昇トピックに自分の専門性が重なる瞬間を拾う。

このMVPでのnoteスコアは、深掘り可能性、検索され続ける価値、トピック一致、ソース強度、一次情報化余地、鮮度を重み付けしています。

## リアルタイム入力

Yahoo!リアルタイム検索のランキングAPIは公式ページ上で法人向けAPI提供と説明されています。このMVPは、契約済みAPIのURLとキーを環境変数で接続できるようにし、未契約時はGoogle Trends RSS、Yahoo!ニュースRSS、手入力トレンド、サンプルデータで動きます。

## 参照元

- X: https://github.com/xai-org/x-algorithm
- X Phoenix: https://github.com/xai-org/x-algorithm/blob/main/phoenix/README.md
- X 2023 Engineering Blog: https://blog.x.com/engineering/en_us/topics/open-source/2023/twitter-recommendation-algorithm
- Twitter legacy algorithm: https://github.com/twitter/the-algorithm
- Instagram Feed Ranking System Card: https://ai.meta.com/tools/system-cards/instagram-feed-ranking/
- Instagram Explore Engineering: https://engineering.fb.com/2023/08/09/ml-applications/scaling-instagram-explore-recommendations-system/
- Instagram Ranking Explained: https://about.instagram.com/blog/announcements/instagram-ranking-explained
- note レコメンド刷新: https://note.jp/n/nce2c203cc6fb
- note 舞台裏: https://note.jp/n/nf016d2c0bc2f
- note システム設計: https://note.jp/n/nce0a239e3c40
- Yahoo!リアルタイム検索API提供: https://promo-search.yahoo.co.jp/realtime/buzz/
