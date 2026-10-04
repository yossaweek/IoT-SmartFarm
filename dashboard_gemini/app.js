// ============================================
// Supabase Configuration
// ============================================

const SUPABASE_URL =
  "https://yfsdlzoftdvthoencouc.supabase.co";

const SUPABASE_TABLE =
  "sensor_data";

// ใส่ Supabase Anon Key ของคุณตรงนี้
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlmc2Rsem9mdGR2dGhvZW5jb3VjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA5MjUwMDYsImV4cCI6MjEwNjUwMTAwNn0.JpkMJf3n_-RxpKYR4xLk-ZM91XY5ePNQF3xjHHUXnPg";


// ============================================
// Chart Configuration
// ============================================

const MAX_POINTS = 50;
const DEVICE_ID = "ESP32_01";

let temperatureChart;
let humidityChart;
let luxChart;


let latestSensorData = [];
let latestAIAnalysis = null;

// ============================================
// Statistical AI
// ============================================

function mean(values) {
  if (!values.length) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function standardDeviation(values) {
  if (values.length < 2) return 0;
  const avg = mean(values);
  return Math.sqrt(
    values.reduce((sum, value) => sum + Math.pow(value - avg, 2), 0) /
    values.length
  );
}

function linearRegression(values) {
  if (values.length < 2) return { slope: 0, intercept: values[0] || 0 };

  const n = values.length;
  let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;

  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += values[i];
    sumXY += i * values[i];
    sumXX += i * i;
  }

  const denominator = n * sumXX - sumX * sumX;
  if (denominator === 0) return { slope: 0, intercept: mean(values) };

  const slope = (n * sumXY - sumX * sumY) / denominator;
  const intercept = (sumY - slope * sumX) / n;

  return { slope, intercept };
}

function detectAnomaly(values) {
  if (values.length < 5) return { isAnomaly: false, zScore: 0 };

  const avg = mean(values);
  const sd = standardDeviation(values);
  if (sd === 0) return { isAnomaly: false, zScore: 0 };

  const latest = values[values.length - 1];
  const zScore = (latest - avg) / sd;

  return {
    isAnomaly: Math.abs(zScore) >= 2.0,
    zScore
  };
}

function getTrend(values) {
  if (values.length < 3) return { direction: "stable", slope: 0 };

  const regression = linearRegression(values);
  const avg = mean(values);
  const threshold = Math.max(Math.abs(avg) * 0.005, 0.001);

  if (regression.slope > threshold) return { direction: "increasing", slope: regression.slope };
  if (regression.slope < -threshold) return { direction: "decreasing", slope: regression.slope };
  return { direction: "stable", slope: regression.slope };
}

function forecast(values, points = 5) {
  if (values.length < 3) return [];
  const regression = linearRegression(values);
  const result = [];

  for (let i = 1; i <= points; i++) {
    const x = values.length - 1 + i;
    result.push(regression.intercept + regression.slope * x);
  }
  return result;
}

function analyzeParameter(name, values, unit) {
  if (!values.length) return null;
  const anomaly = detectAnomaly(values);
  const trend = getTrend(values);
  return {
    name,
    unit,
    current: values[values.length - 1],
    average: mean(values),
    zScore: anomaly.zScore,
    anomaly: anomaly.isAnomaly,
    trend: trend.direction,
    slope: trend.slope,
    forecast: forecast(values, 5)
  };
}

function buildStatisticalAI(data) {
  const temperatures = data.map(r => Number(r.air_temp)).filter(Number.isFinite);
  const humidities = data.map(r => Number(r.air_humid)).filter(Number.isFinite);
  const luxValues = data.map(r => Number(r.lux)).filter(Number.isFinite);

  return {
    temperature: analyzeParameter("อุณหภูมิ", temperatures, "°C"),
    humidity: analyzeParameter("ความชื้น", humidities, "%"),
    lux: analyzeParameter("แสง", luxValues, "lux")
  };
}

function thaiTrend(value) {
  if (value === "increasing") return "เพิ่มขึ้น";
  if (value === "decreasing") return "ลดลง";
  return "คงที่";
}

function updateStatisticalUI(analysis) {
  latestAIAnalysis = analysis;

  const items = [
    ["temperature", "tempTrend", "tempZScore"],
    ["humidity", "humidTrend", "humidZScore"],
    ["lux", "luxTrend", "luxZScore"]
  ];

  items.forEach(([key, trendId, zId]) => {
    const item = analysis[key];
    if (!item) return;

    document.getElementById(trendId).textContent =
      thaiTrend(item.trend) + (item.anomaly ? " / Anomaly" : "");

    document.getElementById(zId).textContent =
      item.zScore.toFixed(2);
  });

  const forecastLines = Object.values(analysis)
    .filter(Boolean)
    .map(item => {
      const last = item.forecast[item.forecast.length - 1];
      return `${item.name}: ${thaiTrend(item.trend)} → ${last === undefined ? "--" : last.toFixed(item.name === "แสง" ? 0 : 1) + " " + item.unit}`;
    });

  document.getElementById("aiForecast").textContent =
    forecastLines.join(" | ");
}

async function analyzeWithGemini() {
  const button = document.getElementById("aiAnalyzeButton");
  const result = document.getElementById("geminiResult");
  const errorBox = document.getElementById("aiError");

  errorBox.textContent = "";

  if (!latestAIAnalysis) {
    result.textContent = "ยังไม่มีข้อมูล Sensor สำหรับวิเคราะห์";
    return;
  }

  button.disabled = true;
  button.textContent = "Gemini กำลังวิเคราะห์...";
  result.textContent = "กำลังส่งผลการวิเคราะห์ไปยัง Gemini...";

  try {
    const response = await fetch("/api/analyze", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        analysis: latestAIAnalysis
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || `HTTP ${response.status}`);
    }

    result.textContent = data.text;
  } catch (error) {
    console.error("Gemini error:", error);
    result.textContent = "ไม่สามารถรับคำตอบจาก Gemini ได้";
    errorBox.textContent = error.message;
  } finally {
    button.disabled = false;
    button.textContent = "วิเคราะห์ด้วย Gemini";
  }
}


// ============================================
// Create Chart
// ============================================

function createChart(canvasId, label, unit) {

  const ctx = document
    .getElementById(canvasId)
    .getContext("2d");

  return new Chart(ctx, {

    type: "line",

    data: {

      labels: [],

      datasets: [{
        label: label,

        data: [],

        borderWidth: 2,

        pointRadius: 2,

        tension: 0.3,

        fill: false
      }]
    },

    options: {

      responsive: true,

      maintainAspectRatio: false,

      interaction: {
        intersect: false,
        mode: "index"
      },

      scales: {

        x: {
          title: {
            display: true,
            text: "Time"
          }
        },

        y: {
          title: {
            display: true,
            text: unit
          }
        }
      }
    }
  });
}


// ============================================
// Load Data From Supabase
// ============================================

async function loadData() {

  try {

    const url =
      `${SUPABASE_URL}/rest/v1/${SUPABASE_TABLE}` +
      `?select=id,created_at,air_temp,air_humid,lux` +
      `&order=created_at.desc` +
      `&limit=${MAX_POINTS}`;


    const response = await fetch(url, {

      headers: {
        "apikey": SUPABASE_ANON_KEY,
        "Authorization":
          `Bearer ${SUPABASE_ANON_KEY}`
      }

    });


    if (!response.ok) {

      throw new Error(
        `HTTP ${response.status}`
      );

    }


    let data = await response.json();


    // Supabase returns newest first.
    // Reverse so graph runs from old -> new.

    data.reverse();

    latestSensorData = data;


    if (data.length === 0) {

      console.log("No data found.");

      return;

    }


    // ========================================
    // Current values
    // ========================================

    const latest =
      data[data.length - 1];


    document.getElementById("airTemp")
      .textContent =
      Number(latest.air_temp).toFixed(1);


    document.getElementById("airHumid")
      .textContent =
      Number(latest.air_humid).toFixed(1);


    document.getElementById("lux")
      .textContent =
      Number(latest.lux).toFixed(0);


    // ========================================
    // Labels
    // ========================================

    const labels = data.map(row => {

      const date =
        new Date(row.created_at);

      return date.toLocaleTimeString(
        [],
        {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit"
        }
      );

    });


    // ========================================
    // Temperature
    // ========================================

    temperatureChart.data.labels =
      labels;

    temperatureChart.data.datasets[0].data =
      data.map(row =>
        Number(row.air_temp)
      );

    temperatureChart.update();


    // ========================================
    // Humidity
    // ========================================

    humidityChart.data.labels =
      labels;

    humidityChart.data.datasets[0].data =
      data.map(row =>
        Number(row.air_humid)
      );

    humidityChart.update();


    // ========================================
    // Lux
    // ========================================

    luxChart.data.labels =
      labels;

    luxChart.data.datasets[0].data =
      data.map(row =>
        Number(row.lux)
      );

    luxChart.update();


    // ========================================
    // Statistical AI Analysis
    // ========================================

    const statisticalAI = buildStatisticalAI(data);
    updateStatisticalUI(statisticalAI);


    // ========================================
    // Last update
    // ========================================

    const updateTime =
      new Date(latest.created_at);

    document.getElementById("lastUpdate")
      .textContent =
      "Last update: " +
      updateTime.toLocaleString();


  } catch (error) {

    console.error(
      "Supabase error:",
      error
    );

  }
}


// ============================================
// Initialize Dashboard
// ============================================

temperatureChart =
  createChart(
    "temperatureChart",
    "Air Temperature",
    "°C"
  );


humidityChart =
  createChart(
    "humidityChart",
    "Air Humidity",
    "%"
  );


luxChart =
  createChart(
    "luxChart",
    "Light Intensity",
    "lux"
  );


// Load immediately
loadData();

loadControl();


setInterval(
  loadData,
  5000
);


setInterval(
  loadControl,
  5000
);

async function toggleLED(led) {

  const button =
    document.getElementById(
      `led${led}Button`
    );


  button.disabled = true;


  try {

    // อ่านสถานะปัจจุบัน

    const url =
      `${SUPABASE_URL}/rest/v1/device_control` +
      `?select=relay1,relay2` +
      `&device_id=eq.${DEVICE_ID}`;


    const response =
      await fetch(url, {

        headers: {

          "apikey":
            SUPABASE_ANON_KEY,

          "Authorization":
            `Bearer ${SUPABASE_ANON_KEY}`
        }

      });


    const data =
      await response.json();


    if (data.length === 0) {

      throw new Error(
        "Device not found"
      );

    }


    const current =
      data[0];


    let newState;


    if (led === 1) {

      newState =
        !current.relay1;

    }
    else {

      newState =
        !current.relay2;

    }


    // -------------------------
    // Update Supabase
    // -------------------------

    const updateUrl =
      `${SUPABASE_URL}/rest/v1/device_control` +
      `?device_id=eq.${DEVICE_ID}`;


    const updateData =
      led === 1
        ? {
            relay1: newState,
            updated_at:
              new Date().toISOString()
          }
        : {
            relay2: newState,
            updated_at:
              new Date().toISOString()
          };


    const updateResponse =
      await fetch(updateUrl, {

        method: "PATCH",

        headers: {

          "Content-Type":
            "application/json",

          "apikey":
            SUPABASE_ANON_KEY,

          "Authorization":
            `Bearer ${SUPABASE_ANON_KEY}`,

          "Prefer":
            "return=representation"

        },

        body:
          JSON.stringify(updateData)

      });


    if (!updateResponse.ok) {

      throw new Error(
        `Update failed: ${updateResponse.status}`
      );

    }


    // Update button

    updateLEDButton(
      led,
      newState
    );


  } catch (error) {

    console.error(
      "LED control error:",
      error
    );

    alert(
      "ไม่สามารถสั่งงาน LED ได้"
    );

  }


  button.disabled = false;
}

function updateLEDButton(
  led,
  state
) {

  const button =
    document.getElementById(
      `led${led}Button`
    );

  const status =
    document.getElementById(
      `led${led}Status`
    );


  if (state) {

    button.textContent = "ON";

    button.classList.remove("off");

    button.classList.add("on");

    status.textContent = "ON";

  }
  else {

    button.textContent = "OFF";

    button.classList.remove("on");

    button.classList.add("off");

    status.textContent = "OFF";

  }
}

async function loadControl() {

  try {

    const url =
      `${SUPABASE_URL}/rest/v1/device_control` +
      `?select=relay1,relay2` +
      `&device_id=eq.${DEVICE_ID}`;


    const response = await fetch(url, {

      headers: {

        "apikey": SUPABASE_ANON_KEY,

        "Authorization":
          `Bearer ${SUPABASE_ANON_KEY}`
      }

    });


    if (!response.ok) {

      throw new Error(
        `HTTP ${response.status}`
      );

    }


    const data =
      await response.json();


    if (data.length === 0) {

      console.log(
        "Device control not found"
      );

      return;
    }


    const control =
      data[0];


    updateLEDButton(
      1,
      control.relay1
    );


    updateLEDButton(
      2,
      control.relay2
    );


  } catch (error) {

    console.error(
      "Control error:",
      error
    );

  }
}