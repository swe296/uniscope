document.addEventListener("DOMContentLoaded", function () {

  let currentStep = 1;
  const steps = document.querySelectorAll(".step");
  const totalSteps = steps.length;

  const progressBar = document.getElementById("progressBar");
  const progressText = document.getElementById("progressText");

  const formStepsDiv = document.getElementById("formSteps");
  const reviewDiv = document.getElementById("reviewProfile");
  const profileSummary = document.getElementById("profileSummary");

  function getUserEmail() {
    return localStorage.getItem("loggedUser") || "";
  }

  function showStep(step) {
    steps.forEach((s, index) => {
      s.classList.remove("active");
      if (index + 1 === step) s.classList.add("active");
    });
    updateProgress();
    toggleNavButtons();
  }

  function updateProgress() {
    let percent = Math.round(((currentStep - 1) / (totalSteps - 1)) * 100);
    progressBar.style.width = percent + "%";
    progressText.innerText = percent + "% Completed";
  }

  function toggleNavButtons() {
    const prevBtn = document.querySelector(".wizard-buttons button:first-child");
    const nextBtn = document.querySelector(".wizard-buttons button:last-child");
    const lastStepSubmit = document.querySelector(".step:last-child .save-btn");

    prevBtn.style.display = currentStep === 1 ? "none" : "inline-block";
    nextBtn.style.display = currentStep === totalSteps ? "none" : "inline-block";

    if (lastStepSubmit) {
      lastStepSubmit.style.display = currentStep === totalSteps ? "inline-block" : "none";
    }
  }

  window.nextStep = function () {
    if (currentStep < totalSteps) {
      currentStep++;
      showStep(currentStep);
    }
  };

  window.prevStep = function () {
    if (currentStep > 1) {
      currentStep--;
      showStep(currentStep);
    }
  };

  window.submitProfile = async function () {
    const profileData = {
      name: document.getElementById("name")?.value || "",
      email: document.getElementById("email")?.value || "",
      phone: document.getElementById("phone")?.value || "",
      city: document.getElementById("city")?.value || "",
      course: document.getElementById("course")?.value || "",
      budget: document.getElementById("budget")?.value || "",
      score: document.getElementById("twelfth")?.value || ""
    };

    try {
      await fetch("http://localhost:5000/student-profile", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(profileData)
      });

      localStorage.setItem(`studentProfile_${getUserEmail()}`, JSON.stringify(profileData));
      displayProfile(profileData);

    } catch (err) {
      alert("Failed to save to database, saving locally");
      localStorage.setItem(`studentProfile_${getUserEmail()}`, JSON.stringify(profileData));
      displayProfile(profileData);
    }
  };

  function displayProfile(data) {
    formStepsDiv.classList.add("hidden");
    reviewDiv.classList.remove("hidden");

    progressBar.style.width = "100%";
    progressText.innerText = "100% Completed";

    profileSummary.innerHTML = "";

    for (let key in data) {
      const value = data[key] || "-";
      const field = document.createElement("p");
      field.innerHTML = `<strong>${key}</strong>: ${value}`;
      profileSummary.appendChild(field);
    }
  }

  window.editProfile = function () {
    reviewDiv.classList.add("hidden");
    formStepsDiv.classList.remove("hidden");
    currentStep = 1;
    showStep(currentStep);
  };

  async function loadProfile() {
    const email = getUserEmail();

    try {
      const res = await fetch(`http://localhost:5000/student-profile?email=${email}`);
      const data = await res.json();

      if (data) {
        const profileData = {
          name: data.FIRST_NAME,
          email: data.EMAIL,
          phone: data.PHONE_NO,
          city: data.PREF_CITY,
          course: data.PREFERRED_COURSE,
          budget: data.BUDGET,
          score: data.SCORE
        };

        displayProfile(profileData);
        return;
      }
    } catch (err) {}

    const local = JSON.parse(localStorage.getItem(`studentProfile_${email}`));
    if (local) displayProfile(local);
    else showStep(currentStep);
  }

  loadProfile();
});