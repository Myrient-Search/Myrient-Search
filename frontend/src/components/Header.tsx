import { Globe } from "lucide-react";
import { Link } from "react-router-dom";
import { useState, useEffect } from "react";
import figlet from "figlet";
import small from "figlet/importable-fonts/Small.js";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface HeaderProps {
  appName: string;
}

export function Header({ appName }: HeaderProps) {
  const [headerLogo, setHeaderLogo] = useState("");

  useEffect(() => {
    figlet.parseFont("Small", small);

    figlet.text(
      appName,
      {
        font: "Small",
      },
      (err, data) => {
        if (err) return;
        setHeaderLogo(data || appName);
      },
    );
  }, [appName]);

  return (
    <header className="absolute top-0 left-0 z-10 flex w-full items-start justify-between p-4 md:p-6">
      <div className="flex flex-row items-center gap-6">
        {/* Header ASCII Logo */}
        <Link
          to="/"
          className="hidden md:block hover:opacity-80 transition-opacity"
        >
          <pre className="text-[0.4rem] leading-[0.5rem] font-mono text-white whitespace-pre select-none">
            {headerLogo}
          </pre>
        </Link>
        <nav>
          <ul className="flex gap-4 text-[10px] md:text-xs text-white">
            <li>
              <a href="#" className="hover:underline hover:decoration-2">
                Settings
              </a>
            </li>
            <li>
              <Link
                to="/emulators"
                className="hover:underline hover:decoration-2"
              >
                Emulators
              </Link>
            </li>
            <li>
              <Link to="/about" className="hover:underline hover:decoration-2">
                About
              </Link>
            </li>
          </ul>
        </nav>
      </div>

      <div className="w-[120px]">
        <Select defaultValue="en">
          <SelectTrigger className="bg-zinc-800 text-white border-zinc-700 h-7 text-[10px]">
            <div className="flex items-center gap-2">
              <Globe className="size-3" />
              <SelectValue placeholder="Language" />
            </div>
          </SelectTrigger>
          <SelectContent className="bg-zinc-800 text-white border-zinc-700">
            <SelectItem value="en">English</SelectItem>
            <SelectItem value="es">Español</SelectItem>
            <SelectItem value="fr">Français</SelectItem>
            <SelectItem value="de">Deutsch</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </header>
  );
}
