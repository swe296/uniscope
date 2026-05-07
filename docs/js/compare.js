const API_BASE = "https://uniscope-backend.onrender.com";

document.addEventListener("DOMContentLoaded", async () => {
  const saved = JSON.parse(localStorage.getItem("compareColleges"));

  if (!saved || saved.length !== 2) {
    alert("No colleges selected for comparison");
    return;
  }

  try {
    const [indiaRes, abroadRes] = await Promise.all([
      fetch(`${API_BASE}/colleges`),
      fetch(`${API_BASE}/abroad`)
    ]);

    const india = await indiaRes.json();
    const abroad = await abroadRes.json();
    const allColleges = [...india, ...abroad];

    const c1 = allColleges.find(c => c.COLLEGE_NAME === saved[0]);
    const c2 = allColleges.find(c => c.COLLEGE_NAME === saved[1]);

    if (!c1 || !c2) {
      alert("Selected colleges not found");
      return;
    }

    const [data1, data2] = await Promise.all([
      fetch(`${API_BASE}/compare?id=${c1.COLLEGE_ID}`).then(r => r.json()),
      fetch(`${API_BASE}/compare?id=${c2.COLLEGE_ID}`).then(r => r.json())
    ]);

    fixData(data1);
    fixData(data2);
    renderComparison(data1, data2);
  } catch (err) {
    console.error("Compare failed", err);
    alert("Failed to load comparison data");
  }
});

const locationOverrides = {
  "massachusetts institute of technology": "Cambridge, Massachusetts, USA",
  "mit": "Cambridge, Massachusetts, USA",
  "university of oxford": "Oxford, United Kingdom",
  "oxford university": "Oxford, United Kingdom",
  "harvard university": "Cambridge, Massachusetts, USA",
  "stanford university": "Stanford, California, USA",
  "indian institute of science": "Bengaluru, India",
  "indian institute of technology madras": "Chennai, India"
};

function findLocationOverride(collegeName) {
  const name = String(collegeName || "").trim().toLowerCase();
  if (!name) return null;

  if (locationOverrides[name]) return locationOverrides[name];

  for (const key of Object.keys(locationOverrides)) {
    if (name.includes(key) || key.includes(name)) {
      return locationOverrides[key];
    }
  }

  return null;
}

function fixData(c) {
  const rank = Number(c.RANKING_ID || 100);

  if (!c.CUTOFF || c.CUTOFF === 0) {
    c.CUTOFF = Math.max(120, 200 - rank * 2);
  }

  if (!c.FEE || c.FEE === 0) {
    if (c.COUNTRY && String(c.COUNTRY).toLowerCase() !== "india") {
      c.FEE = 2000000 + rank * 50000;
    } else {
      c.FEE = 200000 + rank * 10000;
    }
  }

  if (!c.AVG_SALARY || c.AVG_SALARY === 0) {
    if (c.COUNTRY && String(c.COUNTRY).toLowerCase() !== "india") {
      c.AVG_SALARY = Math.max(1200000, 3000000 - rank * 50000);
    } else {
      c.AVG_SALARY = Math.max(600000, 2000000 - rank * 30000);
    }
  }

  const overrideLocation = findLocationOverride(c.COLLEGE_NAME);

  if (!c.CITY_NAME || String(c.CITY_NAME).trim().toLowerCase() === "unknown") {
    if (overrideLocation) {
      c.CITY_NAME = overrideLocation;
    } else if (c.CITY) {
      c.CITY_NAME = c.CITY;
    } else if (c.LOCATION) {
      c.CITY_NAME = c.LOCATION;
    } else if (c.COUNTRY) {
      c.CITY_NAME = c.COUNTRY;
    }
  }
}

function formatMoney(value) {
  return `₹${Number(value || 0).toLocaleString("en-IN")}`;
}

function betterRankClass(a, b) {
  return Number(a) < Number(b) ? "better" : "";
}

function betterPackageClass(a, b) {
  return Number(a) > Number(b) ? "better" : "";
}

function betterFeeClass(a, b) {
  return Number(a) < Number(b) ? "better" : "";
}

function betterCutoffClass(a, b) {
  return Number(a) < Number(b) ? "better" : "";
}

function renderCard(targetId, current, other, side) {
  document.getElementById(targetId).innerHTML = `
    <h2>${current.COLLEGE_NAME}</h2>

    <div class="compare-row">
      <span class="compare-label">Rank</span>
      <span class="compare-value ${betterRankClass(current.RANKING_ID, other.RANKING_ID)}">
        ${current.RANKING_ID}
      </span>
    </div>

    <div class="compare-row">
      <span class="compare-label">Location</span>
      <span class="compare-value">
        ${current.CITY_NAME || "—"}
      </span>
    </div>

    <div class="compare-row">
      <span class="compare-label">Cutoff</span>
      <span class="compare-value ${betterCutoffClass(current.CUTOFF, other.CUTOFF)}">
        ${current.CUTOFF}
      </span>
    </div>

    <div class="compare-row">
      <span class="compare-label">Annual Fee</span>
      <span class="compare-value ${betterFeeClass(current.FEE, other.FEE)}">
        ${formatMoney(current.FEE)}
      </span>
    </div>

    <div class="compare-row">
      <span class="compare-label">Average Package</span>
      <span class="compare-value ${betterPackageClass(current.AVG_SALARY, other.AVG_SALARY)}">
        ${formatMoney(current.AVG_SALARY)}
      </span>
    </div>

    <div class="compare-row">
      <span class="compare-label">Panel</span>
      <span class="compare-value">${side}</span>
    </div>
  `;
}

function renderComparison(c1, c2) {
  renderCard("c1", c1, c2, "College A");
  renderCard("c2", c2, c1, "College B");
}