import { useEffect, useState } from "react";

interface Stats {
  total_queries: number;
  total_files: number;
  files_with_metadata: number;
  last_crawl_date: string;
}

export function Footer() {
  const [stats, setStats] = useState<Stats>({
    total_queries: 0,
    total_files: 0,
    files_with_metadata: 0,
    last_crawl_date: "Loading...",
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
        Number of Queries: {stats.total_queries.toLocaleString()} | Known Files:{" "}
        {stats.total_files.toLocaleString()} | Files with Metadata:{" "}
        {stats.files_with_metadata.toLocaleString()} | Time of Last Crawl:{" "}
        {stats.last_crawl_date}
      </p>
    </footer>
  );
}
