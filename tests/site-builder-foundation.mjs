import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const cache = new Map();
// Compile existing TS/TSX in memory using the installed compiler; no new dependencies.
function load(file) {
  const full = path.resolve(file);
  if (cache.has(full)) return cache.get(full);
  const module = { exports: {} };
  cache.set(full, module.exports);
  const source = ts.transpileModule(readFileSync(full, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
    fileName: full,
  }).outputText;
  const localRequire = (specifier) =>
    specifier.startsWith(".")
      ? load(
          path.resolve(path.dirname(full), specifier) +
            (specifier.endsWith("SectionBlock") ? ".tsx" : ".ts"),
        )
      : require(specifier);
  new Function("require", "module", "exports", source)(
    localRequire,
    module,
    module.exports,
  );
  cache.set(full, module.exports);
  return module.exports;
}
const model = load("app/components/site-blocks/model.ts");
const { editorDefaults } = load("app/components/site-blocks/defaults.ts");
const Block = load("app/components/site-blocks/SectionBlock.tsx").default;
const defaults = editorDefaults([], []);
const catalog = [
  {
    id: "00000000-0000-4000-8000-000000000000",
    name: "Catalog name",
    description: "Catalog description",
    service_key: "ac",
    sort_order: 0,
    price_from: 9,
    pricing_mode: "from",
  },
];
const services = [
  {
    id: "service",
    service_catalog_item_id: catalog[0].id,
    name: "Catalog subservice",
    description: "Priced service",
    gross_price: 57.5,
    sort_order: 0,
  },
];
const render = (section) =>
  renderToStaticMarkup(
    React.createElement(Block, {
      section,
      items: defaults.items,
      catalog,
      services,
    }),
  );

test("untrusted styles never become executable or arbitrary presentation values", () => {
  assert.deepEqual(
    model.sanitizeStyle({
      columns: 50,
      content_padding: "400px",
      variant: "<script>",
      background: "url(javascript:alert(1))",
      className: "injected",
      item_gap: "wide",
      catalog_images: { [catalog[0].id]: "javascript:alert(1)" },
    }),
    { item_gap: "wide", catalog_images: {} },
  );
  assert.equal(model.safeImage("//evil.example/img"), null);
  assert.equal(model.safeImage("/\\evil.example/img"), null);
  assert.equal(model.safeImage("https://user:password@example.com/img"), null);
  for (const [key, values] of Object.entries(model.STYLE_OPTIONS))
    for (const value of values)
      assert.equal(model.sanitizeStyle({ [key]: value })[key], value);
});
test("stable ordering, moves and invalid cross-list IDs", () => {
  const rows = [
    { id: "b", sort_order: 2 },
    { id: "a", sort_order: 2 },
    { id: "c", sort_order: 3 },
  ];
  assert.deepEqual(
    model.ordered(rows).map((r) => r.id),
    ["a", "b", "c"],
  );
  const moved = model.move(rows, "c", "a");
  assert.deepEqual(
    moved.map((r) => [r.id, r.sort_order]),
    [
      ["c", 0],
      ["a", 1],
      ["b", 2],
    ],
  );
  assert.deepEqual(model.move(rows, "foreign-id", "a"), model.ordered(rows));
  assert.equal(rows[0].sort_order, 2);
});
test("all eleven section types render and hidden sections produce no markup", () => {
  assert.equal(defaults.sections.length, 11);
  for (const section of defaults.sections) {
    assert.match(render(section), /managedSection/);
    assert.equal(render({ ...section, is_visible: false }), "");
  }
});
test("services and prices use Catalog rather than editorial service identity", () => {
  const section = defaults.sections.find((s) => s.slug === "services");
  const html = renderToStaticMarkup(
    React.createElement(Block, {
      section,
      catalog,
      services,
      items: [
        {
          id: "legacy",
          section_id: section.id,
          title: "Conflicting editorial service",
          description: "Price 999",
          sort_order: 0,
          is_visible: true,
        },
      ],
    }),
  );
  assert.match(html, /Catalog name/);
  assert.doesNotMatch(html, /Conflicting editorial service|Price 999/);
  assert.match(
    render(defaults.sections.find((s) => s.slug === "pricing")),
    /Catalog subservice/,
  );
});
test("defaults preserve saved visibility, text, order and removed items", () => {
  const saved = {
    ...defaults.sections[0],
    id: "saved",
    title: "Edited",
    sort_order: 20,
    is_visible: false,
  };
  const merged = editorDefaults([saved], []);
  assert.deepEqual(
    merged.sections.find((s) => s.id === "saved"),
    saved,
  );
  assert.equal(
    merged.items.some((i) => i.section_id === "saved"),
    false,
  );
});
test("text is escaped; CTA URLs remain fixed despite unsupported configuration", () => {
  const hero = defaults.sections.find((s) => s.slug === "hero");
  const html = render({
    ...hero,
    title: "<script>alert(1)</script>",
    style_config: {
      cta_label: "<img onerror=alert(1)>",
      cta_url: "javascript:alert(1)",
    },
  });
  assert.doesNotMatch(html, /<script>|javascript:|<img onerror/);
  assert.match(html, /href="\/request"/);
});
