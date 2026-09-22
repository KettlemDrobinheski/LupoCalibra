const githubPages = process.env.GITHUB_PAGES === 'true';

const nextConfig = githubPages
  ? { output: 'export', basePath: '/LupoCalibra', trailingSlash: true }
  : {};

export default nextConfig;
