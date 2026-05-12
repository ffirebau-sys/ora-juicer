import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Column<T> = {
  key: keyof T | string;
  label: string;
  render?: (item: T, index: number) => ReactNode;
  align?: "left" | "right";
};

type DataTableProps<T> = {
  columns: Column<T>[];
  data: T[];
  className?: string;
};

export function DataTable<T>({ columns, data, className }: DataTableProps<T>) {
  return (
    <div className={cn("overflow-hidden rounded-lg border border-white/10", className)}>
      <table className="w-full border-collapse text-left text-sm">
        <thead className="bg-white/[0.055] text-[11px] uppercase text-slate-500">
          <tr>
            {columns.map((column) => (
              <th
                key={String(column.key)}
                className={cn("px-3 py-3 font-semibold", column.align === "right" && "text-right")}
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-white/10">
          {data.map((item, index) => (
            <tr key={index} className="bg-white/[0.025] transition hover:bg-ora-400/[0.055]">
              {columns.map((column) => (
                <td
                  key={String(column.key)}
                  className={cn("px-3 py-3 text-slate-200", column.align === "right" && "text-right")}
                >
                  {column.render ? column.render(item, index) : String(item[column.key as keyof T] ?? "")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
