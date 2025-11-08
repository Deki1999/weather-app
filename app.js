// @ts-nocheck

const form = document.querySelector("#search");
const qEl = document.querySelector("#q");
const locBtn = document.querySelector("#loc");
const statusEl = document.querySelector("#status");
const card = document.querySelector("#card");

const placeEl = document.querySelector("#place");
const descEl  = document.querySelector("#desc");
const tempEl  = document.querySelector("#temp");
const feelsEl = document.querySelector("#feels");
const windEl  = document.querySelector("#wind");
const humidEl = document.querySelector("#humid");
const dailyEl = document.querySelector("#daily");

form.addEventListener("submit", async (e)=>{
  e.preventDefault();
  const name = (qEl.value || "").trim();
  if(!name) return tip("Type a city name.");
  tip("Searching…");
  try {
    const { latitude, longitude, name: resolved } = await geocode(name);
    await loadWeather(latitude, longitude, resolved);
  } catch(err){
    tip("City not found.", true);
  }
});

locBtn.addEventListener("click", ()=>{
  tip("Getting your location…");
  if(!navigator.geolocation){
    tip("Geolocation not supported.", true);
    return;
  }
  navigator.geolocation.getCurrentPosition(async (pos)=>{
    const { latitude:lat, longitude:lon } = pos.coords;
    try {
      // reverse geocode (optional pretty name)
      const rev = await reverseGeocode(lat, lon);
      await loadWeather(lat, lon, rev?.name || "My location");
    } catch {
      await loadWeather(lat, lon, "My location");
    }
  }, (err)=>{
    tip("Permission denied. Search a city instead.", true);
  }, { enableHighAccuracy:true, timeout:8000 });
});

function tip(msg, bad=false){
  statusEl.textContent = msg || "";
  statusEl.classList.toggle("bad", !!bad);
}

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

async function loadWeather(lat, lon, placeName){
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,wind_speed_10m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto`;
  const res = await fetch(url);
  if(!res.ok) throw new Error("wx fail");
  const data = await res.json();

  // Current
  const c = data.current;
  const wmo = c.weather_code;
  placeEl.textContent = placeName;
  descEl.textContent  = codeToText(wmo);
  tempEl.textContent  = Math.round(c.temperature_2m);
  feelsEl.textContent = Math.round(c.apparent_temperature);
  windEl.textContent  = Math.round(c.wind_speed_10m);
  humidEl.textContent = Math.round(c.relative_humidity_2m);

  // Daily 3 days
  const days = [];
  for(let i=0; i<3; i++){
    days.push({
      date: data.daily.time[i],
      wmo:  data.daily.weather_code[i],
      tmax: Math.round(data.daily.temperature_2m_max[i]),
      tmin: Math.round(data.daily.temperature_2m_min[i]),
    });
  }
  renderDaily(days);

  card.classList.remove("hidden");
  tip(""); // clear status
}

function renderDaily(days){
  dailyEl.innerHTML = "";
  days.forEach(d=>{
    const el = document.createElement("div");
    el.className = "day";
    el.innerHTML = `
      <div>${fmtDate(d.date)}</div>
      <div>${codeToText(d.wmo)}</div>
      <div class="t">${d.tmin}° / ${d.tmax}°C</div>
    `;
    dailyEl.appendChild(el);
  });
}

function fmtDate(iso){
  const dt = new Date(iso);
  return dt.toLocaleDateString(undefined, { weekday:"short" });
}

// Minimal WMO code mapping
function codeToText(code){
  const map = {
    0:"Clear sky", 1:"Mainly clear", 2:"Partly cloudy", 3:"Overcast",
    45:"Fog", 48:"Rime fog",
    51:"Drizzle light", 53:"Drizzle", 55:"Drizzle heavy",
    61:"Rain light", 63:"Rain", 65:"Rain heavy",
    66:"Freezing rain light", 67:"Freezing rain",
    71:"Snow fall light", 73:"Snow fall", 75:"Snow fall heavy",
    77:"Snow grains",
    80:"Rain showers light", 81:"Rain showers", 82:"Rain showers heavy",
    85:"Snow showers light", 86:"Snow showers heavy",
    95:"Thunderstorm", 96:"Thunderstorm w/ hail", 99:"Thunderstorm w/ heavy hail"
  };
  return map[code] ?? "—";
}

// Auto-run: try geolocation on load (silently)
(function tryAutoGeo(){
  if(!navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(async (pos)=>{
    const { latitude:lat, longitude:lon } = pos.coords;
    try {
      const rev = await reverseGeocode(lat, lon);
      await loadWeather(lat, lon, rev?.name || "My location");
    } catch {}
  }, ()=>{}, { maximumAge: 600000, timeout: 3000 });
})();