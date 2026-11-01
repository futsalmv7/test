
import { auth, db } from "./firebase.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";

import {
  ref,
  onValue,
  push,
  set,
  update,
  get,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-database.js";

const playersSection = document.getElementById("playersSection");
const playersList = document.getElementById("playersList");
const playerCount = document.getElementById("playerCount");
const playerSearch = document.getElementById("playerSearch");

const playerModal = document.getElementById("playerModal");
const playerForm = document.getElementById("playerForm");
const playerIdInput = document.getElementById("playerId");
const playerNameInput = document.getElementById("playerName");
const playerNicknameInput = document.getElementById("playerNickname");
const playerFormMessage = document.getElementById("playerFormMessage");

let players = {};
let unsubscribePlayers = null;

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function initials(name) {
  return String(name)
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0] || "")
    .join("")
    .toUpperCase();
}

function renderPlayers() {
  const search = playerSearch.value.trim().toLowerCase();

  const entries = Object.entries(players)
    .filter(([, player]) => player?.name)
    .filter(([, player]) =>
      player.name.toLowerCase().includes(search) ||
      String(player.nickname || "").toLowerCase().includes(search)
    )
    .sort((a, b) => {
      const archivedA = a[1].active === false ? 1 : 0;
      const archivedB = b[1].active === false ? 1 : 0;

      return archivedA - archivedB ||
        a[1].name.localeCompare(b[1].name);
    });

  playerCount.textContent =
    `${entries.length} player(s) shown`;

  if (!entries.length) {
    playersList.innerHTML =
      '<p class="subtitle">No players found.</p>';
    return;
  }

  playersList.innerHTML = entries.map(([id, player]) => {
    const archived = player.active === false;

    return `
      <div class="player-row ${archived ? "archived" : ""}">
        <div class="player-avatar">
          ${escapeHTML(initials(player.name))}
        </div>

        <div class="player-info">
          <strong>${escapeHTML(player.name)}</strong>
          <small>
            ${escapeHTML(player.nickname || (archived ? "Archived" : "Active"))}
            ${player.nickname && archived ? " · Archived" : ""}
          </small>
        </div>

        <div class="player-actions">
          <button class="small-btn"
                  data-action="edit"
                  data-id="${escapeHTML(id)}">
            Edit
          </button>

          <button class="small-btn"
                  data-action="toggle"
                  data-id="${escapeHTML(id)}">
            ${archived ? "Reactivate" : "Archive"}
          </button>
        </div>
      </div>
    `;
  }).join("");
}

function openPlayerModal(id = "") {
  playerForm.reset();
  playerFormMessage.textContent = "";
  playerIdInput.value = id;

  const player = players[id];

  if (player) {
    document.getElementById("playerModalTitle").textContent =
      "Edit Player";

    playerNameInput.value = player.name || "";
    playerNicknameInput.value = player.nickname || "";
  } else {
    document.getElementById("playerModalTitle").textContent =
      "Add Player";
  }

  playerModal.hidden = false;
  playerNameInput.focus();
}

function closePlayerModal() {
  playerModal.hidden = true;
}

document.getElementById("addPlayerButton")
  .addEventListener("click", () => openPlayerModal());

document.getElementById("closePlayerModal")
  .addEventListener("click", closePlayerModal);

playerModal.addEventListener("click", (event) => {
  if (event.target === playerModal) closePlayerModal();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !playerModal.hidden) {
    closePlayerModal();
  }
});

playerSearch.addEventListener("input", renderPlayers);

playersList.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) return;

  const id = button.dataset.id;
  const player = players[id];
  if (!player) return;

  if (button.dataset.action === "edit") {
    openPlayerModal(id);
    return;
  }

  if (button.dataset.action === "toggle") {
    const newActive = player.active === false;

    const confirmed = window.confirm(
      newActive
        ? `Reactivate ${player.name}?`
        : `Archive ${player.name}? Historical stats will be kept.`
    );

    if (!confirmed) return;

    button.disabled = true;

    try {
      await update(ref(db, `players/${id}`), {
        active: newActive,
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      console.error(error);
      alert("Could not update player. Check Firebase permissions.");
      button.disabled = false;
    }
  }
});

playerForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const name = playerNameInput.value.trim().replace(/\s+/g, " ");
  const nickname = playerNicknameInput.value.trim();
  const id = playerIdInput.value;

  if (!name) return;

  const duplicate = Object.entries(players).some(
    ([existingId, player]) =>
      existingId !== id &&
      player.name?.toLowerCase() === name.toLowerCase()
  );

  if (duplicate) {
    playerFormMessage.textContent =
      "A player with this name already exists.";
    return;
  }

  const submitButton = playerForm.querySelector(
    'button[type="submit"]'
  );

  submitButton.disabled = true;
  playerFormMessage.textContent = "Saving...";

  try {
    if (id) {
      await update(ref(db, `players/${id}`), {
        name,
        nickname,
        updatedAt: serverTimestamp()
      });
    } else {
      const newPlayerRef = push(ref(db, "players"));

      await set(newPlayerRef, {
        name,
        nickname,
        active: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    }

    closePlayerModal();
  } catch (error) {
    console.error(error);
    playerFormMessage.textContent =
      "Could not save player. Check database permissions.";
  } finally {
    submitButton.disabled = false;
  }
});

document.querySelectorAll('[data-section="players"]')
  .forEach((button) => {
    button.addEventListener("click", () => {
      playersSection.hidden = false;
      playersSection.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    });
  });

document.querySelectorAll(
  '[data-section]:not([data-section="players"])'
).forEach((button) => {
  button.addEventListener("click", () => {
    playersSection.hidden = true;
  });
});

onAuthStateChanged(auth, async (user) => {
  if (unsubscribePlayers) {
    unsubscribePlayers();
    unsubscribePlayers = null;
  }

  players = {};
  renderPlayers();

  if (!user) return;

  try {
    const adminSnapshot = await get(
      ref(db, `admins/${user.uid}/enabled`)
    );

    if (adminSnapshot.val() !== true) return;

    unsubscribePlayers = onValue(
      ref(db, "players"),
      (snapshot) => {
        players = snapshot.val() || {};
        renderPlayers();
      },
      (error) => {
        console.error(error);
        playerCount.textContent =
          "Unable to load players. Check database rules.";
      }
    );
  } catch (error) {
    console.error("Admin verification failed:", error);
  }
});
