import React, { useEffect, useRef, useState } from "react";
import axios from "axios";
import Chart from "chart.js/auto";
import * as d3 from "d3";

const API_URL = "http://localhost:3001/budget"; // API

export default function HomePage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const chartCanvasRef = useRef(null);
  const chartInstanceRef = useRef(null);
  const d3ContainerRef = useRef(null);

  const [vizWidth, setVizWidth] = useState(0);
  useEffect(() => {
    if (!d3ContainerRef.current) return;
    const el = d3ContainerRef.current;
    const ro = new ResizeObserver(([entry]) => {
      setVizWidth(entry.contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // -------- Axios fetch --------
  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);

    (async () => {
      try {
        const res = await axios.get(API_URL, { signal: ctrl.signal });
        const arr = Array.isArray(res?.data?.myBudget)
          ? res.data.myBudget
          : Array.isArray(res?.data)
          ? res.data
          : [];
        setItems(arr);
        setError(null);
      } catch (e) {
        if (e.name === "CanceledError" || e.name === "AbortError" || e.code === "ERR_CANCELED") {
          return;
        }
        setError(e);
      } finally {
        setLoading(false);
      }
    })();

    return () => ctrl.abort();
  }, []);

  // -------- Chart.js Pie --------
  useEffect(() => {
    if (!items.length || !chartCanvasRef.current) return;

    if (chartInstanceRef.current) chartInstanceRef.current.destroy();
    const ctx = chartCanvasRef.current.getContext("2d");

    chartInstanceRef.current = new Chart(ctx, {
      type: "pie",
      data: {
        labels: items.map((d) => d.title),
        datasets: [
          {
            label: "Budget",
            data: items.map((d) => +d.budget),
          },
        ],
      },
      options: {
        responsive: true,
        plugins: { legend: { position: "top" } },
      },
    });

    return () => chartInstanceRef.current?.destroy();
  }, [items]);

  // -------- D3 donut (shifted right with xOffset, responsive) --------
  useEffect(() => {
    if (!items.length || !d3ContainerRef.current) return;

    const container = d3ContainerRef.current;
    container.innerHTML = "";

    const width = vizWidth || container.clientWidth || 800;
    const height = 420;
    const radius = Math.min(width, height) / 2;

   const xOffset   = Math.min(230, Math.max(0, width * 0.30)); 

    // tunables
    const labelRadius = radius * 1.20;  
    const band        = radius * 1.00;  
    const baseGap     = 24;  
    const minPct = 0.02;
    const elbowX = radius * 0.98;
    

    const svg = d3
      .select(container)
      .append("svg")
      .attr("width", width)
      .attr("height", height)
      .style("overflow", "visible")
      .append("g")
      .attr("transform", `translate(${width / 2 + xOffset},${height / 2})`); // <-- shifted right

    svg.append("g").attr("class", "slices");
    svg.append("g").attr("class", "labels");
    svg.append("g").attr("class", "lines");

    const total = d3.sum(items, (d) => +d.budget);
    const dataItems = items.map((d) => ({ ...d, budget: +d.budget }));
    const fmt = d3.format(",");
    const pct = d3.format(".0%");

    const pie = d3.pie().sort(null).value((d) => d.budget);
    const arcs = pie(dataItems);

    const arc = d3.arc().outerRadius(radius * 0.8).innerRadius(radius * 0.5);
    const innerForStart = d3.arc().outerRadius(radius * 0.75).innerRadius(radius * 0.75);
    const ringForY = d3.arc().outerRadius(radius * 0.95).innerRadius(radius * 0.95);

    const color = d3
      .scaleOrdinal()
      .domain(dataItems.map((d) => d.title))
      .range(d3.schemeCategory10.concat(d3.schemeSet3 || []));

    const mid = (d) => d.startAngle + (d.endAngle - d.startAngle) / 2;

    // slices
    svg
      .select(".slices")
      .selectAll("path.slice")
      .data(arcs)
      .enter()
      .append("path")
      .attr("class", "slice")
      .attr("fill", (d) => color(d.data.title))
      .attr("d", arc);

    // label objects (split left/right)
    let labels = arcs
      .filter((d) => d.data.budget / total >= minPct)
      .map((d) => {
        const side = mid(d) < Math.PI ? "right" : "left";
        const x = side === "right" ? labelRadius : -labelRadius;
        const y0 = ringForY.centroid(d)[1];
        const start = innerForStart.centroid(d);
        return { d, side, x, y: y0, start, angleY: y0 };
      });

    // evenly distribute per side within [-band, band]
    function layoutSide(side) {
      const arr = labels
        .filter((l) => l.side === side)
        .sort((a, b) => a.angleY - b.angleY);
      const n = arr.length;
      if (!n) return;
      const step = Math.max(baseGap, (2 * band) / (n + 1));
      for (let i = 0; i < n; i++) {
        arr[i].y = -band + step * (i + 1);
      }
    }
    layoutSide("left");
    layoutSide("right");

    // texts
    svg
      .select(".labels")
      .selectAll("text")
      .data(labels)
      .enter()
      .append("text")
      .attr("class", "label")
      .attr("dy", ".35em")
      .attr("transform", (l) => `translate(${l.x},${l.y})`)
      .style("text-anchor", (l) => (l.side === "right" ? "start" : "end"))
      .style("font-size", "12px")
      .style("fill", "#222")
      .text((l) => `${l.d.data.title} (${fmt(l.d.data.budget)} • ${pct(l.d.data.budget / total)})`);

    // connector polylines
    svg
      .select(".lines")
      .selectAll("polyline")
      .data(labels)
      .enter()
      .append("polyline")
      .attr("class", "polyline")
      .attr("points", (l) => {
        const elbow = [l.side === "right" ? elbowX : -elbowX, l.y];
        const end = [l.x, l.y];
        return [l.start, elbow, end];
      })
      .style("fill", "none")
      .style("stroke", "#b5b5b5")
      .style("stroke-width", 1)
      .style("opacity", 0.9);
  }, [items, vizWidth]);

  return (
    <main className="container center" id="main-content">
      <div className="page-area">
        <section className="text-box">
          <h2>Stay on track</h2>
          <p>
            Do you know where you are spending your money? If you really stop to track it down,
            you would get surprised! Proper budget management depends on real data... and this app
            will help you with that!
          </p>
        </section>

        <section className="text-box">
          <h2>Alerts</h2>
          <p>What if your clothing budget ended? You will get an alert. The goal is to never go over the budget.</p>
        </section>

        <section className="text-box">
          <h2>Results</h2>
          <p>
            People who stick to a financial plan, budgeting every expense, get out of debt faster!
            Also, they live happier lives...
          </p>
        </section>

        <section className="text-box">
          <h2>Free</h2>
          <p>This app is free!!! And you are the only one holding your data!</p>
        </section>
         <section className="text-box">
          <h2>Stay on track</h2>
          <p>
            Do you know where you are spending your money? If you really stop to track it down,
            you would get surprised! Proper budget management depends on real data... and this app
            will help you with that!
          </p>
        </section>

        <section className="text-box">
          <h2>Alerts</h2>
          <p>What if your clothing budget ended? You will get an alert. The goal is to never go over the budget.</p>
        </section>

        <section className="text-box">
          <h2>Chart</h2>
          {loading && <p>Loading…</p>}
          {error && <p style={{ color: "#c00" }}>API error: {String(error.message || error)}</p>}
          <p>
            <canvas ref={chartCanvasRef} width="400" height="400" />
          </p>
        </section>

        <section className="text-box">
          <h2>D3Donut Chart with Callout Labels</h2>
          <div ref={d3ContainerRef} className="d3-donut" />
        </section>
      </div>
    </main>
  );
}
