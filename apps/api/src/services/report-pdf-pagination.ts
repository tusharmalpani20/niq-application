/** Runs inside Chromium after fonts/images load. Paginate the actual HTML cards,
 * cloning the existing section header/footer rather than inventing print furniture. */
export function paginateReportSheets() {
  const report = document.querySelector<HTMLElement>(".clinical-report");
  if (!report) throw new Error("Report markup missing");
  const sources = Array.from(report.children) as HTMLElement[];
  const pages: HTMLElement[] = [];
  const containers = ".cr-care-stack, .cr-care-grid, .cr-possible-list";
  const pending = sources.map(source => ({ source, children: Array.from(source.querySelector(":scope > .cr-sheet-content")?.children ?? []) as HTMLElement[] }));
  report.replaceChildren();
  for (const {source, children} of pending) {
    if (source.classList.contains("cr-cover")) { report.append(source); pages.push(source); continue; }
    let continuation = 0;
    const makePage = () => {
      const page = source.cloneNode(false) as HTMLElement;
      page.classList.remove("cr-print-overflow");
      const header = source.querySelector(":scope > .cr-sheet-header")!.cloneNode(true) as HTMLElement;
      if (continuation++) {
        const title = header.querySelector("h2")!;
        title.textContent += " (continued)";
      }
      const content = document.createElement("div");
      content.className = "cr-sheet-content";
      const footer = source.querySelector(":scope > .cr-sheet-footer")!.cloneNode(true);
      page.append(header, content, footer);
      report.append(page); pages.push(page);
      return {page, content};
    };
    let current = makePage();
    const fits = () => current.content.scrollHeight <= current.content.clientHeight + 1;
    const wrapperFor = (container: HTMLElement, child: HTMLElement) => {
      const wrapper = container.cloneNode(false) as HTMLElement;
      wrapper.append(child);
      return wrapper;
    };
    const place = (node: HTMLElement, wrap: (fragment: HTMLElement) => HTMLElement = fragment => fragment) => {
      const displayed = wrap(node);
      current.content.append(displayed);
      if (fits()) return;
      displayed.remove();
      if (current.content.children.length) current = makePage();
      current.content.append(displayed);
      if (fits()) return;
      displayed.remove();
      // A multi-product plan is a collection of complete product cards. Repeat
      // the plan heading while keeping each product and its instructions whole.
      const productList = node.querySelector<HTMLElement>(":scope > .cr-recommendation-list");
      if (productList && productList.children.length > 1) {
        for (const product of Array.from(productList.children)) {
          const plan = node.cloneNode(false) as HTMLElement;
          const heading = node.querySelector(":scope > .cr-advice-heading");
          if (heading) plan.append(heading.cloneNode(true));
          const list = productList.cloneNode(false) as HTMLElement;
          list.append(product);
          plan.append(list);
          place(plan, wrap);
        }
        return;
      }
      // A long advice card can split only between complete condition groups.
      const groups = Array.from(node.querySelectorAll(":scope > .cr-advice-group")) as HTMLElement[];
      if (groups.length > 1) {
        for (const group of groups) {
          const card = node.cloneNode(false) as HTMLElement;
          const heading = node.querySelector(":scope > .cr-advice-heading");
          if (heading) card.append(heading.cloneNode(true));
          card.append(group); place(card, wrap);
        }
        return;
      }
      // For a genuinely page-tall card, keep each complete bullet intact and
      // repeat its heading on the next page. Never cut text or crop an image.
      // Only advice cards have a list that represents their entire body. A
      // product list is just benefits: splitting it would repeat the other
      // product instructions, so an indivisible oversized product must fail.
      const list = node.matches(".cr-advice-block, .cr-possible-effect") ? node.querySelector("ul") : null;
      const points = list ? Array.from(list.children) as HTMLElement[] : [];
      if (list && points.length > 1) {
        let piece = node.cloneNode(true) as HTMLElement;
        piece.querySelector("ul")!.replaceChildren();
        current.content.append(wrap(piece));
        for (const point of points) {
          piece.querySelector("ul")!.append(point.cloneNode(true));
          if (fits()) continue;
          piece.querySelector("ul")!.lastElementChild!.remove();
          if (!piece.querySelector("ul")!.children.length) throw new Error("A report element is taller than a PDF page");
          current = makePage();
          piece = node.cloneNode(true) as HTMLElement;
          piece.querySelector("ul")!.replaceChildren(point.cloneNode(true));
          current.content.append(wrap(piece));
          if (!fits()) throw new Error("A report element is taller than a PDF page");
        }
        return;
      }
      throw new Error("A report card is taller than a PDF page");
    };
    for (const child of children) {
      if (child.classList.contains("cr-content-title")) continue;
      if (child.matches(containers)) {
        for (const unit of Array.from(child.children) as HTMLElement[]) place(unit, fragment => wrapperFor(child, fragment));
      } else place(child);
    }
  }
  pages.forEach((page, index) => {
    const number = page.querySelector(".cr-sheet-footer > span:last-child");
    if (number) number.textContent = String(index + 1).padStart(2, "0");
  });
}
