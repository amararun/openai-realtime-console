const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function(app) {
  app.use(
    '/api',
    createProxyMiddleware({
      target: 'https://azure-aws-mysql-dw.tigzig.com',
      changeOrigin: true,
      pathRewrite: {
        '^/api': '', // remove /api from the URL
      },
    })
  );
};