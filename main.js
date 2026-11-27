// main.js — Lógica del sitio Gestoría Integral Tucumán
// Cargado como <script src="main.js" type="module">
// (los módulos ES son "defer" por defecto, no hace falta el atributo).
// Módulo único: SPA nav, componentes por datos (evita HTML repetido),
// carrusel de novedades, acordeón de FAQ, contador animado y analítica.

/* ============ 1. DATOS (editá acá, no en el HTML) ============ */
const WHATSAPP_NUMBER = "543814963423";
const waLink = (msg) =>
  `https://wa.me/${WHATSAPP_NUMBER}${msg ? "?text=" + encodeURIComponent(msg) : ""}`;

/* ---- Helpers de seguridad (HTML seguro) ----
   Todo dato interpolado en una plantilla que termina en innerHTML pasa por esc().
   Hoy los datos son constantes de este archivo; esto protege el día que vengan de
   un JSON, un CMS, la URL o una API. Las URLs externas pasan por safeUrl(). */
const ESC_MAP = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
  "`": "&#96;",
};
const esc = (v) => String(v ?? "").replace(/[&<>"'`]/g, (c) => ESC_MAP[c]);
const safeUrl = (u) => {
  if (u === "#") return "#";
  try {
    const x = new URL(String(u), window.location.origin);
    return x.protocol === "https:" ? x.href : "#";
  } catch {
    return "#";
  }
};
// Lectura de claves controladas por el usuario sin tocar la cadena de prototipos
const own = (obj, key, fallback) =>
  Object.prototype.hasOwnProperty.call(obj, key) ? obj[key] : fallback;

/* ============ 1b. TARIFAS DEL COTIZADOR (editá acá los valores monetarios) ============ */
function initCotizador() {
  // 1. Configuración de tarifas y opciones
  const CONFIG = {
    servicios: {
      mensajeria_basica: { label: "Mensajería básica", base: 4500 },
      presentacion_expedientes: {
        label: "Presentación de expedientes / trámites en organismos",
        base: 20000,
      },
      tramitacion_retorno: {
        label: "Tramitación con retorno de documentación firmada",
        base: 20000,
      },
    },
    zonas: {
      centro: { label: "Centro / Microcentro", recargo: 0 },
      norte: { label: "Zona Norte", recargo: 2000 },
      sur: { label: "Zona Sur", recargo: 2000 },
      oeste: { label: "Zona Oeste / Yerba Buena", recargo: 2800 },
      interior: { label: "Interior de la provincia", recargo: 4500 },
    },
    precioPorKm: 150,
    urgencia: {
      normal: { label: "Normal (mismo día)", recargo: 0, icon: "fa-clock" },
      express: {
        label: "Express (prioritario / inmediato)",
        recargo: 2000,
        icon: "fa-bolt",
      },
    },
    tramoMinutos: 15,
    precioPorTramoEspera: 500,
    opcionesEspera: [0, 15, 30, 45, 60],
    adicionales: {
      ninguno: { label: "Sin adicional", recargo: 0 },
      bulto_mediano: {
        label: "Bulto / documentación voluminosa",
        recargo: 700,
      },
      bulto_pesado: { label: "Bulto pesado (+5 kg)", recargo: 1500 },
    },
    whatsappPhone: WHATSAPP_NUMBER,
  };

  // 2. Elementos del DOM
  const cotServicio = document.getElementById("cotServicio");
  const cotZona = document.getElementById("cotZona");
  const cotKm = document.getElementById("cotKm");
  const cotUrgenciaGrid = document.getElementById("cotUrgenciaGrid");
  const cotEspera = document.getElementById("cotEspera");
  const cotAdicional = document.getElementById("cotAdicional");
  const cotBreakdown = document.getElementById("cotBreakdown");
  const cotTotal = document.getElementById("cotTotal");
  const cotWhatsappBtn = document.getElementById("cotWhatsappBtn");
  const toggleBtns = document.querySelectorAll(".cotizador-toggle-btn");
  if (!cotServicio || !cotZona || !cotKm) return;

  const MAX_KM = 1000; // tope: evita Infinity/NaN y cotizaciones absurdas

  // 3. Estado interno
  let modoDistancia = "zona"; // 'zona' o 'km'
  let urgenciaSeleccionada = "normal";

  // Formateador de moneda en pesos argentinos ($)
  const formatMoney = (amount) =>
    new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: "ARS",
      maximumFractionDigits: 0,
    }).format(amount);

  // 4. Inicialización de selectores en el DOM
  function initSelects() {
    // Servicios
    cotServicio.innerHTML = Object.entries(CONFIG.servicios)
      .map(
        ([key, item]) =>
          `<option value="${esc(key)}">${esc(item.label)}</option>`,
      )
      .join("");

    // Zonas
    cotZona.innerHTML = Object.entries(CONFIG.zonas)
      .map(
        ([key, item]) =>
          `<option value="${esc(key)}">${esc(item.label)}</option>`,
      )
      .join("");

    // Opciones de Espera
    cotEspera.innerHTML = CONFIG.opcionesEspera
      .map((min) => {
        const label = min === 0 ? "Sin espera" : `${esc(min)} minutos`;
        return `<option value="${esc(min)}">${esc(label)}</option>`;
      })
      .join("");

    // Adicionales
    cotAdicional.innerHTML = Object.entries(CONFIG.adicionales)
      .map(
        ([key, item]) =>
          `<option value="${esc(key)}">${esc(item.label)}</option>`,
      )
      .join("");

    // Urgencia (Botones interactivos)
    cotUrgenciaGrid.innerHTML = Object.entries(CONFIG.urgencia)
      .map(([key, item]) => {
        const isActive = key === urgenciaSeleccionada ? "is-active" : "";
        return `
          <button type="button" data-urgencia="${esc(key)}" class="cotizador-urgencia-btn ${isActive} flex items-center gap-3 text-left w-full">
            <span class="cotizador-urgencia-icon w-8 h-8 rounded-full flex items-center justify-center text-xs shrink-0">
              <i class="fa-solid ${esc(item.icon)}"></i>
            </span>
            <span class="text-xs sm:text-sm font-semibold text-gray-700">${esc(item.label)}</span>
          </button>
        `;
      })
      .join("");
  }

  // 5. Cálculo y actualización de la vista
  function calcularCotizacion() {
    const servicioKey = cotServicio.value;
    const servicioObj = own(CONFIG.servicios, servicioKey, {
      base: 0,
      label: "",
    });

    // Distancia
    let costoDistancia = 0;
    let labelDistancia = "";

    if (modoDistancia === "zona") {
      const zonaObj = own(CONFIG.zonas, cotZona.value, {
        recargo: 0,
        label: "",
      });
      costoDistancia = zonaObj.recargo;
      labelDistancia = `Zona: ${zonaObj.label}`;
    } else {
      const kmVal = Math.min(MAX_KM, Math.max(0, parseFloat(cotKm.value) || 0));
      costoDistancia = kmVal * CONFIG.precioPorKm;
      labelDistancia = `${kmVal} km ($${CONFIG.precioPorKm}/km)`;
    }

    // Urgencia
    const urgenciaObj = own(CONFIG.urgencia, urgenciaSeleccionada, {
      recargo: 0,
      label: "",
    });
    const costoUrgencia = urgenciaObj.recargo;

    // Espera
    const minutosEspera = parseInt(cotEspera.value, 10) || 0;
    const costoEspera =
      (minutosEspera / CONFIG.tramoMinutos) * CONFIG.precioPorTramoEspera;

    // Adicional
    const adicionalObj = own(CONFIG.adicionales, cotAdicional.value, {
      recargo: 0,
      label: "",
    });
    const costoAdicional = adicionalObj.recargo;

    // Total final
    const total =
      servicioObj.base +
      costoDistancia +
      costoUrgencia +
      costoEspera +
      costoAdicional;

    // Renderizar desglose
    const itemsDesglose = [
      { label: `Servicio base (${servicioObj.label})`, val: servicioObj.base },
      { label: labelDistancia, val: costoDistancia },
      { label: `Urgencia (${urgenciaObj.label})`, val: costoUrgencia },
      { label: `Tiempo de espera (${minutosEspera} min)`, val: costoEspera },
      { label: `Adicional (${adicionalObj.label})`, val: costoAdicional },
    ];

    cotBreakdown.innerHTML = itemsDesglose
      .map(
        (item) => `
        <div class="flex justify-between items-start gap-3 py-1.5 border-b border-gray-100 last:border-0">
          <dt class="min-w-0 break-words text-gray-500">${esc(item.label)}</dt>
          <dd class="shrink-0 whitespace-nowrap font-semibold text-gray-800">${formatMoney(item.val)}</dd>
        </div>
      `,
      )
      .join("");

    cotTotal.textContent = formatMoney(total);

    // Actualizar enlace de WhatsApp con mensaje formateado
    const mensajeWA = `Hola, quisiera solicitar una gestión con el siguiente desglose estimado:
• *Servicio:* ${servicioObj.label}
• *Origen/Destino:* ${labelDistancia}
• *Urgencia:* ${urgenciaObj.label}
• *Espera:* ${minutosEspera > 0 ? `${minutosEspera} min` : "Sin espera"}
• *Adicional:* ${adicionalObj.label}
*Total estimado:* ${formatMoney(total)}`;

    cotWhatsappBtn.href = `https://wa.me/${CONFIG.whatsappPhone}?text=${encodeURIComponent(mensajeWA)}`;
  }

  // 6. Listeners de eventos
  // Alternar modo Zona / Km
  toggleBtns.forEach((btn) => {
    btn.addEventListener("click", (e) => {
      toggleBtns.forEach((b) => b.classList.remove("is-active"));
      e.currentTarget.classList.add("is-active");

      modoDistancia = e.currentTarget.dataset.modo;

      if (modoDistancia === "zona") {
        cotZona.classList.remove("hidden");
        cotKm.classList.add("hidden");
      } else {
        cotZona.classList.add("hidden");
        cotKm.classList.remove("hidden");
      }

      calcularCotizacion();
    });
  });

  // Listener para botones de urgencia
  cotUrgenciaGrid.addEventListener("click", (e) => {
    const btn = e.target.closest(".cotizador-urgencia-btn");
    if (!btn) return;

    cotUrgenciaGrid
      .querySelectorAll(".cotizador-urgencia-btn")
      .forEach((b) => b.classList.remove("is-active"));

    btn.classList.add("is-active");
    urgenciaSeleccionada = btn.dataset.urgencia;

    calcularCotizacion();
  });

  // Listeners de cambio en selects e inputs
  [cotServicio, cotZona, cotEspera, cotAdicional].forEach((select) => {
    select.addEventListener("change", calcularCotizacion);
  });

  cotKm.addEventListener("input", calcularCotizacion);

  // Inicialización
  initSelects();
  calcularCotizacion();
}

const SERVICES = [
  {
    icon: "fa-car",
    title: "Trámites Automotores",
    text: "Transferencias, patentamientos, informes de dominio, altas y bajas de motores, cancelación de prendas.",
    msg: "Hola! Quisiera consultar por un trámite automotor.",
  },
  {
    icon: "fa-paperclip",
    title: "Gestiones Administrativas",
    text: "Certificaciones, legalizaciones, trámites ante Rentas, títulos universitarios o secundarios.",
    msg: "Hola! Quisiera consultar por una gestión administrativa.",
  },
  {
    icon: "fa-file-lines",
    title: "Asesoramiento de Actas",
    text: "Actas del registro civil en papel y de iglesia, legalizadas para todo uso.",
    msg: "Hola! Quisiera consultar por un acta.",
  },
];

const REVIEWS = [
  {
    name: "Valentín González",
    initial: "V",
    bg: "bg-primary text-white",
    text: "Excelente atención, rapidez y profesionalismo. Me ayudaron con todo el papelerío del auto sin complicaciones.",
  },
  {
    name: "Analía Ruiz",
    initial: "A",
    bg: "bg-secondary text-dark",
    text: "Muy buena predisposición para explicar cada paso de la gestión. Los precios son súper justos para el servicio que brindan.",
  },
  {
    name: "Cristian M.",
    initial: "C",
    bg: "bg-dark text-white",
    text: "Solucionaron un problema registral que venía arrastrando hace meses. Gestión impecable y comunicación constante.",
  },
];

const SOCIALS = [
  {
    icon: "fa-instagram",
    bg: "bg-gradient-to-tr from-yellow-400 via-red-500 to-purple-600",
    name: "Instagram",
    handle: "@gestoriaintegraltuc",
    url: "https://instagram.com/gestoriaintegraltuc",
  },
  {
    icon: "fa-facebook-f",
    bg: "bg-blue-600",
    name: "Facebook",
    handle: "Gestoría Integral Tucumán",
    url: "https://facebook.com/gestoriaintegraltuc",
  },
  {
    icon: "fa-tiktok",
    bg: "bg-black",
    name: "TikTok",
    handle: "Próximamente",
    url: "#",
  },
];

const NEWS = [
  {
    tag: "Normativa",
    title: "Nuevos requisitos para transferencias",
    text: "El Registro Automotor suele actualizar la documentación exigida. Consultanos antes de iniciar tu trámite para no volver a la fila dos veces.",
  },
  {
    tag: "Vencimientos",
    title: "Recordatorio de VTV y patentes",
    text: "Revisá los vencimientos de VTV y cédula verde con anticipación para evitar multas e infracciones.",
  },
  {
    tag: "Novedad",
    title: "Turnos online para Rentas Tucumán",
    text: "Muchos trámites en Rentas ya se pueden iniciar con turno online. Te ayudamos a reservarlo y a preparar la documentación.",
  },
  {
    tag: "Tip",
    title: "La documentación al día acelera todo",
    text: "Tener DNI, cédula y comprobantes de pago vigentes es lo que más acorta los tiempos de cualquier gestión.",
  },
];

/* ---- Mensajería Judicial y Administrativa ---- */

const MENSAJERIA_SERVICES = [
  {
    icon: "fa-file-signature",
    title: "Oficios, cédulas y cartas documento",
    text: "Diligenciamiento de oficios, cédulas de notificación y cartas documento, con constancia de recepción dentro de los plazos procesales.",
  },
  {
    icon: "fa-folder-open",
    title: "Escritos y expedientes",
    text: "Presentación y seguimiento de escritos y expedientes en los distintos fueros judiciales y reparticiones públicas.",
  },
  {
    icon: "fa-landmark",
    title: "Organismos gubernamentales",
    text: "Gestiones ante Rentas, Registro Inmobiliario, Personas Jurídicas, AFIP, Municipalidad y otros organismos.",
  },
  {
    icon: "fa-receipt",
    title: "Tasas, sellados y aranceles",
    text: "Liquidación y pago de tasas judiciales, sellados y trámites arancelados, con comprobante de pago.",
  },
  {
    icon: "fa-route",
    title: "Retiro y entrega puerta a puerta",
    text: "Traslado de documentación y expedientes confidenciales entre tu estudio, tribunales y organismos públicos.",
  },
  {
    icon: "fa-mobile-screen-button",
    title: "Confirmación en tiempo real",
    text: "Aviso de cada etapa cumplida —retiro, diligenciamiento y entrega— por WhatsApp o correo electrónico.",
  },
  {
    icon: "fa-shield-halved",
    title: "Confidencialidad garantizada",
    text: "Cadena de custodia documentada y personal capacitado para el manejo reservado de información sensible.",
  },
];

const MENSAJERIA_STEPS = [
  {
    icon: "fa-comment-dots",
    title: "Solicitud de gestión",
    text: "Nos escribís por la web o WhatsApp con el detalle del trámite a diligenciar.",
  },
  {
    icon: "fa-hand-holding-hand",
    title: "Retiro de documentación",
    text: "Retiramos la documentación física en tu estudio o la recibimos en formato digital.",
  },
  {
    icon: "fa-building-columns",
    title: "Diligenciamiento presencial",
    text: "Tramitamos y presentamos en el fuero u organismo correspondiente, en persona.",
  },
  {
    icon: "fa-clipboard-check",
    title: "Confirmación y devolución",
    text: "Te confirmamos la gestión y devolvemos los comprobantes correspondientes.",
  },
];

const MENSAJERIA_FEATURES = [
  {
    icon: "fa-stopwatch",
    title: "Tiempos de respuesta",
    text: "Servicios express para urgencias del día y programados para diligenciamientos de rutina.",
  },
  {
    icon: "fa-map-location-dot",
    title: "Zonas de cobertura",
    text: "San Miguel de Tucumán y toda la provincia, con coordinación de envíos a otras provincias.",
  },
  {
    icon: "fa-list-check",
    title: "Comprobación de la gestión",
    text: "Foto o escaneo del cargo, remito digital firmado y seguimiento del estado por WhatsApp.",
  },
];

const TRACKING_STATUSES = [
  {
    icon: "fa-box-open",
    title: "Retirado",
    text: "El cadete retiró la documentación en tu estudio.",
  },
  {
    icon: "fa-motorcycle",
    title: "En camino",
    text: "Va rumbo al organismo o tribunal correspondiente.",
  },
  {
    icon: "fa-building-columns",
    title: "En el organismo",
    text: "Está realizando el diligenciamiento presencial.",
  },
  {
    icon: "fa-circle-check",
    title: "Entregado / presentado",
    text: "Gestión confirmada, listo para devolver comprobantes.",
  },
];

const FAQ = [
  {
    q: "¿Cuánto tarda una transferencia de auto?",
    a: "Depende del trámite y la documentación disponible, pero en general entre 24 y 72 hs hábiles desde que se inicia.",
  },
  {
    q: "¿Trabajan con trámites fuera de la capital?",
    a: "Sí, gestionamos trámites en toda la provincia de Tucumán y coordinamos envíos de documentación a otras provincias.",
  },
  {
    q: "¿Qué formas de pago aceptan?",
    a: "Efectivo, transferencia bancaria y Mercado Pago. Te confirmamos el detalle al cotizar tu trámite.",
  },
  {
    q: "¿Necesito estar presente para hacer el trámite?",
    a: "En la mayoría de los casos no: trabajamos con poder o autorización según el tipo de gestión.",
  },
];

/* ============ 2. NAVEGACIÓN (SPA) ============ */
function setActiveNav(pageId) {
  document.querySelectorAll(".nav-link").forEach((link) => {
    const active = link.dataset.page === pageId;
    link.classList.toggle("text-primary", active);
    link.classList.toggle("border-primary", active);
    link.classList.toggle("text-gray-600", !active);
    link.classList.toggle("border-transparent", !active);
    if (active) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
  document.querySelectorAll(".nav-link-m").forEach((link) => {
    const active = link.dataset.page === pageId;
    link.classList.toggle("text-primary", active);
    link.classList.toggle("bg-blue-50", active);
    link.classList.toggle("text-gray-600", !active);
  });
}

function navigate(pageId, anchorId) {
  const target = document.getElementById(pageId);
  if (!target || !target.classList.contains("page-section")) return;

  document.querySelectorAll(".page-section").forEach((section) => {
    section.classList.add("hidden");
    section.classList.remove("block");
  });
  target.classList.remove("hidden");
  target.classList.add("block");

  setActiveNav(pageId);

  const anchor = anchorId ? document.getElementById(anchorId) : null;
  if (anchor && target.contains(anchor)) {
    anchor.scrollIntoView({ behavior: "smooth", block: "start" });
  } else {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
}

function setMobileMenu(open) {
  const menu = document.getElementById("mobileMenu");
  const btn = document.querySelector("[data-toggle-menu]");
  if (!menu) return;
  menu.classList.toggle("hidden", !open);
  if (btn) {
    btn.setAttribute("aria-expanded", String(open));
    btn.setAttribute("aria-label", open ? "Cerrar menú" : "Abrir menú");
  }
}

function toggleMobileMenu() {
  const menu = document.getElementById("mobileMenu");
  setMobileMenu(menu ? menu.classList.contains("hidden") : false);
}

// Delegación de eventos: un solo listener en vez de onclick="" repetido en cada botón
document.addEventListener("click", (e) => {
  const navTarget = e.target.closest("[data-navigate]");
  if (navTarget) {
    const href = navTarget.getAttribute("href") || "";
    const hash = href.startsWith("#") ? href.slice(1) : "";
    // En enlaces <a> se evita el salto nativo al ancla (la sección puede estar oculta)
    if (navTarget.tagName === "A") e.preventDefault();
    const page = navTarget.dataset.navigate;
    navigate(page, hash && hash !== page ? hash : undefined);
    setMobileMenu(false);
    return;
  }
  if (e.target.closest("[data-toggle-menu]")) {
    toggleMobileMenu();
  }
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") setMobileMenu(false);
});

// Si se abre un enlace directo (index.html#partidas), muestra esa sección
function initInitialRoute() {
  const id = window.location.hash.slice(1);
  const el = id ? document.getElementById(id) : null;
  if (el && el.classList.contains("page-section")) navigate(id);
}

/* ============ 3. RENDER DE COMPONENTES POR DATOS ============ */
function renderServices() {
  const el = document.getElementById("servicesGrid");
  if (!el) return;
  el.innerHTML = SERVICES.map(
    (s) => `
    <div class="bg-white p-5 sm:p-6 lg:p-8 rounded-2xl shadow-sm hover:shadow-xl transition-shadow border border-gray-100 text-center flex flex-col justify-between">
      <div>
        <div class="w-14 h-14 sm:w-16 sm:h-16 bg-blue-50 text-primary rounded-full flex items-center justify-center mx-auto mb-4 sm:mb-6 text-2xl sm:text-3xl">
          <i class="fa-solid ${esc(s.icon)}" aria-hidden="true"></i>
        </div>
        <h3 class="text-lg sm:text-xl font-bold mb-2 sm:mb-3 break-words">${esc(s.title)}</h3>
        <p class="text-gray-600 text-sm sm:text-base leading-relaxed">${esc(s.text)}</p>
      </div>
      <div>
        <a href="${esc(waLink(s.msg))}" target="_blank" rel="noopener noreferrer"
          class="inline-block mt-5 sm:mt-6 bg-secondary text-dark font-bold text-sm sm:text-base px-5 py-2.5 rounded-full shadow-lg hover:bg-yellow-400 transition-transform hover:scale-105">
          Cotizar trámite <i class="fa-brands fa-whatsapp ml-2" aria-hidden="true"></i>
        </a>
      </div>
    </div>`,
  ).join("");
}

function renderReviews() {
  const el = document.getElementById("reviewsGrid");
  if (!el) return;
  el.innerHTML = REVIEWS.map(
    (r) => `
    <div class="bg-white p-5 sm:p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col justify-between">
      <div>
        <div class="flex items-center gap-3 mb-4">
          <div class="w-10 h-10 shrink-0 ${esc(r.bg)} rounded-full flex items-center justify-center font-bold" aria-hidden="true">
            ${esc(r.initial)}
          </div>
          <div class="min-w-0">
            <h4 class="font-semibold text-sm sm:text-base break-words">${esc(r.name)}</h4>
            <div class="flex text-secondary text-[10px] sm:text-xs" aria-label="5 de 5 estrellas">
              ${'<i class="fa-solid fa-star" aria-hidden="true"></i>'.repeat(5)}
            </div>
          </div>
          <i class="fa-brands fa-google text-gray-300 ml-auto" aria-hidden="true"></i>
        </div>
        <p class="text-sm sm:text-base text-gray-600 leading-relaxed italic">&ldquo;${esc(r.text)}&rdquo;</p>
      </div>
      <p class="text-[10px] sm:text-xs text-gray-400 mt-4 uppercase tracking-widest">Reseña verificada</p>
    </div>`,
  ).join("");
}

function renderSocials() {
  const el = document.getElementById("socialsGrid");
  if (!el) return;
  el.innerHTML = SOCIALS.map(
    (s) => `
    <a href="${esc(safeUrl(s.url))}" target="_blank" rel="noopener noreferrer"
      class="social-card bg-white p-4 sm:p-6 rounded-2xl shadow-sm flex items-center gap-4 hover:shadow-md transition-all">
      <div class="social-icon shrink-0 w-12 h-12 ${esc(s.bg)} text-white rounded-xl flex items-center justify-center text-2xl transition-transform">
        <i class="fa-brands ${esc(s.icon)}" aria-hidden="true"></i>
      </div>
      <div class="min-w-0">
        <h4 class="font-bold text-dark">${esc(s.name)}</h4>
        <p class="text-xs sm:text-sm text-gray-500 break-words">${esc(s.handle)}</p>
      </div>
    </a>`,
  ).join("");
}

/* ============ 3b. MENSAJERÍA JUDICIAL Y ADMINISTRATIVA ============ */

function renderMensajeriaServices() {
  const el = document.getElementById("mensajeriaServicesGrid");
  if (!el) return;
  el.innerHTML = MENSAJERIA_SERVICES.map(
    (s, i) => `
    <div data-reveal data-reveal-index="${i}"
      class="group bg-white p-5 sm:p-6 rounded-2xl shadow-sm hover:shadow-xl border border-gray-100 transition-all hover:-translate-y-1">
      <div class="w-12 h-12 bg-blue-50 text-primary rounded-xl flex items-center justify-center mb-4 text-lg transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-6">
        <i class="fa-solid ${esc(s.icon)}" aria-hidden="true"></i>
      </div>
      <h4 class="text-base sm:text-lg font-bold mb-2 text-dark break-words">${esc(s.title)}</h4>
      <p class="text-sm sm:text-base text-gray-600 leading-relaxed">${esc(s.text)}</p>
    </div>`,
  ).join("");
}

function renderMensajeriaSteps() {
  const el = document.getElementById("mensajeriaTimeline");
  if (!el) return;
  el.innerHTML = MENSAJERIA_STEPS.map(
    (s, i) => `
    <div data-reveal data-reveal-index="${i}" class="mensajeria-step relative flex md:flex-col items-start md:items-center gap-6 md:gap-0 md:text-center flex-1">
      <div class="mensajeria-step-icon shrink-0 w-14 h-14 rounded-full bg-primary text-white flex items-center justify-center text-lg shadow-lg z-10 md:mb-6">
        <i class="fa-solid ${esc(s.icon)}" aria-hidden="true"></i>
      </div>
      <div class="md:px-3">
        <p class="text-[11px] font-bold uppercase tracking-widest text-secondary mb-1">Paso ${i + 1}</p>
        <h4 class="text-base md:text-sm lg:text-base font-bold text-dark mb-1">${esc(s.title)}</h4>
        <p class="text-sm md:text-xs lg:text-sm text-gray-600 leading-relaxed md:max-w-[200px] md:mx-auto">${esc(s.text)}</p>
      </div>
    </div>`,
  ).join("");
}

function renderMensajeriaFeatures() {
  const el = document.getElementById("mensajeriaFeaturesGrid");
  if (!el) return;
  el.innerHTML = MENSAJERIA_FEATURES.map(
    (f, i) => `
    <div data-reveal data-reveal-index="${i}" class="bg-white/5 border border-white/10 rounded-2xl p-5 sm:p-6 text-white">
      <div class="w-10 h-10 bg-secondary/20 text-secondary rounded-lg flex items-center justify-center mb-4 text-base">
        <i class="fa-solid ${esc(f.icon)}" aria-hidden="true"></i>
      </div>
      <h4 class="text-base font-bold mb-2">${esc(f.title)}</h4>
      <p class="text-sm text-blue-100 leading-relaxed">${esc(f.text)}</p>
    </div>`,
  ).join("");
}

function renderTrackingSteps() {
  const el = document.getElementById("trackingSteps");
  if (!el) return;
  el.innerHTML = TRACKING_STATUSES.map(
    (s, i) => `
    <li class="tracking-step flex items-start gap-3" data-step="${i}">
      <span class="tracking-step-icon shrink-0 w-8 h-8 rounded-full border-2 border-gray-200 text-gray-400 flex items-center justify-center text-xs transition-colors">
        <i class="fa-solid ${esc(s.icon)}" aria-hidden="true"></i>
      </span>
      <span>
        <span class="tracking-step-title block text-sm font-bold text-gray-400 transition-colors">${esc(s.title)}</span>
        <span class="block text-xs sm:text-sm text-gray-500 leading-relaxed">${esc(s.text)}</span>
      </span>
    </li>`,
  ).join("");
}

/* Simulación de seguimiento en tiempo real del cadete: el marcador se mueve por CSS
   (@keyframes en styles.css) y acá solo sincronizamos qué paso está activo y el ETA,
   cambiando clases y texto — nunca style="" inline, para respetar la CSP del sitio. */
function initMensajeriaTracking() {
  const wrap = document.getElementById("mensajeriaTracking");
  const courier = document.getElementById("trackingCourier");
  const replayBtn = document.getElementById("trackingReplay");
  const etaEl = document.getElementById("trackingEtaValue");
  if (!wrap || !courier) return;

  const DURATION_MS = 12000;
  const ETA_START_MIN = 12;
  const steps = () => wrap.querySelectorAll(".tracking-step");
  let startTime = null;
  let rafId = null;
  let etaInterval = null;

  function setActiveStep(index) {
    steps().forEach((step, i) => {
      const icon = step.querySelector(".tracking-step-icon");
      const title = step.querySelector(".tracking-step-title");
      step.classList.toggle("is-active", i === index);
      step.classList.toggle("is-done", i < index);
      icon.classList.toggle("border-primary", i === index);
      icon.classList.toggle("bg-primary", i === index);
      icon.classList.toggle("text-white", i === index || i < index);
      icon.classList.toggle("border-gray-200", i > index);
      icon.classList.toggle("text-gray-400", i > index);
      icon.classList.toggle("bg-secondary", i < index);
      icon.classList.toggle("border-secondary", i < index);
      title.classList.toggle("text-primary", i === index);
      title.classList.toggle("text-dark", i < index);
      title.classList.toggle("text-gray-400", i > index);
    });
  }

  function tick(now) {
    if (startTime === null) startTime = now;
    const elapsed = (now - startTime) % DURATION_MS;
    const progress = elapsed / DURATION_MS;
    const stepIndex = Math.min(
      TRACKING_STATUSES.length - 1,
      Math.floor(progress * TRACKING_STATUSES.length),
    );
    setActiveStep(stepIndex);
    rafId = requestAnimationFrame(tick);
  }

  function startEtaCountdown() {
    if (etaEl) etaEl.textContent = String(ETA_START_MIN);
    let remaining = ETA_START_MIN;
    clearInterval(etaInterval);
    etaInterval = setInterval(() => {
      remaining = remaining > 1 ? remaining - 1 : ETA_START_MIN;
      if (etaEl) etaEl.textContent = String(remaining);
    }, DURATION_MS / ETA_START_MIN);
  }

  function play() {
    courier.classList.remove("is-animating");
    // Fuerza reflow para poder reiniciar la animación CSS desde el principio
    void courier.offsetWidth;
    courier.classList.add("is-animating");
    startTime = null;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(tick);
    startEtaCountdown();
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          play();
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.3 },
  );
  observer.observe(wrap);

  replayBtn?.addEventListener("click", play);
}

/* Revela elementos con [data-reveal] al entrar en viewport (respeta prefers-reduced-motion vía CSS) */
function initScrollReveal() {
  const targets = document.querySelectorAll("[data-reveal]");
  if (!targets.length) return;

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.15 },
  );

  targets.forEach((t) => observer.observe(t));
}

/* ============ 4. CARRUSEL DE NOVEDADES ============ */
function initNewsCarousel() {
  const root = document.getElementById("newsCarousel");
  if (!root) return;

  const track = root.querySelector(".carousel-track");
  const dotsWrap = root.querySelector("[data-dots]");
  let index = 0;
  let timer = null;

  track.innerHTML = NEWS.map(
    (n) => `
    <div class="carousel-slide px-1">
      <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 sm:p-8 md:p-10 h-full">
        <span class="inline-block text-xs font-bold uppercase tracking-widest text-secondary bg-primary/5 px-3 py-1 rounded-full mb-4">${esc(n.tag)}</span>
        <h4 class="text-lg sm:text-xl font-bold text-dark mb-2 break-words">${esc(n.title)}</h4>
        <p class="text-sm sm:text-base text-gray-600 leading-relaxed">${esc(n.text)}</p>
      </div>
    </div>`,
  ).join("");

  dotsWrap.innerHTML = NEWS.map(
    (_, i) =>
      `<button type="button" class="carousel-dot" data-slide="${i}" aria-current="${i === 0}" aria-label="Novedad ${i + 1}"></button>`,
  ).join("");

  function goTo(i) {
    index = (i + NEWS.length) % NEWS.length;
    track.dataset.index = String(index);
    dotsWrap.querySelectorAll(".carousel-dot").forEach((d, i2) => {
      d.setAttribute("aria-current", String(i2 === index));
    });
  }

  const reduceMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;

  function play() {
    stop();
    if (reduceMotion) return;
    timer = setInterval(() => goTo(index + 1), 6000);
  }
  function stop() {
    if (timer) clearInterval(timer);
  }

  root.querySelector("[data-prev]").addEventListener("click", () => {
    goTo(index - 1);
    play();
  });
  root.querySelector("[data-next]").addEventListener("click", () => {
    goTo(index + 1);
    play();
  });
  dotsWrap.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-slide]");
    if (!btn) return;
    goTo(Number(btn.dataset.slide));
    play();
  });

  // Swipe táctil (la CSP no permite handlers inline, se registra acá)
  const viewport = root.querySelector(".carousel-viewport");
  let touchX = null;
  let touchY = null;
  viewport?.addEventListener(
    "touchstart",
    (e) => {
      touchX = e.touches[0].clientX;
      touchY = e.touches[0].clientY;
      stop();
    },
    { passive: true },
  );
  viewport?.addEventListener(
    "touchend",
    (e) => {
      if (touchX === null) return;
      const dx = e.changedTouches[0].clientX - touchX;
      const dy = e.changedTouches[0].clientY - touchY;
      touchX = null;
      if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) {
        goTo(index + (dx < 0 ? 1 : -1));
      }
      play();
    },
    { passive: true },
  );

  root.addEventListener("mouseenter", stop);
  root.addEventListener("mouseleave", play);
  root.addEventListener("focusin", stop);
  root.addEventListener("focusout", play);

  goTo(0);
  play();
}

/* ============ 5. ACORDEÓN DE PREGUNTAS FRECUENTES ============ */
function initFaq() {
  const el = document.getElementById("faqList");
  if (!el) return;

  el.innerHTML = FAQ.map(
    (item, i) => `
    <div class="faq-item bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden" data-open="false">
      <button type="button" class="faq-toggle w-full flex items-center justify-between gap-4 text-left px-4 sm:px-6 py-4 sm:py-5 text-sm sm:text-base font-semibold text-dark"
        aria-expanded="false" aria-controls="faq-answer-${i}">
        <span class="min-w-0 break-words">${esc(item.q)}</span>
        <i class="fa-solid fa-chevron-down faq-chevron text-secondary" aria-hidden="true"></i>
      </button>
      <div class="faq-answer" id="faq-answer-${i}">
        <div class="px-4 sm:px-6 pb-4 sm:pb-5 text-sm sm:text-base text-gray-600 leading-relaxed">${esc(item.a)}</div>
      </div>
    </div>`,
  ).join("");

  el.addEventListener("click", (e) => {
    const btn = e.target.closest(".faq-toggle");
    if (!btn) return;
    const item = btn.closest(".faq-item");
    const isOpen = item.dataset.open === "true";
    item.dataset.open = String(!isOpen);
    btn.setAttribute("aria-expanded", String(!isOpen));
  });
}

/* ============ 6. CONTADOR ANIMADO ============ */
function initCounters() {
  const counters = document.querySelectorAll("[data-counter]");
  if (!counters.length) return;

  const animate = (el) => {
    const target = Number(el.dataset.counter);
    const duration = 1200;
    const start = performance.now();
    function step(now) {
      const progress = Math.min((now - start) / duration, 1);
      el.textContent =
        Math.round(target * progress) + (el.dataset.suffix || "");
      if (progress < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  };

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          animate(entry.target);
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.5 },
  );

  counters.forEach((c) => observer.observe(c));
}

/* ============ 8 PRUEBA DE FORMULARIO ============ */

/* ============ 9. INIT ============ */
document.addEventListener("DOMContentLoaded", () => {
  initCotizador();
  renderServices();
  renderReviews();
  renderSocials();
  renderMensajeriaServices();
  renderMensajeriaSteps();
  renderMensajeriaFeatures();
  renderTrackingSteps();
  initMensajeriaTracking();
  initNewsCarousel();
  initFaq();
  initCounters();
  initScrollReveal();
  initNewsletterForm();
  initContactForm();
  initInitialRoute();
});

/* ============ 10. NEWSLETTER ============
   Maneja el envío desde JS (en vez de un onsubmit="" inline, que la CSP
   del sitio bloquea al no tener 'unsafe-inline' en script-src). Como el
   sitio no tiene backend propio, deriva la suscripción a WhatsApp en vez
   de dejar que el <form> haga un submit GET por defecto (que expondría
   el email en la URL). */

function initNewsletterForm() {
  const form = document.getElementById("newsletterForm");
  if (!form) return;

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const email = document.getElementById("newsletterEmail")?.value.trim();
    if (!email) return;

    window.open(
      waLink(`Hola! Quiero suscribirme al boletín con este correo: ${email}`),
      "_blank",
      "noopener,noreferrer",
    );
    form.reset();
  });
}

/* ============ 11. FORMULARIO DE CONTACTO (actas y presupuestos) ============
   - Envío con fetch (JSON) a Web3Forms, que reenvía a gestoriaintegraltuc@gmail.com.
     La access_key de Web3Forms es PÚBLICA por diseño (no es un secreto): solo
     permite enviar mails a la casilla con la que se registró. Se protege
     restringiendo el dominio permitido desde el panel de Web3Forms.
   - Sin eventos inline ni estilos inline (CSP): todo se maneja desde acá.
   - Todo texto que se muestra se inserta con textContent (nunca innerHTML),
     por lo que lo que escriba el usuario no puede inyectar HTML ni scripts. */

const CONTACT_FORM = {
  endpoint: "https://api.web3forms.com/submit",
  accessKey: "bdcd4c2e-e9a4-48ae-bf60-7038aa31f1b5", // ← reemplazar (ver instrucciones)
  siteName: "Web Gestoría Integral Tucumán",
  timeoutMs: 15000,
  cooldownMs: 15000,
};

const CONSULTAS = {
  acta: "Pedido de acta",
  presupuesto: "Solicitud de presupuesto",
  informedominio: "Informes de dominio automotor",
  informeinmueble: "Informes inmuebles Tucumán",
  informeinfracciones: "Informes de infracciones de tránsito",
  revisionpapeles: "Revisión de papeles online",
  otro: "Otro trámite",
};

// Etiquetas que cambian según el tipo de acta elegido
const ACTAS = {
  "": {
    titulo: "",
    nombre: "Nombre completo",
    lugar: "Lugar",
    fecha: "Fecha exacta",
    ph: "",
  },
  nacimiento: {
    titulo: "Acta de nacimiento",
    nombre: "Nombre completo de la persona",
    lugar: "Lugar de nacimiento",
    fecha: "Fecha exacta de nacimiento",
    ph: "Ej. María Fernanda López",
  },
  matrimonio: {
    titulo: "Acta de matrimonio",
    nombre: "Nombre completo de ambos cónyuges",
    lugar: "Lugar del matrimonio",
    fecha: "Fecha exacta del matrimonio",
    ph: "Ej. Juan Pérez y Ana Torres",
  },
  defuncion: {
    titulo: "Acta de defunción",
    nombre: "Nombre completo de la persona fallecida",
    lugar: "Lugar de defunción",
    fecha: "Fecha exacta de defunción",
    ph: "Ej. Roberto Carlos Sánchez",
  },
};

const RECTIFICACIONES = {
  rectificacion: "Acta con rectificación",
  oficio: "Con oficio judicial",
};

const PAGOS = {
  billetera: "Billeteras virtuales",
  efectivo: "Western Union",
};

// panel: bloque que se muestra bajo el selector de envío
const ENVIOS = {
  capital: {
    label: "Dentro de Tucumán capital (en el día)",
    panel: "agente",
    intro:
      "Hola! Quiero consultar por un envío en el día dentro de Tucumán capital.",
  },
  pais: {
    label: "Dentro del país",
    panel: "cotizar",
    texto:
      "Envío dentro del país: solicitá tu cotización inmediata por WhatsApp.",
    intro: "Hola! Quiero cotizar un envío dentro del país.",
  },
  exterior: {
    label: "Exterior",
    panel: "cotizar",
    texto: "Envío al exterior: solicitá tu cotización inmediata por WhatsApp.",
    intro: "Hola! Quiero cotizar un envío al exterior.",
  },
};

function initContactForm() {
  const form = document.getElementById("contactForm");
  if (!form) return;

  const $ = (id) => document.getElementById(id);
  const el = {
    nombre: $("cfNombre"),
    contacto: $("cfContacto"),
    consulta: $("cfConsulta"),
    acta: $("cfActa"),
    actaTipo: $("cfActaTipo"),
    actaNombre: $("cfActaNombre"),
    actaLugar: $("cfActaLugar"),
    actaFecha: $("cfActaFecha"),
    dominio: $("cfDominio"),
    dominioPatente: $("cfDominioPatente"),
    inmueble: $("cfInmueble"),
    inmuebleMatricula: $("cfInmuebleMatricula"),
    infracciones: $("cfInfracciones"),
    infraccionPatente: $("cfInfraccionPatente"),
    revision: $("cfRevision"),
    revisionWa: $("cfRevisionWa"),
    dni: $("cfDni"),
    numActa: $("cfNumActa"),
    tomo: $("cfTomo"),
    folio: $("cfFolio"),
    anio: $("cfAnio"),
    rectificacion: $("cfRectificacion"),
    envio: $("cfEnvio"),
    pago: $("cfPago"),
    mensaje: $("cfMensaje"),
    privacidad: $("cfPrivacidad"),
    website: $("cfWebsite"),
    status: $("cfStatus"),
    fallback: $("cfFallback"),
    submit: $("cfSubmit"),
    cotizarTexto: $("cfCotizarTexto"),
  };
  if (Object.values(el).some((node) => !node)) {
    console.warn("[contacto] Faltan elementos del formulario en el HTML.");
    return;
  }

  const turnstileBox = form.querySelector(".cf-turnstile");

  function getTurnstileToken() {
    const input = form.querySelector('input[name="cf-turnstile-response"]');
    if (input && typeof input.value === "string") {
      return input.value.trim();
    }
    const fd = new FormData(form);
    const val = fd.get("cf-turnstile-response");
    return typeof val === "string" ? val.trim() : "";
  }

  function resetTurnstile() {
    if (window.turnstile && typeof window.turnstile.reset === "function") {
      try {
        if (turnstileBox) {
          window.turnstile.reset(turnstileBox);
        } else {
          window.turnstile.reset();
        }
      } catch {
        try {
          window.turnstile.reset();
        } catch {
          /* ignorar si el widget aún no está montado */
        }
      }
    }
  }

  /* ---------- Utilidades de saneamiento ---------- */
  const has = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
  const CTRL =
    /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2066-\u2069]/g;
  const cleanLine = (v, max = 120) =>
    String(v ?? "")
      .normalize("NFC")
      .replace(CTRL, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, max);
  const cleanText = (v, max = 1500) =>
    String(v ?? "")
      .normalize("NFC")
      .replace(CTRL, "")
      .replace(/\r\n?/g, "\n")
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
      .slice(0, max);

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  const NAME_RE = /^[\p{L}\p{M}][\p{L}\p{M}'’.,&\/\- ]*$/u;
  const PLACE_RE = /^[\p{L}\p{N}\p{M}][\p{L}\p{N}\p{M}'’.,()\/\- ]*$/u;
  const REF_RE = /^[\p{L}\p{N}][\p{L}\p{N}\p{M}.\/\- ]{0,19}$/u;
  // Patente AR (ABC123, AB123CD, 123ABC, A123BCD): 6-7 caracteres con letras y números
  const PATENTE_RE = /^(?=.*\d)(?=.*[A-Z])[A-Z0-9]{6,7}$/;
  // Matrícula de inmueble: texto libre corto que incluya al menos un número
  const MATRICULA_RE =
    /^(?=.*\p{N})[\p{L}\p{N}][\p{L}\p{N}\p{M}.\/\- º°]{2,39}$/u;
  const normPatente = (v) =>
    cleanLine(v, 12).replace(/[\s-]/g, "").toUpperCase();

  const pad = (n) => String(n).padStart(2, "0");
  const todayISO = () => {
    const d = new Date();
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };
  const formatFecha = (iso) => iso.split("-").reverse().join("/");
  const wordsOf = (s) => s.split(" ").filter((w) => w.length > 1);

  el.actaFecha.max = todayISO();

  /* ---------- Reglas de validación (una por campo, en el orden del DOM) ---------- */
  const optionalEnum = (map) => (n) =>
    !n.value || has(map, n.value) ? "" : "Elegí una opción válida.";

  const rules = {
    nombre: (n) => {
      const s = cleanLine(n.value, 80);
      if (!s) return "Ingresá tu nombre y apellido.";
      if (!NAME_RE.test(s) || wordsOf(s).length < 2)
        return "Escribí tu nombre y apellido, solo con letras.";
      return "";
    },
    contacto: (n) => {
      const s = cleanLine(n.value, 100);
      if (!s)
        return "Dejanos un correo o un teléfono/WhatsApp para responderte.";
      if (s.includes("@"))
        return EMAIL_RE.test(s)
          ? ""
          : "El correo no parece válido. Ejemplo: nombre@correo.com";
      const digits = s.replace(/[\s().\-+]/g, "");
      return /^\d{8,15}$/.test(digits)
        ? ""
        : "Ingresá un teléfono válido con código de área, por ejemplo 381 4123456.";
    },
    consulta: (n) =>
      has(CONSULTAS, n.value) ? "" : "Elegí el tipo de consulta.",
    actaTipo: (n) =>
      n.value && has(ACTAS, n.value)
        ? ""
        : "Elegí el tipo de acta que necesitás.",
    actaNombre: (n) => {
      const s = cleanLine(n.value, 120);
      if (!s) return "Ingresá el nombre completo tal como figura en el acta.";
      if (!NAME_RE.test(s) || wordsOf(s).length < 2)
        return "Escribí nombre y apellido completos, solo con letras.";
      return "";
    },
    actaLugar: (n) => {
      const s = cleanLine(n.value, 100);
      if (!s)
        return "Ingresá el lugar exacto (ciudad o localidad y provincia).";
      return s.length >= 2 && PLACE_RE.test(s)
        ? ""
        : "El lugar contiene caracteres no válidos.";
    },
    actaFecha: (n) => {
      const v = n.value;
      if (!v) return "Ingresá la fecha exacta (día, mes y año).";
      if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(v)))
        return "La fecha no es válida.";
      if (v < "1850-01-01") return "La fecha no puede ser anterior a 1850.";
      if (v > todayISO()) return "La fecha no puede ser futura.";
      return "";
    },
    dni: (n) => {
      const d = n.value.replace(/[.\s]/g, "");
      return !d || /^\d{7,8}$/.test(d)
        ? ""
        : "El DNI debe tener 7 u 8 números, sin puntos.";
    },
    numActa: (n) => {
      const s = cleanLine(n.value, 20);
      return !s || REF_RE.test(s)
        ? ""
        : "Usá solo letras, números, guion o barra (máx. 20).";
    },
    tomo: (n) => {
      const s = cleanLine(n.value, 20);
      return !s || REF_RE.test(s)
        ? ""
        : "Usá solo letras, números, guion o barra (máx. 20).";
    },
    folio: (n) => {
      const s = cleanLine(n.value, 20);
      return !s || REF_RE.test(s)
        ? ""
        : "Usá solo letras, números, guion o barra (máx. 20).";
    },
    anio: (n) => {
      const s = cleanLine(n.value, 4);
      if (!s) return "";
      const max = new Date().getFullYear();
      if (!/^\d{4}$/.test(s) || +s < 1850 || +s > max)
        return `Ingresá un año entre 1850 y ${max}.`;
      return "";
    },
    rectificacion: optionalEnum(RECTIFICACIONES),
    dominioPatente: (n) => {
      const s = normPatente(n.value);
      if (!s)
        return "Ingresá la patente del vehículo para el informe de dominio.";
      return PATENTE_RE.test(s)
        ? ""
        : "La patente no parece válida. Ejemplos: ABC123 o AB123CD.";
    },
    inmuebleMatricula: (n) => {
      const s = cleanLine(n.value, 40);
      if (!s) return "Ingresá la matrícula del inmueble.";
      return MATRICULA_RE.test(s)
        ? ""
        : "La matrícula no parece válida: usá letras, números, guion o barra e incluí al menos un número.";
    },
    infraccionPatente: (n) => {
      const s = normPatente(n.value);
      if (!s)
        return "Ingresá el número de patente para consultar las infracciones.";
      return PATENTE_RE.test(s)
        ? ""
        : "La patente no parece válida. Ejemplos: ABC123 o AB123CD.";
    },
    envio: optionalEnum(ENVIOS),
    pago: optionalEnum(PAGOS),
    mensaje: (n) => {
      if (!n.required) return "";
      const s = cleanText(n.value, 1500);
      if (!s) return "Contanos qué trámite necesitás.";
      return s.length >= 10
        ? ""
        : "Contanos un poco más: escribí al menos 10 caracteres.";
    },
    privacidad: (n) =>
      n.checked
        ? ""
        : "Para enviar la consulta tenés que aceptar la política de privacidad.",
  };
  const FIELD_KEYS = Object.keys(rules);
  const keyOf = new Map(FIELD_KEYS.map((k) => [el[k], k]));

  /* ---------- Mostrar / limpiar errores (accesible) ---------- */
  const isActive = (node) =>
    !node.disabled && !node.closest("fieldset[disabled], [hidden]");

  function toggleToken(node, attr, token, on) {
    const set = new Set(
      (node.getAttribute(attr) || "").split(/\s+/).filter(Boolean),
    );
    if (on) set.add(token);
    else set.delete(token);
    if (set.size) node.setAttribute(attr, [...set].join(" "));
    else node.removeAttribute(attr);
  }

  function paintError(node, msg) {
    const wrap = node.closest(".cf-field");
    if (!wrap) return;
    const errId = `${node.id}Error`;
    let p = document.getElementById(errId);
    if (!msg) {
      if (p) p.remove();
      node.removeAttribute("aria-invalid");
      toggleToken(node, "aria-describedby", errId, false);
      return;
    }
    if (!p) {
      p = document.createElement("p");
      p.id = errId;
      p.className = "cf-error";
      wrap.appendChild(p);
    }
    p.textContent = msg;
    node.setAttribute("aria-invalid", "true");
    toggleToken(node, "aria-describedby", errId, true);
    const details = node.closest("details");
    if (details) details.open = true;
  }

  function validateField(key) {
    const node = el[key];
    const msg = isActive(node) ? rules[key](node) : "";
    paintError(node, msg);
    return msg;
  }

  function validateAll() {
    let first = null;
    let count = 0;
    FIELD_KEYS.forEach((key) => {
      if (validateField(key)) {
        count += 1;
        if (!first) first = el[key];
      }
    });
    return { first, count };
  }

  /* ---------- UI dinámica ---------- */
  function setLabel(node, text) {
    const span = form.querySelector(
      `label[for="${node.id}"] [data-label-text]`,
    );
    if (span) span.textContent = text;
  }

  function applyActaTexts() {
    const t = has(ACTAS, el.actaTipo.value)
      ? ACTAS[el.actaTipo.value]
      : ACTAS[""];
    setLabel(el.actaNombre, t.nombre);
    setLabel(el.actaLugar, t.lugar);
    setLabel(el.actaFecha, t.fecha);
    el.actaNombre.placeholder = t.ph;
  }

  function applyConsulta() {
    const v = el.consulta.value;
    const isActa = v === "acta";
    el.acta.hidden = !isActa;
    el.acta.disabled = !isActa;
    if (!isActa) {
      [
        "actaTipo",
        "actaNombre",
        "actaLugar",
        "actaFecha",
        "dni",
        "numActa",
        "tomo",
        "folio",
        "anio",
        "rectificacion",
      ].forEach((k) => paintError(el[k], ""));
    }

    // Servicios con campo específico: se muestran/habilitan solo si corresponden
    [
      ["dominio", "dominioPatente", v === "informedominio"],
      ["inmueble", "inmuebleMatricula", v === "informeinmueble"],
      ["infracciones", "infraccionPatente", v === "informeinfracciones"],
    ].forEach(([box, field, on]) => {
      el[box].hidden = !on;
      el[box].disabled = !on;
      if (!on) {
        el[field].value = "";
        paintError(el[field], "");
      }
    });
    el.revision.hidden = v !== "revisionpapeles";

    // El mensaje es opcional cuando ya se piden datos específicos (acta o informes)
    const msgOpcional =
      isActa ||
      v === "informedominio" ||
      v === "informeinmueble" ||
      v === "informeinfracciones";
    el.mensaje.required = !msgOpcional;
    setLabel(
      el.mensaje,
      msgOpcional
        ? "Información adicional (opcional)"
        : "Mensaje o detalle del trámite",
    );
    const star = form.querySelector("[data-req]");
    if (star) star.hidden = msgOpcional;
    el.mensaje.placeholder = isActa
      ? "Ej.: para qué trámite necesitás el acta, urgencia, otros datos útiles"
      : msgOpcional
        ? "Ej.: motivo del informe u otros datos útiles"
        : "Ej.: datos del acta, patente/dominio o trámite requerido";
    if (!el.mensaje.required) paintError(el.mensaje, "");
    updateRevisionLink();
  }

  function updateRevisionLink() {
    if (el.consulta.value !== "revisionpapeles") return;
    const lines = ["Hola! Quiero hacer una revisión de papeles online."];
    const nombre = cleanLine(el.nombre.value, 80);
    if (nombre) lines.push(`Nombre: ${nombre}`);
    el.revisionWa.href = waLink(lines.join("\n"));
  }

  function applyEnvio() {
    const cfg = has(ENVIOS, el.envio.value) ? ENVIOS[el.envio.value] : null;
    form.querySelectorAll("[data-envio-panel]").forEach((panel) => {
      panel.hidden = !(cfg && panel.dataset.envioPanel === cfg.panel);
    });
    if (cfg && cfg.texto) el.cotizarTexto.textContent = cfg.texto;
    updateWhatsAppLinks();
  }

  function updateWhatsAppLinks() {
    updateRevisionLink();
    if (!has(ENVIOS, el.envio.value)) return;
    const cfg = ENVIOS[el.envio.value];
    const lines = [cfg.intro];
    const nombre = cleanLine(el.nombre.value, 80);
    if (nombre) lines.push(`Nombre: ${nombre}`);
    if (has(CONSULTAS, el.consulta.value))
      lines.push(`Consulta: ${CONSULTAS[el.consulta.value]}`);
    if (
      el.consulta.value === "acta" &&
      el.actaTipo.value &&
      has(ACTAS, el.actaTipo.value)
    ) {
      const a = ACTAS[el.actaTipo.value];
      lines.push(`Acta: ${a.titulo}`);
      const lugar = cleanLine(el.actaLugar.value, 100);
      if (lugar) lines.push(`${a.lugar}: ${lugar}`);
      if (el.actaFecha.value && !rules.actaFecha(el.actaFecha))
        lines.push(`${a.fecha}: ${formatFecha(el.actaFecha.value)}`);
    }
    const link = form.querySelector(
      `[data-envio-panel="${cfg.panel}"] a[data-cf-wa]`,
    );
    if (link) link.href = waLink(lines.join("\n"));
  }

  /* ---------- Estado del envío ---------- */
  function showStatus(kind, msg, { focus = true, fallback = false } = {}) {
    el.status.hidden = false;
    el.status.classList.toggle("is-ok", kind === "ok");
    el.status.classList.toggle("is-error", kind === "error");
    el.status.setAttribute("role", kind === "error" ? "alert" : "status");
    el.status.textContent = msg;
    el.fallback.hidden = !fallback;
    if (focus) el.status.focus();
  }

  function hideStatus() {
    el.status.hidden = true;
    el.status.textContent = "";
    el.fallback.hidden = true;
  }

  let sending = false;
  let lastSentAt = 0;
  const submitLabel = el.submit.querySelector("[data-label]");

  function setSending(on) {
    sending = on;
    el.submit.disabled = on;
    el.submit.setAttribute("aria-busy", String(on));
    if (submitLabel)
      submitLabel.textContent = on ? "Enviando…" : "Enviar consulta";
  }

  /* ---------- Armado del mensaje que llega al mail ---------- */
  function buildPayload() {
    const consulta = el.consulta.value;
    const contacto = cleanLine(el.contacto.value, 100);
    const p = {
      access_key: CONTACT_FORM.accessKey,
      subject: `Nueva consulta web: ${CONSULTAS[consulta]}`,
      from_name: CONTACT_FORM.siteName,
      "Nombre y apellido": cleanLine(el.nombre.value, 80),
      "Tipo de consulta": CONSULTAS[consulta],
    };
    if (EMAIL_RE.test(contacto)) p.email = contacto;
    else p["Teléfono / WhatsApp"] = contacto;

    if (consulta === "acta") {
      const a = ACTAS[el.actaTipo.value];
      p["Tipo de acta"] = a.titulo;
      p[a.nombre] = cleanLine(el.actaNombre.value, 120);
      p[a.lugar] = cleanLine(el.actaLugar.value, 100);
      p[a.fecha] = formatFecha(el.actaFecha.value);
      const dni = el.dni.value.replace(/[.\s]/g, "");
      if (dni) p["DNI"] = dni;
      const extras = [
        ["Número de acta", el.numActa],
        ["Tomo", el.tomo],
        ["Folio", el.folio],
        ["Año", el.anio],
      ];
      extras.forEach(([label, node]) => {
        const v = cleanLine(node.value, 20);
        if (v) p[label] = v;
      });
      if (has(RECTIFICACIONES, el.rectificacion.value))
        p["Rectificación / oficio"] = RECTIFICACIONES[el.rectificacion.value];
    }

    if (consulta === "informedominio")
      p["Patente del vehículo"] = normPatente(el.dominioPatente.value);
    if (consulta === "informeinmueble")
      p["Matrícula del inmueble"] = cleanLine(el.inmuebleMatricula.value, 40);
    if (consulta === "informeinfracciones")
      p["Patente (infracciones de tránsito)"] = normPatente(
        el.infraccionPatente.value,
      );

    if (has(ENVIOS, el.envio.value))
      p["Tipo de envío"] = ENVIOS[el.envio.value].label;
    if (has(PAGOS, el.pago.value)) p["Forma de pago"] = PAGOS[el.pago.value];
    const mensaje = cleanText(el.mensaje.value, 1500);
    if (mensaje) p["Mensaje"] = mensaje;
    p["Consentimiento de privacidad"] =
      `Aceptado el ${new Date().toISOString()}`;
    return p;
  }

  async function sendPayload(payload) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), CONTACT_FORM.timeoutMs);
    try {
      const res = await fetch(CONTACT_FORM.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(payload),
        signal: ctrl.signal,
        credentials: "omit",
      });
      let data = null;
      try {
        data = await res.json();
      } catch {
        /* respuesta sin JSON */
      }
      return res.ok && data && data.success === true;
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
  }

  function resetUi() {
    FIELD_KEYS.forEach((k) => paintError(el[k], ""));
    applyConsulta();
    applyActaTexts();
    applyEnvio();
  }

  /* ---------- Eventos (sin handlers inline) ---------- */
  form.addEventListener("change", (e) => {
    const t = e.target;
    if (t === el.consulta) applyConsulta();
    if (t === el.actaTipo) applyActaTexts();
    if (t === el.envio) applyEnvio();
    const key = keyOf.get(t);
    if (key && t.getAttribute("aria-invalid") === "true") validateField(key);
    updateWhatsAppLinks();
  });

  form.addEventListener("input", (e) => {
    const t = e.target;
    const key = keyOf.get(t);
    if (key && t.getAttribute("aria-invalid") === "true") validateField(key);
    updateWhatsAppLinks();
  });

  form.addEventListener("focusout", (e) => {
    const t = e.target;
    const key = keyOf.get(t);
    if (!key || t.type === "checkbox") return;
    if (t.value || t.getAttribute("aria-invalid") === "true")
      validateField(key);
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (sending) return;
    hideStatus();

    // Honeypot: un bot rellena el campo oculto; fingimos éxito y no enviamos nada
    if (el.website.value.trim() !== "") {
      form.reset();
      resetTurnstile();
      resetUi();
      showStatus("ok", "¡Gracias! Recibimos tu consulta.", { focus: false });
      return;
    }

    const { first, count } = validateAll();
    if (first) {
      showStatus(
        "error",
        count === 1
          ? "Revisá el campo marcado en rojo."
          : `Revisá los ${count} campos marcados en rojo.`,
        { focus: false },
      );
      first.focus();
      return;
    }

    // Validación de Cloudflare Turnstile antes de enviar
    const turnstileToken = getTurnstileToken();
    if (!turnstileToken) {
      showStatus(
        "error",
        "Completá la verificación de seguridad de Cloudflare antes de enviar.",
      );
      if (turnstileBox) {
        turnstileBox.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      return;
    }

    if (Date.now() - lastSentAt < CONTACT_FORM.cooldownMs) {
      showStatus(
        "error",
        "Ya enviamos tu consulta. Esperá unos segundos antes de enviar otra.",
      );
      return;
    }

    const failMsg =
      "No pudimos enviar tu consulta en este momento. Probá de nuevo en unos minutos o escribinos directamente.";

    if (!CONTACT_FORM.accessKey || CONTACT_FORM.accessKey.startsWith("TU_")) {
      console.error(
        "[contacto] Falta configurar CONTACT_FORM.accessKey en main.js.",
      );
      showStatus("error", failMsg, { fallback: true });
      return;
    }

    const primerNombre = cleanLine(el.nombre.value, 80).split(" ")[0];
    setSending(true);
    const ok = await sendPayload(buildPayload());
    setSending(false);

    if (!ok) {
      resetTurnstile();
      showStatus("error", failMsg, { fallback: true });
      return;
    }

    lastSentAt = Date.now();
    form.reset();
    resetTurnstile();
    resetUi();
    showStatus(
      "ok",
      `¡Gracias, ${primerNombre}! Recibimos tu consulta y te vamos a responder a la brevedad.`,
    );
  });

  resetUi();
}
