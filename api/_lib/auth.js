// パスワード認証ミドルウェア
// 環境変数 BUZZ_RADAR_PASSWORD と一致するかチェック

export function requireAuth(request, response) {
  const expected = process.env.BUZZ_RADAR_PASSWORD;
  if (!expected) {
    // パスワード未設定なら認証スキップ（ローカル開発時）
    return true;
  }

  // ヘッダー or クエリパラメータから取得
  const provided =
    request.headers["x-buzz-auth"] ||
    request.headers["X-Buzz-Auth"] ||
    new URL(request.url, `http://${request.headers.host}`).searchParams.get("auth");

  if (provided !== expected) {
    response.status(401).json({ error: "認証が必要です。パスワードを設定してください。" });
    return false;
  }
  return true;
}

export function isAuthRequired() {
  return Boolean(process.env.BUZZ_RADAR_PASSWORD);
}
