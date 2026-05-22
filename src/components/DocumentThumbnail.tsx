type DocumentThumbnailProps = {
  id: string;
  title: string;
  mimeType: string;
  hasFile: boolean;
  compact?: boolean;
};

export function DocumentThumbnail({ id, title, mimeType, hasFile, compact = false }: DocumentThumbnailProps) {
  const previewUrl = `/api/documents/${id}/preview`;
  const thumbnailUrl = `/api/documents/${id}/thumbnail`;
  const sizeClass = compact ? "h-20 w-24" : "h-28 w-full sm:w-36";

  if (!hasFile) {
    return (
      <div className={`${sizeClass} grid shrink-0 place-items-center rounded-md border border-line bg-panel px-3 text-center text-xs text-muted`}>
        Keine Datei
      </div>
    );
  }

  return (
    <a className={`${sizeClass} block shrink-0 overflow-hidden rounded-md border border-line bg-panel`} href={previewUrl} rel="noreferrer" target="_blank">
      <img src={thumbnailUrl} alt={`Vorschau ${title}`} className="h-full w-full object-cover" loading="lazy" />
    </a>
  );
}
