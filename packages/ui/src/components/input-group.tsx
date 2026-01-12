import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@sabaipics/ui/lib/utils"

const inputGroupButtonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        outline:
          "border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50",
        ghost: "hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50",
      },
      size: {
        default: "h-8 px-3",
        "icon-xs": "size-7",
        icon: "size-8",
      },
    },
    defaultVariants: {
      variant: "ghost",
      size: "default",
    },
  }
)

function InputGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="input-group"
      className={cn(
        "flex w-full items-stretch rounded-md border bg-transparent shadow-xs transition-[color,box-shadow] focus-within:border-ring focus-within:ring-ring/50 focus-within:ring-[3px] aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
    />
  )
}

function InputGroupAddon({
  align = "inline-start",
  className,
  ...props
}: React.ComponentProps<"div"> & {
  align?: "inline-start" | "inline-end" | "block-start" | "block-end"
}) {
  return (
    <div
      data-slot="input-group-addon"
      data-align={align}
      className={cn(
        "flex items-center gap-1.5 px-2 text-muted-foreground",
        align === "inline-end" && "ml-auto",
        align === "block-start" && "self-start",
        align === "block-end" && "self-end",
        className
      )}
      {...props}
    />
  )
}

function InputGroupInput({
  className,
  type,
  ...props
}: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input-group-control"
      className={cn(
        "flex h-9 w-full min-w-0 bg-transparent px-3 py-1 text-base outline-none placeholder:text-muted-foreground md:text-sm",
        className
      )}
      {...props}
    />
  )
}

function InputGroupTextarea({
  className,
  ...props
}: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="input-group-control"
      className={cn(
        "flex min-h-16 w-full resize-none bg-transparent px-3 py-2 text-base outline-none placeholder:text-muted-foreground md:text-sm",
        className
      )}
      {...props}
    />
  )
}

function InputGroupText({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="input-group-text"
      className={cn("px-2 text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

function InputGroupButton({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof inputGroupButtonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot : "button"
  return (
    <Comp
      data-slot="input-group-button"
      className={cn(inputGroupButtonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupTextarea,
  InputGroupText,
}
