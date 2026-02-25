import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Settings as SettingsIcon, ChevronDown } from "lucide-react";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface SettingsProps {
  appName: string;
}

interface AccordionItemProps {
  title: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

function AccordionItem({
  title,
  children,
  defaultOpen = false,
}: AccordionItemProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="rounded-md border-4 border-black bg-zinc-800 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between bg-zinc-800 p-6 text-left transition-colors hover:bg-zinc-700/50"
      >
        <span className="flex-1 text-center text-xl font-bold text-white uppercase flex items-center justify-center gap-2">
          {title}
        </span>
        <ChevronDown
          className={`size-6 text-white transition-transform duration-300 ${isOpen ? "rotate-180" : ""}`}
        />
      </button>

      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
          >
            <div className="flex flex-col border-t-4 border-black p-6 pt-2 text-center text-white space-y-4">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function Settings({ appName }: SettingsProps) {
  const [includeNonGames, setIncludeNonGames] = useState(false);

  useEffect(() => {
    // Load setting on mount
    const savedToggle = localStorage.getItem("include_non_games") !== "false";
    setIncludeNonGames(savedToggle);
  }, []);

  const handleToggle = (checked: boolean) => {
    setIncludeNonGames(checked);
    localStorage.setItem("include_non_games", checked.toString());
  };

  return (
    <div className="relative flex min-h-screen w-full flex-col bg-zinc-900 font-base text-foreground selection:bg-main selection:text-main-foreground">
      <Header appName={appName} />

      <main className="flex flex-1 flex-col items-center p-4 pt-24 pb-20">
        <h1 className="mb-12 text-2xl font-bold text-white uppercase text-center md:text-4xl shadow-retro">
          Settings
        </h1>

        <div className="w-full max-w-4xl space-y-6">
          {/* Main Info */}
          <AccordionItem
            title={
              <>
                <SettingsIcon /> <span>Search Preferences</span>
              </>
            }
            defaultOpen={true}
          >
            <div className="flex items-center justify-between p-4 bg-zinc-900 border-2 border-zinc-700 rounded-md">
              <div className="flex flex-col text-left">
                <span className="font-bold text-lg">
                  Include Non-Game Files
                </span>
                <span className="text-sm text-zinc-400">
                  Include matching files like Updates, DLC, Bios, and Manuals in
                  search results.
                </span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="includeNonGames"
                  className="w-5 h-5 rounded border-zinc-700 bg-zinc-800 text-main focus:ring-main focus:ring-offset-zinc-900 accent-main cursor-pointer"
                  checked={includeNonGames}
                  onChange={(e) => handleToggle(e.target.checked)}
                />
              </div>
            </div>
          </AccordionItem>
        </div>
      </main>

      <Footer />
    </div>
  );
}
