import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // アイコン・エディタは使う部品だけを読み込む（初回 JS を軽く）
    optimizePackageImports: ["lucide-react", "@tiptap/react", "radix-ui"],
  },
};

export default nextConfig;
