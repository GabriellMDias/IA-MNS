import path from "node:path";
import MarkdownIt from "markdown-it";
import GithubSlugger from "github-slugger";

// Source-only links open the repository recorded in .orion/project.json, so a
// project derived from Orion links to its own repository rather than Orion's.
export function sourceBaseFrom(manifestText) {
  let manifest;
  try {
    manifest = JSON.parse(manifestText);
  } catch {
    throw new Error("Invalid .orion/project.json");
  }
  const { url, defaultBranch } = manifest?.repository ?? {};
  if (
    typeof url !== "string" ||
    !/^https:\/\/[A-Za-z0-9.-]+(?:\/[A-Za-z0-9._-]+)+$/.test(url) ||
    typeof defaultBranch !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9._/-]{0,99}$/.test(defaultBranch) ||
    defaultBranch.split("/").includes("..")
  )
    throw new Error("Invalid repository in .orion/project.json");
  return `${url}/blob/${defaultBranch.split("/").map(encodeURIComponent).join("/")}/`;
}
export const documentId = (source) => `repository/${source.slice(0, -3)}`;
export const headingText = (children) =>
  children
    .filter((child) => ["text", "code_inline", "image"].includes(child.type))
    .map((child) => child.content)
    .join("");

export function documentationPaths(trackedPaths) {
  return trackedPaths
    .filter((name) =>
      /^(?:docs\/.*\.md|(?:.*\/)?(?:README|AGENTS)\.md)$/.test(name),
    )
    .map((name) => {
      if (
        name.includes("\\") ||
        name.startsWith("/") ||
        name
          .split("/")
          .some((segment) =>
            ["..", ".git", "node_modules", "dist", "coverage"].includes(
              segment,
            ),
          )
      )
        throw new Error(`Unsafe documentation input: ${name}`);
      return name;
    })
    .sort();
}

export function documentGroup(source) {
  if (source.startsWith("docs/architecture/")) return "Architecture";
  if (source.startsWith("docs/adr/")) return "Decisions";
  if (source.startsWith("docs/security/")) return "Security";
  if (source.startsWith("docs/reliability/")) return "Reliability";
  if (source.startsWith("docs/database/")) return "Database guides";
  if (source.startsWith("docs/api/")) return "API guides";
  if (source.startsWith("docs/domains/")) return "Domain guides";
  if (source.startsWith("docs/runbooks/")) return "Runbooks";
  if (source.startsWith("docs/generated/")) return "Generated references";
  if (source.endsWith("AGENTS.md")) return "Agent instructions";
  if (/^(apps|packages)\//.test(source)) return "Workspace guides";
  return "Project guides";
}

export function rewriteLink(href, source, available, sourceBase) {
  if (/^(?:https?:|mailto:)/i.test(href)) return href;
  if (/^[a-z][a-z\d+.-]*:/i.test(href) || href.startsWith("//"))
    throw new Error(`Unsafe documentation URL in ${source}: ${href}`);
  const [beforeFragment, fragment = ""] = href.split("#", 2);
  const [relative] = beforeFragment.split("?", 1);
  let decoded;
  try {
    decoded = decodeURIComponent(relative);
  } catch {
    throw new Error(`Invalid documentation URL in ${source}: ${href}`);
  }
  if (
    decoded.includes("\\") ||
    [...decoded].some((character) => character.charCodeAt(0) < 32)
  )
    throw new Error(`Unsafe documentation path in ${source}: ${href}`);
  let target = relative
    ? path.posix.normalize(path.posix.join(path.posix.dirname(source), decoded))
    : source;
  if (target === ".." || target.startsWith("../") || decoded.startsWith("/"))
    throw new Error(
      `Documentation link escapes repository in ${source}: ${href}`,
    );
  if (
    !available.has(target) &&
    available.has(path.posix.join(target, "README.md"))
  )
    target = path.posix.join(target, "README.md");
  const suffix = fragment ? `#${fragment}` : "";
  if (available.has(target)) return `/docs/${documentId(target)}${suffix}`;
  if (target.endsWith(".md"))
    throw new Error(
      `Markdown link is absent from portal: ${source} -> ${target}`,
    );
  if (target === "docs/generated/api/openapi.json")
    return "/docs/api#artifacts";
  return `${sourceBase}${target.split("/").map(encodeURIComponent).join("/")}${suffix}`;
}

export function renderDocument(source, text, available, sourceBase) {
  const markdown = new MarkdownIt({ html: false, linkify: false });
  const safeLink = markdown.validateLink.bind(markdown);
  markdown.validateLink = (url) => {
    if (
      !safeLink(url) ||
      /^(?!https?:|mailto:)[a-z][a-z\d+.-]*:/i.test(url) ||
      url.startsWith("//")
    )
      throw new Error(`Unsafe documentation URL in ${source}: ${url}`);
    return true;
  };
  const tokens = markdown.parse(text.replace(/<!--[\s\S]*?-->/g, ""), {});
  const slugger = new GithubSlugger();
  const headings = [];
  const sections = [];
  let summary = "";
  let section = { heading: "", anchor: "", text: "" };
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (
      !summary &&
      token.type === "inline" &&
      tokens[index - 1]?.type === "paragraph_open"
    ) {
      const children = token.children ?? [];
      let inLink = false;
      let prose = "";
      for (const child of children) {
        if (child.type === "link_open") inLink = true;
        else if (child.type === "link_close") inLink = false;
        else if (!inLink && ["text", "code_inline"].includes(child.type))
          prose += child.content;
      }
      const plain = children
        .map((child) =>
          ["softbreak", "hardbreak"].includes(child.type)
            ? " "
            : ["text", "code_inline", "image"].includes(child.type)
              ? child.content
              : "",
        )
        .join("")
        .replace(/\s+/g, " ")
        .trim();
      if (
        prose.replace(/[\s·|↗:]/g, "").length >= 30 &&
        !/^(?:Status|Date|Owner|Classification|Lifecycle):/i.test(plain)
      )
        summary =
          plain.length > 180
            ? `${plain.slice(0, 177).replace(/\s+\S*$/, "")}…`
            : plain;
    }
    if (token.type === "heading_open") {
      const title = headingText(tokens[index + 1]?.children ?? []);
      const id = slugger.slug(title);
      token.attrSet("id", id);
      headings.push({ id, text: title, level: Number(token.tag.slice(1)) });
      if (section.text.trim()) sections.push(section);
      section = { heading: title, anchor: id, text: "" };
    }
    if (
      token.type === "inline" ||
      token.type === "fence" ||
      token.type === "code_block"
    )
      section.text += `${token.content}\n`;
    for (const child of token.children ?? []) {
      if (child.type === "link_open") {
        const href = rewriteLink(
          child.attrGet("href") ?? "",
          source,
          available,
          sourceBase,
        );
        child.attrSet("href", href);
        if (href.startsWith("https:") || href.startsWith("http:"))
          child.attrSet("rel", "noreferrer noopener");
      }
    }
  }
  if (section.text.trim()) sections.push(section);
  if (headings.filter((heading) => heading.level === 1).length !== 1)
    throw new Error(`Expected one title in ${source}`);
  // Images are explicit links, never automatic third-party network requests.
  markdown.renderer.rules.image = (imageTokens, index) => {
    const token = imageTokens[index];
    const href = rewriteLink(
      token.attrGet("src") ?? "",
      source,
      available,
      sourceBase,
    );
    const escape = markdown.utils.escapeHtml;
    return `<a href="${escape(href)}" rel="noreferrer noopener">${escape(token.content || "View image")}</a>`;
  };
  const bodyTokens = tokens.filter(
    (token, index) =>
      !(
        (token.type === "heading_open" && token.tag === "h1") ||
        (token.type === "inline" &&
          tokens[index - 1]?.type === "heading_open" &&
          tokens[index - 1]?.tag === "h1") ||
        (token.type === "heading_close" && token.tag === "h1")
      ),
  );
  return {
    title: headings.find((heading) => heading.level === 1).text,
    summary,
    headings,
    html: markdown.renderer.render(bodyTokens, markdown.options, {}),
    sections,
  };
}
