// Función programada: se ejecuta cada hora en punto y actúa una sola vez al día, a partir de la hora de revisión
// configurada en el panel (hora de Chile; por defecto 08:00). El cambio de horario de verano/invierno no la afecta,
// porque compara siempre con la hora local de Chile.
import { ejecutarRevision, yaSeRevisoHoy } from "../lib/revision.mjs";
import { horaChile, horaEnvio } from "../lib/difusion.mjs";

export default async () => {
  const hora = horaChile(), objetivo = await horaEnvio();
  const limite = String(Math.min(23, Number(objetivo.slice(0, 2)) + 2)).padStart(2, "0") + ":00";   // margen de 2 horas por si falla una ejecución
  if (hora < objetivo || hora >= limite) return new Response(`fuera de horario ${hora} (revisión a las ${objetivo})`);
  if (await yaSeRevisoHoy()) return new Response("ya revisado hoy");
  const r = await ejecutarRevision({ manual: false });
  console.log("Revisión diaria:", JSON.stringify(r.acciones));
  return new Response("ok");
};
export const config = { schedule: "0 * * * *" };
