
import { auth, db } from "./firebase.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";

import {
  ref,
  get,
  onValue,
  runTransaction,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-database.js";

import {
  calculateStandings
} from "./standings-calculator.js";

const section = document.getElementById("championsAdminSection");
const yearSelect = document.getElementById("adminChampionYear");
const monthSelect = document.getElementById("adminChampionMonth");
const preview = document.getElementById("adminChampionPreview");
const message = document.getElementById("adminChampionMessage");
const finalizeButton = document.getElementById("finalizeChampionButton");

const championPhoto = document.getElementById("adminChampionPhoto");
const championPhotoPreview = document.getElementById("adminChampionPhotoPreview");

let photoLoaded = false;

function isValidImgurPhoto(value) {
  try {
    const url = new URL(value.trim());

    return (
      url.protocol === "https:" &&
      url.hostname === "i.imgur.com" &&
      /^\/[a-zA-Z0-9]+\.(jpg|jpeg|png|webp)$/i.test(url.pathname) &&
      !url.search &&
      !url.hash
    );
  } catch {
    return false;
  }
}

const today = new Date();
const currentYear = today.getFullYear();

const monthNames = [
  "January", "February", "March", "April",
  "May", "June", "July", "August",
  "September", "October", "November", "December"
];

let publishedMatches = {};
let savedChampions = {};
let authorized = false;
let stopMatches = null;
let stopChampions = null;
let busy = false;

monthSelect.value =
  String(today.getMonth() + 1).padStart(2, "0");

function selectedKey() {
  return `${yearSelect.value}-${monthSelect.value}`;
}

function isCompletedMonth(year, month) {
  const selected = Number(year) * 12 + Number(month);
  const current = new Date().getFullYear() * 12 +
    new Date().getMonth() + 1;

  return selected < current;
}

function updateYears() {
  const previous = yearSelect.value || String(currentYear);
  const years = new Set([currentYear]);

  Object.values(publishedMatches).forEach(match => {
    if (/^\d{4}-\d{2}-\d{2}$/.test(match?.date || "")) {
      years.add(Number(match.date.slice(0, 4)));
    }
  });

  Object.keys(savedChampions).forEach(key => {
    if (/^\d{4}-\d{2}$/.test(key)) {
      years.add(Number(key.slice(0, 4)));
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

function getLeader() {
  const rows = calculateStandings(
    publishedMatches,
    "month",
    yearSelect.value,
    monthSelect.value
  );

  return rows[0] || null;
}

function getJointLeaders() {
  const leader = getLeader();

  if (!leader) return [];

  const rows = calculateStandings(
    publishedMatches,
    "month",
    yearSelect.value,
    monthSelect.value
  );

  return rows.filter(row =>
    row.points === leader.points &&
    row.winPercentage === leader.winPercentage &&
    row.played === leader.played
  );
}


function updatePhotoPreview() {
  const url = championPhoto.value.trim();

  photoLoaded = false;
  championPhotoPreview.hidden = true;
  championPhotoPreview.removeAttribute("src");

  if (!isValidImgurPhoto(url)) {
    championPhoto.setCustomValidity(
      url ? "Enter a direct i.imgur.com image URL." : ""
    );
    render();
    return;
  }

  championPhoto.setCustomValidity("");

  const expectedUrl = url;

  championPhotoPreview.onload = () => {
    if (championPhoto.value.trim() !== expectedUrl) return;

    photoLoaded = true;
    championPhotoPreview.hidden = false;
    render();
  };

  championPhotoPreview.onerror = () => {
    if (championPhoto.value.trim() !== expectedUrl) return;

    photoLoaded = false;
    championPhotoPreview.hidden = true;
    render();
  };

  championPhotoPreview.referrerPolicy = "no-referrer";
  championPhotoPreview.src = expectedUrl;
  render();
}

championPhoto.addEventListener("input", updatePhotoPreview);


function render() {
  const key = selectedKey();
  const saved = savedChampions[key];
  const leader = getLeader();
  const leaders = getJointLeaders();
  const completed = isCompletedMonth(
    yearSelect.value,
    monthSelect.value
  );

  finalizeButton.disabled =
  !authorized ||
  busy ||
  !completed ||
  !leader ||
  !!saved ||
  !photoLoaded ||
  !isValidImgurPhoto(championPhoto.value);

  const period = `${monthNames[Number(monthSelect.value) - 1]} ${yearSelect.value}`;

  preview.replaceChildren();

  const heading = document.createElement("h3");
  const details = document.createElement("p");

  if (saved) {
  const savedWinners =
    Array.isArray(saved.champions) && saved.champions.length
      ? saved.champions
      : [{ playerName: saved.playerName }];

  const savedNames = savedWinners
    .map(player => player.playerName || "Champion")
    .sort((a, b) => a.localeCompare(b))
    .join(" & ");

  heading.textContent = savedWinners.length > 1
    ? "🏆 Official Joint Monthly Champions"
    : "🏆 Official Monthly Champion";

  details.textContent =
    `${savedNames} — ${saved.points} points (${period})`;

  message.textContent = "This month has already been finalized.";
} else if (!leader) {
    heading.textContent = "No monthly leader";
    details.textContent = `No published matches for ${period}.`;
    message.textContent = "Nothing to finalize.";
  } else {
    heading.textContent = completed
  ? leaders.length > 1
    ? "Joint Monthly Leaders — Awaiting Confirmation"
    : "Monthly Leader — Ready for Confirmation"
  : leaders.length > 1
    ? "Current Joint Monthly Leaders"
    : "Current Monthly Leader";

const leaderNames = leaders
  .map(row => row.name)
  .sort((a, b) => a.localeCompare(b))
  .join(" & ");

details.textContent =
  `${leaderNames} — ${leader.points} points`;

    message.textContent = !completed
  ? "This month is still active and cannot be finalized."
  : "Review the standings carefully before finalizing.";
  }

  preview.append(heading, details);
}

function openSection() {
  document.getElementById("playersSection").hidden = true;
  document.getElementById("matchesSection").hidden = true;
  document.getElementById("standingsSection").hidden = true;
  section.hidden = false;
  render();
}

document.querySelectorAll(
  '[data-section="champions-admin"]'
).forEach(button => {
  button.addEventListener("click", openSection);
});

document.querySelectorAll("[data-section]").forEach(button => {
  if (button.dataset.section === "champions-admin") return;

  button.addEventListener("click", () => {
    section.hidden = true;
  });
});

yearSelect.addEventListener("change", render);
monthSelect.addEventListener("change", render);

onAuthStateChanged(auth, async user => {
  stopMatches?.();
  stopChampions?.();

  stopMatches = null;
  stopChampions = null;

  authorized = false;
  publishedMatches = {};
  savedChampions = {};
  section.hidden = true;

  if (!user) return;

  try {
    const adminSnap = await get(
      ref(db, `admins/${user.uid}/enabled`)
    );

    if (
      auth.currentUser?.uid !== user.uid ||
      adminSnap.val() !== true
    ) {
      return;
    }

    authorized = true;

    stopMatches = onValue(
      ref(db, "publicMatches"),
      snapshot => {
        publishedMatches = snapshot.val() || {};
        updateYears();
        render();
      },
      error => {
        console.error(error);
        message.textContent = "Unable to load match records.";
      }
    );

    stopChampions = onValue(
      ref(db, "monthlyChampions"),
      snapshot => {
        savedChampions = snapshot.val() || {};
        updateYears();
        render();
      },
      error => {
        console.error(error);
        message.textContent =
          "Unable to load saved champions. Check database rules.";
      }
    );

  } catch (error) {
    console.error(error);
    message.textContent = "Unable to verify admin access.";
  }
});

finalizeButton.addEventListener("click", async () => {
  if (!authorized || busy || !auth.currentUser) return;

  const year = yearSelect.value;
  const month = monthSelect.value;
  const key = selectedKey();

  if (!isCompletedMonth(year, month)) {
    message.textContent = "Only completed months can be finalized.";
    return;
  }

  const leader = getLeader();
const leaders = getJointLeaders();

if (!leader || savedChampions[key]) return;

const photoUrl = championPhoto.value.trim();

if (!isValidImgurPhoto(photoUrl) || !photoLoaded) {
  message.textContent =
    "A valid Imgur champion photo is required.";
  return;
}

  const championNames = leaders
  .map(player => player.name)
  .sort((a, b) => a.localeCompare(b))
  .join(" & ");

const championLabel = leaders.length > 1
  ? "joint champions"
  : "champion";

const confirmed = window.confirm(
  `Finalize ${monthNames[Number(month) - 1]} ${year} ${championLabel}:\n\n` +
  `${championNames} — ${leader.points} points?\n\n` +
  `One shared trophy photo will be saved.\n\n` +
  `This will create the official historical record.`
);

  if (!confirmed) return;

  busy = true;
  render();
  message.textContent = "Finalizing monthly champion...";

  try {
    const user = auth.currentUser;
    const adminSnap = await get(
      ref(db, `admins/${user.uid}/enabled`)
    );

    if (adminSnap.val() !== true) {
      throw new Error("Admin access required.");
    }

    
const record = {
  year: Number(year),
  month,

  // All champions for this month.
  champions: leaders.map(player => ({
    playerId: player.id,
    playerName: player.name,
    points: player.points,
    played: player.played,
    wins: player.wins,
    draws: player.draws,
    losses: player.losses
  })),

  // Keep these fields for compatibility with existing displays.
  playerId: leader.id,
  playerName: leader.name,
  points: leader.points,
  played: leader.played,
  wins: leader.wins,
  draws: leader.draws,
  losses: leader.losses,

  // ONE shared photo for the month.
  photoUrl,

  finalizedBy: user.uid,
  finalizedAt: Date.now()
};


    const transaction = await runTransaction(
      ref(db, `monthlyChampions/${key}`),
      current => current === null ? record : undefined,
      { applyLocally: false }
    );

    if (!transaction.committed) {
      throw new Error(
        "This month was already finalized. Refresh the records."
      );
    }

    message.textContent = "Monthly champion finalized successfully!";

  } catch (error) {
    console.error(error);
    message.textContent =
      error.message || "Unable to finalize champion.";
  } finally {
    busy = false;
    render();
  }
});
