import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import {
  ExternalLink,
  Heart,
  Info,
  Monitor,
  Bot,
  Github,
  ChevronDown,
} from "lucide-react";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface AboutProps {
  appName: string;
}

interface AccordionItemProps {
  title: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

interface AiConfig {
  enabled: boolean;
  provider: string | null;
  model: string | null;
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
            <div className="border-t-4 border-black p-6 pt-2 text-center">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function About({ appName }: AboutProps) {
  const [aiConfig, setAiConfig] = useState<AiConfig | null>(null);

  useEffect(() => {
    fetch("/api/ai-config")
      .then((r) => r.json())
      .then((d) => setAiConfig(d))
      .catch(() =>
        setAiConfig({ enabled: false, provider: null, model: null }),
      );
  }, []);

  return (
    <div className="relative flex min-h-screen w-full flex-col bg-zinc-900 font-base text-foreground selection:bg-main selection:text-main-foreground">
      <Header appName={appName} />

      <main className="flex flex-1 flex-col items-center p-4 pt-24 pb-20">
        <h1 className="mb-12 text-2xl font-bold text-white uppercase text-center md:text-4xl shadow-retro">
          About {appName}
        </h1>

        <div className="w-full max-w-4xl space-y-6">
          {/* Main Info */}
          <AccordionItem
            title={
              <>
                <Info /> <span>General Info</span>
              </>
            }
            defaultOpen={true}
          >
            <p className="mb-4 text-sm text-zinc-300 leading-relaxed">
              A search engine for{" "}
              <a
                href="https://myrient.erista.me/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-white hover:underline decoration-2 text-[#FFD700]"
              >
                Myrient
              </a>{" "}
              - a service by Erista dedicated to video game preservation.
            </p>
            <p className="mb-4 text-sm text-zinc-300 leading-relaxed">
              Myrient offers organized and publicly available video game
              collections, keeping them from becoming lost to time.
            </p>
            <div className="inline-block rounded bg-red-500/10 border border-red-500 px-3 py-1 mb-4">
              <p className="text-xs font-bold text-red-400">
                Not affiliated with Myrient/Erista!
              </p>
            </div>
            <p className="text-sm text-zinc-300 leading-relaxed flex items-center justify-center gap-2">
              If you like this project, please consider supporting Myrient:
            </p>
            <div className="flex items-center justify-center">
              <a
                href="https://myrient.erista.me/donate/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[#FFD700] hover:underline font-bold"
              >
                <Heart className="size-4" /> Donate
              </a>
            </div>
          </AccordionItem>

          {/* Metadata */}
          <AccordionItem title="Metadata Information">
            <p className="text-sm text-zinc-300 leading-relaxed">
              This website pulls metadata information about games from IGDB.
              Some metadata may be missing or incorrect due to mismatches
              between ROM name or problems with the service provider.
            </p>
          </AccordionItem>

          {/* Emulator */}
          <AccordionItem
            title={
              <>
                <Monitor className="size-6" /> Built-in Emulator
              </>
            }
          >
            <p className="mb-4 text-sm text-zinc-300 leading-relaxed">
              This website includes a built-in emulator powered by EmulatorJS
              that brings retro gaming directly to your browser.
            </p>
            <ul className="list-disc list-inside space-y-2 text-sm text-zinc-300 mb-4 pl-2">
              <li>
                Compatible games will feature a play button on their search
                result page.
              </li>
              <li>
                Games are loaded directly from Myrient's public archive. Save
                states are stored locally in the browser.
              </li>
            </ul>
            <p className="text-xs text-zinc-500 italic mb-4">
              For the best gaming experience, use a Chromium-based browser with
              hardware acceleration turned on.
            </p>
            <p className="text-xs text-zinc-500 italic">
              ROM hacks, soundtracks, and other non-game content are not
              supported by the emulator and may fail to load.
            </p>
          </AccordionItem>

          {/* AI Assistant */}
          <AccordionItem
            title={
              <>
                <Bot className="size-6" /> AI Assistant
              </>
            }
          >
            {aiConfig === null ? (
              <p className="text-sm text-zinc-500">Loading AI info…</p>
            ) : aiConfig.enabled ? (
              <>
                <p className="mb-4 text-sm text-zinc-300 leading-relaxed">
                  This website features an AI-powered assistant that can help
                  you find games, provide recommendations, and answer questions
                  about retro gaming.
                </p>
                <p className="mb-4 text-sm text-zinc-300 leading-relaxed">
                  Powered by{" "}
                  <span className="text-[#FFD700] font-bold">
                    {aiConfig.provider}
                  </span>{" "}
                  using the{" "}
                  <span className="font-mono text-xs bg-zinc-700 px-1 py-0.5 rounded text-white">
                    {aiConfig.model}
                  </span>{" "}
                  model.
                </p>
                <p className="text-xs text-zinc-500">
                  The AI assistant is powered by an external service. Please
                  refer to the service's privacy policy for more information.
                </p>
              </>
            ) : (
              <>
                <p className="mb-4 text-sm text-zinc-300 leading-relaxed">
                  The AI assistant is currently disabled on this instance.
                </p>
                <p className="text-sm text-zinc-500">
                  If you're self-hosting, you can enable it by setting{" "}
                  <span className="font-mono text-xs bg-zinc-700 px-1 py-0.5 rounded text-white">
                    AI_ENABLED=true
                  </span>{" "}
                  in your environment configuration.
                </p>
              </>
            )}
          </AccordionItem>

          {/* Credits */}
          <AccordionItem title="Credits">
            <div className="text-center border-b-2 border-zinc-700 pb-8 mb-8">
              <p className="text-xs text-zinc-500 uppercase mb-4">
                Maintainers
              </p>
              <div className="flex flex-wrap justify-center gap-8">
                <a
                  href="https://github.com/alexankitty"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-lg font-bold text-white hover:text-[#FFD700] transition-colors flex items-center gap-2"
                >
                  Alexankitty <ExternalLink className="size-4" />
                </a>
                <a
                  href="https://github.com/ovosimpatico"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-lg font-bold text-white hover:text-[#FFD700] transition-colors flex items-center gap-2"
                >
                  ovosimpatico <ExternalLink className="size-4" />
                </a>
              </div>
            </div>

            <div className="text-center mb-8">
              <h3 className="text-lg font-bold text-white mb-4">
                Contributors
              </h3>
              <div className="flex flex-col items-center gap-4 mb-6">
                <img
                  src={`/api/proxy-assets?url=${encodeURIComponent("https://contrib.rocks/image?repo=alexankitty/Myrient-Search-Engine")}`}
                  alt="Contributors 1"
                  className="max-w-full"
                />
                <img
                  src={`/api/proxy-assets?url=${encodeURIComponent("https://contrib.rocks/image?repo=Myrient-Search/Myrient-Search")}`}
                  alt="Contributors 2"
                  className="max-w-full"
                />
              </div>

              <a
                href="https://github.com/Myrient-Search/Myrient-Search"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 bg-zinc-700 hover:bg-zinc-600 text-white px-4 py-2 rounded border-2 border-black transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
              >
                <Github className="size-5" /> View Project on GitHub
              </a>
            </div>
          </AccordionItem>
        </div>
      </main>

      <Footer />
    </div>
  );
}
