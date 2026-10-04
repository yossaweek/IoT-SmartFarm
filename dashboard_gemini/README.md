# IoT Dashboard + Gemini LLM

Architecture:

ESP32 -> Supabase -> Vercel Dashboard -> Statistical AI -> Gemini LLM Explanation

## 1. Create Gemini API key

Create a Gemini API key in Google AI Studio.

## 2. Vercel Environment Variable

In Vercel project:

Settings -> Environment Variables

Add:

GEMINI_API_KEY = YOUR_GEMINI_API_KEY

Do NOT put the Gemini key in `app.js` or `index.html`.

## 3. Deploy

Upload this project to the same Vercel project that serves the dashboard.

The `/api/analyze.js` serverless function calls Gemini securely.

## 4. Test

Open the dashboard. Statistical AI is calculated locally from Supabase data. Click:

"วิเคราะห์ด้วย Gemini"

Gemini receives only the statistical summary (current, average, Z-score, trend and forecast), not the full sensor history.
