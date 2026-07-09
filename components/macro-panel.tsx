import * as React from "react";
import { Crosshair, GripHorizontal, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { closeActiveProject, type MacroProject } from "@/lib/projects";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "macromaster:panel-bounds";
const MIN_WIDTH = 300;
const MAX_WIDTH = 560;
const MIN_HEIGHT = 220;
const MAX_HEIGHT = 720;
const EDGE_GAP = 12;
const PANEL_HOST_TAG = "macro-master-panel";
const PICKER_Z_INDEX = 2147483646;

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

type PickedElement = {
  label: string;
};

type ElementDescription = {
  tag: string;
  details: string;
  label: string;
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

function describeElement(element: Element): ElementDescription {
  const tag = element.tagName.toLowerCase();
  const id = element.id ? `#${element.id}` : "";
  const classes =
    element instanceof HTMLElement && element.classList.length > 0
      ? `.${Array.from(element.classList).slice(0, 2).join(".")}`
      : "";
  const rect = element.getBoundingClientRect();
  const size = `${Math.round(rect.width)}x${Math.round(rect.height)}`;
  const details = `${id}${classes} ${size}`.trim();

  return {
    tag,
    details,
    label: `${tag}${details ? details : ""}`,
  };
}

function isPanelEvent(event: Event) {
  return event
    .composedPath()
    .some(
      (node) =>
        node instanceof HTMLElement &&
        node.localName.toLowerCase() === PANEL_HOST_TAG,
    );
}

function getPickableElement(event: PointerEvent) {
  if (isPanelEvent(event)) return null;

  const element = document.elementFromPoint(event.clientX, event.clientY);
  if (!(element instanceof Element)) return null;
  if (element.closest(PANEL_HOST_TAG)) return null;
  if (element === document.documentElement || element === document.body) {
    return null;
  }

  return element;
}

function createPickerOverlay() {
  const overlay = document.createElement("div");
  const label = document.createElement("div");

  overlay.style.cssText = [
    "position: fixed",
    "display: none",
    "pointer-events: none",
    "border: 2px solid #2563eb",
    "background: rgb(37 99 235 / 10%)",
    `z-index: ${PICKER_Z_INDEX}`,
    "box-sizing: border-box",
  ].join(";");
  label.style.cssText = [
    "position: fixed",
    "display: none",
    "pointer-events: none",
    "max-width: min(360px, calc(100vw - 16px))",
    "overflow: hidden",
    "text-overflow: ellipsis",
    "white-space: nowrap",
    "border-radius: 4px",
    "background: #17212b",
    "color: #f8fafc",
    "font: 500 12px/1.4 ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
    "padding: 3px 7px",
    `z-index: ${PICKER_Z_INDEX}`,
    "box-shadow: 0 6px 18px rgb(15 23 42 / 24%)",
  ].join(";");

  document.documentElement.append(overlay, label);

  return {
    update(element: Element | null) {
      if (!element) {
        overlay.style.display = "none";
        label.style.display = "none";
        label.replaceChildren();
        return;
      }

      const rect = element.getBoundingClientRect();
      const info = describeElement(element);
      const tag = document.createElement("span");
      const details = document.createElement("span");
      const labelTop =
        rect.top >= 28
          ? Math.max(4, rect.top - 26)
          : Math.min(window.innerHeight - 24, rect.bottom + 4);
      const labelLeft = Math.min(
        Math.max(4, rect.left),
        Math.max(4, window.innerWidth - 368),
      );

      overlay.style.display = "block";
      overlay.style.left = `${rect.left}px`;
      overlay.style.top = `${rect.top}px`;
      overlay.style.width = `${rect.width}px`;
      overlay.style.height = `${rect.height}px`;
      label.style.display = "block";
      label.style.left = `${labelLeft}px`;
      label.style.top = `${labelTop}px`;
      tag.textContent = info.tag;
      tag.style.cssText = "color: #93c5fd; font-weight: 700;";
      details.textContent = info.details ? info.details : "";
      details.style.cssText = "color: #f8fafc;";
      label.replaceChildren(tag, details);
    },
    remove() {
      overlay.remove();
      label.remove();
    },
  };
}

function useElementPicker(
  isEnabled: boolean,
  onPick: (pickedElement: PickedElement) => void,
  onCancel: () => void,
) {
  React.useEffect(() => {
    if (!isEnabled) return;

    const overlay = createPickerOverlay();
    const cursorStyle = document.createElement("style");
    const previousBodyCursor = document.body.style.cursor;
    const previousDocumentCursor = document.documentElement.style.cursor;

    cursorStyle.textContent = `*:not(${PANEL_HOST_TAG}):not(${PANEL_HOST_TAG} *) { cursor: crosshair !important; }`;
    document.head.append(cursorStyle);
    document.body.style.cursor = "crosshair";
    document.documentElement.style.cursor = "crosshair";

    const handlePointerMove = (event: PointerEvent) => {
      overlay.update(getPickableElement(event));
    };

    const handlePointerDown = (event: PointerEvent) => {
      if (!getPickableElement(event)) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    };

    const handleClick = (event: MouseEvent) => {
      if (isPanelEvent(event)) return;

      const element = document.elementFromPoint(event.clientX, event.clientY);
      if (!(element instanceof Element)) return;
      if (element.closest(PANEL_HOST_TAG)) return;
      if (element === document.documentElement || element === document.body) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      onPick({ label: describeElement(element).label });
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;

      event.preventDefault();
      onCancel();
    };

    window.addEventListener("pointermove", handlePointerMove, true);
    window.addEventListener("pointerdown", handlePointerDown, true);
    window.addEventListener("click", handleClick, true);
    window.addEventListener("keydown", handleKeyDown, true);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove, true);
      window.removeEventListener("pointerdown", handlePointerDown, true);
      window.removeEventListener("click", handleClick, true);
      window.removeEventListener("keydown", handleKeyDown, true);
      document.body.style.cursor = previousBodyCursor;
      document.documentElement.style.cursor = previousDocumentCursor;
      cursorStyle.remove();
      overlay.remove();
    };
  }, [isEnabled, onCancel, onPick]);
}

type MacroPanelProps = {
  project: MacroProject;
};

export function MacroPanel({ project }: MacroPanelProps) {
  const [bounds, setBounds] = React.useState<Bounds>(getStoredBounds);
  const [interaction, setInteraction] = React.useState<Interaction | null>(
    null,
  );
  const [isPickingElement, setIsPickingElement] = React.useState(false);
  const [pickedElement, setPickedElement] = React.useState<PickedElement | null>(
    null,
  );

  const stopPickingElement = React.useCallback(() => {
    setIsPickingElement(false);
  }, []);

  const handlePickElement = React.useCallback((nextElement: PickedElement) => {
    setPickedElement(nextElement);
    setIsPickingElement(false);
  }, []);

  useElementPicker(isPickingElement, handlePickElement, stopPickingElement);

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
            aria-label="Select element on page"
            aria-pressed={isPickingElement}
            className={cn(
              "size-7 text-muted-foreground hover:text-foreground",
              isPickingElement && "bg-accent text-accent-foreground",
            )}
            onClick={() => setIsPickingElement((isPicking) => !isPicking)}
            onPointerDown={(event) => event.stopPropagation()}
            size="icon"
            title="Select element"
            type="button"
            variant="ghost"
          >
            <Crosshair className="size-4" aria-hidden="true" />
          </Button>
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
          {pickedElement ? (
            <p className="max-w-full truncate text-xs text-muted-foreground">
              Selected: {pickedElement.label}
            </p>
          ) : (
            <p className="max-w-full truncate text-xs text-muted-foreground">
              {isPickingElement ? "Hover and click an element" : project.id}
            </p>
          )}
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
