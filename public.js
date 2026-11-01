
import { db } from "./firebase.js";

import {
  ref,
  onValue
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-database.js";

import {
  calculateStandings
} from "./standings-calculator.js";

const viewSelect = document.getElementById("publicView");
const yearSelect = document.getElementById("publicYear");
const monthSelect = document.getElementById("publicMonth");
const yearField = document.getElementById("publicYearField");
const monthField = document.getElementById("publicMonthField");
const title = document.getElementById("publicStandingsTitle");
const message = document.getElementById("publicStandingsMessage");
const body = document.getElementById("publicStandingsBody");

const today = new Date();
const currentYear = today.getFullYear();

let publishedMatches = {};
let legacyStats = {};

const months = [
  "January", "February", "March", "April",
  "May", "June", "July", "August",
  "September", "October", "November", "December"
];

monthSelect.value =
  String(today.getMonth() + 1).padStart(2, "0");

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function updateYears() {
  const previous = yearSelect.value || String(currentYear);
  const years = new Set([currentYear]);

  Object.values(publishedMatches).forEach(match => {
    if (/^\d{4}-\d{2}-\d{2}$/.test(match.date || "")) {
      years.add(Number(match.date.slice(0, 4)));
    }
  });

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

  const label = view === "month"
    ? `${months[Number(month) - 1]} ${year}`
    : view === "season"
      ? `Season ${year}`
      : "All-Time";

  title.textContent = `${label} Standings`;

    const rows = calculateStandings(
    publishedMatches,
    view,
    year,
    month,
    legacyStats
  );

  message.textContent = `${rows.length} players ranked`;

  if (!rows.length) {
    body.innerHTML = `
      <tr>
        <td colspan="10">
          No published match results for this period.
        </td>
      </tr>
    `;
    return;
  }

  body.innerHTML = rows.map((row, index) => {
  const previous = rows[index - 1];

  const tiedWithPrevious =
    previous &&
    row.points === previous.points &&
    row.winPercentage === previous.winPercentage &&
    row.played === previous.played;

  const rank = tiedWithPrevious
    ? rows.findIndex(other =>
        other.points === row.points &&
        other.winPercentage === row.winPercentage &&
        other.played === row.played
      ) + 1
    : index + 1;

  return `
    <tr>
      <td>${rank}</td>
      <td>${escapeHTML(row.name)}</td>
      <td>${row.played}</td>
      <td>${row.wins}</td>
      <td>${row.draws}</td>
      <td>${row.losses}</td>
      <td>${row.goals}</td>
      <td>${row.motm}</td>
      <td>${Math.round(row.winPercentage)}%</td>
      <td>${row.points}</td>
    </tr>
  `;
}).join("");
}


/* GOLDEN BOOT AND MAN OF THE MATCH */

const awardConfigs = [
  {
    prefix: "goldenBoot",
    stat: "goals",
    label: "Golden Boot",
    icon: "⚽"
  },
  {
    prefix: "motm",
    stat: "motm",
    label: "Man of the Match",
    icon: "⭐"
  }
];

function setupAwardFilters(config) {
  const prefix = config.prefix;

  const view = document.getElementById(`${prefix}View`);
  const year = document.getElementById(`${prefix}Year`);
  const month = document.getElementById(`${prefix}Month`);

  month.value = String(today.getMonth() + 1).padStart(2, "0");

  function refreshYears() {
    const previous = year.value || String(currentYear);
    const years = new Set([currentYear]);

    Object.values(publishedMatches).forEach(match => {
      if (/^\d{4}-\d{2}-\d{2}$/.test(match?.date || "")) {
        years.add(Number(match.date.slice(0, 4)));
      }
    });

    year.replaceChildren();

    [...years].sort((a, b) => b - a).forEach(y => {
      year.add(new Option(String(y), String(y)));
    });

    year.value = years.has(Number(previous))
      ? previous
      : String(currentYear);
  }

  function render() {
    const selectedView = view.value;
    const selectedYear = year.value;
    const selectedMonth = month.value;

    document.getElementById(`${prefix}YearField`).hidden =
      selectedView === "all";

    document.getElementById(`${prefix}MonthField`).hidden =
      selectedView !== "month";

    const period = selectedView === "month"
      ? `${months[Number(selectedMonth) - 1]} ${selectedYear}`
      : selectedView === "season"
        ? `Season ${selectedYear}`
        : "All-Time";

    document.getElementById(`${prefix}Title`).textContent =
      `${period} ${config.label} Rankings`;

    const rows = calculateStandings(
      publishedMatches,
      selectedView,
      selectedYear,
      selectedMonth
    );

    rows.sort((a, b) =>
      b[config.stat] - a[config.stat] ||
      a.played - b.played ||
      a.name.localeCompare(b.name)
    );

    const tbody = document.getElementById(`${prefix}Body`);
    const message = document.getElementById(`${prefix}Message`);
    const leaderBox = document.getElementById(`${prefix}Leader`);

    // Show only players who earned at least one award.
    const ranked = rows.filter(row => row[config.stat] > 0);

    message.textContent =
      `${ranked.length} player(s) in this ranking`;

    if (!ranked.length) {
      tbody.innerHTML = `
        <tr>
          <td colspan="${config.stat === "goals" ? 5 : 4}">
            No ${config.label} records for this period.
          </td>
        </tr>
      `;

      leaderBox.hidden = true;
      return;
    }

    tbody.innerHTML = ranked.map((row, index) => {
      const previous = ranked[index - 1];

const tiedWithPrevious =
  previous &&
  row[config.stat] === previous[config.stat] &&
  row.played === previous.played;

const rank = tiedWithPrevious
  ? ranked.findIndex(other =>
      other[config.stat] === row[config.stat] &&
      other.played === row.played
    ) + 1
  : index + 1;
      if (config.stat === "goals") {
        const average = row.played
          ? (row.goals / row.played).toFixed(2)
          : "0.00";

        return `
          <tr>
            <td>${rank}</td>
            <td>${escapeHTML(row.name)}</td>
            <td>${row.played}</td>
            <td>${row.goals}</td>
            <td>${average}</td>
          </tr>
        `;
      }

      return `
        <tr>
          <td>${rank}</td>
          <td>${escapeHTML(row.name)}</td>
          <td>${row.played}</td>
          <td>${row.motm}</td>
        </tr>
      `;
    }).join("");

    const leader = ranked[0];

const leaders = ranked.filter(row =>
  row[config.stat] === leader[config.stat] &&
  row.played === leader.played
);

leaderBox.hidden = false;
leaderBox.replaceChildren();

const icon = document.createElement("div");
icon.className = "award-icon";
icon.textContent = config.icon;

const label = document.createElement("div");
label.className = "award-label";
label.textContent = leaders.length > 1
  ? `${period} Joint Leaders`
  : `${period} Leader`;

const name = document.createElement("h3");
name.textContent = leaders
  .map(row => row.name)
  .sort((a, b) => a.localeCompare(b))
  .join(" & ");

const total = document.createElement("p");

if (config.stat === "goals") {
  total.textContent = `${leader.goals} goals in ${leader.played} matches`;
} else {
  total.textContent = `${leader.motm} Man of the Match awards in ${leader.played} matches`;
}

leaderBox.append(icon, label, name, total);
  }

  view.addEventListener("change", render);
  year.addEventListener("change", render);
  month.addEventListener("change", render);

  return { refreshYears, render };
}

const awardSections = awardConfigs.map(setupAwardFilters);

function updateAwardSections() {
  awardSections.forEach(section => {
    section.refreshYears();
    section.render();
  });
}


/* PUBLIC MATCH RESULTS */

const resultsView = document.getElementById("resultsView");
const resultsYear = document.getElementById("resultsYear");
const resultsMonth = document.getElementById("resultsMonth");

const resultsYearField =
  document.getElementById("resultsYearField");

const resultsMonthField =
  document.getElementById("resultsMonthField");

const resultsTitle = document.getElementById("resultsTitle");
const resultsMessage = document.getElementById("resultsMessage");
const resultsList = document.getElementById("resultsList");

resultsMonth.value =
  String(today.getMonth() + 1).padStart(2, "0");

function updateResultsYears() {
  const previous = resultsYear.value || String(currentYear);
  const years = new Set([currentYear]);

  Object.values(publishedMatches).forEach(match => {
    if (/^\d{4}-\d{2}-\d{2}$/.test(match?.date || "")) {
      years.add(Number(match.date.slice(0, 4)));
    }
  });

  resultsYear.replaceChildren();

  [...years].sort((a, b) => b - a).forEach(year => {
    resultsYear.add(new Option(String(year), String(year)));
  });

  resultsYear.value = years.has(Number(previous))
    ? previous
    : String(currentYear);
}

function getPlayerName(match, id) {
  return match.players?.[id]?.name || "Unknown player";
}

function goalScorers(match, team) {
  const scorers = Object.entries(match.goals || {})
    .filter(([id, goals]) =>
      match.players?.[id]?.team === team &&
      Number(goals) > 0
    )
    .map(([id, goals]) => ({
      name: getPlayerName(match, id),
      goals: Number(goals)
    }))
    .sort((a, b) => b.goals - a.goals);

  if (!scorers.length) {
    return `<p class="muted">No goals scored</p>`;
  }

  return scorers.map(scorer => `
    <p>${escapeHTML(scorer.name)}
      <strong>× ${scorer.goals}</strong>
    </p>
  `).join("");
}

function renderResults() {
  const view = resultsView.value;
  const year = resultsYear.value;
  const month = resultsMonth.value;

  resultsYearField.hidden = view === "all";
  resultsMonthField.hidden = view !== "month";

  const period = view === "month"
    ? `${months[Number(month) - 1]} ${year}`
    : view === "season"
      ? `Season ${year}`
      : "All-Time";

  resultsTitle.textContent = `${period} Results`;

  const matches = Object.values(publishedMatches)
    .filter(match => {
      if (!match || match.status !== "published") return false;

      const date = match.date || "";

      if (view !== "all" && date.slice(0, 4) !== year) {
        return false;
      }

      if (view === "month" && date.slice(5, 7) !== month) {
        return false;
      }

      return true;
    })
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""));

  resultsMessage.textContent =
    `${matches.length} published match(es)`;

  if (!matches.length) {
    resultsList.innerHTML = `
      <div class="content-card">
        <p class="muted">
          No published match results for this period.
        </p>
      </div>
    `;
    return;
  }

  resultsList.innerHTML = matches.map(match => {
    const teamA = match.teamNameA || "Team A";
    const teamB = match.teamNameB || "Team B";

    const motmName = match.manOfMatch
      ? getPlayerName(match, match.manOfMatch)
      : "Not recorded";

    return `
      <article class="result-card">
        <div class="result-meta">
          <span>📅 ${escapeHTML(match.date || "")}</span>
          <span>📍 ${escapeHTML(match.venue || "Venue not set")}</span>
        </div>

        <div class="result-scoreboard">
          <div class="result-team">${escapeHTML(teamA)}</div>
          <div class="result-score">
            ${Number(match.scoreA)} - ${Number(match.scoreB)}
          </div>
          <div class="result-team">${escapeHTML(teamB)}</div>
        </div>

        <div class="result-details">
          <div>
            <h4>${escapeHTML(teamA)} Scorers</h4>
            ${goalScorers(match, "A")}
          </div>

          <div>
            <h4>${escapeHTML(teamB)} Scorers</h4>
            ${goalScorers(match, "B")}
          </div>
        </div>

        <div class="result-motm">
          ⭐ <strong>Man of the Match:</strong>
          ${escapeHTML(motmName)}
        </div>
      </article>
    `;
  }).join("");
}

resultsView.addEventListener("change", renderResults);
resultsYear.addEventListener("change", renderResults);
resultsMonth.addEventListener("change", renderResults);


/* OFFICIAL MONTHLY CHAMPIONS */

let officialChampions = {};

onValue(
  ref(db, "monthlyChampions"),
  snapshot => {
    officialChampions = snapshot.val() || {};

    updateChampionYears();
    renderChampion();
  },
  error => {
    console.error("Unable to load official champions:", error);
  }
);


/* LIVE MONTHLY CHAMPIONS */

const championsYear =
  document.getElementById("championsYear");

const championsMonth =
  document.getElementById("championsMonth");

const championsDisplay =
  document.getElementById("championsDisplay");

championsMonth.value =
  String(today.getMonth() + 1).padStart(2, "0");

function updateChampionYears() {
  const previous = championsYear.value || String(currentYear);
  const years = new Set([currentYear]);

Object.keys(officialChampions).forEach(key => {
  if (/^\d{4}-\d{2}$/.test(key)) {
    years.add(Number(key.slice(0, 4)));
  }
});


  Object.values(publishedMatches).forEach(match => {
    if (/^\d{4}-\d{2}-\d{2}$/.test(match?.date || "")) {
      years.add(Number(match.date.slice(0, 4)));
    }
  });

  championsYear.replaceChildren();

  [...years].sort((a, b) => b - a).forEach(year => {
    championsYear.add(
      new Option(String(year), String(year))
    );
  });

  championsYear.value = years.has(Number(previous))
    ? previous
    : String(currentYear);
}


function renderChampion() {
  const year = championsYear.value;
  const month = championsMonth.value;

  const period = `${months[Number(month) - 1]} ${year}`;
  const key = `${year}-${month}`;

  const official = officialChampions[key];

  // Officially finalized champion takes priority.
if (official) {
  const officialWinners =
    Array.isArray(official.champions) && official.champions.length
      ? official.champions
      : [{
          playerId: official.playerId,
          playerName: official.playerName
        }];

  const officialNames = officialWinners
    .map(player => player.playerName || "Champion")
    .sort((a, b) => a.localeCompare(b))
    .join(" & ");

  const officialTitle = officialWinners.length > 1
    ? "🏆 Official Joint Monthly Champions"
    : "🏆 Official Monthly Champion";

  championsDisplay.innerHTML = `
      <div class="champion-card">
        <span class="champion-status">
          ${escapeHTML(officialTitle)}
        </span>

        ${
  official.photoUrl
    ? `<img
         class="champion-photo"
         src="${escapeHTML(official.photoUrl)}"
         alt="${escapeHTML(officialNames)} holding the Club Amigos trophy"
         referrerpolicy="no-referrer"
         loading="lazy"
       >`
    : `<div class="champion-icon">🏆</div>`
}

        <p class="eyebrow">${escapeHTML(period)}</p>

        <h3>${escapeHTML(officialNames)}</h3>

        <div class="champion-points">
          ${Number(official.points) || 0} Points
        </div>
      </div>
    `;
    return;
  }

  // Otherwise display the provisional monthly leader.
  const rows = calculateStandings(
    publishedMatches,
    "month",
    year,
    month
  );

  if (!rows.length) {
    championsDisplay.innerHTML = `
      <div class="champion-empty">
        No published match statistics for
        ${escapeHTML(period)}.
      </div>
    `;
    return;
  }

  const leader = rows[0];

const leaders = rows.filter(row =>
  row.points === leader.points &&
  row.winPercentage === leader.winPercentage &&
  row.played === leader.played
);

const leaderNames = leaders
  .map(row => row.name)
  .sort((a, b) => a.localeCompare(b))
  .join(" & ");

  const currentPeriod =
    Number(year) === today.getFullYear() &&
    Number(month) === today.getMonth() + 1;

  const statusText = currentPeriod
  ? leaders.length > 1
    ? "Current Joint Monthly Leaders"
    : "Current Monthly Leader"
  : leaders.length > 1
    ? "Month Completed — Joint Leaders Awaiting Confirmation"
    : "Month Completed — Awaiting Confirmation";

  const note = currentPeriod
    ? "This is the live monthly leader. Rankings update automatically after every published match."
    : "This month has ended. The official monthly champion has not yet been confirmed by the admin.";

  championsDisplay.innerHTML = `
    <div class="champion-card">
      <span class="champion-status">
        ${escapeHTML(statusText)}
      </span>

      <div class="champion-icon">🏆</div>

      <p class="eyebrow">${escapeHTML(period)}</p>

      <h3>${escapeHTML(leaderNames)}</h3>

      <div class="champion-points">
        ${leader.points} Points
      </div>

      <p class="champion-note">
        ${escapeHTML(note)}
      </p>
    </div>
  `;
}


championsYear.addEventListener("change", renderChampion);
championsMonth.addEventListener("change", renderChampion);


// Public navigation.
const pages = {
  standings: "standingsPage",
  "golden-boot": "goldenBootPage",
  motm: "motmPage",
  results: "resultsPage",
  champions: "championsPage"
};

document.querySelectorAll("[data-page]").forEach(button => {
  button.addEventListener("click", () => {
    document.querySelectorAll("[data-page]").forEach(btn => {
      btn.classList.toggle("active", btn === button);
    });

    Object.entries(pages).forEach(([key, id]) => {
      document.getElementById(id).hidden =
        key !== button.dataset.page;
    });
  });
});

viewSelect.addEventListener("change", renderStandings);
yearSelect.addEventListener("change", renderStandings);
monthSelect.addEventListener("change", renderStandings);

// Published results are public; no admin login needed.
onValue(
  ref(db, "publicMatches"),
  snapshot => {
    

publishedMatches = snapshot.val() || {};
updateYears();
renderStandings();
updateAwardSections();
updateResultsYears();
renderResults();
updateChampionYears();
renderChampion();


  },
  error => {
    console.error(error);
    message.textContent =
      "Unable to load league data. Check Firebase public read rules.";
  }
);

// Historical league statistics for All-Time Standings.
onValue(
  ref(db, "legacyStats"),
  snapshot => {
    legacyStats = snapshot.val() || {};
    renderStandings();
  },
  error => {
    console.error("Unable to load historical statistics:", error);
  }
);