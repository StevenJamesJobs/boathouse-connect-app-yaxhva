/**
 * joltKeywords — search aliases for palette results (s87).
 *
 * Plain lowercase words in BOTH languages, keyed by result id, so "staff"
 * finds Employees and "tema" finds Appearance regardless of the UI language.
 * Not t() strings on purpose: aliases are search data, not copy.
 */
export const JOLT_KEYWORDS: Record<string, string> = {
  // tools (favorites catalog ids)
  'tool-team': 'employees staff team people crew roster empleados personal equipo plantilla',
  'tool-tips': 'checkout money tipout cash propinas cierre dinero',
  'tool-my-schedule': 'shifts hours week turnos horario horas semana',
  'tool-pick-up-shifts': 'open shifts swap cover turnos libres cambiar cubrir',
  'tool-messages': 'chat inbox dm mail mensajes chat bandeja correo',
  'tool-menus': 'food dishes drinks menu comida platos bebidas carta',
  'tool-todays-roster': 'who is working today roster quien trabaja hoy plantilla',
  'tool-bartender-assistant': 'bar cocktails recipes drinks bartender barra cocteles recetas bebidas',
  'tool-host-assistant': 'host sections seating anfitrion secciones mesas',
  'tool-kitchen-assistant': 'kitchen line prep recipes cocina linea preparacion recetas',
  'tool-weekly-quizzes': 'quiz exam test questions cuestionario examen prueba preguntas',
  'tool-guides-training': 'guides training docs handbook learn guias capacitacion manual aprender',
  'tool-events': 'events calendar upcoming eventos calendario proximos',
  'tool-rewards': 'bucks points rewards redeem recompensas puntos canjear',
  'tool-game-hub': 'games play leaderboard scores juegos jugar clasificacion puntajes',
  'tool-schedule-approvals': 'approve time off pick up requests aprobar solicitudes tiempo libre',
  'tool-announcement-editor': 'announcements posts news anuncios publicaciones noticias',
  'tool-schedule-upload': 'upload schedule scan pdf photo import subir horario escanear importar',
  'tool-notification-center': 'notifications push send alerts notificaciones enviar alertas',
  'tool-rewards-reviews-editor': 'reviews google rewards editor resenas recompensas',
  'tool-subscription': 'plan billing premium subscription suscripcion facturacion',
  // jolt-only entries
  'jolt-approvals': 'approve redemptions bucks rewards pending aprobar canjes recompensas pendientes',
  'jolt-menu-upload': 'ai menu upload scan pdf photo import credits subir menu escanear importar creditos',
  'jolt-appearance': 'theme dark light mode color palette tema oscuro claro modo color apariencia',
  'jolt-notifications': 'push alerts sounds notificaciones alertas avisos',
  'jolt-password': 'pin login change password contrasena clave cambiar acceso',
  'jolt-language': 'spanish english espanol ingles idioma language',
};
