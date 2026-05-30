"use client";

import { useMemo, useRef, useState, useEffect } from "react";

type MapProperty = {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  rentalStatus?: string | null;
  unitCount?: number;
  primaryImageId?: string;
};

const TILE_SIZE = 256;
const MIN_ZOOM = 8;
const MAX_ZOOM = 17;

export function PropertyMap({ properties }: { properties: MapProperty[] }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ pointerId: number; x: number; y: number; centerPixel: { x: number; y: number } } | null>(null);
  const [size, setSize] = useState({ width: 900, height: 560 });
  const initialCenter = useMemo(() => centerOf(properties), [properties]);
  const [center, setCenter] = useState(initialCenter);
  const [zoom, setZoom] = useState(properties.length > 1 ? 10 : 14);
  const [selectedId, setSelectedId] = useState<string | null>(properties[0]?.id || null);

  useEffect(() => {
    setCenter(initialCenter);
    setZoom(properties.length > 1 ? 10 : 14);
    setSelectedId((current) => current && properties.some((property) => property.id === current) ? current : properties[0]?.id || null);
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
  const selectedProperty = properties.find((property) => property.id === selectedId) || null;

  function zoomBy(delta: number, event?: React.WheelEvent<HTMLDivElement>) {
    setZoom((currentZoom) => {
      const nextZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, currentZoom + delta));
      if (nextZoom === currentZoom || !event || !containerRef.current) return nextZoom;
      const rect = containerRef.current.getBoundingClientRect();
      const cursor = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      const beforeCenterPixel = project(center.latitude, center.longitude, currentZoom);
      const beforeTopLeft = { x: beforeCenterPixel.x - size.width / 2, y: beforeCenterPixel.y - size.height / 2 };
      const cursorWorldBefore = { x: beforeTopLeft.x + cursor.x, y: beforeTopLeft.y + cursor.y };
      const scale = 2 ** (nextZoom - currentZoom);
      const cursorWorldAfter = { x: cursorWorldBefore.x * scale, y: cursorWorldBefore.y * scale };
      const nextCenterPixel = { x: cursorWorldAfter.x - cursor.x + size.width / 2, y: cursorWorldAfter.y - cursor.y + size.height / 2 };
      setCenter(unproject(nextCenterPixel.x, nextCenterPixel.y, nextZoom));
      return nextZoom;
    });
  }

  function handleWheel(event: React.WheelEvent<HTMLDivElement>) {
    event.preventDefault();
    zoomBy(event.deltaY < 0 ? 1 : -1, event);
  }

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || !containerRef.current) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      centerPixel: project(center.latitude, center.longitude, zoom)
    };
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    setCenter(unproject(drag.centerPixel.x - dx, drag.centerPixel.y - dy, zoom));
  }

  function handlePointerUp(event: React.PointerEvent<HTMLDivElement>) {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
  }

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
          <p className="mt-1 text-sm text-muted">Karte verschieben, mit dem Mausrad zoomen und Pins fuer Details anklicken.</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="button-secondary grid h-10 w-10 place-items-center p-0" type="button" onClick={() => zoomBy(-1)}>-</button>
          <div className="rounded-md bg-white px-3 py-2 text-sm font-bold">Zoom {zoom}</div>
          <button className="button-secondary grid h-10 w-10 place-items-center p-0" type="button" onClick={() => zoomBy(1)}>+</button>
        </div>
      </div>
      <div
        ref={containerRef}
        className="relative h-[62vh] min-h-[440px] touch-none overflow-hidden bg-[#dce8e2] cursor-grab active:cursor-grabbing"
        onPointerCancel={handlePointerUp}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onWheel={handleWheel}
      >
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
          <button
            aria-label={`${pin.name} anzeigen`}
            className={`absolute z-10 -translate-x-1/2 -translate-y-full rounded-md px-3 py-2 text-left text-xs font-bold text-ink shadow-lg ring-2 transition hover:scale-[1.02] ${selectedId === pin.id ? "bg-accent text-white ring-white" : "bg-white ring-accent/20 hover:ring-accent"}`}
            key={pin.id}
            onClick={(event) => {
              event.stopPropagation();
              setSelectedId(pin.id);
            }}
            onPointerDown={(event) => event.stopPropagation()}
            style={{ left: pin.left, top: pin.top }}
            type="button"
          >
            <span className={`absolute -bottom-2 left-1/2 h-4 w-4 -translate-x-1/2 rotate-45 ring-2 ${selectedId === pin.id ? "bg-accent ring-white" : "bg-white ring-accent/20"}`} />
            <span className="relative block max-w-[190px] truncate">{pin.name}</span>
            <span className={`relative mt-1 block max-w-[190px] truncate font-medium ${selectedId === pin.id ? "text-white/80" : "text-muted"}`}>{pin.address}</span>
          </button>
        ))}
        {selectedProperty ? (
          <article
            className="absolute bottom-4 left-4 right-4 z-20 overflow-hidden rounded-lg border border-line bg-white shadow-xl sm:left-auto sm:w-[360px]"
            onPointerDown={(event) => event.stopPropagation()}
          >
            {selectedProperty.primaryImageId ? (
              <img className="h-36 w-full object-cover" src={`/api/documents/${selectedProperty.primaryImageId}/preview`} alt={`Hauptbild ${selectedProperty.name}`} />
            ) : (
              <div className="grid h-24 place-items-center bg-[linear-gradient(135deg,#ecfdf5,#eff6ff)] text-sm font-semibold text-muted">Noch kein Hauptbild</div>
            )}
            <div className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-bold">{selectedProperty.name}</h3>
                  <p className="mt-1 text-sm leading-5 text-muted">{selectedProperty.address || "Keine Adresse hinterlegt"}</p>
                </div>
                <button className="button-secondary h-8 w-8 shrink-0 p-0" type="button" onClick={() => setSelectedId(null)} aria-label="Objektkarte schliessen">×</button>
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold text-muted">
                {selectedProperty.rentalStatus ? <span className="rounded-full bg-panel px-3 py-1">{selectedProperty.rentalStatus}</span> : null}
                {typeof selectedProperty.unitCount === "number" ? <span className="rounded-full bg-panel px-3 py-1">{selectedProperty.unitCount} Einheiten</span> : null}
              </div>
              <a className="button mt-4 block text-center" href={`/properties/${selectedProperty.id}`}>Details öffnen</a>
            </div>
          </article>
        ) : null}
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

function unproject(x: number, y: number, zoom: number) {
  const scale = TILE_SIZE * 2 ** zoom;
  const longitude = x / scale * 360 - 180;
  const n = Math.PI - 2 * Math.PI * y / scale;
  const latitude = 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  return { latitude, longitude };
}
