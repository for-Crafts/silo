import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { registerSiloTools, SILO_INSTRUCTIONS } from "@/lib/mcp/tools";
import { verifySiloToken } from "@/lib/mcp/context";

/**
 * silo の MCP サーバー（Claude のカスタムコネクタから接続）。
 * 認証は Supabase の OAuth 2.1 サーバー（Google ログイン → 同意画面 /oauth/consent）で発行されたトークン。
 */
const handler = createMcpHandler((server) => registerSiloTools(server), {
  serverInfo: { name: "silo", version: "1.0.0" },
  instructions: SILO_INSTRUCTIONS,
});

const authHandler = withMcpAuth(handler, verifySiloToken, {
  required: true,
  resourceMetadataPath: "/.well-known/oauth-protected-resource",
});

export const maxDuration = 60;
export { authHandler as GET, authHandler as POST, authHandler as DELETE };
