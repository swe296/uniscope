const API_BASE = "https://uniscope-backend.onrender.com";

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
  const collegeCutoff = Number(college.CUTOFF_MARK || college.CUTOFF || 0);
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
  return `<p class="course-note">Filtered by cutoff, budget & location.</p>`;
}

async function recommend() {
  const cut = Number(cutoffRange.value);
  const bud = Number(budgetRange.value);

  if (!cards) return;

  cards.innerHTML = "<p>Loading recommendations...</p>";

  try {
    let results = [];

    // ---------- INDIA ----------
    if (selectedLocation === "India") {
      const res = await fetch(
        `${API_BASE}/recommendations?cutoff=${cut}&budget=${bud}&location=`
      );

      const data = await res.json();

      if (!res.ok) throw new Error(data.error || "Failed to load recommendations");

      results = data
        .map(c => ({
          ...c,
          MATCH_SCORE: calculateIndiaScore(cut, c)
        }))
        .sort((a, b) => b.MATCH_SCORE - a.MATCH_SCORE)
        .slice(0, 12);

      if (!results.length) {
        cards.innerHTML = "<p>No matching colleges found.</p>";
        return;
      }

      let html = courseNote();

      results.forEach(c => {
        html += `
          <div class="glass-card">
            <h3>${c.COLLEGE_NAME}</h3>
            <p>Rank #${c.RANKING_ID ?? "N/A"}</p>
            <p>Cutoff: ${c.CUTOFF_MARK || c.CUTOFF}</p>
            <p>Fee: ₹${Number(c.FEE || 0).toLocaleString("en-IN")}</p>
            <p>Location: ${c.CITY_NAME || "Unknown"}</p>
            <p class="score">Score: ${Math.round(c.MATCH_SCORE)}</p>
            <button onclick="showCutoffTrend(${c.COLLEGE_ID}, ${cut})">
              View Trend
            </button>
          </div>
        `;
      });

      cards.innerHTML = html;
      return;
    }

    // ---------- ABROAD ----------
    const abroadRes = await fetch(`${API_BASE}/abroad`);
    const abroadData = await abroadRes.json();

    if (!abroadRes.ok) throw new Error(abroadData.error || "Failed to load abroad");

    results = abroadData
      .map(c => ({
        ...c,
        MATCH_SCORE: calculateAbroadScore(c)
      }))
      .sort((a, b) => b.MATCH_SCORE - a.MATCH_SCORE)
      .slice(0, 12);

    let html = courseNote();

    results.forEach(c => {
      html += `
        <div class="glass-card">
          <h3>${c.COLLEGE_NAME}</h3>
          <p>Rank #${c.RANKING_ID}</p>
          <p>${c.COUNTRY}</p>
          <p>${c.CITY_NAME}</p>
          <p class="score">${Math.round(c.MATCH_SCORE)}</p>
        </div>
      `;
    });

    cards.innerHTML = html;

  } catch (err) {
    console.error(err);
    cards.innerHTML = `<p>Failed to load recommendations</p>`;
  }
}

async function showCutoffTrend(collegeId, studentCutoff) {
  const section = document.getElementById("cutoffSection");
  if (section) section.style.display = "block";

  await loadCutoffChart(collegeId, studentCutoff);

  if (section) section.scrollIntoView({ behavior: "smooth" });
}

async function loadCutoffChart(collegeId, studentCutoff) {
  try {
    const res = await fetch(`${API_BASE}/cutoff-trend?collegeId=${collegeId}`);
    const data = await res.json();

    if (!data.length) {
      alert("No cutoff data");
      return;
    }

    const labels = data.map(d => d.YEAR);
    const values = data.map(d => d.CUTOFF_MARK);

    labels.push("You");
    values.push(studentCutoff);

    const ctx = document.getElementById("cutoffChart");

    if (cutoffChart) cutoffChart.destroy();

    cutoffChart = new Chart(ctx, {
      type: "line",
      data: {
        labels,
        datasets: [{
          data: values,
          borderColor: "#38bdf8",
          fill: true
        }]
      }
    });

  } catch (err) {
    console.error(err);
  }
}