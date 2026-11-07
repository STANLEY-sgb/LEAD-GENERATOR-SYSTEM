"use client";

import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

// Brand palette (validated for contrast on both light and dark surfaces).
const COLORS = ["#00B815", "#F28C00", "#1F6FEB", "#8957E5", "#E5484D", "#12A594", "#8190A3"];
const axis = { fontSize: 12, fill: "#8190a3" };
const tip = { contentStyle: { borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 12 } };

export function TrendChart({ data, xKey, yKey }: { data: Record<string, string | number>[]; xKey: string; yKey: string }) {
  return (
    <div role="img" aria-label="Trend chart" className="h-64 w-full">
      <ResponsiveContainer><AreaChart data={data} margin={{ left: -20, right: 8 }}>
        <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#00B815" stopOpacity={0.35} /><stop offset="100%" stopColor="#00B815" stopOpacity={0} /></linearGradient></defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#8190a355" vertical={false} /><XAxis dataKey={xKey} tick={axis} interval="preserveStartEnd" minTickGap={24} /><YAxis allowDecimals={false} tick={axis} /><Tooltip {...tip} />
        <Area type="monotone" dataKey={yKey} stroke="#00B815" strokeWidth={2} fill="url(#g)" />
      </AreaChart></ResponsiveContainer>
    </div>
  );
}

export function BarsChart({ data, xKey = "name", yKey = "value", horizontal = false }: { data: Record<string, string | number>[]; xKey?: string; yKey?: string; horizontal?: boolean }) {
  return (
    <div role="img" aria-label="Bar chart" className="h-64 w-full">
      <ResponsiveContainer><BarChart data={data} layout={horizontal ? "vertical" : "horizontal"} margin={{ left: horizontal ? 24 : -20, right: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#8190a355" horizontal={!horizontal} vertical={horizontal} />
        {horizontal ? <><XAxis type="number" allowDecimals={false} tick={axis} /><YAxis type="category" dataKey={xKey} tick={axis} width={90} /></> : <><XAxis dataKey={xKey} tick={axis} interval={0} /><YAxis allowDecimals={false} tick={axis} /></>}
        <Tooltip {...tip} /><Bar dataKey={yKey} radius={4}>{data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Bar>
      </BarChart></ResponsiveContainer>
    </div>
  );
}

export function DonutChart({ data }: { data: { name: string; value: number }[] }) {
  return (
    <div role="img" aria-label="Distribution chart" className="flex h-64 items-center gap-4">
      <ResponsiveContainer width="60%" height="100%"><PieChart><Pie data={data} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="85%" paddingAngle={2}>{data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Pie><Tooltip {...tip} /></PieChart></ResponsiveContainer>
      <ul className="space-y-1 text-xs">{data.map((d, i) => <li key={d.name} className="flex items-center gap-2"><span className="size-2.5 rounded-sm" style={{ background: COLORS[i % COLORS.length] }} />{d.name} <b>{d.value}</b></li>)}</ul>
    </div>
  );
}
