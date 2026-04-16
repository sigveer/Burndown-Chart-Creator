import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import Chart from "chart.js/auto";
import "./style.css";

interface BurndownData {
  dates: string[];
  actual: (number | null)[];
  ideal: number[];
  totalWorkload: number;
}

interface ProjectItem {
  title: string;
  workload: number;
  status: string;
  closedAt: string | null;
}

interface ApiResponse {
  items: ProjectItem[];
  burndown: BurndownData;
  error?: string;
}

function BurndownChart({ data }: { data: BurndownData }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    chartRef.current?.destroy();

    chartRef.current = new Chart(canvasRef.current, {
      type: "line",
      data: {
        labels: data.dates.map((d) => {
          const date = new Date(d + "T00:00:00");
          return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
        }),
        datasets: [
          {
            label: "Ideal",
            data: data.ideal,
            borderColor: "#30363d",
            borderDash: [6, 4],
            borderWidth: 2,
            pointRadius: 0,
            tension: 0,
          },
          {
            label: "Actual",
            data: data.actual,
            borderColor: "#58a6ff",
            borderWidth: 2.5,
            pointRadius: 3,
            pointBackgroundColor: "#58a6ff",
            tension: 0,
            spanGaps: false,
          },
        ],
      },
      options: {
        responsive: true,
        plugins: {
          legend: {
            labels: { color: "#8b949e", usePointStyle: true, pointStyle: "line" },
          },
          tooltip: {
            callbacks: {
              label: (ctx) =>
                `${ctx.dataset.label}: ${ctx.parsed.y?.toFixed(1) ?? "—"} points`,
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
            ticks: { color: "#8b949e" },
            grid: { color: "#21262d" },
            title: { display: true, text: "Remaining workload", color: "#8b949e" },
          },
        },
      },
    });

    return () => chartRef.current?.destroy();
  }, [data]);

  return <canvas ref={canvasRef} />;
}

function statusClass(status: string) {
  const s = status.toLowerCase();
  if (s === "done") return "status-done";
  if (s.includes("progress")) return "status-in-progress";
  return "status-todo";
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
        <BurndownChart data={burndown} />
      </div>
      <div className="items-table">
        <h2>
          Sprint Items — {burndown.totalWorkload} total points
        </h2>
        <table>
          <thead>
            <tr>
              <th>Title</th>
              <th>Workload</th>
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
