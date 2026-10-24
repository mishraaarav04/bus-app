// Text for push notifications and the in-app inbox, in each user's language.
// {placeholders} are filled in by tr().

import type { Lang } from "../types.js";

type Dict = Record<string, string>;

const en: Dict = {
  ride_started_t: "Bus is on its way",
  ride_started_b: "{route} has started.",
  approaching_t: "Bus arriving soon",
  approaching_b: "{name}'s bus reaches {stop} in about {min} min.",
  boarded_t: "{name} is on the bus",
  boarded_b: "Checked in at {time} on {route}.",
  missed_t: "{name} missed the bus",
  missed_b: "The bus left {stop} before {name} checked in.",
  arrived_t: "{name} arrived at school",
  arrived_b: "Dropped off by {route} at {time}.",
  dropped_t: "{name} was dropped off",
  dropped_b: "At {stop} at {time}.",
  dropped_to_b: "At {stop} at {time}. Handed to {who}.",
  delay_t: "Bus running late",
  delay_b: "{route} is running about {min} min late.",
  delay_generic_b: "{route} is running late.",
  breakdown_t: "Bus has a problem",
  breakdown_b: "{route} has stopped with a mechanical problem. The school has been told.",
  accident_t: "Bus incident",
  accident_b: "{route} reported an incident. The school is following up.",
  other_t: "Bus update",
  other_b: "{route} reported a delay.",
  resolved_t: "Bus is moving again",
  resolved_b: "{route} is back on the road.",
  off_route_t: "Bus is off its route",
  off_route_b: "{route} is about {m} m from its planned route.",
  stopped_t: "Bus hasn't moved",
  stopped_b: "{route} has been stopped for {min} min away from a stop.",
  assigned_t: "You're driving {route}",
  assigned_b: "Open Wheelie to continue the ride.",
  removed_t: "Route reassigned",
  removed_b: "{route} was handed to another driver.",
  invite_student_subject: "Set up your Wheelie account",
  invite_student_body:
    "{school} added you to its bus roster.\n\nOpen Wheelie, tap 'Forgot password', enter this email address and use the code we send to choose your password.",
  invite_parent_subject: "Follow {name}'s bus on Wheelie",
  invite_parent_body:
    "{school} added {name} to its bus roster.\n\nDownload Wheelie, choose 'Create an account' > Parent, and enter this child code: {code}",
  reset_subject: "Your Wheelie password reset code",
  reset_body: "Your code is {code}. It expires in 15 minutes. If you didn't ask for this, ignore this email.",
  verify_subject: "Confirm your Wheelie email",
  verify_body: "Your code is {code}. It expires in 15 minutes.",
};

const es: Dict = {
  ride_started_t: "El autobús está en camino",
  ride_started_b: "{route} ha comenzado.",
  approaching_t: "El autobús llega pronto",
  approaching_b: "El autobús de {name} llega a {stop} en unos {min} min.",
  boarded_t: "{name} está en el autobús",
  boarded_b: "Registrado a las {time} en {route}.",
  missed_t: "{name} perdió el autobús",
  missed_b: "El autobús salió de {stop} antes de que {name} se registrara.",
  arrived_t: "{name} llegó a la escuela",
  arrived_b: "Dejado por {route} a las {time}.",
  dropped_t: "{name} fue dejado",
  dropped_b: "En {stop} a las {time}.",
  dropped_to_b: "En {stop} a las {time}. Entregado a {who}.",
  delay_t: "El autobús va con retraso",
  delay_b: "{route} lleva unos {min} min de retraso.",
  delay_generic_b: "{route} va con retraso.",
  breakdown_t: "El autobús tiene un problema",
  breakdown_b: "{route} se detuvo por un problema mecánico. Se avisó a la escuela.",
  accident_t: "Incidente del autobús",
  accident_b: "{route} reportó un incidente. La escuela le dará seguimiento.",
  other_t: "Aviso del autobús",
  other_b: "{route} reportó un retraso.",
  resolved_t: "El autobús sigue su camino",
  resolved_b: "{route} está de nuevo en la carretera.",
  off_route_t: "El autobús salió de su ruta",
  off_route_b: "{route} está a unos {m} m de su ruta planificada.",
  stopped_t: "El autobús no se mueve",
  stopped_b: "{route} lleva {min} min detenido lejos de una parada.",
  assigned_t: "Conduces {route}",
  assigned_b: "Abre Wheelie para continuar el recorrido.",
  removed_t: "Ruta reasignada",
  removed_b: "{route} pasó a otro conductor.",
  invite_student_subject: "Configura tu cuenta de Wheelie",
  invite_student_body:
    "{school} te agregó a su lista de autobús.\n\nAbre Wheelie, toca '¿Olvidaste tu contraseña?', escribe este correo y usa el código que te enviaremos para elegir tu contraseña.",
  invite_parent_subject: "Sigue el autobús de {name} en Wheelie",
  invite_parent_body:
    "{school} agregó a {name} a su lista de autobús.\n\nDescarga Wheelie, elige 'Crear cuenta' > Padre/madre e ingresa este código: {code}",
  reset_subject: "Tu código para restablecer la contraseña de Wheelie",
  reset_body: "Tu código es {code}. Vence en 15 minutos. Si no lo pediste, ignora este correo.",
  verify_subject: "Confirma tu correo de Wheelie",
  verify_body: "Tu código es {code}. Vence en 15 minutos.",
};

const pt: Dict = {
  ride_started_t: "O ônibus está a caminho",
  ride_started_b: "{route} começou.",
  approaching_t: "O ônibus chega em breve",
  approaching_b: "O ônibus de {name} chega a {stop} em cerca de {min} min.",
  boarded_t: "{name} está no ônibus",
  boarded_b: "Registrado às {time} em {route}.",
  missed_t: "{name} perdeu o ônibus",
  missed_b: "O ônibus saiu de {stop} antes de {name} se registrar.",
  arrived_t: "{name} chegou à escola",
  arrived_b: "Deixado por {route} às {time}.",
  dropped_t: "{name} foi deixado",
  dropped_b: "Em {stop} às {time}.",
  dropped_to_b: "Em {stop} às {time}. Entregue a {who}.",
  delay_t: "O ônibus está atrasado",
  delay_b: "{route} está cerca de {min} min atrasado.",
  delay_generic_b: "{route} está atrasado.",
  breakdown_t: "O ônibus tem um problema",
  breakdown_b: "{route} parou por um problema mecânico. A escola foi avisada.",
  accident_t: "Incidente com o ônibus",
  accident_b: "{route} relatou um incidente. A escola está acompanhando.",
  other_t: "Aviso do ônibus",
  other_b: "{route} relatou um atraso.",
  resolved_t: "O ônibus voltou a andar",
  resolved_b: "{route} está de volta à estrada.",
  off_route_t: "O ônibus saiu da rota",
  off_route_b: "{route} está a cerca de {m} m da rota planejada.",
  stopped_t: "O ônibus não se move",
  stopped_b: "{route} está parado há {min} min longe de uma parada.",
  assigned_t: "Você está dirigindo {route}",
  assigned_b: "Abra o Wheelie para continuar o trajeto.",
  removed_t: "Rota reatribuída",
  removed_b: "{route} passou para outro motorista.",
  invite_student_subject: "Configure sua conta Wheelie",
  invite_student_body:
    "{school} adicionou você à lista do ônibus.\n\nAbra o Wheelie, toque em 'Esqueci a senha', digite este e-mail e use o código enviado para escolher sua senha.",
  invite_parent_subject: "Acompanhe o ônibus de {name} no Wheelie",
  invite_parent_body:
    "{school} adicionou {name} à lista do ônibus.\n\nBaixe o Wheelie, escolha 'Criar conta' > Responsável e informe este código: {code}",
  reset_subject: "Seu código para redefinir a senha do Wheelie",
  reset_body: "Seu código é {code}. Expira em 15 minutos. Se você não pediu, ignore este e-mail.",
  verify_subject: "Confirme seu e-mail do Wheelie",
  verify_body: "Seu código é {code}. Expira em 15 minutos.",
};

const DICTS: Record<Lang, Dict> = { en, es, pt };
export const LANGS: Lang[] = ["en", "es", "pt"];

export function tr(lang: Lang | undefined, key: string, params: Record<string, string | number> = {}): string {
  const raw = DICTS[lang ?? "en"]?.[key] ?? en[key] ?? key;
  return raw.replace(/\{(\w+)\}/g, (_, k) => String(params[k] ?? ""));
}

const LOCALE: Record<Lang, string> = { en: "en-US", es: "es-US", pt: "pt-BR" };
export function formatClock(iso: string | Date, lang: Lang | undefined, timeZone: string): string {
  return new Intl.DateTimeFormat(LOCALE[lang ?? "en"], { hour: "numeric", minute: "2-digit", timeZone }).format(
    typeof iso === "string" ? new Date(iso) : iso
  );
}
