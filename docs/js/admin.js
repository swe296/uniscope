(function () {
  if (window.__uniscopeAdminLoaded) return;
  window.__uniscopeAdminLoaded = true;

const API_BASE = "https://uniscope-backend.onrender.com";
const ADMIN_EMAIL = localStorage.getItem("loggedUser") || "admin@uniscope.com";
const ADMIN_HEADERS = {
  "Content-Type": "application/json",
  "x-admin-email": ADMIN_EMAIL
};

const statTotal = document.getElementById("statTotal");
const statIndia = document.getElementById("statIndia");
const statAbroad = document.getElementById("statAbroad");
const statSaved = document.getElementById("statSaved");
const overviewMsg = document.getElementById("overviewMsg");

const collegeRows = document.getElementById("collegeRows");
const tableMsg = document.getElementById("tableMsg");
const createMsg = document.getElementById("createMsg");
const pageInfo = document.getElementById("pageInfo");
const auditRows = document.getElementById("auditRows");
const auditMsg = document.getElementById("auditMsg");
const loadCollegesBtn = document.getElementById("loadCollegesBtn");
const searchQueryInput = document.getElementById("searchQuery");
const countryFilterInput = document.getElementById("countryFilter");

let countryChart;
let rankChart;
let currentPage = 1;
const pageSize = 25;
let lastTotal = 0;

function setActiveTabState(tabId) {
  sessionStorage.setItem("adminActiveTab", tabId);
}

function getActiveTabState() {
  return sessionStorage.getItem("adminActiveTab") || "dashboardTab";
}

function initTabs() {
  switchAdminTab(getActiveTabState());
}

function switchAdminTab(tabId) {
  setActiveTabState(tabId);

  const tabPanels = Array.from(document.querySelectorAll(".tab-panel"));
  tabPanels.forEach(p => p.classList.remove("active"));

  const panel = document.getElementById(tabId);
  if (panel) panel.classList.add("active");

  const topButtons = Array.from(document.querySelectorAll(".top-tab-btn"));
  topButtons.forEach(b => b.classList.remove("active"));

  const labelMap = {
    dashboardTab: ["Overview"],
    collegesTab: ["Colleges"],
    addCollegeTab: ["Add"],
    auditTab: ["Audit"],
    analyticsTab: ["Analytics"]
  };

  const labels = labelMap[tabId] || [];
  topButtons.forEach(btn => {
    if (labels.includes(btn.textContent.trim())) {
      btn.classList.add("active");
    }
  });

  if (tabId === "dashboardTab") {
    loadOverview();
  } else if (tabId === "collegesTab") {
    loadAdminColleges();
  } else if (tabId === "auditTab") {
    loadAuditLog();
  } else if (tabId === "analyticsTab") {
    setTimeout(() => {
      loadCharts();
    }, 80);
  }
}

async function loadOverview() {
  try {
    if (statTotal) statTotal.textContent = "...";
    if (statIndia) statIndia.textContent = "...";
    if (statAbroad) statAbroad.textContent = "...";
    if (statSaved) statSaved.textContent = "...";
    if (overviewMsg) overviewMsg.textContent = "Loading overview...";

    const res = await fetch(`${API_BASE}/admin/overview`);
    const data = await res.json();

    if (!res.ok) throw new Error(data.error || "Failed to load admin overview");

    if (statTotal) statTotal.textContent = data.totalColleges;
    if (statIndia) statIndia.textContent = data.indiaColleges;
    if (statAbroad) statAbroad.textContent = data.abroadColleges;
    if (statSaved) statSaved.textContent = data.savedEntries;
    if (overviewMsg) overviewMsg.textContent = `Last updated: ${new Date().toLocaleTimeString()}`;
  } catch (err) {
    console.error(err);
    if (statTotal) statTotal.textContent = "N/A";
    if (statIndia) statIndia.textContent = "N/A";
    if (statAbroad) statAbroad.textContent = "N/A";
    if (statSaved) statSaved.textContent = "N/A";
    if (overviewMsg) overviewMsg.textContent = "Could not load overview data. Ensure backend is running on port 5000.";
  }
}

function rowTemplate(c) {
  const safeLink = String(c.COLLEGE_LINK || "").replace(/"/g, "&quot;");
  const safeRank = c.RANKING_ID == null ? "" : c.RANKING_ID;

  return `
    <tr data-id="${c.COLLEGE_ID}">
      <td>${c.COLLEGE_ID}</td>
      <td>${c.COLLEGE_NAME}</td>
      <td>${c.COUNTRY || "-"}</td>
      <td><input class="rankInput" value="${safeRank}" type="number"></td>
      <td><input class="linkInput" value="${safeLink}" placeholder="https://..."></td>
      <td>
        <button type="button" onclick="adminSaveCollege(${c.COLLEGE_ID}, this)">Save</button>
        <button type="button" class="danger-btn" onclick="adminDeleteCollege(${c.COLLEGE_ID}, this)">Delete</button>
      </td>
    </tr>
  `;
}

async function loadAdminColleges() {
  const query = document.getElementById("searchQuery").value.trim();
  const country = document.getElementById("countryFilter").value.trim();

  try {
    if (tableMsg) tableMsg.textContent = "Loading colleges...";

    const url =
      `${API_BASE}/admin/colleges?page=${currentPage}&pageSize=${pageSize}` +
      `&query=${encodeURIComponent(query)}&country=${encodeURIComponent(country)}`;

    const res = await fetch(url);
    const data = await res.json();

    if (!res.ok) throw new Error(data.error || "Failed to load colleges");

    const rows = data.rows || [];
    lastTotal = data.total || rows.length;

    if (collegeRows) collegeRows.innerHTML = rows.map(rowTemplate).join("");

    const totalPages = Math.max(Math.ceil(lastTotal / pageSize), 1);
    if (pageInfo) pageInfo.textContent = `Page ${currentPage} / ${totalPages}`;
    if (tableMsg) tableMsg.textContent = `Showing ${rows.length} of ${lastTotal} colleges`;
  } catch (err) {
    console.error(err);
    if (tableMsg) tableMsg.textContent = "Failed to load colleges";
  }
}

async function updateCollege(id, btn) {
  const row = btn.closest("tr");
  if (!row) return;

  const rank = row.querySelector(".rankInput").value.trim();
  const link = row.querySelector(".linkInput").value.trim();

  try {
    btn.disabled = true;
    setActiveTabState("collegesTab");

    const res = await fetch(`${API_BASE}/admin/college/${id}`, {
      method: "PUT",
      headers: ADMIN_HEADERS,
      body: JSON.stringify({
        ranking_id: rank ? Number(rank) : null,
        college_link: link || null,
        admin_email: ADMIN_EMAIL
      })
    });

    const data = await res.json();

    if (!res.ok) throw new Error(data.error || "Update failed");

    if (tableMsg) tableMsg.textContent = `College ${id} updated`;

    await loadAdminColleges();
    await loadAuditLog();
    await loadCharts();

    setTimeout(() => {
      switchAdminTab("collegesTab");
    }, 0);
  } catch (err) {
    console.error(err);
    if (tableMsg) tableMsg.textContent = `Update failed for ${id}`;
  } finally {
    btn.disabled = false;
  }
}

async function deleteCollege(id, btn) {
  if (!confirm(`Delete college ID ${id}?`)) return;

  try {
    btn.disabled = true;
    setActiveTabState("collegesTab");

    const res = await fetch(`${API_BASE}/admin/college/${id}`, {
      method: "DELETE",
      headers: ADMIN_HEADERS
    });

    const data = await res.json();

    if (!res.ok) throw new Error(data.error || "Delete failed");

    if (tableMsg) tableMsg.textContent = `College ${id} deleted`;

    await loadAdminColleges();
    await loadAuditLog();
    await loadCharts();

    setTimeout(() => {
      switchAdminTab("collegesTab");
    }, 0);
  } catch (err) {
    console.error(err);
    if (tableMsg) tableMsg.textContent = `Delete failed for ${id}`;
  } finally {
    btn.disabled = false;
  }
}

async function createCollege() {
  const payload = {
    college_name: document.getElementById("newCollegeName").value.trim(),
    ranking_id: document.getElementById("newRank").value.trim(),
    city_name: document.getElementById("newCity").value.trim(),
    state: document.getElementById("newState").value.trim(),
    country: document.getElementById("newCountry").value.trim(),
    college_link: document.getElementById("newLink").value.trim()
  };

  if (!payload.college_name || !payload.city_name || !payload.country) {
    if (createMsg) createMsg.textContent = "Name, city and country are required";
    return;
  }

  try {
    setActiveTabState("addCollegeTab");
    if (createMsg) createMsg.textContent = "Creating college...";

    const res = await fetch(`${API_BASE}/admin/college`, {
      method: "POST",
      headers: ADMIN_HEADERS,
      body: JSON.stringify({ ...payload, admin_email: ADMIN_EMAIL })
    });

    const data = await res.json();

    if (!res.ok) throw new Error(data.error || "Create failed");

    if (createMsg) createMsg.textContent = `Created college ID ${data.college_id}`;

    document.getElementById("newCollegeName").value = "";
    document.getElementById("newRank").value = "";
    document.getElementById("newCity").value = "";
    document.getElementById("newState").value = "";
    document.getElementById("newCountry").value = "";
    document.getElementById("newLink").value = "";

    currentPage = 1;
    await loadAdminColleges();
    await loadAuditLog();
    await loadCharts();

    setTimeout(() => {
      switchAdminTab("addCollegeTab");
    }, 0);
  } catch (err) {
    console.error(err);
    if (createMsg) createMsg.textContent = "Failed to create college";
  }
}

async function loadAuditLog() {
  try {
    if (auditMsg) auditMsg.textContent = "Loading audit log...";

    const res = await fetch(`${API_BASE}/admin/audit?limit=80`);
    const data = await res.json();

    if (!res.ok) throw new Error(data.error || "Failed to load audit log");

    if (auditRows) {
      auditRows.innerHTML = (data || []).map(r => `
        <tr>
          <td>${r.CREATED_AT ? new Date(r.CREATED_AT).toLocaleString() : "-"}</td>
          <td>${r.ADMIN_EMAIL || "-"}</td>
          <td>${r.ACTION || "-"}</td>
          <td>${r.ENTITY || "-"}</td>
          <td>${r.ENTITY_ID || "-"}</td>
          <td>${r.DETAILS || ""}</td>
        </tr>
      `).join("");
    }

    if (auditMsg) auditMsg.textContent = `Showing ${data ? data.length : 0} audit events`;
  } catch (err) {
    console.error(err);
    if (auditMsg) auditMsg.textContent = "Failed to load audit log";
  }
}

function buildCharts(data) {
  const countryCanvas = document.getElementById("countryChart");
  const rankCanvas = document.getElementById("rankChart");

  if (!countryCanvas || !rankCanvas) return;
  if (typeof Chart === "undefined") return;

  const countries = (data.countries || []).slice(0, 10);
  const labels = countries.map(x => x.COUNTRY);
  const values = countries.map(x => Number(x.CNT || 0));

  if (countryChart) {
    countryChart.destroy();
    countryChart = null;
  }

  if (rankChart) {
    rankChart.destroy();
    rankChart = null;
  }

  countryChart = new Chart(countryCanvas.getContext("2d"), {
    type: "doughnut",
    data: {
      labels: labels,
      datasets: [{
        data: values,
        backgroundColor: [
          "#38bdf8",
          "#6366f1",
          "#22c55e",
          "#f59e0b",
          "#ef4444",
          "#14b8a6",
          "#a855f7",
          "#eab308",
          "#f97316",
          "#8b5cf6"
        ]
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: { color: "#fff" }
        }
      }
    }
  });

  rankChart = new Chart(rankCanvas.getContext("2d"), {
    type: "bar",
    data: {
      labels: labels,
      datasets: [{
        label: "College Count",
        data: values,
        backgroundColor: "#38bdf8"
      }]
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: { color: "#fff" }
        }
      },
      scales: {
        x: {
          beginAtZero: true,
          ticks: { color: "#fff" },
          grid: { color: "rgba(255,255,255,0.08)" }
        },
        y: {
          ticks: { color: "#fff" },
          grid: { color: "rgba(255,255,255,0.08)" }
        }
      }
    }
  });
}

async function loadCharts() {
  const countryCanvas = document.getElementById("countryChart");
  const rankCanvas = document.getElementById("rankChart");

  try {
    console.log("Loading charts...");
    const res = await fetch(`${API_BASE}/admin/charts`);
    const data = await res.json();
    console.log("Charts response:", data);

    if (!res.ok) throw new Error(data.error || "Failed to load charts");

    if (
      (!data.countries || data.countries.length === 0) &&
      (!data.rankCoverage || data.rankCoverage.length === 0)
    ) {
      if (countryChart) {
        countryChart.destroy();
        countryChart = null;
      }
      if (rankChart) {
        rankChart.destroy();
        rankChart = null;
      }

      if (countryCanvas) {
        const parent = countryCanvas.parentElement;
        parent.innerHTML = `
          <h3>Country-wise Distribution</h3>
          <p class="msg">No chart data available from backend</p>
        `;
      }

      if (rankCanvas) {
        const parent = rankCanvas.parentElement;
        parent.innerHTML = `
          <h3>Rank Coverage</h3>
          <p class="msg">No chart data available from backend</p>
        `;
      }

      return;
    }

    buildCharts(data);
  } catch (err) {
    console.error("Chart loading failed:", err);

    if (countryCanvas) {
      const parent = countryCanvas.parentElement;
      parent.innerHTML = `
        <h3>Country-wise Distribution</h3>
        <p class="msg">Failed to load chart</p>
      `;
    }

    if (rankCanvas) {
      const parent = rankCanvas.parentElement;
      parent.innerHTML = `
        <h3>Rank Coverage</h3>
        <p class="msg">Failed to load chart</p>
      `;
    }
  }
}

function nextPage() {
  const totalPages = Math.max(Math.ceil(lastTotal / pageSize), 1);
  if (currentPage < totalPages) {
    currentPage += 1;
    setActiveTabState("collegesTab");
    loadAdminColleges();
  }
}

function prevPage() {
  if (currentPage > 1) {
    currentPage -= 1;
    setActiveTabState("collegesTab");
    loadAdminColleges();
  }
}

function bindCollegeControls() {
  if (loadCollegesBtn) {
    loadCollegesBtn.addEventListener("click", function (e) {
      e.preventDefault();
      currentPage = 1;
      setActiveTabState("collegesTab");
      loadAdminColleges();
      switchAdminTab("collegesTab");
    });
  }

  if (searchQueryInput) {
    searchQueryInput.addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        e.preventDefault();
        currentPage = 1;
        setActiveTabState("collegesTab");
        loadAdminColleges();
        switchAdminTab("collegesTab");
      }
    });
  }

  if (countryFilterInput) {
    countryFilterInput.addEventListener("change", function () {
      currentPage = 1;
      setActiveTabState("collegesTab");
      loadAdminColleges();
      switchAdminTab("collegesTab");
    });
  }
}

window.loadAdminColleges = loadAdminColleges;
window.updateCollege = updateCollege;
window.createCollege = createCollege;
window.deleteCollege = deleteCollege;

window.adminSaveCollege = function (id, btn) {
  return updateCollege(id, btn);
};

window.adminDeleteCollege = function (id, btn) {
  return deleteCollege(id, btn);
};

window.nextPage = nextPage;
window.prevPage = prevPage;
window.switchAdminTab = switchAdminTab;

document.addEventListener("DOMContentLoaded", function () {
  bindCollegeControls();
  initTabs();
  loadOverview();
  loadAdminColleges();
  loadAuditLog();
  loadCharts();
});

})();