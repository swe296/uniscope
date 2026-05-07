const API_BASE = "https://uniscope-backend.onrender.com";

let totalCostValue = 0;
let emiValue = 0;

function calculateCost() {
  const tuition = +document.getElementById("tuition").value;
  const living = +document.getElementById("living").value;
  const years = +document.getElementById("years").value;

  if (tuition <= 0 || living <= 0 || years <= 0) {
    alert("Enter valid values");
    return;
  }

  totalCostValue = (tuition + living) * years;

  document.getElementById("costResult").innerHTML = `
    <strong>Total Study Cost</strong><br>
    ₹${totalCostValue.toLocaleString()} for ${years} years
  `;

  updateInsight();
}

function calculateEMI() {
  const P = +document.getElementById("loanAmount").value;
  const r = (+document.getElementById("interest").value) / 1200;
  const n = (+document.getElementById("tenure").value) * 12;

  if (P <= 0 || r <= 0 || n <= 0) {
    alert("Enter valid loan details");
    return;
  }

  emiValue = (P * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);

  document.getElementById("emiResult").innerHTML = `
    <strong>Monthly EMI</strong><br>
    ₹${Math.round(emiValue).toLocaleString()} / month
  `;

  updateInsight();
}

function updateInsight() {
  if (totalCostValue > 0 && emiValue > 0) {
    document.getElementById("insightText").innerText =
      "Based on your financial inputs, here are smart recommendations:";
    suggestOptions();
  }
}

async function suggestOptions() {
  const collegeBox = document.getElementById("collegeSuggestions");
  const bankBox = document.getElementById("bankSuggestions");

  try {
    const res = await fetch(`${API_BASE}/financial-colleges?budget=${totalCostValue}`);
    const colleges = await res.json();

    if (!res.ok) {
      throw new Error(colleges.error || "Failed to load colleges");
    }

    if (!colleges.length) {
      collegeBox.innerHTML = `
        <h4>🎓 Suggested Colleges</h4>
        <p>No colleges found within your budget.</p>
      `;
    } else {
      collegeBox.innerHTML = `
        <h4>🎓 Suggested Colleges</h4>
        <ul>
          ${colleges.slice(0, 5).map(c => `
            <li>
              ${c.COLLEGE_NAME}
              (${c.CITY_NAME || "Unknown"})
              - Fee: ₹${Number(c.FEE || 0).toLocaleString()}
              - Avg: ₹${Number(c.AVG_SALARY || 0).toLocaleString()}
            </li>
          `).join("")}
        </ul>
      `;
    }

  } catch (err) {
    console.error("Failed to load financial college suggestions", err);
    collegeBox.innerHTML = `
      <h4>🎓 Suggested Colleges</h4>
      <p>Failed to load college suggestions.</p>
    `;
  }

  let banks = [];

  if (emiValue < 7000) {
    banks = ["SBI Education Loan", "Indian Bank Student Loan"];
  } else if (emiValue < 15000) {
    banks = ["HDFC Credila", "Axis Bank Education Loan"];
  } else {
    banks = ["ICICI Bank Education Loan", "Tata Capital Education Loan"];
  }

  bankBox.innerHTML = `
    <h4>🏦 Suggested Banks</h4>
    <ul>${banks.map(b => `<li>${b}</li>`).join("")}</ul>
  `;
}