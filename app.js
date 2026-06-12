const LOCATIONS = [
  { name: "Rattanakosin", lat: 13.7563, lon: 100.5018 },
  { name: "Don Mueang", lat: 13.9133, lon: 100.6042 },
  { name: "Chatuchak", lat: 13.815, lon: 100.5603 },
  { name: "Thon Buri", lat: 13.725, lon: 100.485 },
  { name: "Bang Na", lat: 13.6679, lon: 100.604 },
  { name: "Lat Krabang", lat: 13.7223, lon: 100.794 },
  { name: "Min Buri", lat: 13.817, lon: 100.732 },
  { name: "Phra Khanong", lat: 13.7042, lon: 100.6013 },
  { name: "Nonthaburi", lat: 13.8591, lon: 100.5217 },
  { name: "Samut Prakan", lat: 13.5991, lon: 100.5998 },
  { name: "Pathum Thani", lat: 14.0208, lon: 100.525 }
];

const RISK = {
  low: { label: "Low", color: "#2f855a", rank: 0 },
  light: { label: "Light", color: "#24838f", rank: 1 },
  moderate: { label: "Moderate", color: "#b57913", rank: 2 },
  heavy: { label: "Heavy", color: "#c75000", rank: 3 },
  severe: { label: "Severe", color: "#b3261e", rank: 4 }
};

const AUTO_REFRESH_MS = 10 * 60 * 1000;
const RADAR_ANIMATION_MS = 700;
const DEFAULT_MAP_BOUNDS = { north: 14.07, south: 13.55, west: 100.36, east: 100.86 };
const DEFAULT_MAP_CENTER = {
  lat: (DEFAULT_MAP_BOUNDS.north + DEFAULT_MAP_BOUNDS.south) / 2,
  lon: (DEFAULT_MAP_BOUNDS.west + DEFAULT_MAP_BOUNDS.east) / 2
};
const MAP_VIEWBOX = { width: 1000, height: 680 };
const MAP_ZOOM_FACTOR = 1.7;
const MAP_ZOOM_MIN = 0;
const MAP_ZOOM_MAX = 3;
const MAP_PAN_BUTTON_FRACTION = 0.24;
const MAP_COORD_EPSILON = 0.000001;
const WEB_MERCATOR_TILE_SIZE = 256;
const HEATMAP_BASE_RADIUS = 42;
const BASE_ONLINE_MAP_ZOOM = 11;
const RADAR_TILE_SIZE = 512;
const BASE_RADAR_ZOOM = 7;
const RADAR_COLOR_SCHEME = 2;
const RADAR_OPTIONS = "1_1";
const MARKER_UNAVAILABLE_COLOR = "#636b74";

const els = {
  connectionStatus: document.querySelector("#connectionStatus"),
  refreshButton: document.querySelector("#refreshButton"),
  autoRefreshButton: document.querySelector("#autoRefreshButton"),
  radarOpacity: document.querySelector("#radarOpacity"),
  radarPlayButton: document.querySelector("#radarPlayButton"),
  radarFrameTime: document.querySelector("#radarFrameTime"),
  radarTimeline: document.querySelector("#radarTimeline"),
  map: document.querySelector("#map"),
  mapZoomIn: document.querySelector("#mapZoomIn"),
  mapZoomOut: document.querySelector("#mapZoomOut"),
  mapZoomReset: document.querySelector("#mapZoomReset"),
  mapZoomLevel: document.querySelector("#mapZoomLevel"),
  mapPanUp: document.querySelector("#mapPanUp"),
  mapPanDown: document.querySelector("#mapPanDown"),
  mapPanLeft: document.querySelector("#mapPanLeft"),
  mapPanRight: document.querySelector("#mapPanRight"),
  onlineMap: document.querySelector("#onlineMap"),
  radarImage: document.querySelector("#radarImage"),
  rainHeatmap: document.querySelector("#rainHeatmap"),
  stationOverlay: document.querySelector("#stationOverlay"),
  mapTooltip: document.querySelector("#mapTooltip"),
  overallCard: document.querySelector("#overallCard"),
  overallStatus: document.querySelector("#overallStatus"),
  overallDetail: document.querySelector("#overallDetail"),
  overallRisk: document.querySelector("#overallRisk"),
  lastUpdated: document.querySelector("#lastUpdated"),
  currentMax: document.querySelector("#currentMax"),
  next3Max: document.querySelector("#next3Max"),
  affectedCount: document.querySelector("#affectedCount"),
  peakGust: document.querySelector("#peakGust"),
  stationList: document.querySelector("#stationList"),
  forecastChart: document.querySelector("#forecastChart"),
  forecastRange: document.querySelector("#forecastRange")
};

let markers = new Map();
let weatherReports = [];
let radarFrames = [];
let radarHost = "https://tilecache.rainviewer.com";
let radarFrameIndex = 0;
let mapZoomLevel = 0;
let mapCenter = { ...DEFAULT_MAP_CENTER };
let mapPanState;
let autoRefresh = true;
let autoRefreshTimer;
let radarAnimationTimer;

document.addEventListener("DOMContentLoaded", () => {
  window.lucide?.createIcons();
  renderOnlineMap();
  initMap();
  bindControls();
  updateMapZoomControls();
  refreshAll();
  scheduleAutoRefresh();
});

function initMap() {
  LOCATIONS.forEach((location) => {
    const point = projectLocation(location);
    const group = svgEl("g", {
      class: "station-marker",
      transform: `translate(${point.x} ${point.y})`,
      tabindex: "0",
      role: "button",
      "aria-label": `${location.name} rainfall status`
    });
    const circle = svgEl("circle", {
      r: 10,
      fill: RISK.low.color
    });
    const label = svgEl("text", {
      x: 16,
      y: 5
    }, location.name);
    const title = svgEl("title", {}, `${location.name}: loading rainfall data`);
    const marker = { group, circle, label, title, point, report: null };
    group.toggleAttribute("hidden", !point.visible);

    group.append(title, circle, label);
    group.addEventListener("mouseenter", () => showMapTooltip(marker));
    group.addEventListener("focus", () => showMapTooltip(marker));
    group.addEventListener("mouseleave", hideMapTooltip);
    group.addEventListener("blur", hideMapTooltip);
    group.addEventListener("click", () => showMapTooltip(marker));
    els.stationOverlay.appendChild(group);
    markers.set(location.name, marker);
  });
}

function bindControls() {
  els.refreshButton.addEventListener("click", refreshAll);
  els.autoRefreshButton.addEventListener("click", () => {
    autoRefresh = !autoRefresh;
    els.autoRefreshButton.classList.toggle("is-active", autoRefresh);
    els.autoRefreshButton.setAttribute("aria-pressed", String(autoRefresh));
    scheduleAutoRefresh();
  });
  els.radarOpacity.addEventListener("input", () => {
    els.radarImage.style.opacity = String(Number(els.radarOpacity.value) / 100);
  });
  els.radarPlayButton.addEventListener("click", toggleRadarAnimation);
  els.mapZoomIn.addEventListener("click", () => setMapZoom(mapZoomLevel + 1));
  els.mapZoomOut.addEventListener("click", () => setMapZoom(mapZoomLevel - 1));
  els.mapZoomReset.addEventListener("click", resetMapView);
  els.mapPanUp.addEventListener("click", () => panMapByViewport(0, -MAP_PAN_BUTTON_FRACTION));
  els.mapPanDown.addEventListener("click", () => panMapByViewport(0, MAP_PAN_BUTTON_FRACTION));
  els.mapPanLeft.addEventListener("click", () => panMapByViewport(-MAP_PAN_BUTTON_FRACTION, 0));
  els.mapPanRight.addEventListener("click", () => panMapByViewport(MAP_PAN_BUTTON_FRACTION, 0));
  els.map.addEventListener("pointerdown", handleMapPointerDown);
  els.map.addEventListener("pointermove", handleMapPointerMove);
  els.map.addEventListener("pointerup", endMapPan);
  els.map.addEventListener("pointercancel", endMapPan);
  els.map.addEventListener("keydown", handleMapKeydown);
  els.map.addEventListener("dblclick", handleMapDoubleClick);
  els.map.addEventListener("wheel", handleMapWheel, { passive: false });
}

function handleMapPointerDown(event) {
  if (event.button !== 0 && event.pointerType !== "touch") {
    return;
  }

  const mapRect = els.map.getBoundingClientRect();
  mapPanState = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    startCenter: { ...mapCenter },
    mapWidth: mapRect.width,
    mapHeight: mapRect.height
  };
  els.map.classList.add("is-panning");
  els.map.setPointerCapture?.(event.pointerId);
  hideMapTooltip();
}

function handleMapPointerMove(event) {
  if (!mapPanState || event.pointerId !== mapPanState.pointerId) {
    return;
  }

  event.preventDefault();
  panMapFromDrag(event.clientX - mapPanState.startX, event.clientY - mapPanState.startY);
}

function endMapPan(event) {
  if (!mapPanState || event.pointerId !== mapPanState.pointerId) {
    return;
  }

  els.map.releasePointerCapture?.(event.pointerId);
  els.map.classList.remove("is-panning");
  mapPanState = undefined;
}

function handleMapKeydown(event) {
  const keyActions = {
    ArrowUp: () => panMapByViewport(0, -MAP_PAN_BUTTON_FRACTION),
    ArrowDown: () => panMapByViewport(0, MAP_PAN_BUTTON_FRACTION),
    ArrowLeft: () => panMapByViewport(-MAP_PAN_BUTTON_FRACTION, 0),
    ArrowRight: () => panMapByViewport(MAP_PAN_BUTTON_FRACTION, 0),
    "+": () => setMapZoom(mapZoomLevel + 1),
    "=": () => setMapZoom(mapZoomLevel + 1),
    "-": () => setMapZoom(mapZoomLevel - 1),
    "0": resetMapView
  };
  const action = keyActions[event.key];
  if (!action) {
    return;
  }

  event.preventDefault();
  action();
}

function handleMapWheel(event) {
  if (event.deltaY === 0) {
    return;
  }

  event.preventDefault();
  setMapZoom(mapZoomLevel + (event.deltaY < 0 ? 1 : -1), getMapAnchorPoint(event));
}

function handleMapDoubleClick(event) {
  event.preventDefault();
  setMapZoom(mapZoomLevel + 1, getMapAnchorPoint(event));
}

function setMapZoom(nextZoomLevel, anchorPoint) {
  const clampedZoom = Math.max(MAP_ZOOM_MIN, Math.min(MAP_ZOOM_MAX, nextZoomLevel));
  const nextCenter = anchorPoint ? getAnchoredZoomCenter(anchorPoint, clampedZoom) : clampMapCenter(mapCenter, clampedZoom);
  const zoomChanged = clampedZoom !== mapZoomLevel;
  const centerChanged = hasMapCenterChanged(nextCenter, mapCenter);

  if (!zoomChanged && !centerChanged) {
    return;
  }

  mapZoomLevel = clampedZoom;
  mapCenter = nextCenter;
  updateMapView();
}

function resetMapView() {
  const zoomChanged = mapZoomLevel !== MAP_ZOOM_MIN;
  const centerChanged = hasMapCenterChanged(mapCenter, DEFAULT_MAP_CENTER);
  if (!zoomChanged && !centerChanged) {
    return;
  }

  mapZoomLevel = MAP_ZOOM_MIN;
  mapCenter = { ...DEFAULT_MAP_CENTER };
  updateMapView();
}

function panMapByViewport(deltaXFraction, deltaYFraction) {
  const bounds = getCurrentMapBounds();
  setMapCenter({
    lat: mapCenter.lat - deltaYFraction * (bounds.north - bounds.south),
    lon: mapCenter.lon + deltaXFraction * (bounds.east - bounds.west)
  });
}

function panMapFromDrag(deltaX, deltaY) {
  if (!mapPanState) {
    return;
  }

  const zoom = getOnlineMapZoom();
  const startBounds = getMapBoundsForCenter(mapPanState.startCenter, mapZoomLevel);
  const projection = getMapProjection(startBounds, zoom);
  const startPoint = lonLatToWorldPixel(mapPanState.startCenter, zoom);
  const nextPoint = {
    x: startPoint.x - (deltaX / mapPanState.mapWidth) * projection.width,
    y: startPoint.y - (deltaY / mapPanState.mapHeight) * projection.height
  };

  setMapCenter(worldPixelToLonLat(nextPoint, zoom));
}

function setMapCenter(nextCenter) {
  const clampedCenter = clampMapCenter(nextCenter);
  if (!hasMapCenterChanged(clampedCenter, mapCenter)) {
    return;
  }

  mapCenter = clampedCenter;
  updateMapView();
}

function updateMapView() {
  renderMapLayers();
  renderRainHeatmap(weatherReports);
  updateMarkerPositions();
  updateMapZoomControls();
  hideMapTooltip();
}

function getMapAnchorPoint(event) {
  const mapRect = els.map.getBoundingClientRect();

  return {
    x: (event.clientX - mapRect.left) / mapRect.width,
    y: (event.clientY - mapRect.top) / mapRect.height
  };
}

function getAnchoredZoomCenter(anchorPoint, targetZoomLevel) {
  const currentProjection = getMapProjection(getCurrentMapBounds(), getOnlineMapZoom());
  const anchorWorld = {
    x: currentProjection.west + anchorPoint.x * currentProjection.width,
    y: currentProjection.north + anchorPoint.y * currentProjection.height
  };
  const anchorLocation = worldPixelToLonLat(anchorWorld, getOnlineMapZoom());
  const targetZoom = getOnlineMapZoom(targetZoomLevel);
  const targetAnchorWorld = lonLatToWorldPixel(anchorLocation, targetZoom);
  const targetProjection = getMapProjection(getMapBoundsForCenter(mapCenter, targetZoomLevel), targetZoom);
  const targetCenterWorld = {
    x: targetAnchorWorld.x - (anchorPoint.x - 0.5) * targetProjection.width,
    y: targetAnchorWorld.y - (anchorPoint.y - 0.5) * targetProjection.height
  };

  return clampMapCenter(worldPixelToLonLat(targetCenterWorld, targetZoom), targetZoomLevel);
}

function renderMapLayers() {
  renderOnlineMap();
  const frame = radarFrames[radarFrameIndex];
  if (frame) {
    renderRadarTiles(frame);
  }
}

function updateMarkerPositions() {
  LOCATIONS.forEach((location) => {
    const marker = markers.get(location.name);
    if (!marker) {
      return;
    }

    const point = projectLocation(location);
    marker.point = point;
    marker.group.setAttribute("transform", `translate(${point.x} ${point.y})`);
    marker.group.toggleAttribute("hidden", !point.visible);
  });
}

function updateMapZoomControls() {
  const zoomScale = getMapZoomScale();
  const limits = getMapCenterLimits(mapZoomLevel);
  els.mapZoomLevel.textContent = zoomScale === 1 ? "1x" : `${zoomScale.toFixed(1)}x`;
  els.mapZoomOut.disabled = mapZoomLevel === MAP_ZOOM_MIN;
  els.mapZoomIn.disabled = mapZoomLevel === MAP_ZOOM_MAX;
  els.mapZoomReset.disabled = mapZoomLevel === MAP_ZOOM_MIN && !hasMapCenterChanged(mapCenter, DEFAULT_MAP_CENTER);
  els.mapPanUp.disabled = mapCenter.lat >= limits.maxLat - MAP_COORD_EPSILON;
  els.mapPanDown.disabled = mapCenter.lat <= limits.minLat + MAP_COORD_EPSILON;
  els.mapPanLeft.disabled = mapCenter.lon <= limits.minLon + MAP_COORD_EPSILON;
  els.mapPanRight.disabled = mapCenter.lon >= limits.maxLon - MAP_COORD_EPSILON;
}

async function refreshAll() {
  setStatus("Updating", "loading");
  els.refreshButton.classList.add("is-active");

  try {
    const [weatherResult, radarResult] = await Promise.allSettled([fetchWeather(), fetchRadar()]);
    if (weatherResult.status === "fulfilled") {
      renderWeather(weatherResult.value);
      setStatus(radarResult.status === "fulfilled" ? "Live" : "Forecast live", "live");
    } else {
      console.error(weatherResult.reason);
      renderWeatherError();
      setStatus(radarResult.status === "fulfilled" ? "Radar live" : "Data error", radarResult.status === "fulfilled" ? "live" : "error");
    }
  } catch (error) {
    console.error(error);
    setStatus("Data error", "error");
    clearWeatherViews();
    els.overallStatus.textContent = "Data unavailable";
    els.overallDetail.textContent = "Live rainfall sources could not be reached from this browser.";
  } finally {
    els.refreshButton.classList.remove("is-active");
  }
}

async function fetchWeather() {
  const params = new URLSearchParams({
    latitude: LOCATIONS.map((location) => location.lat).join(","),
    longitude: LOCATIONS.map((location) => location.lon).join(","),
    current: [
      "temperature_2m",
      "relative_humidity_2m",
      "precipitation",
      "rain",
      "showers",
      "weather_code",
      "cloud_cover",
      "wind_speed_10m",
      "wind_gusts_10m"
    ].join(","),
    hourly: [
      "precipitation_probability",
      "precipitation",
      "rain",
      "showers",
      "weather_code",
      "wind_gusts_10m"
    ].join(","),
    past_hours: "1",
    forecast_hours: "12",
    timezone: "Asia/Bangkok",
    wind_speed_unit: "kmh",
    precipitation_unit: "mm"
  });

  const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`Open-Meteo returned ${response.status}`);
  }

  const payload = await response.json();
  const reports = Array.isArray(payload) ? payload : [payload];
  return reports.map((report, index) => summarizeLocation(LOCATIONS[index], report));
}

async function fetchRadar() {
  const response = await fetch("https://api.rainviewer.com/public/weather-maps.json", {
    cache: "no-store"
  });
  if (!response.ok) {
    throw new Error(`RainViewer returned ${response.status}`);
  }

  const payload = await response.json();
  radarHost = payload.host || radarHost;
  radarFrames = payload?.radar?.past || [];
  if (!radarFrames.length) {
    return;
  }

  radarFrameIndex = radarFrames.length - 1;
  setRadarFrame(radarFrameIndex);
  renderRadarTimeline();
}

function summarizeLocation(location, report) {
  const current = report.current || {};
  const hourly = report.hourly || {};
  const times = hourly.time || [];
  const nowIndex = getCurrentHourIndex(times);
  const hours = times.slice(nowIndex, nowIndex + 12).map((time, offset) => {
    const index = nowIndex + offset;
    const precipitation = numberAt(hourly.precipitation, index);
    const rain = numberAt(hourly.rain, index);
    const showers = numberAt(hourly.showers, index);
    return {
      time,
      precipitation: Math.max(precipitation, rain + showers),
      probability: numberAt(hourly.precipitation_probability, index),
      gust: numberAt(hourly.wind_gusts_10m, index),
      code: numberAt(hourly.weather_code, index)
    };
  });

  const currentPrecip = Math.max(
    valueOrZero(current.precipitation),
    valueOrZero(current.rain) + valueOrZero(current.showers)
  );
  const next3Total = sum(hours.slice(0, 3).map((hour) => hour.precipitation));
  const next6Total = sum(hours.slice(0, 6).map((hour) => hour.precipitation));
  const maxHour = Math.max(0, ...hours.map((hour) => hour.precipitation));
  const maxProbability = Math.max(0, ...hours.map((hour) => hour.probability));
  const peakGust = Math.max(valueOrZero(current.wind_gusts_10m), ...hours.map((hour) => hour.gust || 0));
  const risk = classifyRisk({ currentPrecip, next3Total, next6Total, maxHour, maxProbability });

  return {
    ...location,
    current,
    hours,
    currentPrecip,
    next3Total,
    next6Total,
    maxHour,
    maxProbability,
    peakGust,
    risk,
    weather: describeWeather(current.weather_code)
  };
}

function classifyRisk({ currentPrecip, next3Total, next6Total, maxHour, maxProbability }) {
  if (currentPrecip >= 20 || next3Total >= 35 || maxHour >= 20 || next6Total >= 55) {
    return RISK.severe;
  }
  if (currentPrecip >= 10 || next3Total >= 20 || maxHour >= 10 || (maxProbability >= 85 && next3Total >= 12)) {
    return RISK.heavy;
  }
  if (currentPrecip >= 2.5 || next3Total >= 8 || maxHour >= 5 || maxProbability >= 65) {
    return RISK.moderate;
  }
  if (currentPrecip > 0.1 || next3Total > 1 || maxProbability >= 35) {
    return RISK.light;
  }
  return RISK.low;
}

function renderWeather(reports) {
  weatherReports = reports;
  const sorted = [...reports].sort((a, b) => b.risk.rank - a.risk.rank || b.next3Total - a.next3Total);
  const top = sorted[0];
  const currentMax = Math.max(...reports.map((report) => report.currentPrecip));
  const next3Max = Math.max(...reports.map((report) => report.next3Total));
  const affectedCount = reports.filter((report) => report.risk.rank >= RISK.heavy.rank).length;
  const peakGust = Math.max(...reports.map((report) => report.peakGust));

  els.overallStatus.textContent = getOverallStatus(top, affectedCount);
  els.overallDetail.textContent = `${top.name} has the highest signal: ${formatRain(top.currentPrecip)} mm now, ${formatRain(top.next3Total)} mm over the next 3 hours.`;
  els.overallRisk.textContent = top.risk.label;
  els.overallRisk.style.background = top.risk.color;
  els.overallCard.style.borderColor = top.risk.color;
  els.currentMax.textContent = formatRain(currentMax);
  els.next3Max.textContent = formatRain(next3Max);
  els.affectedCount.textContent = String(affectedCount);
  els.peakGust.textContent = formatRain(peakGust);
  els.lastUpdated.textContent = formatBangkokTime(new Date(), { hour: "2-digit", minute: "2-digit" });

  renderStations(sorted);
  renderRainHeatmap(reports);
  renderMarkers(reports);
  renderForecastChart(reports);
}

function getOverallStatus(top, affectedCount) {
  if (top.risk.rank >= RISK.severe.rank) {
    return "Severe rainfall risk";
  }
  if (top.risk.rank >= RISK.heavy.rank) {
    return affectedCount > 1 ? "Heavy rain across the area" : "Localized heavy rain";
  }
  if (top.risk.rank >= RISK.moderate.rank) {
    return "Rainfall watch";
  }
  if (top.risk.rank >= RISK.light.rank) {
    return "Light rain signal";
  }
  return "Low rainfall signal";
}

function renderStations(reports) {
  els.stationList.replaceChildren(
    ...reports.map((report) => {
      const article = document.createElement("article");
      article.className = "station-card";
      article.innerHTML = `
        <div class="station-row">
          <div class="station-name">${report.name}</div>
          <div class="station-risk" style="background:${report.risk.color}">${report.risk.label}</div>
        </div>
        <div class="station-meta">
          <span>${formatRain(report.currentPrecip)} mm now</span>
          <span>${formatRain(report.next3Total)} mm 3h</span>
          <span>${Math.round(report.maxProbability)}% peak</span>
          <span>${report.weather}</span>
        </div>
      `;
      return article;
    })
  );
}

function renderRainHeatmap(reports) {
  if (!reports.length) {
    els.rainHeatmap.replaceChildren();
    return;
  }

  const activeReports = reports
    .filter((report) => Math.max(report.currentPrecip, report.next3Total, report.maxHour) > 0 || report.risk.rank > RISK.low.rank)
    .sort((a, b) => a.risk.rank - b.risk.rank || a.next3Total - b.next3Total);

  if (!activeReports.length) {
    els.rainHeatmap.replaceChildren();
    return;
  }

  const heatNodes = activeReports.flatMap((report) => {
    const point = projectLocation(report);
    if (!point.visible) {
      return [];
    }

    const radius = getHeatmapRadius(report);
    const opacity = getHeatmapOpacity(report);
    return [
      svgEl("circle", {
        class: "heatmap-halo",
        cx: point.x,
        cy: point.y,
        r: radius * 1.55,
        fill: report.risk.color,
        opacity: opacity * 0.34
      }),
      svgEl("circle", {
        class: "heatmap-core",
        cx: point.x,
        cy: point.y,
        r: radius,
        fill: report.risk.color,
        opacity
      })
    ];
  });

  els.rainHeatmap.replaceChildren(...heatNodes);
}

function getHeatmapRadius(report) {
  const intensity = Math.max(report.currentPrecip * 1.5, report.next3Total, report.maxHour * 2);
  const radius = HEATMAP_BASE_RADIUS + report.risk.rank * 20 + Math.min(74, intensity * 2.1);
  return radius * Math.sqrt(getMapZoomScale());
}

function getHeatmapOpacity(report) {
  return Math.min(0.58, 0.12 + report.risk.rank * 0.08 + report.next3Total / 90 + report.currentPrecip / 70);
}

function renderMarkers(reports) {
  reports.forEach((report) => {
    const marker = markers.get(report.name);
    if (!marker) {
      return;
    }

    const radius = 8 + Math.min(12, report.risk.rank * 2.5 + report.next3Total / 5);
    marker.report = report;
    marker.circle.setAttribute("r", String(radius));
    marker.circle.setAttribute("fill", report.risk.color);
    marker.title.textContent = `${report.name}: ${report.risk.label}, ${formatRain(report.currentPrecip)} mm now, ${formatRain(report.next3Total)} mm next 3 hours`;
  });
}

function renderForecastChart(reports) {
  const chart = els.forecastChart;
  const firstReport = reports[0];
  if (!firstReport?.hours?.length) {
    chart.replaceChildren();
    els.forecastRange.textContent = "--";
    return;
  }

  const hourCount = firstReport.hours.length;
  const series = Array.from({ length: hourCount }, (_, index) => {
    const values = reports.map((report) => report.hours[index]?.precipitation || 0);
    const probabilities = reports.map((report) => report.hours[index]?.probability || 0);
    return {
      time: firstReport.hours[index].time,
      avg: sum(values) / values.length,
      max: Math.max(...values),
      probability: Math.max(...probabilities)
    };
  });

  const width = 920;
  const height = 188;
  const pad = { top: 12, right: 20, bottom: 32, left: 40 };
  const plotWidth = width - pad.left - pad.right;
  const plotHeight = height - pad.top - pad.bottom;
  const maxValue = Math.max(5, ...series.map((item) => item.max));
  const slot = plotWidth / series.length;
  const barWidth = Math.max(10, slot * 0.56);

  chart.setAttribute("viewBox", `0 0 ${width} ${height}`);
  chart.replaceChildren();

  [0, 0.5, 1].forEach((tick) => {
    const y = pad.top + plotHeight * tick;
    chart.appendChild(svgEl("line", {
      class: "chart-grid",
      x1: pad.left,
      x2: width - pad.right,
      y1: y,
      y2: y
    }));
  });

  series.forEach((item, index) => {
    const x = pad.left + index * slot + (slot - barWidth) / 2;
    const maxHeight = (item.max / maxValue) * plotHeight;
    const avgHeight = (item.avg / maxValue) * plotHeight;
    const baseY = pad.top + plotHeight;

    chart.appendChild(svgEl("rect", {
      class: "chart-bar-max",
      x,
      y: baseY - maxHeight,
      width: barWidth,
      height: Math.max(2, maxHeight),
      rx: 4
    }));
    chart.appendChild(svgEl("rect", {
      class: "chart-bar-avg",
      x: x + barWidth * 0.2,
      y: baseY - avgHeight,
      width: barWidth * 0.6,
      height: Math.max(2, avgHeight),
      rx: 3
    }));

    if (index % 2 === 0) {
      chart.appendChild(svgEl("text", {
        class: "chart-axis",
        x: x + barWidth / 2,
        y: height - 8,
        "text-anchor": "middle"
      }, formatChartHour(item.time)));
    }
  });

  chart.appendChild(svgEl("text", {
    class: "chart-axis",
    x: pad.left,
    y: 11,
    "text-anchor": "start"
  }, `${formatRain(maxValue)} mm`));

  els.forecastRange.textContent = `${formatChartHour(series[0].time)}-${formatChartHour(series.at(-1).time)} ICT`;
}

function setRadarFrame(index) {
  const frame = radarFrames[index];
  if (!frame) {
    return;
  }

  renderRadarTiles(frame);
  els.radarImage.style.opacity = String(Number(els.radarOpacity.value) / 100);
  radarFrameIndex = index;
  els.radarFrameTime.textContent = formatBangkokTime(new Date(frame.time * 1000), {
    hour: "2-digit",
    minute: "2-digit"
  });
  updateTimelineActive();
}

function renderRadarTimeline() {
  const items = radarFrames.slice(-9);
  const startIndex = radarFrames.length - items.length;
  els.radarTimeline.replaceChildren(
    ...items.map((frame, offset) => {
      const index = startIndex + offset;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "timeline-button";
      button.dataset.index = String(index);
      button.textContent = formatBangkokTime(new Date(frame.time * 1000), {
        hour: "2-digit",
        minute: "2-digit"
      });
      button.addEventListener("click", () => {
        stopRadarAnimation();
        setRadarFrame(index);
      });
      return button;
    })
  );
  updateTimelineActive();
}

function updateTimelineActive() {
  els.radarTimeline.querySelectorAll(".timeline-button").forEach((button) => {
    button.classList.toggle("is-active", Number(button.dataset.index) === radarFrameIndex);
  });
}

function toggleRadarAnimation() {
  if (radarAnimationTimer) {
    stopRadarAnimation();
    return;
  }

  if (!radarFrames.length) {
    return;
  }

  els.radarPlayButton.classList.add("is-active");
  els.radarPlayButton.innerHTML = '<i data-lucide="pause"></i>';
  window.lucide?.createIcons();
  radarAnimationTimer = window.setInterval(() => {
    const timelineButtons = [...els.radarTimeline.querySelectorAll(".timeline-button")];
    const visibleIndexes = timelineButtons.map((button) => Number(button.dataset.index));
    const currentVisiblePosition = visibleIndexes.indexOf(radarFrameIndex);
    const nextPosition = currentVisiblePosition >= 0 ? (currentVisiblePosition + 1) % visibleIndexes.length : 0;
    setRadarFrame(visibleIndexes[nextPosition]);
  }, RADAR_ANIMATION_MS);
}

function stopRadarAnimation() {
  if (radarAnimationTimer) {
    window.clearInterval(radarAnimationTimer);
    radarAnimationTimer = undefined;
  }
  els.radarPlayButton.classList.remove("is-active");
  els.radarPlayButton.innerHTML = '<i data-lucide="play"></i>';
  window.lucide?.createIcons();
}

function scheduleAutoRefresh() {
  if (autoRefreshTimer) {
    window.clearInterval(autoRefreshTimer);
  }
  if (autoRefresh) {
    autoRefreshTimer = window.setInterval(refreshAll, AUTO_REFRESH_MS);
  }
}

function setStatus(text, state) {
  els.connectionStatus.textContent = text;
  els.connectionStatus.classList.toggle("is-live", state === "live");
  els.connectionStatus.classList.toggle("is-error", state === "error");
}

function renderWeatherError() {
  clearWeatherViews();
  els.overallStatus.textContent = "Forecast unavailable";
  els.overallDetail.textContent = "Radar frames are available, but the rainfall forecast source could not be reached.";
}

function clearWeatherViews() {
  weatherReports = [];
  els.overallRisk.textContent = "--";
  els.overallRisk.style.background = "rgba(255, 255, 255, 0.1)";
  els.overallCard.style.borderColor = "";
  els.lastUpdated.textContent = "--";
  els.currentMax.textContent = "--";
  els.next3Max.textContent = "--";
  els.affectedCount.textContent = "--";
  els.peakGust.textContent = "--";
  els.stationList.replaceChildren(createUnavailableStationCard());
  els.rainHeatmap.replaceChildren();
  els.forecastChart.replaceChildren();
  els.forecastRange.textContent = "--";
  markers.forEach((marker, name) => {
    marker.report = null;
    marker.circle.setAttribute("r", "10");
    marker.circle.setAttribute("fill", MARKER_UNAVAILABLE_COLOR);
    marker.title.textContent = `${name}: forecast unavailable`;
  });
  hideMapTooltip();
}

function createUnavailableStationCard() {
  const article = document.createElement("article");
  article.className = "station-card";
  article.innerHTML = `
    <div class="station-row">
      <div class="station-name">Forecast unavailable</div>
      <div class="station-risk" style="background:${MARKER_UNAVAILABLE_COLOR}">--</div>
    </div>
    <div class="station-meta">
      <span>Open-Meteo request failed</span>
    </div>
  `;
  return article;
}

function renderOnlineMap() {
  const zoom = getOnlineMapZoom();
  els.onlineMap.replaceChildren(
    ...createMapTiles(zoom, "map-tile", (x, y) => (
      `https://tile.openstreetmap.org/${zoom}/${x}/${y}.png`
    ))
  );
}

function renderRadarTiles(frame) {
  const zoom = getRadarMapZoom();
  els.radarImage.replaceChildren(
    ...createMapTiles(zoom, "radar-tile", (x, y) => (
      `${radarHost}${frame.path}/${RADAR_TILE_SIZE}/${zoom}/${x}/${y}/${RADAR_COLOR_SCHEME}/${RADAR_OPTIONS}.png`
    ))
  );
}

function createMapTiles(zoom, className, getSource) {
  const bounds = getCurrentMapBounds();
  const projection = getMapProjection(bounds, zoom);
  const northWestTile = lonLatToTile({ lat: bounds.north, lon: bounds.west }, zoom);
  const southEastTile = lonLatToTile({ lat: bounds.south, lon: bounds.east }, zoom);
  const tiles = [];

  for (let y = northWestTile.y; y <= southEastTile.y; y += 1) {
    for (let x = northWestTile.x; x <= southEastTile.x; x += 1) {
      const image = new Image();
      image.alt = "";
      image.decoding = "async";
      image.draggable = false;
      image.loading = className === "map-tile" ? "lazy" : "eager";
      image.className = className;
      image.src = getSource(x, y);
      positionMapTile(image, x, y, projection);
      tiles.push(image);
    }
  }

  return tiles;
}

function positionMapTile(image, tileX, tileY, projection) {
  const left = ((tileX * WEB_MERCATOR_TILE_SIZE - projection.west) / projection.width) * 100;
  const top = ((tileY * WEB_MERCATOR_TILE_SIZE - projection.north) / projection.height) * 100;
  const width = (WEB_MERCATOR_TILE_SIZE / projection.width) * 100;
  const height = (WEB_MERCATOR_TILE_SIZE / projection.height) * 100;

  image.style.left = `${left}%`;
  image.style.top = `${top}%`;
  image.style.width = `calc(${width}% + 1px)`;
  image.style.height = `calc(${height}% + 1px)`;
}

function getMapProjection(bounds, zoom) {
  const northWest = lonLatToWorldPixel({ lat: bounds.north, lon: bounds.west }, zoom);
  const southEast = lonLatToWorldPixel({ lat: bounds.south, lon: bounds.east }, zoom);

  return {
    west: northWest.x,
    north: northWest.y,
    east: southEast.x,
    south: southEast.y,
    width: southEast.x - northWest.x,
    height: southEast.y - northWest.y
  };
}

function projectLocation(location) {
  const projection = getMapProjection(getCurrentMapBounds(), getOnlineMapZoom());
  const point = lonLatToWorldPixel(location, getOnlineMapZoom());
  const x = ((point.x - projection.west) / projection.width) * MAP_VIEWBOX.width;
  const y = ((point.y - projection.north) / projection.height) * MAP_VIEWBOX.height;

  return {
    x,
    y,
    visible: x >= -80 && x <= MAP_VIEWBOX.width + 80 && y >= -60 && y <= MAP_VIEWBOX.height + 60
  };
}

function getCurrentMapBounds() {
  return getMapBoundsForCenter(mapCenter, mapZoomLevel);
}

function getMapBoundsForCenter(center, zoomLevel) {
  const zoomScale = getMapZoomScale(zoomLevel);
  const latitudeSpan = (DEFAULT_MAP_BOUNDS.north - DEFAULT_MAP_BOUNDS.south) / zoomScale;
  const longitudeSpan = (DEFAULT_MAP_BOUNDS.east - DEFAULT_MAP_BOUNDS.west) / zoomScale;

  return {
    north: center.lat + latitudeSpan / 2,
    south: center.lat - latitudeSpan / 2,
    west: center.lon - longitudeSpan / 2,
    east: center.lon + longitudeSpan / 2
  };
}

function getMapCenterLimits(zoomLevel) {
  const zoomScale = getMapZoomScale(zoomLevel);
  const latitudeSpan = (DEFAULT_MAP_BOUNDS.north - DEFAULT_MAP_BOUNDS.south) / zoomScale;
  const longitudeSpan = (DEFAULT_MAP_BOUNDS.east - DEFAULT_MAP_BOUNDS.west) / zoomScale;

  return {
    minLat: DEFAULT_MAP_BOUNDS.south + latitudeSpan / 2,
    maxLat: DEFAULT_MAP_BOUNDS.north - latitudeSpan / 2,
    minLon: DEFAULT_MAP_BOUNDS.west + longitudeSpan / 2,
    maxLon: DEFAULT_MAP_BOUNDS.east - longitudeSpan / 2
  };
}

function clampMapCenter(center, zoomLevel = mapZoomLevel) {
  const limits = getMapCenterLimits(zoomLevel);

  return {
    lat: clamp(center.lat, limits.minLat, limits.maxLat),
    lon: clamp(center.lon, limits.minLon, limits.maxLon)
  };
}

function hasMapCenterChanged(a, b) {
  return Math.abs(a.lat - b.lat) > MAP_COORD_EPSILON || Math.abs(a.lon - b.lon) > MAP_COORD_EPSILON;
}

function getMapZoomScale(zoomLevel = mapZoomLevel) {
  return MAP_ZOOM_FACTOR ** zoomLevel;
}

function getOnlineMapZoom(zoomLevel = mapZoomLevel) {
  return BASE_ONLINE_MAP_ZOOM + zoomLevel;
}

function getRadarMapZoom(zoomLevel = mapZoomLevel) {
  return BASE_RADAR_ZOOM + zoomLevel;
}

function lonLatToTile(location, zoom) {
  const point = lonLatToWorldPixel(location, zoom);
  const tileCount = 2 ** zoom;

  return {
    x: Math.max(0, Math.min(tileCount - 1, Math.floor(point.x / WEB_MERCATOR_TILE_SIZE))),
    y: Math.max(0, Math.min(tileCount - 1, Math.floor(point.y / WEB_MERCATOR_TILE_SIZE)))
  };
}

function lonLatToWorldPixel(location, zoom) {
  const maxLatitude = 85.05112878;
  const latitude = Math.max(-maxLatitude, Math.min(maxLatitude, location.lat));
  const latitudeRadians = (latitude * Math.PI) / 180;
  const scale = WEB_MERCATOR_TILE_SIZE * 2 ** zoom;
  const sinLatitude = Math.sin(latitudeRadians);

  return {
    x: ((location.lon + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + sinLatitude) / (1 - sinLatitude)) / (4 * Math.PI)) * scale
  };
}

function worldPixelToLonLat(point, zoom) {
  const scale = WEB_MERCATOR_TILE_SIZE * 2 ** zoom;
  const lon = (point.x / scale) * 360 - 180;
  const latRadians = Math.atan(Math.sinh(Math.PI * (1 - (2 * point.y) / scale)));

  return {
    lat: (latRadians * 180) / Math.PI,
    lon
  };
}

function clamp(value, min, max) {
  if (min > max) {
    return (min + max) / 2;
  }
  return Math.max(min, Math.min(max, value));
}

function showMapTooltip(marker) {
  if (!marker?.report) {
    return;
  }

  const report = marker.report;
  els.mapTooltip.innerHTML = `
    <div class="popup-title">${report.name}</div>
    <div class="popup-grid">
      <span>Status</span><strong>${report.risk.label}</strong>
      <span>Now</span><strong>${formatRain(report.currentPrecip)} mm</strong>
      <span>Next 3h</span><strong>${formatRain(report.next3Total)} mm</strong>
      <span>Peak probability</span><strong>${Math.round(report.maxProbability)}%</strong>
    </div>
  `;
  const mapRect = document.querySelector("#map").getBoundingClientRect();
  const left = (marker.point.x / MAP_VIEWBOX.width) * mapRect.width;
  const top = (marker.point.y / MAP_VIEWBOX.height) * mapRect.height;
  els.mapTooltip.style.left = `${Math.min(Math.max(12, left + 18), mapRect.width - 278)}px`;
  els.mapTooltip.style.top = `${Math.min(Math.max(12, top - 8), mapRect.height - 142)}px`;
  els.mapTooltip.hidden = false;
}

function hideMapTooltip() {
  els.mapTooltip.hidden = true;
}

function getCurrentHourIndex(times) {
  const currentHour = getBangkokHourStamp();
  const index = times.findIndex((time) => time >= currentHour);
  return index >= 0 ? index : 0;
}

function getBangkokHourStamp() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23"
  }).formatToParts(new Date());
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${byType.year}-${byType.month}-${byType.day}T${byType.hour}:00`;
}

function formatBangkokTime(date, options = {}) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bangkok",
    ...options
  }).format(date);
}

function formatChartHour(time) {
  if (!time) {
    return "--";
  }
  return time.slice(11, 16);
}

function formatRain(value) {
  const safeValue = Number.isFinite(value) ? value : 0;
  return safeValue >= 10 ? safeValue.toFixed(0) : safeValue.toFixed(1);
}

function valueOrZero(value) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function numberAt(values, index) {
  return Array.isArray(values) ? valueOrZero(values[index]) : 0;
}

function sum(values) {
  return values.reduce((total, value) => total + valueOrZero(value), 0);
}

function describeWeather(code) {
  const descriptions = {
    0: "Clear",
    1: "Mainly clear",
    2: "Partly cloudy",
    3: "Overcast",
    45: "Fog",
    48: "Fog",
    51: "Drizzle",
    53: "Drizzle",
    55: "Drizzle",
    61: "Rain",
    63: "Rain",
    65: "Heavy rain",
    80: "Showers",
    81: "Showers",
    82: "Heavy showers",
    95: "Thunderstorm",
    96: "Thunderstorm",
    99: "Thunderstorm"
  };
  return descriptions[Number(code)] || "Weather";
}

function svgEl(name, attrs = {}, text = "") {
  const node = document.createElementNS("http://www.w3.org/2000/svg", name);
  Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
  if (text) {
    node.textContent = text;
  }
  return node;
}
