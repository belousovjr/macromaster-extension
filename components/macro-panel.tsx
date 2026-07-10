import * as React from "react";
import {
  Clipboard,
  Crosshair,
  GripHorizontal,
  ListTree,
  LoaderCircle,
  Minus,
  MousePointerClick,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { closeActiveProject, type MacroProject } from "@/lib/projects";
import { cn } from "@/lib/utils";

const STORAGE_KEY_PREFIX = "macromaster:panel-bounds";
const MIN_WIDTH = 300;
const MAX_WIDTH = 560;
const MIN_HEIGHT = 220;
const MAX_HEIGHT = 720;
const EDGE_GAP = 12;
const PANEL_HOST_TAG = "macro-master-panel";
const OVERLAY_ATTR = "data-macro-master-overlay";
const PICKER_Z_INDEX = 2147483646;
const PANEL_BACK_Z_INDEX = 2147483645;
const PANEL_FRONT_Z_INDEX = 2147483647;
const SELECTOR_HIGHLIGHT_Z_INDEX = 2147483644;
const HIGHLIGHT_RENDER_CHUNK_SIZE = 100;

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

type FrontPanel = "floating" | "selection";

type ElementDescription = {
  tag: string;
  details: string;
  label: string;
};

type PickedElement = {
  element: Element;
  description: ElementDescription;
};

type PickerContextMenuState = {
  x: number;
  y: number;
  pickedElement: PickedElement;
  selector: string;
};

type SelectorMode = "single" | "series";
type SingleSelectorKind = "id" | "nth" | "first" | "last";
type SeriesPositionKind = "any" | "first" | "last" | "exact" | "formula";

type SeriesPositionState = {
  kind: SeriesPositionKind;
  exact: number;
  step: number;
  offset: number;
};

type SeriesSelectorState = {
  tag: boolean;
  classes: string[];
  attributes: string[];
  position: SeriesPositionState;
};

type SelectorState = {
  mode: SelectorMode;
  single: SingleSelectorKind | null;
  series: SeriesSelectorState;
};

type SelectorOption = {
  value: string;
  label: string;
};

type MacroPanelProps = {
  project: MacroProject;
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

function getBoundsStorageKey(projectId: string) {
  return `${STORAGE_KEY_PREFIX}:${projectId}`;
}

function getStoredBounds(projectId: string): Bounds {
  try {
    const stored = localStorage.getItem(getBoundsStorageKey(projectId));
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

function cssEscape(value: string) {
  if (typeof globalThis.CSS?.escape === "function") {
    return CSS.escape(value);
  }

  return value.replace(/[^a-zA-Z0-9_-]/g, "\\$&");
}

function cssString(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
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

function getElementIndex(element: Element) {
  if (!element.parentElement) return 1;

  return Array.from(element.parentElement.children).indexOf(element) + 1;
}

function isLastElement(element: Element) {
  return element.parentElement?.lastElementChild === element;
}

function getElementPath(element: Element | null): string {
  if (!element || element === document.documentElement) {
    return "html";
  }

  if (element.id) {
    return `#${cssEscape(element.id)}`;
  }

  return `${getElementPath(element.parentElement)} > ${element.tagName.toLowerCase()}:nth-child(${getElementIndex(element)})`;
}

function getClassOptions(element: Element): SelectorOption[] {
  if (!(element instanceof HTMLElement)) return [];

  return Array.from(element.classList)
    .slice(0, 12)
    .map((className) => ({
      value: className,
      label: `.${className}`,
    }));
}

function getAttributeOptions(element: Element): SelectorOption[] {
  return Array.from(element.attributes)
    .filter((attribute) => {
      if (!attribute.value) return false;
      return !["id", "class", "style"].includes(attribute.name);
    })
    .slice(0, 12)
    .map((attribute) => ({
      value: attribute.name,
      label: `${attribute.name}="${attribute.value}"`,
    }));
}

function getInitialSelectorState(element: Element): SelectorState {
  const index = getElementIndex(element);

  return {
    mode: "single",
    single: element.id ? "id" : "nth",
    series: {
      tag: true,
      classes: [],
      attributes: [],
      position: {
        kind: "any",
        exact: index,
        step: 2,
        offset: index,
      },
    },
  };
}

function buildSingleSelector(element: Element, kind: SingleSelectorKind | null) {
  if (!kind) return null;

  if (kind === "id") {
    return element.id ? `#${cssEscape(element.id)}` : null;
  }

  const parentPath = getElementPath(element.parentElement);
  if (kind === "nth") {
    return `${parentPath} > :nth-child(${getElementIndex(element)})`;
  }

  if (kind === "first") {
    return `${parentPath} > :first-child`;
  }

  return `${parentPath} > :last-child`;
}

function buildSeriesSelector(element: Element, state: SeriesSelectorState) {
  const parts: string[] = [];

  parts.push(state.tag ? element.tagName.toLowerCase() : "*");
  state.classes.forEach((className) => {
    parts.push(`.${cssEscape(className)}`);
  });
  state.attributes.forEach((attributeName) => {
    const attributeValue = element.getAttribute(attributeName);
    if (attributeValue == null) return;

    parts.push(`[${cssEscape(attributeName)}="${cssString(attributeValue)}"]`);
  });
  if (state.position.kind === "first") {
    parts.push(":first-child");
  }
  if (state.position.kind === "last") {
    parts.push(":last-child");
  }
  if (state.position.kind === "exact") {
    parts.push(`:nth-child(${Math.max(1, Math.round(state.position.exact))})`);
  }
  if (state.position.kind === "formula") {
    const step = Math.max(1, Math.round(state.position.step));
    const offset = Math.max(0, Math.round(state.position.offset));
    parts.push(`:nth-child(${step}n${offset === 0 ? "" : `+${offset}`})`);
  }

  if (
    !state.tag &&
    state.classes.length === 0 &&
    state.attributes.length === 0 &&
    state.position.kind === "any"
  ) {
    return null;
  }

  return parts.join("");
}

function getSelectorMatches(selector: string | null) {
  if (!selector) return [];

  try {
    return Array.from(document.querySelectorAll(selector)).filter(
      (element) =>
        !element.closest(PANEL_HOST_TAG) &&
        !element.closest(`[${OVERLAY_ATTR}]`),
    );
  } catch {
    return [];
  }
}

function scrollElementToPageTop(element: Element) {
  element.scrollIntoView({ block: "start", inline: "nearest" });
}

function createHighlightElement(element: Element, index: number | null) {
  const rect = element.getBoundingClientRect();
  const highlight = document.createElement("div");

  highlight.setAttribute(OVERLAY_ATTR, "true");
  highlight.style.cssText = [
    "position: fixed",
    `left: ${rect.left}px`,
    `top: ${rect.top}px`,
    `width: ${rect.width}px`,
    `height: ${rect.height}px`,
    "pointer-events: none",
    "box-sizing: border-box",
    "border: 2px solid #16a34a",
    "background: rgb(22 163 74 / 10%)",
    `z-index: ${SELECTOR_HIGHLIGHT_Z_INDEX}`,
  ].join(";");

  if (index != null) {
    const hasBadgeSpaceAbove = rect.top >= 22;
    const hasBadgeSpaceRight = rect.left + 22 <= window.innerWidth;
    const badge = document.createElement("div");
    badge.textContent = String(index);
    badge.style.cssText = [
      "position: absolute",
      hasBadgeSpaceRight ? "left: -2px" : "right: -2px",
      hasBadgeSpaceAbove ? "top: -22px" : "bottom: -22px",
      "min-width: 22px",
      "height: 20px",
      "display: flex",
      "align-items: center",
      "justify-content: center",
      hasBadgeSpaceAbove
        ? "border-radius: 4px 4px 0 0"
        : "border-radius: 0 0 4px 4px",
      "background: #16a34a",
      "color: #f8fafc",
      "font: 700 12px/1 ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
      "padding: 0 6px",
    ].join(";");
    highlight.append(badge);
  }

  return highlight;
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

function getPickableElement(event: MouseEvent | PointerEvent) {
  if (isPanelEvent(event)) return null;

  const element = document.elementFromPoint(event.clientX, event.clientY);
  if (!(element instanceof Element)) return null;
  if (element.closest(PANEL_HOST_TAG)) return null;
  if (element.closest(`[${OVERLAY_ATTR}]`)) return null;
  if (element === document.documentElement || element === document.body) {
    return null;
  }

  return element;
}

function createPickerOverlay() {
  const overlay = document.createElement("div");
  const label = document.createElement("div");

  overlay.setAttribute(OVERLAY_ATTR, "true");
  label.setAttribute(OVERLAY_ATTR, "true");
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

function useSelectorHighlights(
  matches: Element[],
  showNumbers: boolean,
  isEnabled: boolean,
  onRenderingChange: (isRendering: boolean) => void,
) {
  React.useEffect(() => {
    if (!isEnabled) {
      onRenderingChange(false);
      return;
    }

    const highlightRoot = document.createElement("div");
    let renderFrame = 0;
    let renderToken = 0;

    highlightRoot.setAttribute(OVERLAY_ATTR, "true");
    document.documentElement.append(highlightRoot);

    const cancelRender = () => {
      if (renderFrame) {
        cancelAnimationFrame(renderFrame);
        renderFrame = 0;
      }
      renderToken += 1;
    };

    const renderHighlights = () => {
      cancelRender();
      highlightRoot.replaceChildren();

      const token = renderToken;
      let index = 0;

      if (matches.length === 0) {
        onRenderingChange(false);
        return;
      }

      onRenderingChange(true);

      const renderChunk = () => {
        if (token !== renderToken) return;

        const fragment = document.createDocumentFragment();
        const endIndex = Math.min(
          index + HIGHLIGHT_RENDER_CHUNK_SIZE,
          matches.length,
        );

        for (; index < endIndex; index += 1) {
          fragment.append(
            createHighlightElement(
              matches[index],
              showNumbers ? index + 1 : null,
            ),
          );
        }

        highlightRoot.append(fragment);

        if (index < matches.length) {
          renderFrame = requestAnimationFrame(renderChunk);
        } else {
          renderFrame = 0;
          if (token === renderToken) {
            onRenderingChange(false);
          }
        }
      };

      renderFrame = requestAnimationFrame(renderChunk);
    };

    renderHighlights();

    const handleUpdate = () => {
      renderHighlights();
    };

    window.addEventListener("scroll", handleUpdate, true);
    window.addEventListener("resize", handleUpdate);

    return () => {
      window.removeEventListener("scroll", handleUpdate, true);
      window.removeEventListener("resize", handleUpdate);
      cancelRender();
      onRenderingChange(false);
      highlightRoot.remove();
    };
  }, [isEnabled, matches, onRenderingChange, showNumbers]);
}

function useElementPicker(
  isEnabled: boolean,
  onPick: (pickedElement: PickedElement) => void,
  onCancel: () => void,
  onContextMenu: (state: PickerContextMenuState) => void,
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

    const pickElementAtEvent = (event: MouseEvent) => {
      if (isPanelEvent(event)) return;

      const element = getPickableElement(event);
      if (!element) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      onPick({ element, description: describeElement(element) });
    };

    const handleClick = (event: MouseEvent) => {
      if (event.button !== 0) return;

      pickElementAtEvent(event);
    };

    const handleContextMenu = (event: MouseEvent) => {
      const element = getPickableElement(event);
      if (!element) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      onContextMenu({
        x: event.clientX,
        y: event.clientY,
        pickedElement: { element, description: describeElement(element) },
        selector: getElementPath(element),
      });
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;

      event.preventDefault();
      onCancel();
    };

    window.addEventListener("pointermove", handlePointerMove, true);
    window.addEventListener("pointerdown", handlePointerDown, true);
    window.addEventListener("click", handleClick, true);
    window.addEventListener("contextmenu", handleContextMenu, true);
    window.addEventListener("keydown", handleKeyDown, true);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove, true);
      window.removeEventListener("pointerdown", handlePointerDown, true);
      window.removeEventListener("click", handleClick, true);
      window.removeEventListener("contextmenu", handleContextMenu, true);
      window.removeEventListener("keydown", handleKeyDown, true);
      document.body.style.cursor = previousBodyCursor;
      document.documentElement.style.cursor = previousDocumentCursor;
      cursorStyle.remove();
      overlay.remove();
    };
  }, [isEnabled, onCancel, onContextMenu, onPick]);
}

function usePickerPreview(element: Element | null) {
  React.useEffect(() => {
    if (!element) return;

    const overlay = createPickerOverlay();
    const update = () => overlay.update(element);

    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);

    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
      overlay.remove();
    };
  }, [element]);
}

async function copyTextToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch {
    const textArea = document.createElement("textarea");

    textArea.value = text;
    textArea.style.cssText = [
      "position: fixed",
      "left: -9999px",
      "top: 0",
      "opacity: 0",
    ].join(";");
    document.documentElement.append(textArea);
    textArea.focus();
    textArea.select();

    try {
      document.execCommand("copy");
    } finally {
      textArea.remove();
    }
  }
}

function PickerContextMenu({
  state,
  onCopySelector,
  onOpenChange,
  onSelectElement,
}: {
  state: PickerContextMenuState | null;
  onCopySelector: (selector: string) => void;
  onOpenChange: (isOpen: boolean) => void;
  onSelectElement: (pickedElement: PickedElement) => void;
}) {
  const triggerRef = React.useRef<HTMLSpanElement>(null);

  React.useEffect(() => {
    if (!state) return;

    triggerRef.current?.dispatchEvent(
      new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        clientX: state.x,
        clientY: state.y,
        view: window,
      }),
    );
  }, [state]);

  return (
    <ContextMenu modal={false} onOpenChange={onOpenChange}>
      <ContextMenuTrigger
        ref={triggerRef}
        className="fixed size-px opacity-0"
        style={{
          left: state?.x ?? 0,
          top: state?.y ?? 0,
          pointerEvents: "none",
        }}
      />
      <ContextMenuContent
        className="pointer-events-auto w-44"
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        <ContextMenuItem
          onSelect={() => {
            if (!state) return;

            onSelectElement(state.pickedElement);
          }}
        >
          <MousePointerClick className="size-4" aria-hidden="true" />
          <span>Выбрать</span>
        </ContextMenuItem>
        <ContextMenuItem
          onSelect={() => {
            if (!state) return;

            onCopySelector(state.selector);
          }}
        >
          <Clipboard className="size-4" aria-hidden="true" />
          <span>Скопировать</span>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

function SelectorCheckbox({
  checked,
  disabled,
  label,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  const id = React.useId();

  return (
    <div
      className={cn(
        "flex min-h-8 items-center gap-3",
        disabled && "opacity-50",
      )}
    >
      <Checkbox
        checked={checked}
        disabled={disabled}
        id={id}
        onCheckedChange={(value) => onChange(value === true)}
      />
      <Label className="min-w-0 truncate" htmlFor={id}>
        {label}
      </Label>
    </div>
  );
}

function SelectorRadio({
  disabled,
  label,
  value,
}: {
  disabled?: boolean;
  label: string;
  value: string;
}) {
  const id = React.useId();

  return (
    <div
      className={cn(
        "flex min-h-8 items-center gap-3",
        disabled && "opacity-50",
      )}
    >
      <RadioGroupItem disabled={disabled} id={id} value={value} />
      <Label className="min-w-0 truncate" htmlFor={id}>
        {label}
      </Label>
    </div>
  );
}

function SelectionBuilderPanel({
  zIndex,
  panelsTranslucent,
  isPickingElement,
  matches,
  onInteract,
  onPreviewActiveChange,
  onClose,
  onConfirm,
  onPickRelatedElement,
  pickedElement,
  selector,
  selectorState,
  setSelectorState,
  isUpdatingMatches,
}: {
  zIndex: number;
  panelsTranslucent: boolean;
  isPickingElement: boolean;
  matches: Element[];
  onInteract: () => void;
  onPreviewActiveChange: (isActive: boolean) => void;
  onClose: () => void;
  onConfirm: () => void;
  onPickRelatedElement: (pickedElement: PickedElement) => void;
  pickedElement: PickedElement;
  selector: string | null;
  selectorState: SelectorState;
  setSelectorState: React.Dispatch<React.SetStateAction<SelectorState>>;
  isUpdatingMatches: boolean;
}) {
  const element = pickedElement.element;
  const [previewElement, setPreviewElement] = React.useState<Element | null>(
    null,
  );
  const [navigationMenuOpen, setNavigationMenuOpen] = React.useState(false);
  const [activeNavigationSub, setActiveNavigationSub] = React.useState<
    "children" | null
  >(null);
  const [isMatchNavigationOpen, setIsMatchNavigationOpen] =
    React.useState(false);
  const [isCollapsed, setIsCollapsed] = React.useState(false);
  const [matchNavigationSelectKey, setMatchNavigationSelectKey] =
    React.useState(0);
  const setPreviewElementInTransition = (nextElement: Element | null) => {
    React.startTransition(() => {
      setPreviewElement(nextElement);
      onPreviewActiveChange(nextElement != null);
    });
  };
  React.useEffect(
    () => () => {
      onPreviewActiveChange(false);
    },
    [onPreviewActiveChange],
  );
  React.useEffect(() => {
    if (!isPickingElement) return;

    setNavigationMenuOpen(false);
    setActiveNavigationSub(null);
    setPreviewElementInTransition(null);
  }, [isPickingElement]);
  const parentOption = React.useMemo(() => {
    const parent = element.parentElement;
    if (
      !parent ||
      parent === document.body ||
      parent === document.documentElement
    ) {
      return null;
    }

    return {
      element: parent,
      label: describeElement(parent).label,
    };
  }, [element]);
  const childOptions = React.useMemo(
    () =>
      Array.from(element.children).map((child, index) => ({
        element: child,
        label: describeElement(child).label,
        value: String(index),
      })),
    [element],
  );
  const matchOptions = React.useMemo(
    () =>
      matches.map((match, index) => ({
        element: match,
        value: String(index),
      })),
    [matches],
  );
  const classOptions = React.useMemo(() => getClassOptions(element), [element]);
  const attributeOptions = React.useMemo(
    () => getAttributeOptions(element),
    [element],
  );
  const singleOptions = React.useMemo(
    () => [
      {
        kind: "id" as const,
        label: element.id ? `id="${element.id}"` : "id",
        disabled: !element.id,
      },
      {
        kind: "nth" as const,
        label: `child #${getElementIndex(element)} in parent`,
        disabled: !element.parentElement,
      },
      {
        kind: "first" as const,
        label: "first in parent",
        disabled: getElementIndex(element) !== 1,
      },
      {
        kind: "last" as const,
        label: "last in parent",
        disabled: !isLastElement(element),
      },
    ],
    [element],
  );
  const isSingleMode = selectorState.mode === "single";
  const isValid = Boolean(selector);
  usePickerPreview(previewElement);

  const pickRelatedElement = (nextElement: Element) => {
    setPreviewElementInTransition(null);
    setNavigationMenuOpen(false);
    setActiveNavigationSub(null);
    onPickRelatedElement({
      element: nextElement,
      description: describeElement(nextElement),
    });
  };

  const navigateToMatchElement = (value: string) => {
    const matchElement = matchOptions[Number(value)]?.element;
    if (!matchElement) return;

    scrollElementToPageTop(matchElement);
    setIsMatchNavigationOpen(false);
    setMatchNavigationSelectKey((key) => key + 1);
  };

  const setMode = (mode: SelectorMode) => {
    setSelectorState((current) => {
      if (mode === "single") {
        return {
          ...current,
          mode,
          single: current.single ?? "nth",
        };
      }

      const hasSeries =
        current.series.tag ||
        current.series.classes.length > 0 ||
        current.series.attributes.length > 0 ||
        current.series.position.kind !== "any";

      return {
        ...current,
        mode,
        series: hasSeries
          ? current.series
          : { ...current.series, tag: true },
      };
    });
  };

  const toggleClass = (className: string, checked: boolean) => {
    setSelectorState((current) => ({
      ...current,
      series: {
        ...current.series,
        classes: checked
          ? [...current.series.classes, className]
          : current.series.classes.filter((value) => value !== className),
      },
    }));
  };

  const toggleAttribute = (attributeName: string, checked: boolean) => {
    setSelectorState((current) => ({
      ...current,
      series: {
        ...current.series,
        attributes: checked
          ? [...current.series.attributes, attributeName]
          : current.series.attributes.filter((value) => value !== attributeName),
      },
    }));
  };

  return (
    <div
      className="macro-master-root fixed inset-x-0 bottom-0 box-border flex justify-center px-3 pb-3"
      style={{ zIndex, pointerEvents: "none" }}
    >
      <section
        className={cn(
          "macro-master-panel w-full max-w-[820px] overflow-auto rounded-lg border border-border text-card-foreground",
          isCollapsed && "overflow-hidden",
          panelsTranslucent ? "bg-card/20" : "bg-card",
        )}
        onFocusCapture={onInteract}
        onPointerDownCapture={onInteract}
        style={{
          maxHeight: "min(420px, calc(100vh - 24px))",
          pointerEvents: panelsTranslucent ? "none" : "auto",
        }}
      >
        <header
          className={cn(
            "sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-border px-3 py-2.5",
            panelsTranslucent ? "bg-card/20" : "bg-card",
          )}
        >
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-1.5">
              <div className="truncate text-sm font-semibold">
                <span className="text-primary">
                  {pickedElement.description.tag}
                </span>
                {pickedElement.description.details
                  ? pickedElement.description.details
                  : ""}
              </div>
              {isUpdatingMatches ? (
                <LoaderCircle
                  className="size-3.5 shrink-0 animate-spin text-muted-foreground"
                  aria-label="Updating matches"
                />
              ) : null}
            </div>
            <div className="truncate text-xs text-muted-foreground">
              {matches.length} match{matches.length === 1 ? "" : "es"}
            </div>
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-1">
            <Select
              key={matchNavigationSelectKey}
              open={isMatchNavigationOpen}
              onOpenChange={setIsMatchNavigationOpen}
              onValueChange={navigateToMatchElement}
            >
              <SelectTrigger
                aria-label="Navigate to match element"
                className="pointer-events-auto mr-2 h-8 w-[190px] shrink-0"
                size="sm"
              >
                <ListTree className="size-4" aria-hidden="true" />
                <SelectValue
                  placeholder={`nav to match (${matchOptions.length})`}
                />
              </SelectTrigger>
              {isMatchNavigationOpen ? (
                <SelectContent
                  align="end"
                  className="pointer-events-auto max-h-72 w-80"
                >
                  {matchOptions.length > 0 ? (
                    matchOptions.map((option, index) => {
                      const description = describeElement(option.element);

                      return (
                        <SelectItem key={option.value} value={option.value}>
                          <span className="flex min-w-0 items-center gap-2">
                            <span className="shrink-0 text-xs font-semibold text-muted-foreground">
                              #{index + 1}
                            </span>
                            <span className="min-w-0 truncate">
                              <span className="text-primary">
                                {description.tag}
                              </span>
                              {description.details ? description.details : ""}
                            </span>
                          </span>
                        </SelectItem>
                      );
                    })
                  ) : (
                    <SelectItem disabled value="no-match-elements">
                      No match elements
                    </SelectItem>
                  )}
                </SelectContent>
              ) : null}
            </Select>
            {isSingleMode &&
            (parentOption || childOptions.length > 0) ? (
              <DropdownMenu
                modal={false}
                open={navigationMenuOpen}
                onOpenChange={(isOpen) => {
                  setNavigationMenuOpen(isOpen);
                  if (!isOpen) {
                    setPreviewElementInTransition(null);
                    setActiveNavigationSub(null);
                  }
                }}
              >
                <DropdownMenuTrigger asChild>
                  <Button
                    aria-label="Open element navigation menu"
                    className={cn(
                      "pointer-events-auto size-8 shrink-0",
                      isPickingElement && "opacity-20",
                    )}
                    disabled={isPickingElement}
                    size="icon"
                    type="button"
                    variant="outline"
                  >
                    <Crosshair className="size-4" aria-hidden="true" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  className="pointer-events-auto w-48"
                >
                  {parentOption ? (
                    <DropdownMenuItem
                      onFocus={() =>
                        setPreviewElementInTransition(parentOption.element)
                      }
                      onPointerLeave={() => setPreviewElementInTransition(null)}
                      onPointerMove={() =>
                        setPreviewElementInTransition(parentOption.element)
                      }
                      onSelect={() => pickRelatedElement(parentOption.element)}
                    >
                      <span className="min-w-0 truncate">
                        Parent: {parentOption.label}
                      </span>
                    </DropdownMenuItem>
                  ) : null}
                  {childOptions.length > 0 ? (
                    <DropdownMenuSub
                      open={activeNavigationSub === "children"}
                      onOpenChange={(isOpen) =>
                        setActiveNavigationSub(isOpen ? "children" : null)
                      }
                    >
                      <DropdownMenuSubTrigger>Children ({childOptions.length})</DropdownMenuSubTrigger>
                      <DropdownMenuSubContent className="pointer-events-auto max-h-72 w-72 overflow-y-auto">
                        {childOptions.map((child) => (
                          <DropdownMenuItem
                            key={child.value}
                            onFocus={() =>
                              setPreviewElementInTransition(child.element)
                            }
                            onPointerLeave={() =>
                              setPreviewElementInTransition(null)
                            }
                            onPointerMove={() =>
                              setPreviewElementInTransition(child.element)
                            }
                            onSelect={() => pickRelatedElement(child.element)}
                          >
                            <span className="min-w-0 truncate">
                              {child.label}
                            </span>
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
            <Button
              aria-label={
                isCollapsed
                  ? "Expand selector panel"
                  : "Collapse selector panel"
              }
              aria-pressed={isCollapsed}
              className={cn(
                "size-7 text-muted-foreground hover:text-foreground",
                isCollapsed && "bg-accent text-accent-foreground",
              )}
              onClick={() => setIsCollapsed((current) => !current)}
              size="icon"
              title={isCollapsed ? "Expand panel" : "Collapse panel"}
              type="button"
              variant="ghost"
            >
              <Minus className="size-4" aria-hidden="true" />
            </Button>
            <Button
              aria-label="Close selector panel"
              className="size-7 text-muted-foreground hover:text-foreground"
              onClick={onClose}
              size="icon"
              type="button"
              variant="ghost"
            >
              <X className="size-4" aria-hidden="true" />
            </Button>
          </div>
        </header>

        {isCollapsed ? null : (
          <div
            className={cn(
              "grid gap-3 p-3",
              panelsTranslucent && "opacity-20",
            )}
          >
          <Tabs
            className="gap-3"
            onValueChange={(value) => setMode(value as SelectorMode)}
            value={selectorState.mode}
          >
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="single">Single element</TabsTrigger>
              <TabsTrigger value="series">Series</TabsTrigger>
            </TabsList>

            <TabsContent value="single">
              <fieldset className="rounded-lg border border-border px-3 pb-3 pt-2">
                <legend className="px-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                  Static single selectors
                </legend>
                <RadioGroup
                  className="grid gap-1 sm:grid-cols-2"
                  onValueChange={(value) =>
                    setSelectorState((current) => ({
                      ...current,
                      single: value as SingleSelectorKind,
                    }))
                  }
                  value={selectorState.single ?? ""}
                >
                  {singleOptions.map((option) => (
                    <SelectorRadio
                      disabled={option.disabled}
                      key={option.kind}
                      label={option.label}
                      value={option.kind}
                    />
                  ))}
                </RadioGroup>
              </fieldset>
            </TabsContent>

            <TabsContent value="series">
              <fieldset className="rounded-lg border border-border px-3 pb-3 pt-2">
                <legend className="px-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                  Series selectors
                </legend>
                <div className="grid gap-1 sm:grid-cols-2">
                  <SelectorCheckbox
                    checked={selectorState.series.tag}
                    label={`tag <${element.tagName.toLowerCase()}>`}
                    onChange={(checked) =>
                      setSelectorState((current) => ({
                        ...current,
                        series: { ...current.series, tag: checked },
                      }))
                    }
                  />
                  {classOptions.map((option) => (
                    <SelectorCheckbox
                      checked={selectorState.series.classes.includes(
                        option.value,
                      )}
                      key={option.value}
                      label={option.label}
                      onChange={(checked) => toggleClass(option.value, checked)}
                    />
                  ))}
                  {attributeOptions.map((option) => (
                    <SelectorCheckbox
                      checked={selectorState.series.attributes.includes(
                        option.value,
                      )}
                      key={option.value}
                      label={option.label}
                      onChange={(checked) =>
                        toggleAttribute(option.value, checked)
                      }
                    />
                  ))}
                </div>
                <div className="mt-3 grid gap-2">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                    Position pattern
                  </div>
                  <RadioGroup
                    className="grid gap-1 sm:grid-cols-2"
                    onValueChange={(value) =>
                      setSelectorState((current) => ({
                        ...current,
                        series: {
                          ...current.series,
                          position: {
                            ...current.series.position,
                            kind: value as SeriesPositionKind,
                          },
                        },
                      }))
                    }
                    value={selectorState.series.position.kind}
                  >
                    {[
                      { kind: "any" as const, label: "Any position" },
                      { kind: "first" as const, label: "First" },
                      { kind: "last" as const, label: "Last" },
                      { kind: "exact" as const, label: "Exact #" },
                      { kind: "formula" as const, label: "Formula an+b" },
                    ].map((option) => (
                      <SelectorRadio
                        key={option.kind}
                        label={option.label}
                        value={option.kind}
                      />
                    ))}
                  </RadioGroup>
                  {selectorState.series.position.kind === "exact" ? (
                    <label className="flex flex-wrap items-center gap-2 text-sm font-semibold text-foreground">
                      <span>Child number</span>
                      <Input
                        className="h-8 w-20"
                        min={1}
                        onChange={(event) => {
                          const exact = Number(event.currentTarget.value) || 1;

                          setSelectorState((current) => ({
                            ...current,
                            series: {
                              ...current.series,
                              position: {
                                ...current.series.position,
                                exact,
                              },
                            },
                          }));
                        }}
                        type="number"
                        value={selectorState.series.position.exact}
                      />
                    </label>
                  ) : null}
                  {selectorState.series.position.kind === "formula" ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="flex items-center gap-2 text-sm font-semibold text-foreground">
                        <span>a</span>
                        <Input
                          className="h-8 w-20"
                          min={1}
                          onChange={(event) => {
                            const step = Number(event.currentTarget.value) || 1;

                            setSelectorState((current) => ({
                              ...current,
                              series: {
                                ...current.series,
                                position: {
                                  ...current.series.position,
                                  step,
                                },
                              },
                            }));
                          }}
                          type="number"
                          value={selectorState.series.position.step}
                        />
                      </label>
                      <span className="text-sm font-bold text-muted-foreground">
                        n +
                      </span>
                      <label className="flex items-center gap-2 text-sm font-semibold text-foreground">
                        <span>b</span>
                        <Input
                          className="h-8 w-20"
                          min={0}
                          onChange={(event) => {
                            const offset =
                              Number(event.currentTarget.value) || 0;

                            setSelectorState((current) => ({
                              ...current,
                              series: {
                                ...current.series,
                                position: {
                                  ...current.series.position,
                                  offset,
                                },
                              },
                            }));
                          }}
                          type="number"
                          value={selectorState.series.position.offset}
                        />
                      </label>
                      <span className="text-xs text-muted-foreground">
                        Example: {selectorState.series.position.step}n+
                        {selectorState.series.position.offset}
                      </span>
                    </div>
                  ) : null}
                </div>
              </fieldset>
            </TabsContent>
          </Tabs>

          <footer className="flex justify-end border-t border-border pt-3">
            <Button disabled={!isValid} onClick={onConfirm} type="button">
              Confirm
            </Button>
          </footer>
        </div>
        )}
      </section>
    </div>
  );
}

export function MacroPanel({ project }: MacroPanelProps) {
  const [bounds, setBounds] = React.useState<Bounds>(() =>
    getStoredBounds(project.id),
  );
  const [boundsProjectId, setBoundsProjectId] = React.useState(project.id);
  const [interaction, setInteraction] = React.useState<Interaction | null>(
    null,
  );
  const [isPickingElement, setIsPickingElement] = React.useState(false);
  const [pickedElement, setPickedElement] = React.useState<PickedElement | null>(
    null,
  );
  const [pickerContextMenu, setPickerContextMenu] =
    React.useState<PickerContextMenuState | null>(null);
  const [isSelectionPanelVisible, setIsSelectionPanelVisible] =
    React.useState(false);
  const [isNavigationPreviewActive, setIsNavigationPreviewActive] =
    React.useState(false);
  const [isRenderingHighlights, setIsRenderingHighlights] =
    React.useState(false);
  const [isFloatingPanelCollapsed, setIsFloatingPanelCollapsed] =
    React.useState(false);
  const [frontPanel, setFrontPanel] = React.useState<FrontPanel>("floating");
  const [selectorState, setSelectorState] = React.useState<SelectorState>({
    mode: "single",
    single: null,
    series: {
      tag: true,
      classes: [],
      attributes: [],
      position: {
        kind: "any",
        exact: 1,
        step: 2,
        offset: 1,
      },
    },
  });
  const selector = React.useMemo(() => {
    if (!pickedElement) return null;

    return selectorState.mode === "single"
      ? buildSingleSelector(pickedElement.element, selectorState.single)
      : buildSeriesSelector(pickedElement.element, selectorState.series);
  }, [pickedElement, selectorState]);
  const deferredSelectorState = React.useDeferredValue(selectorState);
  const previewSelector = React.useMemo(() => {
    if (!pickedElement) return null;

    return deferredSelectorState.mode === "single"
      ? buildSingleSelector(pickedElement.element, deferredSelectorState.single)
      : buildSeriesSelector(pickedElement.element, deferredSelectorState.series);
  }, [deferredSelectorState, pickedElement]);
  const matches = React.useMemo(
    () => getSelectorMatches(previewSelector),
    [previewSelector],
  );
  const isPreviewPending = selector !== previewSelector;
  const isUpdatingMatches = isPreviewPending || isRenderingHighlights;
  const floatingPanelZIndex =
    frontPanel === "floating" ? PANEL_FRONT_Z_INDEX : PANEL_BACK_Z_INDEX;
  const selectionPanelZIndex =
    frontPanel === "selection" ? PANEL_FRONT_Z_INDEX : PANEL_BACK_Z_INDEX;
  const panelsTranslucent = isPickingElement || isNavigationPreviewActive;

  const bringFloatingPanelToFront = React.useCallback(() => {
    setFrontPanel("floating");
  }, []);

  const bringSelectionPanelToFront = React.useCallback(() => {
    setFrontPanel("selection");
  }, []);

  const stopPickingElement = React.useCallback(() => {
    setIsPickingElement(false);
    setPickerContextMenu(null);
  }, []);

  const hideSelectionPanel = React.useCallback(() => {
    React.startTransition(() => {
      setIsNavigationPreviewActive(false);
      setIsSelectionPanelVisible(false);
    });
  }, []);

  const closeSelectionPanel = hideSelectionPanel;

  const confirmSelection = React.useCallback(() => {
    hideSelectionPanel();
  }, [hideSelectionPanel]);

  const handlePickElement = React.useCallback((nextElement: PickedElement) => {
    setIsPickingElement(false);
    setPickerContextMenu(null);
    React.startTransition(() => {
      setIsNavigationPreviewActive(false);
      setPickedElement(nextElement);
      setSelectorState(getInitialSelectorState(nextElement.element));
      setFrontPanel("selection");
      setIsSelectionPanelVisible(true);
    });
  }, []);

  const handlePickRelatedElement = React.useCallback(
    (nextElement: PickedElement) => {
      setIsPickingElement(false);
      setPickerContextMenu(null);
      React.startTransition(() => {
        setIsNavigationPreviewActive(false);
        setPickedElement(nextElement);
        setSelectorState(getInitialSelectorState(nextElement.element));
        setFrontPanel("selection");
        setIsSelectionPanelVisible(true);
      });
    },
    [],
  );

  const handlePickerContextMenu = React.useCallback(
    (state: PickerContextMenuState) => {
      setPickerContextMenu(state);
    },
    [],
  );

  const handlePickerContextMenuOpenChange = React.useCallback(
    (isOpen: boolean) => {
      if (!isOpen) {
        setPickerContextMenu(null);
      }
    },
    [],
  );

  const copyPickerSelector = React.useCallback((selector: string) => {
    void copyTextToClipboard(selector);
  }, []);

  useElementPicker(
    isPickingElement,
    handlePickElement,
    stopPickingElement,
    handlePickerContextMenu,
  );
  useSelectorHighlights(
    matches,
    deferredSelectorState.mode === "series",
    isSelectionPanelVisible && Boolean(previewSelector),
    setIsRenderingHighlights,
  );

  React.useEffect(() => {
    if (boundsProjectId === project.id) return;

    setInteraction(null);
    setBounds(getStoredBounds(project.id));
    setBoundsProjectId(project.id);
  }, [boundsProjectId, project.id]);

  React.useEffect(() => {
    if (boundsProjectId !== project.id) return;

    localStorage.setItem(
      getBoundsStorageKey(project.id),
      JSON.stringify(bounds),
    );
  }, [bounds, boundsProjectId, project.id]);

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
    <>
      <div
        className="macro-master-root fixed left-0 top-0"
        onFocusCapture={bringFloatingPanelToFront}
        onPointerDownCapture={bringFloatingPanelToFront}
        style={{
          transform: `translate3d(${bounds.x}px, ${bounds.y}px, 0)`,
          width: bounds.width,
          height: isFloatingPanelCollapsed ? 44 : bounds.height,
          zIndex: floatingPanelZIndex,
          pointerEvents: panelsTranslucent ? "none" : "auto",
        }}
      >
        <section
          className={cn(
            "macro-master-panel relative flex h-full w-full select-none flex-col overflow-hidden rounded-lg border border-border text-card-foreground",
            panelsTranslucent ? "bg-card/20" : "bg-card",
            interaction && "cursor-grabbing",
          )}
          style={{ pointerEvents: panelsTranslucent ? "none" : "auto" }}
        >
          <header
            className={cn(
              "flex h-11 shrink-0 cursor-grab items-center gap-2 border-b border-border px-3 active:cursor-grabbing",
              panelsTranslucent ? "bg-background/20" : "bg-background",
            )}
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
              onClick={() => {
                setIsPickingElement((isPicking) => !isPicking);
              }}
              onPointerDown={(event) => event.stopPropagation()}
              size="icon"
              title="Select element"
              type="button"
              variant="ghost"
            >
              <Crosshair className="size-4" aria-hidden="true" />
            </Button>
            <Button
              aria-label={
                isFloatingPanelCollapsed
                  ? "Expand project panel"
                  : "Collapse project panel"
              }
              aria-pressed={isFloatingPanelCollapsed}
              className={cn(
                "size-7 text-muted-foreground hover:text-foreground",
                isFloatingPanelCollapsed && "bg-accent text-accent-foreground",
              )}
              onClick={() =>
                setIsFloatingPanelCollapsed((current) => !current)
              }
              onPointerDown={(event) => event.stopPropagation()}
              size="icon"
              title={
                isFloatingPanelCollapsed ? "Expand panel" : "Collapse panel"
              }
              type="button"
              variant="ghost"
            >
              <Minus className="size-4" aria-hidden="true" />
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

          {isFloatingPanelCollapsed ? null : (
          <main
            className={cn(
              "flex flex-1 flex-col items-center justify-center gap-2 px-6 py-8 text-center",
              panelsTranslucent ? "bg-card/20" : "bg-card",
            )}
          >
            <p className="text-sm font-medium text-foreground">Hello world</p>
            {pickedElement ? (
              <p className="max-w-full truncate text-xs text-muted-foreground">
                Selected: {pickedElement.description.label}
              </p>
            ) : (
              <p className="max-w-full truncate text-xs text-muted-foreground">
                {isPickingElement ? "Hover and click an element" : project.id}
              </p>
            )}
          </main>
          )}

          {isFloatingPanelCollapsed ? null : (
          <button
            aria-label="Resize MacroMaster panel"
            className="absolute bottom-1 right-1 size-5 cursor-nwse-resize rounded-sm text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring"
            onPointerDown={startResize}
            type="button"
          >
            <span className="absolute bottom-1 right-1 h-2.5 w-2.5 border-b border-r border-current" />
          </button>
          )}
        </section>
      </div>
      {isSelectionPanelVisible && pickedElement ? (
        <SelectionBuilderPanel
          zIndex={selectionPanelZIndex}
          panelsTranslucent={panelsTranslucent}
          isPickingElement={isPickingElement}
          matches={matches}
          onInteract={bringSelectionPanelToFront}
          onPreviewActiveChange={setIsNavigationPreviewActive}
          onClose={closeSelectionPanel}
          onConfirm={confirmSelection}
          onPickRelatedElement={handlePickRelatedElement}
          pickedElement={pickedElement}
          selector={selector}
          selectorState={selectorState}
          setSelectorState={setSelectorState}
          isUpdatingMatches={isUpdatingMatches}
        />
      ) : null}
      {isPickingElement ? (
        <PickerContextMenu
          state={pickerContextMenu}
          onCopySelector={copyPickerSelector}
          onOpenChange={handlePickerContextMenuOpenChange}
          onSelectElement={handlePickElement}
        />
      ) : null}
    </>
  );
}

