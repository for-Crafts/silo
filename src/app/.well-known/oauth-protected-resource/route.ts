import { getPublicOrigin, metadataCorsOptionsRequestHandler, protectedResourceHandler } from "mcp-handler";

// Claude はここを見て「どこでログインすればよいか」（Supabase の OAuth サーバー）を知る。
// resource は MCP サーバーの URL（/api/mcp）にそろえる。
export function GET(req: Request) {
  return protectedResourceHandler({
    authServerUrls: [`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1`],
    resourceUrl: `${getPublicOrigin(req)}/api/mcp`,
  })(req);
}
export const OPTIONS = metadataCorsOptionsRequestHandler();
