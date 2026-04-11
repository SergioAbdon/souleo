import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Desabilitar Turbopack (causando travamento)
  turbopack: undefined,
};

export default nextConfig;
