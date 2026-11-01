
import { auth, db } from "./firebase.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";

import {
  ref,
  get
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-database.js";

const totalPlayers = document.getElementById("totalPlayers");
const totalMatches = document.getElementById("totalMatches");
const totalGoals = document.getElementById("totalGoals");
const activeSeason = document.getElementById("activeSeason");
const sectionMessage = document.getElementById("sectionMessage");

async function loadDashboard() {
  try {
    const [playersSnap, matchesSnap, seasonsSnap] =
      await Promise.all([
        get(ref(db, "players")),
        get(ref(db, "publicMatches")),
        get(ref(db, "seasons"))
      ]);

    const players = playersSnap.val() || {};
    const matches = matchesSnap.val() || {};
    const seasons = seasonsSnap.val() || {};

    totalPlayers.textContent =
      Object.keys(players).length;

    const matchList = [];

    Object.values(matches).forEach((entry) => {
      if (!entry || typeof entry !== "object") return;

      if ("teamA" in entry || "teamB" in entry) {
        matchList.push(entry);
      } else {
        Object.values(entry).forEach((match) => {
          if (match && typeof match === "object") {
            matchList.push(match);
          }
        });
      }
    });

    totalMatches.textContent = matchList.length;

    let goals = 0;

    matchList.forEach((match) => {
      goals += Number(match.scoreA ?? 0);
      goals += Number(match.scoreB ?? 0);
    });

    totalGoals.textContent = goals;

    const currentSeason = Object.entries(seasons).find(
      ([, season]) => season?.active === true
    );

    activeSeason.textContent =
      currentSeason?.[1]?.name || "Not set";

  } catch (error) {
    console.error("Dashboard loading error:", error);
    sectionMessage.textContent =
      "Could not load dashboard statistics. Check database permissions.";
  }
}

document.querySelectorAll("[data-section]").forEach((button) => {
  button.addEventListener("click", () => {
    const section = button.dataset.section;

    document.querySelectorAll(".nav-item").forEach((item) => {
      item.classList.toggle(
        "active",
        item.dataset.section === section
      );
    });

    const labels = {
      home: "Dashboard overview",
      players: "Player management is our next step.",
      matches: "Match-day management is coming next.",
      standings: "League standings will be available soon.",
      settings: "Season settings will be available soon."
    };

    sectionMessage.textContent = labels[section];
  });
});

onAuthStateChanged(auth, (user) => {
  if (user) {
    loadDashboard();
  }
});
