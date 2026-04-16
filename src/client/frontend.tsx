import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import Chart from "chart.js/auto";
import "./style.css";
import type { BurndownPoint, ProjectItem } from "../schema.ts";

interface ApiResponse {
  items: ProjectItem[];
  burndown: {
    series: BurndownPoint[];
    totalWorkload: number;
  };
  error?: string;
}

function formatDate(d: string) {
  const date = new Date(d + "T00:00:00");
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function BurndownChart({ series }: { series: BurndownPoint[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    chartRef.current?.destroy();

    const labels = series.map((p) => formatDate(p.date));
    const lastActualIdx = series.findLastIndex((p) => !p.isFuture);

    chartRef.current = new Chart(canvasRef.current, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "Low Priority",
            data: series.map((p, i) => (i <= lastActualIdx ? p.Low : null)),
            borderColor: "#58a6ff",
            backgroundColor: "rgba(88, 166, 255, 0.6)",
            fill: "origin",
            pointRadius: 0,
            tension: 0.1,
          },
          {
            label: "Medium Priority",
            data: series.map((p, i) => (i <= lastActualIdx ? p.Low + p.Medium : null)),
            borderColor: "#d29922",
            backgroundColor: "rgba(210, 153, 34, 0.6)",
            fill: "-1",
            pointRadius: 0,
            tension: 0.1,
          },
          {
            label: "High Priority",
            data: series.map((p, i) => (i <= lastActualIdx ? p.Low + p.Medium + p.High : null)),
            borderColor: "#f85149",
            backgroundColor: "rgba(248, 81, 73, 0.6)",
            fill: "-1",
            pointRadius: 0,
            tension: 0.1,
          },
          {
            label: "Ideal",
            data: series.map((p) => p.ideal),
            borderColor: "#8b949e",
            borderDash: [6, 4],
            borderWidth: 2,
            pointRadius: 0,
            fill: false,
            tension: 0,
            order: -1,
          },
        ],
      },
      options: {
        responsive: true,
        interaction: {
          mode: "index",
          intersect: false,
        },
        plugins: {
          legend: {
            labels: {
              color: "#8b949e",
              usePointStyle: true,
              pointStyle: "rectRounded",
            },
          },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                if (ctx.dataset.label === "Ideal") {
                  return `${ctx.dataset.label}: ${ctx.parsed.y?.toFixed(1) ?? "—"} points`;
                }
                // For stacked areas, show the actual priority value
                const point = series[ctx.dataIndex];
                if (!point) return "";
                const name = ctx.dataset.label;
                let value = 0;
                if (name === "High Priority") value = point.High;
                else if (name === "Medium Priority") value = point.Medium;
                else if (name === "Low Priority") value = point.Low;
                return `${name}: ${value} points`;
              },
            },
          },
        },
        scales: {
          x: {
            ticks: { color: "#8b949e" },
            grid: { color: "#21262d" },
          },
          y: {
            beginAtZero: true,
            stacked: false,
            ticks: { color: "#8b949e" },
            grid: { color: "#21262d" },
            title: {
              display: true,
              text: "Remaining workload",
              color: "#8b949e",
            },
          },
        },
      },
    });

    return () => chartRef.current?.destroy();
  }, [series]);

  return <canvas ref={canvasRef} />;
}

function statusClass(status: string) {
  const s = status.toLowerCase();
  if (s === "done") return "status-done";
  if (s.includes("progress")) return "status-in-progress";
  return "status-todo";
}

function priorityClass(priority: string) {
  const p = priority.toLowerCase();
  if (p.includes("high") || p === "p0" || p === "urgent" || p === "critical")
    return "priority-high";
  if (p.includes("medium") || p === "p1" || p === "normal") return "priority-medium";
  return "priority-low";
}

function App() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/burndown")
      .then((r) => r.json())
      .then((json) => {
        if (json.error) setError(json.error);
        else setData(json);
      })
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <div className="error">Error: {error}</div>;
  if (!data) return <div className="loading">Loading sprint data...</div>;

  const { items, burndown } = data;

  return (
    <>
      <h1>Sprint Burndown</h1>
      <div className="chart-container">
        <BurndownChart series={burndown.series} />
      </div>
      <div className="items-table">
        <h2>Sprint Items — {burndown.totalWorkload} total points</h2>
        <table>
          <thead>
            <tr>
              <th>Title</th>
              <th>Workload</th>
              <th>Priority</th>
              <th>Status</th>
              <th>Completed</th>
            </tr>
          </thead>
          <tbody>
            {items
              .sort((a, b) => {
                if (a.status === "Done" && b.status !== "Done") return 1;
                if (a.status !== "Done" && b.status === "Done") return -1;
                return b.workload - a.workload;
              })
              .map((item, i) => (
                <tr key={i}>
                  <td>{item.title}</td>
                  <td>{item.workload}</td>
                  <td className={priorityClass(item.priority)}>{item.priority}</td>
                  <td className={statusClass(item.status)}>{item.status}</td>
                  <td>
                    {item.closedAt
                      ? new Date(item.closedAt).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })
                      : "—"}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

createRoot(document.getElementById("app")!).render(<App />);
