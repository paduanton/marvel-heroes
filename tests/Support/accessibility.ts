import AxeBuilder from '@axe-core/playwright';
import { writeFile } from 'node:fs/promises';
import { expect, type Page, type TestInfo } from '@playwright/test';

export async function audit(page: Page, testInfo: TestInfo, label = 'accessibility') {
  const results = await new AxeBuilder({ page }).analyze();
  const summarize = (items: typeof results.violations) => items.map(item => ({
    rule: item.id, impact: item.impact, help: item.help, helpUrl: item.helpUrl,
    nodes: item.nodes.map(node => ({ target: node.target, failure: node.failureSummary })),
  }));
  const report = { engine: results.testEngine, violations: summarize(results.violations), incomplete: summarize(results.incomplete) };
  const path = testInfo.outputPath(`${label}.json`);
  await writeFile(path, JSON.stringify(report, null, 2));
  await testInfo.attach(`${label}.json`, { path, contentType: 'application/json' });
  expect(report.violations).toEqual([]);
}
