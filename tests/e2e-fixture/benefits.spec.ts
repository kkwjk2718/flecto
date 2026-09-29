import { test, expect, beginBenefits, fillBenefits, dialog, benefitsRecords } from './fixtures';

test('T01 T09: FLECTO source handlers and full-navigation confirmation reach the original database', async ({ page, activate, system, consoleErrors, worker }) => {
  await beginBenefits(page, activate);
  await worker.evaluate(`async () => {
    const tab = (await chrome.tabs.query({active:true,currentWindow:true}))[0];
    await chrome.scripting.executeScript({target:{tabId:tab.id},func:()=>{
      const c=globalThis.__flectoController;const original=c.handle;c.diagnosticActions=[];
      c.handle=async function(a){const item={kind:a.kind,from:a.fromStep,before:c.model.stepIndex,phase:c.model.phase,composing:c.composing.size};c.diagnosticActions.push(item);try{return await original.call(c,a)}finally{item.after=c.model.stepIndex;item.phaseAfter=c.model.phase;}};
    }});
  }`);
  try { await fillBenefits(page); }
  catch(error) {
    console.log('ACTION_TRACE',await worker.evaluate(`async () => {const tab=(await chrome.tabs.query({active:true,currentWindow:true}))[0];return (await chrome.scripting.executeScript({target:{tabId:tab.id},func:()=>globalThis.__flectoController.diagnosticActions}))[0].result;}`));
    throw error;
  }
  await expect(page.locator('body > main input[name="orderNumber"]')).toHaveValue('FLECTO-2026-001');
  await expect(page.locator('body > main input[name="consent"]')).toBeChecked();
  expect((await benefitsRecords(system)).count).toBe(0);
  await dialog(page).getByRole('button', { name: '신청 내용 확인', exact: true }).click();
  await expect(page).toHaveURL(/\/apply\/review\?draft=/);
  await expect(dialog(page).getByRole('button', { name: '혜택 신청 제출', exact: true })).toBeVisible();
  await expect(dialog(page)).toContainText('FLECTO-2026-001');
  expect((await benefitsRecords(system)).count).toBe(0);
  await dialog(page).getByRole('button', { name: '혜택 신청 제출', exact: true }).click();
  await expect(page).toHaveURL(/\/receipt\//);
  await expect(dialog(page)).toContainText('접수 번호');
  const result = await benefitsRecords(system);
  expect(result.count).toBe(1); expect(result.insertionCount).toBe(1);
  expect(result.records[0]).toMatchObject({ orderNumber: 'FLECTO-2026-001', purchaseDate: '2026-09-01', category: '가전' });
  expect(consoleErrors).toEqual([]);
  await page.screenshot({ path: '/tmp/flecto-integration-shots/benefits-complete.png' });
});
