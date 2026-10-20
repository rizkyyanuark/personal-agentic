import { useEffect, useId, useMemo, useRef, useState } from "react";
import { cn } from "cn";
import { Combobox as ComboboxPrimitive } from "@base-ui/react/combobox";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "./components/ui/select";
import { Combobox, ComboboxCollection, ComboboxContent, ComboboxEmpty, ComboboxGroup, ComboboxInput, ComboboxItem, ComboboxLabel, ComboboxList, ComboboxTrigger, ComboboxValue } from "./components/ui/combobox";
import "./components/ui/value-controls.css";

export interface ValueOption {
  value: string;
  label: string;
  disabled?: boolean;
  group?: string;
  title?: string;
}

export interface ValuePickerProps {
  options: readonly ValueOption[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  onDraftChange?: () => void;
  searchable?: boolean;
  id?: string;
  name?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
  "aria-describedby"?: string;
  placeholder?: string;
}

interface OptionGroup {
  label: string | undefined;
  items: string[];
}

function groupOptions(options: readonly ValueOption[]): OptionGroup[] {
  const groups = new Map<string | undefined, OptionGroup>();
  for (const option of options) {
    let group = groups.get(option.group);
    if (!group) {
      group = { label: option.group, items: [] };
      groups.set(option.group, group);
    }
    group.items.push(option.value);
  }
  return [...groups.values()];
}

export function ValuePicker(props: ValuePickerProps) {
  const { options, defaultValue, onValueChange, onDraftChange, searchable = false, name, required = false, disabled = false, className, placeholder = "Choose an option" } = props;
  const generatedId = useId();
  const id = props.id ?? generatedId;
  const controlled = Object.prototype.hasOwnProperty.call(props, "value");
  const [internalValue, setInternalValue] = useState<string | null>(defaultValue ?? null);
  const [open, setOpen] = useState(false);
  const selectedValue = controlled ? props.value ?? null : internalValue;
  const inputRef = useRef<HTMLInputElement>(null);
  const optionMap = useMemo(() => new Map(options.map(option => [option.value, option])), [options]);
  const groups = useMemo(() => groupOptions(options), [options]);
  const { contains } = ComboboxPrimitive.useFilter({ sensitivity: "base" });
  const selectedLabel = selectedValue === null ? placeholder : optionMap.get(selectedValue)?.label ?? selectedValue;
  const nativeRequired = required && !(optionMap.get("") && !optionMap.get("")?.disabled);

  useEffect(() => {
    const form = inputRef.current?.form;
    if (!form) return;
    const reset = (event: Event) => {
      queueMicrotask(() => {
        if (event.defaultPrevented) return;
        if (!controlled) setInternalValue(defaultValue ?? null);
        setOpen(false);
      });
    };
    form.addEventListener("reset", reset);
    return () => form.removeEventListener("reset", reset);
  }, [controlled, defaultValue]);

  function commit(value: string | null, details: { cancel: () => void }) {
    const option = value === null ? undefined : optionMap.get(value);
    if (value === null || !option || option.disabled || disabled || inputRef.current?.matches(":disabled")) {
      details.cancel();
      return;
    }
    if (value === selectedValue) return;
    if (!controlled) setInternalValue(value);
    onDraftChange?.();
    onValueChange?.(value);
  }

  const triggerProps = {
    id,
    className,
    disabled,
    "aria-label": props["aria-label"],
    "aria-describedby": props["aria-describedby"],
    "aria-required": required || undefined,
    "data-has-value": selectedValue !== null ? "" : undefined,
    "data-value": selectedValue ?? undefined,
  };
  const fieldProps = { id, name, value: selectedValue, required: nativeRequired, disabled, inputRef, open, onOpenChange: setOpen, onValueChange: commit };

  if (searchable) {
    return <Combobox<string> {...fieldProps} items={groups} itemToStringLabel={value => optionMap.get(value)?.label ?? value} filter={(value, query) => contains(optionMap.get(value)?.label ?? value, query)}>
      <ComboboxTrigger {...triggerProps} tabIndex={disabled ? -1 : 0} role="combobox" aria-haspopup="dialog">
        <span className="value-picker-value"><ComboboxValue>{selectedLabel}</ComboboxValue></span>
      </ComboboxTrigger>
      <ComboboxContent aria-labelledby={id}>
        <ComboboxInput aria-label={props["aria-label"] ? `Search ${props["aria-label"]}` : "Search options"} placeholder="Search options…" onKeyDown={event => { if (event.key === "Enter" && !event.nativeEvent.isComposing) event.preventDefault(); }} />
        <ComboboxEmpty>No options match.</ComboboxEmpty>
        <ComboboxList>
          {(group: OptionGroup) => <ComboboxGroup key={group.label ?? ""} items={group.items}>
            {group.label && <ComboboxLabel>{group.label}</ComboboxLabel>}
            <ComboboxCollection>
              {(value: string) => <ComboboxItem key={value} value={value} data-value={value} disabled={optionMap.get(value)?.disabled} title={optionMap.get(value)?.title}>{optionMap.get(value)?.label ?? value}</ComboboxItem>}
            </ComboboxCollection>
          </ComboboxGroup>}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>;
  }

  return <Select<string> {...fieldProps} items={options}>
    <SelectTrigger {...triggerProps}>
      <SelectValue className={cn(selectedValue === null && "value-picker-placeholder")}>{selectedLabel}</SelectValue>
    </SelectTrigger>
    <SelectContent>
      {groups.map(group => <SelectGroup key={group.label ?? ""}>
        {group.label && <SelectLabel>{group.label}</SelectLabel>}
        {group.items.map(value => <SelectItem key={value} value={value} data-value={value} disabled={optionMap.get(value)?.disabled} label={optionMap.get(value)?.label} title={optionMap.get(value)?.title}>{optionMap.get(value)?.label ?? value}</SelectItem>)}
      </SelectGroup>)}
    </SelectContent>
  </Select>;
}
