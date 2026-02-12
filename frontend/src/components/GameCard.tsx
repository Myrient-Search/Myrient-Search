import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import { X } from "lucide-react";

export interface Game {
  id: string;
  game_name: string;
  release_date: string;
  images: string[] | null;
  region?: string;
  videogame?: string; // Platform
}

interface GameCardProps {
  games: Game[];
}

export function GameCard({ games }: GameCardProps) {
  const [isOpen, setIsOpen] = useState(false);

  if (!games || games.length === 0) return null;

  const mainGame = games[0];
  const count = games.length;
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
        onClick={() => count > 1 && setIsOpen(true)}
      >
        {/* Stack Effect Backgrounds - Visual Only */}
        {count > 1 && (
          <>
            <div className="absolute top-0 left-0 h-full w-full rotate-[-3deg] rounded-md border-2 border-black bg-zinc-700 opacity-60 transition-transform group-hover:rotate-[-6deg]"></div>
            <div className="absolute top-0 left-0 h-full w-full rotate-[3deg] rounded-md border-2 border-black bg-zinc-800 opacity-80 transition-transform group-hover:rotate-[6deg]"></div>
          </>
        )}

        {/* Main Card */}
        <motion.div
          layoutId={`card-${mainGame.id}`}
          className="relative flex w-full flex-col overflow-hidden rounded-md border-4 border-black bg-zinc-800 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-transform hover:-translate-y-1 hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] z-10"
        >
          <div className="aspect-[2/3] w-full overflow-hidden bg-zinc-900">
            <img
              src={image}
              alt={mainGame.game_name}
              className="h-full w-full object-cover"
              loading="lazy"
            />
          </div>

          <div className="flex flex-col p-3">
            <h3 className="line-clamp-2 text-[9px] font-bold uppercase text-white md:text-xs">
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
        </motion.div>
      </div>

      <AnimatePresence>
        {isOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
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
                    className="min-w-[200px] max-w-[220px] flex-shrink-0 flex flex-col overflow-hidden rounded-md border-4 border-black bg-zinc-800 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]"
                  >
                    <div className="aspect-[2/3] w-full overflow-hidden bg-zinc-900">
                      <img
                        src={
                          game.images && game.images.length > 0
                            ? game.images[0]
                            : "https://placehold.co/400x600?text=No+Image"
                        }
                        alt={game.game_name}
                        className="h-full w-full object-cover"
                      />
                    </div>
                    <div className="p-3 bg-zinc-800">
                      <h3 className="line-clamp-2 text-xs font-bold uppercase text-white mb-2">
                        {game.game_name}
                      </h3>
                      <div className="flex flex-wrap gap-1">
                        {game.region && (
                          <span className="inline-block px-2 py-0.5 bg-zinc-600 text-white text-[8px] rounded resize-none">
                            {game.region}
                          </span>
                        )}
                        {game.videogame && (
                          <span className="inline-block px-2 py-0.5 bg-zinc-700 text-zinc-300 text-[8px] rounded">
                            {game.videogame}
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
