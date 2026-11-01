
import { auth, db } from "./firebase.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";

import {
  ref,
  get,
  push,
  set,
  update,
  onValue,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-database.js";

const matchesSection = document.getElementById("matchesSection");
const matchEditor = document.getElementById("matchEditor");
const matchForm = document.getElementById("matchForm");
const matchPlayersList = document.getElementById("matchPlayersList");
const matchesList = document.getElementById("matchesList");
const matchesMessage = document.getElementById("matchesMessage");
const matchFormMessage = document.getElementById("matchFormMessage");

const captainASelect = document.getElementById("captainA");
const captainBSelect = document.getElementById("captainB");
const teamNameA = document.getElementById("teamNameA");
const teamNameB = document.getElementById("teamNameB");
const captainMessage = document.getElementById("captainMessage");


let players = {};
let matches = {};
let editingMatchId = null;
let stopPlayers = null;
let stopMatches = null;
let authorized = false;

const selections = {};

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function showSection(section) {
  matchesSection.hidden = section !== "matches";
}

document.querySelectorAll("[data-section]").forEach((button) => {
  button.addEventListener("click", () => {
    showSection(button.dataset.section);
  });
});


function captainDisplayName(id) {
  const player = players[id];

  if (!player) return "";

  return (player.nickname || player.name || "").trim();
}

function renderCaptainOptions() {
  const selectedA = captainASelect.value;
  const selectedB = captainBSelect.value;

  const availablePlayers = Object.entries(players)
    .filter(([id, player]) =>
      player?.name &&
      (
        player.active !== false ||
        id === selectedA ||
        id === selectedB
      )
    )
    .sort((a, b) => a[1].name.localeCompare(b[1].name));

  for (const select of [captainASelect, captainBSelect]) {
    const previousValue = select.value;

    select.replaceChildren(
      new Option("Select Captain", "")
    );

    availablePlayers.forEach(([id, player]) => {
      select.add(
        new Option(player.nickname || player.name, id)
      );
    });

    select.value = previousValue;
  }

  updateCaptainNames();
}

function updateCaptainNames() {
  const nameA = captainDisplayName(captainASelect.value);
  const nameB = captainDisplayName(captainBSelect.value);

  teamNameA.textContent = nameA ? `Team ${nameA}` : "Team A";
  teamNameB.textContent = nameB ? `Team ${nameB}` : "Team B";

  captainMessage.textContent = "";

  if (captainASelect.value &&
      captainASelect.value === captainBSelect.value) {
    captainMessage.textContent =
      "Choose two different captains.";
  }
}

function assignCaptain(id, team) {
  if (!id) return;

  selections[id] = {
    team,
    attendance: "present"
  };
}

function updateCaptainAssignments() {
  const captainA = captainASelect.value;
  const captainB = captainBSelect.value;

  if (captainA && captainA === captainB) {
    updateCaptainNames();
    return;
  }

  // Keep previous selections for everyone else.
  // Captains are automatically assigned to their teams.
  assignCaptain(captainA, "A");
  assignCaptain(captainB, "B");

  updateCaptainNames();
  renderPlayerSelections();
}

captainASelect.addEventListener(
  "change",
  updateCaptainAssignments
);

captainBSelect.addEventListener(
  "change",
  updateCaptainAssignments
);


function renderPlayerSelections() {
  const entries = Object.entries(players)
    .filter(([id, player]) =>
      player?.name &&
      (player.active !== false || selections[id])
    )
    .sort((a, b) => a[1].name.localeCompare(b[1].name));

  matchPlayersList.innerHTML = entries.map(([id, player]) => {
    const selection = selections[id] || {
      team: "",
      attendance: "notSelected"
    };

    const isCaptain =
  id === captainASelect.value ||
  id === captainBSelect.value;

    return `
      <div class="match-player-row" data-player-id="${escapeHTML(id)}">
        <div class="match-player-name">
          ${escapeHTML(player.name)}
        </div>

        <div>
          
<select class="team-select"
        ${isCaptain ? "disabled" : ""}
        aria-label="Team for ${escapeHTML(player.name)}">

            <option value="">No Team</option>
            <option value="A" ${selection.team === "A" ? "selected" : ""}>
              Team A
            </option>
            <option value="B" ${selection.team === "B" ? "selected" : ""}>
              Team B
            </option>
          </select>

          
<select class="attendance-select"
        ${isCaptain ? "disabled" : ""}
        aria-label="Attendance for ${escapeHTML(player.name)}">

            <option value="notSelected"
              ${selection.attendance === "notSelected" ? "selected" : ""}>
              Not Selected
            </option>
            <option value="present"
              ${selection.attendance === "present" ? "selected" : ""}>
              Present
            </option>
            <option value="late"
              ${selection.attendance === "late" ? "selected" : ""}>
              Late
            </option>
            <option value="absent"
              ${selection.attendance === "absent" ? "selected" : ""}>
              Absent
            </option>
          </select>
        </div>
      </div>
    `;
  }).join("");

  updateCounts();
}

function updateCounts() {
  let a = 0;
  let b = 0;
  let absent = 0;

  Object.values(selections).forEach((item) => {
    if (item.attendance === "absent") {
      absent++;
    } else if (item.attendance === "present" ||
               item.attendance === "late") {
      if (item.team === "A") a++;
      if (item.team === "B") b++;
    }
  });

  document.getElementById("teamACount").textContent =
    `${a} players`;

  document.getElementById("teamBCount").textContent =
    `${b} players`;

  document.getElementById("absentCount").textContent =
    `${absent} players`;
}

matchPlayersList.addEventListener("change", (event) => {
  const row = event.target.closest("[data-player-id]");
  if (!row) return;

  const id = row.dataset.playerId;
  const team = row.querySelector(".team-select").value;
  const attendance = row.querySelector(".attendance-select").value;

  selections[id] = { team, attendance };

  updateCounts();
});

function openMatchEditor(id = null) {
  editingMatchId = id;
  matchForm.reset();
  matchFormMessage.textContent = "";

  Object.keys(selections).forEach((key) => delete selections[key]);

  if (id && matches[id]) {
    const match = matches[id];

    document.getElementById("matchEditorTitle").textContent =
      "Edit Match Day";

    document.getElementById("matchDate").value = match.date || "";
document.getElementById("matchTime").value = match.time || "";
document.getElementById("matchVenue").value = match.venue || "";

    Object.assign(selections, match.players || {});
  } else {
    document.getElementById("matchEditorTitle").textContent =
      "New Match Day";

    document.getElementById("matchDate").value =
      new Date().toLocaleDateString("en-CA");
  }

  
captainASelect.value = id && matches[id]
  ? matches[id].captainA || ""
  : "";

captainBSelect.value = id && matches[id]
  ? matches[id].captainB || ""
  : "";

renderCaptainOptions();

captainASelect.value = id && matches[id]
  ? matches[id].captainA || ""
  : "";

captainBSelect.value = id && matches[id]
  ? matches[id].captainB || ""
  : "";

updateCaptainAssignments();

  
matchEditor.hidden = false;

window.dispatchEvent(new CustomEvent("amigos:match-opened", {
  detail: {
    id: editingMatchId,
    match: editingMatchId ? matches[editingMatchId] : null
  }
}));

matchEditor.scrollIntoView({ behavior: "smooth" });

}

document.getElementById("newMatchButton")
  .addEventListener("click", () => openMatchEditor());

document.getElementById("closeMatchEditor")
  .addEventListener("click", () => {
    matchEditor.hidden = true;
  });

matchesList.addEventListener("click", (event) => {
  const resultButton = event.target.closest("[data-view-result]");

  if (resultButton) {
    const id = resultButton.dataset.viewResult;
    const match = matches[id];

    if (match?.status === "published") {
      openResultCard(match);
    }

    return;
  }

  const editButton = event.target.closest("[data-edit-match]");
  if (!editButton) return;

  const id = editButton.dataset.editMatch;

  if (matches[id]?.status === "draft") {
    openMatchEditor(id);
  }
});

/* SHAREABLE PUBLISHED MATCH RESULT */

function openResultCard(match) {
  const modal = document.getElementById("resultCardModal");
  const content = document.getElementById("shareCardContent");

  const nameA = escapeHTML(match.teamNameA || "Team A");
  const nameB = escapeHTML(match.teamNameB || "Team B");

  const formattedDate = match.date
  ? new Date(`${match.date}T12:00:00`).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric"
    })
  : "Date not set";
  const formattedTime = match.time
  ? new Date(`2000-01-01T${match.time}:00`).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true
    })
  : "";

  const scorers = (team) => {
    const entries = Object.entries(match.goals || {})
      .filter(([id, goals]) =>
        match.players?.[id]?.team === team &&
        Number(goals) > 0
      )
      .map(([id, goals]) => ({
        name: match.players[id].name || "Unknown",
        goals: Number(goals)
      }))
      .sort((a, b) => b.goals - a.goals);

    if (!entries.length) {
      return `<p>No goals scored</p>`;
    }

    return entries.map(player => `
      <p>
        ${escapeHTML(player.name)}
        ${player.goals > 1 ? `× ${player.goals}` : ""}
      </p>
    `).join("");
  };

  const motm = match.manOfMatch
    ? match.players?.[match.manOfMatch]?.name || "Unknown"
    : "Not recorded";

  content.innerHTML = `
    <div class="share-match-meta">
  <p>
    📅 ${escapeHTML(formattedDate)}
    ${formattedTime ? ` · 🕒 ${escapeHTML(formattedTime)}` : ""}
  </p>
  <p>📍 ${escapeHTML(match.venue || "Venue not set")}</p>
</div>

    <div class="share-match-score">
      <div class="share-team-name">${nameA}</div>

      <div class="share-score">
        ${Number(match.scoreA)} - ${Number(match.scoreB)}
      </div>

      <div class="share-team-name">${nameB}</div>
    </div>

    <div class="share-scorers">
      <div>
        <h3>${nameA} Scorers</h3>
        ${scorers("A")}
      </div>

      <div>
        <h3>${nameB} Scorers</h3>
        ${scorers("B")}
      </div>
    </div>

    <div class="share-motm">
      ⭐ MAN OF THE MATCH
      <strong>${escapeHTML(motm)}</strong>
    </div>
  `;

  modal.hidden = false;
  document.body.style.overflow = "hidden";
}

function renderMatches() {
  const entries = Object.entries(matches)
    .sort((a, b) =>
      (b[1].date || "").localeCompare(a[1].date || "")
    );

  matchesMessage.textContent =
    `${entries.length} match day(s)`;

  if (!entries.length) {
    matchesList.innerHTML =
      '<p class="subtitle">No match days created yet.</p>';
    return;
  }

  matchesList.innerHTML = entries.map(([id, match]) => {
    const nameA = escapeHTML(match.teamNameA || "Team A");
    const nameB = escapeHTML(match.teamNameB || "Team B");

    const isPublished = match.status === "published";

    const title = isPublished
      ? `${nameA} ${Number(match.scoreA) || 0} - ` +
        `${Number(match.scoreB) || 0} ${nameB}`
      : `${nameA} vs ${nameB}`;

    return `
      <article class="match-list-card">
        <strong>${title}</strong>

        <small>
          ${escapeHTML(match.date || "No date")}
          · ${escapeHTML(match.venue || "Venue not set")}
          · ${isPublished ? "Published" : "Draft"}
        </small>

        ${!isPublished ? `
  <button class="small-btn"
          data-edit-match="${escapeHTML(id)}">
    Edit Draft / Enter Result
  </button>
` : `
  <button class="small-btn"
          type="button"
          data-view-result="${escapeHTML(id)}">
    🖼️ View Result Card
  </button>
`}
      </article>
    `;
  }).join("");
}


matchForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!authorized) {
    matchFormMessage.textContent = "Admin access required.";
    return;
  }


const captainA = captainASelect.value;
const captainB = captainBSelect.value;

if (!captainA || !captainB) {
  matchFormMessage.textContent =
    "Please select both team captains.";
  return;
}

if (captainA === captainB) {
  matchFormMessage.textContent =
    "Choose two different captains.";
  return;
}

// Ensure both captains are assigned to their teams.
assignCaptain(captainA, "A");
assignCaptain(captainB, "B");


  const date = document.getElementById("matchDate").value;
const time = document.getElementById("matchTime").value;
const venue = document.getElementById("matchVenue").value.trim();

  const selectedPlayers = {};

  for (const [id, selection] of Object.entries(selections)) {
    const { team, attendance } = selection;

    if (attendance === "notSelected") {
      if (team) {
        matchFormMessage.textContent =
          "A player with a team must be marked Present or Late.";
        return;
      }
      continue;
    }

    if ((attendance === "present" || attendance === "late") &&
        !["A", "B"].includes(team)) {
      matchFormMessage.textContent =
        "Every participating player needs a team.";
      return;
    }

    if (attendance === "absent" && team) {
      matchFormMessage.textContent =
        "Absent players must have No Team selected.";
      return;
    }

    selectedPlayers[id] = {
      team: attendance === "absent" ? "" : team,
      attendance,
      name: players[id]?.name || ""
    };
  }

  const participating = Object.values(selectedPlayers)
    .filter((player) =>
      player.attendance === "present" ||
      player.attendance === "late"
    );

  const teamA = participating.filter((p) => p.team === "A");
  const teamB = participating.filter((p) => p.team === "B");

  if (!teamA.length || !teamB.length) {
    matchFormMessage.textContent =
      "Both Team A and Team B need at least one player.";
    return;
  }

  const saveButton = matchForm.querySelector(
    'button[type="submit"]'
  );

  saveButton.disabled = true;
  matchFormMessage.textContent = "Saving draft...";

  try {
    
const data = {
  date,
  time,
  venue,

  captainA,
  captainB,

  teamNameA: `Team ${captainDisplayName(captainA)}`,
  teamNameB: `Team ${captainDisplayName(captainB)}`,

  players: selectedPlayers,
  status: "draft",
  updatedAt: serverTimestamp()
};


    if (editingMatchId) {
      await update(
        ref(db, `matchDays/${editingMatchId}`),
        data
      );
    } else {
      const newMatchRef = push(ref(db, "matchDays"));

      await set(newMatchRef, {
        ...data,
        createdAt: serverTimestamp()
      });
    }

    matchEditor.hidden = true;
    matchFormMessage.textContent = "";
  } catch (error) {
    console.error(error);
    matchFormMessage.textContent =
      "Unable to save draft. Check Firebase rules.";
  } finally {
    saveButton.disabled = false;
  }
});

onAuthStateChanged(auth, async (user) => {
  stopPlayers?.();
  stopMatches?.();

  stopPlayers = null;
  stopMatches = null;
  authorized = false;

  players = {};
  matches = {};
  renderMatches();

  if (!user) {
    matchesSection.hidden = true;
    matchEditor.hidden = true;
    return;
  }

  try {
    const adminSnap = await get(
      ref(db, `admins/${user.uid}/enabled`)
    );

    if (auth.currentUser?.uid !== user.uid ||
        adminSnap.val() !== true) return;

    authorized = true;

    
stopPlayers = onValue(ref(db, "players"), (snapshot) => {
  players = snapshot.val() || {};

  if (!matchEditor.hidden) {
    renderCaptainOptions();
    renderPlayerSelections();
  }
});


    stopMatches = onValue(
      ref(db, "matchDays"),
      (snapshot) => {
        matches = snapshot.val() || {};
        renderMatches();
      },
      (error) => {
        console.error(error);
        matchesMessage.textContent =
          "Unable to load matches. Check database rules.";
      }
    );
  } catch (error) {
    console.error(error);
    matchesMessage.textContent =
      "Unable to verify admin access.";
  }
});

const resultCardModal = document.getElementById("resultCardModal");
const resultCardToolbar = document.querySelector(".result-card-toolbar");
const screenshotResultCard = document.getElementById("screenshotResultCard");

screenshotResultCard.addEventListener("click", (event) => {
  event.stopPropagation();

  resultCardModal.classList.add("screenshot-mode");
  resultCardToolbar.hidden = true;
});

resultCardModal.addEventListener("click", () => {
  if (!resultCardModal.classList.contains("screenshot-mode")) {
    return;
  }

  resultCardModal.classList.remove("screenshot-mode");
  resultCardToolbar.hidden = false;
});

document.getElementById("closeResultCard")
  .addEventListener("click", () => {
    resultCardModal.hidden = true;
    resultCardModal.classList.remove("screenshot-mode");
    resultCardToolbar.hidden = false;
    document.body.style.overflow = "";
  });