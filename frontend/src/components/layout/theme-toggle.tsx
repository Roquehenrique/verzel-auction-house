"use client";

import { setThemePreference, useThemePreference, type ThemePreference } from "@/lib/theme";

const options: Array<{ value: ThemePreference; label: string; icon: string }> = [
  { value: "light", label: "Tema claro", icon: "☀" },
  { value: "dark", label: "Tema escuro", icon: "☾" },
  { value: "system", label: "Tema do sistema", icon: "◐" },
];

// Light / dark / follow the operating system.
export function ThemeToggle() {
  const preference = useThemePreference();
  return (
    <div role="radiogroup" aria-label="Tema" className="flex rounded-md bg-navy-800 p-0.5">
      {options.map((option) => {
        const selected = preference === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={option.label}
            title={option.label}
            onClick={() => setThemePreference(option.value)}
            className={`grid size-7 place-items-center rounded text-sm transition-colors ${
              selected ? "bg-lime-500 text-navy-950" : "text-white/70 hover:text-white"
            }`}
          >
            {option.icon}
          </button>
        );
      })}
    </div>
  );
}
