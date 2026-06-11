# Bangkok Heavy Rainfall Dashboard

Static live dashboard for Bangkok-area rainfall monitoring.

## Run

Open `index.html` directly, or serve the directory:

```bash
python3 -m http.server 4173
```

Then visit `http://localhost:4173`.

## Data

- Open-Meteo Forecast API supplies current and next-12-hour precipitation values.
- RainViewer supplies recent weather radar tiles.
- OpenStreetMap supplies the base map tiles.
