"use client";

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import type { StockStatusRow, StockStatusLevel } from "@/lib/types";

const STATUS_COLOR: Record<StockStatusLevel, string> = {
  ok: "#2F8F5B",
  a_commander: "#C98A24",
  critique: "#B8442F",
  rupture: "#7A1F1F",
};

const STATUS_LABEL: Record<StockStatusLevel, string> = {
  ok: "OK",
  a_commander: "À commander",
  critique: "Critique",
  rupture: "Rupture",
};

export default function StockLevelsChart({ rows }: { rows: StockStatusRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="text-sm text-ink-faint py-10 text-center">
        Aucun entrepôt à afficher.
      </div>
    );
  }

  return (
    <div>
      <ResponsiveContainer width="100%" height={320}>
        <BarChart data={rows} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#DCE3DF" vertical={false} />
          <XAxis
            dataKey="warehouse"
            tick={{ fontSize: 11, fill: "#8A9691" }}
            tickLine={false}
            axisLine={{ stroke: "#DCE3DF" }}
          />
          <YAxis tick={{ fontSize: 11, fill: "#8A9691" }} tickLine={false} axisLine={false} />
          <Tooltip
            contentStyle={{
              fontSize: 12,
              borderRadius: 8,
              border: "1px solid #DCE3DF",
            }}
            labelStyle={{ color: "#16231F", fontWeight: 600 }}
            formatter={(value: number, _name, item) => [
              `${new Intl.NumberFormat("fr-FR").format(value)} Kg`,
              STATUS_LABEL[(item.payload as StockStatusRow).status],
            ]}
          />
          <Bar dataKey="stock" name="Stock" radius={[4, 4, 0, 0]}>
            {rows.map((row) => (
              <Cell key={row.warehouse} fill={STATUS_COLOR[row.status]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      <div className="flex flex-wrap gap-x-5 gap-y-2 mt-2">
        {(Object.keys(STATUS_LABEL) as StockStatusLevel[]).map((status) => (
          <div key={status} className="flex items-center gap-1.5 text-xs text-ink-faint">
            <span
              className="inline-block w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: STATUS_COLOR[status] }}
            />
            {STATUS_LABEL[status]}
          </div>
        ))}
      </div>
    </div>
  );
}
