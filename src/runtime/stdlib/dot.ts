import {instance} from "npm:@viz-js/viz";
import type {RawTemplateRenderer} from "./template.js";

const viz = await instance();

export const dot: RawTemplateRenderer = (template, ...values) => {
  const source = String.raw.call(String, template, ...values);
  const svg: SVGSVGElement = viz.renderSVGElement(source, {
    graphAttributes: {
      bgcolor: "none",
      color: "#00000101",
      fontcolor: "#00000101",
      fontname: "var(--sans-serif)",
      fontsize: "12"
    },
    nodeAttributes: {
      color: "#00000101",
      fontcolor: "#00000101",
      fontname: "var(--sans-serif)",
      fontsize: "12"
    },
    edgeAttributes: {
      color: "#00000101"
    }
  });
  for (const e of svg.querySelectorAll("[stroke='#000001'][stroke-opacity='0.003922']")) {
    e.setAttribute("stroke", "currentColor");
    e.removeAttribute("stroke-opacity");
  }
  for (const e of svg.querySelectorAll("[fill='#000001'][fill-opacity='0.003922']")) {
    e.setAttribute("fill", "currentColor");
    e.removeAttribute("fill-opacity");
  }
  svg.remove();
  svg.style = "max-width: 100%; height: auto;";
  return svg;
};
