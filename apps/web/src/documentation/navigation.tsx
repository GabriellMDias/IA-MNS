import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
export function DocLink({
  id = "",
  hash,
  children,
  className,
  current,
}: {
  id?: string;
  hash?: string;
  children: ReactNode;
  className?: string;
  current?: boolean;
}) {
  return (
    <Link
      to="/docs/$"
      params={{ _splat: id }}
      hash={hash}
      search={{}}
      className={className}
      aria-current={current ? "page" : undefined}
    >
      {children}
    </Link>
  );
}
