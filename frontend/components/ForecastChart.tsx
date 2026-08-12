"use client";

import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import type { ForecastPoint } from "@/lib/types";

export default function ForecastChart({ data }: { data: ForecastPoint[] }) {
  const chartData = data.map((d) => ({
    ds: d.date,
    yhat: d.prediction,
    yhat_lower: d.lower,
    yhat_upper: d.upper,
    band: d.upper - d.lower,
  }));

  return (
    <ResponsiveContainer width="100%" height={320}>
      <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#DCE3DF" />
        <XAxis
          dataKey="ds"
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
        />
        {/* Intervalle de confiance : on empile un offset invisible puis la largeur de bande */}
        <Area
          dataKey="yhat_lower"
          stackId="band"
          stroke="none"
          fill="transparent"
          isAnimationActive={false}
        />
        <Area
          dataKey="band"
          stackId="band"
          stroke="none"
          fill="#2B6E63"
          fillOpacity={0.12}
          isAnimationActive={false}
          name="Intervalle de confiance"
        />
        <Line
          dataKey="yhat"
          stroke="#2B6E63"
          strokeWidth={2.5}
          dot={false}
          name="Ventes prédites"
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
