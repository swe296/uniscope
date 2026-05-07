const API_BASE = "https://uniscope-backend.onrender.com";

let selected = [];

document.addEventListener("DOMContentLoaded", async function () {
  const grid = document.getElementById("savedGrid");
  const email = localStorage.getItem("loggedUser");

  if (!email) {
    grid.innerHTML = "<p style='text-align:center'>Please login first.</p>";
    return;
  }

  grid.innerHTML = "<p style='text-align:center'>Loading saved colleges...</p>";

  try {
    const res = await fetch(`${API_BASE}/saved?email=${encodeURIComponent(email)}`);
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || "Server error");
    }

    if (!data || data.length === 0) {
      grid.innerHTML = "<p style='text-align:center'>No saved colleges yet.</p>";
      return;
    }

    grid.innerHTML = "";

    data.forEach(item => {
      const name = item.college_name || item.COLLEGE_NAME || "Unknown";
      const type = item.type || item.TYPE || "General";

      grid.innerHTML += `
        <div class="glass-card">
          <h3>${name}</h3>
          <p class="details">${type}</p>

          <div class="card-actions">
            <button onclick="toggleSelect('${name.replace(/'/g, "\\'")}', this)">Select</button>
            <button onclick="removeCollege('${name.replace(/'/g, "\\'")}')">Remove</button>
          </div>
        </div>
      `;
    });

  } catch (err) {
    console.error(err);
    grid.innerHTML = "<p style='text-align:center'>Failed to load saved colleges.</p>";
  }
});

function toggleSelect(name, btn) {
  if (selected.includes(name)) {
    selected = selected.filter(c => c !== name);
    btn.innerText = "Select";
    btn.classList.remove("selected-btn");
  } else {
    if (selected.length >= 2) {
      alert("You can select only 2 colleges");
      return;
    }

    selected.push(name);
    btn.innerText = "Selected";
    btn.classList.add("selected-btn");
  }
}

function goToCompare() {
  if (selected.length !== 2) {
    alert("Please select exactly 2 colleges");
    return;
  }

  localStorage.setItem("compareColleges", JSON.stringify(selected));
  window.location.href = "compare.html";
}

async function removeCollege(name) {
  const email = localStorage.getItem("loggedUser");

  if (!email) {
    alert("User not logged in");
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/saved`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        email,
        college_name: name
      })
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || "Delete failed");
    }

    alert(`${name} removed successfully`);
    location.reload();

  } catch (err) {
    console.error(err);
    alert("Failed to remove college");
  }
}