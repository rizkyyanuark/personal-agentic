import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Toast as ToastPrimitive } from "@base-ui/react/toast";
import { X } from "lucide-react";
import { cn } from "cn";
import { Button } from "./button";

// Adapted from shadcn base-nova Toast; ownership stays with the workspace provider.
function ToastPortal(props: ToastPrimitive.Portal.Props) {
  return <ToastPrimitive.Portal data-slot="toast-portal" {...props} />;
}

function ToastViewport({ className, ...props }: ToastPrimitive.Viewport.Props) {
  return <ToastPrimitive.Viewport
    data-slot="toast-viewport"
    className={state => cn("action-toast-viewport", typeof className === "function" ? className(state) : className)}
    {...props}
  />;
}

function Toast({ className, swipeDirection = ["right", "up"], ...props }: ToastPrimitive.Root.Props) {
  return <ToastPrimitive.Root
    data-slot="toast"
    className={state => cn("action-toast", typeof className === "function" ? className(state) : className)}
    swipeDirection={swipeDirection}
    {...props}
  />;
}

function ToastContent({ className, ...props }: ToastPrimitive.Content.Props) {
  return <ToastPrimitive.Content
    data-slot="toast-content"
    className={state => cn("action-toast-content", typeof className === "function" ? className(state) : className)}
    {...props}
  />;
}

function ToastTitle({ className, ...props }: ToastPrimitive.Title.Props) {
  return <ToastPrimitive.Title
    data-slot="toast-title"
    className={state => cn("action-toast-title", typeof className === "function" ? className(state) : className)}
    {...props}
  />;
}

function ToastText({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [scrollable, setScrollable] = useState(false);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const update = () => setScrollable(element.scrollHeight > element.clientHeight + 1);
    const observer = new ResizeObserver(update);
    observer.observe(element);
    if (element.firstElementChild) observer.observe(element.firstElementChild);
    update();
    return () => observer.disconnect();
  }, []);
  return <div ref={ref} className="action-toast-text" tabIndex={scrollable ? 0 : undefined} data-base-ui-swipe-ignore="">{children}</div>;
}

function ToastClose({ className, children, render = <Button variant="ghost" size="icon-sm" />, ...props }: ToastPrimitive.Close.Props) {
  return <ToastPrimitive.Close
    data-slot="toast-close"
    aria-label="Dismiss notification"
    aria-hidden={false}
    render={render}
    className={state => cn("action-toast-close", typeof className === "function" ? className(state) : className)}
    {...props}
  >
    {children ?? <X aria-hidden="true" />}
  </ToastPrimitive.Close>;
}

export { Toast, ToastClose, ToastContent, ToastPortal, ToastText, ToastTitle, ToastViewport };
