export function StatCard({
  label,
  value,
  detail,
  icon = "•",
  tone = "emerald"
}: {
  label: string;
  value: string | number;
  detail?: string;
  icon?: string;
  tone?: "emerald" | "blue" | "violet" | "amber" | "rose" | "slate";
}) {
  const tones = {
    emerald: "from-emerald-500 to-teal-600",
    blue: "from-sky-500 to-blue-600",
    violet: "from-violet-500 to-fuchsia-600",
    amber: "from-amber-400 to-orange-500",
    rose: "from-rose-500 to-red-500",
    slate: "from-slate-500 to-zinc-600"
  };
  return (
    <div className="min-h-32 rounded-lg border border-line bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-2xl font-bold leading-tight sm:text-3xl">{value}</div>
          <div className="mt-1 text-sm font-semibold text-muted">{label}</div>
          {detail ? <div className="mt-2 text-xs text-muted">{detail}</div> : null}
        </div>
        <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-md bg-gradient-to-br ${tones[tone]} text-xs font-black text-white shadow-sm sm:h-11 sm:w-11 sm:text-sm`}>
          {icon}
        </div>
      </div>
    </div>
  );
}
