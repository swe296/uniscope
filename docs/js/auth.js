const ADMIN_EMAIL = "admin@uniscope.com";
const ADMIN_PASS = "admin123";

function login() {
  const email = document.getElementById("email").value.trim();
  const pass = document.getElementById("password").value.trim();
  const msg = document.getElementById("msg");

  const users = JSON.parse(localStorage.getItem("users")) || [];
  const user = users.find(u => u.email === email && u.password === pass);

  if (user) {
    localStorage.setItem("loggedIn", "true");
    localStorage.setItem("loggedUser", email);
    localStorage.setItem("role", "user");
    location.replace("home.html");
  } else {
    msg.innerText = "Invalid email or password";
  }
}

function register() {
  const email = document.getElementById("email").value.trim();
  const pass = document.getElementById("password").value.trim();
  const msg = document.getElementById("msg");

  if (!email || !pass) {
    msg.innerText = "Fill all fields";
    return;
  }

  let users = JSON.parse(localStorage.getItem("users")) || [];

  if (users.some(u => u.email === email)) {
    msg.innerText = "User already exists";
    return;
  }

  users.push({ email, password: pass });
  localStorage.setItem("users", JSON.stringify(users));

  msg.innerText = "Account created. You can login now.";
}

function adminLogin() {
  const email = document.getElementById("email").value.trim();
  const pass = document.getElementById("password").value.trim();
  const msg = document.getElementById("msg");

  if (email === ADMIN_EMAIL && pass === ADMIN_PASS) {
    localStorage.setItem("loggedIn", "true");
    localStorage.setItem("loggedUser", email);
    localStorage.setItem("role", "admin");
    location.replace("admin.html");
  } else {
    msg.innerText = "Invalid admin credentials";
  }
}

function logout() {
  localStorage.removeItem("loggedIn");
  localStorage.removeItem("loggedUser");
  localStorage.removeItem("role");
  location.replace("auth.html");
}

(function () {
  const path = location.pathname.toLowerCase();
  const onAuthPage = path.includes("auth");
  const onAdminPage = path.includes("admin");
  const loggedIn = localStorage.getItem("loggedIn");
  const role = localStorage.getItem("role");

  // Admin page must only be accessible to logged-in admins.
  if (onAdminPage) {
    if (!loggedIn || role !== "admin") {
      location.replace("auth.html");
    }
    return;
  }

  if (!loggedIn && !onAuthPage) {
    location.replace("auth.html");
    return;
  }

  if (loggedIn && onAuthPage) {
    if (role === "admin") {
      location.replace("admin.html");
    } else {
      location.replace("home.html");
    }
  }
})();