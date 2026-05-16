const target = process.env.API_PROXY_TARGET || "http://localhost:3001";

module.exports = {
  "/api": {
    target,
    secure: false,
    changeOrigin: true,
  },
};
