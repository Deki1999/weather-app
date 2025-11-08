// @ts-nocheck

// Elements
const form     = document.querySelector("#search");
const qEl      = document.querySelector("#q");
const locBtn   = document.querySelector("#loc");
const unitBtn  = document.querySelector("#unit");
const statusEl = document.querySelector("#status");
const card     = document.querySelector("#card");

const placeEl = document.querySelector("#place");
const descEl  = document.querySelector("#desc");
const iconEl  = document.querySelector("#icon");
const tempEl  = document.querySelector("#temp");
const feelsEl = document.querySelector("#feels");
const windEl  = document.querySelector("#wind");
const windUnitEl = document.querySelector("#windUnit");
const humidEl = document.querySelector("#humid");
const dailyEl = document.querySelector("#daily");
const chart   = document.querySelector("#chart");
const ctx     = chart.getContext("2d");

// State
let unit = loadUnit(); // "C" | "F"
let lastData = null;   // cache poslednjeg API odgovora
let lastPlaceName = "";

// Boot
updateUnitUI();
initEvents();
tryAutoGeo();

// ---------- Events ----------
function initEvents(){
  form.addEventListener("submit", async (e)=>{
    e.preventDefault();
    const name = (qEl.value || "").trim();
    if(!name) return tip("Type a city name.");
    tip("Searching…");
    try {
      const { latitude, longitude, name: resolved } = await geocode(name);
      await loadWeather(latitude, longitude, resolved);
    } catch {
      tip("City not found.", true);
    }
  });

  locBtn.addEventListener("click", ()=>{
    tip("Getting your location…");
    if(!navigator.geolocation) return tip("Geolocation not supported.", true);
    navigator.geolocation.getCurrentPosition(async (pos)=>{
      const { latitude:lat, longitude:lon } = pos.coords;
      try {
        const rev = await reverseGeocode(lat, lon);
        await loadWeather(lat, lon, rev?.name || "My location");
      } catch {
        await loadWeather(lat, lon, "My location");
      }
    }, ()=>{
      tip("Permission denied. Search a city instead.", true);
    }, { enableHighAccuracy:true, timeout:8000 });
  });

  unitBtn.addEventListener("click", ()=>{
    unit = unit === "C" ? "F" : "C";
    saveUnit(unit);
    updateUnitUI();
    // re-render ako već imamo podatke
    if (lastData) renderAll(lastData, lastPlaceName);
  });
}

// ---------- UI helpers ----------
function tip(msg, bad=false){
  statusEl.textContent = msg || "";
  statusEl.classList.toggle("bad", !!bad);
}
function updateUnitUI(){
  unitBtn.textContent = `Unit: °${unit}`;
  windUnitEl.textContent = (unit === "C") ? "km/h" : "mph";
}
function loadUnit(){
  try { return localStorage.getItem("wx.unit") || "C"; }
  catch { return "C"; }
}
function saveUnit(u){
  localStorage.setItem("wx.unit", u);
}

// ---------- Geocoding ----------
async function geocode(query){
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=1&language=en&format=json`;
  const res = await fetch(url);
  if(!res.ok) throw new Error("geo fail");
  const data = await res.json();
  if(!data.results || !data.results.length) throw new Error("no results");
  const r = data.results[0];
  return { latitude:r.latitude, longitude:r.longitude, name:`${r.name}, ${r.country_code}` };
}
async function reverseGeocode(lat, lon){
  const url = `https://geocoding-api.open-meteo.com/v1/reverse?latitude=${lat}&longitude=${lon}&count=1&language=en&format=json`;
  const res = await fetch(url);
  if(!res.ok) return null;
  const data = await res.json();
  const r = data?.results?.[0];
  if(!r) return null;
  return { name: `${r.name}, ${r.country_code}` };
}

// ---------- Weather ----------
async function loadWeather(lat, lon, placeName){
  // Dodali smo hourly temperaturu (za graf)
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&current=temperature_2m,relative_humidity_2m,apparent_temperature,wind_speed_10m,weather_code,is_day` +
    `&daily=weather_code,temperature_2m_max,temperature_2m_min` +
    `&hourly=temperature_2m` +
    `&timezone=auto`;
  const res = await fetch(url);
  if(!res.ok) throw new Error("wx fail");
  const data = await res.json();

  lastData = data;
  lastPlaceName = placeName;
  renderAll(data, placeName);

  card.classList.remove("hidden");
  tip("");
}

function renderAll(data, placeName){
  // Current
  const c = data.current;
  placeEl.textContent = placeName;
  descEl.textContent  = codeToText(c.weather_code);
  iconEl.textContent  = codeToIcon(c.weather_code, !!c.is_day);

  tempEl.textContent  = fmtTemp(c.temperature_2m);
  feelsEl.textContent = fmtTemp(c.apparent_temperature);
  windEl.textContent  = fmtWind(c.wind_speed_10m);
  humidEl.textContent = Math.round(c.relative_humidity_2m);

  // Daily (3 dana)
  const days = [];
  for(let i=0; i<3; i++){
    days.push({
      date: data.daily.time[i],
      wmo:  data.daily.weather_code[i],
      tmax: data.daily.temperature_2m_max[i],
      tmin: data.daily.temperature_2m_min[i],
    });
  }
  renderDaily(days);

  // Hourly – sledeća 24h od "sada"
  const hours = data.hourly.time;
  const temps = data.hourly.temperature_2m; // °C
  const nowIso = data.current.time || new Date().toISOString();
  let idx = hours.findIndex(t => t >= nowIso);
  if (idx < 0) idx = 0;
  const nextTimes = hours.slice(idx, idx+24);
  const nextTempsC = temps.slice(idx, idx+24);
  renderChart(nextTimes, nextTempsC);
}

function renderDaily(days){
  dailyEl.innerHTML = "";
  days.forEach(d=>{
    const el = document.createElement("div");
    el.className = "day";
    el.innerHTML = `
      <span class="ico">${codeToIcon(d.wmo, true)}</span>
      <div>${fmtDate(d.date)}</div>
      <div>${codeToText(d.wmo)}</div>
      <div class="t">${fmtTemp(d.tmin)}° / ${fmtTemp(d.tmax)}°</div>
    `;
    dailyEl.appendChild(el);
  });
}

// ---------- Chart (van biblioteka) ----------
function renderChart(timesISO, tempsC){
  // priprema podatka
  const temps = tempsC.map(t => (unit === "C" ? t : cToF(t)));
  const W = chart.width, H = chart.height;
  ctx.clearRect(0,0,W,H);

  // margine
  const m = { l: 36, r: 12, t: 10, b: 28 };
  const innerW = W - m.l - m.r;
  const innerH = H - m.t - m.b;

  const minT = Math.min(...temps);
  const maxT = Math.max(...temps);
  const pad = Math.max(1, (maxT - minT) * 0.15);
  const yMin = Math.floor(minT - pad);
  const yMax = Math.ceil(maxT + pad);

  // bg grid
  ctx.strokeStyle = "#243244";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for(let i=0;i<=4;i++){
    const y = m.t + (innerH * i/4);
    ctx.moveTo(m.l, y);
    ctx.lineTo(W - m.r, y);
  }
  ctx.stroke();

  // axes labels (min/mid/max)
  ctx.fillStyle = "#94a3b8";
  ctx.font = "12px system-ui";
  const labels = [yMax, (yMax+yMin)/2, yMin];
  labels.forEach((v,i)=>{
    const y = m.t + (innerH * i/2);
    const txt = `${Math.round(v)}°`;
    ctx.fillText(txt, 4, y+4);
  });

  // line
  ctx.strokeStyle = "#38bdf8";
  ctx.lineWidth = 2;
  ctx.beginPath();
  temps.forEach((t, i) => {
    const x = m.l + (innerW * i / (temps.length - 1));
    const y = m.t + innerH * (1 - (t - yMin) / (yMax - yMin));
    if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
  });
  ctx.stroke();

  // points
  ctx.fillStyle = "#38bdf8";
  temps.forEach((t, i) => {
    const x = m.l + (innerW * i / (temps.length - 1));
    const y = m.t + innerH * (1 - (t - yMin) / (yMax - yMin));
    ctx.beginPath();
    ctx.arc(x,y,2,0,Math.PI*2);
    ctx.fill();
  });

  // x labels (svakih 3h)
  ctx.fillStyle = "#94a3b8";
  ctx.font = "11px system-ui";
  timesISO.forEach((iso, i) => {
    if(i % 3 !== 0) return;
    const x = m.l + (innerW * i / (timesISO.length - 1));
    const d = new Date(iso);
    const hh = String(d.getHours()).padStart(2,"0");
    ctx.fillText(hh, x-8, H-8);
  });
}

// ---------- Utils ----------
function fmtTemp(c){
  return unit === "C" ? Math.round(c) : Math.round(cToF(c));
}
function fmtWind(kmh){
  return unit === "C" ? Math.round(kmh) : Math.round(kmh * 0.621371);
}
function cToF(c){ return c * 9/5 + 32; }

function fmtDate(iso){
  const dt = new Date(iso);
  return dt.toLocaleDateString(undefined, { weekday:"short" });
}

// WMO → tekst
function codeToText(code){
  const map = {
    0:"Clear sky", 1:"Mainly clear", 2:"Partly cloudy", 3:"Overcast",
    45:"Fog", 48:"Rime fog",
    51:"Drizzle light", 53:"Drizzle", 55:"Drizzle heavy",
    61:"Rain light", 63:"Rain", 65:"Rain heavy",
    66:"Freezing rain light", 67:"Freezing rain",
    71:"Snow light", 73:"Snow", 75:"Snow heavy",
    77:"Snow grains",
    80:"Rain showers light", 81:"Rain showers", 82:"Rain showers heavy",
    85:"Snow showers light", 86:"Snow showers heavy",
    95:"Thunderstorm", 96:"Thunder w/ hail", 99:"Thunder w/ heavy hail"
  };
  return map[code] ?? "—";
}
// WMO → emoji ikona (jednostavno i jasno)
function codeToIcon(code, isDay=true){
  if([0].includes(code)) return isDay ? "☀️" : "🌙";
  if([1].includes(code)) return "🌤️";
  if([2].includes(code)) return "⛅️";
  if([3].includes(code)) return "☁️";
  if([45,48].includes(code)) return "🌫️";
  if([51,53,55,61,63,65,80,81,82].includes(code)) return "🌧️";
  if([66,67].includes(code)) return "🌧️❄️";
  if([71,73,75,77,85,86].includes(code)) return "🌨️";
  if([95,96,99].includes(code)) return "⛈️";
  return "•";
}

// Auto-run: try geolocation on load (silently)
function tryAutoGeo(){
  if(!navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(async (pos)=>{
    const { latitude:lat, longitude:lon } = pos.coords;
    try {
      const rev = await reverseGeocode(lat, lon);
      await loadWeather(lat, lon, rev?.name || "My location");
    } catch {}
  }, ()=>{}, { maximumAge: 600000, timeout: 3000 });
}