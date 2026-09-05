import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/*
 * The register's one chip shape: Label type (11px, 500, uppercase, tracked),
 * 3px radius, hairline border, tinted paper fill. Variant names are API --
 * call sites depend on them -- but every color is a token:
 *   default / success / purple -> copper (accent + success/quality states;
 *     green is reserved for money direction, which no variant here means)
 *   destructive -> --cr-down
 *   blue -> --cr-neutral        warning / secondary / outline -> ink on paper
 */
const badgeVariants = cva(
  "inline-flex items-center whitespace-nowrap rounded-[3px] border px-2 py-[3px] font-sans text-[11px] font-medium uppercase tracking-[0.06em] transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-[var(--cr-copper-br)] bg-[var(--cr-copper-bg)] text-cr-copper",
        secondary: "border-cr-p4 bg-cr-p2 text-cr-i3",
        destructive: "border-[color-mix(in_srgb,var(--cr-down)_30%,transparent)] bg-[var(--cr-down-bg)] text-cr-down",
        outline: "border-cr-p4 bg-transparent text-cr-i2",
        success: "border-[var(--cr-copper-br)] bg-[var(--cr-copper-bg)] text-cr-copper",
        warning: "border-[var(--cr-rule-dark)] bg-cr-p3 text-cr-i2",
        purple: "border-[var(--cr-copper-br)] bg-[var(--cr-copper-bg)] text-cr-copper",
        blue: "border-[color-mix(in_srgb,var(--cr-neutral)_30%,transparent)] bg-[color-mix(in_srgb,var(--cr-neutral)_10%,transparent)] text-cr-neutral",
      },
    },
    defaultVariants: { variant: "default" },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
