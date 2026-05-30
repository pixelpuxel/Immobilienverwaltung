"use client";

import { useMemo, useRef, useState, useEffect } from "react";

type MapProperty = {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  rentalStatus?: string | null;
};

const TILE_SIZE = 256;
const MIN_ZOOM = 8;
const MAX_ZOOM = 17;

export function PropertyMap({ properties }: { properties: MapProperty[] }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ width: 900, height: 560 });
  const initialCenter = useMemo(() => centerOf(properties), [properties]);
  const [center, setCenter] = useState(initialCenter);
  const [zoom, setZoom] = useState(properties.length > 1 ? 10 : 14);

  useEffect(() => {
    setCenter(initialCenter);
    setZoom(properties.length > 1 ? 10 : 14);
  }, [initialCenter, properties.length]);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver(([entry]) => {
      const rect = entry.contentRect;
      setSize({ width: Math.max(320, rect.width), height: Math.max(420, rect.height) });
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const view = useMemo(() => buildView(properties, center, zoom, size), [properties, center, zoom, size]);

  if (!properties.length) {
    return (
      <div className="grid min-h-[420px] place-items-center rounded-lg border border-line bg-panel p-6 text-center text-muted">
        Für die vorhandenen Immobilien sind noch keine Koordinaten hinterlegt.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-line bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-[linear-gradient(90deg,#ecfdf5,#eff6ff)] p-4">
        <div>
          <h2 className="text-xl font-bold">Immobilienkarte</h2>
          <p className="mt-1 text-sm text-muted">Pins anklicken, um direkt zur Immobilie zu springen.</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="button-secondary grid h-10 w-10 place-items-center p-0" type="button" onClick={() => setZoom((value) => Math.max(MIN_ZOOM, value - 1))}>-</button>
          <div className="rounded-md bg-white px-3 py-2 text-sm font-bold">Zoom {zoom}</div>
          <button className="button-secondary grid h-10 w-10 place-items-center p-0" type="button" onClick={() => setZoom((value) => Math.min(MAX_ZOOM, value + 1))}>+</button>
        </div>
      </div>
      <div ref={containerRef} className="relative h-[62vh] min-h-[440px] overflow-hidden bg-[#dce8e2]">
        {view.tiles.map((tile) => (
          <img
            alt=""
            className="absolute h-64 w-64 select-none"
            draggable={false}
            key={`${tile.z}-${tile.x}-${tile.y}`}
            src={`https://tile.openstreetmap.org/${tile.z}/${tile.x}/${tile.y}.png`}
            style={{ left: tile.left, top: tile.top }}
          />
        ))}
        <div className="absolute left-4 top-4 rounded-md bg-white/95 px-3 py-2 text-xs font-semibold text-muted shadow-sm">
          © OpenStreetMap-Mitwirkende
        </div>
        {view.pins.map((pin) => (
          <a
            aria-label={`${pin.name} öffnen`}
            className="absolute z-10 -translate-x-1/2 -translate-y-full rounded-md bg-white px-3 py-2 text-xs font-bold text-ink shadow-lg ring-2 ring-accent/20 transition hover:scale-[1.02] hover:ring-accent"
            href={`/properties/${pin.id}`}
            key={pin.id}
            style={{ left: pin.left, top: pin.top }}
          >
            <span className="absolute -bottom-2 left-1/2 h-4 w-4 -translate-x-1/2 rotate-45 bg-white ring-2 ring-accent/20" />
            <span className="relative block max-w-[190px] truncate">{pin.name}</span>
            <span className="relative mt-1 block max-w-[190px] truncate font-medium text-muted">{pin.address}</span>
          </a>
        ))}
      </div>
    </div>
  );
}

function centerOf(properties: MapProperty[]) {
  if (!properties.length) return { latitude: 47.66, longitude: 9.17 };
  return {
    latitude: properties.reduce((sum, property) => sum + property.latitude, 0) / properties.length,
    longitude: properties.reduce((sum, property) => sum + property.longitude, 0) / properties.length
  };
}

function buildView(properties: MapProperty[], center: { latitude: number; longitude: number }, zoom: number, size: { width: number; height: number }) {
  const centerPixel = project(center.latitude, center.longitude, zoom);
  const topLeft = { x: centerPixel.x - size.width / 2, y: centerPixel.y - size.height / 2 };
  const minTileX = Math.floor(topLeft.x / TILE_SIZE) - 1;
  const maxTileX = Math.floor((topLeft.x + size.width) / TILE_SIZE) + 1;
  const minTileY = Math.floor(topLeft.y / TILE_SIZE) - 1;
  const maxTileY = Math.floor((topLeft.y + size.height) / TILE_SIZE) + 1;
  const tileLimit = 2 ** zoom;
  const tiles: Array<{ x: number; y: number; z: number; left: number; top: number }> = [];

  for (let x = minTileX; x <= maxTileX; x += 1) {
    for (let y = minTileY; y <= maxTileY; y += 1) {
      if (y < 0 || y >= tileLimit) continue;
      const wrappedX = ((x % tileLimit) + tileLimit) % tileLimit;
      tiles.push({ x: wrappedX, y, z: zoom, left: x * TILE_SIZE - topLeft.x, top: y * TILE_SIZE - topLeft.y });
    }
  }

  const pins = properties.map((property) => {
    const pixel = project(property.latitude, property.longitude, zoom);
    return {
      ...property,
      left: pixel.x - topLeft.x,
      top: pixel.y - topLeft.y
    };
  });

  return { tiles, pins };
}

function project(latitude: number, longitude: number, zoom: number) {
  const sin = Math.sin(latitude * Math.PI / 180);
  const scale = TILE_SIZE * 2 ** zoom;
  return {
    x: (longitude + 180) / 360 * scale,
    y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale
  };
}
