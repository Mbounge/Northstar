import type { AccessibilityScan, ScreenAccessibilityReport } from './screen-accessibility';

export function criterionScanComparison(criterionId: string, before?: ScreenAccessibilityReport, after?: ScreenAccessibilityReport) {
  if (!before || !after || before.id === after.id || before.status === 'check-failed' || after.status === 'check-failed') return [];
  const tag = `wcag${criterionId.replaceAll('.', '')}`;
  return before.scans.flatMap(original => {
    const repaired = after.scans.find(scan => scan.width === original.width && scan.height === original.height);
    if (!repaired) return [];
    const matchingFindings = (scan: AccessibilityScan) => ({
      issues: scan.violations.filter(issue => issue.criteria.includes(tag)),
      uncertain: scan.incomplete.filter(issue => issue.criteria.includes(tag)),
    });
    const prior = matchingFindings(original), current = matchingFindings(repaired);
    const rules = new Set([...prior.issues, ...prior.uncertain, ...current.issues, ...current.uncertain].map(issue => issue.rule));
    return [...rules].map(rule => {
      const result = (scan: AccessibilityScan, findings: ReturnType<typeof matchingFindings>) => {
        const issue = findings.issues.find(item => item.rule === rule);
        if (issue) return `${issue.nodeCount ?? issue.nodes.length} affected · Issue found`;
        if (findings.uncertain.some(item => item.rule === rule)) return 'Needs review';
        return scan.passedRuleIds?.includes(rule) ? 'Rule passed' : 'No result recorded';
      };
      const finding = [...prior.issues, ...prior.uncertain, ...current.issues, ...current.uncertain].find(issue => issue.rule === rule);
      return { rule, label: finding?.help ?? rule, viewport: `${original.width} × ${original.height}`, before: result(original, prior), after: result(repaired, current) };
    });
  });
}

export function criterionSourceOutline(html: string) {
  // Template content stays inert, including external resources from the audited page.
  const template = document.createElement('template');
  template.innerHTML = html;
  const readText = (element: Element) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    const parts: string[] = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) parts.push(node.nodeValue ?? '');
    return parts.join(' ').replace(/\s+/g, ' ').trim().slice(0, 100);
  };
  return Array.from(template.content.querySelectorAll('h1,h2,h3,h4,h5,h6,[role="heading"],table'))
    .filter(element => !element.closest('[hidden],[aria-hidden="true"]'))
    .map(element => {
      if (element.localName !== 'table') return readText(element);
      const headings = Array.from(element.querySelectorAll('th,[role="columnheader"],[role="rowheader"]')).filter(header => header.closest('table') === element);
      const columns = headings.filter(header => header.matches('[scope="col"],[scope="colgroup"],[role="columnheader"],thead th:not([scope="row"]):not([role="rowheader"])'));
      const labels = (columns.length ? columns : headings).slice(0, 5).map(readText).filter(Boolean);
      const caption = element.querySelector(':scope > caption');
      const summary = labels.length ? `${columns.length ? 'Column headers' : 'Table headers'}: ${labels.join(' · ')}`
        : headings.length ? 'Table with unlabeled headers' : 'Table with no marked headers';
      return [caption && readText(caption), summary].filter(Boolean).join(' · ');
    }).filter(Boolean).slice(0, 6);
}
