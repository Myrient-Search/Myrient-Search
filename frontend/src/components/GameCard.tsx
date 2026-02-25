import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect } from "react";
import {
  X,
  Globe,
  FlaskConical,
  Flag,
  Calendar,
  FileText,
  HardDrive,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

// Cache to prevent multiple fetches across GameCard instances
let cachedConsoleIcons: Record<string, string> | null = null;

export interface Game {
  id: string;
  game_name: string;
  release_date: string;
  images: string[] | null;
  region?: string;
  platform?: string;
  filename?: string;
  size?: string;
  download_url?: string;
}

interface GameCardProps {
  games: Game[];
}

export function GameCard({ games }: GameCardProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [consoleIcons, setConsoleIcons] = useState<Record<string, string>>({});
  const navigate = useNavigate();

  useEffect(() => {
    if (cachedConsoleIcons) {
      setConsoleIcons(cachedConsoleIcons);
      return;
    }
    fetch("/api/emulators")
      .then((res) => res.json())
      .then((data) => {
        const icons: Record<string, string> = {};
        Object.entries(data).forEach(([key, val]: [string, any]) => {
          icons[key] = val.icon;
        });
        cachedConsoleIcons = icons;
        setConsoleIcons(icons);
      })
      .catch((err) => console.error("Failed to load console icons", err));
  }, []);

  if (!games || games.length === 0) return null;

  const count = games.length;
  const hasMultipleVersions = count > 1;
  const showRegion =
    hasMultipleVersions && games.some((g) => g.region !== games[0].region);
  const showDate =
    hasMultipleVersions &&
    games.some((g) => g.release_date !== games[0].release_date);
  const showSize =
    hasMultipleVersions && games.some((g) => g.size !== games[0].size);

  const renderRegion = (region?: string) => {
    if (!region) return null;
    const r = region.toUpperCase();

    let flagCode = "";
    let icon = null;

    if (r === "USA") flagCode = "us";
    else if (r.startsWith("EUR")) flagCode = "eu";
    else if (r.startsWith("JPN") || r.startsWith("JAP")) flagCode = "jp";
    else if (r === "KOR" || r === "KOREA") flagCode = "kr";
    else if (r === "CHN" || r === "CHINA") flagCode = "cn";
    else if (r === "WLD" || r === "WORLD")
      icon = <Globe className="w-3.5 h-3.5" />;
    else if (r === "BETA") icon = <FlaskConical className="w-3.5 h-3.5" />;

    return (
      <span className="flex items-center gap-1.5 uppercase leading-none">
        {flagCode ? (
          <img
            src={`https://flagcdn.com/w20/${flagCode}.png`}
            alt={r}
            className="w-[16px] h-[11px] object-cover rounded-[2px] shadow-sm"
          />
        ) : (
          <span className="flex items-center justify-center">
            {icon || <Flag className="w-3.5 h-3.5" />}
          </span>
        )}
        <span>{r === "BETA" ? "Beta" : region}</span>
      </span>
    );
  };

  const mainGame = games[0];
  const year = mainGame.release_date
    ? new Date(mainGame.release_date).getFullYear()
    : "N/A";
  const image =
    mainGame.images && mainGame.images.length > 0
      ? mainGame.images[0]
      : "https://placehold.co/400x600?text=No+Image";

  return (
    <>
      <div
        className="group relative flex flex-col items-center cursor-pointer"
        onClick={() => {
          if (count > 1) {
            setIsOpen(true);
          } else {
            navigate(`/game/${mainGame.id}`);
          }
        }}
      >
        {/* Stack Effect Backgrounds - Visual Only */}
        {count > 1 && (
          <>
            <div className="absolute top-0 left-0 h-full w-full rotate-[-3deg] rounded-md border-2 border-black bg-zinc-700 opacity-60 transition-transform group-hover:rotate-[-6deg]"></div>
            <div className="absolute top-0 left-0 h-full w-full rotate-[3deg] rounded-md border-2 border-black bg-zinc-800 opacity-80 transition-transform group-hover:rotate-[6deg]"></div>
          </>
        )}

        {/* Main Card */}
        <div className="relative flex w-full flex-col overflow-hidden rounded-md border-4 border-black bg-zinc-800 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-transform hover:-translate-y-1 hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] z-10">
          <div className="relative aspect-[2/3] w-full overflow-hidden bg-zinc-900">
            <img
              src={image}
              alt={mainGame.game_name}
              className="h-full w-full object-cover"
              loading="lazy"
            />
            {mainGame.platform && (
              <div className="absolute inset-x-0 bottom-0 bg-black/75 p-1 text-center">
                <span className="text-[9px] font-bold text-white uppercase break-words leading-tight">
                  {mainGame.platform}
                </span>
              </div>
            )}
          </div>

          <div className="flex flex-col p-3">
            <h3 className="text-[7px] font-bold uppercase text-white md:text-[8px] line-clamp-2 overflow-hidden text-ellipsis leading-tight break-words">
              {mainGame.game_name}
            </h3>
            <div className="mt-2 flex items-center justify-between text-[9px] text-zinc-400">
              <span>{year}</span>
              {count > 1 && (
                <span className="rounded-sm bg-[#FFD700] px-1.5 py-0.5 text-black font-bold">
                  {count}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {isOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="absolute inset-0 bg-black/50"
              onClick={(e) => {
                e.stopPropagation();
                setIsOpen(false);
              }}
            />

            <div className="relative z-10 w-full max-w-5xl overflow-x-auto">
              <div className="flex gap-6 p-4">
                {games.map((game, index) => (
                  <motion.div
                    key={game.id}
                    initial={{ opacity: 0, x: -20, rotate: -5 }}
                    animate={{ opacity: 1, x: 0, rotate: 0 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={{ delay: index * 0.05 }}
                    onClick={() => {
                      setIsOpen(false);
                      navigate(`/game/${game.id}`);
                    }}
                    className="min-w-[200px] max-w-[220px] flex-shrink-0 flex flex-col overflow-hidden rounded-md border-4 border-black bg-zinc-800 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] cursor-pointer hover:shadow-[12px_12px_0px_0px_rgba(0,0,0,1)] hover:-translate-y-1 transition-all"
                  >
                    <div className="aspect-[2/3] w-full overflow-hidden bg-zinc-900 relative group/img">
                      <img
                        src={
                          game.images && game.images.length > 0
                            ? game.images[0]
                            : "https://placehold.co/400x600?text=No+Image"
                        }
                        alt={game.game_name}
                        className="h-full w-full object-cover group-hover/img:scale-105 transition-transform duration-300"
                      />
                    </div>
                    <div className="p-3 bg-zinc-800">
                      <h3 className="text-[8px] font-bold uppercase text-white mb-2 line-clamp-2 overflow-hidden text-ellipsis leading-tight break-words">
                        {game.game_name}
                      </h3>
                      <div className="flex flex-wrap gap-2">
                        {showRegion && game.region && (
                          <span
                            className="inline-flex items-center px-2 py-1 bg-white text-black text-[13px] rounded-sm font-bold border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
                            title="Region"
                          >
                            {renderRegion(game.region)}
                          </span>
                        )}
                        {showDate && game.release_date && (
                          <span
                            className="inline-flex items-center gap-1.5 px-2 py-1 bg-[#ff5e5e] text-black text-[13px] rounded-sm font-bold border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
                            title="Release Date"
                          >
                            <Calendar className="w-4 h-4 shrink-0" />{" "}
                            {game.release_date}
                          </span>
                        )}
                        {showSize && game.size && (
                          <span
                            className="inline-flex items-center gap-1.5 px-2 py-1 bg-[#a855f7] text-white text-[13px] rounded-sm font-bold border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
                            title="File Size"
                          >
                            <HardDrive className="w-4 h-4 shrink-0" />{" "}
                            {game.size}
                          </span>
                        )}
                        {game.filename && (
                          <span
                            className="inline-flex w-full items-start gap-1.5 px-2 py-1 bg-white text-black text-[11px] rounded-sm font-bold border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] break-all whitespace-normal text-left leading-tight"
                            title="Filename"
                          >
                            <FileText className="w-3.5 h-3.5 shrink-0 mt-[1px]" />
                            <span>{game.filename}</span>
                          </span>
                        )}
                        {game.platform && (
                          <span
                            className="inline-flex w-full items-center justify-center gap-2 px-3 py-2 mt-1 bg-[#FFD700] text-black text-[14px] rounded-sm font-black uppercase border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]"
                            title="Platform"
                          >
                            {consoleIcons[game.platform] && (
                              <img
                                src={`/api/proxy-assets?url=${encodeURIComponent(consoleIcons[game.platform])}`}
                                alt={game.platform}
                                className="h-5 w-5 object-contain drop-shadow-md"
                              />
                            )}
                            {game.platform}
                          </span>
                        )}
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>

              <button
                onClick={() => setIsOpen(false)}
                className="absolute top-0 right-0 p-2 text-white hover:text-red-500"
              >
                <X className="size-8" />
              </button>
            </div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
