export async function verifyAdminLogin(
  token: string,
  fetcher: typeof fetch = fetch
): Promise<void> {
  const response = await fetcher("/api/admin/event", {
    headers: { Authorization: `Bearer ${token}` }, cache: "no-store"
  });
  if (response.ok) return;
  if (response.status === 403) {
    throw new Error("ログインしたアカウントにイベントの管理権限がありません。既定の出題者アカウントでログインしてください。");
  }
  if (response.status === 401) throw new Error("ログイン情報を確認できませんでした。もう一度ログインしてください。");
  throw new Error("管理画面の準備を確認できませんでした。DB設定と接続を確認してください。");
}
