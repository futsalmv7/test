
import { auth, db } from "./firebase.js";

import {
  ref,
  get,
  update,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-database.js";

const resultEditor = document.getElementById("resultEditor");
const resultMessage = document.getElementById("resultMessage");
const resultScorers = document.getElementById("resultScorers");
const resultMotm = document.getElementById("resultMotm");

const resultScoreA = document.getElementById("resultScoreA");
const resultScoreB = document.getElementById("resultScoreB");
const publishButton = document.getElementById("publishResultButton");

let currentMatchId = null;
let openedMatch = null;

function participants(match) {
  return Object.entries(match.players || {})
    .filter(([, player]) =>
      ["present", "late"].includes(player.attendance) &&
      ["A", "B"].includes(player.team)
    )
    .map(([id, player]) => ({ id, ...player }))
    .sort((a, b) =>
      a.team.localeCompare(b.team) ||
      a.name.localeCompare(b.name)
    );
}

function updateTotals() {
  let goalsA = 0;
  let goalsB = 0;

  resultScorers.querySelectorAll("[data-scorer-id]")
    .forEach((input) => {
      const goals = Number(input.value) || 0;

      if (input.dataset.team === "A") goalsA += goals;
      if (input.dataset.team === "B") goalsB += goals;
    });

  document.getElementById("resultGoalTotals").textContent =
    `Goals entered: ${goalsA} / ${resultScoreA.value || 0} ` +
    `for Team A, ${goalsB} / ${resultScoreB.value || 0} for Team B`;
}

function showResultEditor(id, match) {
  currentMatchId = id;
  openedMatch = match;
  resultMessage.textContent = "";

  resultEditor.hidden = !id || !match ||
    match.status !== "draft";

  if (resultEditor.hidden) return;

  const nameA = match.teamNameA || "Team A";
  const nameB = match.teamNameB || "Team B";

  document.getElementById("resultTeamNames").textContent =
    `${nameA} vs ${nameB}`;

  document.getElementById("resultLabelA").textContent = nameA;
  document.getElementById("resultLabelB").textContent = nameB;

  resultScoreA.value = 0;
  resultScoreB.value = 0;

  resultScorers.replaceChildren();
  resultMotm.replaceChildren(
    new Option("Select Man of the Match", "")
  );

  participants(match).forEach((player) => {
    const row = document.createElement("div");
    row.className = "result-scorer-row";

    const label = document.createElement("label");
    label.textContent =
      `${player.name} (${player.team === "A" ? nameA : nameB})`;

    const input = document.createElement("input");
    input.type = "number";
    input.min = "0";
    input.max = "99";
    input.value = "0";
    input.dataset.scorerId = player.id;
    input.dataset.team = player.team;

    label.htmlFor = `result-goals-${player.id}`;
    input.id = `result-goals-${player.id}`;

    row.append(label, input);
    resultScorers.append(row);

    resultMotm.add(
      new Option(player.name, player.id)
    );
  });

  updateTotals();
}

window.addEventListener("amigos:match-opened", (event) => {
  showResultEditor(event.detail.id, event.detail.match);
});

resultScorers.addEventListener("input", updateTotals);
resultScoreA.addEventListener("input", updateTotals);
resultScoreB.addEventListener("input", updateTotals);

function collectResult(match) {
  const scoreA = Number(resultScoreA.value);
  const scoreB = Number(resultScoreB.value);

  if (
    resultScoreA.value.trim() === "" ||
    resultScoreB.value.trim() === "" ||
    !Number.isInteger(scoreA) ||
    !Number.isInteger(scoreB) ||
    scoreA < 0 || scoreB < 0 ||
    scoreA > 99 || scoreB > 99
  ) {
    throw new Error("Enter valid final scores from 0 to 99.");
  }

  const players = participants(match);
  const scorerInputs = [
    ...resultScorers.querySelectorAll("[data-scorer-id]")
  ];

  if (!players.some(p => p.team === "A") ||
      !players.some(p => p.team === "B")) {
    throw new Error("Both teams need participating players.");
  }

  if (scorerInputs.length !== players.length) {
    throw new Error("Reopen the draft to refresh the player list.");
  }

  const goals = {};
  let totalA = 0;
  let totalB = 0;

  for (const player of players) {
    const input = scorerInputs.find(
      el => el.dataset.scorerId === player.id
    );

    if (!input || input.dataset.team !== player.team) {
      throw new Error("Player assignments changed. Reopen the draft.");
    }

    const value = Number(input.value);

    if (
      input.value.trim() === "" ||
      !Number.isInteger(value) ||
      value < 0 ||
      value > 99
    ) {
      throw new Error("Enter valid whole-number goal counts.");
    }

    if (value > 0) {
      goals[player.id] = value;
    }

    if (player.team === "A") totalA += value;
    if (player.team === "B") totalB += value;
  }

  if (totalA !== scoreA || totalB !== scoreB) {
    throw new Error(
      "Player goals must add up to each team's final score."
    );
  }

  const manOfMatch = resultMotm.value;

  if (!players.some(player => player.id === manOfMatch)) {
    throw new Error("Select a Man of the Match.");
  }

  return { scoreA, scoreB, goals, manOfMatch };
}

publishButton.addEventListener("click", async () => {
  if (!currentMatchId || !openedMatch) return;

  if (!auth.currentUser) {
    resultMessage.textContent = "Please sign in as admin.";
    return;
  }

  publishButton.disabled = true;

  try {
    // Verify admin access.
    const adminSnap = await get(
      ref(db, `admins/${auth.currentUser.uid}/enabled`)
    );

    if (adminSnap.val() !== true) {
      throw new Error("Admin access required.");
    }

    // Load the latest saved draft.
    const snapshot = await get(
      ref(db, `matchDays/${currentMatchId}`)
    );

    if (!snapshot.exists()) {
      throw new Error("Match draft not found.");
    }

    const match = snapshot.val();

    if (match.status !== "draft") {
      throw new Error("This match has already been published.");
    }

    // Make sure the draft was not changed after opening it.
    const sameSetup = JSON.stringify({
      date: match.date,
      venue: match.venue,
      captainA: match.captainA,
      captainB: match.captainB,
      players: match.players
    }) === JSON.stringify({
      date: openedMatch.date,
      venue: openedMatch.venue,
      captainA: openedMatch.captainA,
      captainB: openedMatch.captainB,
      players: openedMatch.players
    });

    if (!sameSetup) {
      throw new Error(
        "The saved draft changed. Close and reopen it."
      );
    }

    // Do not publish unsaved changes in the draft editor.
    const form = document.getElementById("matchForm");

    if (
      document.getElementById("matchDate").value !== match.date ||
      document.getElementById("matchVenue").value.trim() !==
        (match.venue || "") ||
      document.getElementById("captainA").value !== match.captainA ||
      document.getElementById("captainB").value !== match.captainB
    ) {
      throw new Error(
        "Save your draft changes and reopen it before publishing."
      );
    }

    const savedPlayers = match.players || {};
    const rows = [
      ...document.querySelectorAll("#matchPlayersList [data-player-id]")
    ];

    for (const row of rows) {
      const id = row.dataset.playerId;
      const stored = savedPlayers[id];
      const team = row.querySelector(".team-select").value;
      const attendance = row.querySelector(".attendance-select").value;

      if (
        team !== (stored?.team || "") ||
        attendance !== (stored?.attendance || "notSelected")
      ) {
        throw new Error(
          "Save player assignment changes and reopen the draft."
        );
      }
    }

    const result = collectResult(match);

    const confirmed = window.confirm(
      `Publish ${match.teamNameA} ${result.scoreA} - ` +
      `${result.scoreB} ${match.teamNameB}?`
    );

    if (!confirmed) return;

    resultMessage.textContent = "Publishing result...";

    const publishedMatch = {
      ...match,
      ...result,
      status: "published",
      publishedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };

    // Update private and public copies together.
    await update(ref(db), {
      [`matchDays/${currentMatchId}`]: publishedMatch,
      [`publicMatches/${currentMatchId}`]: publishedMatch
    });

    resultMessage.textContent = "Result published successfully!";
    resultEditor.hidden = true;
    document.getElementById("matchEditor").hidden = true;

  } catch (error) {
    console.error(error);
    resultMessage.textContent =
      error.message || "Unable to publish result.";
  } finally {
    publishButton.disabled = false;
  }
});
