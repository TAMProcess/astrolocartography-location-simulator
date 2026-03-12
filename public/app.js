const map = L.map('map', {
  worldCopyJump: false,
  zoomControl: true,
  minZoom: 2,
  maxZoom: 8
}).setView([20, 0], 2.5);

L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
  attribution: '&copy; OpenStreetMap &copy; CARTO',
  subdomains: 'abcd',
  maxZoom: 19
}).addTo(map);

const overlayLayers = {
  boundaries: L.layerGroup().addTo(map),
  cities: L.layerGroup().addTo(map),
  lines: L.layerGroup().addTo(map)
};

const planetList = document.getElementById('planetList');
const timezoneOut = document.getElementById('timezoneOut');
const utcOut = document.getElementById('utcOut');
const gmstOut = document.getElementById('gmstOut');
const form = document.getElementById('birthForm');
const togglePanelBtn = document.getElementById('togglePanel');
const panel = document.getElementById('panel');

let activePolylines = [];

function normalizeLineWeight() {
  const z = map.getZoom();
  const w = Math.max(1, z * 0.55);
  activePolylines.forEach((line) => line.setStyle({ weight: w }));
}
map.on('zoomend', normalizeLineWeight);

function addLegendPlanets(planets) {
  planetList.innerHTML = '';
  planets.forEach((p) => {
    const row = document.createElement('div');
    row.className = 'planet-row';
    row.innerHTML = `<span class="planet-dot" style="background:${p.color}"></span><span>${p.name}</span>`;
    planetList.appendChild(row);
  });
}

async function loadBoundaries() {
  const worldUrl = 'https://raw.githubusercontent.com/datasets/geo-countries/master/data/countries.geojson';
  const usStatesUrl = 'https://raw.githubusercontent.com/PublicaMundi/MappingAPI/master/data/geojson/us-states.json';

  try {
    const [worldResp, usResp] = await Promise.all([fetch(worldUrl), fetch(usStatesUrl)]);
    const [worldGeo, usGeo] = await Promise.all([worldResp.json(), usResp.json()]);

    L.geoJSON(worldGeo, {
      style: {
        color: '#7d94b8',
        weight: 0.7,
        fillColor: '#f4f8ff',
        fillOpacity: 0.06
      }
    }).addTo(overlayLayers.boundaries);

    L.geoJSON(usGeo, {
      style: {
        color: '#5f7ea9',
        weight: 1.2,
        fillColor: '#dce8fb',
        fillOpacity: 0.08
      }
    }).addTo(overlayLayers.boundaries);
  } catch (error) {
    console.error('Boundary load failed', error);
  }
}

function addCityMarker(city, color = '#234c7e') {
  const marker = L.circleMarker([city.lat, city.lon], {
    radius: 3,
    color,
    fillColor: color,
    fillOpacity: 0.9,
    weight: 1
  });
  marker.bindPopup(`<strong>${city.name}</strong><br/>${city.region}`);
  marker.addTo(overlayLayers.cities);
}

async function loadCities() {
  const usCitiesResp = await fetch('data/us-cities.json');
  const usCities = await usCitiesResp.json();

  usCities.forEach((city) => addCityMarker(city, city.priority ? '#0f3f78' : '#486f9e'));

  try {
    const worldResp = await fetch('https://restcountries.com/v3.1/all?fields=name,capital,capitalInfo');
    const countries = await worldResp.json();
    countries.forEach((country) => {
      if (!country.capitalInfo || !country.capitalInfo.latlng || country.capitalInfo.latlng.length < 2) return;
      const [lat, lon] = country.capitalInfo.latlng;
      const capName = Array.isArray(country.capital) ? country.capital[0] : 'Capital';
      addCityMarker({
        name: `${capName}`,
        region: country.name.common,
        lat,
        lon
      }, '#6b8fbf');
    });
  } catch (error) {
    console.error('Country capitals load failed', error);
  }
}

function drawPlanetLines(planets) {
  overlayLayers.lines.clearLayers();
  activePolylines = [];

  planets.forEach((planet) => {
    const baseWeight = Math.max(1.2, map.getZoom() * 0.55);
    const solid = { color: planet.color, weight: baseWeight, opacity: 0.9 };
    const soft = { color: planet.color, weight: baseWeight, opacity: 0.45 };
    const dashed = { color: planet.color, weight: baseWeight, opacity: 0.9, dashArray: '8 8' };
    const dotted = { color: planet.color, weight: baseWeight, opacity: 0.9, dashArray: '3 8' };

    const mc = L.polyline(planet.lines.mc.points, solid).addTo(overlayLayers.lines);
    const ic = L.polyline(planet.lines.ic.points, soft).addTo(overlayLayers.lines);
    const ac = L.polyline(planet.lines.ac.points, dashed).addTo(overlayLayers.lines);
    const dc = L.polyline(planet.lines.dc.points, dotted).addTo(overlayLayers.lines);

    mc.bindTooltip(`${planet.name} MC`, { sticky: true });
    ic.bindTooltip(`${planet.name} IC`, { sticky: true });
    ac.bindTooltip(`${planet.name} AC`, { sticky: true });
    dc.bindTooltip(`${planet.name} DC`, { sticky: true });

    activePolylines.push(mc, ic, ac, dc);
  });

  normalizeLineWeight();
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  const payload = Object.fromEntries(new FormData(form).entries());
  const numericPayload = Object.fromEntries(
    Object.entries(payload).map(([k, v]) => [k, Number(v)])
  );

  try {
    const response = await fetch('/api/astro-lines', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(numericPayload)
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Failed to generate lines');
    }

    timezoneOut.textContent = data.timezone;
    utcOut.textContent = `${data.utc.formatted} UTC (${data.utc.iso})`;
    gmstOut.textContent = `${data.gmst.degrees.toFixed(5)} deg`;

    addLegendPlanets(data.planets);
    drawPlanetLines(data.planets);
  } catch (error) {
    alert(`Computation failed: ${error.message}`);
  }
});

togglePanelBtn.addEventListener('click', () => {
  panel.classList.toggle('hidden');
  togglePanelBtn.textContent = panel.classList.contains('hidden') ? 'Show Panel' : 'Hide Panel';
  setTimeout(() => map.invalidateSize(), 120);
});

Promise.all([loadBoundaries(), loadCities()]).then(() => {
  form.dispatchEvent(new Event('submit'));
});
