// A sparkline is a mark, not a chart: no axes, no grid, no tooltip. Inline SVG
// rather than recharts — a 68×22 polyline does not need a ResponsiveContainer,
// and this keeps the stat tiles free of client JS.
// The endpoint is emphasised because "where it ended" is the whole point.
export function Sparkline({
  values,
  className,
  width = 68,
  height = 22,
  stroke = "var(--chart-1)",
  label,
}: {
  values: number[];
  className?: string;
  width?: number;
  height?: number;
  stroke?: string;
  label: string;
}) {
  if (values.length < 2) return null;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  const pad = 3;
  const x = (i: number) => (i / (values.length - 1)) * (width - pad * 2) + pad;
  const y = (v: number) => height - pad - ((v - min) / span) * (height - pad * 2);
  const points = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const lastX = x(values.length - 1);
  const lastY = y(values[values.length - 1]!);

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      role="img"
      aria-label={label}
    >
      <polyline
        points={points}
        fill="none"
        stroke={stroke}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.9}
      />
      {/* 2px surface ring so the endpoint reads against the line beneath it. */}
      <circle cx={lastX} cy={lastY} r={3} fill={stroke} stroke="var(--card)" strokeWidth={2} />
    </svg>
  );
}
