import { useEffect, useState } from "react";

interface Stats {
  total_files: number;
  files_with_metadata: number;
  indexed_documents: number;
  last_crawl_date: string | null;
}

export function Footer() {
  const [stats, setStats] = useState<Stats>({
    total_files: 0,
    files_with_metadata: 0,
    indexed_documents: 0,
    last_crawl_date: null,
  });

  useEffect(() => {
    fetch("/api/stats")
      .then((res) => res.json())
      .then((data) => {
        // Format the date if it's a valid date string
        const date = new Date(data.last_crawl_date);
        const formattedDate = !isNaN(date.getTime())
          ? date.toLocaleString()
          : data.last_crawl_date;

        setStats({
          ...data,
          last_crawl_date: formattedDate,
        });
      })
      .catch((err) => console.error("Failed to fetch stats:", err));
  }, []);

  return (
    <footer className="w-full p-2 text-center text-[10px] md:text-[13px] font-mono text-zinc-500">
      <p className="opacity-60">
        Known Files: {stats.total_files?.toLocaleString() ?? "—"} | With
        Metadata: {stats.files_with_metadata?.toLocaleString() ?? "—"} |
        Indexed: {stats.indexed_documents?.toLocaleString() ?? "—"} | Last
        Crawl: {stats.last_crawl_date ?? "Never"}
      </p>
    </footer>
  );
}
