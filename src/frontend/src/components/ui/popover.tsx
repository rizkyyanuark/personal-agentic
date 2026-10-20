import * as React from "react";
import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import { cn } from "cn";
import "./calendar.css";

function Popover(props: PopoverPrimitive.Root.Props) {
  return <PopoverPrimitive.Root {...props} />;
}

function PopoverTrigger(props: PopoverPrimitive.Trigger.Props) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />;
}

function PopoverContent({
  className,
  align = "start",
  alignOffset = 0,
  side = "bottom",
  sideOffset = 6,
  ...props
}: PopoverPrimitive.Popup.Props & Pick<PopoverPrimitive.Positioner.Props,
  "align" | "alignOffset" | "side" | "sideOffset"
>) {
  return <PopoverPrimitive.Portal>
    <PopoverPrimitive.Positioner
      data-slot="value-popup-positioner"
      align={align}
      alignOffset={alignOffset}
      side={side}
      sideOffset={sideOffset}
      collisionPadding={8}
      className="date-popover-positioner"
    >
      <PopoverPrimitive.Popup
        data-slot="popover-content"
        className={cn("date-popover-content", className)}
        {...props}
      />
    </PopoverPrimitive.Positioner>
  </PopoverPrimitive.Portal>;
}

function PopoverTitle({ className, ...props }: PopoverPrimitive.Title.Props) {
  return <PopoverPrimitive.Title data-slot="popover-title" className={cn("date-popover-title", className)} {...props} />;
}

function PopoverDescription({ className, ...props }: PopoverPrimitive.Description.Props) {
  return <PopoverPrimitive.Description data-slot="popover-description" className={cn("date-popover-description", className)} {...props} />;
}

function PopoverClose(props: PopoverPrimitive.Close.Props) {
  return <PopoverPrimitive.Close data-slot="popover-close" {...props} />;
}

function PopoverHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="popover-header" className={cn("date-popover-header", className)} {...props} />;
}

export { Popover, PopoverTrigger, PopoverContent, PopoverTitle, PopoverDescription, PopoverClose, PopoverHeader };
