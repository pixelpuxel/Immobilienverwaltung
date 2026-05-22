type ContractThumbnailProps = {
  id: string;
  title: string;
  compact?: boolean;
};

export function ContractThumbnail({ id, title, compact = false }: ContractThumbnailProps) {
  const sizeClass = compact ? "h-20 w-24" : "h-28 w-full sm:w-36";

  return (
    <a className={`${sizeClass} block shrink-0 overflow-hidden rounded-md border border-line bg-panel`} href={`/api/contracts/${id}/preview`} rel="noreferrer" target="_blank">
      <img src={`/api/contracts/${id}/thumbnail`} alt={`Vorschau ${title}`} className="h-full w-full object-cover" loading="lazy" />
    </a>
  );
}
