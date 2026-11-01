
import { auth, db } from "./firebase.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";

import {
  ref,
  get,
  onValue
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-database.js";

import {
  calculateStandings
} from "./standings-calculator.js";

const section = document.getElementById("standingsSection");
const viewSelect = document.getElementById("standingsView");
const yearSelect = document.getElementById("standingsYear");
const monthSelect = document.getElementById("standingsMonth");
const yearField = document.getElementById("standingsYearField");
const monthField = document.getElementById("standingsMonthField");
const title = document.getElementById("standingsTitle");
const message = document.getElementById("standingsMessage");
const body = document.getElementById("standingsBody");
const winnerBox = document.getElementById("standingsWinner");

const today = new Date();
const currentYear = today.getFullYear();

let publishedMatches = {};
let playerNames = {};
let stopMatches = null;
let stopPlayers = null;
let authorized = false;

const monthNames = [
  "January", "February", "March", "April",
  "May", "June", "July", "August",
  "September", "October", "November", "December"
];


if (yearSelect && monthSelect) {
  yearSelect.add(
    new Option(String(currentYear), String(currentYear))
  );

  yearSelect.value = String(currentYear);

  monthSelect.value = String(today.getMonth() + 1).padStart(2, "0");
}


function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function updateYearOptions() {
  const previous = yearSelect.value || String(currentYear);

  const years = new Set([currentYear]);

  for (const match of Object.values(publishedMatches)) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(match?.date || "")) {
      years.add(Number(match.date.slice(0, 4)));
    }
  }

  yearSelect.replaceChildren();

  [...years].sort((a, b) => b - a).forEach(year => {
    yearSelect.add(new Option(String(year), String(year)));
  });

  yearSelect.value = years.has(Number(previous))
    ? previous
    : String(currentYear);
}

function renderStandings() {
  const view = viewSelect.value;
  const year = yearSelect.value;
  const month = monthSelect.value;

  yearField.hidden = view === "all";
  monthField.hidden = view !== "month";

  const periodLabel = view === "month"
    ? `${monthNames[Number(month) - 1]} ${year}`
    : view === "season"
      ? `Season ${year}`
      : "All-Time";

  title.textContent = `${periodLabel} Standings`;

  if (!authorized) {
    message.textContent = "Admin access required.";
    body.replaceChildren();
    winnerBox.hidden = true;
    return;
  }

  const rows = calculateStandings(
    publishedMatches,
    view,
    year,
    month
  );

  // Use current player names when available.
  rows.forEach(row => {
    if (playerNames[row.id]) {
      row.name = playerNames[row.id];
    }
  });

  // Preserve the official ranking order.
  rows.sort((a, b) =>
    b.points - a.points ||
    b.winPercentage - a.winPercentage ||
    a.played - b.played ||
    a.name.localeCompare(b.name)
  );

  message.textContent =
    `${rows.length} player(s) in this ranking`;

  if (!rows.length) {
    body.innerHTML = `
      <tr>
        <td colspan="12">
          No published match statistics for this period.
        </td>
      </tr>
    `;
    winnerBox.hidden = true;
    return;
  }

  body.innerHTML = rows.map((row, index) => `
    <tr>
      <td>${index + 1}</td>
      <td>${escapeHTML(row.name)}</td>
      <td>${row.played}</td>
      <td>${row.wins}</td>
      <td>${row.draws}</td>
      <td>${row.losses}</td>
      <td>${row.late}</td>
      <td>${row.absent}</td>
      <td>${row.goals}</td>
      <td>${row.motm}</td>
      <td>${row.winPercentage.toFixed(1)}%</td>
      <td>${row.points}</td>
    </tr>
  `).join("");

  if (view === "month" || view === "season") {
    const leader = rows[0];

    winnerBox.hidden = false;
    winnerBox.replaceChildren();

    const heading = document.createElement("strong");
    heading.textContent =
      view === "month"
        ? "🏆 Current Monthly Leader"
        : "🏆 Current Season Leader";

    const player = document.createElement("p");
    player.textContent =
      `${leader.name} — ${leader.points} points`;

    winnerBox.append(heading, player);
  } else {
    winnerBox.hidden = true;
  }
}

function openStandings() {
  document.getElementById("playersSection").hidden = true;
  document.getElementById("matchesSection").hidden = true;
  section.hidden = false;

  renderStandings();
}

document.querySelectorAll('[data-section="standings"]')
  .forEach(button => {
    button.addEventListener("click", openStandings);
  });

document.querySelectorAll("[data-section]").forEach(button => {
  if (button.dataset.section === "standings") return;

  button.addEventListener("click", () => {
    section.hidden = true;
  });
});

viewSelect.addEventListener("change", renderStandings);
yearSelect.addEventListener("change", renderStandings);
monthSelect.addEventListener("change", renderStandings);

onAuthStateChanged(auth, async user => {
  stopMatches?.();
  stopPlayers?.();

  stopMatches = null;
  stopPlayers = null;
  authorized = false;
  publishedMatches = {};
  playerNames = {};

  section.hidden = true;

  if (!user) return;

  try {
    const adminSnap = await get(
      ref(db, `admins/${user.uid}/enabled`)
    );

    if (
      auth.currentUser?.uid !== user.uid ||
      adminSnap.val() !== true
    ) return;

    authorized = true;

    stopMatches = onValue(
      ref(db, "publicMatches"),
      snapshot => {
        publishedMatches = snapshot.val() || {};
        updateYearOptions();
        renderStandings();
      },
      error => {
        console.error(error);
        message.textContent = "Unable to load published matches.";
      }
    );

    stopPlayers = onValue(
      ref(db, "players"),
      snapshot => {
        const players = snapshot.val() || {};

        playerNames = {};

        for (const [id, player] of Object.entries(players)) {
          playerNames[id] =
            player.nickname || player.name || "";
        }

        renderStandings();
      },
      error => console.error(error)
    );

  } catch (error) {
    console.error(error);
    message.textContent = "Unable to verify admin access.";
  }
});
