"use client";

// Shared trend line for C6 (WHO-5, adherence): thin 2px lines, ≥8px markers,
// recessive grid, one axis, hover tooltip, and a visually-hidden data table so
// the numbers are never color-alone. Series colors follow the entity (role
// hues via chart tokens), never the rank.
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export type TrendPoint = { label: string; [series: string]: string | number | null };
export type TrendSeries = { key: string; name: string; color: string };

export function TrendLine({
  data,
  series,
  domain,
  unit,
  height = 200,
}: {
  data: TrendPoint[];
  series: TrendSeries[];
  domain: [number, number];
  unit?: string;
  height?: number;
}) {
  return (
    <div>
      <div style={{ height }} aria-hidden>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
            <CartesianGrid stroke="var(--border)" strokeDasharray="0" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
              axisLine={{ stroke: "var(--border)" }}
              tickLine={false}
            />
            <YAxis
              domain={domain}
              tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
              axisLine={false}
              tickLine={false}
              width={46}
            />
            <Tooltip
              cursor={{ stroke: "var(--muted-foreground)", strokeWidth: 1 }}
              contentStyle={{
                borderRadius: 10,
                border: "1px solid var(--border)",
                background: "var(--popover)",
                color: "var(--popover-foreground)",
                fontSize: 13,
                boxShadow: "var(--shadow-2)",
              }}
              formatter={(value, name) => [`${value ?? "—"}${unit ?? ""}`, String(name)]}
            />
            {series.map((s) => (
              <Line
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.name}
                stroke={s.color}
                strokeWidth={2}
                dot={{ r: 4, fill: s.color, strokeWidth: 2, stroke: "var(--card)" }}
                activeDot={{ r: 5 }}
                connectNulls
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {series.length > 1 ? (
        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
          {series.map((s) => (
            <li key={s.key} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="size-2.5 rounded-full" style={{ background: s.color }} aria-hidden />
              {s.name}
            </li>
          ))}
        </ul>
      ) : null}

      {/* The same numbers as text — never color-alone. */}
      <table className="sr-only">
        <thead>
          <tr>
            <th>Point</th>
            {series.map((s) => (
              <th key={s.key}>{s.name}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.label}>
              <td>{d.label}</td>
              {series.map((s) => (
                <td key={s.key}>
                  {d[s.key] == null ? "—" : `${d[s.key]}${unit ?? ""}`}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
