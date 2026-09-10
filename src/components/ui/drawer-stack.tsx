"use client";

import {
  Children,
  createContext,
  isValidElement,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";

import { cn } from "@/lib/utils/cn";

type DrawerStackLayout = "hug" | "fill";

type DrawerStackContextValue = {
  push: (id: string) => void;
  pop: () => void;
  reset: (id?: string) => void;
  canPop: boolean;
  depth: number;
  currentId: string;
  stack: readonly string[];
};

const DrawerStackContext = createContext<DrawerStackContextValue | null>(null);

export function useDrawerStack() {
  const value = useContext(DrawerStackContext);
  if (!value) {
    throw new Error("useDrawerStack must be used within DrawerStack.");
  }
  return value;
}

export function useDrawerStackOptional() {
  return useContext(DrawerStackContext);
}

type PaneRecord = {
  layout: DrawerStackLayout;
  node: HTMLElement | null;
};

type RegistryApi = {
  register: (
    id: string,
    layout: DrawerStackLayout,
    node: HTMLElement | null,
  ) => void;
  unregister: (id: string) => void;
};

const RegistryContext = createContext<RegistryApi | null>(null);

type StackViewElement = ReactElement<{
  id: string;
  layout?: DrawerStackLayout;
  className?: string;
  children?: ReactNode;
}>;

const HEIGHT_EASING = "cubic-bezier(0.32, 0.72, 0, 1)";
const HEIGHT_MS = 320;

/**
 * iOS-style push/pop stack for drawer bodies.
 *
 * Height rules:
 * - root / hug panes size to their content
 * - fill panes use the expanded sheet height
 * - height is always an explicit pixel value so CSS can animate both directions
 *
 * Pushed panes should use `DrawerStackHeader` for Back / title / Close chrome.
 */
export function DrawerStack({
  rootId,
  className,
  children,
  onStackChange,
}: {
  rootId: string;
  className?: string;
  children: ReactNode;
  onStackChange?: (stack: readonly string[]) => void;
}) {
  const [stack, setStack] = useState<string[]>([rootId]);
  const [viewportHeight, setViewportHeight] = useState<number | null>(null);
  const [heightReady, setHeightReady] = useState(false);
  const panesRef = useRef(new Map<string, PaneRecord>());
  const [paneVersion, setPaneVersion] = useState(0);

  const viewsById = useMemo(() => {
    const map = new Map<string, StackViewElement>();
    Children.forEach(children, (child) => {
      if (!isValidElement(child)) return;
      const view = child as StackViewElement;
      if (typeof view.props.id !== "string") return;
      map.set(view.props.id, view);
    });
    return map;
  }, [children]);

  const register = useCallback(
    (id: string, layout: DrawerStackLayout, node: HTMLElement | null) => {
      const prev = panesRef.current.get(id);
      if (prev && prev.layout === layout && prev.node === node) return;
      panesRef.current.set(id, { layout, node });
      setPaneVersion((value) => value + 1);
    },
    [],
  );

  const unregister = useCallback((id: string) => {
    if (!panesRef.current.has(id)) return;
    panesRef.current.delete(id);
    setPaneVersion((value) => value + 1);
  }, []);

  const push = useCallback(
    (id: string) => {
      if (!viewsById.has(id)) {
        console.error(`DrawerStack view "${id}" is not registered.`);
        return;
      }
      setStack((current) => {
        if (current[current.length - 1] === id) return current;
        return [...current, id];
      });
    },
    [viewsById],
  );

  const pop = useCallback(() => {
    setStack((current) =>
      current.length <= 1 ? current : current.slice(0, -1),
    );
  }, []);

  const reset = useCallback(
    (id: string = rootId) => {
      setStack([id]);
    },
    [rootId],
  );

  const currentId = stack[stack.length - 1] ?? rootId;
  const activeIndex = Math.max(0, stack.length - 1);
  const canPop = stack.length > 1;
  const depth = stack.length - 1;
  const activeIsHug = depth === 0;

  const contextValue = useMemo<DrawerStackContextValue>(
    () => ({
      push,
      pop,
      reset,
      canPop,
      depth,
      currentId,
      stack,
    }),
    [push, pop, reset, canPop, depth, currentId, stack],
  );

  const registry = useMemo<RegistryApi>(
    () => ({ register, unregister }),
    [register, unregister],
  );

  useEffect(() => {
    onStackChange?.(stack);
  }, [stack, onStackChange]);

  const measure = useCallback(() => {
    const active = panesRef.current.get(currentId);
    if (!active?.node) return;

    const maxHeight = getStackMaxHeight();
    // Root always hugs content; every pushed pane uses the expanded sheet height.
    const nextHeight =
      depth === 0
        ? Math.min(measureHugHeight(active.node), maxHeight)
        : maxHeight;

    setViewportHeight((previous) =>
      previous === nextHeight ? previous : nextHeight,
    );
  }, [currentId, depth]);

  useLayoutEffect(() => {
    measure();
    if (!heightReady) {
      const frame = requestAnimationFrame(() => setHeightReady(true));
      return () => cancelAnimationFrame(frame);
    }
  }, [measure, stack, paneVersion, heightReady]);

  useEffect(() => {
    const active = panesRef.current.get(currentId);
    if (!active?.node) return;

    const observer = new ResizeObserver(() => measure());
    observer.observe(active.node);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [currentId, measure, paneVersion]);

  return (
    <DrawerStackContext.Provider value={contextValue}>
      <RegistryContext.Provider value={registry}>
        <div
          className={cn("relative w-full min-h-0 overflow-hidden", className)}
          style={{
            height: viewportHeight ?? undefined,
            transition: heightReady
              ? `height ${HEIGHT_MS}ms ${HEIGHT_EASING}`
              : undefined,
          }}
        >
          <div
            className="flex h-full will-change-transform"
            style={{
              transform: `translate3d(-${activeIndex * 100}%, 0, 0)`,
              transition: `transform ${HEIGHT_MS}ms ${HEIGHT_EASING}`,
              alignItems: activeIsHug ? "flex-start" : "stretch",
            }}
          >
            {stack.map((id, index) => {
              const view = viewsById.get(id);
              const layout = isValidElement(view)
                ? (view.props.layout ?? "hug")
                : "hug";
              const isHugPane = layout === "hug";

              return (
                <div
                  key={id}
                  className={cn(
                    "flex w-full shrink-0 flex-col",
                    isHugPane ? "h-auto self-start" : "h-full min-h-0",
                  )}
                  style={{ minWidth: "100%" }}
                  aria-hidden={index !== activeIndex}
                  inert={index !== activeIndex ? true : undefined}
                >
                  <div
                    className={cn(
                      "flex w-full flex-col",
                      isHugPane ? "h-auto" : "h-full min-h-0",
                      index !== activeIndex && "pointer-events-none",
                    )}
                  >
                    {view ?? null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </RegistryContext.Provider>
    </DrawerStackContext.Provider>
  );
}

export function DrawerStackView({
  id,
  layout = "hug",
  className,
  children,
}: {
  id: string;
  layout?: DrawerStackLayout;
  className?: string;
  children: ReactNode;
}) {
  const registry = useContext(RegistryContext);
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!registry) return;
    registry.register(id, layout, ref.current);
    return () => {
      registry.unregister(id);
    };
  }, [registry, id, layout]);

  return (
    <div
      ref={ref}
      data-drawer-stack-view={id}
      data-drawer-stack-layout={layout}
      className={cn(
        "flex w-full flex-col",
        // Hug panes must size to content so height can collapse again on Back.
        layout === "fill" ? "h-full min-h-0" : "h-auto",
        className,
      )}
    >
      {children}
    </div>
  );
}

function measureHugHeight(node: HTMLElement) {
  return Math.ceil(
    Math.max(
      node.scrollHeight,
      node.offsetHeight,
      node.getBoundingClientRect().height,
    ),
  );
}

function getStackMaxHeight() {
  const handleAllowance = 28;
  const safeMax = Math.min(window.innerHeight * 0.92, 52 * 16);
  return Math.max(160, safeMax - handleAllowance);
}
