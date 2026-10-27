// Genera src/data/airports.json a partir del CSV de OurAirports (dominio público).
// Uso: npx tsx scripts/build-airports.ts [ruta-al-csv]
import { readFileSync, writeFileSync } from "node:fs";

const csvPath = process.argv[2] ?? "data/airports.csv";
const text = readFileSync(csvPath, "utf8");

function parseLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

const lines = text.split(/\r?\n/).filter(Boolean);
const header = parseLine(lines[0]);
const col = (name: string) => header.indexOf(name);
const I = {
  type: col("type"),
  name: col("name"),
  lat: col("latitude_deg"),
  lon: col("longitude_deg"),
  country: col("iso_country"),
  city: col("municipality"),
  scheduled: col("scheduled_service"),
  iata: col("iata_code"),
};

const airports = [];
for (const line of lines.slice(1)) {
  const r = parseLine(line);
  const type = r[I.type];
  if (type !== "large_airport" && type !== "medium_airport") continue;
  if (r[I.scheduled] !== "yes" || !/^[A-Z]{3}$/.test(r[I.iata])) continue;
  airports.push({
    iata: r[I.iata],
    name: r[I.name],
    city: r[I.city],
    country: r[I.country],
    lat: Math.round(Number(r[I.lat]) * 1e4) / 1e4,
    lon: Math.round(Number(r[I.lon]) * 1e4) / 1e4,
    large: type === "large_airport",
  });
}

writeFileSync("src/data/airports.json", JSON.stringify(airports));
console.log(`airports.json: ${airports.length} aeropuertos`);
