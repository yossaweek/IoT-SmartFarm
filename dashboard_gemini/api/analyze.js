// Vercel Serverless Function
// Gemini API key is kept securely in Vercel Environment Variables.

export default async function handler(req, res) {
  // --------------------------------------------------
  // 1. Check HTTP method
  // --------------------------------------------------
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  // --------------------------------------------------
  // 2. Check Gemini API Key
  // --------------------------------------------------
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({
      error: "GEMINI_API_KEY is not configured in Vercel."
    });
  }

  try {
    // --------------------------------------------------
    // 3. Receive analysis data from frontend
    // --------------------------------------------------
    const input = req.body?.analysis;

    if (!input) {
      return res.status(400).json({
        error: "Missing analysis data"
      });
    }

    console.log("AI Analysis Input:", JSON.stringify(input, null, 2));

    // --------------------------------------------------
    // 4. Create prompt
    // --------------------------------------------------
    const prompt = `
You are an AI assistant for an IoT sensor monitoring dashboard.

Your task is to analyze the statistical results supplied by the system
and explain them clearly to a human operator.

IMPORTANT RULES:

- Use ONLY the information supplied in the sensor analysis data.
- Do NOT invent sensor readings.
- Do NOT invent timestamps.
- Do NOT invent anomalies.
- Do NOT invent forecast values.
- If a value is missing, explicitly say "ไม่มีข้อมูล".
- Explain what the statistical results mean.
- Distinguish clearly between observed results and recommendations.
- Recommendations should be practical for an IoT operator.
- Answer in Thai.
- Use concise Markdown.
- Do not repeat the entire raw JSON data.

The analysis data supplied by the system is:

${JSON.stringify(input, null, 2)}

Produce the answer using exactly these sections:

### 1. สรุปสถานการณ์
Explain the overall condition of the sensor data.

### 2. Trend
Explain the detected trend for each available parameter.

### 3. Anomaly
Explain whether abnormal values were detected.
Mention the parameter and relevant value when available.

### 4. Z-score
Explain the Z-score results and identify values that deserve attention.

### 5. Forecast
Explain the forecast results and the expected direction.
If forecast data is unavailable, say "ไม่มีข้อมูล Forecast".

### 6. Recommendation
Give practical recommendations for the operator based ONLY on the supplied data.

Do not create fake numerical values.
Do not add information that is not present in the supplied analysis.
`;

    // --------------------------------------------------
    // 5. Call Gemini API
    // --------------------------------------------------
    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent",
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey
        },

        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                {
                  text: prompt
                }
              ]
            }
          ],

          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 1200
          }
        })
      }
    );

    // --------------------------------------------------
    // 6. Read Gemini response
    // --------------------------------------------------
    const data = await response.json();

    if (!response.ok) {
      console.error("Gemini API error:", data);

      return res.status(response.status).json({
        error:
          data?.error?.message ||
          "Gemini API request failed"
      });
    }

    // --------------------------------------------------
    // 7. Extract generated text
    // --------------------------------------------------
    const text = data?.candidates?.[0]?.content?.parts
      ?.map(part => part.text || "")
      .join("\n")
      .trim();

    if (!text) {
      console.error(
        "Gemini returned unexpected response:",
        JSON.stringify(data, null, 2)
      );

      return res.status(502).json({
        error: "Gemini returned no text response"
      });
    }

    console.log("Gemini Response:", text);

    // --------------------------------------------------
    // 8. Return result to frontend
    // --------------------------------------------------
    return res.status(200).json({
      text: text,
      model: "gemini-3.8-flash"
    });

  } catch (error) {

    console.error("Server error:", error);

    return res.status(500).json({
      error:
        error?.message ||
        "Server error"
    });
  }
}

