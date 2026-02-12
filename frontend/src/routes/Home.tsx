import { Bot } from "lucide-react";
import { useState, useEffect } from "react";
import figlet from "figlet";
import big from "figlet/importable-fonts/Big.js";
import { useDebounce } from "use-debounce";
import { motion } from "framer-motion";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { GameCard } from "@/components/GameCard";

interface HomeProps {
  appName: string;
}

interface Game {
  id: string;
  game_name: string;
  release_date: string;
  images: string[] | null;
  // other props...
}

export default function Home({ appName }: HomeProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery] = useDebounce(searchQuery, 300);
  const [asciiLogo, setAsciiLogo] = useState("");
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(false);

  // Ascii Effect
  useEffect(() => {
    figlet.parseFont("Big", big);
    figlet.text(appName, { font: "Big" }, (err, data) => {
      if (!err) setAsciiLogo(data || appName);
    });
  }, [appName]);

  // Search Logic
  useEffect(() => {
    if (!debouncedQuery) {
      setGames([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    fetch(`/api/search?q=${debouncedQuery}&limit=100`)
      .then((res) => res.json())
      .then((data) => {
        setGames(data.results || []);
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setLoading(false);
      });
  }, [debouncedQuery]);

  // Grouping Logic
  const groupedGames = games.reduce(
    (acc, game) => {
      if (!acc[game.game_name]) {
        acc[game.game_name] = [];
      }
      acc[game.game_name].push(game);
      return acc;
    },
    {} as Record<string, Game[]>,
  );

  const displayedGroups = Object.values(groupedGames);

  return (
    <div className="relative flex min-h-screen w-full flex-col bg-zinc-900 font-base text-foreground selection:bg-main selection:text-main-foreground">
      <Header appName={appName} />

      <main
        className={`flex flex-1 flex-col items-center p-4 transition-all duration-500 ease-in-out ${displayedGroups.length > 0 ? "justify-start pt-20" : "justify-center pb-32"}`}
      >
        {/* Logo & Search Section */}
        <motion.div
          layout
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          className="mb-8 flex flex-col items-center text-center w-full max-w-4xl"
        >
          <pre className="mb-6 text-[0.4rem] leading-[0.4rem] md:text-[0.6rem] md:leading-[0.6rem] lg:text-[0.8rem] lg:leading-[0.8rem] font-mono text-white whitespace-pre select-none">
            {asciiLogo}
          </pre>

          <Input
            placeholder="Search..."
            className="h-12 w-full max-w-xl border-4 text-sm md:text-base placeholder:text-zinc-500 bg-zinc-800 text-white border-zinc-700 focus:border-white mb-8"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </motion.div>

        {/* Gallery Grid */}
        {displayedGroups.length > 0 && (
          <motion.div
            layout
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="grid w-full max-w-6xl grid-cols-2 gap-6 gap-y-10 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6"
          >
            {displayedGroups.map((group) => (
              <GameCard key={group[0].id} games={group} />
            ))}
          </motion.div>
        )}

        {loading && <p className="mt-8 text-white">Loading...</p>}
        {!loading && debouncedQuery && displayedGroups.length === 0 && (
          <p className="mt-8 text-zinc-500">No games found.</p>
        )}
      </main>

      <Footer />

      <Button
        variant="default"
        size="icon"
        className="fixed right-4 bottom-4 z-50 h-12 w-12 rounded-full border-2 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:shadow-none bg-[#FFD700] text-black"
      >
        <Bot className="size-6" />
      </Button>
    </div>
  );
}
