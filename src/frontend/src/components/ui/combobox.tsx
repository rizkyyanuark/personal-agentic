import { Combobox as ComboboxPrimitive } from "@base-ui/react/combobox";
import { CheckIcon, ChevronDownIcon } from "lucide-react";
import { cn } from "cn";

const Combobox = ComboboxPrimitive.Root;
const ComboboxValue = ComboboxPrimitive.Value;
const ComboboxCollection = ComboboxPrimitive.Collection;

function ComboboxTrigger({ className, children, ...props }: ComboboxPrimitive.Trigger.Props) {
  return <ComboboxPrimitive.Trigger data-slot="value-picker-trigger" className={cn("value-picker-trigger", className)} type="button" {...props}>
    {children}
    <ChevronDownIcon className="value-picker-chevron" aria-hidden="true" />
  </ComboboxPrimitive.Trigger>;
}

function ComboboxInput({ className, ...props }: ComboboxPrimitive.Input.Props) {
  return <ComboboxPrimitive.Input data-slot="combobox-input" className={cn("value-picker-search", className)} {...props} />;
}

function ComboboxContent({
  className, side = "bottom", sideOffset = 4, align = "start", alignOffset = 0, anchor, ...props
}: ComboboxPrimitive.Popup.Props & Pick<ComboboxPrimitive.Positioner.Props, "side" | "sideOffset" | "align" | "alignOffset" | "anchor">) {
  return <ComboboxPrimitive.Portal>
    <ComboboxPrimitive.Positioner side={side} sideOffset={sideOffset} align={align} alignOffset={alignOffset} anchor={anchor} className="value-picker-positioner">
      <ComboboxPrimitive.Popup data-slot="combobox-content" className={cn("value-picker-popup", "value-picker-combobox-popup", className)} {...props} />
    </ComboboxPrimitive.Positioner>
  </ComboboxPrimitive.Portal>;
}

function ComboboxList({ className, ...props }: ComboboxPrimitive.List.Props) {
  return <ComboboxPrimitive.List data-slot="combobox-list" className={cn("value-picker-list", className)} {...props} />;
}

function ComboboxItem({ className, children, ...props }: ComboboxPrimitive.Item.Props) {
  return <ComboboxPrimitive.Item data-slot="combobox-item" className={cn("value-picker-item", className)} {...props}>
    <span className="value-picker-item-label">{children}</span>
    <ComboboxPrimitive.ItemIndicator className="value-picker-item-indicator"><CheckIcon aria-hidden="true" /></ComboboxPrimitive.ItemIndicator>
  </ComboboxPrimitive.Item>;
}

function ComboboxGroup({ className, ...props }: ComboboxPrimitive.Group.Props) {
  return <ComboboxPrimitive.Group data-slot="combobox-group" className={cn("value-picker-group", className)} {...props} />;
}

function ComboboxLabel({ className, ...props }: ComboboxPrimitive.GroupLabel.Props) {
  return <ComboboxPrimitive.GroupLabel data-slot="combobox-label" className={cn("value-picker-group-label", className)} {...props} />;
}

function ComboboxEmpty({ className, ...props }: ComboboxPrimitive.Empty.Props) {
  return <ComboboxPrimitive.Empty data-slot="combobox-empty" className={cn("value-picker-empty", className)} {...props} />;
}

export { Combobox, ComboboxCollection, ComboboxContent, ComboboxEmpty, ComboboxGroup, ComboboxInput, ComboboxItem, ComboboxLabel, ComboboxList, ComboboxTrigger, ComboboxValue };
