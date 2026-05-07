document.addEventListener("DOMContentLoaded", function () {
  const grid = document.getElementById("abroadGrid");
  const searchInput = document.getElementById("abroadSearch");
  const loadMoreWrapper = document.getElementById("abroadLoadMoreWrapper");
  const loadMoreBtn = document.getElementById("abroadLoadMoreBtn");

  let universities = [];
  let activeUniversities = [];
  let visibleCount = 0;
  const PAGE_SIZE = 60;

  const cityOverrides = {
    "massachusetts institute of technology": "Cambridge",
    "mit": "Cambridge",
    "university of oxford": "Oxford",
    "oxford university": "Oxford",
    "harvard university": "Cambridge",
    "stanford university": "Stanford",
    "university of cambridge": "Cambridge",
    "imperial college london": "London",
    "university college london": "London",
    "london school of economics and political science": "London",
    "eth zurich": "Zürich",
    "epfl": "Lausanne",
    "national university of singapore": "Singapore",
    "nanyang technological university": "Singapore",
    "university of toronto": "Toronto",
    "university of british columbia": "Vancouver",
    "mcgill university": "Montreal",
    "columbia university": "New York",
    "yale university": "New Haven",
    "princeton university": "Princeton",
    "cornell university": "Ithaca",
    "carnegie mellon university": "Pittsburgh",
    "university of chicago": "Chicago",
    "california institute of technology": "Pasadena",
    "university of california, berkeley": "Berkeley",
    "ucla": "Los Angeles",
    "tsinghua university": "Beijing",
    "peking university": "Beijing",
    "university of melbourne": "Melbourne",
    "university of sydney": "Sydney",
    "unsw sydney": "Sydney",
    "monash university": "Melbourne",
    "university of tokyo": "Tokyo",
    "kyoto university": "Kyoto",
    "seoul national university": "Seoul",
    "kaist": "Daejeon",
    "university of edinburgh": "Edinburgh",
    "king's college london": "London",
    "the university of manchester": "Manchester"
  };

  function resolveCity(university) {
    const dbCity = String(university.CITY_NAME || "").trim();
    if (dbCity && dbCity.toLowerCase() !== "unknown") return dbCity;

    const rawName = String(university.COLLEGE_NAME || "").trim().toLowerCase();
    if (!rawName) {
      return String(university.COUNTRY || "").trim() || "City unavailable";
    }

    if (cityOverrides[rawName]) return cityOverrides[rawName];

    for (const key of Object.keys(cityOverrides)) {
      if (rawName.includes(key) || key.includes(rawName)) {
        return cityOverrides[key];
      }
    }

    const country = String(university.COUNTRY || "").trim();
    if (country) return country;

    return "City unavailable";
  }

  function renderBatch(list, count) {
    if (!list || list.length === 0) {
      grid.innerHTML = "<p style='text-align:center'>No universities found.</p>";
      if (loadMoreWrapper) loadMoreWrapper.style.display = "none";
      return;
    }

    const items = list.slice(0, count);
    const cards = items.map(u => {
      const name = u.COLLEGE_NAME || "Unknown";
      const rank =
        u.RANKING_ID === null || u.RANKING_ID === undefined ? "-" : u.RANKING_ID;
      const country = u.COUNTRY || "Unknown";
      const city = resolveCity(u);
      const website = u.COLLEGE_LINK || "";
      const safeName = String(name).replace(/'/g, "\\'");
      const safeWebsite = String(website || "").replace(/'/g, "\\'");

      return `
        <div class="glass-card">
          <h3>${name}</h3>
          <p class="rank">Rank #${rank}</p>
          <p class="details">Country: ${country}</p>
          <p class="details">City: ${city}</p>

          <div class="card-actions">
            <button onclick="saveUniversity('${safeName}')">Save</button>
            <button onclick="openUniversity('${safeWebsite}')">View</button>
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

  function displayUniversities(list) {
    activeUniversities = list || [];
    visibleCount = Math.min(PAGE_SIZE, activeUniversities.length);
    renderBatch(activeUniversities, visibleCount);
  }

  function loadMoreUniversities() {
    visibleCount = Math.min(visibleCount + PAGE_SIZE, activeUniversities.length);
    renderBatch(activeUniversities, visibleCount);
  }

  async function loadUniversities() {
    try {
      grid.innerHTML = "<p style='text-align:center'>Loading universities...</p>";

      const res = await fetch("http://localhost:5000/abroad");

      if (!res.ok) throw new Error("Server error");

      universities = await res.json();
      displayUniversities(universities);
    } catch (err) {
      console.error(err);
      grid.innerHTML = "<p style='text-align:center'>Failed to load universities.</p>";
    }
  }

  window.searchAbroad = function () {
    const query = searchInput.value.toLowerCase().trim();

    if (!query) {
      displayUniversities(universities);
      return;
    }

    const filtered = universities.filter(u =>
      (u.COLLEGE_NAME && u.COLLEGE_NAME.toLowerCase().includes(query)) ||
      (u.COUNTRY && u.COUNTRY.toLowerCase().includes(query)) ||
      (resolveCity(u) && resolveCity(u).toLowerCase().includes(query))
    );

    displayUniversities(filtered);
  };

  window.saveUniversity = async function (name) {
    const email = localStorage.getItem("loggedUser");

    if (!email) {
      alert("Please login first");
      return;
    }

    try {
      const res = await fetch("http://localhost:5000/saved", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          email,
          college_name: name,
          type: "Abroad"
        })
      });

      if (!res.ok) throw new Error("Save failed");

      alert(name + " saved successfully!");
    } catch (err) {
      console.error(err);
      alert("Failed to save university");
    }
  };

  window.openUniversity = function (website) {
    const clean = String(website || "").trim();
    if (!clean) {
      alert("No website available");
      return;
    }
    const url = clean.startsWith("http") ? clean : `https://${clean}`;
    window.open(url, "_blank");
  };

  if (loadMoreBtn) {
    loadMoreBtn.addEventListener("click", loadMoreUniversities);
  }

  loadUniversities();
});