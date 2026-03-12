const express = require('express');
const cors = require('cors');
const tzlookup = require('tz-lookup');
const { DateTime } = require('luxon');
const Astronomy = require('astronomy-engine');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const PLANETS = [
  { key: 'Sun', body: Astronomy.Body.Sun, color: '#f59e0b' },
  { key: 'Moon', body: Astronomy.Body.Moon, color: '#e5e7eb' },
  { key: 'Mercury', body: Astronomy.Body.Mercury, color: '#9ca3af' },
  { key: 'Venus', body: Astronomy.Body.Venus, color: '#ec4899' },
  { key: 'Mars', body: Astronomy.Body.Mars, color: '#ef4444' },
  { key: 'Jupiter', body: Astronomy.Body.Jupiter, color: '#f97316' },
  { key: 'Saturn', body: Astronomy.Body.Saturn, color: '#eab308' },
  { key: 'Uranus', body: Astronomy.Body.Uranus, color: '#06b6d4' },
  { key: 'Neptune', body: Astronomy.Body.Neptune, color: '#3b82f6' },
  { key: 'Pluto', body: Astronomy.Body.Pluto, color: '#7c3aed' }
];

function normalize180(deg) {
  let value = deg;
  while (value > 180) value -= 360;
  while (value < -180) value += 360;
  return value;
}

function julianDay(date) {
  const ms = date.getTime();
  return ms / 86400000 + 2440587.5;
}

function gmstDegrees(date) {
  const jd = julianDay(date);
  const d = jd - 2451545.0;
  const gmst = 280.46061837 + 360.98564736629 * d;
  return ((gmst % 360) + 360) % 360;
}

function computeCurve(decDeg, raDeg, gmstDeg, isAsc) {
  const points = [];
  for (let lat = -89; lat <= 89; lat += 1) {
    const phi = lat * Math.PI / 180;
    const dec = decDeg * Math.PI / 180;
    const cosH = -Math.tan(phi) * Math.tan(dec);

    if (cosH < -1 || cosH > 1) continue;

    const h0Deg = Math.acos(cosH) * 180 / Math.PI;
    const hourAngle = isAsc ? -h0Deg : h0Deg;
    const longitude = normalize180(raDeg + hourAngle - gmstDeg);

    points.push([lat, longitude]);
  }
  return points;
}

function planetEquatorial(body, utcDate) {
  const astroTime = new Astronomy.AstroTime(utcDate);
  const observer = new Astronomy.Observer(0, 0, 0);
  const eq = Astronomy.Equator(body, astroTime, observer, true, true);
  return {
    raHours: eq.ra,
    raDeg: eq.ra * 15,
    decDeg: eq.dec
  };
}

app.post('/api/astro-lines', (req, res) => {
  try {
    const {
      birthYear,
      birthMonth,
      birthDay,
      hour,
      minute,
      latitude,
      longitude
    } = req.body;

    if (
      !Number.isFinite(birthYear) ||
      !Number.isFinite(birthMonth) ||
      !Number.isFinite(birthDay) ||
      !Number.isFinite(hour) ||
      !Number.isFinite(minute) ||
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude)
    ) {
      return res.status(400).json({
        error: 'All fields are required and must be numeric.'
      });
    }

    const timezone = tzlookup(latitude, longitude);

    const local = DateTime.fromObject(
      {
        year: birthYear,
        month: birthMonth,
        day: birthDay,
        hour,
        minute,
        second: 0,
        millisecond: 0
      },
      { zone: timezone }
    );

    if (!local.isValid) {
      return res.status(400).json({ error: 'Invalid birth date/time input.' });
    }

    const utc = local.toUTC();
    const utcDate = utc.toJSDate();

    const gmstDeg = gmstDegrees(utcDate);

    const planets = PLANETS.map((planet) => {
      const eq = planetEquatorial(planet.body, utcDate);
      const mcLon = normalize180(eq.raDeg - gmstDeg);
      const icLon = normalize180(mcLon + 180);

      const ascCurve = computeCurve(eq.decDeg, eq.raDeg, gmstDeg, true);
      const dcCurve = computeCurve(eq.decDeg, eq.raDeg, gmstDeg, false);

      return {
        name: planet.key,
        color: planet.color,
        raHours: eq.raHours,
        decDeg: eq.decDeg,
        lines: {
          mc: { longitude: mcLon, points: [[-89, mcLon], [89, mcLon]] },
          ic: { longitude: icLon, points: [[-89, icLon], [89, icLon]] },
          ac: { points: ascCurve },
          dc: { points: dcCurve }
        }
      };
    });

    return res.json({
      input: {
        birthYear,
        birthMonth,
        birthDay,
        hour,
        minute,
        latitude,
        longitude
      },
      timezone,
      utc: {
        iso: utc.toISO(),
        hour: utc.hour,
        minute: utc.minute,
        formatted: utc.toFormat('HH:mm')
      },
      gmst: {
        degrees: gmstDeg,
        formula: 'GMST = 280.46061837 + 360.98564736629 x D'
      },
      planets
    });
  } catch (error) {
    return res.status(500).json({
      error: 'Failed to generate astrocartography lines.',
      detail: error.message
    });
  }
});

app.get('/health', (req, res) => {
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`Astrocartography simulator running on http://localhost:${PORT}`);
});
