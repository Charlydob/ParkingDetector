function toTime(value) {
  const time = new Date(value || "").getTime();
  return Number.isFinite(time) ? time : 0;
}

function average(values) {
  const clean = values.filter((value) => Number.isFinite(value) && value > 0);
  return clean.length ? Math.round(clean.reduce((sum, value) => sum + value, 0) / clean.length) : 0;
}

export function computeHousekeepingMetrics(board = {}) {
  const done = Array.isArray(board.done) ? board.done : [];
  const durations = done
    .map((room) => {
      const completed = toTime(room.housekeeping?.completedAt || room.cleanedTimestamp);
      const checkout = toTime(room.checkoutTimestamp);
      return completed && checkout ? Math.round((completed - checkout) / 60_000) : 0;
    })
    .filter((minutes) => minutes > 0 && minutes < 24 * 60);
  const byRoom = Object.fromEntries(
    done.map((room) => [
      room.roomNumber,
      average([
        (() => {
          const completed = toTime(room.housekeeping?.completedAt || room.cleanedTimestamp);
          const checkout = toTime(room.checkoutTimestamp);
          return completed && checkout ? Math.round((completed - checkout) / 60_000) : 0;
        })(),
      ]),
    ]),
  );
  const byWorker = {};

  for (const room of done) {
    const worker = room.housekeeping?.completedBy?.displayName || room.housekeeping?.completedBy?.userId;
    const completed = toTime(room.housekeeping?.completedAt || room.cleanedTimestamp);
    const checkout = toTime(room.checkoutTimestamp);
    const minutes = completed && checkout ? Math.round((completed - checkout) / 60_000) : 0;

    if (worker && minutes > 0 && minutes < 24 * 60) {
      byWorker[worker] ||= [];
      byWorker[worker].push(minutes);
    }
  }

  return {
    completedRooms: done.length,
    averageMinutes: average(durations),
    byRoom,
    byWorker: Object.fromEntries(
      Object.entries(byWorker).map(([worker, values]) => [worker, average(values)]),
    ),
  };
}
