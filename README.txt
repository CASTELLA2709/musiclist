# Music Memory

画像なしで動作する音楽記録アプリです。曲・アーティスト・プレイリストはブラウザの `localStorage` に保存します。

## 起動方法
1. `index.html` をブラウザで開く
2. 「＋ 曲を登録」から曲を登録
3. データはブラウザの localStorage に保存されます

## YouTube連携について

プレイリストをYouTube側にも作成・同期し、「YouTube Musicで流す」からYouTube Musicの該当プレイリストを開けます。

### 事前設定
Google Cloud ConsoleでYouTube Data API v3を有効化し、OAuth 2.0 クライアントID（ウェブアプリ）を作成してください。

1. `script.js` の `GOOGLE_CLIENT_ID` を自分のOAuthクライアントIDに変更
2. OAuthクライアントの「承認済みのJavaScript生成元」に、このアプリを公開しているURLを登録
3. YouTube連携ボタンを押してGoogleアカウントを認証
4. プレイリストを作成するとYouTube側にも非公開プレイリストを作成
5. アプリから曲を追加・削除するとYouTube側にも反映
6. 「YouTube Musicで流す」を押すと該当プレイリストを開く

### 曲とYouTube動画の紐付け
曲登録画面の「音楽リンク」にYouTube動画URLを登録してください。

例:
`https://www.youtube.com/watch?v=XXXXXXXXXXX`

YouTube動画IDを取得できた曲だけ、YouTube側のプレイリストへ追加されます。
SpotifyなどのURLしか登録されていない曲は、アプリ内プレイリストには入りますが、YouTube側には自動追加されません。

## 注意
- YouTube連携にはGoogleアカウントのOAuth認証が必要です。
- YouTube側のプレイリストは初期状態では非公開です。
- Google OAuthのアクセストークンをブラウザのlocalStorageに保存しています。公開運用する場合は、セキュリティ要件に応じて保存方法を見直してください。
- YouTube Music側の再生操作をアプリから直接制御するのではなく、該当プレイリストを開く方式です。

## 主な機能
- 曲の登録・編集・削除
- 曲名・アーティスト名・作品名検索
- 年代・ジャンル・季節・タグ絞り込み
- 曲名・アーティスト名・年代・登録日で並び替え
- メモ・音楽URL
- プレイリスト作成・編集・削除
- プレイリストへの曲追加・削除
- YouTubeプレイリスト同期
