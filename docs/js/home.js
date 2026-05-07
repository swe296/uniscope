const API_BASE = "https://uniscope-backend.onrender.com";

const grid = document.getElementById("collegeGrid");
const searchInput = document.getElementById("collegeSearch");
const loadMoreWrapper = document.getElementById("loadMoreWrapper");
const loadMoreBtn = document.getElementById("loadMoreBtn");

let colleges = [];
let activeColleges = [];
let visibleCount = 0;
const PAGE_SIZE = 60;

function renderBatch(list, count) {
  if (!list || list.length === 0) {
    grid.innerHTML = "<p style='text-align:center'>No colleges found.</p>";
    if (loadMoreWrapper) loadMoreWrapper.style.display = "none";
    return;
  }

  const items = list.slice(0, count);
  const cards = items.map(c => {
    const name = c.COLLEGE_NAME || "Unknown";
    const rank = c.RANKING_ID === null || c.RANKING_ID === undefined ? "-" : c.RANKING_ID;
    const id = c.COLLEGE_ID || "-";
    const city = c.CITY_NAME || "Unknown";
    const link = c.COLLEGE_LINK || "";

    return `
      <div class="glass-card">
        <h3>${name}</h3>
        <p class="rank">Rank #${rank}</p>
        <p class="details">College ID: ${id}</p>
        <p class="location">📍 ${city}</p>

        <div class="card-actions">
          <button onclick="saveCollege('${name.replace(/'/g, "\\'")}')">Save</button>
          <button onclick="openCollege('${link.replace(/'/g, "\\'")}')">View</button>
        </div>
      </div>
    `;
  });

  grid.innerHTML = cards.join("");

  if (loadMoreWrapper && loadMoreBtn) {
    if (count < list.length) {
      loadMoreWrapper.style.display = "flex";
      loadMoreBtn.textContent = `Load more (${count}/${list.length})`;
    } else {
      loadMoreWrapper.style.display = "none";
    }
  }
}

function displayColleges(list) {
  activeColleges = list || [];
  visibleCount = Math.min(PAGE_SIZE, activeColleges.length);
  renderBatch(activeColleges, visibleCount);
}

function loadMoreColleges() {
  visibleCount = Math.min(visibleCount + PAGE_SIZE, activeColleges.length);
  renderBatch(activeColleges, visibleCount);
}

async function loadColleges() {
  try {
    grid.innerHTML = "<p style='text-align:center'>Loading colleges...</p>";

    const res = await fetch(`${API_BASE}/colleges`);
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || "Failed to load colleges");
    }

    colleges = data;
    displayColleges(colleges);
  } catch (err) {
    console.error(err);
    grid.innerHTML = "<p style='text-align:center'>Failed to load colleges.</p>";
  }
}

function searchColleges() {
  const query = searchInput.value.toLowerCase().trim();

  if (!query) {
    displayColleges(colleges);
    return;
  }

  const filtered = colleges.filter(c =>
    (c.COLLEGE_NAME && c.COLLEGE_NAME.toLowerCase().includes(query)) ||
    (c.CITY_NAME && c.CITY_NAME.toLowerCase().includes(query))
  );

  displayColleges(filtered);
}

if (searchInput) {
  searchInput.addEventListener("input", searchColleges);
}

if (loadMoreBtn) {
  loadMoreBtn.addEventListener("click", loadMoreColleges);
}

async function saveCollege(name) {
  const email = localStorage.getItem("loggedUser");

  if (!email) {
    alert("Please login first");
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/saved`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        email,
        college_name: name,
        type: "India"
      })
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || "Save failed");
    }

    alert(data.message || `${name} saved successfully!`);
  } catch (err) {
    console.error(err);
    alert("Failed to save college");
  }
}

function openCollege(link) {
  const clean = String(link || "").trim();

  if (clean) {
    const url = clean.startsWith("http") ? clean : `https://${clean}`;
    window.open(url, "_blank");
    return;
  }

  alert("No website available for this college");
}

loadColleges();