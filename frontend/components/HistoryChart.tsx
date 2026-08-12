"use client";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import type { SalesPoint } from "@/lib/types";

export default function HistoryChart({ data }: { data: SalesPoint[] }) {
  const chartData = data.map((item) => ({
    ...item,
    quantity: item.quantity ?? item.Quantité ?? 0,
  }));

  return (
    <ResponsiveContainer width="100%" height={320}>
      <LineChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#DCE3DF" />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 11, fill: "#8A9691" }}
          tickLine={false}
          axisLine={{ stroke: "#DCE3DF" }}
          minTickGap={24}
        />
        <YAxis tick={{ fontSize: 11, fill: "#8A9691" }} tickLine={false} axisLine={false} />
        <Tooltip
          contentStyle={{
            fontSize: 12,
            borderRadius: 8,
            border: "1px solid #DCE3DF",
          }}
          labelStyle={{ color: "#16231F", fontWeight: 600 }}
          formatter={(value: number) => new Intl.NumberFormat("fr-FR").format(value)}
        />
        <Line
          dataKey="quantity"
          stroke="#2B6E63"
          strokeWidth={2.5}
          dot={false}
          name="Ventes"
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
