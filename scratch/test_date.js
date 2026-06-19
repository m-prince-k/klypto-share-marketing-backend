console.log("Testing Date parsing for DDMMMYYYY:");
console.log("26MAY2026:", new Date("26MAY2026").toString());
console.log("05JUN2026:", new Date("05JUN2026").toString());

const expiries = ["26MAY2026", "28MAY2026", "05JUN2026", "04JUN2026"];
const sorted = expiries.sort((a, b) => new Date(a) - new Date(b));
console.log("Sorted:", sorted);
