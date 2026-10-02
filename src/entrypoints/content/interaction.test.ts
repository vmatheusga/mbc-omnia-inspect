// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import type { Box } from "./frames";
import { measure } from "./measure";
import { descendToward, resolveTarget } from "./targeting";

const box = (left: number, top: number, width: number, height: number): Box => ({ left, top, width, height, scale: 1 });

describe("measure", () => {
  it("horizontal gap between side-by-side boxes", () => {
    const lines = measure(box(0, 0, 100, 40), box(116, 10, 50, 20));
    expect(lines).toEqual([{ x1: 100, y1: 20, x2: 116, y2: 20, label: 16 }]);
  });
  it("vertical gap between stacked boxes", () => {
    const lines = measure(box(0, 0, 100, 40), box(20, 64, 50, 20));
    expect(lines.map((l) => l.label)).toEqual([24]);
  });
  it("diagonal: two gaps plus guides", () => {
    const lines = measure(box(0, 0, 100, 40), box(120, 60, 50, 20));
    expect(lines.filter((l) => !l.guide).map((l) => l.label)).toEqual([20, 20]);
    expect(lines.some((l) => l.guide)).toBe(true);
  });
  it("contained: four inner distances", () => {
    const lines = measure(box(10, 10, 80, 20), box(0, 0, 100, 40));
    expect(lines.map((l) => l.label).sort()).toEqual([10, 10, 10, 10]);
  });
  it("respects frame scale", () => {
    const a = { ...box(0, 0, 50, 20), scale: 0.5 };
    const b = { ...box(58, 0, 20, 20), scale: 0.5 };
    expect(measure(a, b)[0].label).toBe(16);
  });
});

describe("targeting", () => {
  document.body.innerHTML = `
    <div data-slot="card" id="card">
      <div data-slot="card-header" id="header">
        <h4 data-slot="card-title" id="title"><span id="text">Título</span></h4>
      </div>
      <div class="wrap" id="wrap">
        <button data-slot="button" id="btn"><svg id="icon"><path id="path"/></svg><span id="label">Adicionar</span></button>
      </div>
    </div>`;
  const $ = (id: string) => document.getElementById(id);

  it("click selects nearest component; Ctrl selects exact layer", () => {
    expect(resolveTarget($("path"))?.id).toBe("icon");
    expect(resolveTarget($("label"))?.id).toBe("btn");
    expect(resolveTarget($("text"))?.id).toBe("title");
    expect(resolveTarget($("label"), { deep: true })?.id).toBe("label");
  });

  it("double click descends one level toward the point", () => {
    expect(descendToward($("card")!, $("label"))?.id).toBe("btn");
    expect(descendToward($("card")!, $("text"))?.id).toBe("header");
    expect(descendToward($("btn")!, $("label"))?.id).toBe("label");
    expect(descendToward($("btn")!, $("btn"))).toBeNull();
  });
});
