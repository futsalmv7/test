
/*
  Club Amigos League 2.0
  Standings calculation engine.

  Calculates results from published matches only.
  Does not write to Firebase.
*/

export function calculateStandings(matches, view, year, month) {
  const stats = new Map();

  for (const match of Object.values(matches || {})) {
    if (!match || match.status !== "published") continue;

    // Dates are stored as YYYY-MM-DD.
    const date = match.date || "";

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;

    if (view === "season" || view === "month") {
      if (date.slice(0, 4) !== String(year)) continue;
    }

    if (view === "month") {
      if (date.slice(5, 7) !== String(month)) continue;
    }

    const scoreA = Number(match.scoreA);
    const scoreB = Number(match.scoreB);

    if (
      !Number.isInteger(scoreA) ||
      !Number.isInteger(scoreB) ||
      scoreA < 0 ||
      scoreB < 0
    ) continue;

    const winner =
      scoreA > scoreB ? "A" :
      scoreB > scoreA ? "B" : null;

    for (const [id, player] of Object.entries(match.players || {})) {
      if (!player) continue;

      const attendance = player.attendance;

      if (!["present", "late", "absent"].includes(attendance)) {
        continue;
      }

      if (
        attendance !== "absent" &&
        !["A", "B"].includes(player.team)
      ) continue;

      if (!stats.has(id)) {
        stats.set(id, {
          id,
          name: player.name || "Unknown",
          played: 0,
          wins: 0,
          draws: 0,
          losses: 0,
          late: 0,
          absent: 0,
          goals: 0,
          motm: 0,
          points: 0,
          winPercentage: 0
        });
      }

      const s = stats.get(id);

      if (attendance === "absent") {
        s.absent += 1;
        s.points -= 3;
        continue;
      }

      s.played += 1;

      if (winner === null) {
        s.draws += 1;
        s.points += 1;
      } else if (player.team === winner) {
        s.wins += 1;
        s.points += 3;
      } else {
        s.losses += 1;
      }

      if (attendance === "late") {
        s.late += 1;
        s.points -= 1;
      }

      s.goals += Number(match.goals?.[id]) || 0;

      if (match.manOfMatch === id) {
        s.motm += 1;
      }
    }
  }

  const rows = [...stats.values()];

  for (const row of rows) {
    row.winPercentage = row.played
      ? (row.wins / row.played) * 100
      : 0;
  }

  rows.sort((a, b) =>
    b.points - a.points ||
    b.winPercentage - a.winPercentage ||
    a.played - b.played ||
    a.name.localeCompare(b.name)
  );

  return rows;
}
