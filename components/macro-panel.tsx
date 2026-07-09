import * as React from "react";
import { createPortal } from "react-dom";
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
const OVERLAY_ATTR = "data-macro-master-overlay";
const PICKER_Z_INDEX = 2147483646;
const SELECTION_PANEL_Z_INDEX = 2147483645;
const SELECTOR_HIGHLIGHT_Z_INDEX = 2147483644;

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

type ElementDescription = {
  tag: string;
  details: string;
  label: string;
};

type PickedElement = {
  element: Element;
  description: ElementDescription;
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
    mode: element.id ? "single" : "series",
    single: element.id ? "id" : null,
    series: {
      tag: !element.id,
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
    const badge = document.createElement("div");
    badge.textContent = String(index);
    badge.style.cssText = [
      "position: absolute",
      "left: -2px",
      "top: -22px",
      "min-width: 22px",
      "height: 20px",
      "display: flex",
      "align-items: center",
      "justify-content: center",
      "border-radius: 4px 4px 0 0",
      "background: #16a34a",
      "color: #f8fafc",
      "font: 700 12px/1 ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
      "padding: 0 6px",
    ].join(";");
    highlight.append(badge);
  }

  document.documentElement.append(highlight);

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

function getPickableElement(event: PointerEvent) {
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

function usePortalContainer(isVisible: boolean) {
  const [container, setContainer] = React.useState<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (!isVisible) {
      setContainer(null);
      return;
    }

    const nextContainer = document.createElement("div");
    nextContainer.setAttribute(OVERLAY_ATTR, "true");
    document.documentElement.append(nextContainer);
    setContainer(nextContainer);

    return () => {
      nextContainer.remove();
      setContainer(null);
    };
  }, [isVisible]);

  return container;
}

function useSelectorHighlights(
  matches: Element[],
  showNumbers: boolean,
  isEnabled: boolean,
) {
  React.useEffect(() => {
    if (!isEnabled) return;

    const renderHighlights = () =>
      matches.map((element, index) =>
        createHighlightElement(element, showNumbers ? index + 1 : null),
      );
    let highlights = renderHighlights();

    const handleUpdate = () => {
      highlights.forEach((highlight) => highlight.remove());
      highlights = renderHighlights();
    };

    window.addEventListener("scroll", handleUpdate, true);
    window.addEventListener("resize", handleUpdate);

    return () => {
      window.removeEventListener("scroll", handleUpdate, true);
      window.removeEventListener("resize", handleUpdate);
      highlights.forEach((highlight) => highlight.remove());
    };
  }, [isEnabled, matches, showNumbers]);
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
      if (element.closest(`[${OVERLAY_ATTR}]`)) return;
      if (element === document.documentElement || element === document.body) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      onPick({ element, description: describeElement(element) });
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

function Checkbox({
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
  return (
    <label style={optionStyle(disabled)}>
      <input
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.currentTarget.checked)}
        type="checkbox"
      />
      <span>{label}</span>
    </label>
  );
}

function Radio({
  checked,
  disabled,
  label,
  name,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  label: string;
  name: string;
  onChange: () => void;
}) {
  return (
    <label style={optionStyle(disabled)}>
      <input
        checked={checked}
        disabled={disabled}
        name={name}
        onChange={onChange}
        type="radio"
      />
      <span>{label}</span>
    </label>
  );
}

function optionStyle(disabled?: boolean): React.CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    minHeight: 28,
    opacity: disabled ? 0.45 : 1,
    color: "#17212b",
    fontSize: 13,
    fontWeight: 600,
  };
}

function SelectionBuilderPanel({
  matches,
  onClose,
  pickedElement,
  selector,
  selectorState,
  setSelectorState,
}: {
  matches: Element[];
  onClose: () => void;
  pickedElement: PickedElement;
  selector: string | null;
  selectorState: SelectorState;
  setSelectorState: React.Dispatch<React.SetStateAction<SelectorState>>;
}) {
  const element = pickedElement.element;
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
  const isValid =
    selectorState.mode === "single"
      ? Boolean(selectorState.single)
      : Boolean(selector);

  const setMode = (mode: SelectorMode) => {
    setSelectorState((current) => {
      if (mode === "single") {
        return {
          ...current,
          mode,
          single: current.single ?? (element.id ? "id" : "nth"),
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
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: SELECTION_PANEL_Z_INDEX,
        boxSizing: "border-box",
        display: "flex",
        justifyContent: "center",
        padding: "0 12px 12px",
        pointerEvents: "none",
      }}
    >
      <section
        style={{
          width: "min(820px, 100%)",
          maxHeight: "min(420px, calc(100vh - 24px))",
          overflow: "auto",
          border: "1px solid rgb(134 145 160 / 42%)",
          borderRadius: 8,
          background: "rgb(248 250 252 / 97%)",
          boxShadow:
            "0 18px 50px rgb(15 23 42 / 18%), 0 0 0 1px rgb(15 23 42 / 6%)",
          color: "#17212b",
          font:
            "500 13px/1.4 ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
          pointerEvents: "auto",
        }}
      >
        <header
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            borderBottom: "1px solid rgb(134 145 160 / 24%)",
            padding: "10px 12px",
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                fontSize: 14,
                fontWeight: 800,
              }}
            >
              <span style={{ color: "#2563eb" }}>
                {pickedElement.description.tag}
              </span>
              {pickedElement.description.details
                ? pickedElement.description.details
                : ""}
            </div>
            <div style={{ color: "#667085", fontSize: 12 }}>
              {selector ?? "Choose at least one selector"} · {matches.length}{" "}
              match{matches.length === 1 ? "" : "es"}
            </div>
          </div>
          <button
            aria-label="Close selector panel"
            onClick={onClose}
            style={{
              alignItems: "center",
              background: "transparent",
              border: 0,
              borderRadius: 6,
              color: "#667085",
              cursor: "pointer",
              display: "inline-flex",
              flex: "0 0 auto",
              font:
                "600 20px/1 ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
              height: 30,
              justifyContent: "center",
              width: 30,
            }}
            type="button"
          >
            x
          </button>
        </header>

        <div style={{ display: "grid", gap: 12, padding: 12 }}>
          <div style={{ display: "flex", gap: 8 }}>
            {(["single", "series"] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setMode(mode)}
                style={{
                  border:
                    selectorState.mode === mode
                      ? "1px solid #17212b"
                      : "1px solid rgb(134 145 160 / 42%)",
                  borderRadius: 6,
                  background:
                    selectorState.mode === mode ? "#17212b" : "#ffffff",
                  color: selectorState.mode === mode ? "#f8fafc" : "#17212b",
                  cursor: "pointer",
                  fontWeight: 700,
                  minHeight: 32,
                  padding: "0 12px",
                }}
                type="button"
              >
                {mode === "single" ? "Single element" : "Series"}
              </button>
            ))}
          </div>

          {selectorState.mode === "single" ? (
            <fieldset style={fieldsetStyle}>
              <legend style={legendStyle}>Static single selectors</legend>
              <div style={optionsGridStyle}>
                {singleOptions.map((option) => (
                  <Radio
                    checked={selectorState.single === option.kind}
                    disabled={option.disabled}
                    key={option.kind}
                    label={option.label}
                    name="single-selector"
                    onChange={() =>
                      setSelectorState((current) => ({
                        ...current,
                        single: option.kind,
                      }))
                    }
                  />
                ))}
              </div>
            </fieldset>
          ) : (
            <fieldset style={fieldsetStyle}>
              <legend style={legendStyle}>Series selectors</legend>
              <div style={optionsGridStyle}>
                <Checkbox
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
                  <Checkbox
                    checked={selectorState.series.classes.includes(
                      option.value,
                    )}
                    key={option.value}
                    label={option.label}
                    onChange={(checked) => toggleClass(option.value, checked)}
                  />
                ))}
                {attributeOptions.map((option) => (
                  <Checkbox
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
              <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
                <div style={legendStyle}>Position pattern</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {[
                    { kind: "any" as const, label: "Any position" },
                    { kind: "first" as const, label: "First" },
                    { kind: "last" as const, label: "Last" },
                    { kind: "exact" as const, label: "Exact #" },
                    { kind: "formula" as const, label: "Formula an+b" },
                  ].map((option) => (
                    <button
                      key={option.kind}
                      onClick={() =>
                        setSelectorState((current) => ({
                          ...current,
                          series: {
                            ...current.series,
                            position: {
                              ...current.series.position,
                              kind: option.kind,
                            },
                          },
                        }))
                      }
                      style={{
                        border:
                          selectorState.series.position.kind === option.kind
                            ? "1px solid #17212b"
                            : "1px solid rgb(134 145 160 / 42%)",
                        borderRadius: 6,
                        background:
                          selectorState.series.position.kind === option.kind
                            ? "#17212b"
                            : "#ffffff",
                        color:
                          selectorState.series.position.kind === option.kind
                            ? "#f8fafc"
                            : "#17212b",
                        cursor: "pointer",
                        fontWeight: 700,
                        minHeight: 30,
                        padding: "0 10px",
                      }}
                      type="button"
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                {selectorState.series.position.kind === "exact" ? (
                  <label style={numberFieldStyle}>
                    <span>Child number</span>
                    <input
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
                      style={numberInputStyle}
                      type="number"
                      value={selectorState.series.position.exact}
                    />
                  </label>
                ) : null}
                {selectorState.series.position.kind === "formula" ? (
                  <div
                    style={{
                      alignItems: "center",
                      display: "flex",
                      flexWrap: "wrap",
                      gap: 8,
                    }}
                  >
                    <label style={numberFieldStyle}>
                      <span>a</span>
                      <input
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
                        style={numberInputStyle}
                        type="number"
                        value={selectorState.series.position.step}
                      />
                    </label>
                    <span style={{ color: "#667085", fontWeight: 700 }}>n +</span>
                    <label style={numberFieldStyle}>
                      <span>b</span>
                      <input
                        min={0}
                        onChange={(event) => {
                          const offset = Number(event.currentTarget.value) || 0;

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
                        style={numberInputStyle}
                        type="number"
                        value={selectorState.series.position.offset}
                      />
                    </label>
                    <span style={{ color: "#667085", fontSize: 12 }}>
                      Example: {selectorState.series.position.step}n+
                      {selectorState.series.position.offset}
                    </span>
                  </div>
                ) : null}
              </div>
            </fieldset>
          )}

          {!isValid ? (
            <p style={{ color: "#b45309", fontSize: 12, margin: 0 }}>
              {selectorState.mode === "single"
                ? "Choose at least one static selector."
                : "Choose at least one series selector."}
            </p>
          ) : null}
        </div>
      </section>
    </div>
  );
}

const fieldsetStyle: React.CSSProperties = {
  border: "1px solid rgb(134 145 160 / 24%)",
  borderRadius: 8,
  margin: 0,
  padding: "10px 12px 12px",
};

const legendStyle: React.CSSProperties = {
  color: "#667085",
  fontSize: 11,
  fontWeight: 800,
  letterSpacing: "0.06em",
  padding: "0 4px",
  textTransform: "uppercase",
};

const optionsGridStyle: React.CSSProperties = {
  display: "grid",
  gap: 8,
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
};

const numberFieldStyle: React.CSSProperties = {
  alignItems: "center",
  color: "#17212b",
  display: "inline-flex",
  fontSize: 13,
  fontWeight: 700,
  gap: 8,
};

const numberInputStyle: React.CSSProperties = {
  border: "1px solid rgb(134 145 160 / 42%)",
  borderRadius: 6,
  color: "#17212b",
  font: "600 13px/1.4 ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
  height: 30,
  padding: "0 8px",
  width: 74,
};

function SelectionPanelPortal({
  matches,
  onClose,
  pickedElement,
  selector,
  selectorState,
  setSelectorState,
}: {
  matches: Element[];
  onClose: () => void;
  pickedElement: PickedElement | null;
  selector: string | null;
  selectorState: SelectorState;
  setSelectorState: React.Dispatch<React.SetStateAction<SelectorState>>;
}) {
  const container = usePortalContainer(Boolean(pickedElement));

  if (!container || !pickedElement) return null;

  return createPortal(
    <SelectionBuilderPanel
      matches={matches}
      onClose={onClose}
      pickedElement={pickedElement}
      selector={selector}
      selectorState={selectorState}
      setSelectorState={setSelectorState}
    />,
    container,
  );
}

export function MacroPanel({ project }: MacroPanelProps) {
  const [bounds, setBounds] = React.useState<Bounds>(getStoredBounds);
  const [interaction, setInteraction] = React.useState<Interaction | null>(
    null,
  );
  const [isPickingElement, setIsPickingElement] = React.useState(false);
  const [pickedElement, setPickedElement] = React.useState<PickedElement | null>(
    null,
  );
  const [isSelectionPanelVisible, setIsSelectionPanelVisible] =
    React.useState(false);
  const [selectorState, setSelectorState] = React.useState<SelectorState>({
    mode: "series",
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
  const matches = React.useMemo(() => getSelectorMatches(selector), [selector]);

  const stopPickingElement = React.useCallback(() => {
    setIsPickingElement(false);
  }, []);

  const closeSelectionPanel = React.useCallback(() => {
    setIsSelectionPanelVisible(false);
  }, []);

  const handlePickElement = React.useCallback((nextElement: PickedElement) => {
    setPickedElement(nextElement);
    setSelectorState(getInitialSelectorState(nextElement.element));
    setIsPickingElement(false);
    setIsSelectionPanelVisible(true);
  }, []);

  useElementPicker(isPickingElement, handlePickElement, stopPickingElement);
  useSelectorHighlights(
    matches,
    selectorState.mode === "series",
    isSelectionPanelVisible && Boolean(selector),
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
    <>
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
              onClick={() => {
                setIsPickingElement((isPicking) => {
                  const nextIsPicking = !isPicking;
                  if (nextIsPicking) {
                    setIsSelectionPanelVisible(false);
                  }

                  return nextIsPicking;
                });
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
                Selected: {pickedElement.description.label}
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
      {isSelectionPanelVisible ? (
        <SelectionPanelPortal
          matches={matches}
          onClose={closeSelectionPanel}
          pickedElement={pickedElement}
          selector={selector}
          selectorState={selectorState}
          setSelectorState={setSelectorState}
        />
      ) : null}
    </>
  );
}
