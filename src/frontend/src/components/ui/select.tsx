import { Select as SelectPrimitive } from "@base-ui/react/select";
import { CheckIcon, ChevronDownIcon, ChevronUpIcon } from "lucide-react";
import { cn } from "cn";

const Select = SelectPrimitive.Root;

function SelectGroup({ className, ...props }: SelectPrimitive.Group.Props) {
  return <SelectPrimitive.Group data-slot="select-group" className={cn("value-picker-group", className)} {...props} />;
}

function SelectValue({ className, ...props }: SelectPrimitive.Value.Props) {
  return <SelectPrimitive.Value data-slot="select-value" className={cn("value-picker-value", className)} {...props} />;
}

function SelectTrigger({ className, children, ...props }: SelectPrimitive.Trigger.Props) {
  return <SelectPrimitive.Trigger data-slot="value-picker-trigger" className={cn("value-picker-trigger", className)} type="button" {...props}>
    {children}
    <SelectPrimitive.Icon className="value-picker-chevron"><ChevronDownIcon aria-hidden="true" /></SelectPrimitive.Icon>
  </SelectPrimitive.Trigger>;
}

function SelectContent({
  className, children, side = "bottom", sideOffset = 4, align = "start", alignOffset = 0,
  alignItemWithTrigger = false, ...props
}: SelectPrimitive.Popup.Props & Pick<SelectPrimitive.Positioner.Props, "side" | "sideOffset" | "align" | "alignOffset" | "alignItemWithTrigger">) {
  return <SelectPrimitive.Portal>
    <SelectPrimitive.Positioner side={side} sideOffset={sideOffset} align={align} alignOffset={alignOffset} alignItemWithTrigger={alignItemWithTrigger} className="value-picker-positioner">
      <SelectPrimitive.Popup data-slot="select-content" className={cn("value-picker-popup", "value-picker-select-popup", className)} {...props}>
        <SelectScrollUpButton />
        <SelectPrimitive.List className="value-picker-list">{children}</SelectPrimitive.List>
        <SelectScrollDownButton />
      </SelectPrimitive.Popup>
    </SelectPrimitive.Positioner>
  </SelectPrimitive.Portal>;
}

function SelectLabel({ className, ...props }: SelectPrimitive.GroupLabel.Props) {
  return <SelectPrimitive.GroupLabel data-slot="select-label" className={cn("value-picker-group-label", className)} {...props} />;
}

function SelectItem({ className, children, ...props }: SelectPrimitive.Item.Props) {
  return <SelectPrimitive.Item data-slot="select-item" className={cn("value-picker-item", className)} {...props}>
    <SelectPrimitive.ItemText className="value-picker-item-label">{children}</SelectPrimitive.ItemText>
    <SelectPrimitive.ItemIndicator className="value-picker-item-indicator"><CheckIcon aria-hidden="true" /></SelectPrimitive.ItemIndicator>
  </SelectPrimitive.Item>;
}

function SelectScrollUpButton({ className, ...props }: SelectPrimitive.ScrollUpArrow.Props) {
  return <SelectPrimitive.ScrollUpArrow data-slot="select-scroll-up-button" className={cn("value-picker-scroll-arrow", className)} {...props}><ChevronUpIcon aria-hidden="true" /></SelectPrimitive.ScrollUpArrow>;
}

function SelectScrollDownButton({ className, ...props }: SelectPrimitive.ScrollDownArrow.Props) {
  return <SelectPrimitive.ScrollDownArrow data-slot="select-scroll-down-button" className={cn("value-picker-scroll-arrow", className)} {...props}><ChevronDownIcon aria-hidden="true" /></SelectPrimitive.ScrollDownArrow>;
}

export { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectScrollDownButton, SelectScrollUpButton, SelectTrigger, SelectValue };
