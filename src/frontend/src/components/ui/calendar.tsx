import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { DayPicker, getDefaultClassNames, type DayButton } from "react-day-picker";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import "./calendar.css";

function Calendar({ className, classNames, components, ...props }: React.ComponentProps<typeof DayPicker>) {
  const defaults = getDefaultClassNames();
  return <DayPicker
    showOutsideDays
    captionLayout="label"
    className={cn("schedule-calendar", className)}
    classNames={{
      ...defaults,
      root: cn(defaults.root, "schedule-calendar-root"),
      months: cn(defaults.months, "schedule-calendar-months"),
      month: cn(defaults.month, "schedule-calendar-month"),
      nav: cn(defaults.nav, "schedule-calendar-nav"),
      month_caption: cn(defaults.month_caption, "schedule-calendar-month-caption"),
      caption_label: cn(defaults.caption_label, "schedule-calendar-caption-label"),
      month_grid: cn(defaults.month_grid, "schedule-calendar-grid"),
      weekday: cn(defaults.weekday, "schedule-calendar-weekday"),
      day: cn(defaults.day, "schedule-calendar-day"),
      today: cn(defaults.today, "schedule-calendar-today"),
      outside: cn(defaults.outside, "schedule-calendar-outside"),
      disabled: cn(defaults.disabled, "schedule-calendar-disabled"),
      hidden: cn(defaults.hidden, "schedule-calendar-hidden"),
      ...classNames,
    }}
    components={{
      Root: ({ rootRef, ...rootProps }) => <div data-slot="calendar" ref={rootRef} {...rootProps} />,
      Chevron: ({ orientation, className: iconClass }) => orientation === "left"
        ? <ChevronLeft aria-hidden="true" className={iconClass} />
        : <ChevronRight aria-hidden="true" className={iconClass} />,
      PreviousMonthButton: (buttonProps) => <Button variant="ghost" size="icon-sm" {...buttonProps} type="button" />,
      NextMonthButton: (buttonProps) => <Button variant="ghost" size="icon-sm" {...buttonProps} type="button" />,
      DayButton: CalendarDayButton,
      ...components,
    }}
    {...props}
  />;
}

function CalendarDayButton({ day, modifiers, className, ...props }: React.ComponentProps<typeof DayButton>) {
  const ref = React.useRef<HTMLButtonElement>(null);
  React.useEffect(() => {
    if (modifiers.focused) ref.current?.focus();
  }, [modifiers.focused]);
  return <Button
    ref={ref}
    variant="ghost"
    size="icon"
    className={cn("schedule-calendar-day-button", className)}
    data-day={`${day.date.getFullYear()}-${String(day.date.getMonth() + 1).padStart(2, "0")}-${String(day.date.getDate()).padStart(2, "0")}`}
    data-selected-single={!!modifiers.selected}
    {...props}
    type="button"
  />;
}

export { Calendar, CalendarDayButton };
