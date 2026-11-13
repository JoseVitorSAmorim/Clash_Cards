import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { mountGame } from "@/game/main";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    return mountGame(el);
  }, []);

  return (
    <main ref={ref} className="game-host">
      <p className="om-boot">Preparando a mesa…</p>
    </main>
  );
}
