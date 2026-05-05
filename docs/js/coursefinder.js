let cutoffChart;

async function loadCutoffChart(collegeId, studentCutoff) {
  try {
    const res = await fetch(`http://localhost:5000/cutoff-trend?collegeId=${collegeId}`);
    const data = await res.json();

    if (!data.length) {
      alert("No cutoff data found for this college");
      return;
    }

    const labels = data.map(d => String(d.YEAR));
    const values = data.map(d => Number(d.CUTOFF_MARK));

    // add student value
    labels.push("You");
    values.push(Number(studentCutoff));

    const ctx = document.getElementById("cutoffChart");

    if (cutoffChart) cutoffChart.destroy();

    cutoffChart = new Chart(ctx, {
      type: "line",
      data: {
        labels: labels,
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