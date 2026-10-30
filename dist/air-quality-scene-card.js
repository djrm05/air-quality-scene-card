/**
 * Air Quality Scene Card
 *
 * A standalone Lovelace card for ANY air-quality sensor in Home Assistant
 * (IKEA ALPSTUGA, AirGradient, Awair, PurpleAir, ESPHome builds, …).
 * Point it at a PM2.5 or CO₂ sensor and it renders an animated scene with a
 * mascot whose mood follows the reading, plus a tap-to-expand detail view
 * with a 24 h chart, 12/24 h averages and a 10-day-by-hour heatmap built
 * from Home Assistant's own recorder statistics.
 *
 * Five headline metrics are supported (config `metric`, auto-detected from the
 * entity's device_class — or entity_id, for the unitless indices — when
 * omitted):
 *   - pm25: US EPA May-2024 PM2.5 categories, WHO guideline comparison and
 *     cigarette equivalent.
 *   - co2: indoor-ventilation categories (fresh outdoor air is ~420 ppm;
 *     1000 ppm is the classic "ventilate now" line; 5000 ppm is the OSHA
 *     8-hour workplace limit), with peak and time-above-1000-ppm tiles.
 *   - pm10: US EPA PM10 AQI breakpoints (24-hour).
 *   - voc: Sensirion VOC Index (100 = recent running-average baseline).
 *   - nox: Sensirion NOx Index (1 = clean-air baseline, spikes on events).
 * The last three also render a peak and a time-above-baseline tile.
 *
 * Secondary readings (temperature, humidity, and every sibling pollutant —
 * CO₂, PM1/2.5/10, PM0.3 count, VOC, NOx) are auto-discovered from entities on
 * the same device and shown as chips, or can be set explicitly. The `chips`
 * option chooses between "auto" (all discovered readings) and "minimal"
 * (temperature, humidity and one complementary pollutant), or an explicit list.
 *
 * Colour scale: `standard: who` switches PM2.5 / PM10 (and CO / formaldehyde
 * charts) to WHO guideline levels; the default `epa` keeps the US EPA bands.
 *
 * Language: all text follows the Home Assistant UI language (English and
 * Spanish built in, English fallback). Force one with `language: es`.
 */

const PM25_CATEGORIES = [
  { max: 9.0, key: "good", label: "Good", color: "#43a047", sky: ["#dcf3dd", "#f2faf0"], ground: "#66bb6a", mood: "happy" },
  { max: 35.4, key: "moderate", label: "Moderate", color: "#fbc02d", sky: ["#fdf3d5", "#fbfaf2"], ground: "#c9b458", mood: "ok" },
  { max: 55.4, key: "usg", label: "Unhealthy for Sensitive Groups", color: "#ef6c00", sky: ["#fde5cc", "#fdf6ef"], ground: "#e09a52", mood: "meh" },
  { max: 125.4, key: "unhealthy", label: "Unhealthy", color: "#e53935", sky: ["#fbdad8", "#fdf1f0"], ground: "#d96a63", mood: "sad" },
  { max: 225.4, key: "very_unhealthy", label: "Very Unhealthy", color: "#8e24aa", sky: ["#ecd9f2", "#f8f1fa"], ground: "#a35cb5", mood: "sad" },
  { max: Infinity, key: "hazardous", label: "Hazardous", color: "#7f0f3e", sky: ["#f0d3de", "#faf0f4"], ground: "#9c4a6b", mood: "sad" },
];

const CO2_CATEGORIES = [
  { max: 800, key: "good", label: "Fresh", color: "#43a047", sky: ["#dcf3dd", "#f2faf0"], ground: "#66bb6a", mood: "happy" },
  { max: 1000, key: "moderate", label: "Acceptable", color: "#fbc02d", sky: ["#fdf3d5", "#fbfaf2"], ground: "#c9b458", mood: "ok" },
  { max: 1500, key: "usg", label: "Getting Stuffy", color: "#ef6c00", sky: ["#fde5cc", "#fdf6ef"], ground: "#e09a52", mood: "meh" },
  { max: 2000, key: "unhealthy", label: "Stuffy — Ventilate", color: "#e53935", sky: ["#fbdad8", "#fdf1f0"], ground: "#d96a63", mood: "sad" },
  { max: 5000, key: "very_unhealthy", label: "Poor", color: "#8e24aa", sky: ["#ecd9f2", "#f8f1fa"], ground: "#a35cb5", mood: "sad" },
  { max: Infinity, key: "hazardous", label: "Extreme", color: "#7f0f3e", sky: ["#f0d3de", "#faf0f4"], ground: "#9c4a6b", mood: "sad" },
];

// US EPA PM10 AQI breakpoints (24-hour average, µg/m³).
const PM10_CATEGORIES = [
  { max: 54, key: "good", label: "Good", color: "#43a047", sky: ["#dcf3dd", "#f2faf0"], ground: "#66bb6a", mood: "happy" },
  { max: 154, key: "moderate", label: "Moderate", color: "#fbc02d", sky: ["#fdf3d5", "#fbfaf2"], ground: "#c9b458", mood: "ok" },
  { max: 254, key: "usg", label: "Unhealthy for Sensitive Groups", color: "#ef6c00", sky: ["#fde5cc", "#fdf6ef"], ground: "#e09a52", mood: "meh" },
  { max: 354, key: "unhealthy", label: "Unhealthy", color: "#e53935", sky: ["#fbdad8", "#fdf1f0"], ground: "#d96a63", mood: "sad" },
  { max: 424, key: "very_unhealthy", label: "Very Unhealthy", color: "#8e24aa", sky: ["#ecd9f2", "#f8f1fa"], ground: "#a35cb5", mood: "sad" },
  { max: Infinity, key: "hazardous", label: "Hazardous", color: "#7f0f3e", sky: ["#f0d3de", "#faf0f4"], ground: "#9c4a6b", mood: "sad" },
];

// Sensirion VOC Index (1–500). 100 is the sensor's own recent running-average
// baseline; higher means more VOCs than usual for this room.
const VOC_CATEGORIES = [
  { max: 100, key: "good", label: "Clean", color: "#43a047", sky: ["#dcf3dd", "#f2faf0"], ground: "#66bb6a", mood: "happy" },
  { max: 200, key: "moderate", label: "Normal", color: "#fbc02d", sky: ["#fdf3d5", "#fbfaf2"], ground: "#c9b458", mood: "ok" },
  { max: 300, key: "usg", label: "Elevated", color: "#ef6c00", sky: ["#fde5cc", "#fdf6ef"], ground: "#e09a52", mood: "meh" },
  { max: 400, key: "unhealthy", label: "High", color: "#e53935", sky: ["#fbdad8", "#fdf1f0"], ground: "#d96a63", mood: "sad" },
  { max: Infinity, key: "very_unhealthy", label: "Very High", color: "#8e24aa", sky: ["#ecd9f2", "#f8f1fa"], ground: "#a35cb5", mood: "sad" },
];

// Sensirion NOx Index (1–500). Sits at 1 in clean air and only rises during
// nitrogen-oxide events (cooking, combustion, traffic).
const NOX_CATEGORIES = [
  { max: 20, key: "good", label: "Baseline", color: "#43a047", sky: ["#dcf3dd", "#f2faf0"], ground: "#66bb6a", mood: "happy" },
  { max: 150, key: "moderate", label: "Moderate", color: "#fbc02d", sky: ["#fdf3d5", "#fbfaf2"], ground: "#c9b458", mood: "ok" },
  { max: 300, key: "usg", label: "Elevated", color: "#ef6c00", sky: ["#fde5cc", "#fdf6ef"], ground: "#e09a52", mood: "meh" },
  { max: Infinity, key: "unhealthy", label: "High", color: "#e53935", sky: ["#fbdad8", "#fdf1f0"], ground: "#d96a63", mood: "sad" },
];

const WHO_ANNUAL_PM25 = 5.0; // µg/m³, WHO 2021 annual guideline
const UG_PER_CIGARETTE_DAY = 22; // Berkeley Earth: 22 µg/m³ over 24 h ≈ 1 cigarette
const CO2_VENTILATE_PPM = 1000; // classic Pettenkofer / ASHRAE-era comfort line

const METRICS = {
  pm25: {
    key: "pm25",
    labelHtml: "PM<sub>2.5</sub>",
    short: "PM2.5",
    unit: "µg/m³",
    decimals: 1,
    deviceClass: "pm25",
    chartFloor: 5,
    categories: PM25_CATEGORIES,
    nameSuffix: /\s*PM\s*2\.?5$/i,
    attribution:
      "Categories follow the US EPA PM2.5 breakpoints (May 2024). History recorded by Home Assistant's long-term statistics.",
  },
  co2: {
    key: "co2",
    labelHtml: "CO<sub>2</sub>",
    short: "CO₂",
    unit: "ppm",
    decimals: 0,
    deviceClass: "carbon_dioxide",
    chartFloor: 1000,
    categories: CO2_CATEGORIES,
    nameSuffix: /\s*(carbon dioxide|CO₂|CO2)$/i,
    attribution:
      "Categories based on common indoor-ventilation guidance (fresh outdoor air ≈ 420 ppm; 5000 ppm is the OSHA 8-hour limit). History recorded by Home Assistant's long-term statistics.",
  },
  pm10: {
    key: "pm10",
    labelHtml: "PM<sub>10</sub>",
    short: "PM10",
    unit: "µg/m³",
    decimals: 0,
    deviceClass: "pm10",
    chartFloor: 55,
    categories: PM10_CATEGORIES,
    nameSuffix: /\s*PM\s*10$/i,
    attribution:
      "Categories follow the US EPA PM10 AQI breakpoints (24-hour). History recorded by Home Assistant's long-term statistics.",
  },
  voc: {
    key: "voc",
    labelHtml: "VOC index",
    short: "VOC index",
    unit: "",
    decimals: 0,
    deviceClass: null,
    idRe: /_[tv]?voc(_index)?$/i,
    chartFloor: 200,
    categories: VOC_CATEGORIES,
    nameSuffix: /\s*[TV]?VOCs?(\s*index)?$/i,
    attribution:
      "Sensirion VOC Index: 100 is the sensor's recent running-average baseline; higher means more volatile organic compounds than usual for this room. History recorded by Home Assistant's long-term statistics.",
  },
  nox: {
    key: "nox",
    labelHtml: "NOx index",
    short: "NOx index",
    unit: "",
    decimals: 0,
    deviceClass: null,
    idRe: /_nox(_index)?$/i,
    chartFloor: 30,
    categories: NOX_CATEGORIES,
    nameSuffix: /\s*NOx(\s*index)?$/i,
    attribution:
      "Sensirion NOx Index: 1 is the clean-air baseline; it rises during nitrogen-oxide events such as cooking or combustion. History recorded by Home Assistant's long-term statistics.",
  },
};

// ---- WHO colour scale (opt-in with `standard: who`) ---------------------------
// PM2.5 / PM10: the WHO 2021 24-hour guideline (first band) followed by interim
// targets 4 → 1. CO and formaldehyde: WHO guideline values converted to the
// sensor's own unit (anything unrecognised keeps the neutral scale). CO₂, VOC and
// NOx have no WHO guideline, so they always keep their own scale. WHO values are
// 24-hour means (30 min for formaldehyde); the card compares the current reading.
const whoScale = (maxes, labels) =>
  maxes.map((max, i) => ({ ...PM25_CATEGORIES[i], max, label: labels[i] }));
const WHO_PM_LABELS = [
  "Within WHO guideline", "Interim target 4", "Interim target 3",
  "Interim target 2", "Interim target 1", "Above all targets",
];
const WHO_CO_LABELS = [
  "Within WHO guideline", "Above WHO 24 h guideline", "Above indoor 24 h limit",
  "Above 8 h limit", "Above 1 h limit", "Above 15 min limit",
];
const WHO_SCALES = {
  pm25: {
    categories: whoScale([15, 25, 37.5, 50, 75, Infinity], WHO_PM_LABELS),
    catScale: "pm25who", attrKey: "pm25who", chartFloor: 25, who: true,
  },
  pm10: {
    categories: whoScale([45, 50, 75, 100, 150, Infinity], WHO_PM_LABELS),
    catScale: "pm10who", attrKey: "pm10who", chartFloor: 50, who: true,
  },
};
// CO limits: 4 mg/m³ (2021, 24 h) then 7 / 10 / 35 / 100 mg/m³ (24 h indoor, 8 h,
// 1 h, 15 min). ppm uses 1 ppm ≈ 1.145 mg/m³ at 25 °C. Formaldehyde: 0.1 mg/m³ / 30 min.
const WHO_CO_BY_UNIT = {
  ppm: [3.5, 6.1, 8.7, 30.5, 87.3],
  ppb: [3500, 6100, 8700, 30500, 87300],
  "mg/m3": [4, 7, 10, 35, 100],
  "ug/m3": [4000, 7000, 10000, 35000, 100000],
};
const WHO_HCHO_BY_UNIT = { "mg/m3": 0.1, "ug/m3": 100, ppm: 0.08, ppb: 80 };
const normUnit = (u) => String(u ?? "").replace(/[µμ]/g, "u").replace(/³/g, "3").replace(/\s/g, "").toLowerCase();

// Every secondary reading the card can discover on the same device and show as
// a chip. `dc` is the Home Assistant device_class when the platform sets one;
// `idRe` matches the entity_id for readings that carry none (VOC/NOx indices
// and the PM0.3 particle count). Explicit config overrides win over discovery.
// Each reading gets a distinct icon so the chips are legible at a glance even
// when several are shown together (three PM sizes, two Sensirion indices).
// Gas readings are published in ppb / µg/m³ (whole numbers) by some devices and
// in mg/m³ (small decimals) by others, so precision follows the unit.
const unitDigits = (st) => (/mg/i.test(st?.attributes?.unit_of_measurement ?? "") ? 3 : 0);
const batteryIcon = (v) => {
  const n = Math.max(0, Math.min(100, Math.round(v / 10) * 10));
  return n === 100 ? "mdi:battery" : n === 0 ? "mdi:battery-outline" : `mdi:battery-${n}`;
};

const READINGS = {
  temperature: { dc: "temperature", icon: "mdi:thermometer", unit: "°", digits: 0 },
  humidity: { dc: "humidity", icon: "mdi:water-percent", unit: "%", digits: 0 },
  co2: { dc: "carbon_dioxide", icon: "mdi:molecule-co2", unit: "", digits: 0 },
  pm25: { dc: "pm25", icon: "mdi:blur", unit: "", digits: 1 },
  pm1: { dc: "pm1", icon: "mdi:blur-radial", unit: "", digits: 0 },
  pm10: { dc: "pm10", icon: "mdi:dots-grid", unit: "", digits: 0 },
  pm03: { icon: "mdi:grain", unit: "", digits: 0, idRe: /_pm_?0_?3$/i },
  voc: { icon: "mdi:scent", unit: "", digits: 0, idRe: /_[tv]?voc(_index)?$/i },
  nox: { icon: "mdi:smog", unit: "", digits: 0, idRe: /_nox(_index)?$/i },
  // Total VOC as a concentration (ppb, µg/m³ or mg/m³) — not the Sensirion index above.
  tvoc: {
    dc: ["volatile_organic_compounds", "volatile_organic_compounds_parts"],
    icon: "mdi:air-filter", unit: "", digits: 0, digitsFor: unitDigits,
    idRe: /_(tvoc|compuestos_organicos_volatiles|volatile_organic_compounds)$/i,
  },
  hcho: {
    icon: "mdi:flask-outline", unit: "", digits: 0, digitsFor: unitDigits,
    idRe: /_(formaldehyde|hcho|formaldehido)$/i,
  },
  co: {
    dc: "carbon_monoxide", icon: "mdi:molecule-co", unit: "", digits: 1,
    idRe: /_(co|carbon_monoxide|monoxido_de_carbono)$/i,
  },
  // Device-provided air-quality rating: a number (AQI) or a word ("good"). Words
  // are shown as a text chip and get no chart.
  aqi: {
    dc: "aqi", icon: "mdi:gauge", unit: "", digits: 0, text: true,
    idRe: /_(aqi|air_quality(_index)?|calidad_del_aire)$/i,
  },
  battery: { dc: "battery", icon: "mdi:battery", iconFn: batteryIcon, unit: "%", digits: 0 },
};

// Order chips appear in when `chips: auto`.
const CHIP_ORDER = [
  "temperature", "humidity", "co2", "pm25", "pm1", "pm10", "pm03", "voc", "nox",
  "tvoc", "hcho", "co", "aqi", "battery",
];

// Friendly labels for the editor's reading pickers / tick list.
const READING_LABELS = {
  temperature: "Temperature",
  humidity: "Humidity",
  co2: "CO₂",
  pm25: "PM2.5",
  pm1: "PM1",
  pm10: "PM10",
  pm03: "PM0.3",
  voc: "VOC index",
  nox: "NOx index",
  tvoc: "TVOC",
  hcho: "Formaldehyde",
  co: "Carbon monoxide",
  aqi: "Air quality",
  battery: "Battery",
};

/* ------------------------------------------------------------------ */
/* Translations                                                         */
/* ------------------------------------------------------------------ */
// To add a language: copy the `en` block, translate the values (keep the
// {placeholders}) and register it as I18N.<code>. The card follows the Home
// Assistant UI language and falls back to English for any missing key; it can
// also be forced with `language: <code>` in the card config.

const catKeys = (metric, labels) =>
  Object.fromEntries(Object.entries(labels).map(([k, v]) => [`cat.${metric}.${k}`, v]));

const EPA_EN = {
  good: "Good", moderate: "Moderate", usg: "Unhealthy for Sensitive Groups",
  unhealthy: "Unhealthy", very_unhealthy: "Very Unhealthy", hazardous: "Hazardous",
};
const EPA_ES = {
  good: "Buena", moderate: "Moderada", usg: "Dañina para grupos sensibles",
  unhealthy: "Dañina", very_unhealthy: "Muy dañina", hazardous: "Peligrosa",
};

const I18N = {
  en: {
    "lang.name": "English",
    "lang.auto": "Automatic (Home Assistant language)",
    offline: "Offline",
    "stub.name": "Air Quality",
    "aria.scene": "Show air quality details",
    "aria.sheet": "{name} air quality details",
    "aria.close": "Close",
    "card.description":
      "Animated air-quality card for PM2.5, CO₂, PM10, VOC or NOx, with auto-discovered chips and tap-to-expand charts and history.",
    ...catKeys("pm25", EPA_EN),
    ...catKeys("pm10", EPA_EN),
    ...catKeys("co2", {
      good: "Fresh", moderate: "Acceptable", usg: "Getting Stuffy",
      unhealthy: "Stuffy — Ventilate", very_unhealthy: "Poor", hazardous: "Extreme",
    }),
    ...catKeys("voc", {
      good: "Clean", moderate: "Normal", usg: "Elevated", unhealthy: "High", very_unhealthy: "Very High",
    }),
    ...catKeys("nox", { good: "Baseline", moderate: "Moderate", usg: "Elevated", unhealthy: "High" }),
    "reading.temperature": "Temperature",
    "reading.humidity": "Humidity",
    "reading.co2": "CO₂",
    "reading.pm25": "PM2.5",
    "reading.pm1": "PM1",
    "reading.pm10": "PM10",
    "reading.pm03": "PM0.3",
    "reading.voc": "VOC index",
    "reading.nox": "NOx index",
    "reading.tvoc": "TVOC",
    "reading.hcho": "Formaldehyde",
    "reading.co": "Carbon monoxide",
    "reading.aqi": "Air quality",
    "reading.battery": "Battery",
    ...catKeys("pm25who", {
      good: "Within WHO guideline", moderate: "Interim target 4", usg: "Interim target 3",
      unhealthy: "Interim target 2", very_unhealthy: "Interim target 1", hazardous: "Above all targets",
    }),
    ...catKeys("pm10who", {
      good: "Within WHO guideline", moderate: "Interim target 4", usg: "Interim target 3",
      unhealthy: "Interim target 2", very_unhealthy: "Interim target 1", hazardous: "Above all targets",
    }),
    ...catKeys("cowho", {
      good: "Within WHO guideline", moderate: "Above WHO 24 h guideline", usg: "Above indoor 24 h limit",
      unhealthy: "Above 8 h limit", very_unhealthy: "Above 1 h limit", hazardous: "Above 15 min limit",
    }),
    ...catKeys("hchowho", { good: "Within WHO guideline", unhealthy: "Above WHO guideline" }),
    "attr.pm25who":
      "Categories follow the WHO 2021 air quality guideline for 24-hour mean PM2.5 (15 µg/m³) and its interim targets (25, 37.5, 50 and 75 µg/m³). WHO values are 24-hour means; the card compares the current reading. History recorded by Home Assistant's long-term statistics.",
    "attr.pm10who":
      "Categories follow the WHO 2021 air quality guideline for 24-hour mean PM10 (45 µg/m³) and its interim targets (50, 75, 100 and 150 µg/m³). WHO values are 24-hour means; the card compares the current reading. History recorded by Home Assistant's long-term statistics.",
    "tile.aboveGuidelineSub": "Time above the WHO guideline in the last 24 h",
    "ed.standard": "Colour scale",
    "ed.standard.epa": "US EPA (default)",
    "ed.standard.who": "WHO 2021 guidelines (PM, CO, formaldehyde)",
    "attr.pm25":
      "Categories follow the US EPA PM2.5 breakpoints (May 2024). History recorded by Home Assistant's long-term statistics.",
    "attr.co2":
      "Categories based on common indoor-ventilation guidance (fresh outdoor air ≈ 420 ppm; 5000 ppm is the OSHA 8-hour limit). History recorded by Home Assistant's long-term statistics.",
    "attr.pm10":
      "Categories follow the US EPA PM10 AQI breakpoints (24-hour). History recorded by Home Assistant's long-term statistics.",
    "attr.voc":
      "Sensirion VOC Index: 100 is the sensor's recent running-average baseline; higher means more volatile organic compounds than usual for this room. History recorded by Home Assistant's long-term statistics.",
    "attr.nox":
      "Sensirion NOx Index: 1 is the clean-air baseline; it rises during nitrogen-oxide events such as cooking or combustion. History recorded by Home Assistant's long-term statistics.",
    "tile.last24": "Last 24 h",
    "tile.last12": "Last 12 h",
    "tile.average": "average {metric}",
    "tile.pending": "Collecting data — check back soon",
    "tile.peak": "Peak — last 24 h",
    "tile.peakSub": "Highest reading · {category}",
    "tile.above": "Above {limit}",
    "tile.aboveSub": "Time above the {range} range in the last 24 h",
    "tile.co2AboveSub": "Time past the ventilate line in the last 24 h",
    "tile.whoTitle": "WHO annual guideline",
    "tile.who": "{ratio}× the WHO annual guideline",
    "tile.whoSub": "{days}-day average · guideline {guideline} µg/m³",
    "tile.cig": "Cigarettes smoked",
    "tile.cigSub.one": "Equivalent pollution over the last {n} day",
    "tile.cigSub.other": "Equivalent pollution over the last {n} days",
    "chart.title24": "{metric} — last 24 hours",
    "chart.title10": "{metric} — last 10 days by hour",
    "chart.every": "Every reading — last 24 hours",
    "chart.noHistory": "No history yet — the chart fills in as Home Assistant records data.",
    "chart.noHourly": "No hourly statistics yet — this view builds up over the next days.",
    "chart.noData": "no data",
    "day.today": "Today",
    "day.yesterday": "Yesterday",
    "ed.metric": "Primary reading",
    "ed.entity": "Sensor",
    "ed.name": "Name (optional)",
    "ed.view": "Card layout",
    "ed.view.scene": "Scene — all readings",
    "ed.view.circle": "Circle — value and status",
    "ed.size": "Circle diameter (px)",
    "ed.chipsMode": "Secondary chips",
    "ed.chipsItems": "Readings to show",
    "ed.language": "Language",
    "ed.readingSensor": "{reading} sensor (auto-detected)",
    "ed.metric.pm25": "PM2.5 — US EPA categories",
    "ed.metric.co2": "CO₂ — ventilation categories",
    "ed.metric.pm10": "PM10 — US EPA categories",
    "ed.metric.voc": "VOC index — Sensirion scale",
    "ed.metric.nox": "NOx index — Sensirion scale",
    "ed.chips.auto": "All readings on the device",
    "ed.chips.minimal": "Minimal — temperature, humidity & one pollutant",
    "ed.chips.custom": "Customise — pick readings & assign sensors",
  },
  es: {
    "lang.name": "Español",
    "lang.auto": "Automático (idioma de Home Assistant)",
    offline: "Sin conexión",
    "stub.name": "Calidad del aire",
    "aria.scene": "Mostrar detalles de la calidad del aire",
    "aria.sheet": "Detalles de la calidad del aire de {name}",
    "aria.close": "Cerrar",
    "card.description":
      "Tarjeta animada de calidad del aire para PM2.5, CO₂, PM10, VOC o NOx, con chips autodetectados y, al tocarla, gráficos e historial.",
    ...catKeys("pm25", EPA_ES),
    ...catKeys("pm10", EPA_ES),
    ...catKeys("co2", {
      good: "Aire fresco", moderate: "Aceptable", usg: "Empieza a cargarse",
      unhealthy: "Cargado — ventila", very_unhealthy: "Mala", hazardous: "Extrema",
    }),
    ...catKeys("voc", {
      good: "Limpio", moderate: "Normal", usg: "Elevado", unhealthy: "Alto", very_unhealthy: "Muy alto",
    }),
    ...catKeys("nox", { good: "Base", moderate: "Moderado", usg: "Elevado", unhealthy: "Alto" }),
    "reading.temperature": "Temperatura",
    "reading.humidity": "Humedad",
    "reading.co2": "CO₂",
    "reading.pm25": "PM2.5",
    "reading.pm1": "PM1",
    "reading.pm10": "PM10",
    "reading.pm03": "PM0.3",
    "reading.voc": "Índice VOC",
    "reading.nox": "Índice NOx",
    "reading.tvoc": "TVOC",
    "reading.hcho": "Formaldehído",
    "reading.co": "Monóxido de carbono",
    "reading.aqi": "Calidad del aire",
    "reading.battery": "Batería",
    ...catKeys("pm25who", {
      good: "Cumple la guía de la OMS", moderate: "Objetivo intermedio 4", usg: "Objetivo intermedio 3",
      unhealthy: "Objetivo intermedio 2", very_unhealthy: "Objetivo intermedio 1", hazardous: "Supera todos los objetivos",
    }),
    ...catKeys("pm10who", {
      good: "Cumple la guía de la OMS", moderate: "Objetivo intermedio 4", usg: "Objetivo intermedio 3",
      unhealthy: "Objetivo intermedio 2", very_unhealthy: "Objetivo intermedio 1", hazardous: "Supera todos los objetivos",
    }),
    ...catKeys("cowho", {
      good: "Cumple la guía de la OMS", moderate: "Supera la guía de 24 h de la OMS", usg: "Supera el límite interior de 24 h",
      unhealthy: "Supera el límite de 8 h", very_unhealthy: "Supera el límite de 1 h", hazardous: "Supera el límite de 15 min",
    }),
    ...catKeys("hchowho", { good: "Cumple la guía de la OMS", unhealthy: "Supera la guía de la OMS" }),
    "attr.pm25who":
      "Las categorías siguen la guía de la OMS de 2021 para PM2.5 en media de 24 horas (15 µg/m³) y sus objetivos intermedios (25, 37,5, 50 y 75 µg/m³). Los valores de la OMS son medias de 24 horas; la tarjeta compara la lectura actual. Historial registrado por las estadísticas a largo plazo de Home Assistant.",
    "attr.pm10who":
      "Las categorías siguen la guía de la OMS de 2021 para PM10 en media de 24 horas (45 µg/m³) y sus objetivos intermedios (50, 75, 100 y 150 µg/m³). Los valores de la OMS son medias de 24 horas; la tarjeta compara la lectura actual. Historial registrado por las estadísticas a largo plazo de Home Assistant.",
    "tile.aboveGuidelineSub": "Tiempo por encima de la guía de la OMS en las últimas 24 h",
    "ed.standard": "Escala de colores",
    "ed.standard.epa": "EPA de EE. UU. (por defecto)",
    "ed.standard.who": "Guías de la OMS 2021 (PM, CO, formaldehído)",
    "attr.pm25":
      "Las categorías siguen los umbrales de la EPA de EE. UU. para PM2.5 (mayo de 2024). Historial registrado por las estadísticas a largo plazo de Home Assistant.",
    "attr.co2":
      "Categorías basadas en las pautas habituales de ventilación de interiores (el aire exterior fresco ronda las 420 ppm; 5000 ppm es el límite de 8 horas de la OSHA). Historial registrado por las estadísticas a largo plazo de Home Assistant.",
    "attr.pm10":
      "Las categorías siguen los umbrales del AQI de PM10 de la EPA de EE. UU. (promedio de 24 horas). Historial registrado por las estadísticas a largo plazo de Home Assistant.",
    "attr.voc":
      "Índice VOC de Sensirion: 100 es la línea base, es decir, el promedio reciente del sensor; un valor mayor indica más compuestos orgánicos volátiles de lo habitual en esta estancia. Historial registrado por las estadísticas a largo plazo de Home Assistant.",
    "attr.nox":
      "Índice NOx de Sensirion: 1 es la línea base de aire limpio; sube durante episodios de óxidos de nitrógeno, como al cocinar o en combustiones. Historial registrado por las estadísticas a largo plazo de Home Assistant.",
    "tile.last24": "Últimas 24 h",
    "tile.last12": "Últimas 12 h",
    "tile.average": "media de {metric}",
    "tile.pending": "Recopilando datos: vuelve a mirar en un rato",
    "tile.peak": "Pico — últimas 24 h",
    "tile.peakSub": "Lectura más alta · {category}",
    "tile.above": "Por encima de {limit}",
    "tile.aboveSub": "Tiempo por encima del rango «{range}» en las últimas 24 h",
    "tile.co2AboveSub": "Tiempo por encima del umbral de ventilación en las últimas 24 h",
    "tile.whoTitle": "Guía anual de la OMS",
    "tile.who": "{ratio}× la guía anual de la OMS",
    "tile.whoSub": "Media de {days} días · guía {guideline} µg/m³",
    "tile.cig": "Cigarrillos fumados",
    "tile.cigSub.one": "Contaminación equivalente del último día",
    "tile.cigSub.other": "Contaminación equivalente de los últimos {n} días",
    "chart.title24": "{metric} — últimas 24 horas",
    "chart.title10": "{metric} — últimos 10 días por hora",
    "chart.every": "Todas las lecturas — últimas 24 horas",
    "chart.noHistory": "Aún no hay historial: el gráfico se irá llenando a medida que Home Assistant registre datos.",
    "chart.noHourly": "Aún no hay estadísticas por hora: esta vista se irá completando en los próximos días.",
    "chart.noData": "sin datos",
    "day.today": "Hoy",
    "day.yesterday": "Ayer",
    "ed.metric": "Lectura principal",
    "ed.entity": "Sensor",
    "ed.name": "Nombre (opcional)",
    "ed.view": "Diseño de la tarjeta",
    "ed.view.scene": "Escena — todas las lecturas",
    "ed.view.circle": "Círculo — valor y estado",
    "ed.size": "Diámetro del círculo (px)",
    "ed.chipsMode": "Chips secundarios",
    "ed.chipsItems": "Lecturas a mostrar",
    "ed.language": "Idioma",
    "ed.readingSensor": "Sensor de {reading} (autodetectado)",
    "ed.metric.pm25": "PM2.5 — categorías de la EPA de EE. UU.",
    "ed.metric.co2": "CO₂ — categorías de ventilación",
    "ed.metric.pm10": "PM10 — categorías de la EPA de EE. UU.",
    "ed.metric.voc": "Índice VOC — escala Sensirion",
    "ed.metric.nox": "Índice NOx — escala Sensirion",
    "ed.chips.auto": "Todas las lecturas del dispositivo",
    "ed.chips.minimal": "Mínimo: temperatura, humedad y un contaminante",
    "ed.chips.custom": "Personalizado: elige lecturas y asigna sensores",
  },
};

// Readings whose display name is plain text (the PM/CO₂ names carry <sub>
// markup and are the same in every language).
const TRANSLATED_READINGS = new Set([
  "temperature", "humidity", "voc", "nox", "tvoc", "hcho", "co", "aqi", "battery",
]);

/** Dictionary language to use: explicit override, else the Home Assistant UI
 *  language ("es-419" → "es"), else English. */
const resolveLang = (override, hass) => {
  const raw = String(
    override && override !== "auto" ? override : hass?.locale?.language ?? hass?.language ?? "en"
  )
    .toLowerCase()
    .replace("_", "-");
  if (I18N[raw]) return raw;
  const base = raw.split("-")[0];
  return I18N[base] ? base : "en";
};

/** Look up `key` (lang → English → fallback → the key itself) and fill {vars}. */
const translate = (lang, key, vars, fallback) => {
  let s = I18N[lang]?.[key] ?? I18N.en[key] ?? fallback ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
  return s;
};

/** Locale-aware number formatting. `fixed` keeps trailing zeros (e.g. "3.0");
 *  otherwise they are dropped ("3"). Grouping is off so 1200 stays "1200". */
const formatNumber = (v, digits = 1, locale = "en", fixed = false) => {
  if (v == null || Number.isNaN(v)) return "–";
  const opts = {
    minimumFractionDigits: fixed ? digits : 0,
    maximumFractionDigits: digits,
    useGrouping: false,
  };
  try {
    return Number(v).toLocaleString(locale, opts);
  } catch {
    return Number(v).toLocaleString("en", opts);
  }
};

const CARD_VERSION = "1.4.0-compact.4";


/** Escape a value for interpolation into markup. Entity friendly_name and the
 *  card's own `name` option are freeform user text, so anything that reaches an
 *  innerHTML template — text node or attribute value — has to go through here. */
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]
  );

class AirQualitySceneCard extends HTMLElement {
  static getStubConfig(hass) {
    const entity = Object.keys(hass?.states ?? {}).find((id) =>
      ["pm25", "carbon_dioxide"].includes(hass.states[id]?.attributes?.device_class)
    );
    // Generic name so the picker preview doesn't display whichever real
    // sensor the stub happened to grab. Cleared or replaced in the editor.
    return { entity: entity ?? "sensor.pm2_5", name: translate(resolveLang(null, hass), "stub.name") };
  }

  static async getConfigElement() {
    return document.createElement("air-quality-scene-card-editor");
  }

  setConfig(config) {
    if (!config?.entity) {
      throw new Error("air-quality-scene-card: 'entity' (a PM2.5 or CO₂ sensor) is required");
    }
    if (config.metric && !METRICS[config.metric]) {
      throw new Error(
        "air-quality-scene-card: 'metric' must be one of: " + Object.keys(METRICS).join(", ")
      );
    }
    if (
      config.chips != null &&
      config.chips !== "auto" &&
      config.chips !== "minimal" &&
      !Array.isArray(config.chips)
    ) {
      throw new Error(
        "air-quality-scene-card: 'chips' must be 'auto', 'minimal', or a list of reading keys"
      );
    }
    if (config.standard != null && !["epa", "who"].includes(config.standard)) {
      throw new Error("air-quality-scene-card: 'standard' must be 'epa' or 'who'");
    }
    if (config.view != null && !["scene", "circle"].includes(config.view)) {
      throw new Error("air-quality-scene-card: 'view' must be 'scene' or 'circle'");
    }
    if (config.size != null && (typeof config.size !== "number" ||
        !Number.isFinite(config.size) || config.size < 100 || config.size > 320)) {
      throw new Error("air-quality-scene-card: 'size' must be a number between 100 and 320 px");
    }
    this._config = config;
    this._statsCacheAt = 0;
    if (this.shadowRoot) this.shadowRoot.innerHTML = "";
    this._built = false;
  }

  /** The active metric: explicit config, else inferred from the entity, else pm25. */
  _metric() {
    const base = this._config.metric
      ? METRICS[this._config.metric]
      : this._metricForEntity(this._config.entity);
    return this._applyStandard(base);
  }

  /** Infer a headline metric from an entity's device_class, or entity_id for
   * the unitless indices (which carry no device_class). Falls back to pm25. */
  _metricForEntity(entityId) {
    const dc = this._hass?.states[entityId]?.attributes?.device_class;
    const byDc = { carbon_dioxide: "co2", pm25: "pm25", pm10: "pm10" }[dc];
    if (byDc) return METRICS[byDc];
    for (const key of ["voc", "nox"]) {
      if (METRICS[key].idRe?.test(entityId)) return METRICS[key];
    }
    return METRICS.pm25;
  }

  _categoryFor(value) {
    return this._catForMetric(this._metric(), value);
  }

  _catForMetric(metric, value) {
    const cats = metric.categories;
    return cats.find((c) => value <= c.max) ?? cats[cats.length - 1];
  }

  /** A metric-like descriptor for any reading, used to draw its 24 h chart in
   *  the expanded view. The five headline readings reuse their full category
   *  scale; the rest get a sensible unit/precision and a single neutral colour
   *  (PM1 borrows the PM2.5 scale as a reasonable stand-in). */
  _readingMetric(key) {
    const headline = { co2: "co2", pm25: "pm25", pm10: "pm10", voc: "voc", nox: "nox" }[key];
    if (headline) return this._applyStandard(METRICS[headline]);
    const st = this._related?.[key] && this._hass.states[this._related[key]];
    const unit = esc(st?.attributes?.unit_of_measurement ?? READINGS[key]?.unit ?? "");
    const base = {
      pm1: { labelHtml: "PM<sub>1</sub>", short: "PM1", decimals: 0, chartFloor: 5, categories: PM25_CATEGORIES, catScale: "pm25" },
      pm03: { labelHtml: "PM<sub>0.3</sub>", short: "PM0.3", decimals: 0, chartFloor: 0, color: "#5c6bc0" },
      temperature: { labelHtml: this._t("reading.temperature"), short: this._t("reading.temperature"), decimals: 1, chartFloor: 0, color: "#ff8f00" },
      humidity: { labelHtml: this._t("reading.humidity"), short: this._t("reading.humidity"), decimals: 0, chartFloor: 100, color: "#29b6f6" },
      tvoc: { labelHtml: this._t("reading.tvoc"), short: this._t("reading.tvoc"), decimals: /mg/i.test(unit) ? 3 : 0, chartFloor: 0, color: "#8e24aa" },
      hcho: { labelHtml: this._t("reading.hcho"), short: this._t("reading.hcho"), decimals: /mg/i.test(unit) ? 3 : 0, chartFloor: 0, color: "#ec407a" },
      co: { labelHtml: this._t("reading.co"), short: this._t("reading.co"), decimals: 1, chartFloor: 0, color: "#6d4c41" },
      aqi: { labelHtml: this._t("reading.aqi"), short: this._t("reading.aqi"), decimals: 0, chartFloor: 0, color: "#26a69a" },
      battery: { labelHtml: this._t("reading.battery"), short: this._t("reading.battery"), decimals: 0, chartFloor: 100, color: "#66bb6a" },
    }[key] ?? { labelHtml: key, short: key, decimals: 0, chartFloor: 0, color: "#607d8b" };
    const who = this._whoReadingScale(key, unit);
    return {
      key,
      ...base,
      unit,
      ...(who ? { catScale: who.catScale } : {}),
      categories:
        who?.categories ??
        base.categories ??
        [{ max: Infinity, label: base.short, color: base.color, mood: "ok", sky: ["#fff", "#fff"], ground: base.color }],
    };
  }

  /** Which secondary readings to show as chips, honouring the `chips` option.
   *  auto (default): every discovered reading except the headline one.
   *  minimal: temperature, humidity and one complementary pollutant.
   *  array: exactly the listed reading keys, in that order. */
  _chipKeys(metric) {
    const chips = this._config.chips ?? "auto";
    if (Array.isArray(chips)) return chips.filter((k) => k !== metric.key);
    if (chips === "minimal") {
      return ["temperature", "humidity", metric.key === "co2" ? "pm25" : "co2"];
    }
    return CHIP_ORDER.filter((k) => k !== metric.key);
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._built) this._build();
    const state = hass.states[this._config.entity];
    // Re-render when the primary reading changes, or when any discovered chip
    // value changes (they update together on each device poll).
    const relSig = state
      ? this._relatedIds(state).map((id) => hass.states[id]?.state).join()
      : "";
    const fingerprint = state
      ? `${state.state}|${state.last_updated}|${relSig}`
      : "missing";
    if (fingerprint !== this._fingerprint) {
      this._fingerprint = fingerprint;
      this._update();
    }
  }

  getCardSize() {
    return this._config?.view === "circle" ? Math.ceil((this._config.size ?? 140) / 50) : 4;
  }

  /* ------------------------------------------------------------------ */
  /* Localisation                                                         */
  /* ------------------------------------------------------------------ */

  /** Locale for Intl / number formatting: config override, else HA's language. */
  _locale() {
    const l = this._config?.language;
    return l && l !== "auto" ? l : this._hass?.locale?.language ?? this._hass?.language;
  }

  /** Dictionary language used for text (falls back to English). */
  _lang() {
    return resolveLang(this._config?.language, this._hass);
  }

  _t(key, vars, fallback) {
    return translate(this._lang(), key, vars, fallback);
  }

  _fmt(v, digits = 1, fixed = false) {
    return formatNumber(v, digits, this._locale() ?? "en", fixed);
  }

  _cap(s) {
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
  }

  /** With `standard: who`, PM2.5 / PM10 switch to the WHO scale (no-op otherwise). */
  _applyStandard(metric) {
    const w = this._config.standard === "who" ? WHO_SCALES[metric.key] : null;
    return w ? { ...metric, ...w } : metric;
  }

  /** WHO scale for the secondary CO / formaldehyde readings, in the sensor's unit. */
  _whoReadingScale(key, unit) {
    if (this._config.standard !== "who") return null;
    const u = normUnit(unit);
    if (key === "co" && WHO_CO_BY_UNIT[u]) {
      return { catScale: "cowho", categories: whoScale([...WHO_CO_BY_UNIT[u], Infinity], WHO_CO_LABELS) };
    }
    if (key === "hcho" && WHO_HCHO_BY_UNIT[u] != null) {
      return {
        catScale: "hchowho",
        categories: [
          { ...PM25_CATEGORIES[0], max: WHO_HCHO_BY_UNIT[u], label: "Within WHO guideline" },
          { ...PM25_CATEGORIES[3], max: Infinity, label: "Above WHO guideline" },
        ],
      };
    }
    return null;
  }

  /** Text-valued readings (e.g. an "air quality" word) can't be charted. */
  _isNumericReading(key) {
    if (!READINGS[key]?.text) return true;
    const st = this._hass?.states[this._related?.[key]];
    return !!st && !isNaN(Number(st.state));
  }

  /** Translated category label (`cat` comes from `metric.categories`). */
  _catLabel(metric, cat) {
    if (!cat?.key) return cat?.label ?? "";
    return this._t(`cat.${metric.catScale ?? metric.key}.${cat.key}`, undefined, cat.label);
  }

  _mHtml(metric) {
    return TRANSLATED_READINGS.has(metric.key)
      ? this._t(`reading.${metric.key}`, undefined, metric.labelHtml)
      : metric.labelHtml;
  }

  /** Short name for use mid-sentence: lower-cases the first letter of
   *  ordinary words ("Índice VOC" → "índice VOC") but not acronyms. */
  _mShort(metric) {
    if (!TRANSLATED_READINGS.has(metric.key)) return metric.short;
    const s = this._t(`reading.${metric.key}`, undefined, metric.short);
    return /^\p{Lu}\p{Ll}/u.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s;
  }

  /* ------------------------------------------------------------------ */
  /* Entity discovery: find sibling sensors on the same device           */
  /* ------------------------------------------------------------------ */

  _relatedIds(state) {
    if (this._related && this._relatedFor === this._config.entity) {
      return Object.values(this._related).filter(Boolean);
    }
    const hass = this._hass;
    const related = { primary: this._config.entity };
    const reg = hass.entities?.[this._config.entity];
    if (reg?.device_id && hass.entities) {
      const siblings = Object.values(hass.entities).filter(
        (e) => e.device_id === reg.device_id
      );
      const cands = siblings.filter(
        (s) =>
          s.entity_id !== this._config.entity &&
          // Readings are always sensors; skip number/switch/binary_sensor siblings
          // (e.g. a "CO₂ alarm threshold" number that shares the device_class).
          s.entity_id.startsWith("sensor.") &&
          hass.states[s.entity_id]
      );
      const taken = new Set();
      const assign = (match) => {
        for (const sib of cands) {
          if (taken.has(sib.entity_id)) continue;
          const dc = hass.states[sib.entity_id].attributes?.device_class;
          for (const [key, r] of Object.entries(READINGS)) {
            if (related[key]) continue;
            if (match(r, sib.entity_id, dc)) {
              related[key] = sib.entity_id;
              taken.add(sib.entity_id);
              break;
            }
          }
        }
      };
      // entity_id first, device_class second: some integrations tag several gases
      // (formaldehyde, TVOC…) with the same device_class, so the name is the more
      // reliable discriminator; device_class then fills in whatever is left.
      assign((r, id) => r.idRe?.test(id));
      assign((r, id, dc) => r.dc && [].concat(r.dc).includes(dc));
    }
    // Explicit overrides from config always win over discovery.
    for (const key of Object.keys(READINGS)) {
      if (this._config[key]) related[key] = this._config[key];
    }
    this._related = related;
    this._relatedFor = this._config.entity;
    return Object.values(related).filter(Boolean);
  }

  /* ------------------------------------------------------------------ */
  /* DOM                                                                  */
  /* ------------------------------------------------------------------ */

  _build() {
    this._built = true;
    const root = this.shadowRoot ?? this.attachShadow({ mode: "open" });
    root.innerHTML = `
      <style>${AirQualitySceneCard.styles}</style>
      <ha-card data-view="${this._config.view ?? "scene"}" style="--circle-size:${this._config.size ?? 140}px">
        <div class="scene" role="button" tabindex="0" aria-label="${this._t("aria.scene")}">
          <div class="sky"></div>
          <div class="clouds">
            <div class="cloud c1"></div><div class="cloud c2"></div><div class="cloud c3"></div>
          </div>
          <svg class="hills" viewBox="0 0 400 90" preserveAspectRatio="none" aria-hidden="true">
            <path class="hill hill-back" d="M0,58 C60,30 130,44 200,50 C280,56 330,34 400,48 L400,90 L0,90 Z"></path>
            <path class="hill hill-front" d="M0,74 C80,56 150,70 230,66 C310,62 350,72 400,64 L400,90 L0,90 Z"></path>
            <g class="trees"></g>
          </svg>
          <div class="head">
            <div class="titles">
              <div class="name"></div>
              <div class="category"></div>
            </div>
            <div class="mascot-badge"><svg class="mascot" viewBox="0 0 80 80"></svg></div>
          </div>
          <div class="pm"><b class="pm-value"></b><span class="pm-caption"><span class="pm-label"></span><span class="pm-unit"></span></span></div>
          <div class="meta"></div>
          <div class="strip"><div class="chips" role="region" tabindex="0" aria-label="${esc(this._t("ed.chipsItems"))}"></div></div>
        </div>
      </ha-card>
      <div class="overlay" hidden></div>
      <div class="tooltip" hidden></div>
    `;
    const scene = root.querySelector(".scene");
    scene.addEventListener("click", () => this._openOverlay());
    scene.addEventListener("keydown", (ev) => {
      if (ev.target === root.querySelector(".chips") && ev.key === " ") return;
      if (ev.key === "Enter" || ev.key === " ") {
        ev.preventDefault();
        this._openOverlay();
      }
    });
    const trees = root.querySelector(".trees");
    const treeXs = [26, 52, 196, 318, 352];
    trees.innerHTML = treeXs
      .map(
        (x, i) => `
        <g class="tree t${i}" transform="translate(${x},${62 + (i % 2) * 8})">
          <rect x="-1.6" y="0" width="3.2" height="9" rx="1" class="trunk"></rect>
          <path d="M0,-16 L8,2 L-8,2 Z" class="leaves"></path>
          <path d="M0,-9 L9.5,6 L-9.5,6 Z" class="leaves"></path>
        </g>`
      )
      .join("");
  }

  _mascotSvg(mood) {
    const face = {
      happy: `<path d="M30 47 Q40 56 50 47" class="mouth"/><circle cx="31" cy="38" r="3.2" class="eye"/><circle cx="49" cy="38" r="3.2" class="eye"/>`,
      ok: `<path d="M31 49 L49 49" class="mouth"/><circle cx="31" cy="38" r="3.2" class="eye"/><circle cx="49" cy="38" r="3.2" class="eye"/>`,
      meh: `<path d="M31 51 Q40 46 49 51" class="mouth"/><circle cx="31" cy="38" r="3.2" class="eye"/><circle cx="49" cy="38" r="3.2" class="eye"/>`,
      sad: `<path d="M30 52 Q40 44 50 52" class="mouth"/><path d="M26 36 L36 39" class="brow"/><path d="M54 36 L44 39" class="brow"/><circle cx="31" cy="41" r="3" class="eye"/><circle cx="49" cy="41" r="3" class="eye"/>`,
    }[mood];
    return `
      <path d="M22 12 h36 a8 8 0 0 1 8 8 v34 a14 14 0 0 1 -14 14 h-24 a14 14 0 0 1 -14 -14 v-34 a8 8 0 0 1 8 -8 Z" class="body"/>
      <path d="M22 12 h36 a8 8 0 0 1 8 8 v6 h-52 v-6 a8 8 0 0 1 8 -8 Z" class="cap"/>
      <circle cx="25" cy="47" r="2.6" class="blush"/><circle cx="55" cy="47" r="2.6" class="blush"/>
      ${face}`;
  }

  _update() {
    const root = this.shadowRoot;
    const hass = this._hass;
    const state = hass.states[this._config.entity];
    const scene = root.querySelector(".scene");
    const metric = this._metric();
    scene.setAttribute("aria-label", this._t("aria.scene"));

    // A name equal to the built-in default title (saved literally in the config
    // when the card was created) is shown in the current language.
    const cfgName = Object.values(I18N).some((d) => d["stub.name"] === this._config.name)
      ? this._t("stub.name")
      : this._config.name;
    const name =
      cfgName ||
      state?.attributes?.friendly_name?.replace(metric.nameSuffix, "") ||
      this._config.entity;
    root.querySelector(".name").textContent = name;
    root.querySelector(".pm-label").innerHTML = this._mHtml(metric);
    root.querySelector(".pm-unit").textContent = metric.unit;

    if (!state || ["unavailable", "unknown", ""].includes(state.state) || !Number.isFinite(Number(state.state))) {
      scene.dataset.category = "offline";
      root.querySelector(".category").textContent = this._t("offline");
      root.querySelector(".pm-value").textContent = "–";
      root.querySelector(".mascot").innerHTML = this._mascotSvg("ok");
      this._renderCompactReadings(metric);
      if (!root.querySelector(".overlay").hidden) this._renderOverlay();
      return;
    }

    const value = Number(state.state);
    const cat = this._categoryFor(value);
    scene.dataset.category = cat.key;
    scene.style.setProperty("--cat-color", cat.color);
    scene.style.setProperty("--cat-sky-top", cat.sky[0]);
    scene.style.setProperty("--cat-sky-bottom", cat.sky[1]);
    scene.style.setProperty("--cat-ground", cat.ground);
    root.querySelector(".category").textContent = this._catLabel(metric, cat);
    root.querySelector(".pm-value").textContent = this._fmt(value, metric.decimals);
    root.querySelector(".mascot").innerHTML = this._mascotSvg(cat.mood);

    this._renderCompactReadings(metric);

    if (!root.querySelector(".overlay").hidden) this._renderOverlay();
  }

  /** Compact layout uses real entity units; it never guesses gas concentrations. */
  _renderCompactReadings(metric) {
    this._relatedIds(this._hass.states[this._config.entity]);
    const readings = [];
    const metadata = [];
    for (const key of this._chipKeys(metric)) {
      const r = READINGS[key];
      const st = r && this._hass.states[this._related[key]];
      if (!st) continue;
      const label = this._t(`reading.${key}`, undefined, READING_LABELS[key] ?? key);
      const short = { voc: "VOC", nox: "NOx", hcho: "HCHO", co: "CO" }[key] ?? label;
      const missing = ["unavailable", "unknown", ""].includes(st.state);
      const num = Number(st.state);
      const numeric = !missing && Number.isFinite(num);
      if (!missing && !numeric && !r.text) continue;
      const digits = r.digitsFor ? r.digitsFor(st) : r.digits;
      const value = missing ? "–" : numeric ? this._fmt(num, digits)
        : (this._hass.formatEntityState?.(st) ?? st.state);
      const unit = numeric ? (st.attributes?.unit_of_measurement ?? r.unit) : "";
      const icon = numeric && r.iconFn ? r.iconFn(num) : r.icon;
      const description = `${label}: ${value}${unit ? ` ${unit}` : ""}`;
      const html = `<span class="chip" title="${esc(description)}" aria-label="${esc(description)}">
        <ha-icon icon="${esc(icon)}" aria-hidden="true"></ha-icon>
        <span class="chip-content"><span class="chip-label">${esc(short)}</span>
        <span class="chip-reading">${esc(value)}<small>${esc(unit)}</small></span></span></span>`;
      (key === "aqi" || key === "battery" ? metadata : readings).push(html);
    }
    this.shadowRoot.querySelector(".chips").innerHTML = readings.join("");
    this.shadowRoot.querySelector(".meta").innerHTML = metadata.join("");
  }

  /* ------------------------------------------------------------------ */
  /* Expanded view                                                        */
  /* ------------------------------------------------------------------ */

  async _openOverlay() {
    const overlay = this.shadowRoot.querySelector(".overlay");
    const previousSheet = overlay.querySelector(".sheet");
    if (previousSheet) previousSheet.scrollTop = 0;
    overlay.hidden = false;
    document.body.style.setProperty("overflow", "hidden");
    this._escHandler = (ev) => ev.key === "Escape" && this._closeOverlay();
    window.addEventListener("keydown", this._escHandler);
    this._renderOverlay();
    await this._loadStats();
    this._renderOverlay();
  }

  _closeOverlay() {
    this.shadowRoot.querySelector(".overlay").hidden = true;
    this.shadowRoot.querySelector(".tooltip").hidden = true;
    document.body.style.removeProperty("overflow");
    window.removeEventListener("keydown", this._escHandler);
  }

  async _loadStats() {
    if (Date.now() - this._statsCacheAt < 5 * 60 * 1000) return;
    const hass = this._hass;
    const id = this._config.entity;
    const now = new Date();
    const dayMs = 24 * 3600 * 1000;
    const iso = (d) => new Date(d).toISOString();

    const call = (statId, period, startMs) =>
      hass
        .callWS({
          type: "recorder/statistics_during_period",
          start_time: iso(startMs),
          end_time: iso(now),
          statistic_ids: [statId],
          period,
          types: ["mean", "max"],
        })
        .then((r) => r?.[statId] ?? [])
        .catch(() => []);

    const [short, hourly, daily] = await Promise.all([
      call(id, "5minute", now - dayMs),
      call(id, "hour", now - 10 * dayMs),
      call(id, "day", now - 30 * dayMs),
    ]);
    this._stats = { short, hourly, daily };

    // A 24 h (5-minute) series for every other discovered reading, so the
    // expanded view can stack a chart per sensor at the bottom.
    this._relatedIds(hass.states[id]);
    const secKeys = Object.keys(this._related).filter(
      (k) => k !== "primary" && this._related[k] && this._related[k] !== id && this._isNumericReading(k)
    );
    const secStats = {};
    await Promise.all(
      secKeys.map(async (k) => {
        secStats[k] = { short: await call(this._related[k], "5minute", now - dayMs) };
      })
    );
    this._secStats = secStats;
    this._statsCacheAt = Date.now();
  }

  _renderOverlay() {
    const overlay = this.shadowRoot.querySelector(".overlay");
    // Preserve the reading position across live updates and history loading.
    const scrollTop = overlay.querySelector(".sheet")?.scrollTop ?? 0;
    const hass = this._hass;
    const metric = this._metric();
    const state = hass.states[this._config.entity];
    if (state) this._relatedIds(state);
    // Other discovered readings get their own 24 h chart, stacked below.
    const secKeys = state
      ? CHIP_ORDER.filter((k) => k !== metric.key && this._related?.[k] && this._isNumericReading(k))
      : [];
    const value = state ? Number(state.state) : NaN;
    const cat = Number.isNaN(value) ? null : this._categoryFor(value);
    const stats = this._stats ?? { short: [], hourly: [], daily: [] };
    const startOf = (row) =>
      typeof row.start === "number" ? row.start : Date.parse(row.start);

    const rowsOfLast = (rows, ms) => {
      const cutoff = Date.now() - ms;
      return rows.filter((r) => startOf(r) >= cutoff && r.mean != null);
    };
    const meanOfLast = (rows, ms) => {
      const vals = rowsOfLast(rows, ms);
      if (!vals.length) return null;
      return vals.reduce((a, r) => a + r.mean, 0) / vals.length;
    };
    const fine = stats.short.length ? stats.short : stats.hourly;
    const avg24 = meanOfLast(fine, 24 * 3600e3);
    const avg12 = meanOfLast(fine, 12 * 3600e3);

    const name = esc(this.shadowRoot.querySelector(".name").textContent);
    const tile = (title, value, sub) => `
      <div class="tile">
        <div class="tile-title">${title}</div>
        <div class="tile-value">${value}</div>
        <div class="tile-sub">${sub}</div>
      </div>`;
    const pending = (title) => tile(title, "…", this._t("tile.pending"));
    const peakTitle = this._t("tile.peak");
    const co2AboveTitle = this._t("tile.above", { limit: `${CO2_VENTILATE_PPM} ppm` });

    let extraTiles;
    if (metric.key === "co2") {
      // Peak and time-above-threshold over the last 24 h.
      const rows24 = rowsOfLast(fine, 24 * 3600e3);
      const peak24 = rows24.length
        ? Math.max(...rows24.map((r) => r.max ?? r.mean))
        : null;
      const rowMs = stats.short.length ? 5 * 60e3 : 3600e3;
      const aboveMs = rows24.filter((r) => r.mean > CO2_VENTILATE_PPM).length * rowMs;
      const aboveH = aboveMs / 3600e3;
      extraTiles =
        (peak24 == null
          ? pending(peakTitle)
          : tile(
              peakTitle,
              `${this._fmt(peak24, 0)} ppm`,
              this._t("tile.peakSub", { category: this._catLabel(metric, this._categoryFor(peak24)) })
            )) +
        (rows24.length
          ? tile(
              co2AboveTitle,
              aboveH < 0.1 ? "0 h" : `${this._fmt(aboveH, 1)} h`,
              this._t("tile.co2AboveSub")
            )
          : pending(co2AboveTitle));
    } else if (metric.key === "pm25") {
      const dailyMeans = stats.daily.filter((r) => r.mean != null);
      const avg30d = dailyMeans.length
        ? dailyMeans.reduce((a, r) => a + r.mean, 0) / dailyMeans.length
        : null;
      const cigarettes = dailyMeans.length
        ? dailyMeans.reduce((a, r) => a + r.mean / UG_PER_CIGARETTE_DAY, 0)
        : null;
      extraTiles =
        (avg30d == null
          ? pending(this._t("tile.whoTitle"))
          : tile(
              this._t("tile.who", { ratio: this._fmt(avg30d / WHO_ANNUAL_PM25, 1, true) }),
              `${this._fmt(avg30d)} µg/m³`,
              this._t("tile.whoSub", { days: dailyMeans.length, guideline: this._fmt(WHO_ANNUAL_PM25, 1) })
            )) +
        (cigarettes == null
          ? pending(this._t("tile.cig"))
          : tile(
              this._t("tile.cig"),
              this._fmt(cigarettes, 1, true),
              this._t(dailyMeans.length === 1 ? "tile.cigSub.one" : "tile.cigSub.other", { n: dailyMeans.length })
            ));
    } else {
      // pm10 / voc / nox: peak reading and time spent above the "good" ceiling.
      const rows24 = rowsOfLast(fine, 24 * 3600e3);
      const peak24 = rows24.length
        ? Math.max(...rows24.map((r) => r.max ?? r.mean))
        : null;
      const thr = metric.categories[0].max;
      const rowMs = stats.short.length ? 5 * 60e3 : 3600e3;
      const aboveH = (rows24.filter((r) => r.mean > thr).length * rowMs) / 3600e3;
      const u = metric.unit ? ` ${metric.unit}` : "";
      const above = this._t("tile.above", { limit: `${this._fmt(thr, metric.decimals)}${u}` });
      extraTiles =
        (peak24 == null
          ? pending(peakTitle)
          : tile(
              peakTitle,
              `${this._fmt(peak24, metric.decimals)}${u}`,
              this._t("tile.peakSub", { category: this._catLabel(metric, this._categoryFor(peak24)) })
            )) +
        (rows24.length
          ? tile(
              above,
              aboveH < 0.1 ? "0 h" : `${this._fmt(aboveH, 1)} h`,
              this._t(metric.who ? "tile.aboveGuidelineSub" : "tile.aboveSub", { range: this._catLabel(metric, metric.categories[0]).toLowerCase() })
            )
          : pending(above));
    }

    overlay.innerHTML = `
      <div class="backdrop"></div>
      <div class="sheet" role="dialog" aria-label="${this._t("aria.sheet", { name })}">
        <button class="close" aria-label="${this._t("aria.close")}">✕</button>
        <div class="sheet-head" style="--cat-color:${cat?.color ?? "#9e9e9e"}">
          <svg class="mascot big" viewBox="0 0 80 80">${this._mascotSvg(cat?.mood ?? "ok")}</svg>
          <div>
            <div class="sheet-name">${name}</div>
            <div class="sheet-cat">${cat ? this._catLabel(metric, cat) : this._t("offline")}</div>
            <div class="sheet-pm">${this._mHtml(metric)} <b>${this._fmt(value, metric.decimals)}</b> ${metric.unit}</div>
          </div>
        </div>
        <div class="tiles">
          ${tile(this._t("tile.last24"), avg24 == null ? "…" : `${this._fmt(avg24, metric.decimals)} ${metric.unit}`.trim(), this._t("tile.average", { metric: this._mShort(metric) }))}
          ${tile(this._t("tile.last12"), avg12 == null ? "…" : `${this._fmt(avg12, metric.decimals)} ${metric.unit}`.trim(), this._t("tile.average", { metric: this._mShort(metric) }))}
          ${extraTiles}
        </div>
        <div class="section">
          <h3>${this._t("chart.title24", { metric: this._mHtml(metric) })} <span class="unit">${metric.unit}</span></h3>
          <div class="chart24" data-reading="__primary"></div>
        </div>
        <div class="section">
          <h3>${this._t("chart.title10", { metric: this._mHtml(metric) })}</h3>
          <div class="heatmap"></div>
          <div class="legend"></div>
        </div>
        ${secKeys.length ? `<h2 class="subhead">${this._t("chart.every")}</h2>` : ""}
        ${secKeys
          .map((k) => {
            const rm = this._readingMetric(k);
            return `
        <div class="section">
          <h3>${this._t("chart.title24", { metric: this._mHtml(rm) })} ${rm.unit ? `<span class="unit">${rm.unit}</span>` : ""}</h3>
          <div class="chart24" data-reading="${k}"></div>
        </div>`;
          })
          .join("")}
        <div class="attribution">${this._t(`attr.${metric.attrKey ?? metric.key}`, undefined, metric.attribution)}</div>
      </div>`;

    overlay.querySelector(".backdrop").addEventListener("click", () => this._closeOverlay());
    overlay.querySelector(".close").addEventListener("click", () => this._closeOverlay());

    this._render24hChart(overlay.querySelector('.chart24[data-reading="__primary"]'), stats, metric);
    this._renderHeatmap(overlay.querySelector(".heatmap"), stats.hourly);
    overlay.querySelector(".legend").innerHTML = metric.categories
      .map((c) => `<span class="lg"><i style="background:${c.color}"></i>${this._catLabel(metric, c)}</span>`)
      .join("");
    for (const k of secKeys) {
      this._render24hChart(
        overlay.querySelector(`.chart24[data-reading="${k}"]`),
        this._secStats?.[k] ?? { short: [] },
        this._readingMetric(k)
      );
    }
    // Restore after all charts establish the sheet's final scrollable height.
    overlay.querySelector(".sheet").scrollTop = scrollTop;
  }

  _hourLabel(date) {
    return date.toLocaleTimeString(this._locale(), { hour: "numeric" });
  }

  _render24hChart(el, stats, metric = this._metric()) {
    // 48 half-hour buckets from 5-minute statistics; hourly fallback.
    const now = Date.now();
    const bucketMs = 30 * 60e3;
    const src = stats.short?.length ? stats.short : stats.hourly ?? [];
    const startOf = (r) => (typeof r.start === "number" ? r.start : Date.parse(r.start));
    const buckets = new Array(48).fill(null).map(() => []);
    const t0 = now - 48 * bucketMs;
    for (const r of src) {
      if (r.mean == null) continue;
      const i = Math.floor((startOf(r) - t0) / bucketMs);
      if (i >= 0 && i < 48) buckets[i].push(r.mean);
    }
    const values = buckets.map((b) =>
      b.length ? b.reduce((a, v) => a + v, 0) / b.length : null
    );
    if (!values.some((v) => v != null)) {
      el.innerHTML = `<div class="empty">${this._t("chart.noHistory")}</div>`;
      return;
    }

    const W = 520, H = 150, padL = 30, padB = 20, padT = 8;
    const plotW = W - padL - 6, plotH = H - padT - padB;
    const maxV = Math.max(metric.chartFloor, ...values.filter((v) => v != null)) * 1.15;
    const bw = plotW / 48;
    const y = (v) => padT + plotH - (v / maxV) * plotH;

    let bars = "", hits = "";
    values.forEach((v, i) => {
      const x = padL + i * bw;
      if (v != null) {
        const c = this._catForMetric(metric, v);
        const h = Math.max(2, plotH - (y(v) - padT));
        bars += `<rect x="${(x + 0.75).toFixed(1)}" y="${y(v).toFixed(1)}" width="${(bw - 1.5).toFixed(1)}" height="${h.toFixed(1)}" rx="2" fill="${c.color}" stroke="rgba(0,0,0,.14)" stroke-width="0.5"/>`;
      }
      const when = new Date(t0 + i * bucketMs);
      hits += `<rect class="hit" x="${x}" y="0" width="${bw}" height="${H - padB}" fill="transparent"
        data-tip="${v == null ? this._t("chart.noData") : `${this._fmt(v, metric.decimals)} ${metric.unit} · ${this._catLabel(metric, this._catForMetric(metric, v))}`.trim()} — ${this._hourLabel(when)}"/>`;
    });

    const ticks = [0, Math.round(maxV / 2), Math.round(maxV)];
    const grid = ticks
      .map(
        (t) => `
        <line x1="${padL}" y1="${y(t)}" x2="${W - 6}" y2="${y(t)}" class="grid"/>
        <text x="${padL - 5}" y="${y(t) + 3}" class="axis" text-anchor="end">${t}</text>`
      )
      .join("");
    let hourTicks = "";
    for (let i = 0; i < 48; i += 8) {
      const when = new Date(t0 + i * bucketMs);
      hourTicks += `<text x="${padL + i * bw}" y="${H - 6}" class="axis">${this._hourLabel(when)}</text>`;
    }

    el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" class="chart">${grid}${bars}${hourTicks}${hits}</svg>`;
    this._attachTooltips(el);
  }

  _renderHeatmap(el, hourly) {
    const metric = this._metric();
    const startOf = (r) => (typeof r.start === "number" ? r.start : Date.parse(r.start));
    const byKey = new Map();
    for (const r of hourly) {
      if (r.mean == null) continue;
      const d = new Date(startOf(r));
      byKey.set(`${d.toDateString()}|${d.getHours()}`, r.mean);
    }
    if (!byKey.size) {
      el.innerHTML = `<div class="empty">${this._t("chart.noHourly")}</div>`;
      return;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let rows = "";
    for (let day = 0; day < 10; day++) {
      const date = new Date(today.getTime() - day * 24 * 3600e3);
      const label =
        day === 0 ? this._t("day.today") : day === 1 ? this._t("day.yesterday")
        : this._cap(date.toLocaleDateString(this._locale(), { weekday: "long" }));
      let cells = "";
      for (let h = 0; h < 24; h++) {
        const v = byKey.get(`${date.toDateString()}|${h}`);
        if (v == null) {
          cells += `<i class="cell empty-cell" data-tip="${this._t("chart.noData")} — ${label} ${h}:00"></i>`;
        } else {
          const c = this._categoryFor(v);
          cells += `<i class="cell" style="background:${c.color}" data-tip="${this._fmt(v, metric.decimals)} ${metric.unit} · ${this._catLabel(metric, c)} — ${label} ${h}:00"></i>`;
        }
      }
      rows += `<div class="hm-row">${cells}<span class="hm-label">${label}</span></div>`;
    }
    let hours = "";
    for (let h = 0; h < 24; h += 6) hours += `<span style="grid-column:${h + 1}">${String(h).padStart(2, "0")}</span>`;
    el.innerHTML = `<div class="hm-hours">${hours}</div>${rows}`;
    this._attachTooltips(el);
  }

  _attachTooltips(scope) {
    const tooltip = this.shadowRoot.querySelector(".tooltip");
    scope.querySelectorAll("[data-tip]").forEach((node) => {
      node.addEventListener("mouseenter", () => {
        tooltip.textContent = node.dataset.tip;
        tooltip.hidden = false;
      });
      node.addEventListener("mousemove", (ev) => {
        tooltip.style.left = `${Math.min(ev.clientX + 12, window.innerWidth - 180)}px`;
        tooltip.style.top = `${ev.clientY + 14}px`;
      });
      node.addEventListener("mouseleave", () => (tooltip.hidden = true));
    });
  }

  /* ------------------------------------------------------------------ */

  static styles = `
    :host { display: block; }
    ha-card { overflow: hidden; }
    .scene {
      position: relative; height: 190px; cursor: pointer; outline: none;
      display: flex; flex-direction: column; justify-content: space-between;
    }
    .scene:focus-visible { box-shadow: inset 0 0 0 2px var(--primary-color); }
    .sky { position: absolute; inset: 0;
      background: linear-gradient(var(--cat-sky-top, #dcf3dd), var(--cat-sky-bottom, #f2faf0)); }
    .scene[data-category="offline"] .sky { background: linear-gradient(#e0e0e0, #f5f5f5); }
    .clouds { position: absolute; inset: 0; overflow: hidden; }
    .cloud { position: absolute; background: rgba(255,255,255,.85); border-radius: 999px; }
    .cloud::before, .cloud::after { content:""; position:absolute; background:inherit; border-radius:999px; }
    .c1 { width: 52px; height: 14px; top: 26px; animation: drift 46s linear infinite; }
    .c1::before { width: 22px; height: 18px; top: -9px; left: 9px; }
    .c2 { width: 38px; height: 11px; top: 58px; animation: drift 64s linear infinite; animation-delay: -30s; }
    .c2::before { width: 16px; height: 13px; top: -7px; left: 8px; }
    .c3 { width: 30px; height: 9px; top: 14px; animation: drift 80s linear infinite; animation-delay: -55s; }
    .c3::before { width: 13px; height: 11px; top: -5px; left: 7px; }
    @keyframes drift { from { left: -70px; } to { left: 105%; } }
    .hills { position: absolute; left: 0; right: 0; bottom: 34px; height: 80px; width: 100%; }
    .hill-back { fill: var(--cat-ground, #66bb6a); opacity: .45; }
    .hill-front { fill: var(--cat-ground, #66bb6a); opacity: .8; }
    .trunk { fill: #7a5b41; }
    .leaves { fill: var(--cat-ground, #2e7d32); filter: brightness(.72); }
    .tree { transform-box: fill-box; transform-origin: bottom center; }
    .head { position: relative; display: flex; justify-content: space-between; padding: 14px 16px 0; }
    .name { font-size: 1.05rem; font-weight: 600; color: rgba(0,0,0,.75); }
    .category { font-size: 1.5rem; font-weight: 700; color: rgba(0,0,0,.85); line-height: 1.2; max-width: 70%; }
    .mascot-badge {
      width: 64px; height: 64px; border-radius: 50%; flex: none;
      background: rgba(255,255,255,.75); border: 3px solid var(--cat-color, #43a047);
      display: grid; place-items: center; animation: bob 4s ease-in-out infinite;
    }
    @keyframes bob { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-4px); } }
    .mascot { width: 52px; height: 52px; }
    .mascot .body { fill: #fff; stroke: rgba(0,0,0,.18); stroke-width: 1.5; }
    .mascot .cap { fill: var(--cat-color, #43a047); opacity: .9; }
    .mascot .eye { fill: #37474f; }
    .mascot .mouth, .mascot .brow { stroke: #37474f; stroke-width: 2.4; fill: none; stroke-linecap: round; }
    .mascot .blush { fill: #f8bbd0; }
    .strip {
      position: relative; display: flex; justify-content: space-between; align-items: center;
      padding: 8px 16px; background: var(--cat-color, #43a047); color: #fff;
    }
    .scene[data-category="moderate"] .strip { color: rgba(0,0,0,.8); }
    .scene[data-category="offline"] .strip { background: #9e9e9e; }
    .pm-value { font-size: 1.25rem; }
    .chips { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 6px 10px; font-size: .9rem; }
    .chip { display: inline-flex; align-items: center; gap: 2px; }
    .chip ha-icon { --mdc-icon-size: 16px; }

    /* Compact redesign: fixed 190 px, five columns, two visible rows.
       Additional readings remain reachable by scrolling inside the panel. */
    :host { container-type: inline-size; }
    .scene { height: 190px; color: #162a24; }
    .head { padding: 12px 14px 0; gap: 8px; }
    .titles { display: flex; align-items: center; gap: 8px; min-width: 0; padding-right: 48px; }
    .name { font-size: 14px; line-height: 20px; font-weight: 650;
      color: #20372e; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .category { font-size: 11px; line-height: 16px; max-width: 48%; min-width: 0;
      padding: 2px 7px; border-radius: 12px; background: rgba(255,255,255,.78);
      color: #20372e; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex-shrink: 0; }
    .category::before { content: ""; display: inline-block; width: 6px; height: 6px;
      border-radius: 50%; margin-right: 4px; background: var(--cat-color, #888); vertical-align: 1px; }
    .mascot-badge { position: absolute; right: 14px; top: 10px; width: 44px; height: 44px; border-width: 2px; }
    .mascot { width: 36px; height: 36px; }
    .pm { position: absolute; top: 40px; left: 14px; right: 45%; display: flex;
      align-items: baseline; gap: 7px; min-width: 0; white-space: nowrap; }
    .pm-value { font-size: clamp(30px, 9cqi, 48px); font-weight: 750;
      line-height: 1.1; letter-spacing: -1.5px; font-variant-numeric: tabular-nums; }
    .pm-caption { display: flex; flex-direction: column; font-size: 11px; font-weight: 600; line-height: 1.3; }
    .pm-unit { font-size: 10px; opacity: .8; }
    .meta { position: absolute; right: 14px; top: 71px; left: 57%; display: flex;
      justify-content: flex-end; align-items: center; gap: 7px; color: #20372e; }
    .meta .chip { border: 0; padding: 0; min-width: 0; gap: 3px; }
    .meta .chip-content { min-width: 0; }
    .meta .chip-label { display: none; }
    .meta .chip-reading { font-size: 11px; font-weight: 600; }
    .meta .chip ha-icon { --mdc-icon-size: 15px; }
    .hills { bottom: 76px; height: 42px; opacity: .65; }
    .clouds { opacity: .55; }
    .strip, .scene[data-category="offline"] .strip {
      position: absolute; bottom: 5px; left: 5px; right: 5px; height: 78px;
      box-sizing: border-box; padding: 0; border-radius: 12px;
      background: rgba(255,255,255,.87); color: #162a24;
      border: 1px solid rgba(30,60,40,.08); overflow: hidden; }
    .chips { display: grid; width: 100%; height: 100%; box-sizing: border-box;
      grid-template-columns: repeat(5, minmax(0, 1fr)); grid-auto-rows: 38px;
      gap: 0; justify-content: initial; overflow-y: auto; overscroll-behavior: contain;
      scrollbar-width: thin; font-size: 11px; }
    .chip { display: flex; align-items: center; gap: 5px; min-width: 0;
      padding: 4px 6px; box-sizing: border-box; border-right: 1px solid rgba(30,60,40,.08);
      border-bottom: 1px solid rgba(30,60,40,.08); }
    .chip ha-icon { --mdc-icon-size: 17px; color: #316b47; flex: none; }
    .chip-content { display: flex; flex-direction: column; min-width: 0; }
    .chip-label { font-size: 9px; line-height: 12px; opacity: .76;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .chip-reading { font-size: 14px; line-height: 17px; font-weight: 700;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-variant-numeric: tabular-nums; }
    .chip-reading small { font-size: 9px; margin-left: 2px; font-weight: 500; }
    .scene[data-category="offline"] { --cat-color: #888; }
    .scene[data-category="offline"] .hills { opacity: .2; }
    .chips:focus-visible { outline: 2px solid var(--primary-color, #316b47); outline-offset: -2px; }
    @container (max-width: 400px) {
      .titles { flex-direction: column; align-items: flex-start; gap: 1px; }
      .name { font-size: 12px; max-width: 100%; }
      .category { max-width: 100%; font-size: 10px; line-height: 13px; }
      .pm { top: 57px; }
      .pm-value { font-size: 30px; }
      .meta { top: 76px; left: 55%; right: 10px; gap: 5px; }
      .meta .chip ha-icon { display: inline-flex; --mdc-icon-size: 12px; }
      .meta .chip-reading { font-size: 10px; }
      .chip { padding: 3px 4px; gap: 0; }
      /* Put the icon beside the label, leaving the whole width for the value. */
      .chips .chip { position: relative; display: block; }
      .chips .chip ha-icon { display: inline-flex; position: absolute;
        left: 4px; top: 3px; --mdc-icon-size: 12px; }
      .chips .chip-label { padding-left: 15px; }
      .chip-reading { font-size: 13px; }
    }
    @container (max-width: 300px) {
      .chips { grid-template-columns: repeat(3, minmax(0, 1fr)); }
      .pm { gap: 4px; }
      .pm-caption { font-size: 10px; }
    }
    @media (prefers-reduced-motion: reduce) {
      .cloud, .mascot-badge { animation: none; }
    }

    /* Circular alternative. The scene DOM and expanded detail are shared. */
    ha-card[data-view="circle"] {
      background: transparent; border: 0; box-shadow: none; overflow: visible;
      display: flex; justify-content: center;
    }
    ha-card[data-view="circle"] .scene {
      width: min(100%, var(--circle-size, 140px)); height: auto; aspect-ratio: 1;
      box-sizing: border-box; flex: none; border: 3px solid var(--cat-color, #888);
      border-radius: 50%; overflow: hidden; container-type: inline-size;
    }
    ha-card[data-view="circle"] .clouds,
    ha-card[data-view="circle"] .hills,
    ha-card[data-view="circle"] .mascot-badge,
    ha-card[data-view="circle"] .strip,
    ha-card[data-view="circle"] .meta,
    ha-card[data-view="circle"] .name { display: none; }
    ha-card[data-view="circle"] .head { position: absolute; inset: 0; padding: 0; display: block; }
    ha-card[data-view="circle"] .titles { display: contents; }
    ha-card[data-view="circle"] .pm {
      position: absolute; top: 29%; left: 7%; right: 7%; display: flex;
      flex-direction: column; align-items: center; gap: 4px; text-align: center;
    }
    ha-card[data-view="circle"] .pm-value {
      font-size: clamp(24px, 30cqi, 80px); line-height: 1; letter-spacing: -1px;
      max-width: 100%; overflow: hidden; text-overflow: ellipsis;
    }
    ha-card[data-view="circle"] .pm-caption {
      display: flex; flex-direction: row; align-items: baseline; gap: 3px;
      font-size: clamp(9px, 8cqi, 18px); line-height: 1.2; font-weight: 500;
    }
    ha-card[data-view="circle"] .pm-unit { font-size: inherit; }
    ha-card[data-view="circle"] .pm-unit:not(:empty)::before { content: "· "; }
    ha-card[data-view="circle"] .category {
      position: absolute; top: 72%; left: 10%; right: 10%; padding: 0;
      max-width: none; min-width: 0; border-radius: 0; background: transparent;
      text-align: center; white-space: normal; overflow: hidden;
      font-size: clamp(9px, 8cqi, 17px); line-height: 1.2; font-weight: 600;
      display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2;
    }
    ha-card[data-view="circle"] .category::before { width: 5px; height: 5px; margin-right: 4px; }
    ha-card[data-view="circle"] .scene:focus-visible {
      outline: 2px solid var(--primary-color, #316b47); outline-offset: 3px;
    }

    /* Expanded sheet */
    .overlay { position: fixed; inset: 0; z-index: 999; }
    .backdrop { position: absolute; inset: 0; background: rgba(0,0,0,.45); }
    .sheet {
      position: absolute; top: 24px; left: 50%; transform: translateX(-50%);
      max-height: calc(100% - 48px);
      width: min(620px, calc(100vw - 24px));
      background: var(--card-background-color, #fff); color: var(--primary-text-color, #212121);
      border-radius: 16px; overflow-y: auto; padding: 20px; box-sizing: border-box;
      box-shadow: 0 8px 40px rgba(0,0,0,.4);
    }
    .close {
      position: absolute; top: 12px; right: 12px; border: none; cursor: pointer;
      width: 34px; height: 34px; border-radius: 50%; font-size: 15px;
      background: var(--secondary-background-color, #eee); color: var(--primary-text-color, #212121);
    }
    .sheet-head { display: flex; gap: 16px; align-items: center; margin-bottom: 16px; }
    .mascot.big { width: 72px; height: 72px; flex: none; }
    .sheet-name { font-weight: 600; }
    .sheet-cat { font-size: 1.6rem; font-weight: 700; color: var(--cat-color); }
    .sheet-pm b { font-size: 1.15rem; }
    .tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; }
    .tile { background: var(--secondary-background-color, #f5f5f5); border-radius: 12px; padding: 12px; }
    .tile-title { font-size: .8rem; color: var(--secondary-text-color, #666); }
    .tile-value { font-size: 1.4rem; font-weight: 700; margin: 2px 0; }
    .tile-sub { font-size: .75rem; color: var(--secondary-text-color, #666); }
    .section { margin-top: 20px; }
    .section h3 { font-size: .95rem; margin: 0 0 8px; }
    .subhead { font-size: 1.05rem; margin: 26px 0 0; padding-top: 18px;
      border-top: 1px solid var(--divider-color, #e0e0e0); }
    .section .unit { font-weight: 400; font-size: .75rem; color: var(--secondary-text-color, #666); }
    .chart { width: 100%; height: auto; }
    .grid { stroke: var(--divider-color, #e0e0e0); stroke-width: 1; }
    .axis { font-size: 9px; fill: var(--secondary-text-color, #666); }
    .empty { font-size: .85rem; color: var(--secondary-text-color, #666); padding: 12px 0; }
    .hm-hours { display: grid; grid-template-columns: repeat(24, 1fr); font-size: .65rem;
      color: var(--secondary-text-color, #666); margin: 0 84px 3px 0; }
    .hm-row { display: grid; grid-template-columns: repeat(24, 1fr) 84px; gap: 3px; margin-bottom: 3px; align-items: center; }
    .cell { display: block; aspect-ratio: 1; border-radius: 3px; min-width: 0;
      box-shadow: inset 0 0 0 0.5px rgba(0,0,0,.12); }
    .empty-cell { background: transparent; box-shadow: inset 0 0 0 1px var(--divider-color, #e0e0e0); }
    .hm-label { font-size: .72rem; color: var(--secondary-text-color, #666); padding-left: 6px; }
    .legend { display: flex; flex-wrap: wrap; gap: 8px 14px; margin-top: 10px; font-size: .72rem;
      color: var(--secondary-text-color, #666); }
    .lg { display: inline-flex; align-items: center; gap: 4px; }
    .lg i { width: 10px; height: 10px; border-radius: 3px; display: inline-block; }
    .attribution { margin-top: 18px; font-size: .72rem; color: var(--secondary-text-color, #666); }
    .attribution a { color: inherit; }
    .tooltip {
      position: fixed; z-index: 1000; pointer-events: none; max-width: 170px;
      background: rgba(33,33,33,.94); color: #fff; font-size: .74rem;
      padding: 5px 8px; border-radius: 6px;
    }
    @media (prefers-reduced-motion: reduce) {
      .cloud, .tree, .mascot-badge { animation: none; }
    }
  `;
}

/* ---------------------------------------------------------------------- */
/* Visual editor                                                            */
/* ---------------------------------------------------------------------- */

class AirQualitySceneCardEditor extends HTMLElement {
  setConfig(config) {
    this._config = config;
    this._render();
  }

  _lang() {
    return resolveLang(this._config?.language, this._hass);
  }

  _t(key, vars, fallback) {
    return translate(this._lang(), key, vars, fallback);
  }

  set hass(hass) {
    this._hass = hass;
    if (this._form) {
      this._form.hass = hass;
      if (this._lang() !== this._renderedLang) this._render();
    }
  }

  async _render() {
    if (!this._form) {
      // Make sure ha-form and its selectors are registered.
      const helpers = await window.loadCardHelpers?.();
      await helpers?.createCardElement({ type: "entities", entities: [] })
        ?.constructor?.getConfigElement?.();
      this._form = document.createElement("ha-form");
      this._form.computeLabel = (s) => {
        const fixed = {
          view: this._t("ed.view"),
          size: this._t("ed.size"),
          metric: this._t("ed.metric"),
          entity: this._t("ed.entity"),
          name: this._t("ed.name"),
          chips_mode: this._t("ed.chipsMode"),
          chips_items: this._t("ed.chipsItems"),
          language: this._t("ed.language"),
          standard: this._t("ed.standard"),
        };
        if (fixed[s.name]) return fixed[s.name];
        if (READING_LABELS[s.name]) return this._t("ed.readingSensor", { reading: this._t(`reading.${s.name}`, undefined, READING_LABELS[s.name]) });
        return s.name;
      };
      this._form.addEventListener("value-changed", (ev) => {
        const config = this._configFromForm(ev.detail.value);
        this.dispatchEvent(
          new CustomEvent("config-changed", { detail: { config }, bubbles: true, composed: true })
        );
      });
      this.appendChild(this._form);
    }
    const cfg = this._config ?? {};
    this._renderedLang = this._lang();
    const metric = cfg.metric ?? "pm25";
    // VOC/NOx indices carry no device_class, so the entity picker can't filter
    // by one — offer any sensor for those.
    const entityDc = { pm25: "pm25", co2: "carbon_dioxide", pm10: "pm10" }[metric];

    // Chips: an array in config means "custom"; otherwise it's the string mode.
    // Never offer the headline reading as a chip — it's already the big number.
    const rawChips = cfg.chips ?? "auto";
    const mode = Array.isArray(rawChips) ? "custom" : rawChips;
    const allItems = CHIP_ORDER.filter((k) => k !== metric);
    const items = (Array.isArray(rawChips) ? rawChips : allItems).filter((k) => k !== metric);

    this._form.hass = this._hass;
    this._form.data = {
      view: cfg.view ?? "scene",
      size: cfg.size ?? 140,
      metric,
      entity: cfg.entity,
      name: cfg.name,
      language: cfg.language ?? "auto",
      standard: cfg.standard ?? "epa",
      chips_mode: mode,
      chips_items: items,
      ...Object.fromEntries(Object.keys(READINGS).map((k) => [k, cfg[k]]).filter(([, v]) => v != null)),
    };

    const schema = [
      { name: "view", selector: { select: { mode: "dropdown", options: [
        { value: "scene", label: this._t("ed.view.scene") },
        { value: "circle", label: this._t("ed.view.circle") },
      ] } } },
      ...(cfg.view === "circle" ? [{ name: "size", selector: {
        number: { min: 100, max: 320, step: 1, mode: "box", unit_of_measurement: "px" },
      } }] : []),
      {
        name: "metric",
        selector: {
          select: {
            mode: "dropdown",
            options: [
              { value: "pm25", label: this._t("ed.metric.pm25") },
              { value: "co2", label: this._t("ed.metric.co2") },
              { value: "pm10", label: this._t("ed.metric.pm10") },
              { value: "voc", label: this._t("ed.metric.voc") },
              { value: "nox", label: this._t("ed.metric.nox") },
            ],
          },
        },
      },
      {
        name: "entity",
        required: true,
        selector: {
          entity: entityDc ? { domain: "sensor", device_class: entityDc } : { domain: "sensor" },
        },
      },
      { name: "name", selector: { text: {} } },
      {
        name: "standard",
        selector: {
          select: {
            mode: "dropdown",
            options: [
              { value: "epa", label: this._t("ed.standard.epa") },
              { value: "who", label: this._t("ed.standard.who") },
            ],
          },
        },
      },
      {
        name: "language",
        selector: {
          select: {
            mode: "dropdown",
            options: [
              { value: "auto", label: this._t("lang.auto") },
              ...Object.keys(I18N).map((l) => ({ value: l, label: I18N[l]["lang.name"] })),
            ],
          },
        },
      },
      {
        name: "chips_mode",
        selector: {
          select: {
            mode: "dropdown",
            options: [
              { value: "auto", label: this._t("ed.chips.auto") },
              { value: "minimal", label: this._t("ed.chips.minimal") },
              { value: "custom", label: this._t("ed.chips.custom") },
            ],
          },
        },
      },
    ];

    if (mode === "custom") {
      // Tick which readings to show…
      schema.push({
        name: "chips_items",
        selector: {
          select: {
            multiple: true,
            mode: "list",
            options: allItems.map((k) => ({ value: k, label: this._t(`reading.${k}`, undefined, READING_LABELS[k] ?? k) })),
          },
        },
      });
      // …then assign a sensor to each ticked one (blank = auto-detect from the device).
      for (const k of items) {
        const dc = READINGS[k]?.dc;
        schema.push({
          name: k,
          selector: { entity: dc ? { domain: "sensor", device_class: dc } : { domain: "sensor" } },
        });
      }
    }

    this._form.schema = schema;
  }

  /** Translate the editor form's values (which use synthetic chips_mode /
   *  chips_items fields) back into a real card config. */
  _configFromForm(v) {
    const config = { type: "custom:air-quality-scene-card", metric: v.metric, entity: v.entity };
    if (v.view === "circle") config.view = "circle";
    if (v.size != null) config.size = v.size;
    if (v.name) config.name = v.name;
    if (v.language && v.language !== "auto") config.language = v.language;
    if (v.standard && v.standard !== "epa") config.standard = v.standard;

    if (v.chips_mode === "custom") {
      const list = Array.isArray(v.chips_items)
        ? v.chips_items
        : CHIP_ORDER.filter((k) => k !== v.metric);
      config.chips = list.filter((k) => k !== v.metric);
    } else if (v.chips_mode === "minimal") {
      config.chips = "minimal";
    } else {
      config.chips = "auto";
    }

    // Per-reading entity overrides (only those the form currently carries).
    for (const k of Object.keys(READINGS)) {
      if (v[k]) config[k] = v[k];
    }
    return config;
  }
}

// Evaluated twice when loaded both via `frontend: extra_module_url:` and as a
// HACS Lovelace resource (the ?hacstag= query string makes it a distinct
// module). Re-defining a tag throws, so guard every registration.
if (!customElements.get("air-quality-scene-card")) {
  customElements.define("air-quality-scene-card", AirQualitySceneCard);
}
if (!customElements.get("air-quality-scene-card-editor")) {
  customElements.define("air-quality-scene-card-editor", AirQualitySceneCardEditor);
}

window.customCards = window.customCards || [];
const bootLang = resolveLang(
  null,
  document.querySelector("home-assistant")?.hass ?? { language: navigator.language }
);
if (!window.customCards.some((c) => c.type === "air-quality-scene-card")) {
  window.customCards.push({
    type: "air-quality-scene-card",
    name: "Air Quality Scene Card",
    description: translate(bootLang, "card.description"),
    preview: true,
    documentationURL: "https://github.com/keranm/air-quality-scene-card",
  });
  console.info(
    `%c AIR-QUALITY-SCENE-CARD %c v${CARD_VERSION} `,
    "color:#fff;background:#43a047;font-weight:700;border-radius:3px 0 0 3px",
    "color:#43a047;background:#dcf3dd;border-radius:0 3px 3px 0"
  );
}
