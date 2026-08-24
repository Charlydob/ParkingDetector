import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";
import path from "node:path";

const repositoryName = "ParkingDetector";
const isGitHubPages = process.env.GITHUB_ACTIONS === "true";

export default defineConfig({
  appType: "spa",
  server: {
    proxy: {
      "/api": {
        target: "http://127.0.0.1:3001",
        changeOrigin: true,
      },
    },
  },
  plugins: [
    react(),
    {
      name: "checkin-demo-route",
      configureServer(server) {
        server.middlewares.use(async (request, response, next) => {
          if (request.url === "/checkin-demo" || request.url === "/checkin-demo/") {
            const indexPath = path.resolve(server.config.root, "index.html");
            const html = await server.transformIndexHtml(
              request.url,
              readFileSync(indexPath, "utf8"),
            );

            response.statusCode = 200;
            response.setHeader("Content-Type", "text/html");
            response.end(html);
            return;
          }

          next();
        });
      },
    },
  ],
  base: isGitHubPages ? `/${repositoryName}/` : "/",
});
