import type { ReactNode } from "react";

export function Card({ children }: { children: ReactNode }) {
  return <div className="card">{children}</div>;
}

export function CardHead({ title, sub, children }: { title: string; sub?: string; children?: ReactNode }) {
  return (
    <div className="card-head">
      <div>
        <h3>{title}</h3>
        {sub && <div className="sub">{sub}</div>}
      </div>
      {children}
    </div>
  );
}

export function CardBody({ children }: { children: ReactNode }) {
  return <div className="card-body">{children}</div>;
}

export function CardFoot({ children }: { children: ReactNode }) {
  return <div className="card-foot">{children}</div>;
}
