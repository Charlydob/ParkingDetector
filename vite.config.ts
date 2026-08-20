import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const repositoryName = "ParkingDetector";
const isGitHubPages = process.env.GITHUB_ACTIONS === "true";

export default defineConfig({
  plugins: [react()],
  base: isGitHubPages ? `/${repositoryName}/` : "/",
});
