// Worker que busca sin parar: revisa cada minuto qué alertas tocan y las ejecuta.
// Uso: npm run worker   (en otra terminal, junto a `npm run dev`)
import { runDueAlerts } from "@/lib/engine";

const TICK_MS = Number(process.env.WORKER_TICK_SECONDS ?? 60) * 1000;

async function loop() {
  for (;;) {
    const started = Date.now();
    try {
      const n = await runDueAlerts((m) => console.log(new Date().toLocaleTimeString("es-ES"), m));
      if (n) console.log(`Revisadas ${n} alertas en ${Math.round((Date.now() - started) / 1000)} s`);
    } catch (err) {
      console.error("Error en el worker", err);
    }
    await new Promise((r) => setTimeout(r, TICK_MS));
  }
}

console.log("TravelSeeker worker en marcha");
loop();
