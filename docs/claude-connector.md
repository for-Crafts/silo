# Claude と silo の連携（MCP コネクタ）

silo を Claude（claude.ai／デスクトップ／スマホ）から使えるようにする仕組みと、初回の設定手順。

## できること

| Claude でやること | 使うツール | silo 側の結果 |
|---|---|---|
| リサーチ・ファクト・インサイト・ドキュメントを探す／読む | `search_silo` `list_research` `get_research` `get_insight_tree` `get_insight` `list_documents` `get_document` | なし（読むだけ）。結果には引用用の URL が付く |
| リサーチからファクトを抽出 | `get_research`（議事録込み）→ `propose_facts` | リサーチ詳細の右側に「AI 提案」として出る。人が採用／却下 |
| ファクトをテーマに束ねる | `get_insight_tree` → `propose_insights` | インサイト画面の左上に「AI 提案」として出る。採用でツリーに入り、ファクトも移る |
| リサーチをもとにドキュメントを書く | 質問で目的・読み手・形式を確認 → 検索 → `create_document` | アクションに「Claude が作成」付きのドキュメントができる（引用元つき） |

- Claude は **ログインした本人の権限** で動く（admin・editor は読み書き、viewer は読むだけ）。service_role キーは使わない。
- 議事録全文（暗号化保存）も、本人が silo で読める範囲で Claude が読める。

## 仕組み

```
Claude ──(MCP / HTTPS)──▶ https://<silo>/api/mcp ──(本人のトークンで)──▶ Supabase（RLS）
   │                              ▲
   └─ 初回だけ OAuth ──▶ Supabase OAuth 2.1 サーバー ──▶ silo の同意画面 /oauth/consent（Google ログイン）
```

- `/.well-known/oauth-protected-resource` … Claude に「Supabase の OAuth サーバーでログインして」と伝える
- `/oauth/consent` … 接続を許可する画面（silo に Google でログインした状態で表示）
- `src/lib/mcp/tools.ts` … ツールの中身と、Claude への使い方の指示（instructions）

## 初回の設定（管理者が 1 回だけ）

1. **DB を更新する**：Supabase の SQL Editor で `supabase/migrations/0006_ai_ready.sql` を実行
2. **Supabase の OAuth サーバーを有効にする**：Authentication → OAuth Server
   - Enable OAuth server：オン
   - Authorization path：`/oauth/consent`
   - Allow dynamic client registration：オン（Claude が自動でクライアント登録するため）
3. **Site URL を確認する**：Authentication → URL Configuration の Site URL が、ふだん使う silo の URL（例 `https://sales-silo.vercel.app`）になっているか。同意画面は「Site URL + /oauth/consent」で開く
4. **Claude にコネクタを追加する**
   - 個人：claude.ai → 設定 → コネクタ → カスタムコネクタを追加 → URL に `https://sales-silo.vercel.app/api/mcp`
   - チーム（Team／Enterprise）：組織のオーナーが組織のコネクタとして追加すると、メンバーは「接続」を押すだけ
5. 「接続」を押す → silo に Google ログイン → 同意画面で「許可して接続」

## 使い方の例（Claude のチャットで）

- 「silo の深津さんのリサーチからファクトを抽出して提案して」
- 「『工場探索に時間がかかる』テーマの根拠を silo から引用してまとめて」
- 「silo のリサーチをもとに、小売向けの提案書を作って silo に保存して」→ Claude が先に目的・読み手・形式などを質問してから書く
