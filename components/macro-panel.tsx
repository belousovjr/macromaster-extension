import * as React from "react";
import { GripHorizontal, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { closeActiveProject, type MacroProject } from "@/lib/projects";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "macromaster:panel-bounds";
const MIN_WIDTH = 300;
const MAX_WIDTH = 560;
const MIN_HEIGHT = 220;
const MAX_HEIGHT = 720;
const EDGE_GAP = 12;

type Bounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type Interaction =
  | {
      type: "drag";
      pointerX: number;
      pointerY: number;
      start: Bounds;
    }
  | {
      type: "resize";
      pointerX: number;
      pointerY: number;
      start: Bounds;
    };

function getDefaultBounds(): Bounds {
  const width = 360;
  const height = 420;

  return clampBounds({
    x: window.innerWidth - width - 32,
    y: 80,
    width,
    height,
  });
}

function getStoredBounds(): Bounds {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return getDefaultBounds();

    return clampBounds(JSON.parse(stored) as Bounds);
  } catch {
    return getDefaultBounds();
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function clampBounds(bounds: Bounds): Bounds {
  const viewportWidth = Math.max(window.innerWidth, MIN_WIDTH + EDGE_GAP * 2);
  const viewportHeight = Math.max(
    window.innerHeight,
    MIN_HEIGHT + EDGE_GAP * 2,
  );
  const width = clamp(
    bounds.width,
    MIN_WIDTH,
    Math.min(MAX_WIDTH, viewportWidth - EDGE_GAP * 2),
  );
  const height = clamp(
    bounds.height,
    MIN_HEIGHT,
    Math.min(MAX_HEIGHT, viewportHeight - EDGE_GAP * 2),
  );

  return {
    width,
    height,
    x: clamp(bounds.x, EDGE_GAP, viewportWidth - width - EDGE_GAP),
    y: clamp(bounds.y, EDGE_GAP, viewportHeight - height - EDGE_GAP),
  };
}

type MacroPanelProps = {
  project: MacroProject;
};

export function MacroPanel({ project }: MacroPanelProps) {
  const [bounds, setBounds] = React.useState<Bounds>(getStoredBounds);
  const [interaction, setInteraction] = React.useState<Interaction | null>(
    null,
  );

  React.useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(bounds));
  }, [bounds]);

  React.useEffect(() => {
    const handleResize = () => setBounds((current) => clampBounds(current));

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  React.useEffect(() => {
    if (!interaction) return;

    const handlePointerMove = (event: PointerEvent) => {
      event.preventDefault();

      const deltaX = event.clientX - interaction.pointerX;
      const deltaY = event.clientY - interaction.pointerY;

      if (interaction.type === "drag") {
        setBounds(
          clampBounds({
            ...interaction.start,
            x: interaction.start.x + deltaX,
            y: interaction.start.y + deltaY,
          }),
        );
        return;
      }

      setBounds(
        clampBounds({
          ...interaction.start,
          width: interaction.start.width + deltaX,
          height: interaction.start.height + deltaY,
        }),
      );
    };

    const stopInteraction = () => setInteraction(null);

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopInteraction, { once: true });
    window.addEventListener("pointercancel", stopInteraction, { once: true });

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopInteraction);
      window.removeEventListener("pointercancel", stopInteraction);
    };
  }, [interaction]);

  const startDrag = (event: React.PointerEvent) => {
    if (event.button !== 0) return;

    event.preventDefault();
    setInteraction({
      type: "drag",
      pointerX: event.clientX,
      pointerY: event.clientY,
      start: bounds,
    });
  };

  const startResize = (event: React.PointerEvent) => {
    if (event.button !== 0) return;

    event.preventDefault();
    event.stopPropagation();
    setInteraction({
      type: "resize",
      pointerX: event.clientX,
      pointerY: event.clientY,
      start: bounds,
    });
  };

  return (
    <div
      className="macro-master-root fixed left-0 top-0 z-[2147483647]"
      style={{
        transform: `translate3d(${bounds.x}px, ${bounds.y}px, 0)`,
        width: bounds.width,
        height: bounds.height,
      }}
    >
      <section
        className={cn(
          "macro-master-panel relative flex h-full w-full select-none flex-col overflow-hidden rounded-lg border border-border bg-card text-card-foreground",
          interaction && "cursor-grabbing",
        )}
      >
        <header
          className="flex h-11 shrink-0 cursor-grab items-center gap-2 border-b border-border bg-background px-3 active:cursor-grabbing"
          onPointerDown={startDrag}
        >
          <GripHorizontal
            className="size-4 text-muted-foreground"
            aria-hidden="true"
          />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold leading-none">
              {project.name}
            </div>
          </div>
          <Button
            aria-label="Close project"
            className="size-7 text-muted-foreground hover:text-foreground"
            onClick={() => void closeActiveProject()}
            onPointerDown={(event) => event.stopPropagation()}
            size="icon"
            type="button"
            variant="ghost"
          >
            <X className="size-4" aria-hidden="true" />
          </Button>
        </header>

        <main className="flex flex-1 flex-col items-center justify-center gap-2 bg-card px-6 py-8 text-center">
          <p className="text-sm font-medium text-foreground">Hello world</p>
          <p className="max-w-full truncate text-xs text-muted-foreground">
            {project.id}
          </p>
        </main>

        <button
          aria-label="Resize MacroMaster panel"
          className="absolute bottom-1 right-1 size-5 cursor-nwse-resize rounded-sm text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring"
          onPointerDown={startResize}
          type="button"
        >
          <span className="absolute bottom-1 right-1 h-2.5 w-2.5 border-b border-r border-current" />
        </button>
      </section>
    </div>
  );
}
