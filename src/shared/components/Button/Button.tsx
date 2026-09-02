import type { ButtonHTMLAttributes } from "react";

type Variant = "default" | "primary" | "accent" | "ghost" | "danger";
type Size = "default" | "sm" | "xs";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export function Button({ variant = "default", size = "default", className, ...rest }: Props) {
  const classes = ["btn"];
  if (variant !== "default") classes.push(`btn-${variant}`);
  if (size !== "default") classes.push(`btn-${size}`);
  if (className) classes.push(className);
  return <button className={classes.join(" ")} {...rest} />;
}
