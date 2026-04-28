import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import {
  Settings as SettingsIcon,
  ChevronDown,
  Globe,
  ShieldAlert,
  Wifi,
} from "lucide-react";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  detectCountry,
  flagUrl,
  isP2PEnabled,
  setP2PEnabled,
  hasAckedRiskyCountry,
  setAckedRiskyCountry,
  type GeoResult,
} from "@/lib/geo";

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
  const [p2p, setP2p] = useState(false);
  const [geo, setGeo] = useState<GeoResult | null>(null);
  const [showRiskyConfirm, setShowRiskyConfirm] = useState(false);

  useEffect(() => {
    const savedToggle = localStorage.getItem("include_non_games") !== "false";
    setIncludeNonGames(savedToggle);
    setP2p(isP2PEnabled());
    detectCountry().then(setGeo).catch(() => setGeo(null));
  }, []);

  const handleToggle = (checked: boolean) => {
    setIncludeNonGames(checked);
    localStorage.setItem("include_non_games", checked.toString());
  };

  const handleP2PToggle = (checked: boolean) => {
    if (!checked) {
      setP2p(false);
      setP2PEnabled(false);
      return;
    }
    if (geo?.isRisky && !hasAckedRiskyCountry()) {
      setShowRiskyConfirm(true);
      return;
    }
    setP2p(true);
    setP2PEnabled(true);
  };

  const acceptRiskyAndEnable = () => {
    setAckedRiskyCountry(true);
    setP2p(true);
    setP2PEnabled(true);
    setShowRiskyConfirm(false);
  };

  return (
    <div className="relative flex min-h-screen w-full flex-col bg-zinc-900 font-base text-foreground selection:bg-main selection:text-main-foreground">
      <Header appName={appName} />

      <main className="flex flex-1 flex-col items-center p-4 pt-24 pb-20">
        <h1 className="mb-12 text-2xl font-bold text-white uppercase text-center md:text-4xl shadow-retro">
          Settings
        </h1>

        <div className="w-full max-w-4xl space-y-6">
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

          <AccordionItem
            title={
              <>
                <Wifi /> <span>Download Mode</span>
              </>
            }
            defaultOpen={p2p}
          >
            <div className="flex items-center justify-between p-4 bg-zinc-900 border-2 border-zinc-700 rounded-md">
              <div className="flex flex-col text-left flex-1">
                <span className="font-bold text-lg">Browser Mode</span>
                <span className="text-sm text-zinc-400">
                  Off by default. When on, downloads and the web emulator
                  pull files directly from BitTorrent peers in your browser
                  instead of going through this server.
                </span>
                <span className="text-xs text-zinc-500 mt-1.5">
                  Browser Mode can be faster in some situations, but it's
                  more error-prone and unsafe — see the{" "}
                  <a
                    href="/about"
                    className="underline decoration-dotted text-zinc-300 hover:text-white"
                  >
                    About page
                  </a>{" "}
                  for details.
                </span>
              </div>
              <div className="flex items-center gap-2 ml-4">
                <input
                  type="checkbox"
                  id="directP2P"
                  className="w-5 h-5 rounded border-zinc-700 bg-zinc-800 text-main focus:ring-main focus:ring-offset-zinc-900 accent-main cursor-pointer"
                  checked={p2p}
                  onChange={(e) => handleP2PToggle(e.target.checked)}
                />
              </div>
            </div>

            {geo?.country && (
              <div className="flex items-center gap-3 text-left p-3 border-2 border-zinc-700 bg-zinc-900 rounded-md text-sm text-zinc-300">
                {flagUrl(geo.country, 40) ? (
                  <img
                    src={flagUrl(geo.country, 40) as string}
                    alt={geo.countryName ?? geo.country}
                    className="w-10 h-7 object-cover border border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] flex-shrink-0"
                    loading="lazy"
                  />
                ) : (
                  <Globe className="size-5 text-zinc-500" />
                )}
                <div>
                  <span className="text-[10px] uppercase font-bold tracking-wide text-zinc-500">
                    Detected location
                  </span>
                  <div className="font-mono text-zinc-100">
                    {geo.countryName}{" "}
                    <span className="text-zinc-500">({geo.country})</span>
                  </div>
                </div>
              </div>
            )}
          </AccordionItem>
        </div>
      </main>

      <Footer />

      {/* Risky-country confirm dialog */}
      <AnimatePresence>
        {showRiskyConfirm && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/80"
              onClick={() => setShowRiskyConfirm(false)}
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 12 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 12 }}
              className="relative z-10 w-full max-w-xl border-4 border-black bg-zinc-900 shadow-[12px_12px_0px_0px_rgba(0,0,0,1)] overflow-hidden"
            >
              <header className="bg-red-600 text-white px-5 py-3 border-b-4 border-black flex items-center gap-2">
                <ShieldAlert className="size-6" />
                <h2 className="text-xl font-black uppercase">
                  Hold up — read this first
                </h2>
              </header>
              <div className="p-5 text-zinc-200 space-y-3 text-sm">
                <div className="flex items-center gap-4 bg-red-950/40 border-2 border-red-700 p-3">
                  {geo?.country && flagUrl(geo.country, 80) ? (
                    <img
                      src={flagUrl(geo.country, 80) as string}
                      alt={geo.countryName ?? geo.country}
                      className="w-20 h-14 object-cover border-2 border-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] flex-shrink-0"
                    />
                  ) : null}
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] uppercase font-bold text-red-300 tracking-wide">
                      Connecting from
                    </p>
                    <p className="text-lg font-black text-white truncate">
                      {geo?.countryName}{" "}
                      <span className="text-red-300 font-mono text-base">
                        ({geo?.country})
                      </span>
                    </p>
                  </div>
                </div>
                <p className="text-base font-bold text-red-200">
                  This country has active anti-piracy enforcement.
                </p>
                <p className="text-zinc-300">{geo?.warning}</p>
                <p className="text-zinc-400 italic text-xs">
                  Enabling Browser Mode exposes your real IP to every peer in
                  the swarm. Use a reputable VPN <em>before</em> turning this
                  on, or stick with Normal Mode — the server talks to the
                  swarm on your behalf so peers only see the server's IP.
                </p>
                <div className="border-2 border-zinc-700 bg-zinc-800 p-3 mt-2 space-y-1">
                  <p className="text-xs uppercase font-bold text-zinc-400">
                    Suggested VPN providers (no affiliation)
                  </p>
                  <p className="text-xs text-zinc-400">
                    Mullvad, IVPN, ProtonVPN, AirVPN — pick one with a verified
                    no-logs policy and a kill switch.
                  </p>
                </div>
              </div>
              <footer className="flex justify-end gap-2 px-5 pb-5">
                <button
                  onClick={() => setShowRiskyConfirm(false)}
                  className="border-2 border-black bg-white text-black px-4 py-2 text-xs font-bold uppercase shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none transition-all"
                >
                  Keep it off
                </button>
                <button
                  onClick={acceptRiskyAndEnable}
                  className="border-2 border-black bg-red-600 hover:bg-red-700 text-white px-4 py-2 text-xs font-bold uppercase shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none transition-all"
                >
                  I understand — enable anyway
                </button>
              </footer>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
