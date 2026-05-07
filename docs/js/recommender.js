let selectedCourse = "Engineering";
let selectedLocation = "India";
let cutoffChart;

const cutoffRange = document.getElementById("cutoffRange");
const budgetRange = document.getElementById("budgetRange");
const cutoffVal = document.getElementById("cutoffVal");
const budgetVal = document.getElementById("budgetVal");
const cards = document.getElementById("cards");

if (cutoffRange && cutoffVal) {
  cutoffVal.innerText = cutoffRange.value;
  cutoffRange.oninput = () => {
    cutoffVal.innerText = cutoffRange.value;
  };
}

if (budgetRange && budgetVal) {
  budgetVal.innerText = Number(budgetRange.value).toLocaleString("en-IN");
  budgetRange.oninput = () => {
    budgetVal.innerText = Number(budgetRange.value).toLocaleString("en-IN");
  };
}

function selectCourse(val, el) {
  selectedCourse = val;
  document.querySelectorAll(".step:nth-child(1) .option").forEach(o => o.classList.remove("active"));
  if (el) el.classList.add("active");
}

function selectLocation(val, el) {
  selectedLocation = val;
  document.querySelectorAll(".step:nth-child(2) .option").forEach(o => o.classList.remove("active"));
  if (el) el.classList.add("active");
}

function calculateIndiaScore(studentCutoff, college) {
  const collegeCutoff = Number(college.CUTOFF_MARK || 0);
  const rank = Number(college.RANKING_ID || 9999);
  const fee = Number(college.FEE || 0);

  let score = 0;
  if (studentCutoff >= collegeCutoff) score += 50;
  score += Math.max(0, 300 - rank);
  if (fee > 0) score += 20;

  return score;
}

function calculateAbroadScore(college) {
  const rank = Number(college.RANKING_ID || 9999);
  return Math.max(0, 500 - rank);
}

function courseNote() {
  return `<p class="course-note">Current results are filtered by location, cutoff and budget. Course-specific filtering needs course data in the database.</p>`;
}

async function recommend() {
  const cut = Number(cutoffRange.value);
  const bud = Number(budgetRange.value);

  if (!cards) return;

  cards.innerHTML = "<p>Loading recommendations...</p>";

  try {
    let results = [];

    if (selectedLocation === "India") {
      const res = await fetch(
        `http://localhost:5000/recommendations?cutoff=${cut}&budget=${bud}&location=`
      );

      const data = await res.json();

      if (!res.ok) throw new Error(data.error || "Failed to load recommendations");
      if (!Array.isArray(data)) throw new Error("Invalid response from server");

      results = data
        .map(c => ({
          ...c,
          MATCH_SCORE: calculateIndiaScore(cut, c)
        }))
        .sort((a, b) => b.MATCH_SCORE - a.MATCH_SCORE)
        .slice(0, 12);

      if (!results.length) {
        cards.innerHTML = "<p>No colleges with complete cutoff and fee data match your profile.</p>";
        return;
      }

      let html = courseNote();
      results.forEach(c => {
        html += `
          <div class="glass-card">
            <h3>${c.COLLEGE_NAME || "Unknown College"}</h3>
            <p>Preferred Stream: ${selectedCourse}</p>
            <p>Rank #${c.RANKING_ID ?? "N/A"}</p>
            <p>Required Cutoff: ${c.CUTOFF_MARK}</p>
            <p>Fee: ₹${Number(c.FEE).toLocaleString("en-IN")}</p>
            <p>Location: ${c.CITY_NAME || "Unknown"}</p>
            <p class="score">Match Score: ${Math.round(c.MATCH_SCORE)}</p>
            <button class="primary-btn" type="button" onclick="showCutoffTrend(${c.COLLEGE_ID}, ${cut})">View Cutoff Trend</button>
          </div>
        `;
      });

      cards.innerHTML = html;
      return;
    }

    const abroadRes = await fetch("http://localhost:5000/abroad");
    const abroadData = await abroadRes.json();

    if (!abroadRes.ok) throw new Error(abroadData.error || "Failed to load abroad colleges");
    if (!Array.isArray(abroadData)) throw new Error("Invalid abroad response from server");

    results = abroadData
      .filter(c => c.RANKING_ID != null)
      .map(c => ({
        ...c,
        MATCH_SCORE: calculateAbroadScore(c)
      }))
      .sort((a, b) => b.MATCH_SCORE - a.MATCH_SCORE)
      .slice(0, 12);

    if (!results.length) {
      cards.innerHTML = "<p>No abroad colleges found right now.</p>";
      return;
    }

    let html = courseNote();
    results.forEach(c => {
      html += `
        <div class="glass-card">
          <h3>${c.COLLEGE_NAME || "Unknown College"}</h3>
          <p>Preferred Stream: ${selectedCourse}</p>
          <p>Rank #${c.RANKING_ID}</p>
          <p>Country: ${c.COUNTRY || "Unknown"}</p>
          <p>City: ${c.CITY_NAME || "Unknown"}</p>
          <p class="score">Global Match Score: ${Math.round(c.MATCH_SCORE)}</p>
          ${c.COLLEGE_LINK ? `<p><a class="college-link" href="${c.COLLEGE_LINK}" target="_blank" rel="noopener noreferrer">Visit Website</a></p>` : ""}
        </div>
      `;
    });

    cards.innerHTML = html;
  } catch (err) {
    console.error("Recommendation error:", err);
    cards.innerHTML = `<p>Failed to load recommendations.</p><p>${err.message}</p>`;
  }
}

async function showCutoffTrend(collegeId, studentCutoff) {
  try {
    const section = document.getElementById("cutoffSection");
    if (section) section.style.display = "block";

    await loadCutoffChart(collegeId, studentCutoff);

    if (section) {
      section.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  } catch (err) {
    console.error("Cutoff chart error:", err);
  }
}

async function loadCutoffChart(collegeId, studentCutoff) {
  try {
    const res = await fetch(`http://localhost:5000/cutoff-trend?collegeId=${collegeId}`);
    const data = await res.json();

    if (!res.ok) throw new Error(data.error || "Failed to load cutoff trend");
    if (!Array.isArray(data) || !data.length) {
      alert("No cutoff data found for this college");
      return;
    }

    const labels = data.map(d => String(d.YEAR));
    const values = data.map(d => Number(d.CUTOFF_MARK));

    labels.push("You");
    values.push(Number(studentCutoff));

    const ctx = document.getElementById("cutoffChart");
    if (!ctx) return;

    if (cutoffChart) cutoffChart.destroy();

    cutoffChart = new Chart(ctx, {
      type: "line",
      data: {
        labels,
        datasets: [{
          label: "Cutoff Comparison",
          data: values,
          borderColor: "#38bdf8",
          backgroundColor: "rgba(56,189,248,0.15)",
          fill: true,
          tension: 0.3
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: {
            labels: { color: "#fff" }
          }
        },
        scales: {
          x: {
            ticks: { color: "#fff" },
            grid: { color: "rgba(255,255,255,0.1)" }
          },
          y: {
            ticks: { color: "#fff" },
            grid: { color: "rgba(255,255,255,0.1)" }
          }
        }
      }
    });
  } catch (err) {
    console.error("Failed to load cutoff chart", err);
  }
}