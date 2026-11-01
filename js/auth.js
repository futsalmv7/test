
import { auth, db } from "./firebase.js";

import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";

import {
  ref,
  get
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-database.js";

const loginForm = document.getElementById("loginForm");
const loginScreen = document.getElementById("loginScreen");
const dashboard = document.getElementById("dashboard");
const message = document.getElementById("loginMessage");
const logoutButton = document.getElementById("logoutButton");

async function isAdmin(user) {
  if (!user) return false;

  const snapshot = await get(
    ref(db, `admins/${user.uid}/enabled`)
  );

  return snapshot.val() === true;
}

function showLogin() {
  loginScreen.hidden = false;
  dashboard.hidden = true;
}

function showDashboard() {
  loginScreen.hidden = true;
  dashboard.hidden = false;
}

onAuthStateChanged(auth, async (user) => {
  showLogin();

  if (!user) return;

  try {
    if (await isAdmin(user)) {
      showDashboard();
    } else {
      await signOut(auth);
      message.textContent = "This account is not authorized.";
    }
  } catch (error) {
    console.error(error);
    message.textContent = "Unable to verify admin access.";
  }
});

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;
  const button = loginForm.querySelector("button");

  button.disabled = true;
  message.textContent = "Signing in...";

  try {
    const result = await signInWithEmailAndPassword(
      auth,
      email,
      password
    );

    if (!(await isAdmin(result.user))) {
      await signOut(auth);
      throw new Error("Unauthorized admin account.");
    }

    message.textContent = "";
    showDashboard();
  } catch (error) {
    console.error(error);
    message.textContent = "Login failed or access denied.";
    showLogin();
  } finally {
    button.disabled = false;
  }
});

logoutButton.addEventListener("click", async () => {
  await signOut(auth);
  showLogin();
});
