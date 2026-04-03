<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/7f49098e-de9f-4483-afba-d542d700e2a9

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in `.env` (copy from `.env.example`) to your Gemini API key:
   `cp .env.example .env`
3. Run the app:
   `npm run dev`

## Deployment (GitHub Pages)

This project is configured with a **GitHub Actions** workflow (`.github/workflows/deploy.yml`) to automatically deploy to GitHub Pages.

1. Go to your GitHub repository settings.
2. Navigate to **Pages** on the left sidebar.
3. Under **Build and deployment**, set the **Source** to **GitHub Actions**.
4. Push your code to the `main` or `master` branch. The action will automatically build and deploy your app.

*(Note: If you are not deploying to the root of a domain, you may need to update the `base` path in `vite.config.ts` to match your repository name: `base: "/your-repo-name/"`)*

## Project Configuration

- **`package.json`**: Contains all required dependencies including React 19, Vite, TailwindCSS 4, and standard UI libraries.
- **`.gitignore`**: Pre-configured to ignore `node_modules`, build output folders, IDE configurations (`.vscode`, `.idea`), and secret environment variables (`.env`). Please do not commit your real `.env` file to the repository!
