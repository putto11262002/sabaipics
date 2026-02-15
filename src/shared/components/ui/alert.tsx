import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/shared/utils/ui"

const alertVariants = cva("grid gap-0.5 rounded-lg border px-2.5 py-2 text-left text-sm backdrop-blur-md has-data-[slot=alert-action]:relative has-data-[slot=alert-action]:pr-18 has-[>svg]:grid-cols-[auto_1fr] has-[>svg]:gap-x-2 *:[svg]:row-span-2 *:[svg]:translate-y-0.5 *:[svg]:text-current *:[svg:not([class*='size-'])]:size-4 w-full relative group/alert", {
  variants: {
    variant: {
      default: "bg-card/60 border-border/50 text-card-foreground",
      destructive: "bg-destructive/10 border-destructive/30 text-destructive *:data-[slot=alert-description]:text-destructive/90 *:[svg]:text-current dark:bg-destructive/15 dark:border-destructive/25",
      warning: "bg-warning/10 border-warning/30 text-warning *:data-[slot=alert-description]:text-warning/90 *:[svg]:text-current dark:bg-warning/15 dark:border-warning/25",
      success: "bg-success/10 border-success/30 text-success *:data-[slot=alert-description]:text-success/90 *:[svg]:text-current dark:bg-success/15 dark:border-success/25",
      info: "bg-info/10 border-info/30 text-info *:data-[slot=alert-description]:text-info/90 *:[svg]:text-current dark:bg-info/15 dark:border-info/25",
    },
  },
  defaultVariants: {
    variant: "default",
  },
})

function Alert({
  className,
  variant,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof alertVariants>) {
  return (
    <div
      data-slot="alert"
      role="alert"
      className={cn(alertVariants({ variant }), className)}
      {...props}
    />
  )
}

function AlertTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-title"
      className={cn(
        "font-medium group-has-[>svg]/alert:col-start-2 [&_a]:hover:text-foreground [&_a]:underline [&_a]:underline-offset-3",
        className
      )}
      {...props}
    />
  )
}

function AlertDescription({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-description"
      className={cn(
        "text-muted-foreground text-sm text-balance md:text-pretty [&_p:not(:last-child)]:mb-4 [&_a]:hover:text-foreground [&_a]:underline [&_a]:underline-offset-3",
        className
      )}
      {...props}
    />
  )
}

function AlertAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-action"
      className={cn("absolute top-2 right-2", className)}
      {...props}
    />
  )
}

export { Alert, AlertTitle, AlertDescription, AlertAction }
