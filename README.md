# silo

for Crafts のリサーチ管理アプリ。商談・インタビューの発話を記録し、ファクトにし、インサイトツリーで束ねる。

## スタック
Next.js 15 (App Router) / TypeScript / Tailwind v4 / shadcn/ui / Tiptap / dnd-kit / Supabase (Auth + Postgres + RLS) / Vercel

## セットアップ
1. `pnpm install`
2. `.env.local.example` を `.env.local` にコピーし、Supabase の URL と anon キーを入れる
3. Supabase の SQL Editor で `supabase/migrations/0001_init.sql` を実行
4. `pnpm seed`（service_role キーと admin メールを対話で入力。キーは保存されない）
5. `pnpm dev` → http://localhost:3000/login

## 秘密情報
`SUPABASE_SERVICE_ROLE_KEY` はコード・リポジトリ・`.env.local` に書かない。seed 実行時にだけ入力する。
ログインは Google のみ（Supabase の Authentication → Providers で Google を有効化）。入れるのは `member` テーブルにいる人だけ。
議事録（`research_file.transcript_enc`）は pgcrypto で暗号化され、鍵は Supabase Vault にある。

## Centou からの移行
```
SEED_EMAIL=<admin メール> SUPABASE_SERVICE_ROLE_KEY=<key> pnpm import:centou <data.json> [--dry-run]
```
`centou_file_id` → `research_file.ext_id` で重複スキップ。背景／概要は Tiptap JSON、本文は暗号化議事録、`### all > A > B` はインサイトツリー、箇条書きはファクト（発話行付き）になる。
